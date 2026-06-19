import React, { useState, useEffect, useRef } from 'react';
import { endLive } from '../services/eventService';
import { httpsCallable } from 'firebase/functions';
import { functions, db } from '../firebase/firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { YouTubeWatchButton } from '../components/LiveStream';

// ─── StreamCard ────────────────────────────────────────────────────────────
// Full-screen live stream card.
// Host: shows camera preview from NativeStreamer, supports camera flip
//       (relay restarts FFmpeg in place), Wake Lock keeps screen on,
//       and "End Stream" calls nativeStreamEndEvent for an instant,
//       race-free clear of isLive on the event.
// Viewer: shows a "Watch on YouTube" card.
// ─────────────────────────────────────────────────────────────────────────────
export default function StreamCard({ event, role, onClose, onMinimise, onEnded, hidden, nativeStream }) {
  const [confirm,  setConfirm]  = useState(false);
  const [ending,   setEnding]   = useState(false);
  const [ended,    setEnded]    = useState(false);
  const [phase,    setPhase]    = useState(nativeStream?.streamer?.active ? 'live' : 'connecting');
  const [errMsg,   setErrMsg]   = useState('');
  const [muted,    setMuted]    = useState(false);
  const [stats,    setStats]    = useState(null);
  const [orientationWarning, setOrientationWarning] = useState('');

  const videoRef    = useRef(null);
  const streamerRef = useRef(nativeStream?.streamer || null);
  const isHost = role === 'host';

  // ── Attach camera stream to <video> preview + wire callbacks ─────────────
  useEffect(() => {
    if (!isHost) return;
    const streamer = streamerRef.current;
    if (!streamer) return;

    if (streamer.stream && videoRef.current) {
      videoRef.current.srcObject = streamer.stream;
      videoRef.current.muted = true;
      videoRef.current.play().catch(() => {});
    }
    if (streamer.active) setPhase('live');

    const prevStatus = streamer.onStatus;
    const prevError  = streamer.onError;
    const prevStats  = streamer.onStats;

    streamer.onStatus = (msg) => {
      prevStatus?.(msg);
      if (typeof msg === 'string' && /streaming to youtube/i.test(msg)) setPhase('live');
      if (typeof msg === 'string' && /rotate phone back/i.test(msg)) {
        setOrientationWarning(msg);
      }
      if (typeof msg === 'string' && /orientation ok/i.test(msg)) {
        setOrientationWarning('');
      }
    };
    streamer.onError = (msg) => {
      prevError?.(msg);
      setErrMsg(msg);
      setPhase('error');
      cleanupFailedStream();
    };
    streamer.onStats = (s) => { prevStats?.(s); setStats(s); };

    return () => {
      streamer.onStatus = prevStatus;
      streamer.onError  = prevError;
      streamer.onStats  = prevStats;
    };
  }, [isHost]);

  // ── Stop everything when host ends ────────────────────────────────────────
  // (stream stop logic now inlined in handleEnd for reliability)

  const handleEnd = async () => {
    setEnding(true);

    // 1. Stop camera/recorder/websocket locally — instant, no network needed
    try { streamerRef.current?.stop(); } catch (e) { console.warn('Streamer stop failed:', e.message); }

    // 2. Server-side: force-clear isLive + mark session stopped in one atomic call.
    //    This is the PRIMARY mechanism — bypasses any client/session-status races.
    const sessionId = nativeStream?.sessionId;
    try {
      await httpsCallable(functions, 'nativeStreamEndEvent')({ eventId: event.id, sessionId });
    } catch (e) {
      console.error('nativeStreamEndEvent failed:', e.message);
      // Fallback 1: client-side endLive (rules allow owner/admin)
      try {
        await endLive(event.id);
      } catch (e2) {
        console.error('endLive fallback failed:', e2.message);
        // Fallback 2: direct updateDoc
        try {
          await updateDoc(doc(db, 'events', event.id), {
            isLive: false, liveUrl: null, liveWatchUrl: null,
            liveEndedAt: new Date().toISOString(), updatedAt: serverTimestamp(),
          });
        } catch (e3) { console.error('Direct updateDoc fallback failed:', e3.message); }
      }
    }

    setEnding(false);
    setEnded(true);
    if (onEnded) await onEnded(event.id); // refresh event list → cards show "Go Live"
  };

  // ── Camera controls ────────────────────────────────────────────────────────
  const cleanupFailedStream = async () => {
    const sessionId = nativeStream?.sessionId;
    try {
      await httpsCallable(functions, 'nativeStreamEndEvent')({ eventId: event.id, sessionId });
    } catch {
      try { await endLive(event.id); } catch {}
    }
    if (onEnded) await onEnded(event.id);
  };

  const handleSwitchCamera = async () => {
    try {
      const stream = await streamerRef.current?.switchCamera();
      if (stream && videoRef.current) videoRef.current.srcObject = stream;
    } catch (e) { console.warn('Camera switch failed:', e.message); }
  };

  const handleToggleMic = () => {
    const stream = streamerRef.current?.stream;
    if (!stream) return;
    stream.getAudioTracks().forEach(t => { t.enabled = muted; });
    setMuted(!muted);
  };

  const fmtTime = (s) => `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;

  // ── Ended screen ─────────────────────────────────────────────────────────────
  if (ended) return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.95)', zIndex:9999,
      display:'flex', alignItems:'center', justifyContent:'center',
      flexDirection:'column', gap:16, fontFamily:'var(--font,sans-serif)',
      height:'100dvh' }}>
      <div style={{ fontSize:52 }}>✅</div>
      <h3 style={{ color:'white', fontWeight:900, fontSize:20, margin:0 }}>Stream Ended</h3>
      <p style={{ color:'#aaa', fontSize:14, textAlign:'center', margin:0, padding:'0 24px' }}>
        Thank you for streaming with Community Events Australia!
      </p>
      <button onClick={onClose}
        style={{ background:'#c0392b', color:'white', border:'none',
          borderRadius:12, padding:'12px 28px', fontSize:15,
          fontWeight:900, cursor:'pointer', marginTop:8 }}>
        ← Back to Home
      </button>
    </div>
  );

  // ── Viewer view — "watch on YouTube" card (no camera access needed) ─────────
  if (!isHost) {
    return (
      <div style={{
        position:'fixed',
        ...(hidden
          ? { left:'-99999px', top:0, width:'100vw', height:'100dvh', opacity:0, pointerEvents:'none', visibility:'visible' }
          : { inset:0, height:'100dvh' }),
        zIndex:9999, display:'flex', flexDirection:'column',
        background:'#000', fontFamily:'var(--font,sans-serif)',
        paddingBottom:'env(safe-area-inset-bottom)',
      }}>
        <div style={{ background:'#c0392b', padding:'10px 14px', flexShrink:0,
          display:'flex', alignItems:'center', justifyContent:'space-between',
          paddingTop:'max(10px, env(safe-area-inset-top))' }}>
          <div style={{ color:'white', fontWeight:900, fontSize:14, display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ animation:'liveBlink 1s infinite' }}>🔴</span>
            LIVE — {event.eventTypeDisplay || event.eventType || 'Stream'}
          </div>
          <button onClick={onClose}
            style={{ background:'rgba(255,255,255,0.25)', border:'none', color:'white',
              borderRadius:8, padding:'6px 14px', fontSize:13, fontWeight:900, cursor:'pointer' }}>
            ← Home
          </button>
        </div>
        <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center',
          justifyContent:'center', color:'white', gap:18, padding:24, textAlign:'center' }}>
          <div style={{ fontSize:48 }}>📺</div>
          <div style={{ fontWeight:900, fontSize:18 }}>This event is streaming live</div>
          <div style={{ fontSize:13, color:'#aaa', maxWidth:320, lineHeight:1.5 }}>
            Watch on YouTube for the best experience — full quality, works on any device.
          </div>
          <YouTubeWatchButton event={event} />
        </div>
        <style>{`@keyframes liveBlink{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
      </div>
    );
  }

  // ── Host view — camera preview + controls ─────────────────────────────────────
  return (
    <div style={{
      position:'fixed',
      ...(hidden
        ? { left:'-99999px', top:0, width:'100vw', height:'100dvh', opacity:0, pointerEvents:'none', visibility:'visible' }
        : { inset:0, height:'100dvh' }),
      zIndex:9999, display:'flex', flexDirection:'column',
      paddingBottom:'env(safe-area-inset-bottom)',
      background:'#000', fontFamily:'var(--font,sans-serif)',
    }}>

      {/* Header bar */}
      <div style={{
        background:'#c0392b', padding:'10px 14px', flexShrink:0,
        display:'flex', alignItems:'center', justifyContent:'space-between',
        paddingTop:'max(10px, env(safe-area-inset-top))',
      }}>
        <div style={{ color:'white', fontWeight:900, fontSize:14, display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ animation:'liveBlink 1s infinite' }}>🔴</span>
          {phase === 'live' ? 'YOU ARE LIVE' : phase === 'error' ? 'ERROR' : 'CONNECTING…'}
        </div>

        <div style={{ display:'flex', gap:8 }}>
          {onMinimise && (
            <button onClick={onMinimise}
              style={{ background:'rgba(255,255,255,0.25)', border:'none',
                color:'white', borderRadius:8, padding:'6px 12px',
                fontSize:13, fontWeight:900, cursor:'pointer' }}>
              ← App
            </button>
          )}

          {!confirm ? (
            <button onClick={() => setConfirm(true)}
              style={{ background:'rgba(255,255,255,0.25)', border:'none',
                color:'white', borderRadius:8, padding:'6px 14px',
                fontSize:13, fontWeight:900, cursor:'pointer' }}>
              ⏹ End Stream
            </button>
          ) : (
            <div style={{ display:'flex', gap:6 }}>
              <button onClick={handleEnd} disabled={ending}
                style={{ background:'white', color:'#c0392b', border:'none',
                  borderRadius:8, padding:'6px 12px', fontSize:12,
                  fontWeight:900, cursor:'pointer' }}>
                {ending ? '…' : 'Yes, End'}
              </button>
              <button onClick={() => setConfirm(false)}
                style={{ background:'rgba(255,255,255,0.25)', border:'none',
                  color:'white', borderRadius:8, padding:'6px 12px',
                  fontSize:12, fontWeight:900, cursor:'pointer' }}>
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Host note — keep screen open */}
      <div style={{
        background:'#fff7ed', color:'#9a3412', fontSize:11.5, fontWeight:700,
        padding:'7px 14px', textAlign:'center', lineHeight:1.4,
        borderBottom:'1px solid #fed7aa',
      }}>
        🔒 Screen will stay awake automatically while live. Switching apps or locking your phone manually will still pause the broadcast.
      </div>

      {/* Camera preview */}
      <div style={{ flex:1, position:'relative', background:'#000', minHeight:0 }}>
        {phase === 'error' ? (
          <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column',
            alignItems:'center', justifyContent:'center', color:'white', gap:12, padding:24, textAlign:'center' }}>
            <div style={{ fontSize:40 }}>⚠️</div>
            <div style={{ fontWeight:900, fontSize:16 }}>Stream Error</div>
            <div style={{ fontSize:13, color:'#fca5a5' }}>{errMsg}</div>
          </div>
        ) : (
          <>
            <video ref={videoRef} autoPlay playsInline muted
              style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
            {phase === 'connecting' && (
              <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column',
                alignItems:'center', justifyContent:'center', color:'white', gap:12,
                background:'rgba(0,0,0,0.4)' }}>
                <div style={{ fontSize:40 }}>📡</div>
                <div style={{ fontWeight:900, fontSize:16 }}>Connecting to YouTube…</div>
                <div style={{ fontSize:12, color:'#ccc' }}>Usually takes 10-20 seconds</div>
              </div>
            )}
            {phase === 'live' && stats && (
              <div style={{ position:'absolute', top:10, left:10, background:'rgba(0,0,0,0.6)',
                color:'white', fontSize:11, fontWeight:700, padding:'4px 10px', borderRadius:8,
                display:'flex', gap:10 }}>
                <span>{stats.elapsed != null ? fmtTime(stats.elapsed) : '0:00'}</span>
                {stats.bytesSent && stats.elapsed
                  ? <span>{Math.round(stats.bytesSent*8/stats.elapsed/1000)}kbps</span> : null}
              </div>
            )}
            {orientationWarning && (
              <div style={{
                position:'absolute', left:16, right:16, top:48, zIndex:3,
                background:'#fef3c7', color:'#92400e', border:'1px solid #f59e0b',
                borderRadius:12, padding:'12px 14px', fontSize:14,
                fontWeight:900, textAlign:'center', boxShadow:'0 8px 24px rgba(0,0,0,0.35)'
              }}>
                {orientationWarning}
              </div>
            )}
          </>
        )}

        {/* Camera controls */}
        {phase !== 'error' && (
          <div style={{ position:'absolute', bottom:14, right:14, display:'flex', gap:8 }}>
            <button onClick={handleSwitchCamera}
              style={{ background:'rgba(0,0,0,0.55)', color:'white', border:'1px solid rgba(255,255,255,0.3)',
                borderRadius:10, padding:'8px 12px', fontSize:12, fontWeight:800, cursor:'pointer' }}>
              🔄 Flip
            </button>
            <button onClick={handleToggleMic}
              style={{ background: muted ? '#c0392b' : 'rgba(0,0,0,0.55)', color:'white',
                border:'1px solid rgba(255,255,255,0.3)',
                borderRadius:10, padding:'8px 12px', fontSize:12, fontWeight:800, cursor:'pointer' }}>
              {muted ? '🔇 Mic Off' : '🎙 Mic On'}
            </button>
          </div>
        )}
      </div>

      <style>{`@keyframes liveBlink{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
    </div>
  );
}
