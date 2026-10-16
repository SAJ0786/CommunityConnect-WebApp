import { lazy, Suspense, useEffect, useState } from 'react';
import { canEditEvent, canAdminAccessEvent, canArrangeEventNiaz, getSharePrivacy, getDisplayPrivacy } from '../utils/permissions';
import { getEventMetroArea } from '../utils/cities';
import { directoryQuery, PUBLIC_DIRECTORY_PATH } from '../utils/businessRoutes.mjs';
import { CalendarDays, Clock, MapPin, Heart, ChevronDown } from 'lucide-react';
import EventActionPanel from './EventActionPanel';
import { eventActions } from '../utils/eventActions.mjs';
import { RELIGIOUS_EVENT_TYPES } from '../utils/constants';
import { getEventImage, getFallbackImageAsync } from '../services/imageService';
import { getHijriDisplay, hijriDisplayFromParts } from '../services/hijriService';
import { getHijriSettings } from '../services/settingsService';
import { STORE_SHARE_LINES } from '../utils/storeLinks';
import { useRegistration } from '../registration/RegistrationContext';

const GoLiveButton = lazy(() => import('./LiveStream').then(module => ({ default: module.GoLiveButton })));
const WatchLiveButton = lazy(() => import('./LiveStream').then(module => ({ default: module.WatchLiveButton })));
const EventSeriesArchiveDialog = lazy(() => import('./EventSeriesArchiveDialog'));
const ContactHostDialog = lazy(() => import('./ContactHostDialog'));
const EventReminderDialog = lazy(() => import('./EventReminderDialog'));

let hijriOverridesCache = [];

