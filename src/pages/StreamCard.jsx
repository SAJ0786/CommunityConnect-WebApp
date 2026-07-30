import React, { useState, useEffect, useRef, useCallback } from 'react';
import { endLive } from '../services/eventService';
import { httpsCallable } from 'firebase/functions';
import { functions, db } from '../firebase/firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { YouTubeWatchButton } from '../components/LiveStream';

function EndStreamConfirmation({ ending, external, onConfirm, onCancel }) {
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="end-stream-title" style={{
      position:'fixed', inset:0, zIndex:10002, background:'rgba(0,0,0,.78)',
      display:'grid', placeItems:'center', padding:24,
    }}>
      <div style={{ width:'min(100%, 390px)', background:'white', color:'#111827',
        borderRadius:16, padding:24, textAlign:'center', boxShadow:'0 18px 60px rgba(0,0,0,.5)' }}>
        <div style={{ width:58, height:58, margin:'0 auto 14px', borderRadius:'50%',
          display:'grid', placeItems:'center', background:'#fee2e2', color:'#b91c1c',
          fontSize:'1.625rem', fontWeight:900 }}>■</div>
        <h2 id="end-stream-title" style={{ margin:'0 0 10px', fontSize:'1.25rem' }}>End this live stream?</h2>
        <p style={{ margin:'0 0 20px', color:'#4b5563', fontSize:'0.875rem', lineHeight:1.55 }}>
          {external
            ? 'This removes the live status and Watch on YouTube button from the app. Stop the broadcast separately on the external device.'
            : 'The camera, relay connection and YouTube live video will stop. Viewers will no longer see the Watch on YouTube button.'}
        </p>
        <button onClick={onConfirm} disabled={ending} style={{
          width:'100%', minHeight:50, margin:0, border:0, borderRadius:10,
          background:'#b91c1c', color:'white', fontSize:'1rem', fontWeight:900,
          boxShadow:'0 4px 14px rgba(185,28,28,.35)', cursor:'pointer',
        }}>
          {ending ? 'Ending Stream...' : 'Yes, End Stream'}
        </button>
        <button onClick={onCancel} disabled={ending} style={{
          width:'100%', minHeight:46, margin:'10px 0 0', border:'1px solid #d1d5db',
          borderRadius:10, background:'white', color:'#374151', fontWeight:800,
          boxShadow:'none', cursor:'pointer',
        }}>Keep Streaming</button>
      </div>
    </div>
  );
}

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
  const isExternal = nativeStream?.mode === 'external';
  const [phase,    setPhase]    = useState(isExternal || nativeStream?.streamer?.active ? 'live' : 'connecting');
  const [errMsg,   setErrMsg]   = useState('');
  const [muted,    setMuted]    = useState(false);
  const [stats,    setStats]    = useState(null);
  const [orientationWarning, setOrientationWarning] = useState('');
  const [controlsVisible, setControlsVisible] = useState(true);

  const videoRef    = useRef(null);
  const streamerRef = useRef(nativeStream?.streamer || null);
  const controlsHideTimerRef = useRef(null);
  const endingRef = useRef(false);
  const isHost = role === 'host';
  const isNativeBridgeHost = isHost && !!streamerRef.current?.isNativeBridge;
  const micLevel = Math.max(0, Math.min(1, Number(stats?.micLevel || 0)));
  const micPercent = Math.round(micLevel * 100);
  const micOk = !!stats?.micActive && !muted;
  const micLabel = muted
    ? 'Mic muted'
    : stats?.micTrackState && stats.micTrackState !== 'live'
      ? 'Mic unavailable'
      : micOk
        ? 'Mic active'
        : 'No mic input';

  const shouldAutoHideControls = isHost && !isExternal && phase === 'live' && !confirm && !ending && !hidden;
  const controlsAreVisible = !shouldAutoHideControls || controlsVisible;

  const clearControlsHideTimer = useCallback(() => {
    if (controlsHideTimerRef.current) {
      clearTimeout(controlsHideTimerRef.current);
      controlsHideTimerRef.current = null;
    }
  }, []);

  const scheduleControlsHide = useCallback(() => {
    clearControlsHideTimer();
    if (shouldAutoHideControls) {
      controlsHideTimerRef.current = setTimeout(() => setControlsVisible(false), 3800);
    }
  }, [clearControlsHideTimer, shouldAutoHideControls]);

  const showControlsTemporarily = useCallback(() => {
    if (!shouldAutoHideControls) return;
    setControlsVisible(true);
    scheduleControlsHide();
  }, [scheduleControlsHide, shouldAutoHideControls]);

  useEffect(() => {
    clearControlsHideTimer();
    if (shouldAutoHideControls) {
      setControlsVisible(true);
      controlsHideTimerRef.current = setTimeout(() => setControlsVisible(false), 4600);
    } else {
      setControlsVisible(true);
    }
    return clearControlsHideTimer;
  }, [clearControlsHideTimer, shouldAutoHideControls]);

  const overlayControlsStyle = {
    opacity: controlsAreVisible ? 1 : 0,
    pointerEvents: controlsAreVisible ? 'auto' : 'none',
    transition: 'opacity 220ms ease, transform 220ms ease',
  };

  const topControlsCollapseStyle = shouldAutoHideControls
    ? {
        opacity: controlsAreVisible ? 1 : 0,
        pointerEvents: controlsAreVisible ? 'auto' : 'none',
        maxHeight: controlsAreVisible ? 96 : 0,
        overflow: 'hidden',
        transition: 'opacity 220ms ease, max-height 220ms ease, padding 220ms ease',
        ...(controlsAreVisible ? {} : { paddingTop: 0, paddingBottom: 0 }),
      }
    : {};

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
    const prevNativeEndConfirmed = streamer.onNativeEndConfirmed;

    streamer.onStatus = (msg) => {
      prevStatus?.(msg);
      if (typeof msg === 'string' && /streaming to youtube/i.test(msg)) setPhase('live');
      if (typeof msg === 'string' && /reconnect|connection interrupted/i.test(msg)) setPhase('reconnecting');
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
    };
    streamer.onStats = (s) => { prevStats?.(s); setStats(s); };
    streamer.onNativeEndConfirmed = () => {
      prevNativeEndConfirmed?.();
      handleEnd();
    };

    if (window.__communityEventsNativeEndRequested && Date.now() - window.__communityEventsNativeEndRequested < 10000) {
      handleEnd();
    }

    return () => {
      streamer.onStatus = prevStatus;
      streamer.onError  = prevError;
      streamer.onStats  = prevStats;
      streamer.onNativeEndConfirmed = prevNativeEndConfirmed;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost]);

  // ── Stop everything when host ends ────────────────────────────────────────
  // (stream stop logic now inlined in handleEnd for reliability)

  const handleEnd = async () => {
    if (endingRef.current) return;
    endingRef.current = true;
    setEnding(true);
    setConfirm(false);

    // 1. Stop camera/recorder/websocket locally — instant, no network needed
    try { streamerRef.current?.stop(); } catch (e) { console.warn('Streamer stop failed:', e.message); }

    // 2. Server-side: force-clear isLive + mark session stopped in one atomic call.
    //    This is the PRIMARY mechanism — bypasses any client/session-status races.
    const sessionId = nativeStream?.sessionId;
    try {
      const functionName = isExternal ? 'endExternalYouTubeStream' : 'nativeStreamEndEvent';
      await httpsCallable(functions, functionName)({ eventId: event.id, sessionId });
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
            isLive: false, liveUrl: null, liveWatchUrl: null, liveSource: null,
            liveEndedAt: new Date().toISOString(), updatedAt: serverTimestamp(),
          });
        } catch (e3) { console.error('Direct updateDoc fallback failed:', e3.message); }
      }
    }

    window.__communityEventsNativeEndRequested = 0;
    setEnding(false);
    if (streamerRef.current?.isNativeBridge) {
      if (onEnded) await onEnded(event.id);
      onClose?.();
      return;
    }
    setEnded(true);
    if (onEnded) await onEnded(event.id); // refresh event list → cards show "Go Live"
  };

  useEffect(() => {
    if (!isHost) return undefined;
    const onNativeStreamEvent = (nativeEvent) => {
      if (nativeEvent?.detail?.type === 'endConfirmed') handleEnd();
    };
    window.addEventListener('communityevents:nativeStreamEvent', onNativeStreamEvent);
    return () => window.removeEventListener('communityevents:nativeStreamEvent', onNativeStreamEvent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, event.id, nativeStream?.sessionId]);

  // ── Camera controls ────────────────────────────────────────────────────────
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
      <div style={{ fontSize:'3.25rem' }}>✅</div>
      <h3 style={{ color:'white', fontWeight:900, fontSize:'1.25rem', margin:0 }}>Stream Ended</h3>
      <p style={{ color:'#aaa', fontSize:'0.875rem', textAlign:'center', margin:0, padding:'0 24px' }}>
        Thank you for streaming with Community Events Australia!
      </p>
      <button onClick={onClose}
        style={{ background:'#0f766e', color:'white', border:'none',
          borderRadius:12, padding:'12px 28px', fontSize:'0.9375rem',
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
        <div style={{ background:'#0f766e', padding:'10px 14px', flexShrink:0,
          display:'flex', alignItems:'center', justifyContent:'space-between',
          paddingTop:'max(10px, env(safe-area-inset-top))' }}>
          <div style={{ color:'white', fontWeight:900, fontSize:'0.875rem', display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ animation:'liveBlink 1s infinite' }}>🔴</span>
            LIVE — {event.eventTypeDisplay || event.eventType || 'Stream'}
          </div>
          <button onClick={onClose}
            style={{ background:'rgba(255,255,255,0.25)', border:'none', color:'white',
              borderRadius:8, padding:'6px 14px', fontSize:'0.8125rem', fontWeight:900, cursor:'pointer' }}>
            ← Home
          </button>
        </div>
        <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center',
          justifyContent:'center', color:'white', gap:18, padding:24, textAlign:'center' }}>
          <div style={{ fontSize:'3rem' }}>📺</div>
          <div style={{ fontWeight:900, fontSize:'1.125rem' }}>This event is streaming live</div>
          <div style={{ fontSize:'0.8125rem', color:'#aaa', maxWidth:320, lineHeight:1.5 }}>
            Watch on YouTube for the best experience — full quality, works on any device.
          </div>
          <YouTubeWatchButton event={event} />
        </div>
        <style>{`@keyframes liveBlink{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
      </div>
    );
  }

  if (isExternal) {
    return (
      <div style={{ position:'fixed', ...(hidden
        ? { left:'-99999px', top:0, width:'100vw', height:'100dvh', opacity:0, pointerEvents:'none' }
        : { inset:0, height:'100dvh' }), zIndex:9999, display:'flex', flexDirection:'column',
        background:'#090909', color:'white', fontFamily:'var(--font,sans-serif)' }}>
        <div style={{ background:'#0f766e', padding:'max(10px, env(safe-area-inset-top)) 14px 10px',
          display:'flex', alignItems:'center', justifyContent:'space-between', gap:10 }}>
          <div style={{ fontWeight:900, fontSize:'0.875rem' }}><span style={{ animation:'liveBlink 1s infinite' }}>LIVE</span> - EXTERNAL DEVICE</div>
          <div style={{ display:'flex', gap:8 }}>
            {onMinimise && <button onClick={onMinimise} style={{ background:'rgba(255,255,255,.22)', color:'white',
              border:0, borderRadius:8, padding:'7px 12px', fontWeight:800, cursor:'pointer' }}>App</button>}
            <button onClick={() => setConfirm(true)} style={{ background:'white', color:'#991b1b',
              border:'2px solid white', borderRadius:9, padding:'8px 14px', fontSize:'0.875rem',
              fontWeight:900, cursor:'pointer', boxShadow:'0 2px 10px rgba(0,0,0,.25)' }}>■ End Stream</button>
          </div>
        </div>
        {confirm && <EndStreamConfirmation ending={ending} external onConfirm={handleEnd} onCancel={() => setConfirm(false)} />}
        <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
          padding:24, textAlign:'center', gap:16 }}>
          <div style={{ width:72, height:72, borderRadius:'50%', background:'#0f766e', display:'grid',
            placeItems:'center', fontSize:'1.375rem', fontWeight:900 }}>LIVE</div>
          <h2 style={{ margin:0, fontSize:'1.3125rem' }}>{event.eventTypeDisplay || event.eventType || 'Event'} is live</h2>
          <p style={{ margin:0, color:'#bbb', maxWidth:430, fontSize:'0.875rem', lineHeight:1.55 }}>
            Viewers are using the YouTube link supplied for this event. Ending here removes the Watch on YouTube buttons from the app.
          </p>
          <YouTubeWatchButton event={{ ...event, liveWatchUrl:nativeStream.watchUrl || event.liveWatchUrl }} />
          <p style={{ margin:0, color:'#fbbf24', maxWidth:430, fontSize:'0.75rem', lineHeight:1.5 }}>
            You must also stop the broadcast on the external device or in YouTube Studio.
          </p>
        </div>
        <style>{`@keyframes liveBlink{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
      </div>
    );
  }

  if (isNativeBridgeHost) {
    return (
      <div style={{
        position:'fixed',
        ...(hidden
          ? { left:'-99999px', top:0, width:'100vw', height:'100dvh', opacity:0, pointerEvents:'none', visibility:'visible' }
          : { inset:0, height:'100dvh' }),
        zIndex:9999,
        display:'flex',
        flexDirection:'column',
        background:'linear-gradient(180deg,#062f2f,#020617)',
        color:'white',
        fontFamily:'var(--font,sans-serif)',
        paddingBottom:'env(safe-area-inset-bottom)',
      }}>
        <div style={{
          background:'#0f766e',
          padding:'max(10px, env(safe-area-inset-top)) 14px 10px',
          display:'flex',
          alignItems:'center',
          justifyContent:'space-between',
          gap:10,
          flexShrink:0,
        }}>
          <div style={{ fontWeight:900, fontSize:'0.875rem', display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ animation:'liveBlink 1s infinite' }}>●</span>
            {phase === 'live' ? 'NATIVE STREAM LIVE' : phase === 'reconnecting' ? 'RECONNECTING' : phase === 'error' ? 'STREAM NEEDS ATTENTION' : 'CONNECTING'}
          </div>
          <div style={{ display:'flex', gap:8 }}>
            {onMinimise && (
              <button onClick={onMinimise} style={{ background:'rgba(255,255,255,.22)', color:'white',
                border:0, borderRadius:8, padding:'7px 12px', fontWeight:800, cursor:'pointer' }}>
                App
              </button>
            )}
            <button onClick={handleEnd} disabled={ending} style={{ background:'white', color:'#991b1b',
              border:'2px solid white', borderRadius:9, padding:'8px 14px', fontSize:'0.875rem',
              fontWeight:900, cursor:ending ? 'wait' : 'pointer', boxShadow:'0 2px 10px rgba(0,0,0,.25)' }}>
              {ending ? 'Ending...' : 'End Stream'}
            </button>
          </div>
        </div>

        <div style={{
          flex:1,
          display:'flex',
          flexDirection:'column',
          alignItems:'center',
          justifyContent:'center',
          textAlign:'center',
          padding:24,
          gap:16,
        }}>
          <div style={{ fontSize:'2.5rem' }}>📡</div>
          <h2 style={{ margin:0, fontSize:'1.25rem' }}>
            {phase === 'error' ? 'Native stream needs attention' : 'Native Android stream is active'}
          </h2>
          <p style={{ margin:0, color:'#cbd5e1', maxWidth:390, lineHeight:1.55, fontSize:'0.875rem' }}>
            The camera preview is handled by Android. If the camera screen is not visible, use these app controls to end or recover the stream without leaving the event stuck live.
          </p>

          {phase === 'error' && (
            <>
              <div style={{ color:'#fecaca', fontWeight:800, fontSize:'0.8125rem', maxWidth:390 }}>
                {errMsg || 'The native stream stopped unexpectedly.'}
              </div>
              <button onClick={() => { setErrMsg(''); setPhase('reconnecting'); streamerRef.current?.retryReconnect?.(); }}
                style={{ background:'#f59e0b', color:'#111827', border:'none', borderRadius:10,
                  padding:'11px 20px', fontSize:'0.875rem', fontWeight:900, cursor:'pointer' }}>
                Retry Same YouTube Stream
              </button>
            </>
          )}

          <div style={{
            width:'min(100%, 390px)',
            background:'rgba(0,0,0,0.28)',
            border:'1px solid rgba(255,255,255,0.18)',
            borderRadius:14,
            padding:12,
            display:'grid',
            gap:8,
            textAlign:'left',
            fontSize:'0.8125rem',
            color:'#d1fae5',
          }}>
            <div><strong>Status:</strong> {phase === 'live' ? 'Live' : phase}</div>
            <div><strong>Event:</strong> {event.eventTypeDisplay || event.eventType || 'Event'} {event.hostName ? `- ${event.hostName}` : ''}</div>
            <div><strong>Session:</strong> {nativeStream?.sessionId || 'Preparing'}</div>
          </div>

          <button onClick={handleEnd} disabled={ending} style={{ width:'min(100%, 390px)', minHeight:50,
            background:'#b91c1c', color:'white', border:0, borderRadius:12, fontSize:'1rem',
            fontWeight:900, cursor:ending ? 'wait' : 'pointer', boxShadow:'0 5px 18px rgba(185,28,28,.35)' }}>
            {ending ? 'Ending Stream...' : 'End Stream'}
          </button>
        </div>
        <style>{`@keyframes liveBlink{0%,100%{opacity:1}50%{opacity:.35}}`}</style>
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
    }}
      onPointerDown={showControlsTemporarily}
      onMouseMove={showControlsTemporarily}
      onKeyDown={showControlsTemporarily}
      tabIndex={0}
    >

      {/* Header bar */}
      {!isNativeBridgeHost && <div style={{
        background:'#0f766e', padding:'10px 14px', flexShrink:0,
        display:'flex', alignItems:'center', justifyContent:'space-between',
        paddingTop:'max(10px, env(safe-area-inset-top))',
        ...topControlsCollapseStyle,
      }}>
        <div style={{ color:'white', fontWeight:900, fontSize:'0.875rem', display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ animation:'liveBlink 1s infinite' }}>🔴</span>
          {phase === 'live' ? 'YOU ARE LIVE' : phase === 'reconnecting' ? 'RECONNECTING…' : phase === 'error' ? 'INTERRUPTED' : 'CONNECTING…'}
        </div>

        <div style={{ display:'flex', gap:8 }}>
          {onMinimise && (
            <button onClick={onMinimise}
              style={{ background:'rgba(255,255,255,0.25)', border:'none',
                color:'white', borderRadius:8, padding:'6px 12px',
                fontSize:'0.8125rem', fontWeight:900, cursor:'pointer' }}>
              ← App
            </button>
          )}

          <button onClick={() => setConfirm(true)}
            style={{ background:'white', border:'2px solid white', color:'#991b1b',
              borderRadius:9, padding:'8px 14px', fontSize:'0.875rem', fontWeight:900,
              cursor:'pointer', boxShadow:'0 2px 10px rgba(0,0,0,.25)' }}>
            ■ End Stream
          </button>
        </div>
      </div>}

      {confirm && <EndStreamConfirmation ending={ending} onConfirm={handleEnd} onCancel={() => setConfirm(false)} />}

      {/* Host note — keep screen open */}
      {!isNativeBridgeHost && <div style={{
        background:'#fff7ed', color:'#9a3412', fontSize:'0.71875rem', fontWeight:700,
        padding:'7px 14px', textAlign:'center', lineHeight:1.4,
        borderBottom:'1px solid #fed7aa',
        ...topControlsCollapseStyle,
      }}>
        🔒 Screen will stay awake automatically while live. Switching apps or locking your phone manually will still pause the broadcast.
      </div>}

      {/* Camera preview */}
      <div style={{ flex:1, position:'relative', background:'#000', minHeight:0 }}>
        {phase === 'error' ? (
          <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column',
            alignItems:'center', justifyContent:'center', color:'white', gap:12, padding:24, textAlign:'center' }}>
            <div style={{ fontSize:'2.5rem' }}>⚠️</div>
            <div style={{ fontWeight:900, fontSize:'1rem' }}>Stream Interrupted</div>
            <div style={{ fontSize:'0.8125rem', color:'#fca5a5' }}>{errMsg}</div>
            <div style={{ fontSize:'0.75rem', color:'#ddd' }}>
              Retry here to keep the same YouTube link for viewers.
            </div>
            <button onClick={() => { setErrMsg(''); setPhase('reconnecting'); streamerRef.current?.retryReconnect?.(); }}
              style={{ background:'#f59e0b', color:'#111827', border:'none', borderRadius:10,
                padding:'10px 18px', fontSize:'0.8125rem', fontWeight:900, cursor:'pointer' }}>
              ↻ Retry Same Stream
            </button>
          </div>
        ) : isNativeBridgeHost ? (
          <div style={{ position:'absolute', inset:0, background:'#000', display:'none' }}>
          </div>
        ) : false ? (
          <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column',
            alignItems:'center', justifyContent:'center', color:'white', gap:12, padding:24, textAlign:'center',
            background:'linear-gradient(180deg,#071f1f,#020617)' }}>
            <div style={{ fontSize:'2.25rem' }}>📡</div>
            <div style={{ fontWeight:900, fontSize:'1.0625rem' }}>
              {phase === 'live' ? 'Native Android stream is live' : 'Native Android stream is connecting'}
            </div>
            <div style={{ fontSize:'0.8125rem', color:'#cbd5e1', lineHeight:1.5, maxWidth:330 }}>
              The camera preview and controls are handled by Android for better quality. Tap the video screen to show native controls.
            </div>
          </div>
        ) : (
          <>
            <video ref={videoRef} autoPlay playsInline muted
              style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
            {(phase === 'connecting' || phase === 'reconnecting') && (
              <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column',
                alignItems:'center', justifyContent:'center', color:'white', gap:12,
                background:'rgba(0,0,0,0.4)' }}>
                <div style={{ fontSize:'2.5rem' }}>📡</div>
                <div style={{ fontWeight:900, fontSize:'1rem' }}>
                  {phase === 'reconnecting' ? 'Reconnecting to the same YouTube stream…' : 'Connecting to YouTube…'}
                </div>
                <div style={{ fontSize:'0.75rem', color:'#ccc' }}>
                  {phase === 'reconnecting' ? 'Keep this screen open. The viewer link will not change.' : 'Usually takes 10-20 seconds'}
                </div>
              </div>
            )}
            {phase === 'live' && stats && (
              <div style={{ position:'absolute', top:10, left:10, background:'rgba(0,0,0,0.6)',
                color:'white', fontSize:'0.6875rem', fontWeight:700, padding:'4px 10px', borderRadius:8,
                display:'flex', gap:10, transform: controlsAreVisible ? 'translateY(0)' : 'translateY(-8px)',
                ...overlayControlsStyle }}>
                <span>{stats.elapsed != null ? fmtTime(stats.elapsed) : '0:00'}</span>
                {stats.qualityProfile ? <span>{stats.qualityProfile}</span> : null}
                {stats.bytesSent && stats.elapsed
                  ? <span>{Math.round(stats.bytesSent*8/stats.elapsed/1000)}kbps</span> : null}
              </div>
            )}
            {phase !== 'error' && (
              <div style={{
                position:'absolute', left:12, right:12, bottom:64, zIndex:3,
                background:'rgba(0,0,0,0.68)', color:'white', border:'1px solid rgba(255,255,255,0.18)',
                borderRadius:12, padding:'8px 10px', display:'flex', alignItems:'center', gap:10,
                boxShadow:'0 6px 20px rgba(0,0,0,0.35)',
                transform: controlsAreVisible ? 'translateY(0)' : 'translateY(10px)',
                ...overlayControlsStyle,
              }}>
                <div style={{ fontSize:'0.75rem', fontWeight:900, minWidth:86, color: micOk ? '#86efac' : '#fca5a5' }}>
                  {micLabel}
                </div>
                <div aria-label={`Microphone level ${micPercent}%`} style={{
                  flex:1, height:9, borderRadius:999, background:'rgba(255,255,255,0.18)', overflow:'hidden',
                }}>
                  <div style={{
                    width:`${micPercent}%`, height:'100%', borderRadius:999,
                    background: micOk ? '#22c55e' : '#ef4444',
                    transition:'width 160ms ease',
                  }} />
                </div>
                <div style={{ fontSize:'0.6875rem', fontWeight:800, color:'#d1d5db', minWidth:34, textAlign:'right' }}>
                  {micPercent}%
                </div>
              </div>
            )}
            {orientationWarning && (
              <div style={{
                position:'absolute', left:16, right:16, top:48, zIndex:3,
                background:'#fef3c7', color:'#92400e', border:'1px solid #f59e0b',
                borderRadius:12, padding:'12px 14px', fontSize:'0.875rem',
                fontWeight:900, textAlign:'center', boxShadow:'0 8px 24px rgba(0,0,0,0.35)'
              }}>
                {orientationWarning}
              </div>
            )}
          </>
        )}

        {/* Camera controls */}
        {phase !== 'error' && !isNativeBridgeHost && (
          <div style={{
            position:'absolute', bottom:14, right:14, display:'flex', gap:8,
            transform: controlsAreVisible ? 'translateY(0)' : 'translateY(10px)',
            ...overlayControlsStyle,
          }}>
            <button onClick={handleSwitchCamera}
              style={{ background:'rgba(0,0,0,0.55)', color:'white', border:'1px solid rgba(255,255,255,0.3)',
                borderRadius:10, padding:'8px 12px', fontSize:'0.75rem', fontWeight:800, cursor:'pointer' }}>
              🔄 Flip
            </button>
            <button onClick={handleToggleMic}
              style={{ background: muted ? '#0f766e' : 'rgba(0,0,0,0.55)', color:'white',
                border:'1px solid rgba(255,255,255,0.3)',
                borderRadius:10, padding:'8px 12px', fontSize:'0.75rem', fontWeight:800, cursor:'pointer' }}>
              {muted ? '🔇 Mic Off' : '🎙 Mic On'}
            </button>
          </div>
        )}
      </div>

      <style>{`@keyframes liveBlink{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
    </div>
  );
}
