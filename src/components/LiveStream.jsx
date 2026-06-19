import React, { useState, useEffect } from 'react';
import { goLive, endLive } from '../services/eventService';
import { NativeStreamer } from '../services/nativeStreamService';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase/firebase';
import { updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import PreCheckCard from './PreCheckCard';

// ── Popup helper ──────────────────────────────────────────────────────────────
function Popup({ icon, title, message, confirmLabel, cancelLabel, onConfirm, onCancel, onClose, infoOnly }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)',
      zIndex:10000, display:'flex', alignItems:'center', justifyContent:'center',
      padding:24, fontFamily:'var(--font)' }}>
      <div style={{ background:'var(--card)', borderRadius:20, padding:28,
        maxWidth:340, width:'100%', textAlign:'center', boxShadow:'0 8px 40px rgba(0,0,0,0.4)' }}>
        <div style={{ fontSize:40, marginBottom:12 }}>{icon}</div>
        <h3 style={{ margin:'0 0 10px', fontWeight:900, fontSize:18, color:'var(--text)' }}>{title}</h3>
        <p style={{ margin:'0 0 20px', fontSize:14, color:'var(--muted)', lineHeight:1.5 }}>{message}</p>
        <div style={{ display:'flex', gap:10, justifyContent:'center' }}>
          {!infoOnly && cancelLabel && (
            <button onClick={onCancel}
              style={{ flex:1, padding:'12px', borderRadius:12, border:'1px solid var(--border)',
                background:'transparent', color:'var(--text)', fontWeight:700,
                fontSize:14, cursor:'pointer' }}>
              {cancelLabel}
            </button>
          )}
          <button onClick={infoOnly ? onClose : onConfirm}
            style={{ flex:1, padding:'12px', borderRadius:12, border:'none',
              background:'#c0392b', color:'white', fontWeight:900,
              fontSize:14, cursor:'pointer' }}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── YouTube Watch Button — uses event-specific broadcast URL ─────────────────
async function waitForYouTubeLive(sessionId, onStatus) {
  if (!sessionId) return null;

  const checkHealth = httpsCallable(functions, 'nativeStreamCheckHealth');
  let lastResult = null;

  for (let attempt = 0; attempt < 8; attempt++) {
    await new Promise(resolve => setTimeout(resolve, attempt === 0 ? 2500 : 3500));
    try {
      const result = await checkHealth({ sessionId });
      lastResult = result.data;
      const broadcastStatus = lastResult?.broadcastStatus;
      const streamStatus = lastResult?.streamStatus;
      onStatus?.(`YouTube status: ${broadcastStatus || '?'} / ${streamStatus || '?'}`);

      if (broadcastStatus === 'live') return lastResult;
    } catch (e) {
      console.warn('[NativeStream] YouTube health check failed:', e.message);
    }
  }

  return lastResult;
}

export function YouTubeWatchButton({ event, compact }) {
  const CHANNEL_LIVE = 'https://www.youtube.com/channel/UC9AvesDamQvU7idD2OD1R6w/live';
  const [ytUrl, setYtUrl] = useState(event?.liveWatchUrl || CHANNEL_LIVE);

  useEffect(() => {
    if (event?.liveWatchUrl) setYtUrl(event.liveWatchUrl);
  }, [event?.liveWatchUrl]);

  return (
    <a href={ytUrl} target="_blank" rel="noreferrer"
      style={{
        background:'#FF0000', color:'white',
        fontSize: compact ? 10.5 : 12, padding: compact ? '5px 10px' : '8px 14px',
        borderRadius:10,
        display:'inline-flex', alignItems:'center', gap:6,
        fontWeight:900, textDecoration:'none',
        boxShadow:'0 2px 8px rgba(255,0,0,0.4)',
        animation:'ytPulse 2s infinite',
      }}>
      <span style={{ animation:'liveBlink 1s infinite', fontSize:10 }}>🔴</span>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
      </svg>
      Watch on YouTube
      <style>{`
        @keyframes ytPulse{0%,100%{box-shadow:0 2px 8px rgba(255,0,0,0.4)}50%{box-shadow:0 2px 20px rgba(255,0,0,0.8)}}
        @keyframes liveBlink{0%,100%{opacity:1}50%{opacity:0.3}}
      `}</style>
    </a>
  );
}