function loadHijriOverrides() {
  return getHijriSettings()
    .then(settings => {
      hijriOverridesCache = settings.overrides || [];
      return hijriOverridesCache;
    })
    .catch(() => hijriOverridesCache);
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

export default function EventCard({
  event: sourceEvent, user, profile, onEdit, onDelete, onCopy,
  isExpanded, onExpand, isGuest,
  savedIds = [], onSaveToggle, onStreamStart, onCalendar, onContactHost, onReminder, onNiazArrangement, onEditSeries, onDeleteSeries, imagePriority = false
}) {
  const registration = useRegistration();
  const [privateState, setPrivateState] = useState(null);
  const [pageVisible, setPageVisible] = useState(() => !document.hidden);
  const [registrationError, setRegistrationError] = useState('');
  const [registrationBusy, setRegistrationBusy] = useState(false);
  const registrationKey = [user?.uid, sourceEvent.id, sourceEvent.revision, registration?.revision].join(':');
  const registrationDetail = pageVisible && privateState?.key === registrationKey ? privateState.detail : null;
  const event = sourceEvent.registrationOnly ? { ...sourceEvent,
    ...(registrationDetail ? { ...registrationDetail.event, eventDate: registrationDetail.event.date } : {}),
    address: { suburb: sourceEvent.suburb || sourceEvent.address?.suburb || '',
      ...(registrationDetail?.privateDetails ? { fullAddress: registrationDetail.privateDetails.address } : {}) },
    imageUrl: '',
  } : sourceEvent;
  useEffect(() => {
    const visibility = () => { setPageVisible(!document.hidden); setPrivateState(null); };
    document.addEventListener('visibilitychange', visibility);
    return () => document.removeEventListener('visibilitychange', visibility);
  }, []);
  useEffect(() => {
    if (!sourceEvent.registrationOnly || !registration?.api || !pageVisible || (!isExpanded && !sourceEvent.hasPoster)) return;
    let current = true;
    setRegistrationError('');
    registration.api.load(sourceEvent.id).then(async detail => {
      if (!current) return;
      setPrivateState({ key: registrationKey, detail, poster: null });
      if (detail.privateDetails?.hasPoster) {
        const poster = await registration.api.poster(sourceEvent.id);
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(poster.mime)) throw new Error('Unsupported event poster format.');
        if (current) setPrivateState({ key: registrationKey, detail, poster: `data:${poster.mime};base64,${poster.base64}` });
      }
    }).catch(error => { if (current) setRegistrationError(error.message); });
    return () => { current = false; };
  }, [registration?.api, registrationKey, sourceEvent.registrationOnly, sourceEvent.hasPoster, pageVisible, isExpanded]);
  const [seriesArchiveOpen, setSeriesArchiveOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false), [seriesEditBusy, setSeriesEditBusy] = useState(false), [actionError, setActionError] = useState('');
  const [reminderOpen, setReminderOpen] = useState(false);
  const a        = event.address || {};
  const fullAddr = a.fullAddress || [a.street, a.suburb, a.state, a.postcode].filter(Boolean).join(', ');
  const suburbOnly = `${a.suburb || ''}${a.state ? ', ' + a.state : ''}`;

  // Display privacy — any logged-in user sees full details; guests see suburb only
  const displayPrivacy = event.registrationOnly
    ? { showFullAddress: Boolean(registrationDetail?.privateDetails), showPhone: false }
    : getDisplayPrivacy(isGuest);
  const addr   = displayPrivacy.showFullAddress ? fullAddr : suburbOnly;
  const suburb = a.suburb || '';

  const displayType   = event.eventTypeDisplay || event.customEventType || event.eventType || 'Event';
  const displayTime   = `${event.prayerLabel ? `${event.prayerLabel} ` : ''}${event.startTime || ''}${event.endTime ? ` – ${event.endTime}` : ''}`.trim();
  const isPrivate     = event.organiserType === 'private';
  const showReligious = RELIGIOUS_EVENT_TYPES.includes(event.eventType);
  const member = Boolean(!isGuest && user?.uid && !user.isAnonymous && profile?.isActive !== false);
  const manage = member && (event.registrationOnly ? Boolean(registrationDetail?.canManage ?? event.canManage) && !event.deletedAt && event.status !== 'cancelled' : canEditEvent(profile, event, user?.uid));
  const admin = member && canAdminAccessEvent(profile, event);
  const readOnly = import.meta.env.VITE_READ_ONLY_PREVIEW === 'true';
  const [showLiveControls, setShowLiveControls] = useState(false);
  const isSaved       = savedIds.includes(event.id);
  const [lightbox, setLightbox] = useState(false);
  const [hijriOverrides, setHijriOverrides] = useState(hijriOverridesCache);

  // Poster image — Firestore organisation logos resolve asynchronously, while
  // uploaded posters and bundled fallbacks can render immediately.
  const [eventImage, setEventImage] = useState(() => getEventImage(event, isGuest));
  const privatePoster = registrationDetail && privateState?.poster;
  const { src: posterSrc, isLogo: posterIsLogo } = privatePoster ? { src: privatePoster, isLogo: false } : eventImage;
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

  useEffect(() => {
    let alive = true;
    const immediate = getEventImage(event, isGuest);
    setEventImage(immediate);
    if (immediate.isLogo) {
      getFallbackImageAsync(event).then(src => {
        if (alive && src) setEventImage({ src, isLogo:true });
      }).catch(() => {});
    }
    return () => { alive = false; };
  }, [event.imageUrl, event.organiserType, event.hostName, event.organiserName, isGuest]);

  const storedHijriLooksValid = (value) => {
    const match = String(value || '').trim().match(/^(\d{1,2})\b/);
    if (!match) return false;
    const day = Number(match[1]);
    return day >= 1 && day <= 30;
  };

  const hijriDisplay = (() => {
    if (event.eventDate) {
      const computed = getHijriDisplay(event.eventDate, hijriOverrides);
      if (computed && storedHijriLooksValid(computed)) return computed;
    }

    if (event.enteredAsHijri === true && event.hijriDay && event.hijriMonth && event.hijriYear) {
      const day = Number(event.hijriDay);
      if (day >= 1 && day <= 30) {
        return hijriDisplayFromParts(day, Number(event.hijriMonth), Number(event.hijriYear));
      }
    }

    return storedHijriLooksValid(event.hijriDate) ? event.hijriDate : '';
  })();

  const handleShare = (ev) => {
    ev.stopPropagation();
    if (!window.__showShareSheet) return;
    const sharePrivacy = event.registrationOnly ? { showFullAddress: false, showPhone: false } : getSharePrivacy(profile, event, user?.uid);
    const loc = sharePrivacy.showFullAddress
      ? (a.fullAddress || suburbOnly)
      : suburbOnly;
    const locLabel = sharePrivacy.showFullAddress ? '*Location:*' : '*Suburb:*';
    const fmtD = d => {
      try { return new Date(d + 'T00:00:00').toLocaleDateString('en-AU', { weekday:'short', day:'numeric', month:'short' }); }
      catch { return d; }
    };
    const reciterLines = (event.reciters || [])
      .filter(reciter => reciter?.name?.trim())
      .map(reciter => `🎙️ *${reciter.customType || reciter.type || 'Reciter'}:* ${reciter.name.trim()}`);
    const text = [
      `📅 *${displayType}*`,
      `🏠 *Host:* ${event.hostName}`,
      `📆 *Date:* ${fmtD(event.eventDate)}`,
      `⏰ *Time:* ${displayTime}`,
      loc ? `📍 ${locLabel} ${loc}` : '',
      sharePrivacy.showPhone && event.hostPhone ? `📞 *Phone:* ${event.hostPhone}` : '',
      hijriDisplay       ? `🌙 *Hijri:* ${hijriDisplay}`       : '',
      event.speakerName  ? `🎤 *Speaker:* ${event.speakerName}` : '',
      ...reciterLines,
      event.audienceType ? `👥 ${normAudience(event.audienceType)}` : '',
      event.notes?.trim() ? `📝 *Notes:* ${event.notes.trim()}` : '',
      '', ...STORE_SHARE_LINES, '', '_Shared via Community Events Australia_',
    ].filter(Boolean).join('\n');

    // Pass poster URL so ShareSheet can offer image sharing when available
    // Guests never see the poster (imageService already handles this), so only
    // pass imageUrl for logged-in users who can see the real poster.
    window.__showShareSheet({
      text,
      imageUrl: (!event.registrationOnly && !isGuest && event.imageUrl) ? event.imageUrl : '',
    });
  };

  const handleDirections = (ev) => {
    ev.stopPropagation();
    if (isGuest || (event.registrationOnly && !registrationDetail?.privateDetails)) return;
    const q = encodeURIComponent(fullAddr || suburb);
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const url = isIOS
      ? `https://maps.apple.com/?daddr=${q}&dirflg=d`
      : `https://www.google.com/maps/dir/?api=1&destination=${q}`;
    window.location.assign(url);
  };

  const handlers = {
    uid: user?.uid, share: handleShare, directions: handleDirections,
    live: () => setShowLiveControls(value => !value),
    edit: event.registrationOnly ? registration?.open && (() => registration.open(event, 'edit')) : onEdit && (() => onEdit(event)),
    delete: event.registrationOnly ? registration?.api && (async () => {
      if (!manage || !registration?.api || registrationBusy || !window.confirm('Delete this event? Existing places will be released and registration history retained.')) return;
      setRegistrationBusy(true); setRegistrationError('');
      try { await registration.api.deleteEvent(event.id, event.revision); registration.refresh(); }
      catch (error) { setRegistrationError(error.message); }
      finally { setRegistrationBusy(false); }
    }) : onDelete && (() => onDelete(event.id)),
    register: registration?.open && (() => registration.open(event, 'register')),
    editForm: registration?.open && (() => registration.open(event, 'form')),
    responses: registration?.open && (() => registration.open(event, 'responses')),
    registrationHistory: registration?.open && (() => registration.open(event, 'history')),
    copy: event.registrationOnly ? registration?.open && (() => registration.open(event, 'copy')) : onCopy && (() => onCopy(event)), calendar: onCalendar && (() => onCalendar(event)),
    contact: () => { if (!readOnly && member) { if (onContactHost) onContactHost(event); else setContactOpen(true); } },
    reminder: () => { if (!readOnly && member) { if (onReminder) onReminder(event); else setReminderOpen(true); } },
    niaz: () => {
      if (!canArrangeEventNiaz(event, user, profile, isGuest)) return;
      if (onNiazArrangement) return onNiazArrangement(event);
      window.location.assign(PUBLIC_DIRECTORY_PATH + directoryQuery({ city: getEventMetroArea(event),
        category: 'Food & Catering', service: 'Niaz Preparation and supply' }));
    },
    editSeries: (onEditSeries || onEdit) && (async () => {
      if (readOnly || !manage || seriesEditBusy) return;
      if (onEditSeries) return onEditSeries(event);
      setSeriesEditBusy(true); setActionError('');
      try { const service = await import('../services/eventSeriesEditService'); onEdit(await service.prepareFutureSeriesEdit(event)); }
      catch (problem) { setActionError(problem.message); }
      finally { setSeriesEditBusy(false); }
    }),
    deleteSeries: () => { if (!readOnly && member && admin && manage) { if (onDeleteSeries) onDeleteSeries(event); else setSeriesArchiveOpen(true); } },
  };
  const actions = eventActions({ event: { ...event, isRegistered: registrationDetail ? registrationDetail.ownRegistration?.status === 'registered' : event.isRegistered,
    canEditRegistration: registrationDetail?.canEditRegistration ?? event.canEditRegistration,
    privateVenueAvailable: Boolean(registrationDetail?.privateDetails) }, member, manage, admin, registrationRemindersEnabled: import.meta.env.VITE_EVENT_REMINDERS_ENABLED === 'true',
    arrangeNiaz: canArrangeEventNiaz(event, user, profile, isGuest), readOnly: readOnly || registrationBusy, handlers });
  const chip = dateChip(event.eventDate);
  const organiser = isPrivate ? 'Private' : (event.organisationType === 'org' || event.organiserCategory === 'org') ? 'Org' : 'Centre';

  return (
    <div
      className="card event-card"
      onClick={() => onExpand(isExpanded ? null : event.id)}
      style={{
        cursor: 'pointer', padding: '12px 14px',
        border: isExpanded ? '1.5px solid var(--red,var(--cc-accent-strong))' : '1.5px solid transparent',
        boxShadow: isExpanded ? '0 6px 24px color-mix(in srgb, var(--cc-accent-strong) 15%, transparent)' : 'var(--shadow-sm)',
        transition: 'all 0.25s',
        transform: isExpanded ? 'translateY(-1px)' : 'none',
        marginBottom: 8,
      }}>
      {event.registrationOnly && event.status === 'pending' && <p role="note" style={{ margin:'0 0 12px', padding:14, fontSize:'1.3rem', fontWeight:900, color:'var(--cc-warning-strong)', background:'var(--cc-warning-soft)', borderRadius:12 }}>UnApproved</p>}
      {event.registrationOnly && event.status === 'cancelled' && <p role="status">Event deleted or cancelled. No places reserved.</p>}

      <div className="event-native-summary">
        <div className="event-native-poster">
          <button type="button" aria-label={hasPoster ? 'View event poster' : 'Expand event details'}
            onClick={click => { click.stopPropagation(); if (hasPoster) setLightbox(true); else onExpand(isExpanded ? null : event.id); }}>
            <img src={posterSrc} alt="" width="78" height="78" className={posterIsLogo ? 'event-logo' : ''}
              loading={imagePriority ? 'eager' : 'lazy'} fetchPriority={imagePriority ? 'high' : 'auto'} decoding="async" />
          </button>
          <span className="event-native-date"><small>{chip.mo}</small><strong>{chip.dy}</strong><small>{chip.wd}</small></span>
          {event.isLive ? <span className="event-native-live">LIVE</span>
            : <span className="event-native-calendar"><CalendarDays size={15} aria-hidden="true" /></span>}
        </div>
        <div className="event-native-content">
          <h3 className="event-native-title">{[displayType, event.hostName || event.organiserName || event.organizationName].filter(Boolean).join(' - ')}</h3>
          <div className="event-native-meta">
            <span><Clock size={13} aria-hidden="true" /> {displayTime || 'TBC'}</span>
            <span><MapPin size={13} aria-hidden="true" /><span className="event-native-suburb">{suburb || 'TBC'}</span></span>
          </div>
          <div className="event-native-badges"><span>{displayType}</span><span className="event-organiser">{organiser}</span></div>
        </div>
        <div className="event-native-buttons" onClick={click => click.stopPropagation()}>
          <button type="button" aria-label={isSaved ? 'Remove from Favourites' : 'Add to Favourites'} aria-pressed={isSaved}
            className={isSaved ? 'event-saved' : ''} disabled={!member || readOnly || !onSaveToggle}
            title={!member ? 'Sign in to save favourites.' : readOnly ? 'Disabled in the read-only preview.' : !onSaveToggle ? 'Favourites are unavailable on this screen.' : isSaved ? 'Remove from Favourites' : 'Add to Favourites'}
            onClick={() => onSaveToggle?.(event.id, !isSaved)}><Heart size={20} fill={isSaved ? 'currentColor' : 'none'} aria-hidden="true" /></button>
          <button type="button" aria-label={isExpanded ? 'Collapse event details' : 'Expand event details'} aria-expanded={Boolean(isExpanded)}
            onClick={() => onExpand(isExpanded ? null : event.id)}><ChevronDown size={20} style={{ transform:isExpanded ? 'rotate(180deg)' : undefined }} aria-hidden="true" /></button>
        </div>
      </div>

      {/* ── EXPANDED BODY ── */}
      <div style={{
        overflow: isExpanded ? 'visible' : 'hidden',
        maxHeight: isExpanded ? 'none' : '0px',
        opacity: isExpanded ? 1 : 0,
        marginTop: isExpanded ? 10 : 0,
        transition: 'opacity 0.3s ease, margin-top 0.25s ease',
      }}>
        {isExpanded && (
        <div className="event-card-details" style={{ borderTop:'1px solid var(--border)', paddingTop:10 }}>
          <EventActionPanel actions={actions} handlers={handlers} />
          <p className="event-action-note">{readOnly ? 'Read-only preview: actions that change data are disabled. ' : ''}Unavailable actions are dimmed; their labels explain the restriction.</p>
          {event.registrationOnly && ['live', 'reminder'].map(id => {
            const action = actions.find(item => item.id === id);
            return action?.disabled && action.reason ? <p className="event-action-note" role="note" key={id}>{action.reason}</p> : null;
          })}
          {showLiveControls && !actions.find(action => action.id === 'live').disabled && <div onClick={click => click.stopPropagation()}>
            <Suspense fallback={<span className="small">Loading live controls…</span>}>
              {event.isLive && event.liveWatchUrl && event.liveAppVisibility !== 'private' && !(event.registrationOnly && manage)
                ? <WatchLiveButton event={event} isGuest={!member} onWatchStarted={onStreamStart} />
                : manage && !readOnly && <GoLiveButton event={event} onLiveStarted={onStreamStart} onLiveEnded={() => {}} />}
            </Suspense>
          </div>}
          <p className="event-action-note">{fmtDate(event.eventDate)}</p>
          {/* Hijri badge */}
          {hijriDisplay && (
            <div style={{ marginBottom:8 }}>
              <span style={{ background:'var(--cc-warning-soft)', color:'var(--cc-warning-strong)',
                fontSize:'0.6875rem', padding:'3px 10px', borderRadius:99, fontWeight:700, fontFamily:'var(--font)' }}>
                🌙 {hijriDisplay}
              </span>
            </div>
          )}
          {/* Subject */}
          {event.eventSubject && (
            <p style={{ margin:'0 0 6px', fontWeight:700, color:'var(--red)', fontSize:'0.875rem', fontFamily:'var(--font)' }}>
              {event.eventSubject}
            </p>
          )}
          {event.notes?.trim() && (
            <p style={{
              margin:'0 0 8px', fontSize:'0.8125rem', whiteSpace:'pre-wrap',
              color:'var(--text)', fontWeight:400, overflowWrap:'anywhere',
              wordBreak:'break-word', lineHeight:1.45,
            }}>
              <strong>Notes:</strong> {event.notes.trim()}
            </p>
          )}
          {/* Address */}
          <p style={{ margin:'0 0 5px', fontSize:'0.8125rem', color:'var(--text)', fontWeight:400, fontFamily:'var(--font)' }}>
            📍 {addr}
            {(isGuest || event.registrationOnly && !registrationDetail?.privateDetails) && (
              <span style={{ fontSize:'0.6875rem', color:'var(--muted)', marginLeft:4 }}>
                {event.registrationOnly ? '(confirmed registration required for full address and poster)' : '(login for full address)'}
              </span>
            )}
          </p>
          {/* Audience */}
          {event.audienceType && (
            <p style={{ margin:'0 0 5px', fontSize:'0.8125rem', color:'var(--muted)', fontWeight:400, fontFamily:'var(--font)' }}>
              👥 {normAudience(event.audienceType)}
            </p>
          )}
          {/* Speaker */}
          {showReligious && event.speakerName && (
            <p style={{ margin:'0 0 4px', fontSize:'0.8125rem', color:'var(--text)', fontWeight:400, fontFamily:'var(--font)' }}>
              🎤 {event.speakerName}
            </p>
          )}
          {/* Reciters */}
          {showReligious && (event.reciters || []).filter(r => r.name).map((r, i) => (
            <p key={i} style={{ margin:'0 0 4px', fontSize:'0.8125rem', color:'var(--text)', fontWeight:400, fontFamily:'var(--font)' }}>
              🎙️ {r.customType || r.type}: {r.name}
            </p>
          ))}
          {/* On behalf */}
          {event.isOnBehalfOf && (
            <p style={{ margin:'0 0 4px', fontSize:'0.75rem', color:'var(--muted)', fontFamily:'var(--font)' }}>
              Submitted by {event.submittedByName || event.createdByUserEmail}
            </p>
          )}


        </div>
        )}
      </div>

      {seriesEditBusy && <p role="status">Checking future occurrences…</p>}
      {actionError && <p role="alert">{actionError}</p>}
      {registrationError && <p role="alert">{registrationError}</p>}
      {registrationBusy && <p role="status">Updating registration event...</p>}
      {contactOpen && <Suspense fallback={<p role="status">Opening host message…</p>}><ContactHostDialog key={user?.uid + event.id} event={event} onClose={() => setContactOpen(false)}/></Suspense>}
      {reminderOpen && <Suspense fallback={<p role="status">Loading reminder…</p>}><EventReminderDialog key={user?.uid + event.id} event={event} onClose={() => setReminderOpen(false)}/></Suspense>}
      {seriesArchiveOpen && <Suspense fallback={<p role="status">Loading series review…</p>}>
        <EventSeriesArchiveDialog key={event.id} event={event} onClose={() => setSeriesArchiveOpen(false)}/>
      </Suspense>}
      {/* ── Poster lightbox ── */}
      {lightbox && hasPoster && (
        <div
          onClick={e => { e.stopPropagation(); setLightbox(false); }}
          style={{
            position:'fixed', inset:0, zIndex:10000,
            background:'color-mix(in srgb, var(--cc-overlay-base) 90%, transparent)', display:'flex',
            alignItems:'center', justifyContent:'center', padding:20,
          }}>
          <button
            onClick={e => { e.stopPropagation(); setLightbox(false); }}
            aria-label="Close"
            style={{
              position:'absolute', top:16, right:16, width:44, height:44,
              borderRadius:'50%', background:'color-mix(in srgb, var(--cc-surface) 15%, transparent)', color:'var(--cc-on-primary)',
              border:'none', cursor:'pointer', fontSize:'1.5rem', lineHeight:1,
              display:'flex', alignItems:'center', justifyContent:'center',
            }}>×</button>
          <img src={posterSrc} alt="Event poster"
            onClick={e => e.stopPropagation()}
            style={{ maxWidth:'100%', maxHeight:'90vh', objectFit:'contain',
              borderRadius:12, boxShadow:'0 10px 50px color-mix(in srgb, var(--cc-shadow-base) 50%, transparent)' }} />
        </div>
      )}
    </div>
  );
}
