import React, { useState, useRef, useEffect, useCallback } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';

const APP_URL = 'https://communityevents.siza.info';

function buildShareMessage(event, isGuest, user, profile) {
  const displayType  = event.eventTypeDisplay || event.eventType || '';
  const isCentre     = event.organiserType === 'centre';
  const isOwner      = user?.uid && event.createdByUserId === user.uid;
  const isAdmin      = profile?.role === 'admin' || profile?.role === 'superAdmin';
  const showFull     = isCentre || isOwner || isAdmin;
  const isReligious  = ['Majlis','Milad','Custom'].includes(event.eventType);
  const title        = event.eventSubject ? `${displayType} — ${event.eventSubject}` : displayType;
  const fmtDate      = d => { try { return new Date(d+'T00:00:00').toLocaleDateString('en-AU',{weekday:'long',day:'numeric',month:'short',year:'numeric'}); } catch { return d; }};
  const fullAddr     = event.address?.fullAddress || [event.address?.street,event.address?.suburb,event.address?.state,event.address?.postcode].filter(Boolean).join(', ');
  const suburbAddr   = [event.address?.suburb,event.address?.state].filter(Boolean).join(', ');
  const lines = ['📅 *Community Event*','',`*${title}*`,`🗓 ${fmtDate(event.eventDate)}${event.hijriDate?' · '+event.hijriDate:''}`,event.endTime?`⏰ ${event.startTime} – ${event.endTime}`:`⏰ ${event.startTime}`];
  if (showFull ? fullAddr : suburbAddr) lines.push(`📍 ${showFull ? fullAddr : suburbAddr}`);
  lines.push(`👥 ${event.audienceType} · ${isCentre?'🏛 Centre':'🔒 Private'}`);
  if (event.hostName) lines.push(`👤 Host: ${event.hostName}`);
  if (showFull && event.hostPhone) lines.push(`📞 ${event.hostPhone}`);
  if (!showFull) lines.push('ℹ️ Full address available in the app (login required)');
  if (isReligious && event.speakerName) lines.push(`🎤 Speaker: ${event.speakerName}`);
  if (isReligious) { const r=(event.reciters||[]).filter(x=>x.name); if(r.length) lines.push(`📿 ${r.map(x=>x.type+': '+x.name).join(' · ')}`); }
  lines.push('','🔗 View all community events:',APP_URL,'','_Shared via Community Events app_');
  return lines.join('\n');
}

function shareEvent(event, isGuest, user, profile) {
  const msg = buildShareMessage(event, isGuest, user, profile);
  if (navigator.share) { navigator.share({ title:'Community Event', text:msg }).catch(()=>{}); return; }
  const encoded = encodeURIComponent(msg);
  const isMobile = /android|iphone|ipad/.test(navigator.userAgent.toLowerCase());
  if (isMobile && window.__showShareSheet) { window.__showShareSheet(msg); }
  else if (isMobile) { window.open(`https://wa.me/?text=${encoded}`,'_blank'); }
  else { navigator.clipboard.writeText(msg).then(()=>{ window.showToast&&window.showToast('Event details copied!','success'); }); }
}

function openDirections(address, lat, lng) {
  const isIOS = /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());
  const dest  = (lat&&lng) ? `${lat},${lng}` : encodeURIComponent(address);
  if (isIOS) window.open(`maps://maps.apple.com/?daddr=${dest}`,'_blank');
  else       window.open(`https://www.google.com/maps/dir/?api=1&destination=${dest}`,'_blank');
}
import { getApp } from 'firebase/app';
import { RELIGIOUS_EVENT_TYPES } from '../utils/constants';
import { canDeleteEvent, canEditEvent } from '../utils/permissions';