// ── Go Live button (host only) ────────────────────────────────────────────────
// Uses native streaming (getUserMedia → MediaRecorder → WebSocket → Cloud Run
// → FFmpeg → YouTube RTMPS). Native relay only.
export function GoLiveButton({ event, onLiveStarted, onLiveEnded }) {
  const [popup,     setPopup]     = useState(null);
  const [showPreCheck, setShowPreCheck] = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [errMsg,    setErrMsg]    = useState('');

  // Fix #3: if isLive flips to false (e.g. ended via the StreamCard on THIS
  // device, or by an admin elsewhere) but local `streaming` is still true,
  // reset it — otherwise this button stays stuck on "LIVE NOW" forever even
  // after the stream has actually ended.
  useEffect(() => {
    if (!event.isLive && streaming) setStreaming(false);
  }, [event.isLive, streaming]);

  // Called once the host confirms in PreCheckCard — camera is already open.
  // From here: get YouTube broadcast, connect WebSocket, start recording.
  const startStream = async (streamer) => {
    setShowPreCheck(false);
    setLoading(true);
    let startedSessionId = null;
    try {
      const eventTitle = [
        event.eventTypeDisplay || event.eventType,
        event.hostName,
        event.eventSubject || ''
      ].filter(Boolean).join(' — ');

      // 1) Get YouTube broadcast + relay session from Cloud Function
      const startRes = await httpsCallable(functions, 'nativeStreamStart')({
        useOAuth: true,
        eventTitle,
      });
      const { wsUrl, watchUrl, sessionId } = startRes.data;
      startedSessionId = sessionId;

      // 2) Camera is already open (from PreCheckCard) — reuse it
      streamer.onStatus = (msg) => console.log('[NativeStream]', msg);
      streamer.onError  = (msg) => console.error('[NativeStream] error:', msg);

      // 3) Connect WebSocket + start recording → streaming to YouTube
      await streamer.connect(wsUrl);
      await streamer.startRecording('OAUTH'); // server uses session's stored RTMPS URL — reacquires camera fresh

      // 4) Mark event live in Firestore + save watch URL for all viewers
      await waitForYouTubeLive(sessionId, msg => console.log('[NativeStream]', msg));
      await goLive(event.id, sessionId);
      if (watchUrl) {
        await updateDoc(doc(db, 'events', event.id), { liveWatchUrl: watchUrl }).catch(() => {});
      }

      // 5) Push notification to subscribers (fire-and-forget — doesn't block going live)
      httpsCallable(functions, 'notifyEventLive')({
        eventId:    event.id,
        eventTitle: event.eventTypeDisplay || event.eventType || 'Event',
        hostName:   event.hostName || '',
      }).catch(e => console.warn('Push failed:', e.message));

      setStreaming(true);
      if (onLiveStarted) onLiveStarted(event, event.id, 'host', null, { streamer, sessionId, watchUrl });

    } catch (e) {
      // Streaming failed to start — release the camera that PreCheckCard opened
      if (startedSessionId) {
        httpsCallable(functions, 'nativeStreamEndEvent')({
          eventId: event.id,
          sessionId: startedSessionId,
        }).catch(err => console.warn('[NativeStream] failed start cleanup:', err.message));
      }
      try { streamer?.stop?.(); } catch {}
      setErrMsg(e.message || 'Could not start stream. Please try again.');
      setPopup('error');
    }
    setLoading(false);
  };

  // PreCheckCard cancelled — just close it, nothing else happened yet
  const handlePreCheckCancel = () => setShowPreCheck(false);


  // When event is live (set by another device/admin)
  if (event.isLive && !streaming) {
    return (
      <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
        <span style={{ fontSize:11, fontWeight:900, color:'#c0392b',
          display:'flex', alignItems:'center', gap:5 }}>
          <span style={{ animation:'liveBlink 1s infinite' }}>🔴</span> LIVE NOW
        </span>
        <style>{`@keyframes liveBlink{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
      </div>
    );
  }

  // When this device is streaming — stream lives in App-level StreamCard
  if (streaming) {
    return (
      <>
        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          <span style={{ fontSize:11, fontWeight:900, color:'#c0392b',
            display:'flex', alignItems:'center', gap:5 }}>
            <span style={{ animation:'liveBlink 1s infinite' }}>🔴</span> LIVE NOW
          </span>
          <span style={{ fontSize:11, color:'var(--muted)' }}>
            Stream window is open ↗
          </span>
        </div>
        <style>{`@keyframes liveBlink{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
      </>
    );
  }

  // Default — Go Live button
  return (
    <>
      <button onClick={() => setShowPreCheck(true)} disabled={loading}
        style={{ background:'#c0392b', fontSize:12, padding:'8px 14px',
          borderRadius:10, display:'flex', alignItems:'center', gap:6,
          boxShadow:'0 2px 8px rgba(192,57,43,0.35)', cursor:'pointer',
          fontWeight:900, color:'white', border:'none' }}>
        <span>🔴</span>
        {loading ? 'Starting…' : 'Go Live'}
      </button>

      {showPreCheck && (
        <PreCheckCard event={event}
          onConfirm={startStream}
          onCancel={handlePreCheckCancel} />
      )}

      {popup === 'error' && (
        <Popup icon="⚠️" title="Could Not Start"
          message={errMsg} confirmLabel="OK" infoOnly
          onClose={() => setPopup(null)} />
      )}
    </>
  );
}

// ── Watch Live button (viewers — shows YouTube button when live) ─────────────
export function WatchLiveButton({ event, isGuest, onWatchStarted, compact }) {
  if (!event.isLive) return null;
  return <YouTubeWatchButton event={event} compact={compact} />;
}
