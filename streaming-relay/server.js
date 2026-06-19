// ─── Community Events Australia — Native Stream Relay Server ─────────────────
// Runs on Google Cloud Run.
// Accepts WebSocket connections from the browser, receives binary MediaRecorder
// chunks, and pipes them to FFmpeg which publishes to YouTube RTMP.
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const http    = require('http');
const { WebSocketServer } = require('ws');
const { spawn }           = require('child_process');

// ── Firebase Admin — wrapped in try/catch so crash doesn't kill the server ───
let db = null;
try {
  const admin = require('firebase-admin');
  if (!admin.apps.length) admin.initializeApp();
  db = admin.firestore();
  console.log('[Relay] Firebase Admin initialised');
} catch (e) {
  console.error('[Relay] Firebase Admin init failed:', e.message);
  console.error('[Relay] Sessions will not be validated — continuing anyway for local testing');
}

const PORT = parseInt(process.env.PORT || '8080', 10);

// ── Uncaught error handlers — prevent silent crash ───────────────────────────
process.on('uncaughtException',  e => console.error('[Relay] uncaughtException:', e.message, e.stack));
process.on('unhandledRejection', e => console.error('[Relay] unhandledRejection:', e));

// ── HTTP Server ───────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Native Stream Relay — Community Events Australia — OK');
  } else {
    res.writeHead(404); res.end('Not found');
  }
});

