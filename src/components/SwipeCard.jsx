import React, { useState, useRef, useCallback } from 'react';
import { STORE_SHARE_LINES } from '../utils/storeLinks';

// ── SVG Icons ────────────────────────────────────────────────────────────────
const WaIcon = ({ size = 24, color = 'var(--cc-on-primary)' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.37 5.07L2 22l5.09-1.34A9.94 9.94 0 0012 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm0 18c-1.66 0-3.22-.46-4.55-1.26l-.32-.19-3.03.8.81-2.96-.21-.34A7.96 7.96 0 014 12c0-4.42 3.58-8 8-8s8 3.58 8 8-3.58 8-8 8zm4.45-5.95c-.24-.12-1.43-.7-1.65-.78-.22-.08-.38-.12-.54.12-.16.24-.62.78-.76.94-.14.16-.28.18-.52.06-.24-.12-1.01-.37-1.92-1.18-.71-.63-1.19-1.41-1.33-1.65-.14-.24-.01-.37.1-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78-.19-.47-.39-.4-.54-.41h-.46c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.69 2.58 4.1 3.62.57.25 1.02.39 1.37.5.57.18 1.09.16 1.5.1.46-.07 1.43-.58 1.63-1.15.2-.57.2-1.06.14-1.15-.06-.1-.22-.16-.46-.28z"/>
  </svg>
);

const MapIcon = ({ size = 24, color = 'var(--cc-on-primary)' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
  </svg>
);

const ChevL = ({ color = 'var(--cc-on-primary)' }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6"/>
  </svg>
);

const ChevR = ({ color = 'var(--cc-on-primary)' }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6"/>
  </svg>
);

// ── Card content ─────────────────────────────────────────────────────────────
function CardContent({ e, isGuest }) {
  const a = e.address || {};
  const isPrivate = e.organiserType === 'private';
  const addr = isGuest || isPrivate
    ? `${a.suburb || ''}${a.state ? ', ' + a.state : ''}`
    : (a.fullAddress || [a.street, a.suburb, a.state, a.postcode].filter(Boolean).join(', '));
  const fmtD = d => {
    try { return new Date(d + 'T00:00:00').toLocaleDateString('en-AU', { weekday:'long', day:'numeric', month:'long', year:'numeric' }); }
    catch { return d; }
  };
  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column' }}>
      {/* Red top strip */}
      <div style={{ height:5, background:'var(--red,var(--cc-accent-strong))', flexShrink:0 }} />
      <div style={{ padding:'16px 18px', flex:1, overflowY:'auto' }}>
        {/* Badges */}
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:10 }}>
          <span style={{ background:'var(--red-l,var(--cc-accent-soft))', color:'var(--red,var(--cc-accent-strong))',
            fontSize:'0.6875rem', padding:'3px 10px', borderRadius:99, fontWeight:800, fontFamily:'var(--font)' }}>
            {e.eventTypeDisplay || e.eventType}
          </span>
          <span style={{
            background: isPrivate ? 'var(--cc-accent-soft)' : 'var(--red-l,var(--cc-accent-soft))',
            color: isPrivate ? 'var(--cc-success)' : 'var(--red,var(--cc-accent-strong))',
            fontSize:'0.6875rem', padding:'3px 10px', borderRadius:99, fontWeight:800, fontFamily:'var(--font)' }}>
            {isPrivate ? '🔒 Private' : '🏛 Centre'}
          </span>
          {e.hijriDate && (
            <span style={{ background:'var(--cc-warning-soft)', color:'var(--cc-warning-strong)',
              fontSize:'0.6875rem', padding:'3px 10px', borderRadius:99, fontWeight:800, fontFamily:'var(--font)' }}>
              🌙 {e.hijriDate}
            </span>
          )}
        </div>
        {/* Title */}
        <h2 style={{ margin:'0 0 4px', fontSize:'1.125rem', fontWeight:900, color:'var(--text,var(--cc-heading))',
          lineHeight:1.25, fontFamily:'var(--font)' }}>
          {e.eventTypeDisplay || e.eventType} Programme
        </h2>
        <p style={{ margin:'0 0 14px', fontSize:'0.8125rem', color:'var(--muted)', fontWeight:600, fontFamily:'var(--font)' }}>
          🏠 {e.hostName}
        </p>
        {/* Detail rows */}
        <div style={{ display:'flex', flexDirection:'column', gap:9 }}>
          {[
            { icon:'📅', text: fmtD(e.eventDate) },
            { icon:'⏰', text: `${e.startTime}${e.endTime ? ' – ' + e.endTime : ''}` },
            { icon:'📍', text: addr, sub: (isGuest || isPrivate)
                ? (isGuest ? 'Login for full address' : 'Contact host for full address')
                : null },
            e.audienceType && { icon:'👥', text: e.audienceType },
            e.speakerName  && { icon:'🎤', text: e.speakerName  },
            ...(e.reciters||[]).filter(r=>r.name).map(r => ({ icon:'🎙️', text: r.name, sub: r.customType || r.type })),
          ].filter(Boolean).map((row, i) => (
            <div key={i} style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
              <span style={{ fontSize:'1rem', flexShrink:0, marginTop:1 }}>{row.icon}</span>
              <div>
                <div style={{ fontSize:'0.8125rem', color:'var(--text)', fontWeight:600, lineHeight:1.4, fontFamily:'var(--font)' }}>
                  {row.text}
                </div>
                {row.sub && <div style={{ fontSize:'0.6875rem', color:'var(--muted)', marginTop:1, fontWeight:600, fontFamily:'var(--font)' }}>{row.sub}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main SwipeCards component ────────────────────────────────────────────────
export default function SwipeCards({ events, isGuest, savedIds, onSaveToggle }) {
  const [index,    setIndex]    = useState(0);
  const [offset,   setOffset]   = useState(0);
  const [dragging, setDragging] = useState(false);
  const [animDir,  setAnimDir]  = useState(null);
  const startX   = useRef(null);
  const animating = useRef(false);

  const total = events.length;
  const cur   = events[index];

  const goTo = useCallback((dir) => {
    if (animating.current) return;
    const next = dir === 'next' ? index + 1 : index - 1;
    if (next < 0 || next >= total) { setOffset(0); return; }
    animating.current = true;
    setAnimDir(dir);
    setOffset(0);
    setTimeout(() => {
      setIndex(next);
      setAnimDir(null);
      animating.current = false;
    }, 300);
  }, [index, total]);

  const onTouchStart = e => {
    if (animating.current) return;
    startX.current = e.touches[0].clientX;
    setDragging(true);
  };
  const onTouchMove = e => {
    if (!dragging || startX.current === null) return;
    setOffset(e.touches[0].clientX - startX.current);
  };
  const onTouchEnd = () => {
    setDragging(false);
    if (offset < -60 && index < total - 1)  goTo('next');
    else if (offset > 60 && index > 0)       goTo('prev');
    else setOffset(0);
    startX.current = null;
  };
  const onMouseDown = e => {
    if (animating.current) return;
    startX.current = e.clientX; setDragging(true);
  };
  const onMouseMove = e => {
    if (!dragging || startX.current === null) return;
    setOffset(e.clientX - startX.current);
  };
  const onMouseUp = () => {
    if (!dragging) return;
    setDragging(false);
    if (offset < -60 && index < total - 1)  goTo('next');
    else if (offset > 60 && index > 0)       goTo('prev');
    else setOffset(0);
    startX.current = null;
  };

  const flyX   = animDir === 'next' ? '-110vw' : animDir === 'prev' ? '110vw' : null;
  const flyRot = animDir === 'next' ? -20 : 20;
  const cardX  = flyX ?? `${offset}px`;
  const cardRot = flyX ? flyRot : dragging ? offset * 0.06 : 0;
  const cardTrans = dragging ? 'none'
    : flyX ? 'transform 0.3s cubic-bezier(.6,0,.8,.5)'
    : 'transform 0.35s cubic-bezier(.25,.46,.45,.94)';

  const hintNext = Math.min(1, Math.max(0, -offset / 70));
  const hintPrev = Math.min(1, Math.max(0,  offset / 70));

  const doShare = () => {
    if (!cur || !window.__showShareSheet) return;
    const a = cur.address || {};
    const isP = cur.organiserType === 'private';
    const showFull = !isGuest && !isP;
    const loc = showFull ? (a.fullAddress || a.suburb || '') : (a.suburb || '');
    const fmtD = d => {
      try { return new Date(d + 'T00:00:00').toLocaleDateString('en-AU', { weekday:'short', day:'numeric', month:'short' }); }
      catch { return d; }
    };
    const reciterLines = (cur.reciters || [])
      .filter(reciter => reciter?.name?.trim())
      .map(reciter => `🎙️ *${reciter.customType || reciter.type || 'Reciter'}:* ${reciter.name.trim()}`);
    window.__showShareSheet([
      `📅 *${cur.eventTypeDisplay || cur.eventType}*`,
      `🏠 *Host:* ${cur.hostName}`,
      `📆 *Date:* ${fmtD(cur.eventDate)}`,
      `⏰ *Time:* ${cur.startTime}${cur.endTime ? ' – ' + cur.endTime : ''}`,
      loc ? `📍 ${showFull ? '*Location:*' : '*Suburb:*'} ${loc}` : '',
      cur.hijriDate    ? `🌙 *Hijri:* ${cur.hijriDate}` : '',
      cur.speakerName  ? `🎤 *Speaker:* ${cur.speakerName}` : '',
      ...reciterLines,
      cur.audienceType ? `👥 ${cur.audienceType}` : '',
      (showFull && cur.hostPhone) ? `📞 *Contact:* ${cur.hostPhone}` : '',
      cur.notes?.trim() ? `📝 *Notes:* ${cur.notes.trim()}` : '',
      '', ...STORE_SHARE_LINES, '', '_Shared via Community Connect Australia_',
    ].filter(Boolean).join('\n'));
  };

  const doDirections = () => {
    if (!cur || isGuest) return;
    const a = cur.address || {};
    const q = encodeURIComponent(a.fullAddress || a.suburb || '');
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const url = isIOS
      ? `https://maps.apple.com/?daddr=${q}&dirflg=d`
      : `https://www.google.com/maps/dir/?api=1&destination=${q}`;
    window.location.assign(url);
  };

  const isSaved = cur ? savedIds.includes(cur.id) : false;

  if (!cur) return null;

  // Action button style helper
  const actBtn = (bg, shadow, disabled = false) => ({
    width: 52, height: 52, borderRadius: 16, border: 'none',
    background: disabled ? 'var(--border,var(--cc-border))' : bg,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.4 : 1,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: disabled ? 'none' : shadow,
    transition: 'all 0.15s',
    flexShrink: 0,
  });

  return (
    <div style={{ padding:'0 16px', userSelect:'none', fontFamily:'var(--font)' }}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}>

      {/* ── Action bar ── */}
      <div style={{ display:'flex', justifyContent:'center', alignItems:'center', gap:12, margin:'10px 0 14px' }}>

        {/* Prev */}
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
          <button onClick={() => goTo('prev')} disabled={index === 0 || !!animDir}
            style={actBtn(
              'var(--red,var(--cc-accent-strong))', '0 4px 14px color-mix(in srgb, var(--cc-accent-strong) 35%, transparent)',
              index === 0
            )}>
            <ChevL color={index === 0 ? 'var(--muted)' : 'var(--cc-on-primary)'} />
          </button>
          <span style={{ fontSize:'0.5625rem', fontWeight:800, color:'var(--muted)', fontFamily:'var(--font)' }}>Prev</span>
        </div>

        {/* Share */}
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
          <button onClick={doShare}
            style={actBtn('var(--cc-brand-whatsapp)', '0 4px 16px color-mix(in srgb, var(--cc-brand-whatsapp) 45%, transparent)')}>
            <WaIcon />
          </button>
          <span style={{ fontSize:'0.5625rem', fontWeight:800, color:'var(--muted)', fontFamily:'var(--font)' }}>Share</span>
        </div>

        {/* Save */}
        {!isGuest && onSaveToggle && (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
            <button onClick={() => onSaveToggle(cur.id, !isSaved)}
              style={actBtn(
                isSaved ? 'var(--cc-warning)' : 'var(--red,var(--cc-accent-strong))',
                isSaved ? '0 4px 16px color-mix(in srgb, var(--cc-warning) 45%, transparent)' : '0 4px 16px color-mix(in srgb, var(--cc-accent-strong) 35%, transparent)'
              )}>
              <span style={{ fontSize:'1.375rem', lineHeight:1 }}>{isSaved ? '⭐' : '☆'}</span>
            </button>
            <span style={{ fontSize:'0.5625rem', fontWeight:800, color:'var(--muted)', fontFamily:'var(--font)' }}>Save</span>
          </div>
        )}

        {/* Directions */}
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
          <button onClick={doDirections} disabled={isGuest}
            style={actBtn('var(--cc-brand-maps)', '0 4px 16px color-mix(in srgb, var(--cc-brand-maps) 45%, transparent)', isGuest)}>
            <MapIcon />
          </button>
          <span style={{ fontSize:'0.5625rem', fontWeight:800, color:'var(--muted)', fontFamily:'var(--font)' }}>Directions</span>
        </div>

        {/* Next */}
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
          <button onClick={() => goTo('next')} disabled={index >= total - 1 || !!animDir}
            style={actBtn(
              'var(--red,var(--cc-accent-strong))', '0 4px 14px color-mix(in srgb, var(--cc-accent-strong) 35%, transparent)',
              index >= total - 1
            )}>
            <ChevR color={index >= total - 1 ? 'var(--muted)' : 'var(--cc-on-primary)'} />
          </button>
          <span style={{ fontSize:'0.5625rem', fontWeight:800, color:'var(--muted)', fontFamily:'var(--font)' }}>Next</span>
        </div>

      </div>

      {/* ── Card stack ── */}
      <div style={{ position:'relative', height:400 }}>

        {/* Layer 3 — static back */}
        {events[index + 2] && (
          <div style={{
            position:'absolute', inset:0, borderRadius:22,
            background:'var(--card,var(--cc-surface))', border:'1px solid var(--border)',
            transform:'scale(0.94) translateY(14px)', zIndex:1, overflow:'hidden',
            boxShadow:'0 2px 8px color-mix(in srgb, var(--cc-shadow-base) 5%, transparent)',
          }}>
            <div style={{ height:5, background:'var(--red,var(--cc-accent-strong))' }} />
          </div>
        )}

        {/* Layer 2 — next card static */}
        {events[index + 1] && (
          <div style={{
            position:'absolute', inset:0, borderRadius:22,
            background:'var(--card,var(--cc-surface))', border:'1px solid var(--border)',
            transform:'scale(0.97) translateY(7px)', zIndex:2, overflow:'hidden',
            boxShadow:'0 4px 14px color-mix(in srgb, var(--cc-shadow-base) 7%, transparent)',
          }}>
            <CardContent e={events[index + 1]} isGuest={isGuest} />
          </div>
        )}

        {/* Layer 1 — active draggable card */}
        <div
          onMouseDown={onMouseDown}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          style={{
            position:'absolute', inset:0, borderRadius:22,
            background:'var(--card,var(--cc-surface))',
            border:'1.5px solid var(--border)',
            boxShadow:'0 8px 28px color-mix(in srgb, var(--cc-shadow-base) 10%, transparent)',
            cursor: dragging ? 'grabbing' : 'grab',
            overflow:'hidden', zIndex:3,
            transform: `translateX(${cardX}) rotate(${cardRot}deg)`,
            transition: cardTrans,
            touchAction:'pan-y',
          }}>
          {/* NEXT hint */}
          <div style={{
            position:'absolute', top:16, right:16, zIndex:10,
            background:'var(--red,var(--cc-accent-strong))', color:'var(--cc-on-primary)', padding:'5px 13px',
            borderRadius:9, fontSize:'0.8125rem', fontWeight:900, fontFamily:'var(--font)',
            border:'2.5px solid var(--cc-surface)', opacity: hintNext, pointerEvents:'none',
          }}>NEXT ›</div>
          {/* PREV hint */}
          <div style={{
            position:'absolute', top:16, left:16, zIndex:10,
            background:'var(--red,var(--cc-accent-strong))', color:'var(--cc-on-primary)', padding:'5px 13px',
            borderRadius:9, fontSize:'0.8125rem', fontWeight:900, fontFamily:'var(--font)',
            border:'2.5px solid var(--cc-surface)', opacity: hintPrev, pointerEvents:'none',
          }}>‹ PREV</div>
          <CardContent e={cur} isGuest={isGuest} />
        </div>
      </div>

      {/* ── Dots + counter ── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6, marginTop:12 }}>
        <span style={{ fontSize:'0.6875rem', color:'var(--muted)', fontWeight:800, marginRight:6, fontFamily:'var(--font)' }}>
          {index+1} / {total}
        </span>
        {Array.from({ length: Math.min(7, total) }, (_, i) => {
          const idx = total <= 7 ? i : Math.round(i * (total-1) / 6);
          return (
            <button key={i} onClick={() => { if (!animating.current) setIndex(idx); }}
              style={{
                width: idx===index ? 22 : 7, height:7, borderRadius:4, padding:0, border:'none',
                background: idx===index ? 'var(--red,var(--cc-accent-strong))' : 'var(--border)',
                cursor:'pointer', transition:'all 0.25s', boxShadow:'none',
              }}/>
          );
        })}
      </div>
      <p style={{ textAlign:'center', fontSize:'0.625rem', color:'var(--muted)', margin:'6px 0 0',
        fontWeight:700, fontFamily:'var(--font)' }}>
        ← Drag or swipe to browse →
      </p>
    </div>
  );
}
