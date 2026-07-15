import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { NativeStreamer } from '../services/nativeStreamService';

// ─── PreCheckCard ──────────────────────────────────────────────────────────
// Shown when host taps "Go Live" — opens the camera immediately so they can
// preview, switch between front/back camera, and check audio — BEFORE any
// network connection or YouTube broadcast is created.
//
// Only when the host taps "Start Streaming" does this hand off to the real
// streaming flow (nativeStreamStart → connect → startRecording).
//
// onConfirm(streamer) — called with the live NativeStreamer instance (camera
//   already open) once the host confirms. Parent takes over from here.
// onCancel() — called if the host backs out — camera is released.
// ─────────────────────────────────────────────────────────────────────────────
export default function PreCheckCard({ event, onConfirm, onCancel }) {
  const [phase,   setPhase]   = useState('opening'); // opening | ready | error | starting
  const [errMsg,  setErrMsg]  = useState('');
  const [muted,   setMuted]   = useState(false);
  const [streamOrientation, setStreamOrientation] = useState('portrait');
  const [landscapeRotation, setLandscapeRotation] = useState('ccw');
  const [audioMode, setAudioMode] = useState('natural');
  const [qualityInfo, setQualityInfo] = useState({ checking:true, label:'Checking network…' });

  const videoRef    = useRef(null);
  const streamerRef = useRef(null);

  // ── Open camera immediately on mount ──────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const streamer = new NativeStreamer(
      (msg) => console.log('[PreCheck]', msg),
      (msg) => { if (!cancelled) { setErrMsg(msg); setPhase('error'); } },
      () => {}
    );
    streamerRef.current = streamer;

    streamer.requestCamera('environment')
      .then((stream) => {
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.muted = true;
          videoRef.current.play().catch(() => {});
        }
        setPhase('ready');
        streamer.detectQuality()
          .then(info => setQualityInfo({
            checking:false,
            label:`${info.label}${info.uploadMbps ? ` · ${info.uploadMbps.toFixed(1)} Mbps upload` : ''}`
          }))
          .catch(() => setQualityInfo({ checking:false, label:'720p HD' }));
      })
      .catch((e) => {
        if (!cancelled) { setErrMsg(e.message || 'Camera access denied'); setPhase('error'); }
      });

    return () => {
      cancelled = true;
      // Only release camera if we never handed off to the parent
      if (streamerRef.current && phaseRef.current !== 'starting') {
        streamerRef.current.stream?.getTracks().forEach(t => t.stop());
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track phase in a ref so the cleanup function (closure from mount time) can see latest value
  const phaseRef = useRef(phase);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

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

  const handleCancel = () => {
    streamerRef.current?.stream?.getTracks().forEach(t => t.stop());
    onCancel?.();
  };

  const handleConfirm = async () => {
    setPhase('starting');
    await streamerRef.current?.requestOrientationPermission?.();
    streamerRef.current?.setStreamOrientation(streamOrientation, landscapeRotation);
    streamerRef.current?.setAudioMode(audioMode);
    onConfirm?.(streamerRef.current);
  };

  return createPortal(
    <div style={{
      position:'fixed', inset:0, height:'100dvh', zIndex:9999,
      display:'flex', flexDirection:'column', background:'#000',
      fontFamily:'var(--font,sans-serif)',
      paddingBottom:'env(safe-area-inset-bottom)',
    }}>
      {/* Header */}
      <div style={{
        background:'#1a1a1a', padding:'10px 14px', flexShrink:0,
        display:'flex', alignItems:'center', justifyContent:'space-between',
        paddingTop:'max(10px, env(safe-area-inset-top))',
      }}>
        <div style={{ color:'white', fontWeight:900, fontSize:'0.875rem' }}>
          {phase === 'starting' ? 'Starting Live Stream' : '📹 Camera Check'}
        </div>
        {phase !== 'starting' && <button onClick={handleCancel}
          style={{ background:'rgba(255,255,255,0.15)', border:'none',
            color:'white', borderRadius:8, padding:'6px 14px',
            fontSize:'0.8125rem', fontWeight:900, cursor:'pointer' }}>
          Cancel
        </button>}
      </div>

      {/* Info banner */}
      <div style={{
        background:'#0f766e22', color:'#5eead4', fontSize:'0.71875rem', fontWeight:700,
        padding:'7px 14px', textAlign:'center', lineHeight:1.4,
        borderBottom:'1px solid #0f766e44',
      }}>
        {phase === 'starting'
          ? 'Please keep this screen open while the secure connection to YouTube is prepared.'
          : 'Check your camera and microphone, then tap "Start Streaming" to go live on YouTube.'}
      </div>

      {/* Camera preview */}
      <div style={{ flex:1, position:'relative', background:'#000', minHeight:0 }}>
        {phase === 'error' ? (
          <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column',
            alignItems:'center', justifyContent:'center', color:'white', gap:12, padding:24, textAlign:'center' }}>
            <div style={{ fontSize:'2.5rem' }}>⚠️</div>
            <div style={{ fontWeight:900, fontSize:'1rem' }}>Camera Error</div>
            <div style={{ fontSize:'0.8125rem', color:'#fca5a5' }}>{errMsg}</div>
          </div>
        ) : (
          <>
            <video ref={videoRef} autoPlay playsInline muted
              style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
            {phase === 'opening' && (
              <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column',
                alignItems:'center', justifyContent:'center', color:'white', gap:12,
                background:'rgba(0,0,0,0.4)' }}>
                <div style={{ fontSize:'2.5rem' }}>📷</div>
                <div style={{ fontWeight:900, fontSize:'1rem' }}>Opening camera…</div>
              </div>
            )}
            {phase === 'starting' && (
              <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column',
                alignItems:'center', justifyContent:'center', color:'white', gap:14,
                background:'rgba(0,0,0,0.88)', padding:24, textAlign:'center' }}>
                <div style={{ width:48, height:48, border:'4px solid rgba(255,255,255,.25)',
                  borderTopColor:'#ef4444', borderRadius:'50%', animation:'streamStartSpin .9s linear infinite' }} />
                <div style={{ fontWeight:900, fontSize:'1.125rem' }}>Please wait while your stream starts</div>
                <div style={{ fontSize:'0.8125rem', color:'#d1d5db', lineHeight:1.5, maxWidth:330 }}>
                  Connecting the camera and preparing the YouTube live video. This may take longer on mobile data.
                </div>
              </div>
            )}
          </>
        )}

        {/* Stream layout controls */}
        {phase === 'ready' && (
          <div style={{
            position:'absolute', bottom:64, left:14, right:14,
            display:'flex', gap:8, justifyContent:'center', flexWrap:'wrap'
          }}>
            <div style={{
              display:'flex', gap:8, background:'rgba(0,0,0,0.62)',
              border:'1px solid rgba(255,255,255,0.3)', borderRadius:12, padding:5
            }}>
              <button onClick={() => setStreamOrientation('portrait')}
                style={{ background:streamOrientation === 'portrait' ? '#0f766e' : 'transparent',
                  color:'white', border:'none', borderRadius:8, padding:'8px 11px',
                  fontSize:'0.75rem', fontWeight:900, cursor:'pointer' }}>
                Portrait
              </button>
              <button onClick={() => setStreamOrientation('landscape')}
                style={{ background:streamOrientation === 'landscape' ? '#0f766e' : 'transparent',
                  color:'white', border:'none', borderRadius:8, padding:'8px 11px',
                  fontSize:'0.75rem', fontWeight:900, cursor:'pointer' }}>
                Landscape
              </button>
              {streamOrientation === 'landscape' && (
                <button onClick={() => setLandscapeRotation(v => v === 'ccw' ? 'cw' : 'ccw')}
                  style={{ background:'rgba(255,255,255,0.16)', color:'white', border:'none',
                    borderRadius:8, padding:'8px 11px', fontSize:'0.75rem', fontWeight:900, cursor:'pointer' }}>
                  Rotate Fix
                </button>
              )}
            </div>
          </div>
        )}

        {/* Camera controls */}
        {phase === 'ready' && (
          <div style={{ position:'absolute', bottom:14, right:14, display:'flex', gap:8 }}>
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

      {/* Bottom action bar */}
      <div style={{ padding:'14px 16px', background:'#1a1a1a',
        paddingBottom:'max(14px, env(safe-area-inset-bottom))' }}>
        <div style={{ display:'flex', gap:8, marginBottom:10 }}>
          {[
            { key:'natural', label:'Natural/Event audio' },
            { key:'speech', label:'Speech audio' },
          ].map(option => (
            <button key={option.key} type="button" onClick={() => setAudioMode(option.key)}
              style={{ flex:1, padding:'8px 6px', borderRadius:9, fontSize:'0.6875rem', fontWeight:800,
                cursor:'pointer', color:'white',
                border:`1px solid ${audioMode === option.key ? '#5eead4' : '#555'}`,
                background:audioMode === option.key ? '#0f766e' : '#2b2b2b' }}>
              {option.label}
            </button>
          ))}
        </div>
        <div style={{ color:'#5eead4', fontSize:'0.6875rem', textAlign:'center', marginBottom:9, fontWeight:700 }}>
          {qualityInfo.checking ? '⏳' : '📶'} {qualityInfo.label}
        </div>
        <button onClick={handleConfirm} disabled={phase !== 'ready'}
          style={{
            width:'100%', padding:'14px', borderRadius:14, border:'none',
            background: phase === 'ready' ? '#0f766e' : '#555',
            color:'white', fontWeight:900, fontSize:'0.9375rem',
            cursor: phase === 'ready' ? 'pointer' : 'not-allowed',
            display:'flex', alignItems:'center', justifyContent:'center', gap:8,
          }}>
          {phase === 'starting'
            ? 'Starting…'
            : phase === 'ready'
              ? <>🔴 Start Streaming — Go Live on YouTube</>
              : 'Preparing camera…'}
        </button>
        <div style={{ color:'#888', fontSize:'0.6875rem', textAlign:'center', marginTop:8 }}>
          {event?.eventTypeDisplay || event?.eventType} — {event?.hostName}
        </div>
      </div>
      <style>{`@keyframes streamStartSpin { to { transform: rotate(360deg); } }`}</style>
    </div>,
    document.body
  );
}