// ── WebSocket Server ──────────────────────────────────────────────────────────
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  const urlObj    = new URL(req.url, `http://localhost`);
  const sessionId = urlObj.searchParams.get('session');

  console.log(`[Relay] New connection — session: ${sessionId || 'NONE'} — ip: ${req.socket.remoteAddress}`);

  if (!sessionId) { ws.close(4001, 'Missing session ID'); return; }

  let ffmpeg     = null;
  let rtmpUrl    = null;
  let active     = false;
  let bytesRecv  = 0;
  let chunkCount = 0;
  let lastFfmpegLine = '';

  // ── Send JSON to client ───────────────────────────────────────────────────
  const send = (obj) => {
    try { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj)); } catch {}
  };

  // ── Register message handler IMMEDIATELY (before async session validation) ──
  // Fixes race condition: client sends 'start' + binary chunks right after
  // ws.onopen, but session validation (Firestore read) takes ~500-900ms.
  // Without this, early messages were silently dropped because no handler
  // was listening yet — FFmpeg never started.
  let sessionReady = false;
  const earlyQueue = [];

  ws.on('message', (data, isBinary) => {
    if (!sessionReady) {
      earlyQueue.push({ data, isBinary });
      return;
    }
    handleMessage(data, isBinary);
  });

  ws.on('close', (code, reason) => {
    console.log(`[Relay] Client disconnected: ${code} ${reason}`);
    stopAll('client disconnected');
  });

  ws.on('error', (e) => {
    console.error('[Relay] WebSocket error:', e.message);
    stopAll('ws error');
  });

  function handleMessage(data, isBinary) {
    if (!isBinary) {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'start') {
          // Client can override rtmpUrl for manual stream key mode
          if (msg.rtmpUrl && msg.rtmpUrl !== 'OAUTH') rtmpUrl = msg.rtmpUrl;
          if (!active) startFFmpeg(msg.mimeType || 'video/webm');
        } else if (msg.type === 'stop') {
          stopAll('client requested stop');
        } else if (msg.type === 'switch-camera') {
          // Camera switch produces a new WebM header mid-stream which breaks
          // the current FFmpeg process. Restart FFmpeg on the SAME RTMPS
          // connection target — YouTube tolerates a brief (1-3s) reconnect
          // without ending the broadcast.
          console.log('[Relay] Camera switch — restarting FFmpeg');
          restartFFmpeg(msg.mimeType || 'video/webm');
        }
      } catch (e) { console.warn('[Relay] Bad JSON:', e.message); }
      return;
    }

    // Binary chunk — pipe to FFmpeg stdin
    if (ffmpeg && active && !ffmpeg.stdin.writableEnded) {
      const ok = ffmpeg.stdin.write(data);
      bytesRecv  += data.length;
      chunkCount++;
      if (chunkCount % 10 === 0) {
        send({ type: 'stats', chunkCount, bytesRecv });
      }
      if (!ok) {
        ffmpeg.stdin.once('drain', () => {});
      }
    } else if (!ffmpeg) {
      // FFmpeg not started yet but binary chunk arrived — log once for diagnosis
      if (chunkCount === 0) console.warn('[Relay] Binary chunk received before FFmpeg started — buffering may be needed');
      chunkCount++;
    }
  }

  // ── Restart FFmpeg in place (camera switch) — keeps WS/session alive ──────
  let restarting = false;
  function restartFFmpeg(mimeType) {
    if (restarting) return;
    restarting = true;
    const old = ffmpeg;
    active = false; // stop feeding chunks to the dying process
    if (old) {
      try { old.stdin.end(); } catch {}
      try { old.removeAllListeners('close'); } catch {} // don't trigger 'ended' for this expected restart
      setTimeout(() => { try { old.kill('SIGTERM'); } catch {} }, 500);
    }
    // Give FFmpeg/RTMP a brief moment to tear down before reconnecting
    setTimeout(() => {
      ffmpeg = null;
      startFFmpeg(mimeType);
      restarting = false;
    }, 600);
  }

  // ── Validate session ──────────────────────────────────────────────────────
  const validateSession = async () => {
    if (!db) {
      console.warn('[Relay] No Firestore — skipping session validation');
      return { rtmpUrl: process.env.TEST_RTMP_URL || null, status: 'pending' };
    }
    const snap = await db.collection('nativeStreamSessions').doc(sessionId).get();
    if (!snap.exists) throw new Error('Session not found: ' + sessionId);
    return snap.data();
  };

  validateSession().then(async (session) => {
    if (session.status !== 'pending') {
      send({ type: 'error', message: 'Session already used or expired' });
      ws.close(4003); return;
    }

    rtmpUrl = session.rtmpUrl;

    if (db) {
      await db.collection('nativeStreamSessions').doc(sessionId)
        .update({ status: 'connected', connectedAt: new Date().toISOString() })
        .catch(e => console.warn('[Relay] Firestore update failed:', e.message));
    }

    send({ type: 'session', sessionId });
    console.log(`[Relay] Session validated — RTMP: ${rtmpUrl ? rtmpUrl.replace(/\/[^/]+$/, '/REDACTED') : 'NONE'}`);

    // ── Now process any messages that arrived before validation finished ────
    sessionReady = true;
    console.log(`[Relay] Processing ${earlyQueue.length} queued message(s)`);
    for (const { data, isBinary } of earlyQueue) handleMessage(data, isBinary);
    earlyQueue.length = 0;

  }).catch(e => {
    console.error('[Relay] Session validation error:', e.message);
    send({ type: 'error', message: 'Server error: ' + e.message });
    ws.close(4004);
  });

  // ── Start FFmpeg ───────────────────────────────────────────────────────────
  function startFFmpeg(mimeType) {
    if (!rtmpUrl) {
      send({ type: 'error', message: 'No RTMP URL available — check YouTube OAuth connection' });
      return;
    }

    console.log('[Relay] Starting FFmpeg normalized 16:9 transcode -> ' + rtmpUrl.replace(/\/[^/]+$/, '/REDACTED'));

    const args = [
      '-loglevel',  'info',
      // NO -re: that flag throttles live piped streams and causes frame drops/pixelation
      '-fflags',    '+genpts+discardcorrupt',
      '-i',         'pipe:0',
    ];

    // Always normalize the browser feed into a YouTube-friendly 16:9 frame.
    // Portrait is centered with black side bars; landscape fills the frame.
    args.push(
      '-vf',        'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1',
      '-c:v',       'libx264',
      '-preset',    'veryfast',
      '-tune',      'zerolatency',
      '-b:v',       '3500k',
      '-maxrate',   '4500k',
      '-bufsize',   '6000k',
      '-g',         '60',
      '-keyint_min','30',
      '-sc_threshold', '0',
      '-pix_fmt',   'yuv420p',
      '-profile:v', 'main',
    );

    // Audio: gentle noise reduction — only highpass + light afftdn
    // anlmdn removed: it causes metallic reverb/warbling artefacts on voice
    // afftdn nf=-20 (not -25): lighter touch preserves voice clarity
    // highpass=f=80: removes low-end rumble and handling noise only
    args.push(
      '-af',        'highpass=f=60,aresample=async=1:first_pts=0',
      '-c:a',       'aac',
      '-b:a',       '192k',
      '-ar',        '48000',
      '-ac',        '2',
      '-f',         'flv',
      rtmpUrl,
    );

    try {
      ffmpeg = spawn('ffmpeg', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (e) {
      console.error('[Relay] FFmpeg spawn failed:', e.message);
      send({ type: 'error', message: 'FFmpeg not found on server. Contact admin.' });
      return;
    }

    active = true;

    ffmpeg.stdout.on('data', d => console.log('[FFmpeg stdout]', d.toString().slice(0, 100)));

    ffmpeg.stderr.on('data', (d) => {
      const line = d.toString().trim();
      if (line.length < 3) return;
      lastFfmpegLine = line.slice(0, 300);
      console.log('[FFmpeg]', line.slice(0, 150));
      if (line.includes('Output #0') || line.includes('frame=')) {
        send({ type: 'ready' });
        if (db) {
          db.collection('nativeStreamSessions').doc(sessionId)
            .update({ status: 'streaming', streamingAt: new Date().toISOString() })
            .catch(() => {});
        }
      }
      if (line.toLowerCase().includes('error') || line.toLowerCase().includes('invalid')) {
        send({ type: 'log', level: 'warn', message: line.slice(0, 200) });
      }
    });

    ffmpeg.on('close', (code, signal) => {
      console.log(`[FFmpeg] Exited — code: ${code}, signal: ${signal}, chunks: ${chunkCount}, bytes: ${bytesRecv}`);
      active = false;
      if (code !== 0 && lastFfmpegLine) {
        send({ type: 'error', message: `FFmpeg exited (${code || signal}): ${lastFfmpegLine}` });
      }
      send({ type: 'ended', code });
      if (db) {
        db.collection('nativeStreamSessions').doc(sessionId)
          .update({ status: 'ended', endedAt: new Date().toISOString(), chunkCount, bytesRecv })
          .catch(() => {});
      }
    });

    ffmpeg.on('error', (e) => {
      console.error('[FFmpeg] Process error:', e.message);
      send({ type: 'error', message: 'FFmpeg error: ' + e.message });
      active = false;
    });

    ffmpeg.stdin.on('error', (e) => {
      if (e.code !== 'EPIPE') console.error('[FFmpeg stdin]', e.message);
    });

    console.log(`[Relay] FFmpeg started — PID ${ffmpeg.pid}`);
  }

  // ── Stop everything ────────────────────────────────────────────────────────
  function stopAll(reason) {
    if (!active && !ffmpeg) return;
    console.log(`[Relay] Stopping: ${reason} — chunks: ${chunkCount}, bytes: ${bytesRecv}`);
    active = false;
    if (ffmpeg) {
      try { ffmpeg.stdin.end(); } catch {}
      setTimeout(() => { try { ffmpeg?.kill('SIGTERM'); } catch {} ffmpeg = null; }, 2000);
    }
    if (db) {
      db.collection('nativeStreamSessions').doc(sessionId)
        .update({ status: 'ended', endedAt: new Date().toISOString(), chunkCount, bytesRecv })
        .catch(() => {});
    }
  }
});

// ── Start server ──────────────────────────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Relay] Server listening on 0.0.0.0:${PORT}`);
  console.log(`[Relay] Firebase: ${db ? 'connected' : 'not available'}`);
  console.log(`[Relay] FFmpeg: checking...`);
  // Quick FFmpeg check
  const check = spawn('ffmpeg', ['-version'], { stdio: 'pipe' });
  check.stdout.on('data', d => console.log('[Relay] FFmpeg version:', d.toString().split('\n')[0]));
  check.on('error', () => console.error('[Relay] WARNING: FFmpeg not found!'));
});
