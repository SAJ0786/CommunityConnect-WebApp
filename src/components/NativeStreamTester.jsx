import React, { useState, useRef, useEffect, useCallback } from 'react';
import { NativeStreamer } from '../services/nativeStreamService';
import { httpsCallable }  from 'firebase/functions';
import { functions }      from '../firebase/firebase';

// ─── NativeStreamTester ───────────────────────────────────────────────────────
// Completely isolated test module. Renders inside Admin Dashboard → Native Stream tab.
// Uses the native relay path only.
// ─────────────────────────────────────────────────────────────────────────────

const TEAL  = '#0f766e';
const GREEN = '#16a34a';
const RED   = '#dc2626';
const AMBER = '#d97706';

// ── Small helpers ─────────────────────────────────────────────────────────────
const Badge = ({ color, children }) => (
  <span style={{ background: color + '22', color, border: `1px solid ${color}55`,
    borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 800 }}>
    {children}
  </span>
);

const Btn = ({ onClick, disabled, color = TEAL, children, full }) => (
  <button onClick={onClick} disabled={disabled} style={{
    background: disabled ? '#94a3b8' : color, color: 'white', border: 'none',
    borderRadius: 10, padding: '10px 18px', fontWeight: 800, fontSize: 13,
    cursor: disabled ? 'not-allowed' : 'pointer', width: full ? '100%' : undefined,
    transition: 'background .2s',
  }}>
    {children}
  </button>
);

const LogLine = ({ msg }) => {
  const isErr = msg.level === 'error';
  const isOk  = msg.level === 'success';
  return (
    <div style={{ fontSize: 11, padding: '3px 0', color: isErr ? RED : isOk ? GREEN : '#94a3b8',
      borderBottom: '1px solid #1a2a28', display: 'flex', gap: 8 }}>
      <span style={{ color: '#4a6a68', flexShrink: 0 }}>{msg.time}</span>
      <span>{msg.text}</span>
    </div>
  );
};

