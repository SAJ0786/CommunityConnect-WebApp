import React, { useState, useEffect } from 'react';
import { getHostUrl, HMS_HOST_ROOM_CODE, HMS_ROOM_ID } from '../services/hmsService';
import { updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { goLive, endLive } from '../services/eventService';

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

// ── Host stream window (full screen iframe) ───────────────────────────────────
function StreamWindow({ event, url, onClose, onEnd }) {
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [ending,     setEnding]     = useState(false);
  const [ended,      setEnded]      = useState(false);

  const handleEnd = async () => {
    setEnding(true);
    await endLive(event.id).catch(() => {});
    // Stop YouTube RTMP + HLS streams
    try {
      const { httpsCallable } = await import('firebase/functions');
      const { functions: fns } = await import('../firebase/firebase');
      const liveRoomId = event.liveRoomId || HMS_ROOM_ID;
      await Promise.allSettled([
        httpsCallable(fns, 'stopYouTubeStream')({ roomId: liveRoomId, beamId: window.__ytBeamId || null }),
        httpsCallable(fns, 'stopHLSStream')({ roomId: liveRoomId }),
      ]);
      window.__ytBeamId = null;
    } catch (e) { console.warn('Stream stop failed:', e.message); }
    setEnding(false);
    setEnded(true);
    if (onEnd) onEnd();
  };

  if (ended) {
    return (
      <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.95)',
        zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center',
        flexDirection:'column', gap:16, fontFamily:'var(--font)' }}>
        <div style={{ fontSize:52 }}>✅</div>
        <h3 style={{ color:'white', fontWeight:900, fontSize:20, margin:0 }}>Stream Ended</h3>
        <p style={{ color:'#aaa', fontSize:14, textAlign:'center', margin:0, padding:'0 24px' }}>
          Thank you for streaming with Community Events Australia!
        </p>
        <button onClick={onClose} style={{ background:'#c0392b', color:'white',
          border:'none', borderRadius:12, padding:'12px 28px',
          fontSize:15, fontWeight:900, cursor:'pointer', marginTop:8 }}>
          ← Back to Home
        </button>
      </div>
    );
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'#000', zIndex:9999,
      display:'flex', flexDirection:'column', fontFamily:'var(--font)',
      height:'100dvh', overflow:'hidden' }}>

      {/* Header */}
      <div style={{ background:'#c0392b', padding:'10px 16px', flexShrink:0,
        display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ color:'white', fontWeight:900, fontSize:14,
          display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ animation:'liveBlink 1s infinite' }}>🔴</span>
          YOU ARE LIVE
        </div>
        {!confirmEnd ? (
          <button onClick={() => setConfirmEnd(true)}
            style={{ background:'rgba(255,255,255,0.2)', border:'none',
              color:'white', borderRadius:8, padding:'6px 14px',
              fontSize:13, fontWeight:900, cursor:'pointer' }}>
            ⏹ End Stream
          </button>
        ) : (
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={handleEnd} disabled={ending}
              style={{ background:'white', color:'#c0392b', border:'none',
                borderRadius:8, padding:'6px 12px', fontSize:12,
                fontWeight:900, cursor:'pointer' }}>
              {ending ? '…' : 'Yes, End'}
            </button>
            <button onClick={() => setConfirmEnd(false)}
              style={{ background:'rgba(255,255,255,0.2)', border:'none',
                color:'white', borderRadius:8, padding:'6px 12px',
                fontSize:12, fontWeight:900, cursor:'pointer' }}>
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* 100ms host iframe */}
      <iframe
        src={url}
        allow="camera; microphone; fullscreen; display-capture; autoplay; clipboard-write"
        allowFullScreen
        style={{ flex:1, border:'none', width:'100%', height:'100%',
          background:'#000', display:'block', minHeight:0 }}
        title="Live Stream Host"
      />

      <style>{`@keyframes liveBlink{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
    </div>
  );
}

// ── YouTube Watch Button — uses event-specific broadcast URL ─────────────────
export function YouTubeWatchButton({ event }) {
  const CHANNEL_LIVE = 'https://www.youtube.com/channel/UC9AvesDamQvU7idD2OD1R6w/live';
  // Use event-specific watchUrl if available, otherwise fall back to channel live page
  const [ytUrl, setYtUrl] = useState(event?.liveWatchUrl || window.__ytWatchUrl || CHANNEL_LIVE);

  useEffect(() => {
    // If event has a specific watch URL saved, use it immediately
    if (event?.liveWatchUrl) {
      setYtUrl(event.liveWatchUrl);
      return;
    }
    // Otherwise poll YouTube API
    let cancelled = false;
    const check = async () => {
      if (window.__ytWatchUrl) {
        if (!cancelled) setYtUrl(window.__ytWatchUrl);
        return;
      }
      const { getChannelLiveUrl } = await import('../services/youtubeService');
      const url = await getChannelLiveUrl();
      if (!cancelled && url) setYtUrl(url);
    };
    check();
    const interval = setInterval(check, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [event?.liveWatchUrl]);

  return (
    <a href={ytUrl} target="_blank" rel="noreferrer"
      style={{
        background:'#FF0000', color:'white',
        fontSize:12, padding:'8px 14px', borderRadius:10,
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
export function GoLiveButton({ event, onLiveStarted, onLiveEnded }) {
  const [popup,    setPopup]    = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [hostUrl,  setHostUrl]  = useState('');
  const [errMsg,   setErrMsg]   = useState('');

  const startStream = async () => {
    setPopup(null);
    setLoading(true);
    try {
      const eventLabel = `${event.eventTypeDisplay || event.eventType} ${event.eventDate ? '- ' + new Date(event.eventDate + 'T00:00:00').toLocaleDateString('en-AU', {day:'numeric',month:'short'}) : ''}`;
      // Use existing room if event already has one, otherwise create new
      const existingRoomId = event.liveRoomId || null;
      const { url, roomId } = await getHostUrl(`host_${event.id}`, eventLabel, event.id, existingRoomId);
      setHostUrl(url);
      // Store the room ID on the event for viewers to join the same room
      if (roomId && roomId !== existingRoomId) {
        await updateDoc(doc(db, 'events', event.id), { liveRoomId: roomId });
        event.liveRoomId = roomId; // update local reference
      }
      await goLive(event.id, HMS_HOST_ROOM_CODE);

      // Push notification
      try {
        const { httpsCallable } = await import('firebase/functions');
        const { functions: fns } = await import('../firebase/firebase');
        await httpsCallable(fns, 'notifyEventLive')({
          eventId:    event.id,
          eventTitle: event.eventTypeDisplay || event.eventType || 'Event',
          hostName:   event.hostName || '',
        });
      } catch (e) { console.warn('Push failed:', e.message); }

      // Start YouTube RTMP stream
      try {
        const { httpsCallable } = await import('firebase/functions');
        const { functions: fns } = await import('../firebase/firebase');
        const { auth } = await import('../firebase/firebase');
        const currentUser = auth.currentUser;
        if (currentUser) {
          await currentUser.getIdToken(true);
          const liveRoomId = event.liveRoomId || HMS_ROOM_ID;
          const meetingUrl = `https://community-events-livestream.app.100ms.live/preview/${liveRoomId}/broadcaster?skip_preview=true`;
          const eventTitle = [
            event.eventTypeDisplay || event.eventType,
            event.hostName,
            event.eventSubject || ''
          ].filter(Boolean).join(' — ');
          const [ytResult] = await Promise.allSettled([
            httpsCallable(fns, 'startYouTubeStream')({ roomId: liveRoomId, eventTitle }),
            httpsCallable(fns, 'startHLSStream')({ roomId: liveRoomId, meetingUrl }),
          ]);
          if (ytResult.status === 'fulfilled') {
            window.__ytBeamId    = ytResult.value?.data?.streamJobId;
            window.__ytWatchUrl  = ytResult.value?.data?.watchUrl;
            window.__ytBroadcastId = ytResult.value?.data?.broadcastId;
            // Save watchUrl to Firestore so ALL viewers get the correct YouTube link
            if (window.__ytWatchUrl) {
              const { updateDoc, doc } = await import('firebase/firestore');
              const { db: firedb } = await import('../firebase/firebase');
              await updateDoc(doc(firedb, 'events', event.id), {
                liveWatchUrl: window.__ytWatchUrl
              }).catch(e => console.warn('Could not save watchUrl:', e.message));
            }
          }
          console.log('[YouTube] Stream started:', ytResult.value?.data);
        }
      } catch (e) {
        console.error('[YouTube] Stream start failed:', e.message);
      }

      setStreaming(true);
      setPopup('stream');
      if (onLiveStarted) onLiveStarted(event, event.id, 'host', url);
    } catch (e) {
      setErrMsg(e.message || 'Could not start stream. Please try again.');
      setPopup('error');
    }
    setLoading(false);
  };

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

  // When this device is streaming
  if (streaming) {
    return (
      <>
        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          <span style={{ fontSize:11, fontWeight:900, color:'#c0392b',
            display:'flex', alignItems:'center', gap:5 }}>
            <span style={{ animation:'liveBlink 1s infinite' }}>🔴</span> LIVE NOW
          </span>
          <button onClick={() => setPopup('stream')}
            style={{ background:'#c0392b', fontSize:12, padding:'7px 14px',
              borderRadius:10, color:'white', border:'none', fontWeight:900,
              cursor:'pointer', boxShadow:'0 2px 8px rgba(192,57,43,0.35)' }}>
            🎥 Open Stream
          </button>
        </div>

        {popup === 'stream' && hostUrl && (
          <StreamWindow event={event} url={hostUrl}
            onClose={() => setPopup(null)}
            onEnd={() => {
              setStreaming(false);
              setPopup(null);
              if (onLiveEnded) onLiveEnded();
            }} />
        )}
        <style>{`@keyframes liveBlink{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
      </>
    );
  }

  // Default — Go Live button
  return (
    <>
      <button onClick={() => setPopup('confirm')} disabled={loading}
        style={{ background:'#c0392b', fontSize:12, padding:'8px 14px',
          borderRadius:10, display:'flex', alignItems:'center', gap:6,
          boxShadow:'0 2px 8px rgba(192,57,43,0.35)', cursor:'pointer',
          fontWeight:900, color:'white', border:'none' }}>
        <span>🔴</span>
        {loading ? 'Starting…' : 'Go Live'}
      </button>

      {popup === 'confirm' && (
        <Popup icon="🔴"
          title="Start Live Stream?"
          message={`"${event.eventTypeDisplay || event.eventType} — ${event.hostName}" will be streamed publicly on YouTube.`}
          confirmLabel="Yes, Go Live 🔴" cancelLabel="Not Yet"
          onConfirm={startStream} onCancel={() => setPopup(null)} />
      )}
      {popup === 'error' && (
        <Popup icon="⚠️" title="Could Not Start"
          message={errMsg} confirmLabel="OK" infoOnly
          onClose={() => setPopup(null)} />
      )}
    </>
  );
}

// ── Watch Live button (viewers — now just shows YouTube button when live) ─────
export function WatchLiveButton({ event }) {
  if (!event.isLive) return null;
  return <YouTubeWatchButton event={event} />;
}
