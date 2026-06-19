import { useEffect, useState } from 'react';
import { canDeleteEvent, canEditEvent, isAdminRole, getSharePrivacy, getDisplayPrivacy } from '../utils/permissions';
import { GoLiveButton, WatchLiveButton } from './LiveStream';
import { RELIGIOUS_EVENT_TYPES } from '../utils/constants';
import { getEventImage } from '../services/imageService';
import { getHijriDisplay, hijriDisplayFromParts } from '../services/hijriService';
import { getHijriSettings } from '../services/settingsService';

let hijriOverridesCache = [];
let hijriSettingsPromise = null;

function loadHijriOverrides() {
  if (!hijriSettingsPromise) {
    hijriSettingsPromise = getHijriSettings()
      .then(settings => {
        hijriOverridesCache = settings.overrides || [];
        return hijriOverridesCache;
      })
      .catch(() => hijriOverridesCache);
  }
  return hijriSettingsPromise;
}

// Display normaliser — old events stored as "Mixed Audience" show as "Family Event"
const normAudience = (a) => (a === 'Mixed Audience' ? 'Family Event' : a);

// Date chip parts from YYYY-MM-DD
const dateChip = (d) => {
  try {
    const dt = new Date(d + 'T00:00:00');
    return {
      mo: dt.toLocaleDateString('en-AU', { month: 'short' }).toUpperCase(),
      dy: dt.getDate(),
      wd: dt.toLocaleDateString('en-AU', { weekday: 'short' }).toUpperCase(),
    };
  } catch { return { mo: '', dy: '', wd: '' }; }
};