// ── Main component ─────────────────────────────────────────────────────────────
export default function NativeStreamTester() {
  const [phase, setPhase]         = useState('idle'); // idle | camera | connecting | streaming | ended | error
  const [logs,  setLogs]          = useState([]);
  const [stats, setStats]         = useState(null);
  const [wsUrl, setWsUrl]         = useState('');
  const [rtmpKey, setRtmpKey]     = useState('');
  const [watchUrl, setWatchUrl]   = useState('');
  const [fetchingWs, setFetching] = useState(false);
  const [muted, setMuted]         = useState(false);
  const [videoInfo, setVideoInfo] = useState('');
  const [errorMsg, setErrorMsg]   = useState('');
  const [useYtOAuth, setUseYtOAuth] = useState(true); // use OAuth auto-broadcast vs manual key
  const [sessionId, setSessionId] = useState(null);

  const videoRef    = useRef(null);
  const streamerRef = useRef(null);

  // ── Logging ─────────────────────────────────────────────────────────────────
  const log = useCallback((text, level = 'info') => {
    const time = new Date().toLocaleTimeString('en-AU', { hour12: false });
    setLogs(prev => [...prev.slice(-80), { time, text, level }]);
  }, []);

  const onStatus = useCallback((msg) => { log(msg); }, [log]);
  const onError  = useCallback((msg) => { log(msg, 'error'); setErrorMsg(msg); setPhase('error'); }, [log]);
  const onStats  = useCallback((s)   => { setStats(s); }, []);

  // ── Cleanup on unmount ───────────────────────────────────────────────────────
  useEffect(() => () => { streamerRef.current?.stop(); }, []);

  // ── Attach stream to video preview ───────────────────────────────────────────
  const attachPreview = useCallback((stream) => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.muted     = true; // always mute preview to avoid echo
      videoRef.current.play().catch(() => {});
    }
    const vt = stream.getVideoTracks()[0];
    const s  = vt?.getSettings() || {};
    setVideoInfo(`${s.width || '?'}×${s.height || '?'} @ ${s.frameRate || '?'}fps · ${vt?.label || 'camera'}`);
  }, []);

  // ── STEP 1: Get WebSocket URL from Cloud Function ────────────────────────────
  const handleGetWsUrl = async () => {
    setFetching(true);
    log('Requesting streaming server URL from Cloud Function…');
    try {
      const fn  = httpsCallable(functions, 'nativeStreamStart');
      const res = await fn({ useOAuth: useYtOAuth, manualRtmpKey: rtmpKey || null });
      const { wsUrl: url, watchUrl: wurl, rtmpTarget, sessionId: sid } = res.data;
      setWsUrl(url);
      if (wurl) setWatchUrl(wurl);
      if (sid) setSessionId(sid);
      log(`Got server URL: ${url}`, 'success');
      if (wurl)  log(`Watch URL: ${wurl}`, 'success');
      if (rtmpTarget) log(`RTMP target: ${rtmpTarget.slice(0, 40)}…`);
    } catch (e) {
      onError('Failed to get server URL: ' + e.message);
    }
    setFetching(false);
  };

  // ── STEP 2: Open camera ──────────────────────────────────────────────────────
  const handleOpenCamera = async () => {
    setPhase('camera');
    setErrorMsg('');
    const streamer = new NativeStreamer(onStatus, onError, onStats);
    streamerRef.current = streamer;
    try {
      const stream = await streamer.requestCamera('environment');
      attachPreview(stream);
      log('Camera opened — ready to connect', 'success');
    } catch (e) {
      onError('Camera access denied: ' + e.message);
    }
  };

  // ── STEP 3: Connect + start stream ──────────────────────────────────────────
  const handleStartStream = async () => {
    if (!wsUrl) { onError('No server URL — click Get Server URL first'); return; }
    if (!streamerRef.current?.stream) { onError('No camera — open camera first'); return; }
    setPhase('connecting');
    try {
      await streamerRef.current.connect(wsUrl);
      log('WebSocket connected to relay server', 'success');
      const rtmpUrl = useYtOAuth
        ? 'OAUTH'  // server uses stored OAuth token
        : `rtmp://a.rtmp.youtube.com/live2/${rtmpKey}`;
      streamerRef.current.startRecording(rtmpUrl);
      setPhase('streaming');
      log('MediaRecorder started — chunks flowing to server', 'success');
      log('YouTube will auto-detect the stream in ~15-20s and go live…');

      // Auto-check health after 20s — transitions broadcast to live if YouTube
      // has detected the stream as active but hasn't auto-switched yet.
      setTimeout(() => {
        if (streamerRef.current?.active) {
          log('Checking if YouTube has gone live yet…');
          handleCheckHealth();
        }
      }, 20000);
    } catch (e) {
      onError('Stream start failed: ' + e.message);
    }
  };

  // ── Check YouTube stream health & force transition to live ───────────────────
  const handleCheckHealth = async () => {
    if (!sessionId) { onError('No active session'); return; }
    log('Checking YouTube stream health…');
    try {
      const fn  = httpsCallable(functions, 'nativeStreamCheckHealth');
      const res = await fn({ sessionId });
      const { broadcastStatus, streamStatus, healthStatus, transitioned, error } = res.data;
      if (error) { log(error, 'error'); return; }
      log(`Broadcast status: ${broadcastStatus} | Stream status: ${streamStatus}`,
        streamStatus === 'active' ? 'success' : 'info');
      if (healthStatus?.status) log(`Health: ${healthStatus.status}`,
        healthStatus.status === 'good' || healthStatus.status === 'ok' ? 'success' : 'error');
      if (healthStatus?.configurationIssues?.length) {
        healthStatus.configurationIssues.forEach(issue =>
          log(`Issue: ${issue.severity} — ${issue.description}`, 'error'));
      }
      if (transitioned) log('✅ Manually transitioned broadcast to LIVE!', 'success');
      if (streamStatus !== 'active') log('YouTube has not detected an active incoming stream yet. Wait 10-20s and check again.', 'error');
    } catch (e) { onError('Health check failed: ' + e.message); }
  };

  // ── Stop ─────────────────────────────────────────────────────────────────────
  const handleStop = () => {
    streamerRef.current?.stop();
    setPhase('ended');
    log('Stream stopped by user', 'success');
  };

  // ── Switch camera ─────────────────────────────────────────────────────────────
  const handleSwitchCamera = async () => {
    try {
      const stream = await streamerRef.current?.switchCamera();
      if (stream) attachPreview(stream);
    } catch (e) { log('Camera switch failed: ' + e.message, 'error'); }
  };

  // ── Toggle mic ────────────────────────────────────────────────────────────────
  const handleToggleMic = () => {
    const stream = streamerRef.current?.stream;
    if (!stream) return;
    stream.getAudioTracks().forEach(t => { t.enabled = muted; });
    setMuted(!muted);
    log(muted ? 'Microphone unmuted' : 'Microphone muted');
  };

  // ── Format bytes ─────────────────────────────────────────────────────────────
  const fmtBytes = (b) => b > 1048576 ? (b/1048576).toFixed(1)+'MB' : b > 1024 ? (b/1024).toFixed(0)+'KB' : b+'B';
  const fmtTime  = (s) => `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;

  const isStreaming = phase === 'streaming';
  const hasCamera   = phase === 'camera' || phase === 'connecting' || isStreaming;

  return (
    <div style={{ fontFamily: 'var(--font, system-ui)', color: '#e2e8f0' }}>

      {/* ── Header ── */}
      <div style={{ background: 'linear-gradient(135deg,#0f766e,#064e3b)', borderRadius: 16,
        padding: '20px 24px', marginBottom: 16, display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900, color: 'white' }}>
            Native Stream Tester
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 4 }}>
            Isolated test module · getUserMedia → WebSocket → FFmpeg → YouTube
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {phase === 'idle'       && <Badge color={AMBER}>Idle</Badge>}
          {phase === 'camera'     && <Badge color={TEAL}>Camera Ready</Badge>}
          {phase === 'connecting' && <Badge color={AMBER}>Connecting…</Badge>}
          {phase === 'streaming'  && <Badge color={RED}>🔴 LIVE</Badge>}
          {phase === 'ended'      && <Badge color={GREEN}>Ended</Badge>}
          {phase === 'error'      && <Badge color={RED}>Error</Badge>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* ── LEFT: Controls ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Config card */}
          <div style={{ background: '#0f1a19', borderRadius: 14, padding: 16,
            border: '1px solid #1e3330' }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: TEAL,
              textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
              Stream Configuration
            </div>

            {/* OAuth vs Manual key toggle */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button onClick={() => setUseYtOAuth(true)}
                style={{ flex:1, padding:'10px', borderRadius:8, cursor:'pointer',
                  background: useYtOAuth ? TEAL : 'transparent',
                  border: useYtOAuth ? `2px solid ${TEAL}` : '2px solid #2a4a47',
                  color: useYtOAuth ? 'white' : '#6a8a87',
                  fontWeight: useYtOAuth ? 800 : 600, fontSize:12,
                  boxShadow: useYtOAuth ? `0 2px 8px ${TEAL}66` : 'none',
                  transition: 'all .15s' }}>
                {useYtOAuth ? '● ' : '○ '}Use YouTube OAuth
              </button>
              <button onClick={() => setUseYtOAuth(false)}
                style={{ flex:1, padding:'10px', borderRadius:8, cursor:'pointer',
                  background: !useYtOAuth ? TEAL : 'transparent',
                  border: !useYtOAuth ? `2px solid ${TEAL}` : '2px solid #2a4a47',
                  color: !useYtOAuth ? 'white' : '#6a8a87',
                  fontWeight: !useYtOAuth ? 800 : 600, fontSize:12,
                  boxShadow: !useYtOAuth ? `0 2px 8px ${TEAL}66` : 'none',
                  transition: 'all .15s' }}>
                {!useYtOAuth ? '● ' : '○ '}Manual Stream Key
              </button>
            </div>

            {!useYtOAuth && (
              <input value={rtmpKey} onChange={e => setRtmpKey(e.target.value)}
                placeholder="YouTube Stream Key (xxxx-xxxx-xxxx-xxxx)"
                style={{ width:'100%', background:'#1e3330', border:'1px solid #2a4a47',
                  borderRadius:8, padding:'8px 10px', color:'white', fontSize:12,
                  marginBottom:8, fontFamily:'monospace' }} />
            )}

            <Btn onClick={handleGetWsUrl} disabled={fetchingWs || (!useYtOAuth && !rtmpKey)} full color={TEAL}>
              {fetchingWs ? 'Getting server URL…' : '1. Get Server URL'}
            </Btn>

            {wsUrl && (
              <div style={{ marginTop:8, fontSize:10, color:'#4ade80', wordBreak:'break-all',
                background:'#0a2a20', borderRadius:6, padding:'6px 8px', fontFamily:'monospace' }}>
                {wsUrl}
              </div>
            )}
          </div>

          {/* Camera card */}
          <div style={{ background: '#0f1a19', borderRadius: 14, padding: 16,
            border: '1px solid #1e3330' }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: TEAL,
              textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
              Camera
            </div>

            <Btn onClick={handleOpenCamera} disabled={hasCamera} full color={TEAL}>
              2. Open Camera
            </Btn>

            {videoInfo && (
              <div style={{ marginTop:8, fontSize:11, color:'#94a3b8' }}>
                {videoInfo}
              </div>
            )}

            {hasCamera && (
              <div style={{ display:'flex', gap:8, marginTop:10 }}>
                <Btn onClick={handleSwitchCamera} color='#1e3330'>
                  Flip Camera
                </Btn>
                <Btn onClick={handleToggleMic} color={muted ? RED : '#1e3330'}>
                  {muted ? 'Mic OFF' : 'Mic ON'}
                </Btn>
              </div>
            )}
          </div>

          {/* Stream control */}
          <div style={{ background: '#0f1a19', borderRadius: 14, padding: 16,
            border: '1px solid #1e3330' }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: TEAL,
              textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
              Stream Control
            </div>

            {!isStreaming ? (
              <Btn onClick={handleStartStream}
                disabled={!wsUrl || !hasCamera || phase === 'connecting'}
                full color={GREEN}>
                {phase === 'connecting' ? 'Connecting…' : '3. Start Streaming'}
              </Btn>
            ) : (
              <>
                <Btn onClick={handleStop} full color={RED}>
                  Stop Stream
                </Btn>
                <div style={{ height: 8 }} />
                <Btn onClick={handleCheckHealth} full color={AMBER}>
                  Check YouTube Status / Force Live
                </Btn>
              </>
            )}

            {watchUrl && (
              <>
                <a href={watchUrl} target="_blank" rel="noopener noreferrer"
                  style={{ display:'block', marginTop:10, textAlign:'center',
                    background:'#dc2626', color:'white', borderRadius:10, padding:'9px',
                    fontSize:12, fontWeight:800, textDecoration:'none' }}>
                  Watch on YouTube →
                </a>
                <div style={{ fontSize:10, color:'#94a3b8', marginTop:6, textAlign:'center', lineHeight:1.4 }}>
                  The link works immediately, but YouTube takes ~15-20s after streaming starts
                  to show video. If opened early, just wait — it auto-refreshes once live.
                  No need to reopen the link.
                </div>
              </>
            )}
          </div>

          {/* Live stats */}
          {isStreaming && stats && (
            <div style={{ background: '#0a1a10', borderRadius: 14, padding: 16,
              border: `1px solid ${GREEN}44` }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: GREEN,
                textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
                Live Stats
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                {[
                  ['Duration', stats.elapsed != null ? fmtTime(stats.elapsed) : '—'],
                  ['Chunks sent', stats.chunks ?? '—'],
                  ['Data sent', stats.bytesSent != null ? fmtBytes(stats.bytesSent) : '—'],
                  ['Avg bitrate', stats.bytesSent && stats.elapsed
                    ? Math.round(stats.bytesSent*8/stats.elapsed/1000)+'kbps' : '—'],
                ].map(([label, val]) => (
                  <div key={label} style={{ background:'#0f2a1a', borderRadius:8, padding:'8px 10px' }}>
                    <div style={{ fontSize:9, color:'#4a9a6a', textTransform:'uppercase',
                      fontWeight:700, marginBottom:2 }}>{label}</div>
                    <div style={{ fontSize:16, fontWeight:900, color:'white' }}>{val}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error box */}
          {errorMsg && (
            <div style={{ background:'#2a0a0a', border:`1px solid ${RED}44`,
              borderRadius:12, padding:12 }}>
              <div style={{ fontSize:11, fontWeight:800, color:RED, marginBottom:4 }}>Error</div>
              <div style={{ fontSize:12, color:'#fca5a5' }}>{errorMsg}</div>
            </div>
          )}
        </div>

        {/* ── RIGHT: Video preview + logs ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Video preview */}
          <div style={{ background: '#000', borderRadius: 14, overflow: 'hidden',
            border: `1px solid ${isStreaming ? RED : '#1e3330'}`,
            boxShadow: isStreaming ? `0 0 0 2px ${RED}66` : 'none',
            aspectRatio: '16/9', position: 'relative', display:'flex',
            alignItems:'center', justifyContent:'center' }}>
            {!hasCamera && (
              <div style={{ color:'#4a6a68', fontSize:13, fontWeight:700, textAlign:'center' }}>
                Camera preview will appear here
              </div>
            )}
            <video ref={videoRef} autoPlay playsInline muted
              style={{ width:'100%', height:'100%', objectFit:'cover',
                display: hasCamera ? 'block' : 'none', transform:'scaleX(1)' }} />
            {isStreaming && (
              <div style={{ position:'absolute', top:10, left:10, background:RED,
                color:'white', fontSize:10, fontWeight:900, padding:'3px 8px',
                borderRadius:6, display:'flex', alignItems:'center', gap:4 }}>
                <span style={{ animation:'liveBlink 1s infinite' }}>●</span> LIVE
              </div>
            )}
            {muted && (
              <div style={{ position:'absolute', top:10, right:10, background:'rgba(0,0,0,0.7)',
                color:AMBER, fontSize:10, fontWeight:800, padding:'3px 8px', borderRadius:6 }}>
                MIC OFF
              </div>
            )}
          </div>

          {/* Log console */}
          <div style={{ background: '#080f0e', borderRadius: 14, padding: 14, flex: 1,
            border: '1px solid #1e3330', minHeight: 200, maxHeight: 360, overflowY: 'auto',
            display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: TEAL,
              textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8,
              display:'flex', justifyContent:'space-between' }}>
              <span>Console Log</span>
              <button onClick={() => setLogs([])}
                style={{ fontSize:10, background:'none', border:'none', color:'#4a6a68',
                  cursor:'pointer', fontWeight:700 }}>Clear</button>
            </div>
            <div style={{ flex:1, overflowY:'auto' }}>
              {logs.length === 0
                ? <div style={{ color:'#2a4a47', fontSize:11 }}>No logs yet…</div>
                : [...logs].reverse().map((l, i) => <LogLine key={i} msg={l} />)
              }
            </div>
          </div>

          {/* How it works */}
          <div style={{ background: '#0f1a19', borderRadius: 14, padding: 14,
            border: '1px solid #1e3330' }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: TEAL,
              textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
              Architecture
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:0, flexWrap:'wrap' }}>
              {['Camera\n(getUserMedia)', 'MediaRecorder\n(H264+Opus)', 'WebSocket\n(binary chunks)',
                'FFmpeg\n(Cloud Run)', 'YouTube RTMP\n(1080p 30fps)'].map((label, i, arr) => (
                <React.Fragment key={i}>
                  <div style={{ background:'#1e3330', borderRadius:8, padding:'6px 10px',
                    fontSize:10, color:'#94a3b8', textAlign:'center', whiteSpace:'pre-line',
                    fontWeight:600, lineHeight:1.3 }}>
                    {label}
                  </div>
                  {i < arr.length-1 && (
                    <div style={{ color:TEAL, fontSize:14, fontWeight:900, margin:'0 4px' }}>→</div>
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes liveBlink { 0%,100%{opacity:1} 50%{opacity:0.3} }
      `}</style>
    </div>
  );
}