export default function AISearch({ events, user, profile, setPage, setEditingEvent, handleDelete, handleCopy, isGuest = false }) {
  const [messages, setMessages] = useState([
    { role: 'agent', text: 'Hi! Ask me anything about community events — try "Show me Majlis this weekend" or "Any ladies only events in Auburn?"' }
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy]       = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceSupported]          = useState(() => 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
  const recognitionRef            = useRef(null);
  const bottomRef                 = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const replaceLastMsg = update =>
    setMessages(prev => prev.map((m, i) => i === prev.length - 1 ? { ...m, ...update } : m));

  const startVoice = useCallback(() => {
    if (!voiceSupported) {
      window.showToast('Voice search is not supported on this browser. Try Chrome on Android or Safari on iPhone.', 'info');
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang            = 'en-AU';
    rec.interimResults  = true;
    rec.maxAlternatives = 1;
    rec.continuous      = false;

    rec.onstart = () => setListening(true);

    rec.onresult = e => {
      const transcript = Array.from(e.results)
        .map(r => r[0].transcript)
        .join('');
      setInput(transcript);
      // Auto-send when speech is final
      if (e.results[e.results.length - 1].isFinal) {
        setListening(false);
      }
    };

    rec.onerror = err => {
      console.warn('Speech error:', err.error);
      setListening(false);
      if (err.error === 'not-allowed') {
        window.showToast('Microphone access was denied. Please allow microphone access in your browser settings.', 'warning');
      }
    };

    rec.onend = () => setListening(false);

    recognitionRef.current = rec;
    rec.start();
  }, [voiceSupported, listening]);

  // Auto-send after voice input finalises
  useEffect(() => {
    if (!listening && input.trim() && !busy) {
      // Small delay so user can see what was captured before sending
      const t = setTimeout(() => send(), 800);
      return () => clearTimeout(t);
    }
  }, [listening]);

  const send = async () => {
    const q = input.trim();
    if (!q || busy) return;
    setBusy(true);
    setInput('');

    setMessages(prev => [
      ...prev,
      { role: 'user', text: q },
      { role: 'agent', text: '__typing__' }
    ]);

    try {
      const fns = getFunctions(getApp(), 'australia-southeast1');
      const fn  = httpsCallable(fns, 'aiEventSearch', { timeout: 30000 });
      // For guests, don't send sensitive fields to AI — suburb only for location matching
      const result = await fn({ query: q, isGuest });
      const { matchedIds = [], summary = '' } = result.data || {};
      const matched = matchedIds.map(id => events.find(e => e.id === id)).filter(Boolean);
      replaceLastMsg({ text: summary || 'Search complete.', matched });
    } catch (err) {
      // Firebase callable errors: err.code = 'functions/internal', err.message = 'internal'
      // The real detail is in err.details or the function logs
      const code    = err?.code    || '';
      const message = err?.message || '';

      let display = '';

      if (code === 'functions/not-found' || code === 'functions/unimplemented') {
        display = '⚠️ AI Search function not deployed. Run: firebase deploy --only functions';
      } else if (code === 'functions/unauthenticated') {
        display = '⚠️ Please log in to use AI Search.';
      } else if (message && message !== 'internal' && message !== 'INTERNAL') {
        // HttpsError passes the real message through
        display = `⚠️ ${message}`;
      } else {
        display = `⚠️ AI Search error (${code}). Check Firebase logs: firebase functions:log --only aiEventSearch`;
      }

      replaceLastMsg({ text: display });
    }
    setBusy(false);
  };

  const fmtDate = d => new Date(d + 'T00:00:00').toLocaleDateString('en-AU', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
  });

  const typeColor = t => {
    if (t === 'Majlis')   return 'var(--teal)';
    if (t === 'Milad')    return '#059669';
    if (t === 'Birthday') return '#d97706';
    return 'var(--muted)';
  };

  const suggestions = [
    'Show me all Majlis this weekend',
    'Show me all the Majlis in Austral this weekend',
    'Gents only events next week',
  ];


  return (
    <div style={{ margin: '0 16px 16px' }}>
      <div style={{
        background: 'var(--card,white)', border: '1px solid var(--border)',
        borderRadius: 20, overflow: 'hidden',
        boxShadow: '0 8px 22px rgba(15,118,110,.08)'
      }}>

        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg,var(--teal),var(--teal-dark))',
          padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            background: 'rgba(255,255,255,.18)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, color: 'white', flexShrink: 0
          }}>✦</div>
          <div>
            <div style={{ color: 'white', fontWeight: 800, fontSize: 15 }}>Event AI Agent</div>
            <div style={{ color: 'rgba(255,255,255,.8)', fontSize: 12 }}>Ask me anything about community events</div>
          </div>
        </div>

        {/* Messages */}
        <div style={{ padding: 16, minHeight: 240, maxHeight: 420, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {messages.map((m, i) => (
            <div key={i} style={{
              display: 'flex',
              flexDirection: m.role === 'user' ? 'row-reverse' : 'row',
              gap: 8, alignItems: 'flex-start'
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                background: m.role === 'agent' ? 'var(--teal)' : 'var(--border,#e5e7eb)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, color: m.role === 'agent' ? 'white' : 'var(--text,#374151)', fontWeight: 700
              }}>{m.role === 'agent' ? '✦' : 'U'}</div>

              <div style={{
                maxWidth: '82%',
                background: m.role === 'user' ? 'var(--teal-l,#e6f4f1)' : 'var(--bg,#f9fafb)',
                color: m.role === 'user' ? 'var(--teal-dark)' : 'var(--text)',
                borderRadius: m.role === 'agent' ? '4px 16px 16px 16px' : '16px 4px 16px 16px',
                padding: '10px 14px', fontSize: 14, lineHeight: 1.6
              }}>
                {/* Typing dots */}
                {m.text === '__typing__' && (
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '4px 0' }}>
                    {[0, 0.2, 0.4].map((d, j) => (
                      <div key={j} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--muted)', animation: `dot 1.2s ${d}s infinite` }} />
                    ))}
                  </div>
                )}

                {/* Message text — preserve newlines */}
                {m.text && m.text !== '__typing__' && (
                  <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{m.text}</p>
                )}

                {/* Moon sighting notice on results */}
                {m.matched && m.matched.length > 0 && (
                  <div style={{
                    background: 'var(--teal-l,#fef3c7)', border: '1px solid var(--teal,#f59e0b)',
                    borderRadius: 10, padding: '8px 12px',
                    display: 'flex', gap: 8, alignItems: 'flex-start',
                    marginTop: 8
                  }}>
                    <span style={{ fontSize: 14, flexShrink: 0 }}>🌙</span>
                    <p style={{ margin: 0, fontSize: 11, color: 'var(--text)', lineHeight: 1.5 }}>
                      <strong>Moon sighting notice:</strong> Dates in the next Hijri month
                      may change subject to moon sighting confirmation.
                    </p>
                  </div>
                )}

                {/* Event result cards */}
                {m.matched && m.matched.length > 0 && (
                  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {m.matched.map(e => {
                      const addr = e.address?.fullAddress || `${e.address?.suburb || ''} ${e.address?.state || ''}`.trim();
                      const reciters = (e.reciters || []).filter(r => r.name).map(r => `${r.type}: ${r.name}`).join(' · ');
                      const showReligious = RELIGIOUS_EVENT_TYPES.includes(e.eventType);
                      return (
                        <div key={e.id} style={{ background: 'var(--card,white)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 12px' }}>
                          <div style={{ marginBottom: 6 }}>
                            <span style={{ background: typeColor(e.eventType) + '20', color: typeColor(e.eventType), fontSize: 11, fontWeight: 800, padding: '3px 8px', borderRadius: 99 }}>{e.eventType}</span>
                            {e.audienceType && <span style={{ background: 'var(--teal-l,#f3f4f6)', color: 'var(--muted)', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 99, marginLeft: 5 }}>{e.audienceType}</span>}
                          </div>
                          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 3 }}>{e.hostName}</div>
                          <div style={{ color: 'var(--muted)', fontSize: 13 }}>{fmtDate(e.eventDate)} · {e.startTime}</div>
                          <div style={{ color: 'var(--muted)', fontSize: 13 }}>
                            {isGuest
                              ? (e.address?.suburb ? `${e.address.suburb}${e.address.state ? ', ' + e.address.state : ''}` : '')
                              : addr}
                          </div>
                          {!isGuest && e.hostPhone && (
                            <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 2 }}>📞 {e.hostPhone}</div>
                          )}
                          {showReligious && e.speakerName && <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>Speaker: {e.speakerName}</div>}
                          {showReligious && reciters && <div style={{ color: 'var(--muted)', fontSize: 12 }}>{reciters}</div>}
                          {/* Guest masked fields */}
                          {isGuest && e.address?.suburb && (
                            <div style={{ fontSize: 12, color: 'var(--teal)', background: 'var(--teal-l,#fffbeb)', padding: '5px 8px', borderRadius: 8, marginTop: 4 }}>
                              🔒 Login to see full address & phone
                            </div>
                          )}
                          <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {/* Edit / Delete — logged in users only */}
                            {!isGuest && canEditEvent(profile, e, user?.uid) && (
                              <button className="btn-light" style={{ fontSize: 12, padding: '5px 10px' }}
                                onClick={() => { setEditingEvent(e); setPage('edit'); }}>Edit</button>
                            )}
                            {!isGuest && canDeleteEvent(profile, e, user?.uid) && (
                              <button className="btn-danger" style={{ fontSize: 12, padding: '5px 10px' }}
                                onClick={() => handleDelete(e.id)}>Delete</button>
                            )}

                            {/* Share — logged-in: all events | guest: centre events only */}
                            {(!isGuest || e.organiserType === 'centre') && (
                              <button className="btn-light" style={{ fontSize: 12, padding: '5px 10px' }}
                                onClick={() => shareEvent(e, isGuest, user, profile)}>
                                📤 Share
                              </button>
                            )}

                            {/* Directions — logged-in: all events | guest: centre events only */}
                            {(!isGuest || e.organiserType === 'centre') && addr && (
                              <button className="btn-light" style={{ fontSize: 12, padding: '5px 10px' }}
                                onClick={() => openDirections(addr, e.address?.latitude, e.address?.longitude)}>
                                🗺 Directions
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Suggestions */}
        <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', background: 'var(--bg,#f9fafb)', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {suggestions.map(s => (
            <button key={s}
              style={{ fontSize: 12, padding: '5px 10px', border: '1px solid var(--border)', borderRadius: 99, background: 'var(--card,white)', color: 'var(--text)', cursor: 'pointer' }}
              onClick={() => setInput(s)}>{s}</button>
          ))}
        </div>

        {/* Input */}
        <div style={{ display: 'flex', gap: 8, padding: '12px 14px', borderTop: '1px solid var(--border)' }}>
          <input
            style={{
              flex: 1, padding: '10px 14px', fontSize: 14,
              border: listening ? '1.5px solid #dc2626' : '1px solid var(--border)',
              borderRadius: 12, background: 'var(--card,white)',
              color: 'var(--text)'
            }}
            placeholder={listening ? '🎤 Listening… speak now' : 'e.g. "Majlis this Friday in Auburn"'}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send()}
          />
          {/* Mic button — always visible */}
          <button
            onClick={startVoice}
            title={listening ? 'Stop listening' : 'Voice search'}
            style={{
              padding: '10px 12px', fontSize: 20,
              borderRadius: 12, border: '1px solid var(--border,#e5e7eb)',
              background: listening ? '#fee2e2' : '#fff0ee',
              color: listening ? '#dc2626' : '#c0392b',
              cursor: 'pointer', flexShrink: 0,
              boxShadow: 'none',
              animation: listening ? 'pulse-mic 1s infinite' : 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
            {listening
              ? <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
              : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="2" width="6" height="12" rx="3"/>
                  <path d="M5 10a7 7 0 0 0 14 0"/>
                  <line x1="12" y1="19" x2="12" y2="22"/>
                  <line x1="9" y1="22" x2="15" y2="22"/>
                </svg>}
          </button>

          <button onClick={send} disabled={busy || !input.trim()}
            style={{ padding: '10px 18px', fontWeight: 800, fontSize: 13, borderRadius: 12, border: 'none', background: busy || !input.trim() ? 'var(--border,#e5e7eb)' : 'var(--teal)', color: busy || !input.trim() ? 'var(--muted)' : 'white', cursor: busy || !input.trim() ? 'not-allowed' : 'pointer' }}>
            {busy ? '...' : 'Ask ↗'}
          </button>
        </div>
      </div>
      <style>{`
        @keyframes dot { 0%,80%,100%{opacity:.3} 40%{opacity:1} }
        @keyframes pulse-mic { 0%,100%{transform:scale(1)} 50%{transform:scale(1.15)} }
      `}</style>
    </div>
  );
}