// ── SVG icons ────────────────────────────────────────────────────────────────
const WaIcon = ({ size = 17 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="#25d366">
    <path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.37 5.07L2 22l5.09-1.34A9.94 9.94 0 0012 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm0 18c-1.66 0-3.22-.46-4.55-1.26l-.32-.19-3.03.8.81-2.96-.21-.34A7.96 7.96 0 014 12c0-4.42 3.58-8 8-8s8 3.58 8 8-3.58 8-8 8zm4.45-5.95c-.24-.12-1.43-.7-1.65-.78-.22-.08-.38-.12-.54.12-.16.24-.62.78-.76.94-.14.16-.28.18-.52.06-.24-.12-1.01-.37-1.92-1.18-.71-.63-1.19-1.41-1.33-1.65-.14-.24-.01-.37.1-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78-.19-.47-.39-.4-.54-.41h-.46c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.69 2.58 4.1 3.62.57.25 1.02.39 1.37.5.57.18 1.09.16 1.5.1.46-.07 1.43-.58 1.63-1.15.2-.57.2-1.06.14-1.15-.06-.1-.22-.16-.46-.28z"/>
  </svg>
);

const MapIcon = ({ size = 15, color = '#4285f4' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
  </svg>
);

const TrashIcon = ({ size = 15, color = '#c0392b' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6l-1 14H6L5 6"/>
    <path d="M10 11v6M14 11v6"/>
    <path d="M9 6V4h6v2"/>
  </svg>
);

const EditIcon = ({ size = 15, color = '#c0392b' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);

export default function EventCard({
  event, user, profile, onEdit, onDelete, onCopy,
  isExpanded, onExpand, isGuest,
  savedIds = [], onSaveToggle, onStreamStart
}) {
  const a        = event.address || {};
  const fullAddr = a.fullAddress || [a.street, a.suburb, a.state, a.postcode].filter(Boolean).join(', ');
  const suburbOnly = `${a.suburb || ''}${a.state ? ', ' + a.state : ''}`;

  // Display privacy — any logged-in user sees full details; guests see suburb only
  const displayPrivacy = getDisplayPrivacy(isGuest);
  const addr   = displayPrivacy.showFullAddress ? fullAddr : suburbOnly;
  const suburb = a.suburb || '';

  const displayType   = event.eventTypeDisplay || event.eventType || '';
  const isPrivate     = event.organiserType === 'private';
  const showReligious = RELIGIOUS_EVENT_TYPES.includes(event.eventType);
  const canCopy       = isAdminRole(profile?.role);
  const isSaved       = savedIds.includes(event.id);
  const [lightbox, setLightbox] = useState(false);
  const [hijriOverrides, setHijriOverrides] = useState(hijriOverridesCache);

  // Poster image — only show the zoom option when the host uploaded a real poster
  const { src: posterSrc, isLogo: posterIsLogo } = getEventImage(event);
  const hasPoster = !posterIsLogo;

  const fmtDate = d => {
    try { return new Date(d + 'T00:00:00').toLocaleDateString('en-AU', {
      weekday:'short', day:'numeric', month:'short', year:'numeric' }); }
    catch { return d; }
  };

  useEffect(() => {
    let alive = true;
    loadHijriOverrides().then(overrides => {
      if (alive) setHijriOverrides(overrides || []);
    });
    return () => { alive = false; };
  }, []);

  const storedHijriLooksValid = (value) => {
    const match = String(value || '').trim().match(/^(\d{1,2})\b/);
    if (!match) return false;
    const day = Number(match[1]);
    return day >= 1 && day <= 30;
  };

  const hijriDisplay = (() => {
    if (event.enteredAsHijri === true && event.hijriDay && event.hijriMonth && event.hijriYear) {
      const day = Number(event.hijriDay);
      if (day >= 1 && day <= 30) {
        return hijriDisplayFromParts(day, Number(event.hijriMonth), Number(event.hijriYear));
      }
    }

    if (event.eventDate) {
      const computed = getHijriDisplay(event.eventDate, hijriOverrides);
      if (computed && storedHijriLooksValid(computed)) return computed;
    }

    return storedHijriLooksValid(event.hijriDate) ? event.hijriDate : '';
  })();

  const handleShare = (ev) => {
    ev.stopPropagation();
    if (!window.__showShareSheet) return;
    // Apply sharing privacy matrix
    const sharePrivacy = getSharePrivacy(profile, event, user?.uid);
    const loc = sharePrivacy.showFullAddress
      ? (a.fullAddress || suburbOnly)
      : suburbOnly;
    const locLabel = sharePrivacy.showFullAddress ? '*Location:*' : '*Suburb:*';
    const fmtD = d => {
      try { return new Date(d + 'T00:00:00').toLocaleDateString('en-AU', { weekday:'short', day:'numeric', month:'short' }); }
      catch { return d; }
    };
    window.__showShareSheet([
      `📅 *${displayType}*`,
      `🏠 *Host:* ${event.hostName}`,
      `📆 *Date:* ${fmtD(event.eventDate)}`,
      `⏰ *Time:* ${event.startTime}${event.endTime ? ' – ' + event.endTime : ''}`,
      loc ? `📍 ${locLabel} ${loc}` : '',
      sharePrivacy.showPhone && event.hostPhone ? `📞 *Phone:* ${event.hostPhone}` : '',
      hijriDisplay       ? `🌙 *Hijri:* ${hijriDisplay}`        : '',
      event.speakerName  ? `🎤 *Speaker:* ${event.speakerName}`  : '',
      event.audienceType ? `👥 ${event.audienceType}`             : '',
      '', '_Shared via Community Events Australia_', '_communityevents.siza.info_',
    ].filter(Boolean).join('\n'));
  };

  const handleDirections = (ev) => {
    ev.stopPropagation();
    if (isGuest) return;
    const q = encodeURIComponent(fullAddr || suburb);
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    window.open(isIOS ? `maps://maps.apple.com/?q=${q}` : `https://maps.google.com/?q=${q}`, '_blank');
  };

  // ── Small icon button ─────────────────────────────────────────────────────
  const iconBtn = (onClick, title, bg, borderColor, content, disabled = false) => (
    <button onClick={onClick} title={title} disabled={disabled}
      style={{
        width: 36, height: 36, borderRadius: 10, border: `1.5px solid ${borderColor}`,
        background: bg, cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        opacity: disabled ? 0.4 : 1, transition: 'all 0.15s',
        boxShadow: '0 1px 4px rgba(26,26,46,0.08)',
        flexShrink: 0, padding: 0, margin: 0,
      }}>
      {content}
    </button>
  );

  return (
    <div
      className="card"
      onClick={() => { if (!isExpanded) onExpand(event.id); }}
      style={{
        cursor: 'pointer', padding: '12px 14px',
        border: isExpanded ? '1.5px solid var(--red,#c0392b)' : '1.5px solid transparent',
        boxShadow: isExpanded ? '0 6px 24px rgba(192,57,43,0.15)' : 'var(--shadow-sm)',
        transition: 'all 0.25s',
        transform: isExpanded ? 'translateY(-1px)' : 'none',
        marginBottom: 8,
      }}>

      {/* ── COMPACT ROW (image-led) ── */}
      <div style={{ display:'flex', gap:12, alignItems:'stretch' }}>

        {/* Thumbnail with date chip */}
        {(() => {
          const { src, isLogo } = getEventImage(event);
          const chip = dateChip(event.eventDate);
          return (
            <div
              onClick={hasPoster ? (e => { e.stopPropagation(); setLightbox(true); }) : undefined}
              style={{
                width:92, minWidth:92, height:92, borderRadius:14, overflow:'hidden',
                position:'relative', background:'#f0f4f3', flexShrink:0,
                display:'flex', alignItems:'center', justifyContent:'center',
                cursor: hasPoster ? 'zoom-in' : 'default',
              }}>
              <img src={src} alt=""
                style={{ width:'100%', height:'100%',
                  objectFit: isLogo ? 'contain' : 'cover',
                  // For logo fallbacks, pad so the centered logo sits clear of the date chip
                  padding: isLogo ? '26px 8px 8px' : 0 }} />
              <div style={{
                position:'absolute', top:6, left:6, background:'white',
                borderRadius:8, padding:'3px 6px', textAlign:'center',
                boxShadow:'0 2px 8px rgba(0,0,0,0.18)', minWidth:34,
              }}>
                <div style={{ fontSize:8, fontWeight:900, color:'var(--green,#16a34a)', letterSpacing:'0.04em' }}>{chip.mo}</div>
                <div style={{ fontSize:16, fontWeight:900, color:'var(--text)', lineHeight:1 }}>{chip.dy}</div>
                <div style={{ fontSize:7, fontWeight:700, color:'var(--muted)' }}>{chip.wd}</div>
              </div>
              {event.isLive && (
                <div style={{
                  position:'absolute', bottom:0, left:0, right:0,
                  background:'var(--red,#c0392b)', color:'white', fontSize:8,
                  fontWeight:900, textAlign:'center', padding:'2px 0',
                  animation:'pulse 2s infinite',
                }}>🔴 LIVE</div>
              )}
            </div>
          );
        })()}

        {/* Body */}
        <div style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column', justifyContent:'center' }}>
          {/* Title */}
          <div style={{ fontWeight:800, fontSize:14, color:'var(--text)', fontFamily:'var(--font)',
            whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', marginBottom:4 }}>
            {displayType} — {event.hostName}
          </div>
          {/* Meta */}
          <div style={{ fontSize:11.5, color:'var(--muted)', fontWeight:600, fontFamily:'var(--font)', marginBottom:2 }}>
            ⏰ {event.startTime}{event.endTime ? ` – ${event.endTime}` : ''}
          </div>
          {suburb && (
            <div style={{ fontSize:11.5, color:'var(--muted)', fontWeight:600, fontFamily:'var(--font)', marginBottom:6,
              whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
              📍 {suburb}
            </div>
          )}
          {/* Footer: type/audience pill OR Watch-on-YouTube when live */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:6 }}
            onClick={e => e.stopPropagation()}>
            {event.isLive ? (
              <WatchLiveButton event={event} isGuest={isGuest} onWatchStarted={onStreamStart} compact />
            ) : (
              <span className="pill-audience" style={{
                fontSize:9.5, fontWeight:800, padding:'4px 10px', borderRadius:20,
                background: normAudience(event.audienceType) === 'Family Event' ? '#dbeafe' : '#dcfce7',
                color:      normAudience(event.audienceType) === 'Family Event' ? '#1d4ed8' : '#15803d',
                letterSpacing:'0.02em', whiteSpace:'nowrap',
              }}>
                {(normAudience(event.audienceType) || 'All Welcome').toUpperCase()}
              </span>
            )}
            {onSaveToggle && (
              <span onClick={ev => { ev.stopPropagation(); if (!isGuest) onSaveToggle(event.id, !isSaved); }}
                style={{ fontSize:18, color: isSaved ? 'var(--red,#c0392b)' : '#cbd5d3',
                  cursor: isGuest ? 'default' : 'pointer', lineHeight:1, flexShrink:0 }}>
                {isSaved ? '❤️' : '🤍'}
              </span>
            )}
          </div>
        </div>

        {/* Chevron */}
        <span style={{
          fontSize:10, color:'var(--teal,#0f766e)', flexShrink:0, alignSelf:'center',
          transition:'transform 0.3s', display:'inline-block',
          transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
        }}>▼</span>
      </div>

      {/* ── EXPANDED BODY ── */}
      <div style={{
        overflow:'hidden',
        maxHeight: isExpanded ? '600px' : '0px',
        opacity: isExpanded ? 1 : 0,
        marginTop: isExpanded ? 10 : 0,
        transition: 'max-height 0.35s ease, opacity 0.3s ease, margin-top 0.25s ease',
      }}>
        <div style={{ borderTop:'1px solid var(--border)', paddingTop:10 }}>
          {/* Poster preview — tap to zoom */}
          {hasPoster && (
            <div onClick={e => { e.stopPropagation(); setLightbox(true); }}
              style={{ marginBottom:10, borderRadius:12, overflow:'hidden',
                cursor:'zoom-in', position:'relative', border:'1px solid var(--border)' }}>
              <img src={posterSrc} alt="Event poster"
                style={{ width:'100%', maxHeight:260, objectFit:'cover', display:'block' }} />
              <div style={{ position:'absolute', bottom:8, right:8,
                background:'rgba(0,0,0,0.6)', color:'white', fontSize:11, fontWeight:700,
                padding:'4px 10px', borderRadius:20, display:'flex', alignItems:'center', gap:5 }}>
                🔍 Tap to zoom
              </div>
            </div>
          )}
          {/* Hijri badge */}
          {hijriDisplay && (
            <div style={{ marginBottom:8 }}>
              <span style={{ background:'#fef9e7', color:'#b7950b',
                fontSize:11, padding:'3px 10px', borderRadius:99, fontWeight:800, fontFamily:'var(--font)' }}>
                🌙 {hijriDisplay}
              </span>
            </div>
          )}
          {/* Subject */}
          {event.eventSubject && (
            <p style={{ margin:'0 0 6px', fontWeight:900, color:'var(--red)', fontSize:14, fontFamily:'var(--font)' }}>
              {event.eventSubject}
            </p>
          )}
          {/* Address */}
          <p style={{ margin:'0 0 5px', fontSize:13, color:'var(--text)', fontWeight:600, fontFamily:'var(--font)' }}>
            📍 {addr}
            {isGuest && (
              <span style={{ fontSize:11, color:'var(--muted)', marginLeft:4 }}>
                (login for full address)
              </span>
            )}
          </p>
          {/* Audience */}
          {event.audienceType && (
            <p style={{ margin:'0 0 5px', fontSize:13, color:'var(--muted)', fontWeight:600, fontFamily:'var(--font)' }}>
              👥 {event.audienceType}
            </p>
          )}
          {/* Speaker */}
          {showReligious && event.speakerName && (
            <p style={{ margin:'0 0 4px', fontSize:13, color:'var(--text)', fontWeight:600, fontFamily:'var(--font)' }}>
              🎤 {event.speakerName}
            </p>
          )}
          {/* Reciters */}
          {showReligious && (event.reciters || []).filter(r => r.name).map((r, i) => (
            <p key={i} style={{ margin:'0 0 4px', fontSize:13, color:'var(--text)', fontWeight:600, fontFamily:'var(--font)' }}>
              🎵 {r.customType || r.type}: {r.name}
            </p>
          ))}
          {/* On behalf */}
          {event.isOnBehalfOf && (
            <p style={{ margin:'0 0 4px', fontSize:12, color:'var(--muted)', fontFamily:'var(--font)' }}>
              Submitted by {event.submittedByName || event.createdByUserEmail}
            </p>
          )}

          {/* Live stream buttons */}
          <div style={{ marginTop:10, display:'flex', gap:8, flexWrap:'wrap' }}
            onClick={e => e.stopPropagation()}>
            {/* Watch Live — all logged-in users when event is live */}
            <WatchLiveButton event={event} isGuest={isGuest}
              onWatchStarted={onStreamStart} />
            {/* Go Live — only event owner or admin */}
            {canEditEvent(profile, event, user?.uid) && (
              <GoLiveButton event={event}
                onLiveStarted={onStreamStart}
                onLiveEnded={() => {}}
              />
            )}
          </div>

          {/* Action buttons */}
          <div style={{ marginTop:8, display:'flex', gap:8, flexWrap:'wrap' }}
            onClick={e => e.stopPropagation()}>
            {/* Share */}
            <button onClick={handleShare} style={{
              fontSize:12, padding:'8px 14px', borderRadius:10, border:'none',
              background:'#25d366', color:'white', fontWeight:800, fontFamily:'var(--font)',
              display:'flex', alignItems:'center', gap:5, boxShadow:'0 2px 8px rgba(37,211,102,0.4)',
              cursor:'pointer',
            }}>
              <WaIcon size={14} color="white" /> Share
            </button>
            {/* Directions */}
            <button onClick={handleDirections} disabled={isGuest} style={{
              fontSize:12, padding:'8px 14px', borderRadius:10, border:'none',
              background: isGuest ? 'var(--border)' : '#4285f4', color:'white',
              fontWeight:800, fontFamily:'var(--font)',
              display:'flex', alignItems:'center', gap:5,
              boxShadow: isGuest ? 'none' : '0 2px 8px rgba(66,133,244,0.4)',
              cursor: isGuest ? 'not-allowed' : 'pointer', opacity: isGuest ? 0.4 : 1,
            }}>
              <MapIcon size={13} color="white" /> Directions
            </button>
            {/* Edit */}
            {canEditEvent(profile, event, user?.uid) && (
              <button onClick={e => { e.stopPropagation(); onEdit(event); }} style={{
                fontSize:12, padding:'8px 14px', borderRadius:10,
                background:'var(--red-l,#fdf2f1)', color:'var(--red)',
                border:'1px solid var(--red-m,#fadbd8)', fontWeight:800, fontFamily:'var(--font)',
                display:'flex', alignItems:'center', gap:5, boxShadow:'none', cursor:'pointer',
              }}>
                <EditIcon size={13} color="var(--red,#c0392b)" /> Edit
              </button>
            )}
            {/* Delete */}
            {canDeleteEvent(profile, event, user?.uid) && (
              <button onClick={e => { e.stopPropagation(); onDelete(event.id); }} style={{
                fontSize:12, padding:'8px 12px', borderRadius:10,
                background:'var(--red-l,#fdf2f1)', color:'var(--red)',
                border:'1px solid var(--red-m,#fadbd8)', fontWeight:800, fontFamily:'var(--font)',
                display:'flex', alignItems:'center', gap:4, boxShadow:'none', cursor:'pointer',
              }}>
                <TrashIcon size={13} color="var(--red,#c0392b)" />
              </button>
            )}
            {/* Copy */}
            {canCopy && onCopy && (
              <button onClick={e => { e.stopPropagation(); onCopy(event); }} style={{
                fontSize:12, padding:'8px 14px', borderRadius:10,
                background:'var(--red-l,#fdf2f1)', color:'var(--red)',
                border:'1px solid var(--red-m,#fadbd8)', fontWeight:800, fontFamily:'var(--font)',
                display:'flex', alignItems:'center', gap:4, boxShadow:'none', cursor:'pointer',
              }}>
                📋 Copy
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Poster lightbox ── */}
      {lightbox && hasPoster && (
        <div
          onClick={e => { e.stopPropagation(); setLightbox(false); }}
          style={{
            position:'fixed', inset:0, zIndex:10000,
            background:'rgba(0,0,0,0.9)', display:'flex',
            alignItems:'center', justifyContent:'center', padding:20,
          }}>
          <button
            onClick={e => { e.stopPropagation(); setLightbox(false); }}
            aria-label="Close"
            style={{
              position:'absolute', top:16, right:16, width:44, height:44,
              borderRadius:'50%', background:'rgba(255,255,255,0.15)', color:'white',
              border:'none', cursor:'pointer', fontSize:24, lineHeight:1,
              display:'flex', alignItems:'center', justifyContent:'center',
            }}>×</button>
          <img src={posterSrc} alt="Event poster"
            onClick={e => e.stopPropagation()}
            style={{ maxWidth:'100%', maxHeight:'90vh', objectFit:'contain',
              borderRadius:12, boxShadow:'0 10px 50px rgba(0,0,0,0.5)' }} />
        </div>
      )}
    </div>
  );
}
