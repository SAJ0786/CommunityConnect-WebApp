import React, { useState, useRef, useEffect, useCallback } from 'react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { STORE_SHARE_LINES } from '../utils/storeLinks';


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
  if (isReligious) { const r=(event.reciters||[]).filter(x=>x.name); if(r.length) lines.push(`📿 ${r.map(x=>(x.customType||x.type||'Reciter')+': '+x.name).join(' · ')}`); }
  if (event.notes?.trim()) lines.push(`📝 Notes: ${event.notes.trim()}`);
  lines.push('', ...STORE_SHARE_LINES, '', '_Shared via Community Events app_');
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
  const url = isIOS
    ? `https://maps.apple.com/?daddr=${dest}&dirflg=d`
    : `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
  window.location.assign(url);
}
import { getApp } from 'firebase/app';
import { db } from '../firebase/firebase';
import { RELIGIOUS_EVENT_TYPES } from '../utils/constants';
import { canDeleteEvent, canEditEvent } from '../utils/permissions';

export default function AISearch({ events, user, profile, setPage, setEditingEvent, handleDelete, handleCopy, isGuest = false }) {
  const [messages, setMessages] = useState([
    { role: 'agent', text: 'Hi! Ask me anything about community events — try "Show me Majlis this weekend" or "Any ladies only events in Auburn?"' }
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy]       = useState(false);
  const [listening, setListening] = useState(false);
  const [reportTarget, setReportTarget] = useState(null);
  const [reportReason, setReportReason] = useState('');
  const [reportComments, setReportComments] = useState('');
  const [reportSaving, setReportSaving] = useState(false);
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
      { role: 'agent', text: '__typing__', prompt: q }
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

  const openReport = (message, index) => {
    setReportTarget({ ...message, index });
    setReportReason('');
    setReportComments('');
  };

  const submitReport = async () => {
    if (!reportTarget || reportSaving) return;
    if (!reportReason) {
      window.showToast?.('Please select a report reason.', 'warning');
      return;
    }
    setReportSaving(true);
    try {
      await addDoc(collection(db, 'ai_reports'), {
        userId: user?.uid || 'guest',
        userEmail: profile?.email || user?.email || '',
        userRole: profile?.role || (isGuest ? 'guest' : ''),
        prompt: reportTarget.prompt || '',
        aiResponse: reportTarget.text || '',
        reason: reportReason,
        comments: reportComments.trim(),
        page: 'ai-search',
        appVersion: typeof __APP_BUILD_TIME__ !== 'undefined' ? String(__APP_BUILD_TIME__) : '',
        userAgent: navigator.userAgent || '',
        createdAt: serverTimestamp(),
      });
      setReportTarget(null);
      setReportReason('');
      setReportComments('');
      window.showToast?.('Thank you. Your report has been submitted and will be reviewed.', 'success');
    } catch (e) {
      console.error('AI report failed:', e);
      window.showToast?.('Could not submit report. Please try again.', 'error');
    }
    setReportSaving(false);
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
    <div className="ai-search-page" style={{ margin: '0 16px 16px' }}>
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
            fontSize: '1.25rem', color: 'white', flexShrink: 0
          }}>✦</div>
          <div>
            <div style={{ color: 'white', fontWeight: 800, fontSize: '0.9375rem' }}>Event AI Agent</div>
            <div style={{ color: 'rgba(255,255,255,.8)', fontSize: '0.75rem' }}>Ask me anything about community events</div>
          </div>
        </div>

        {/* Messages */}
        <div className="ai-search-messages" style={{ padding: 16, minHeight: 240, maxHeight: 420, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
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
                fontSize: '0.75rem', color: m.role === 'agent' ? 'white' : 'var(--text,#374151)', fontWeight: 700
              }}>{m.role === 'agent' ? '✦' : 'U'}</div>

              <div style={{
                maxWidth: '82%',
                background: m.role === 'user' ? 'var(--teal-l,#e6f4f1)' : 'var(--bg,#f9fafb)',
                color: m.role === 'user' ? 'var(--teal-dark)' : 'var(--text)',
                borderRadius: m.role === 'agent' ? '4px 16px 16px 16px' : '16px 4px 16px 16px',
                padding: '10px 14px', fontSize: '0.875rem', lineHeight: 1.6
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

                {m.role === 'agent' && m.text && m.text !== '__typing__' && i > 0 && (
                  <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
                    <button className="btn-light"
                      style={{ fontSize: '0.6875rem', padding: '4px 8px', borderRadius: 8 }}
                      onClick={() => openReport(m, i)}>
                      Report AI Response
                    </button>
                  </div>
                )}

                {/* Moon sighting notice on results */}
                {m.matched && m.matched.length > 0 && (
                  <div style={{
                    background: 'var(--teal-l,#fef3c7)', border: '1px solid var(--teal,#f59e0b)',
                    borderRadius: 10, padding: '8px 12px',
                    display: 'flex', gap: 8, alignItems: 'flex-start',
                    marginTop: 8
                  }}>
                    <span style={{ fontSize: '0.875rem', flexShrink: 0 }}>🌙</span>
                    <p style={{ margin: 0, fontSize: '0.6875rem', color: 'var(--text)', lineHeight: 1.5 }}>
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
                            <span style={{ background: typeColor(e.eventType) + '20', color: typeColor(e.eventType), fontSize: '0.6875rem', fontWeight: 800, padding: '3px 8px', borderRadius: 99 }}>{e.eventType}</span>
                            {e.audienceType && <span style={{ background: 'var(--teal-l,#f3f4f6)', color: 'var(--muted)', fontSize: '0.6875rem', fontWeight: 700, padding: '3px 8px', borderRadius: 99, marginLeft: 5 }}>{e.audienceType}</span>}
                          </div>
                          <div style={{ fontWeight: 800, fontSize: '0.875rem', marginBottom: 3 }}>{e.hostName}</div>
                          <div style={{ color: 'var(--muted)', fontSize: '0.8125rem' }}>{fmtDate(e.eventDate)} · {e.startTime}</div>
                          <div style={{ color: 'var(--muted)', fontSize: '0.8125rem' }}>
                            {isGuest
                              ? (e.address?.suburb ? `${e.address.suburb}${e.address.state ? ', ' + e.address.state : ''}` : '')
                              : addr}
                          </div>
                          {!isGuest && e.hostPhone && (
                            <div style={{ color: 'var(--muted)', fontSize: '0.75rem', marginTop: 2 }}>📞 {e.hostPhone}</div>
                          )}
                          {showReligious && e.speakerName && <div style={{ color: 'var(--muted)', fontSize: '0.75rem', marginTop: 4 }}>Speaker: {e.speakerName}</div>}
                          {showReligious && reciters && <div style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>{reciters}</div>}
                          {/* Guest masked fields */}
                          {isGuest && e.address?.suburb && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--teal)', background: 'var(--teal-l,#fffbeb)', padding: '5px 8px', borderRadius: 8, marginTop: 4 }}>
                              🔒 Login to see full address & phone
                            </div>
                          )}
                          <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {/* Edit / Delete — logged in users only */}
                            {!isGuest && canEditEvent(profile, e, user?.uid) && (
                              <button className="btn-light" style={{ fontSize: '0.75rem', padding: '5px 10px' }}
                                onClick={() => { setEditingEvent(e); setPage('edit'); }}>Edit</button>
                            )}
                            {!isGuest && canDeleteEvent(profile, e, user?.uid) && (
                              <button className="btn-danger" style={{ fontSize: '0.75rem', padding: '5px 10px' }}
                                onClick={() => handleDelete(e.id)}>Delete</button>
                            )}

                            {/* Share — logged-in: all events | guest: centre events only */}
                            {(!isGuest || e.organiserType === 'centre') && (
                              <button className="btn-light" style={{ fontSize: '0.75rem', padding: '5px 10px' }}
                                onClick={() => shareEvent(e, isGuest, user, profile)}>
                                📤 Share
                              </button>
                            )}

                            {/* Directions — logged-in: all events | guest: centre events only */}
                            {(!isGuest || e.organiserType === 'centre') && addr && (
                              <button className="btn-light" style={{ fontSize: '0.75rem', padding: '5px 10px' }}
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
              style={{ fontSize: '0.75rem', padding: '5px 10px', border: '1px solid var(--border)', borderRadius: 99, background: 'var(--card,white)', color: 'var(--text)', cursor: 'pointer' }}
              onClick={() => setInput(s)}>{s}</button>
          ))}
        </div>

        {/* Input */}
        <div style={{ display: 'flex', gap: 8, padding: '12px 14px', borderTop: '1px solid var(--border)' }}>
          <input
            style={{
              flex: 1, padding: '10px 14px', fontSize: '0.875rem',
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
              padding: '10px 12px', fontSize: '1.25rem',
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
            style={{ padding: '10px 18px', fontWeight: 800, fontSize: '0.8125rem', borderRadius: 12, border: 'none', background: busy || !input.trim() ? 'var(--border,#e5e7eb)' : 'var(--teal)', color: busy || !input.trim() ? 'var(--muted)' : 'white', cursor: busy || !input.trim() ? 'not-allowed' : 'pointer' }}>
            {busy ? '...' : 'Ask ↗'}
          </button>
        </div>
      </div>
      {reportTarget && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,0.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}>
          <div style={{
            background: 'var(--card,white)', borderRadius: 18, border: '1px solid var(--border)',
            width: '100%', maxWidth: 420, padding: 20, boxShadow: '0 20px 60px rgba(0,0,0,.3)',
          }}>
            <h3 style={{ margin: '0 0 6px', color: 'var(--text)' }}>Report AI Response</h3>
            <p style={{ margin: '0 0 14px', color: 'var(--muted)', fontSize: '0.8125rem', lineHeight: 1.5 }}>
              Tell us what was wrong with this AI-generated response.
            </p>

            {[
              'Offensive or inappropriate',
              'Incorrect information',
              'Unsafe advice',
              'Spam or misleading',
              'Other',
            ].map(reason => (
              <label key={reason} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, fontSize: '0.875rem' }}>
                <input type="radio" name="ai-report-reason" value={reason}
                  checked={reportReason === reason}
                  onChange={e => setReportReason(e.target.value)}
                  style={{ width: 'auto' }} />
                {reason}
              </label>
            ))}

            <label style={{ display: 'block', marginTop: 12, marginBottom: 6, fontWeight: 700, fontSize: '0.8125rem' }}>
              Additional comments
            </label>
            <textarea value={reportComments}
              onChange={e => setReportComments(e.target.value)}
              placeholder="Optional details"
              rows={4}
              style={{
                width: '100%', resize: 'vertical', border: '1px solid var(--border)',
                borderRadius: 10, padding: 10, fontFamily: 'inherit', fontSize: '0.8125rem',
              }} />

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn-light" disabled={reportSaving}
                onClick={() => setReportTarget(null)}>
                Cancel
              </button>
              <button disabled={reportSaving || !reportReason}
                onClick={submitReport}>
                {reportSaving ? 'Submitting...' : 'Submit Report'}
              </button>
            </div>
          </div>
        </div>
      )}
      <style>{`
        @keyframes dot { 0%,80%,100%{opacity:.3} 40%{opacity:1} }
        @keyframes pulse-mic { 0%,100%{transform:scale(1)} 50%{transform:scale(1.15)} }
      `}</style>
    </div>
  );
}
