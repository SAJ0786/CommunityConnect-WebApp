import React, { useState, useEffect, useRef } from 'react';
import { getHostUrl, getViewerUrl } from '../services/hmsService';
import { goLive, endLive } from '../services/eventService';

export default function StreamCard({ event, role, hostUrl, onClose, onMinimise }) {
  const [status,   setStatus]   = useState('connecting');
  const [error,    setError]    = useState('');
  const [confirm,  setConfirm]  = useState(false);
  const [ended,    setEnded]    = useState(false);
  const isHost  = role === 'host';

  useEffect(() => { initStream(); }, []);

  const cleanup = async (endStream) => {
    try {
      if (endStream) await endLive(event.id).catch(() => {});
    } catch {}
  };

  const [iframeUrl, setIframeUrl] = useState(hostUrl || '');

  const initStream = async () => {
    try {
      if (hostUrl) {
        // Use existing URL — don't regenerate
        setIframeUrl(hostUrl);
        setStatus('live');
        return;
      }
      if (isHost) {
        const result = await getHostUrl(`host_${event.id}`, event.eventTypeDisplay || event.eventType, event.id, event.liveRoomId);
        setIframeUrl(result.url || result);
        await goLive(event.id, event.id);
      } else {
        const url = await getViewerUrl(`viewer_${Date.now()}`, event.liveRoomId);
        setIframeUrl(url);
      }
      setStatus('live');
    } catch (e) {
      setError(e.message || 'Could not connect. Please try again.');
      setStatus('error');
    }
  };

  const handleEnd = async () => {
    await cleanup(true);
    setStatus('ended');
    setConfirm(false);
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'#000', zIndex:9999,
      display:'flex', flexDirection:'column', fontFamily:'var(--font,Nunito,sans-serif)' }}>

      {/* Top bar */}
      <div style={{ background:'#c0392b', padding:'12px 16px', flexShrink:0,
        display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ color:'white', fontWeight:900, fontSize:14,
          display:'flex', alignItems:'center', gap:8 }}>
          {status === 'live' && <span style={{ animation:'liveBlink 1s infinite' }}>🔴</span>}
          {isHost ? (status === 'live' ? 'YOU ARE LIVE' : status === 'connecting' ? 'Starting…' : 'Stream') :
           (status === 'live' ? `LIVE — ${event.eventTypeDisplay || event.eventType}` : 'Connecting…')}
        </div>
        {isHost ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* Minimise — go back to app without ending stream */}
            {onMinimise && (
              <button onClick={onMinimise}
                style={{ background:'rgba(255,255,255,0.2)', border:'none', color:'white',
                  borderRadius:8, padding:'6px 12px', fontSize:13, fontWeight:900,
                  cursor:'pointer' }}>
                ← App
              </button>
            )}
            {!confirm ? (
              <button onClick={() => setConfirm(true)}
                style={{ background:'rgba(255,255,255,0.2)', border:'none', color:'white',
                  borderRadius:8, padding:'6px 14px', fontSize:13, fontWeight:900,
                  cursor:'pointer' }}>
                ⏹ End Stream
              </button>
            ) : (
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={handleEnd}
                  style={{ background:'white', color:'#c0392b', border:'none',
                    borderRadius:8, padding:'6px 12px', fontSize:12,
                    fontWeight:900, cursor:'pointer' }}>Yes, End</button>
                <button onClick={() => setConfirm(false)}
                  style={{ background:'rgba(255,255,255,0.2)', border:'none', color:'white',
                    borderRadius:8, padding:'6px 12px', fontSize:12,
                    fontWeight:900, cursor:'pointer' }}>Cancel</button>
              </div>
            )}
          </div>
        ) : (
          <button onClick={() => { cleanup(false); onClose(); }}
            style={{ background:'rgba(255,255,255,0.2)', border:'none', color:'white',
              borderRadius:8, padding:'6px 14px', fontSize:13, fontWeight:900,
              cursor:'pointer', boxShadow:'none' }}>← Home</button>
        )}
      </div>

      {/* 100ms prebuilt iframe */}
      {iframeUrl ? (
        <iframe src={iframeUrl}
          allow="camera; microphone; fullscreen; display-capture; autoplay"
          style={{ flex:1, border:'none', width:'100%', background:'#000' }}
          title="Live Stream" />
      ) : (
        <div style={{ flex:1, background:'#000' }} />
      )}

      {/* Status overlays */}
      {(status === 'connecting') && (
        <div style={{ position:'absolute', inset:0, display:'flex',
          alignItems:'center', justifyContent:'center', zIndex:10 }}>
          <div style={{ color:'white', textAlign:'center' }}>
            <div style={{ fontSize:40, marginBottom:12 }}>📡</div>
            <div style={{ fontWeight:900, fontSize:16, fontFamily:'var(--font)' }}>
              {isHost ? 'Starting your stream…' : 'Connecting to stream…'}
            </div>
          </div>
        </div>
      )}
      {status === 'error' && (
        <div style={{ position:'absolute', inset:0, display:'flex',
          alignItems:'center', justifyContent:'center', zIndex:10, padding:24 }}>
          <div style={{ color:'white', textAlign:'center' }}>
            <div style={{ fontSize:40, marginBottom:12 }}>⚠️</div>
            <div style={{ fontWeight:900, fontSize:16, marginBottom:8, fontFamily:'var(--font)' }}>
              Could not connect
            </div>
            <div style={{ fontSize:13, color:'#ccc', marginBottom:20 }}>{error}</div>
            <button onClick={() => { cleanup(false); onClose(); }}
              style={{ background:'#c0392b', color:'white', border:'none',
                borderRadius:10, padding:'10px 24px', fontSize:14,
                fontWeight:900, cursor:'pointer', fontFamily:'var(--font)' }}>
              ← Back to Home
            </button>
          </div>
        </div>
      )}
      {(status === 'ended' || ended) && (
        <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.9)',
          display:'flex', alignItems:'center', justifyContent:'center',
          flexDirection:'column', gap:16, zIndex:10 }}>
          <div style={{ fontSize:48 }}>{isHost ? '✅' : '⏹'}</div>
          <h3 style={{ color:'white', fontWeight:900, fontSize:18,
            fontFamily:'var(--font)', margin:0 }}>
            {isHost ? 'Stream Ended' : 'Stream has ended'}
          </h3>
          <p style={{ color:'#ccc', fontSize:14, textAlign:'center',
            fontFamily:'var(--font)', margin:0, padding:'0 20px' }}>
            {isHost
              ? 'Thank you for streaming with Community Events Australia!'
              : 'The host has ended the live stream.'}
          </p>
          <button onClick={() => { cleanup(false); onClose(); }}
            style={{ background:'#c0392b', color:'white', border:'none',
              borderRadius:12, padding:'12px 28px', fontSize:14,
              fontWeight:900, cursor:'pointer', fontFamily:'var(--font)' }}>
            ← Back to Home
          </button>
        </div>
      )}

      {/* Footer */}
      <div style={{ background:'#111', padding:'8px 16px', flexShrink:0,
        display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <span style={{ fontSize:11, color:'#666', fontWeight:700 }}>🏠 {event.hostName}</span>
        <span style={{ fontSize:11, color: isHost ? '#e74c3c' : '#666', fontWeight:700 }}>
          {isHost ? '🎥 Broadcasting' : '👁 View Only — camera off'}
        </span>
      </div>

      <style>{`@keyframes liveBlink{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
    </div>
  );
}
