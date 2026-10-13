import React, { useState, useEffect } from 'react';
import { goLive, endLive } from '../services/eventService';
import { NativeStreamer } from '../services/nativeStreamService';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase/firebase';
import { updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebase/firebase';
import PreCheckCard from './PreCheckCard';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const LIVE_DOT_ICON = String.fromCodePoint(0x1F534);
const WARNING_ICON = String.fromCodePoint(0x26A0, 0xFE0F);

function hasAndroidNativeBridge() {
  try {
    return !!window.CommunityEventsAndroid?.isAvailable?.();
  } catch {
    return false;
  }
}

// ── Popup helper ──────────────────────────────────────────────────────────────
function Popup({ icon, title, message, confirmLabel, cancelLabel, onConfirm, onCancel, onClose, infoOnly }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'color-mix(in srgb, var(--cc-overlay-base) 70%, transparent)',
      zIndex:10000, display:'flex', alignItems:'center', justifyContent:'center',
      padding:24, fontFamily:'var(--font)' }}>
      <div style={{ background:'var(--card)', borderRadius:20, padding:28,
        maxWidth:340, width:'100%', maxHeight:'calc(100dvh - 48px)', overflowY:'auto', textAlign:'center', boxShadow:'0 8px 40px color-mix(in srgb, var(--cc-shadow-base) 40%, transparent)' }}>
        <div style={{ fontSize:'2.5rem', marginBottom:12 }}>{icon}</div>
        <h3 style={{ margin:'0 0 10px', fontWeight:900, fontSize:'1.125rem', color:'var(--text)' }}>{title}</h3>
        <p style={{ margin:'0 0 20px', fontSize:'0.875rem', color:'var(--muted)', lineHeight:1.5 }}>{message}</p>
        <div style={{ display:'flex', gap:10, justifyContent:'center' }}>
          {!infoOnly && cancelLabel && (
            <button onClick={onCancel}
              style={{ flex:1, padding:'12px', borderRadius:12, border:'1px solid var(--border)',
                background:'transparent', color:'var(--text)', fontWeight:700,
                fontSize:'0.875rem', cursor:'pointer' }}>
              {cancelLabel}
            </button>
          )}
          <button onClick={infoOnly ? onClose : onConfirm}
            style={{ flex:1, padding:'12px', borderRadius:12, border:'none',
              background:'var(--cc-accent-strong)', color:'var(--cc-on-primary)', fontWeight:900,
              fontSize:'0.875rem', cursor:'pointer' }}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function StreamMethodDialog({
  step, url, error, loading, visibility, orientation, isNativeDevice,
  onVisibilityChange, onOrientationChange, onUrlChange, onThisDevice,
  onAnotherDevice, onBack, onCancel, onExternalStart
}) {
  return (
    <div style={{ position:'fixed', inset:0, background:'color-mix(in srgb, var(--cc-overlay-base) 72%, transparent)', zIndex:10000,
      display:'flex', alignItems:'center', justifyContent:'center', padding:20, fontFamily:'var(--font)' }}>
      <div style={{ background:'var(--card)', borderRadius:16, padding:24, maxWidth:390, width:'100%',
        maxHeight:'calc(100dvh - 40px)', overflowY:'auto',
        boxShadow:'0 12px 48px color-mix(in srgb, var(--cc-shadow-base) 45%, transparent)', color:'var(--text)' }}>
        {step === 'method' ? (
          <>
            <h3 style={{ margin:'0 0 8px', fontSize:'1.125rem' }}>How do you want to stream?</h3>
            <p style={{ margin:'0 0 20px', color:'var(--muted)', fontSize:'0.8125rem', lineHeight:1.5 }}>
              Use this device's camera, or connect an existing YouTube Live video from another device.
            </p>
            <fieldset style={{ margin:'0 0 18px', padding:0, border:0 }}>
              <legend style={{ fontSize:'0.75rem', fontWeight:900, marginBottom:8 }}>Who can watch on YouTube?</legend>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                {[['public', 'Public'], ['unlisted', 'Private']].map(([value, label]) => (
                  <label key={value} style={{ display:'flex', alignItems:'center', gap:8, padding:'11px 12px',
                    border:`2px solid ${visibility === value ? 'var(--cc-accent-strong)' : 'var(--border)'}`,
                    borderRadius:10, cursor:'pointer', fontSize:'0.8125rem', fontWeight:800,
                    background:visibility === value ? 'var(--cc-success-soft)' : 'var(--surface)' }}>
                    <input type="radio" name="stream-visibility" value={value}
                      checked={visibility === value} onChange={() => onVisibilityChange(value)} />
                    {label}
                  </label>
                ))}
              </div>
              <p style={{ margin:'7px 0 0', color:'var(--muted)', fontSize:'0.6875rem', lineHeight:1.4 }}>
                Private streams do not appear in the app's public stream list or YouTube search. Anyone who receives the YouTube link can still watch.
              </p>
            </fieldset>
            {isNativeDevice && (
              <fieldset style={{ margin:'0 0 18px', padding:0, border:0 }}>
                <legend style={{ fontSize:'0.75rem', fontWeight:900, marginBottom:8 }}>Camera orientation</legend>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                  {[['portrait', 'Portrait'], ['landscape', 'Landscape']].map(([value, label]) => (
                    <label key={value} style={{ display:'flex', alignItems:'center', gap:8, padding:'11px 12px',
                      border:`2px solid ${orientation === value ? 'var(--cc-accent-strong)' : 'var(--border)'}`,
                      borderRadius:10, cursor:'pointer', fontSize:'0.8125rem', fontWeight:800,
                      background:orientation === value ? 'var(--cc-success-soft)' : 'var(--surface)' }}>
                      <input type="radio" name="stream-orientation" value={value}
                        checked={orientation === value} onChange={() => onOrientationChange(value)} />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            <div style={{ display:'grid', gap:10 }}>
              <button onClick={onThisDevice} style={{ padding:'13px 14px', border:0, borderRadius:10,
                background:'var(--cc-accent-strong)', color:'var(--cc-on-primary)', fontWeight:900, cursor:'pointer' }}>
                {isNativeDevice ? 'Start Stream' : 'Stream from this device'}
              </button>
              <button onClick={onAnotherDevice} style={{ padding:'13px 14px', border:'1px solid var(--border)',
                borderRadius:10, background:'var(--surface)', color:'var(--text)', fontWeight:900, cursor:'pointer' }}>
                Use another device
              </button>
              <button onClick={onCancel} style={{ padding:10, border:0, background:'transparent',
                color:'var(--muted)', fontWeight:700, cursor:'pointer' }}>Cancel</button>
            </div>
          </>
        ) : (
          <form onSubmit={onExternalStart}>
            <h3 style={{ margin:'0 0 8px', fontSize:'1.125rem' }}>Connect YouTube Live</h3>
            <p style={{ margin:'0 0 16px', color:'var(--muted)', fontSize:'0.8125rem', lineHeight:1.5 }}>
              Start the broadcast on the other device, then paste its YouTube video URL below.
            </p>
            <label htmlFor="external-youtube-url" style={{ display:'block', fontSize:'0.75rem', fontWeight:800, marginBottom:6 }}>
              YouTube live video URL
            </label>
            <input id="external-youtube-url" type="url" value={url} onChange={e => onUrlChange(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..." autoFocus required
              style={{ width:'100%', boxSizing:'border-box', border:'1px solid var(--border)', borderRadius:9,
                background:'var(--surface)', color:'var(--text)', padding:'11px 12px', fontSize:'0.875rem' }} />
            {error && <div style={{ color:'var(--cc-danger)', fontSize:'0.75rem', marginTop:8, lineHeight:1.4 }}>{error}</div>}
            <div style={{ display:'flex', gap:10, marginTop:18 }}>
              <button type="button" onClick={onBack} disabled={loading} style={{ flex:1, padding:11,
                border:'1px solid var(--border)', borderRadius:9, background:'transparent', color:'var(--text)',
                fontWeight:800, cursor:'pointer' }}>Back</button>
              <button type="submit" disabled={loading || !url.trim()} style={{ flex:2, padding:11, border:0,
                borderRadius:9, background:'var(--cc-accent-strong)', color:'var(--cc-on-primary)', fontWeight:900,
                opacity:loading || !url.trim() ? 0.65 : 1, cursor:'pointer' }}>
                {loading ? 'Testing URL...' : 'Mark Event Live'}
              </button>
            </div>
          </form>
        )}
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

      if (broadcastStatus === 'live' || streamStatus === 'active') return lastResult;
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
        background:'var(--cc-brand-youtube)', color:'var(--cc-on-primary)',
        fontSize: compact ? '0.65625rem' : '0.75rem', padding: compact ? '5px 10px' : '8px 14px',
        borderRadius:10,
        display:'inline-flex', alignItems:'center', gap:6,
        fontWeight:900, textDecoration:'none',
        boxShadow:'0 2px 8px color-mix(in srgb, var(--cc-danger) 40%, transparent)',
        animation:'ytPulse 2s infinite',
      }}>
      <span style={{ animation:'liveBlink 1s infinite', fontSize:'0.625rem' }}>{LIVE_DOT_ICON}</span>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--cc-on-primary)">
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
      </svg>
      Watch on YouTube
      <style>{`
        @keyframes ytPulse{0%,100%{box-shadow:0 2px 8px color-mix(in srgb, var(--cc-danger) 40%, transparent)}50%{box-shadow:0 2px 20px color-mix(in srgb, var(--cc-danger) 80%, transparent)}}
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
  const [methodStep, setMethodStep] = useState(null);
  const [externalUrl, setExternalUrl] = useState('');
  const [externalError, setExternalError] = useState('');
  const [streamVisibility, setStreamVisibility] = useState('public');
  const [streamOrientation, setStreamOrientation] = useState(() => (
    window.innerWidth > window.innerHeight ? 'landscape' : 'portrait'
  ));

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
    setLoading(true);
    let startedSessionId = null;
    const resumingExisting = !!(event.isLive && event.liveUrl);
    try {
      const eventTitle = [
        event.eventTypeDisplay || event.eventType,
        event.hostName,
        event.eventSubject || ''
      ].filter(Boolean).join(' - ');

      // 1) Get YouTube broadcast + relay session from Cloud Function
      const startRes = resumingExisting
        ? await httpsCallable(functions, 'nativeStreamResume')({
            eventId:event.id,
            sessionId:event.liveUrl,
            directNative: !!streamer.isNativeBridge,
          })
        : await httpsCallable(functions, 'nativeStreamStart')({
            useOAuth:true,
            eventId:event.id,
            eventTitle,
            qualityProfile:streamer.qualityProfile,
            audioMode:streamer.audioMode,
            privacyStatus:streamVisibility,
            protocolVersion:2,
            directNative: !!streamer.isNativeBridge,
          });
      const { wsUrl, watchUrl, sessionId, streamToken, rtmpUrl } = startRes.data;
      startedSessionId = sessionId;

      // 2) Camera is already open (from PreCheckCard) — reuse it
      streamer.onStatus = (msg) => console.log('[NativeStream]', msg);
      streamer.onError  = (msg) => console.error('[NativeStream] error:', msg);

      // 3) Connect WebSocket + start recording → streaming to YouTube
      await streamer.connect(wsUrl, streamToken);
      if (streamer.isNativeBridge) {
        const warmupMs = resumingExisting ? 800 : 1200;
        streamer.onStatus(`Preparing YouTube connection (${Math.round(warmupMs / 1000)}s)...`);
        await sleep(warmupMs);
      }
      await streamer.startRecording(streamer.isNativeBridge ? rtmpUrl : 'OAUTH'); // browser uses relay; Android wrapper streams RTMPS directly

      // 4) Mark the event live and mount StreamCard immediately. YouTube can
      // take 20-30 seconds to report "live" on mobile networks; waiting here
      // left the camera running without a persistent stream frame.
      if (!resumingExisting) await goLive(event.id, sessionId);
      if (watchUrl && streamVisibility !== 'unlisted') {
        await updateDoc(doc(db, 'events', event.id), { liveWatchUrl: watchUrl }).catch(() => {});
      }

      setStreaming(true);
      if (onLiveStarted) onLiveStarted(event, event.id, 'host', null, { streamer, sessionId, watchUrl });
      setShowPreCheck(false);

      // Health verification now runs in the background while StreamCard owns
      // the camera and reconnect UI.
      waitForYouTubeLive(sessionId, msg => console.log('[NativeStream]', msg))
        .then(result => {
          const isYouTubeLive = result?.broadcastStatus === 'live' || result?.streamStatus === 'active';
          const isPrivateStream = streamVisibility === 'unlisted' || event.liveAppVisibility === 'private';
          if (isPrivateStream && isYouTubeLive) {
            httpsCallable(functions, 'sendPrivateStreamLinkEmail')({ sessionId })
              .catch(e => console.warn('[NativeStream] Private stream email failed:', e.message));
          }
        })
        .catch(e => console.warn('[NativeStream] YouTube health check failed:', e.message));

      // 5) Push notification to subscribers (fire-and-forget — doesn't block going live)
      if (!resumingExisting) {
        httpsCallable(functions, 'notifyEventLive')({
          eventId:    event.id,
          eventTitle: event.eventTypeDisplay || event.eventType || 'Event',
          hostName:   event.hostName || '',
        }).catch(e => console.warn('Push failed:', e.message));
      }

    } catch (e) {
      // Streaming failed to start — release the camera that PreCheckCard opened
      if (startedSessionId && !resumingExisting) {
        await httpsCallable(functions, 'nativeStreamEndEvent')({
          eventId: event.id,
          sessionId: startedSessionId,
        }).catch(err => console.warn('[NativeStream] failed start cleanup:', err.message));
      }
      try { streamer?.stop?.(); } catch {}
      setShowPreCheck(false);
      setErrMsg(e.message || 'Could not start stream. Please try again.');
      setPopup('error');
    }
    setLoading(false);
  };

  // PreCheckCard cancelled — just close it, nothing else happened yet
  const handlePreCheckCancel = () => setShowPreCheck(false);

  const startThisDeviceStream = async () => {
    setMethodStep(null);
    if (hasAndroidNativeBridge()) {
      const streamer = new NativeStreamer(
        (msg) => console.log('[NativeStream]', msg),
        (msg) => console.error('[NativeStream] error:', msg),
        () => {}
      );
      streamer.setStreamOrientation(streamOrientation);
      streamer.setAudioMode('natural');
      streamer.setMuted(false);
      streamer.setFacingMode('environment');
      streamer.eventTitle = [
        event?.eventTypeDisplay || event?.eventType,
        event?.hostName,
        event?.eventSubject || ''
      ].filter(Boolean).join(' - ');
      await streamer.detectQuality().catch(() => null);
      streamer.tuneQualityForStream?.();
      startStream(streamer);
      return;
    }
    setShowPreCheck(true);
  };

  const startExternalStream = async (e) => {
    e.preventDefault();
    setLoading(true);
    setExternalError('');
    try {
      const result = await httpsCallable(functions, 'startExternalYouTubeStream')({
        eventId: event.id,
        youtubeUrl: externalUrl.trim(),
        privacyStatus: streamVisibility,
      });
      const watchUrl = result.data?.watchUrl;
      const liveEvent = {
        ...event,
        isLive:true,
        liveUrl:null,
        liveWatchUrl:streamVisibility === 'unlisted' ? null : watchUrl,
        liveSource:'external-youtube',
        liveAppVisibility:streamVisibility === 'unlisted' ? 'private' : 'public',
      };
      setStreaming(true);
      setMethodStep(null);
      onLiveStarted?.(liveEvent, event.id, 'host', watchUrl, { mode:'external', watchUrl });
      httpsCallable(functions, 'notifyEventLive')({
        eventId:event.id,
        eventTitle:event.eventTypeDisplay || event.eventType || 'Event',
        hostName:event.hostName || '',
      }).catch(err => console.warn('Push failed:', err.message));
    } catch (err) {
      setExternalError(err.message || 'This YouTube URL could not be verified. Check that the video is available and try again.');
    } finally {
      setLoading(false);
    }
  };


  // When event is live (set by another device/admin)
  if (event.isLive && !streaming) {
    const isExternal = event.liveSource === 'external-youtube';
    return (
      <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
        <span style={{ fontSize:'0.6875rem', fontWeight:900, color:'var(--cc-accent-strong)',
          display:'flex', alignItems:'center', gap:5 }}>
          <span style={{ animation:'liveBlink 1s infinite' }}>{LIVE_DOT_ICON}</span> LIVE NOW
        </span>
        <button onClick={() => {
          if (isExternal) {
            onLiveStarted?.(event, event.id, 'host', event.liveWatchUrl, { mode:'external', watchUrl:event.liveWatchUrl });
          } else if (hasAndroidNativeBridge()) {
            startThisDeviceStream();
          } else {
            setShowPreCheck(true);
          }
        }} disabled={loading}
          style={{ fontSize:'0.6875rem', padding:'5px 9px', borderRadius:8,
            background:'var(--cc-warning-soft)', color:'var(--cc-warning-strong)', border:'1px solid var(--cc-warning)',
            fontWeight:900, cursor:'pointer' }}>
          {isExternal ? 'Manage Live' : (loading ? 'Resuming...' : 'Resume Stream')}
        </button>
        {!isExternal && showPreCheck && (
          <PreCheckCard event={event} onConfirm={startStream} onCancel={handlePreCheckCancel} />
        )}
        <style>{`@keyframes liveBlink{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
      </div>
    );
  }

  // When this device is streaming — stream lives in App-level StreamCard
  if (streaming) {
    return (
      <>
        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          <span style={{ fontSize:'0.6875rem', fontWeight:900, color:'var(--cc-accent-strong)',
            display:'flex', alignItems:'center', gap:5 }}>
            <span style={{ animation:'liveBlink 1s infinite' }}>{LIVE_DOT_ICON}</span> LIVE NOW
          </span>
          <span style={{ fontSize:'0.6875rem', color:'var(--muted)' }}>
            Stream window is open
          </span>
        </div>
        <style>{`@keyframes liveBlink{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
      </>
    );
  }

  // Default — Go Live button
  return (
    <>
      <button onClick={() => setMethodStep('method')} disabled={loading}
        style={{ background:'var(--cc-danger)', fontSize:'0.75rem', padding:'8px 14px',
          borderRadius:10, display:'flex', alignItems:'center', gap:6,
          boxShadow:'0 2px 8px color-mix(in srgb, var(--cc-danger) 35%, transparent)', cursor:'pointer',
          fontWeight:900, color:'var(--cc-on-primary)', border:'none' }}>
        <span>{LIVE_DOT_ICON}</span>
        {loading ? 'Starting...' : 'Go Live'}
      </button>

      {methodStep && (
        <StreamMethodDialog
          step={methodStep}
          url={externalUrl}
          error={externalError}
          loading={loading}
          visibility={streamVisibility}
          orientation={streamOrientation}
          isNativeDevice={hasAndroidNativeBridge()}
          onVisibilityChange={setStreamVisibility}
          onOrientationChange={setStreamOrientation}
          onUrlChange={value => { setExternalUrl(value); setExternalError(''); }}
          onThisDevice={startThisDeviceStream}
          onAnotherDevice={() => { setExternalError(''); setMethodStep('external'); }}
          onBack={() => { setExternalError(''); setMethodStep('method'); }}
          onCancel={() => { setExternalError(''); setMethodStep(null); }}
          onExternalStart={startExternalStream}
        />
      )}

      {showPreCheck && (
        <PreCheckCard event={event}
          onConfirm={startStream}
          onCancel={handlePreCheckCancel} />
      )}

      {popup === 'error' && (
        <Popup icon={WARNING_ICON} title="Could Not Start"
          message={errMsg} confirmLabel="OK" infoOnly
          onClose={() => setPopup(null)} />
      )}
    </>
  );
}

// ── Watch Live button (viewers — shows YouTube button when live) ─────────────
export function WatchLiveButton({ event, isGuest, onWatchStarted, compact }) {
  if (!event.isLive || isGuest) return null;
  if (event.liveAppVisibility === 'private' || !event.liveWatchUrl) return null;
  return <YouTubeWatchButton event={event} compact={compact} />;
}
