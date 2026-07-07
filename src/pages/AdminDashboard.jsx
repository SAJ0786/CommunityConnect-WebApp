import React, { useEffect, useMemo, useRef, useState } from 'react';
import EventCard from '../components/EventCard';
import EventFilters from '../components/EventFilters';
import { saveHijriSettings, getHijriSettings, saveMonthOverride } from '../services/settingsService';
import { listUsers, updateUserContactProfile, updateUserRole } from '../services/userService';
import { canManageUsers, isAdminRole } from '../utils/permissions';
import { ROLES } from '../utils/constants';
import { getHijriDisplay, getHijriParts, hijriToGregorian, HIJRI_MONTHS } from '../services/hijriService';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getApp } from 'firebase/app';
import * as XLSX from 'xlsx';
import { getOrganisations, addOrganisation, deleteOrganisation, updateOrganisation, fileToBase64, seedBuiltInOrgs } from '../services/organisationsService';
import { invalidateOrgsCache } from '../services/imageService';

const ROLE_LABELS = {
  [ROLES.USER]:        { label: 'User',        color: '#6b7280', bg: '#f3f4f6' },
  [ROLES.ADMIN]:       { label: 'Admin',       color: '#c0392b', bg: '#fdf2f1' },
  [ROLES.SUPER_ADMIN]: { label: 'Super Admin', color: '#7c3aed', bg: '#ede9fe' },
};

const normalisePhone = value => {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('0061')) digits = digits.slice(2);
  if (digits.startsWith('61') && digits.length >= 10) digits = `0${digits.slice(2)}`;
  return digits;
};

const userMatchesSearch = (userRecord, query) => {
  const textQuery = String(query || '').trim().toLowerCase();
  if (!textQuery) return true;

  const textFields = [
    userRecord.fullName,
    userRecord.displayName,
    userRecord.name,
    userRecord.email,
  ];
  if (textFields.some(value => String(value || '').toLowerCase().includes(textQuery))) return true;

  const queryDigits = normalisePhone(textQuery);
  if (!queryDigits) return false;
  return [userRecord.phone, userRecord.phoneNumber, userRecord.mobile, userRecord.mobileNumber]
    .some(value => normalisePhone(value).includes(queryDigits));
};

// ── YouTube OAuth Connect Card ────────────────────────────────────────────────
function YouTubeConnectCard() {
  const [status,    setStatus]    = React.useState('checking'); // checking | connected | disconnected
  const [loading,   setLoading]   = React.useState(false);
  const fns = getFunctions(getApp(), 'australia-southeast1');

  React.useEffect(() => {
    httpsCallable(fns, 'youtubeConnectionStatus')()
      .then(r => setStatus(r.data.connected ? 'connected' : 'disconnected'))
      .catch(() => setStatus('disconnected'));
  }, []);

  const handleConnect = async () => {
    setLoading(true);
    try {
      const result = await httpsCallable(fns, 'youtubeOAuthUrl')();
      const url = result.data.url;
      // Save current location so we can return after OAuth
      sessionStorage.setItem('ytOAuthReturnTo', window.location.href);
      // Navigate current tab — most reliable, never blocked by popup blocker
      window.location.href = url;
    } catch (e) {
      alert('Error getting YouTube auth URL: ' + e.message);
      setLoading(false);
    }
  };

  const checkConnection = async () => {
    const r = await httpsCallable(fns, 'youtubeConnectionStatus')();
    setStatus(r.data.connected ? 'connected' : 'disconnected');
  };

  return (
    <div className="card">
      <h3 style={{ margin:'0 0 6px', display:'flex', alignItems:'center', gap:8 }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="#FF0000">
          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
        </svg>
        YouTube Live Connection
      </h3>
      <p className="small" style={{ margin:'0 0 14px' }}>
        Connect your YouTube channel to automatically create broadcasts with event titles when going live.
      </p>
      {status === 'checking' && <p className="small">Checking connection…</p>}
      {status === 'connected' && (
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ color:'#27ae60', fontWeight:700, fontSize:'0.875rem' }}>✅ Connected to YouTube</span>
          <button className="btn-light" style={{ fontSize:'0.75rem' }} onClick={handleConnect}>
            Reconnect
          </button>
        </div>
      )}
      {status === 'disconnected' && (
        <button onClick={handleConnect} disabled={loading}
          style={{ background:'#FF0000', color:'white', border:'none',
            borderRadius:10, padding:'10px 20px', fontSize:'0.875rem',
            fontWeight:900, cursor:'pointer', display:'flex',
            alignItems:'center', gap:8 }}>
          {loading ? 'Opening…' : '🔗 Connect YouTube Channel'}
        </button>
      )}
      {status === 'waiting' && (
        <div>
          <p className="small" style={{ color:'var(--muted)', marginBottom:12 }}>
            Complete the Google sign-in and you will be redirected back automatically.
            Once back, click below to confirm the connection.
          </p>
          <button onClick={checkConnection}
            style={{ background:'#27ae60', color:'white', border:'none',
              borderRadius:10, padding:'10px 20px', fontSize:'0.875rem',
              fontWeight:900, cursor:'pointer' }}>
            Check Connection Status
          </button>
        </div>
      )}
    </div>
  );
}


function RoleBadge({ role }) {
  const r = ROLE_LABELS[role] || ROLE_LABELS[ROLES.USER];
  return (
    <span style={{ fontSize: '0.6875rem', fontWeight: 800, padding: '3px 9px',
      borderRadius: 99, background: r.bg, color: r.color }}>
      {r.label}
    </span>
  );
}

function legacySeriesKey(event) {
  return [
    event.createdByUserId || '', event.seriesStartDate || '', event.seriesEndDate || ''
  ].join('|');
}

export default function AdminDashboard({ events, user, profile, setPage, setEditingEvent, handleDelete, handleCopy }) {
  const [tab,            setTab]            = useState('users');
  const [hijriSettings,  setHijriSettings]  = useState({ adjustmentDays: 0, anchorDate: '', overrides: [] });
  const [anchorDate,     setAnchorDate]     = useState('');
  const [anchorMonth,    setAnchorMonth]    = useState('');
  const [anchorYear,     setAnchorYear]     = useState('');
  const [users,          setUsers]          = useState([]);
  const [calCount,       setCalCount]       = useState(null);
  const [inactiveCount,  setInactiveCount]  = useState(null);
  const [calSyncUids,    setCalSyncUids]     = useState(new Set());
  const [msg,            setMsg]            = useState({ text: '', type: '' });
  const [search,         setSearch]         = useState('');
  const [saving,         setSaving]         = useState(false);
  const [editingUser,    setEditingUser]    = useState(null);
  const [editUserName,   setEditUserName]   = useState('');
  const [editUserEmail,  setEditUserEmail]  = useState('');
  const [savingUserEdit, setSavingUserEdit] = useState(false);
  const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

  const [recalculating,  setRecalculating]  = useState(false);
  // ── Organisations tab state ──────────────────────────────────────────────
  const [orgs,           setOrgs]           = useState(null);  // null = not loaded
  const [orgsLoading,    setOrgsLoading]    = useState(false);
  const [orgMsg,         setOrgMsg]         = useState('');
  const [newOrgName,     setNewOrgName]     = useState('');
  const [newOrgSlug,     setNewOrgSlug]     = useState('');
  const [newOrgLocation, setNewOrgLocation] = useState('');
  const [newOrgLogo,     setNewOrgLogo]     = useState('');   // base64 data-uri
  const [newOrgLogoFile, setNewOrgLogoFile] = useState(null);
  const [editingOrgId,   setEditingOrgId]   = useState(null);
  const [editOrgName,    setEditOrgName]    = useState('');
  const [editOrgSlug,    setEditOrgSlug]    = useState('');
  const [editOrgLocation,setEditOrgLocation]= useState('');
  const [editOrgLogo,    setEditOrgLogo]    = useState('');
  const [editOrgSaving,  setEditOrgSaving]  = useState(false);
  const [importing,      setImporting]      = useState(false);
  const [importResult,   setImportResult]   = useState(null);
  const [reminderMode,   setReminderMode]   = useState('date');
  const [reminderDate,   setReminderDate]   = useState(new Date().toISOString().slice(0, 10));
  const [reminderFrom,   setReminderFrom]   = useState(new Date().toISOString().slice(0, 10));
  const [reminderTo,     setReminderTo]     = useState(new Date().toISOString().slice(0, 10));
  const [reminderMonth,  setReminderMonth]  = useState(new Date().toISOString().slice(0, 7));
  const [sendingReminder,setSendingReminder]= useState(false);
  const [reminderResult, setReminderResult] = useState(null);
  const [adminEvents,    setAdminEvents]    = useState(null);
  const [adminExpandedId,setAdminExpandedId]= useState(null);
  const [communityMsg,   setCommunityMsg]   = useState('');
  const [deleteTarget,   setDeleteTarget]   = useState(null);
  // Transfer ownership state
  const [selectedEventIds, setSelectedEventIds] = useState(new Set());
  const [filteredAdminEvents, setFilteredAdminEvents] = useState(null);
  const [showTransferPanel, setShowTransferPanel] = useState(false);
  const [transferToUid,    setTransferToUid]    = useState('');
  const [transferring,     setTransferring]     = useState(false);
  const [transferError,    setTransferError]    = useState('');
  const [backfillingSeries,setBackfillingSeries]= useState(false);
  // ── Repair tool state ────────────────────────────────────────────────────
  const [repairEvents,   setRepairEvents]   = useState(null);   // null=not loaded
  const [repairLoading,  setRepairLoading]  = useState(false);
  const [repairOverrides,setRepairOverrides]= useState([]);
  const [repairMsg,      setRepairMsg]      = useState('');
  const [fixingId,       setFixingId]       = useState(null);   // event id being fixed
  const [fixDay,         setFixDay]         = useState('');
  const [fixMonth,       setFixMonth]       = useState('');
  const [fixYear,        setFixYear]        = useState('');
  const [fixSeries,      setFixSeries]      = useState(false);  // apply to whole series
  const fileInputRef = useRef(null);

  const isSuperAdmin = profile?.role === ROLES.SUPER_ADMIN;
  const fns = getFunctions(getApp(), 'australia-southeast1');
  const displayedAdminEvents = filteredAdminEvents ?? adminEvents ?? [];
  const seriesCounts = useMemo(() => {
    const counts = new Map();
    for (const event of adminEvents || []) {
      if (!event.isSeries) continue;
      const key = event.seriesId || legacySeriesKey(event);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
  }, [adminEvents]);

  useEffect(() => {
    if (!isAdminRole(profile?.role)) return;
    getHijriSettings().then(s => {
      setHijriSettings(s);
      setAnchorDate(s.anchorDate || '');
      setAnchorMonth(s.anchorMonth || '');
      setAnchorYear(s.anchorYear || '');
    });
    listUsers().then(setUsers);
    httpsCallable(fns, 'getCalendarStats')()
      .then(r => { setCalCount(r.data.count); setCalSyncUids(new Set(r.data.uids || [])); })
      .catch(() => {});
    import('firebase/firestore').then(async ({ collection, getCountFromServer }) => {
      const { db } = await import('../firebase/firebase');
      const snapshot = await getCountFromServer(collection(db, 'archivedEvents'));
      setInactiveCount(snapshot.data().count);
    }).catch(() => setInactiveCount(null));
  }, [profile]);

  // Auto-load admin events when events tab opens
  useEffect(() => {
    if (tab === 'events' && adminEvents === null) loadAdminEvents();
    if (tab === 'orgs'   && orgs === null)        loadOrgs();
  }, [tab]);

  if (!isAdminRole(profile?.role)) {
    return <div className="card">Admin access required.</div>;
  }

  const showMsg = (text, type = 'success') => {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: '', type: '' }), 4000);
  };

  // ── Hijri recalculate ────────────────────────────────────────────────────────
  const recalculateHijri = async () => {
    setRecalculating(true);
    try {
      const fn = httpsCallable(fns, 'recalculateHijriEvents');
      const result = await fn({});
      const { hijriEvents, gregEvents, updated } = result.data;
      showMsg(`✅ Recalculated ${updated} events — ${hijriEvents} Hijri-entered (Gregorian dates updated), ${gregEvents} Gregorian-entered (Hijri tags updated).`);
    } catch (e) { showMsg('Recalculate failed: ' + e.message, 'error'); }
    setRecalculating(false);
  };

  // ── Hijri save + auto-recalculate ───────────────────────────────────────────
  const saveHijri = async () => {
    if (!anchorDate) return showMsg('Please select the Gregorian date for 1st of the Hijri month.', 'error');
    if (!anchorMonth) return showMsg('Please select the Hijri month.', 'error');
    if (!anchorYear) return showMsg('Please enter the Hijri year.', 'error');
    setSaving(true);
    try {
      const hMonth = Number(anchorMonth);
      const hYear = Number(anchorYear);
      const anchor = new Date(anchorDate + 'T00:00:00');
      const today  = new Date();
      today.setHours(0,0,0,0);
      const diffDays = Math.round((anchor - today) / 86400000);
      const overrides = await saveMonthOverride(hYear, hMonth, anchorDate);
      const settings = {
        ...(hijriSettings || {}),
        adjustmentDays: diffDays,
        anchorDate,
        anchorMonth: hMonth,
        anchorYear: hYear,
        overrides,
      };
      await saveHijriSettings(settings);
      setHijriSettings(settings);
      showMsg('Hijri setting saved. Now recalculating all event dates…');
    } catch (e) { showMsg(e.message, 'error'); setSaving(false); return; }
    setSaving(false);
    // Auto-trigger recalculate after save
    await recalculateHijri();
  };

  // ── Load all events for admin ───────────────────────────────────────────────
  const loadAdminEvents = async () => {
    try {
      const { getDocs, collection, query, orderBy, where } = await import('firebase/firestore');
      const { db } = await import('../firebase/firebase');
      const snap = await getDocs(query(
        collection(db, 'events'),
        where('status', '==', 'active'),
        orderBy('eventDate', 'asc')
      ));
      setAdminEvents(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setFilteredAdminEvents(null);
      setSelectedEventIds(new Set());
      setShowTransferPanel(false);
    } catch (e) { showMsg('Error loading events: ' + e.message, 'error'); }
  };

  // ── Clear live status ───────────────────────────────────────────────────────
  // ── Repair: load all Hijri-entered events ────────────────────────────────
  const loadRepairEvents = async () => {
    setRepairLoading(true); setRepairMsg('');
    try {
      const { getDocs, collection, query, where } = await import('firebase/firestore');
      const { db } = await import('../firebase/firebase');
      // Load overrides for accurate conversion
      const ov = await getHijriSettings().catch(() => ({ overrides: [] }));
      setRepairOverrides(ov.overrides || []);
      // Get all Hijri-entered events — sort in JS to avoid needing a composite index
      const snap = await getDocs(query(
        collection(db, 'events'),
        where('enteredAsHijri', '==', true)
      ));
      const evs = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.eventDate || '').localeCompare(b.eventDate || ''));
      setRepairEvents(evs);
      if (evs.length === 0) setRepairMsg('No Hijri-entered events found.');
    } catch (e) { setRepairMsg('Error loading: ' + e.message); }
    setRepairLoading(false);
  };

  // ── Repair: start fixing an event ────────────────────────────────────────
  const startFix = (ev) => {
    setFixingId(ev.id);
    setFixDay(String(ev.hijriDay || ''));
    setFixMonth(String(ev.hijriMonth || ''));
    setFixYear(String(ev.hijriYear || ''));
    setFixSeries(false);
    setRepairMsg('');
  };

  // ── Repair: apply fix to one event or whole series ────────────────────────
  const applyFix = async (ev) => {
    const d = parseInt(fixDay), m = parseInt(fixMonth), y = parseInt(fixYear);
    if (!d || !m || !y || d < 1 || d > 30 || m < 1 || m > 12) {
      setRepairMsg('❌ Please enter a valid Hijri day (1-30), month (1-12) and year.'); return;
    }
    const HIJRI_MN = ['Muharram','Safar','Rabi al-Awwal','Rabi al-Thani',
      'Jumada al-Awwal','Jumada al-Thani',"Rajab","Sha'ban",
      'Ramadan','Shawwal',"Dhu al-Qi'dah",'Dhu al-Hijjah'];

    setRepairLoading(true);
    try {
      const { doc, updateDoc, getDocs, collection, query, where, serverTimestamp }
        = await import('firebase/firestore');
      const { db } = await import('../firebase/firebase');
      // Always re-fetch overrides fresh — never trust stale React state
      const freshSettings = await getHijriSettings().catch(() => ({ overrides: [] }));
      const liveOverrides = freshSettings.overrides || [];
      setRepairOverrides(liveOverrides);

      if (fixSeries && ev.seriesStartDate && ev.seriesEndDate) {
        // Fix all events in the series — sort in JS to avoid composite index
        const snap = await getDocs(query(
          collection(db, 'events'),
          where('seriesStartDate', '==', ev.seriesStartDate),
          where('seriesEndDate',   '==', ev.seriesEndDate)
        ));
        const hijriOrder = (item) => {
          const data = item.data();
          return data.hijriYear && data.hijriMonth && data.hijriDay
            ? Number(data.hijriYear) * 372 + Number(data.hijriMonth) * 31 + Number(data.hijriDay)
            : null;
        };
        const sortedDocs = [...snap.docs]
          .filter(docSnap => docSnap.data().enteredAsHijri === true)
          .sort((a, b) => {
            const ah = hijriOrder(a);
            const bh = hijriOrder(b);
            if (ah !== null && bh !== null && ah !== bh) return ah - bh;
            return (a.data().eventDate || '').localeCompare(b.data().eventDate || '');
          });
        let fixCount = 0;
        // Calculate what the correct Greg date is for day 1 of the series
        const startGreg = hijriToGregorian(d, m, y, liveOverrides);
        if (!startGreg) { setRepairMsg('❌ Could not convert that Hijri date. Check values.'); setRepairLoading(false); return; }

        for (let i = 0; i < sortedDocs.length; i++) {
          const docSnap = sortedDocs[i];
          // Use index (0,1,2…) as offset from corrected start — never trust existing evDate
          const corrDate = new Date(startGreg + 'T00:00:00');
          corrDate.setDate(corrDate.getDate() + i);
          const corrGreg = corrDate.toISOString().slice(0, 10);
          const corrH = getHijriParts(corrDate, liveOverrides);
          if (!corrH) continue;
          const corrHijriDisplay = `${corrH.day} ${HIJRI_MN[corrH.month - 1]} ${corrH.year} AH`;
          await updateDoc(doc(db, 'events', docSnap.id), {
            eventDate:  corrGreg,
            hijriDate:  corrHijriDisplay,
            hijriDay:   corrH.day,
            hijriMonth: corrH.month,
            hijriYear:  corrH.year,
            enteredAsHijri: true,
            updatedAt:  serverTimestamp()
          });
          fixCount++;
        }
        setRepairMsg(`✅ Fixed ${fixCount} events in the series.`);
      } else {
        // Fix single event
        const newGreg = hijriToGregorian(d, m, y, liveOverrides);
        if (!newGreg) { setRepairMsg('❌ Could not convert that Hijri date. Check values.'); setRepairLoading(false); return; }
        const hijriDisplay = `${d} ${HIJRI_MN[m - 1]} ${y} AH`;
        await updateDoc(doc(db, 'events', ev.id), {
          eventDate:  newGreg,
          hijriDate:  hijriDisplay,
          hijriDay:   d,
          hijriMonth: m,
          hijriYear:  y,
          enteredAsHijri: true,
          updatedAt:  serverTimestamp()
        });
        setRepairMsg(`✅ Fixed event — new date: ${newGreg} (${hijriDisplay})`);
      }

      setFixingId(null);
      await loadRepairEvents(); // reload list
    } catch (e) { setRepairMsg('❌ Error: ' + e.message); }
    setRepairLoading(false);
  };

    // ── Transfer selected event ownership ────────────────────────────────
    const toggleEventSelection = (eventId) => {
      setSelectedEventIds(prev => {
        const next = new Set(prev);
        if (next.has(eventId)) next.delete(eventId);
        else next.add(eventId);
        return next;
      });
    };

    const doTransferEvents = async () => {
      const toUser = users.find(u => u.id === transferToUid);
      if (!toUser) { setTransferError('Please select a valid user.'); return; }
      const ids = [...selectedEventIds];
      if (ids.length === 0) { setTransferError('Select at least one event.'); return; }
      setTransferring(true);
      setTransferError('');
      try {
        const { doc, writeBatch, serverTimestamp } = await import('firebase/firestore');
        const { db } = await import('../firebase/firebase');
        for (let offset = 0; offset < ids.length; offset += 450) {
          const batch = writeBatch(db);
          ids.slice(offset, offset + 450).forEach(eventId => {
            batch.update(doc(db, 'events', eventId), {
              createdByUserId: transferToUid,
              createdByName: toUser.fullName || toUser.email || '',
              createdByUserEmail: toUser.email || '',
              updatedAt: serverTimestamp(),
            });
          });
          await batch.commit();
        }
        showMsg(`${ids.length} event${ids.length === 1 ? '' : 's'} transferred to ${toUser.fullName || toUser.email}.`);
        setAdminEvents(prev => prev ? prev.map(e =>
          selectedEventIds.has(e.id)
            ? { ...e, createdByUserId: transferToUid, createdByName: toUser.fullName || toUser.email || '', createdByUserEmail: toUser.email || '' }
            : e
        ) : prev);
        setFilteredAdminEvents(prev => prev ? prev.map(e =>
          selectedEventIds.has(e.id)
            ? { ...e, createdByUserId: transferToUid, createdByName: toUser.fullName || toUser.email || '', createdByUserEmail: toUser.email || '' }
            : e
        ) : prev);
        setSelectedEventIds(new Set());
        setShowTransferPanel(false);
        setTransferToUid('');
      } catch(e) {
        setTransferError(e.message || 'The transfer could not be completed.');
        showMsg('Transfer failed: ' + e.message, 'error');
      }
      setTransferring(false);
    };

    const backfillLegacySeriesIds = async () => {
      const legacy = (adminEvents || []).filter(e => e.isSeries && !e.seriesId);
      if (legacy.length === 0) { showMsg('All series already have a permanent series ID.'); return; }
      setBackfillingSeries(true);
      try {
        const groups = new Map();
        legacy.forEach(event => {
          const key = legacySeriesKey(event);
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(event);
        });
        const { doc, writeBatch, serverTimestamp } = await import('firebase/firestore');
        const { db } = await import('../firebase/firebase');
        let updated = 0;
        let skipped = 0;
        for (const group of groups.values()) {
          const dates = group.map(event => event.eventDate).filter(Boolean);
          const hasIdentity = group.every(event =>
            event.createdByUserId && event.seriesStartDate && event.seriesEndDate
          );
          if (!hasIdentity || dates.length !== group.length || new Set(dates).size !== dates.length) {
            skipped += group.length;
            continue;
          }
          const seriesId = typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `series_${Date.now()}_${Math.random().toString(36).slice(2)}`;
          for (let offset = 0; offset < group.length; offset += 450) {
            const batch = writeBatch(db);
            group.slice(offset, offset + 450).forEach(event => {
              batch.update(doc(db, 'events', event.id), { seriesId, updatedAt: serverTimestamp() });
            });
            await batch.commit();
          }
          updated += group.length;
        }
        showMsg(`Assigned permanent series IDs to ${updated} legacy events.${skipped ? ` Skipped ${skipped} ambiguous events for manual review.` : ''}`,
          skipped ? 'error' : 'success');
        await loadAdminEvents();
      } catch (e) { showMsg('Series ID backfill failed: ' + e.message, 'error'); }
      setBackfillingSeries(false);
    };

    // ── Organisations CRUD ──────────────────────────────────────────────────
    const loadOrgs = async () => {
      setOrgsLoading(true);
      try {
        await seedBuiltInOrgs();   // seeds built-ins if not already in Firestore
        setOrgs(await getOrganisations());
      }
      catch (e) { setOrgMsg('Error loading: ' + e.message); }
      setOrgsLoading(false);
    };

    const handleOrgLogoChange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setNewOrgLogoFile(file);
      const b64 = await fileToBase64(file);
      setNewOrgLogo(b64);
    };

    const handleAddOrg = async () => {
      if (!newOrgName.trim()) { setOrgMsg('Organisation name is required.'); return; }
      const slug = newOrgSlug.trim() || newOrgName.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      setOrgsLoading(true); setOrgMsg('');
      try {
        await addOrganisation({ name: newOrgName.trim(), slug, location: newOrgLocation.trim(), logoBase64: newOrgLogo });
        invalidateOrgsCache();
        showMsg('Organisation added: ' + newOrgName.trim());
        setNewOrgName(''); setNewOrgSlug(''); setNewOrgLocation(''); setNewOrgLogo(''); setNewOrgLogoFile(null);
        await loadOrgs();
      } catch (e) {
        const msg = e.code === 'permission-denied'
          ? 'Permission denied — make sure Firestore rules are deployed (firebase deploy --only firestore)'
          : 'Error: ' + e.message;
        setOrgMsg(msg);
        showMsg(msg, 'error');
      }
      setOrgsLoading(false);
    };

    const handleDeleteOrg = async (org) => {
      if (!confirm('Delete ' + org.name + '? Events using this organisation will fall back to the Community Events logo.')) return;
      try {
        await deleteOrganisation(org.id);
        invalidateOrgsCache();
        showMsg('Deleted: ' + org.name);
        setOrgs(prev => prev.filter(o => o.id !== org.id));
      } catch (e) { showMsg('Error: ' + e.message, 'error'); }
    };

    const startEditOrg = (org) => {
      setEditingOrgId(org.id);
      setEditOrgName(org.name || '');
      setEditOrgSlug(org.slug || '');
      setEditOrgLocation(org.location || '');
      setEditOrgLogo(org.logoBase64 || '');
    };

    const saveEditOrg = async () => {
      if (!editOrgName.trim()) { setOrgMsg('Name is required.'); return; }
      setEditOrgSaving(true);
      try {
        await updateOrganisation(editingOrgId, {
          name: editOrgName.trim(),
          slug: editOrgSlug.trim(),
          location: editOrgLocation.trim(),
          logoBase64: editOrgLogo,
        });
        invalidateOrgsCache();
        setOrgs(prev => prev.map(o => o.id === editingOrgId
          ? { ...o, name: editOrgName.trim(), slug: editOrgSlug.trim(), location: editOrgLocation.trim(), logoBase64: editOrgLogo }
          : o));
        showMsg('Updated: ' + editOrgName.trim());
        setEditingOrgId(null);
      } catch (e) { setOrgMsg('Error: ' + e.message); }
      setEditOrgSaving(false);
    };

    const handleEditOrgLogoChange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const b64 = await fileToBase64(file);
      setEditOrgLogo(b64);
    };

    const clearLiveStatus = async (eventId) => {
    try {
      const { doc, updateDoc, serverTimestamp } = await import('firebase/firestore');
      const { db } = await import('../firebase/firebase');
      await updateDoc(doc(db, 'events', eventId), {
        isLive: false, liveUrl: null, updatedAt: serverTimestamp()
      });
      setAdminEvents(prev => prev
        ? prev.map(ev => ev.id === eventId ? { ...ev, isLive: false, liveUrl: null } : ev)
        : null
      );
      showMsg('✅ Live status cleared');
    } catch (e) { showMsg('Error: ' + e.message, 'error'); }
  };

  // ── Send reminder now ───────────────────────────────────────────────────────
  const sendReminderNow = async () => {
    setSendingReminder(true); setReminderResult(null);
    try {
      const fn = httpsCallable(fns, 'sendRemindersNow');
      let payload = { mode: reminderMode };
      if (reminderMode === 'date')  payload.date  = reminderDate;
      if (reminderMode === 'range') { payload.from = reminderFrom; payload.to = reminderTo; }
      if (reminderMode === 'month') payload.month = reminderMonth;
      const result = await fn(payload);
      setReminderResult({ message: result.data.message, error: false });
    } catch (e) {
      setReminderResult({ message: e.message || 'Failed to send.', error: true });
    }
    setSendingReminder(false);
  };

  // ── Send community message ──────────────────────────────────────────────────
  const sendCommunityMsg = async () => {
    if (!communityMsg.trim()) return;
    setSendingReminder(true); setReminderResult(null);
    try {
      const fn = httpsCallable(fns, 'sendRemindersNow');
      const result = await fn({
        mode: 'date',
        date: new Date().toISOString().slice(0, 10),
        customMode: true,
        customMessage: communityMsg.trim(),
      });
      setReminderResult({ message: result.data.message || '✅ Message sent!', error: false });
      setCommunityMsg('');
    } catch (e) {
      setReminderResult({ message: e.message || 'Failed to send.', error: true });
    }
    setSendingReminder(false);
  };

  // ── Role change ─────────────────────────────────────────────────────────────
  const sendStoreAnnouncement = async () => {
    if (!confirm('Send the App Store and Microsoft Store announcement to all users who have email reminders enabled?')) return;
    setSendingReminder(true); setReminderResult(null);
    try {
      const fn = httpsCallable(fns, 'sendRemindersNow');
      const result = await fn({
        mode: 'date',
        date: new Date().toISOString().slice(0, 10),
        customMode: true,
        customTemplate: 'storeAnnouncement',
      });
      setReminderResult({ message: result.data.message || 'Store announcement sent.', error: false });
    } catch (e) {
      setReminderResult({ message: e.message || 'Failed to send store announcement.', error: true });
    }
    setSendingReminder(false);
  };

  const changeRole = async (u, role) => {
    if (u.id === user.uid && role !== ROLES.SUPER_ADMIN) {
      const sas = users.filter(x => x.role === ROLES.SUPER_ADMIN);
      if (sas.length <= 1) { alert('You are the only Super Admin. Assign another before stepping down.'); return; }
    }
    try {
      await updateUserRole(u.id, role);
      setUsers(await listUsers());
      showMsg(`${u.fullName || u.email} is now ${ROLE_LABELS[role].label}.`);
    } catch (e) { alert(e.message); }
  };

  // ── Excel template download ─────────────────────────────────────────────────
  const downloadTemplate = () => {
    const headers = ['Host Name *','Event Date * (YYYY-MM-DD)','Start Time * (HH:MM)','End Time (HH:MM)',
      'Event Type *','Custom Event Type','Event Subject','Audience Type *','Street Address *',
      'Suburb *','State *','Postcode *','On Behalf Of (TRUE/FALSE)','Host Contact','Speaker Name',
      'Reciter 1 Type','Reciter 1 Name','Reciter 2 Type','Reciter 2 Name','Reciter 3 Type','Reciter 3 Name'];
    const sample = ['Ali Hussain','2026-07-10','19:30','21:30','Majlis','','Shahadat of Imam Hussain (A.S.)',
      'Gents only','12 Smith Street','Auburn','NSW','2144','FALSE','','Sheikh Abbas',
      'Noha','Hassan Kazmi','Salam','Ali Rizvi','',''];
    const notes = ['Required','Required · YYYY-MM-DD','Required · 24hr HH:MM','Optional · 24hr HH:MM',
      'Majlis|Milad|Birthday|Informal get together|Custom','Required if Event Type = Custom',
      'Optional topic/subject','Gents only|Ladies only|Kids only|Family Event',
      'Required','Required','Required e.g. NSW','Required e.g. 2144','TRUE or FALSE',
      'Phone/email of actual host','Majlis, Milad or Custom only',
      'Soz|Salam|Manqebat|Noha|Reciter|Peshkhani|Other','Majlis, Milad or Custom only',
      'Soz|Salam|Manqebat|Noha|Reciter|Peshkhani|Other','Majlis, Milad or Custom only',
      'Soz|Salam|Manqebat|Noha|Reciter|Peshkhani|Other','Majlis, Milad or Custom only'];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, notes, sample]);
    ws['!cols'] = headers.map(h => ({ wch: Math.max(h.length + 4, 18) }));
    XLSX.utils.book_append_sheet(wb, ws, 'Events');
    XLSX.writeFile(wb, 'Community_Events_Import_Template.xlsx');
  };

  // ── Excel import ────────────────────────────────────────────────────────────
  const handleImport = async e => {
    const file = e.target.files[0]; if (!file) return;
    e.target.value = ''; setImporting(true); setImportResult(null);
    try {
      const buffer  = await file.arrayBuffer();
      const wb      = XLSX.read(buffer, { type: 'array' });
      const ws      = wb.Sheets[wb.SheetNames[0]];
      const rows    = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      const dataRows= rows.slice(2).filter(r => r.some(c => c !== ''));
      if (!dataRows.length) { showMsg('No data rows found.', 'error'); setImporting(false); return; }
      const evs = dataRows.map(r => ({
        hostName: String(r[0]||'').trim(), eventDate: String(r[1]||'').trim(),
        startTime: String(r[2]||'').trim(), endTime: String(r[3]||'').trim(),
        eventType: String(r[4]||'').trim(), customEventType: String(r[5]||'').trim(),
        eventSubject: String(r[6]||'').trim(), audienceType: String(r[7]||'').trim(),
        street: String(r[8]||'').trim(), suburb: String(r[9]||'').trim(),
        state: String(r[10]||'').trim(), postcode: String(r[11]||'').trim(),
        isOnBehalfOf: String(r[12]||'').trim().toUpperCase()==='TRUE',
        hostContact: String(r[13]||'').trim(), speakerName: String(r[14]||'').trim(),
        reciter1Type: String(r[15]||'').trim(), reciter1Name: String(r[16]||'').trim(),
        reciter2Type: String(r[17]||'').trim(), reciter2Name: String(r[18]||'').trim(),
        reciter3Type: String(r[19]||'').trim(), reciter3Name: String(r[20]||'').trim(),
      }));
      const result = await httpsCallable(fns, 'bulkImportEvents')({ events: evs });
      setImportResult(result.data);
      showMsg(result.data.message, result.data.errors.length > 0 ? 'error' : 'success');
    } catch (err) { showMsg('Import failed: ' + err.message, 'error'); }
    setImporting(false);
  };

  const [calFilter, setCalFilter] = useState(false); // when true, show only calendar-synced users

  const filteredUsers = useMemo(() => users.filter(u =>
    userMatchesSearch(u, search) && (!calFilter || calSyncUids.has(u.id))
  ), [users, search, calFilter, calSyncUids]);

  const openUserEditor = (target) => {
    setEditingUser(target);
    setEditUserName(target.fullName || '');
    setEditUserEmail(target.email || '');
  };

  const saveUserEditor = async () => {
    if (!editingUser) return;
    const fullName = editUserName.trim().replace(/\s+/g, ' ');
    const email = editUserEmail.trim().toLowerCase();
    if (fullName.length < 2) return showMsg('Enter a valid full name.', 'error');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showMsg('Enter a valid email address.', 'error');

    setSavingUserEdit(true);
    try {
      const updated = await updateUserContactProfile(editingUser.id, fullName, email);
      setUsers(current => current.map(item => item.id === editingUser.id ? { ...item, ...updated } : item));
      setEditingUser(null);
      showMsg('User name and email updated.', 'success');
    } catch (error) {
      showMsg(error.code === 'functions/already-exists'
        ? (error.message || 'This phone number or email is already used by another account.')
        : `Update failed: ${error.message}`, 'error');
    } finally {
      setSavingUserEdit(false);
    }
  };

  const stats = [
    { label: 'Total Users',    value: users.length },
    { label: 'Super Admins',   value: users.filter(u => u.role === ROLES.SUPER_ADMIN).length },
    { label: 'Admins',         value: users.filter(u => u.role === ROLES.ADMIN).length },
    { label: 'Calendar Syncs', value: calCount ?? '…' },
    { label: 'Active Events',  value: events.length },
    { label: 'Inactive Events', value: inactiveCount ?? '...' },
  ];

  const TABS = [
    { key: 'users',    label: 'Users'         },
    { key: 'import',   label: 'Import'        },
    { key: 'events',   label: 'Events'        },
    { key: 'repair',   label: '🛠 Repair'     },
    { key: 'orgs',     label: '🏛 Orgs'       },
    { key: 'settings', label: 'Settings'      },
  ];

  return (
    <>
      {/* Header */}
      <div className="card" style={{
        background: 'linear-gradient(135deg,#c0392b,#a93226)',
        color: 'white', border: 'none', marginBottom: 0, borderRadius: '20px 20px 0 0'
      }}>
        <h2 style={{ color: 'white', margin: '0 0 4px' }}>Admin Dashboard</h2>
        <p style={{ color: 'rgba(255,255,255,.85)', margin: 0, fontSize: '0.8125rem' }}>
          {profile?.fullName || user?.email} · <RoleBadge role={profile?.role} />
        </p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))',
        gap: 1, background: 'var(--border)', border: '1px solid var(--border)', borderTop: 'none' }}>
        {stats.map(s => (
          <div key={s.label} style={{ background: 'white', padding: '14px 12px', textAlign: 'center' }}>
            <div style={{ fontSize: '1.375rem', fontWeight: 900, color: '#c0392b' }}>{s.value}</div>
            <div style={{ fontSize: '0.6875rem', color: 'var(--muted)', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)',
        background: 'white', marginBottom: 16, borderRadius: '0 0 20px 20px', overflow: 'hidden' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            flex: 1, padding: '12px 0', fontWeight: tab === t.key ? 900 : 600,
            fontSize: '0.8125rem', border: 'none',
            borderBottom: tab === t.key ? '3px solid #c0392b' : '3px solid transparent',
            background: 'white', color: tab === t.key ? '#c0392b' : 'var(--muted)',
            cursor: 'pointer', boxShadow: 'none',
          }}>{t.label}</button>
        ))}
      </div>

      {/* Global message */}
      {msg.text && (
        <div className={msg.type === 'error' ? 'error' : 'success'} style={{ margin: '0 16px 12px' }}>
          {msg.text}
        </div>
      )}

      {/* ── USERS TAB ── */}
      {tab === 'users' && (
        <div className="card">
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
            marginBottom:14, flexWrap:'wrap', gap:8 }}>
            <h3 style={{ margin:0 }}>User Management</h3>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
              <button onClick={() => setCalFilter(f => !f)}
                style={{ fontSize:'0.75rem', padding:'8px 12px', borderRadius:10,
                  border: calFilter ? '1px solid #0f766e' : '1px solid var(--border)',
                  background: calFilter ? '#e6f4f1' : 'white',
                  color: calFilter ? '#0f766e' : 'var(--text)',
                  fontWeight:800, cursor:'pointer', whiteSpace:'nowrap' }}>
                📅 {calFilter ? 'Showing Synced Only' : `Calendar Synced (${calSyncUids.size})`}
              </button>
              <input placeholder="Search name, email or phone…" aria-label="Search users by name, email or phone" value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ width:220, padding:'8px 12px', fontSize:'0.8125rem',
                  borderRadius:10, border:'1px solid var(--border)', marginBottom:0 }} />
            </div>
          </div>
          {!isSuperAdmin && (
            <div className="notice" style={{ marginBottom:12 }}>You can correct user names and emails. Role changes and account deletion require Super Admin access.</div>
          )}
          {editingUser && (
            <div style={{ marginBottom:14, padding:14, border:'1px solid #acd9d5', borderRadius:8, background:'#f3fbfa' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, marginBottom:12 }}>
                <h4 style={{ margin:0 }}>Edit User Details</h4>
                <span className="small">{editingUser.phone || 'No phone recorded'}</span>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:10 }}>
                <div>
                  <label htmlFor="admin-user-name">Full name</label>
                  <input id="admin-user-name" value={editUserName} maxLength={100}
                    onChange={event => setEditUserName(event.target.value)} />
                </div>
                <div>
                  <label htmlFor="admin-user-email">Email</label>
                  <input id="admin-user-email" type="email" value={editUserEmail} maxLength={254}
                    onChange={event => setEditUserEmail(event.target.value)} />
                </div>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={saveUserEditor} disabled={savingUserEdit}>
                  {savingUserEdit ? 'Saving...' : 'Save User'}
                </button>
                <button className="btn-muted" disabled={savingUserEdit} onClick={() => setEditingUser(null)}>Cancel</button>
              </div>
            </div>
          )}
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {/* Sort by join date (createdAt asc) */}
            {[...filteredUsers].sort((a,b) => {
              const ta = a.createdAt?.seconds || 0;
              const tb = b.createdAt?.seconds || 0;
              return ta - tb;
            }).map(u => (
              <div key={u.id} style={{ display:'flex', alignItems:'flex-start',
                justifyContent:'space-between', padding:'12px 14px',
                borderRadius:12, border:'1px solid var(--border)',
                background: u.id === user?.uid ? '#fdf2f1' : 'white',
                flexWrap:'wrap', gap:8 }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:800, fontSize:'0.875rem' }}>
                    {u.fullName || '—'}
                    {u.id === user?.uid && <span style={{ fontSize:'0.6875rem', color:'#c0392b', marginLeft:6 }}>(you)</span>}
                  </div>
                  <div style={{ fontSize:'0.75rem', color:'var(--muted)' }}>{u.email}</div>
                  {u.phone && <div style={{ fontSize:'0.75rem', color:'var(--muted)' }}>{u.phone}</div>}
                  {u.createdAt?.seconds && (
                    <div style={{ fontSize:'0.6875rem', color:'var(--muted)' }}>
                      Joined {new Date(u.createdAt.seconds*1000).toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'})}
                    </div>
                  )}
                  <div style={{ marginTop:4, display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
                    <RoleBadge role={u.role} />
                    {calSyncUids.has(u.id) && (
                      <span style={{ fontSize:'0.6875rem', fontWeight:800, color:'#0f766e',
                        background:'#e6f4f1', border:'1px solid #b8e0db',
                        borderRadius:20, padding:'2px 9px', display:'inline-flex',
                        alignItems:'center', gap:4 }}>
                        📅 Calendar Synced
                      </span>
                    )}
                  </div>
                </div>
                <button className="btn-light" onClick={() => openUserEditor(u)}
                  style={{ fontSize:'0.75rem', padding:'6px 11px', flexShrink:0 }}>
                  Edit
                </button>
                {isSuperAdmin && u.id !== user?.uid && (
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                    {/* Role changes */}
                    {Object.values(ROLES).filter(r => r !== u.role).map(r => (
                      <button key={r} onClick={() => changeRole(u, r)}
                        className="btn-light" style={{ fontSize:'0.75rem', padding:'5px 10px' }}>
                        Make {ROLE_LABELS[r]?.label}
                      </button>
                    ))}

                    {/* Delete user */}
                    <button onClick={() => {
                      if (!confirm(`Delete account for ${u.fullName || u.email}?\nThis removes their login and profile.`)) return;
                      const doBan = confirm('Also BAN this user to prevent re-registration?\n\nOK = Ban + Delete\nCancel = Delete only');
                      httpsCallable(fns, 'adminDeleteUser')({ targetUid: u.id, ban: doBan })
                        .then(() => { showMsg(`User deleted${doBan ? ' and banned' : ''}.`); setUsers(prev => prev.filter(x => x.id !== u.id)); })
                        .catch(e => showMsg('Delete failed: ' + e.message, 'error'));
                    }} style={{ fontSize:'0.75rem', padding:'5px 10px', borderRadius:8,
                      background:'#fdf2f1', color:'#c0392b', border:'1px solid #fadbd8',
                      fontWeight:700, cursor:'pointer' }}>
                      🗑 Delete{isSuperAdmin ? '/Ban' : ''}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── BULK IMPORT TAB ── */}
      {tab === 'import' && (
        <div className="card">
          <h3 style={{ margin:'0 0 6px' }}>Bulk Event Import</h3>
          <p className="small" style={{ margin:'0 0 16px' }}>
            Download the template, fill it in, then upload it here.
          </p>
          {[{n:1,title:'Download the Excel Template', body: (
            <button onClick={downloadTemplate} className="btn-light">⬇ Download Template (.xlsx)</button>
          )},{n:2,title:'Fill in the template',body:(
            <p className="small" style={{margin:0}}>Start data from Row 3. Required: Host Name, Event Date (YYYY-MM-DD), Start Time, Event Type, Audience Type, Address.</p>
          )},{n:3,title:'Upload completed file',body:(
            <>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleImport} style={{display:'none'}} />
              <button onClick={() => fileInputRef.current?.click()} disabled={importing}>
                {importing ? 'Importing…' : '⬆ Upload & Import'}
              </button>
            </>
          )}].map(step => (
            <div key={step.n} style={{ display:'flex', gap:12, alignItems:'flex-start', marginBottom:16 }}>
              <div style={{ width:28, height:28, borderRadius:'50%', background:'#c0392b',
                color:'white', display:'flex', alignItems:'center', justifyContent:'center',
                fontWeight:900, fontSize:'0.8125rem', flexShrink:0 }}>{step.n}</div>
              <div style={{flex:1}}>
                <div style={{ fontWeight:800, marginBottom:6 }}>{step.title}</div>
                {step.body}
              </div>
            </div>
          ))}
          {importResult && (
            <div style={{ marginTop:12 }}>
              <div className={importResult.errors.length===0 ? 'success' : 'notice'}>
                <strong>{importResult.message}</strong>
              </div>
              {importResult.errors.length > 0 && importResult.errors.map((e,i) => (
                <div key={i} className="error" style={{ padding:'8px 12px', marginTop:6 }}>
                  <strong>Row {e.row+2}:</strong> {e.errors.join(' · ')}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── EVENTS TAB ── */}
      {tab === 'events' && (
        <>
          {adminEvents === null && (
            <div className="card center">
              <p style={{ color:'var(--muted)' }}>Loading events…</p>
            </div>
          )}
          {adminEvents !== null && (
            <>
              <div className="card" style={{ display:'flex', alignItems:'center',
                justifyContent:'space-between', flexWrap:'wrap', gap:8 }}>
                <h3 style={{ margin:0 }}>
                  {adminEvents.length} Event(s)
                  {adminEvents.filter(e => e.isLive).length > 0 && (
                    <span style={{ fontSize:'0.75rem', color:'#c0392b', marginLeft:8 }}>
                      · {adminEvents.filter(e => e.isLive).length} 🔴 LIVE
                    </span>
                  )}
                </h3>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  <button disabled={selectedEventIds.size === 0}
                    onClick={() => { setTransferError(''); setShowTransferPanel(true); }}
                    style={{ fontSize:'0.75rem', margin:0, opacity:selectedEventIds.size ? 1 : 0.45,
                      cursor:selectedEventIds.size ? 'pointer' : 'not-allowed' }}>
                    <i className="ti ti-user-share" /> Transfer Ownership ({selectedEventIds.size})
                  </button>
                  <button className="btn-light" onClick={backfillLegacySeriesIds}
                    disabled={backfillingSeries}
                    style={{ fontSize:'0.75rem', margin:0 }}>
                    <i className="ti ti-link" /> {backfillingSeries ? 'Identifying Series…' : 'Identify Older Series'}
                  </button>
                  <button className="btn-light" onClick={loadAdminEvents}
                    style={{ fontSize:'0.75rem', margin:0 }}><i className="ti ti-refresh" /> Refresh</button>
                </div>
              </div>
              <EventFilters events={adminEvents} onChange={setFilteredAdminEvents} />
              {showTransferPanel && (
                <div className="card" style={{ border:'1px solid #b2d8d0' }}>
                  <h3 style={{ margin:'0 0 6px' }}>
                    Transfer {selectedEventIds.size} selected event{selectedEventIds.size === 1 ? '' : 's'}
                  </h3>
                  <p className="small" style={{ margin:'0 0 10px', color:'var(--muted)' }}>
                    Choose the user who will become the owner of every selected event.
                  </p>
                  <select value={transferToUid} onChange={e => { setTransferToUid(e.target.value); setTransferError(''); }}
                    style={{ width:'100%', marginBottom:10 }}>
                    <option value="">Select a user</option>
                    {users.slice().sort((a,b) => (a.fullName || a.email || '').localeCompare(b.fullName || b.email || '')).map(u => (
                      <option key={u.id} value={u.id}>
                        {u.fullName || u.email}{u.fullName && u.email ? ` (${u.email})` : ''}
                      </option>
                    ))}
                  </select>
                  {transferError && (
                    <div className="error" style={{ marginBottom:10 }}>{transferError}</div>
                  )}
                  <div style={{ display:'flex', gap:8 }}>
                    <button disabled={!transferToUid || transferring} onClick={doTransferEvents}
                      style={{ opacity:transferToUid && !transferring ? 1 : 0.45 }}>
                      {transferring ? 'Transferring…' : 'Confirm Transfer'}
                    </button>
                    <button className="btn-light" onClick={() => { setShowTransferPanel(false); setTransferToUid(''); setTransferError(''); }}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              {adminEvents.length === 0 && <div className="card">No active events.</div>}
              {displayedAdminEvents.length === 0 && adminEvents.length > 0 && (
                <div className="card">No events match the selected filters.</div>
              )}
              {displayedAdminEvents.map(e => {
                const seriesKey = e.seriesId || legacySeriesKey(e);
                const seriesCount = seriesCounts.get(seriesKey) || 0;
                return (
                <div key={e.id}>
                  <div style={{ margin:'8px 16px 4px', display:'flex', alignItems:'center',
                    justifyContent:'space-between', gap:8, flexWrap:'wrap' }}>
                    <label className="checkbox" style={{ margin:0, fontWeight:800, fontSize:'0.8125rem' }}>
                      <input type="checkbox" checked={selectedEventIds.has(e.id)}
                        onChange={() => toggleEventSelection(e.id)} />
                      <span>Select event</span>
                    </label>
                    {e.isSeries && (
                      <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                        <span style={{ fontSize:'0.6875rem', fontWeight:800, color:'#7c3aed',
                          background:'#ede9fe', padding:'4px 8px', borderRadius:6 }}>
                          <i className="ti ti-calendar-repeat" /> Series · {seriesCount} events
                        </span>
                        <button className="btn-light" disabled={!e.seriesId} onClick={() => {
                          setEditingEvent({ ...e, __editSeries:true });
                          setPage('edit');
                        }} title={!e.seriesId ? 'Use Identify Older Series first' : 'Edit every event in this series'}
                          style={{ fontSize:'0.6875rem', padding:'5px 9px', margin:0, opacity:e.seriesId ? 1 : 0.5 }}>
                          <i className="ti ti-edit" /> {e.seriesId ? 'Edit entire series' : 'Identify series first'}
                        </button>
                      </div>
                    )}
                  </div>
                  {e.isLive && (
                    <div style={{ padding:'4px 20px 2px', display:'flex',
                      alignItems:'center', gap:8 }}>
                      <span style={{ fontSize:'0.6875rem', fontWeight:900, color:'#c0392b',
                        animation:'liveBlink 1s infinite' }}>🔴 LIVE</span>
                      <button onClick={() => clearLiveStatus(e.id)}
                        style={{ fontSize:'0.6875rem', padding:'3px 12px', borderRadius:6,
                          border:'none', cursor:'pointer', fontWeight:800,
                          background:'#fef9e7', color:'#b7950b' }}>
                        Clear Live Status
                      </button>
                    </div>
                  )}
                  <EventCard event={e} user={user} profile={profile}
                    onEdit={ev => { setEditingEvent(ev); setPage('edit'); }}
                    onDelete={handleDelete} onCopy={handleCopy}
                    isExpanded={adminExpandedId === e.id}
                    onExpand={id => setAdminExpandedId(prev => prev === id ? null : id)}
                  />
                </div>
              )})}
            </>
          )}
          <style>{`@keyframes liveBlink{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
        </>
      )}

      {/* ── REPAIR TAB ── */}
      {tab === 'repair' && (
        <>
          <div className="card">
            <h3 style={{ margin: '0 0 6px' }}>🛠 Hijri Date Repair Tool</h3>
            <p className="small" style={{ color: 'var(--muted)', margin: '0 0 16px' }}>
              Shows all events entered with a Hijri date. Use this to correct events where
              the stored Hijri day/month/year is wrong — the tool recalculates and saves
              the correct Gregorian date. For series events you can fix the whole series at once.
            </p>
            <button onClick={loadRepairEvents} disabled={repairLoading}
              style={{ marginBottom: 8 }}>
              {repairLoading ? '⏳ Loading…' : repairEvents === null ? '🔍 Load Hijri Events' : '🔄 Refresh'}
            </button>
            {repairMsg && (
              <p style={{ fontSize: '0.8125rem', color: repairMsg.startsWith('❌') ? 'var(--danger,#dc2626)' : 'var(--teal)',
                fontWeight: 600, margin: '8px 0 0' }}>{repairMsg}</p>
            )}
          </div>

          {repairEvents && repairEvents.length > 0 && (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {repairEvents.map((ev, idx) => {
                const isFixing = fixingId === ev.id;
                const HIJRI_MN = ['Muharram','Safar','Rabi al-Awwal','Rabi al-Thani',
                  'Jumada al-Awwal','Jumada al-Thani',"Rajab","Sha'ban",
                  'Ramadan','Shawwal',"Dhu al-Qi'dah",'Dhu al-Hijjah'];

                // What hijriDate should be based on stored components
                const storedHijriStr = (ev.hijriDay && ev.hijriMonth && ev.hijriYear)
                  ? `${ev.hijriDay} ${HIJRI_MN[ev.hijriMonth - 1]} ${ev.hijriYear} AH`
                  : '—';

                // What hijriDate display string actually says
                const displayStr = ev.hijriDate || '—';

                // Flag mismatch
                const mismatch = storedHijriStr !== displayStr;

                return (
                  <div key={ev.id} style={{
                    borderBottom: idx < repairEvents.length - 1 ? '1px solid var(--border)' : 'none',
                    padding: '12px 16px',
                    background: mismatch ? '#fff9f9' : 'white'
                  }}>
                    {/* Event header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: '0 0 2px', fontWeight: 700, fontSize: '0.875rem',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {ev.title || ev.eventType || 'Untitled'}
                          {ev.isSeries && <span style={{ fontSize: '0.6875rem', color: 'var(--teal)',
                            marginLeft: 6, fontWeight: 600 }}>SERIES</span>}
                        </p>
                        <p style={{ margin: '0 0 4px', fontSize: '0.75rem', color: 'var(--muted)' }}>
                          📅 Gregorian: <strong>{ev.eventDate}</strong>
                        </p>
                        <p style={{ margin: '0 0 2px', fontSize: '0.75rem',
                          color: mismatch ? '#c0392b' : 'var(--muted)' }}>
                          🌙 Stored components: <strong>{storedHijriStr}</strong>
                          {mismatch && <span style={{ marginLeft: 6 }}>⚠️ mismatch</span>}
                        </p>
                        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--muted)' }}>
                          🏷 Display tag: <strong>{displayStr}</strong>
                        </p>
                      </div>
                      {!isFixing && (
                        <button onClick={() => startFix(ev)}
                          style={{ fontSize: '0.75rem', padding: '6px 14px', whiteSpace: 'nowrap',
                            background: mismatch ? '#c0392b' : 'var(--teal)',
                            color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer',
                            fontWeight: 700, flexShrink: 0 }}>
                          ✏️ Fix
                        </button>
                      )}
                    </div>

                    {/* Fix form */}
                    {isFixing && (
                      <div style={{ marginTop: 12, background: '#f8f9fa',
                        borderRadius: 10, padding: 12 }}>
                        <p style={{ margin: '0 0 8px', fontSize: '0.8125rem', fontWeight: 700 }}>
                          Enter correct Hijri date:
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr 90px', gap: 8, marginBottom: 10 }}>
                          <input type="number" min="1" max="30" placeholder="Day"
                            value={fixDay} onChange={e => setFixDay(e.target.value)}
                            style={{ padding: '8px', fontSize: '0.875rem',
                              border: '1px solid var(--border)', borderRadius: 8 }} />
                          <select value={fixMonth} onChange={e => setFixMonth(e.target.value)}
                            style={{ padding: '8px', fontSize: '0.8125rem',
                              border: '1px solid var(--border)', borderRadius: 8 }}>
                            <option value="">Month</option>
                            {HIJRI_MONTHS.map(m => (
                              <option key={m.value} value={m.value}>{m.name}</option>
                            ))}
                          </select>
                          <input type="number" min="1400" max="1500" placeholder="Year"
                            value={fixYear} onChange={e => setFixYear(e.target.value)}
                            style={{ padding: '8px', fontSize: '0.875rem',
                              border: '1px solid var(--border)', borderRadius: 8 }} />
                        </div>

                        {/* Preview converted date */}
                        {fixDay && fixMonth && fixYear && (() => {
                          const prev = hijriToGregorian(parseInt(fixDay), parseInt(fixMonth),
                            parseInt(fixYear), repairOverrides);
                          return prev ? (
                            <p style={{ fontSize: '0.75rem', color: 'var(--teal)', margin: '0 0 10px', fontWeight: 600 }}>
                              = Gregorian: {prev}
                            </p>
                          ) : null;
                        })()}

                        {/* Series option */}
                        {ev.isSeries && (
                          <label style={{ display: 'flex', alignItems: 'center', gap: 8,
                            fontSize: '0.8125rem', marginBottom: 10, cursor: 'pointer' }}>
                            <input type="checkbox" checked={fixSeries}
                              onChange={e => setFixSeries(e.target.checked)} />
                            Fix entire series (all events from {ev.seriesStartDate} to {ev.seriesEndDate})
                          </label>
                        )}

                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => applyFix(ev)} disabled={repairLoading}
                            style={{ flex: 1, background: 'var(--teal)', color: 'white',
                              border: 'none', borderRadius: 8, padding: '9px',
                              fontWeight: 700, cursor: 'pointer', fontSize: '0.8125rem' }}>
                            {repairLoading ? '⏳ Fixing…' : '✅ Apply Fix'}
                          </button>
                          <button onClick={() => setFixingId(null)}
                            style={{ padding: '9px 18px', borderRadius: 8, fontSize: '0.8125rem',
                              border: '1px solid var(--border)', background: 'white',
                              cursor: 'pointer', fontWeight: 600 }}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

            {/* ORGANISATIONS TAB */}
      {tab === 'orgs' && (
        <>
          <div className="card">
            <h3 style={{ margin:'0 0 14px' }}>Organisation Management</h3>
            <p className="small" style={{ color:'var(--muted)', margin:'0 0 16px', lineHeight:1.5 }}>
              Add organisations here. Their logo appears on event cards when no poster is uploaded.
            </p>

            <label style={{ fontWeight:700, fontSize:'0.8125rem', display:'block', marginBottom:6 }}>
              Organisation Logo
            </label>
            {newOrgLogo ? (
              <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14 }}>
                <img src={newOrgLogo} alt="preview" style={{ width:72, height:72, objectFit:'contain',
                  borderRadius:12, border:'1px solid var(--border)', background:'#f4f9f8', padding:6 }} />
                <div>
                  <div style={{ fontSize:'0.75rem', color:'var(--teal)', fontWeight:700, marginBottom:4 }}>Logo ready</div>
                  <button type="button" onClick={() => { setNewOrgLogo(''); setNewOrgLogoFile(null); }}
                    style={{ fontSize:'0.75rem', padding:'4px 12px', borderRadius:8, background:'#fee2e2',
                      color:'#dc2626', border:'1px solid #fecaca', cursor:'pointer' }}>
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <label style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6,
                background:'var(--bg)', border:'2px dashed #b9ccc8', borderRadius:14,
                padding:18, cursor:'pointer', color:'var(--teal)', marginBottom:14 }}>
                <span style={{ fontSize:'1.75rem' }}>Logo</span>
                <span style={{ fontSize:'0.8125rem', fontWeight:800 }}>Upload logo</span>
                <span style={{ fontSize:'0.6875rem', color:'var(--muted)' }}>PNG with transparent background preferred</span>
                <input type="file" accept="image/*" onChange={handleOrgLogoChange} style={{ display:'none' }} />
              </label>
            )}

            <label style={{ fontWeight:700, fontSize:'0.8125rem', display:'block', marginBottom:6 }}>
              Organisation Name *
            </label>
            <input value={newOrgName}
              onChange={e => {
                setNewOrgName(e.target.value);
                if (!newOrgSlug) setNewOrgSlug(slugify(e.target.value));
              }}
              placeholder="e.g. Alamdar Granville"
              style={{ marginBottom:12 }} />

            <label style={{ fontWeight:700, fontSize:'0.8125rem', display:'block', marginBottom:6 }}>
              Slug (unique identifier)
              <span style={{ fontSize:'0.6875rem', fontWeight:400, color:'var(--muted)', marginLeft:6 }}>
                Auto-generated
              </span>
            </label>
            <input value={newOrgSlug}
              onChange={e => setNewOrgSlug(slugify(e.target.value))}
              placeholder="e.g. alamdargranville"
              style={{ marginBottom:12, fontFamily:'monospace' }} />

            <label style={{ fontWeight:700, fontSize:'0.8125rem', display:'block', marginBottom:6 }}>
              Location in Australia
            </label>
            <input value={newOrgLocation}
              onChange={e => setNewOrgLocation(e.target.value)}
              placeholder="e.g. Granville, NSW"
              style={{ marginBottom:16 }} />

            <button onClick={handleAddOrg} disabled={orgsLoading || !newOrgName.trim()}
              style={{
                background: (orgsLoading || !newOrgName.trim()) ? '#94a3b8' : 'var(--teal,#0f766e)',
                color:'white', border:'none', borderRadius:11,
                padding:'12px 24px', fontWeight:800, fontSize:'0.875rem',
                cursor: (orgsLoading || !newOrgName.trim()) ? 'not-allowed' : 'pointer',
                width:'100%', transition:'background 0.2s',
              }}>
              {orgsLoading ? 'Adding...' : '+ Add Organisation'}
            </button>

            {orgMsg && (
              <p style={{ fontSize:'0.8125rem', color: orgMsg.startsWith('Error') ? '#dc2626' : 'var(--teal)',
                fontWeight:700, margin:'10px 0 0' }}>{orgMsg}</p>
            )}
          </div>

          <div className="card">
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
              <h3 style={{ margin:0 }}>Existing Organisations</h3>
              <button onClick={loadOrgs} disabled={orgsLoading}
                style={{ fontSize:'0.75rem', padding:'7px 16px', borderRadius:8,
                  background:'white', border:'1.5px solid var(--teal,#0f766e)',
                  color:'var(--teal,#0f766e)', cursor:'pointer', fontWeight:800 }}>
                {orgsLoading ? 'Loading...' : 'Refresh'}
              </button>
            </div>

            <p style={{ fontSize:'0.75rem', color:'var(--muted)', margin:'0 0 10px', lineHeight:1.5 }}>
              All organisations are listed below. Built-in ones (Community Events, Muhammadi, Imam Hasan, Alamdar) are seeded automatically — you can edit their logo, name, or location here.
            </p>

            {orgs === null || orgsLoading ? (
              <div style={{ textAlign:'center', padding:20, color:'var(--muted)', fontSize:'0.8125rem' }}>
                {orgsLoading ? 'Loading...' : 'No data yet'}
              </div>
            ) : orgs.length === 0 ? (
              <p style={{ color:'var(--muted)', fontSize:'0.8125rem', textAlign:'center', padding:16 }}>
                No custom organisations added yet.
              </p>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {orgs.map(org => (
                  <React.Fragment key={org.id}>
                    <div style={{ display:'flex', alignItems:'center', gap:12,
                      padding:'12px 14px', borderRadius:12, border:'1px solid var(--border)',
                      background:'white' }}>
                      <div style={{ width:52, height:52, borderRadius:10, overflow:'hidden',
                        flexShrink:0, background:'#f4f9f8', border:'1px solid var(--border)',
                        display:'flex', alignItems:'center', justifyContent:'center' }}>
                        {org.logoBase64
                          ? <img src={org.logoBase64} alt={org.name}
                              style={{ width:'100%', height:'100%', objectFit:'contain', padding:4 }} />
                          : <span style={{ fontSize:'1.375rem' }}>?</span>
                        }
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontWeight:800, fontSize:'0.875rem', marginBottom:2, display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                          {org.name}
                          {org.builtIn && (
                            <span style={{ fontSize:'0.625rem', fontWeight:700, padding:'2px 7px', borderRadius:20,
                              background:'#e6f4f1', color:'var(--teal,#0f766e)', border:'1px solid #b2d8d0' }}>
                              built-in
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize:'0.6875rem', color:'var(--muted)', display:'flex', gap:10, flexWrap:'wrap' }}>
                          <span>ID: {org.slug}</span>
                          {org.location ? <span>{org.location}</span> : null}
                        </div>
                      </div>
                      <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                        <button onClick={() => editingOrgId === org.id ? setEditingOrgId(null) : startEditOrg(org)}
                          style={{ fontSize:'0.75rem', padding:'6px 12px', borderRadius:8,
                            background: editingOrgId === org.id ? 'var(--teal)' : '#e6f4f1',
                            color: editingOrgId === org.id ? 'white' : 'var(--teal)',
                            border:'1px solid #b2d8d0', fontWeight:700, cursor:'pointer' }}>
                          {editingOrgId === org.id ? 'Cancel' : 'Edit'}
                        </button>
                        <button onClick={() => handleDeleteOrg(org)}
                          style={{ fontSize:'0.75rem', padding:'6px 12px', borderRadius:8, background:'#fdf2f1',
                            color:'#c0392b', border:'1px solid #fadbd8', fontWeight:700, cursor:'pointer' }}>
                          Delete
                        </button>
                      </div>
                    </div>

                    {editingOrgId === org.id && (
                      <div style={{ background:'#f4f9f8', border:'1px solid #b2d8d0',
                        borderRadius:12, padding:14, marginTop:-4 }}>
                        <p style={{ fontWeight:800, fontSize:'0.8125rem', color:'var(--teal)', margin:'0 0 10px' }}>
                          Edit Organisation
                        </p>

                        <label style={{ fontWeight:700, fontSize:'0.75rem', display:'block', marginBottom:4 }}>Logo</label>
                        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                          {editOrgLogo ? (
                            <img src={editOrgLogo} alt="logo"
                              style={{ width:50, height:50, objectFit:'contain', borderRadius:8,
                                border:'1px solid var(--border)', background:'#f4f9f8', padding:4 }} />
                          ) : null}
                          <label style={{ fontSize:'0.75rem', padding:'6px 14px', borderRadius:8,
                            background:'var(--bg)', border:'1px solid var(--border)',
                            cursor:'pointer', fontWeight:700, color:'var(--teal)' }}>
                            {editOrgLogo ? 'Change Logo' : 'Upload Logo'}
                            <input type="file" accept="image/*" onChange={handleEditOrgLogoChange}
                              style={{ display:'none' }} />
                          </label>
                          {editOrgLogo ? (
                            <button type="button" onClick={() => setEditOrgLogo('')}
                              style={{ fontSize:'0.6875rem', padding:'4px 10px', borderRadius:7,
                                background:'#fee2e2', color:'#dc2626', border:'none', cursor:'pointer' }}>
                              Remove
                            </button>
                          ) : null}
                        </div>

                        <label style={{ fontWeight:700, fontSize:'0.75rem', display:'block', marginBottom:4 }}>Name *</label>
                        <input value={editOrgName} onChange={e => setEditOrgName(e.target.value)}
                          style={{ marginBottom:8 }} />

                        <label style={{ fontWeight:700, fontSize:'0.75rem', display:'block', marginBottom:4 }}>Slug</label>
                        <input value={editOrgSlug} onChange={e => setEditOrgSlug(slugify(e.target.value))}
                          style={{ marginBottom:8, fontFamily:'monospace' }} />

                        <label style={{ fontWeight:700, fontSize:'0.75rem', display:'block', marginBottom:4 }}>Location</label>
                        <input value={editOrgLocation} onChange={e => setEditOrgLocation(e.target.value)}
                          style={{ marginBottom:12 }} />

                        <div style={{ display:'flex', gap:8 }}>
                          <button onClick={saveEditOrg} disabled={editOrgSaving || !editOrgName.trim()}
                            style={{ flex:1, padding:'10px', borderRadius:10, border:'none',
                              background:'var(--teal)', color:'white', fontWeight:800,
                              fontSize:'0.8125rem', cursor:'pointer', opacity: !editOrgName.trim() ? 0.5 : 1 }}>
                            {editOrgSaving ? 'Saving...' : 'Save Changes'}
                          </button>
                          <button onClick={() => setEditingOrgId(null)}
                            style={{ padding:'10px 16px', borderRadius:10,
                              border:'1px solid var(--border)', background:'white',
                              fontWeight:700, fontSize:'0.8125rem', cursor:'pointer' }}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>
        </>
      )}


                  {/* ── SETTINGS TAB ── */}
      {tab === 'settings' && (
        <>
          {/* Hijri Calendar */}
          <div className="card">
            <h3 style={{ margin:'0 0 6px' }}>Hijri Calendar Adjustment</h3>
            <p className="small" style={{ margin:'0 0 16px' }}>
              Select the Gregorian date that corresponds to the <strong>1st of the current Hijri month</strong>.
              The app calculates correct Hijri dates for all events automatically.
            </p>
            <div className="notice" style={{ marginBottom:16 }}>
              <strong>Current Hijri month:</strong>{' '}
              {getHijriDisplay(new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' }), hijriSettings.overrides || [])}
              {hijriSettings.anchorDate && (
                <span style={{ marginLeft:8, color:'var(--muted)', fontSize:'0.75rem' }}>
                  (anchor: {hijriSettings.anchorDate})
                </span>
              )}
            </div>
            <div className="row">
              <div>
                <label>Hijri month</label>
                <select value={anchorMonth} onChange={e => setAnchorMonth(e.target.value)}>
                  <option value="">Select month</option>
                  {HIJRI_MONTHS.map(month => (
                    <option key={month.value} value={month.value}>{month.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label>Hijri year</label>
                <input
                  type="number"
                  min="1400"
                  max="1600"
                  value={anchorYear}
                  onChange={e => setAnchorYear(e.target.value)}
                  placeholder="1448"
                />
              </div>
            </div>
            <label>Gregorian date = 1st of selected Hijri month</label>
            <input type="date" value={anchorDate} onChange={e => setAnchorDate(e.target.value)} />
            <button onClick={saveHijri} disabled={saving || recalculating || !anchorDate || !anchorMonth || !anchorYear}>
              {saving ? 'Saving…' : recalculating ? 'Recalculating…' : 'Save Hijri Setting'}
            </button>
            {(hijriSettings.overrides || []).length > 0 && (
              <div className="notice" style={{ marginTop:12 }}>
                <strong>Saved month corrections:</strong>
                <div style={{ marginTop:8, display:'grid', gap:6 }}>
                  {[...(hijriSettings.overrides || [])]
                    .sort((a, b) => (Number(b.hYear) - Number(a.hYear)) || (Number(b.hMonth) - Number(a.hMonth)))
                    .map(override => (
                      <div key={`${override.hYear}-${override.hMonth}`} className="small">
                        1 {HIJRI_MONTHS.find(month => month.value === Number(override.hMonth))?.name || override.hMonth} {override.hYear} = {override.gDate}
                      </div>
                    ))}
                </div>
              </div>
            )}
            <button onClick={recalculateHijri}
              disabled={recalculating || saving}
              style={{ marginTop: 8, background: 'transparent', color: 'var(--teal)',
                border: '1.5px solid var(--teal)', borderRadius: 10 }}>
              {recalculating ? '⏳ Recalculating all event dates…' : '🔄 Recalculate All Hijri Dates'}
            </button>
            <p className="small" style={{ color: 'var(--muted)', margin: '6px 0 0' }}>
              Recalculate updates Gregorian dates for Hijri-entered events and Hijri display tags for all events using current settings.
            </p>
          </div>

          {/* Email Reminders */}
          <div className="card">
            <h3 style={{ margin:'0 0 6px' }}>Email Reminders</h3>
            <div className="notice" style={{ marginBottom:16 }}>
              <strong>Automatic schedule:</strong>
              <ul style={{ margin:'8px 0 0', paddingLeft:20, lineHeight:1.9 }}>
                <li><strong>7:00 PM Sydney time, every day</strong> — tomorrow's events</li>
                <li><strong>8:00 AM, 1st of every month</strong> — Hijri reminder to Super Admins</li>
              </ul>
            </div>
            <label>Send mode</label>
            <select value={reminderMode} onChange={e => setReminderMode(e.target.value)} style={{ marginBottom:12 }}>
              <option value="date">Single date</option>
              <option value="range">Date range</option>
              <option value="month">Full month</option>
            </select>
            {reminderMode === 'date' && (
              <>
                <label>Date</label>
                <input type="date" value={reminderDate} onChange={e => setReminderDate(e.target.value)} />
              </>
            )}
            {reminderMode === 'range' && (
              <div className="row">
                <div>
                  <label>From</label>
                  <input type="date" value={reminderFrom} onChange={e => setReminderFrom(e.target.value)} />
                </div>
                <div>
                  <label>To</label>
                  <input type="date" value={reminderTo} onChange={e => setReminderTo(e.target.value)} />
                </div>
              </div>
            )}
            {reminderMode === 'month' && (
              <>
                <label>Month</label>
                <input type="month" value={reminderMonth} onChange={e => setReminderMonth(e.target.value)} />
              </>
            )}
            <button onClick={sendReminderNow} disabled={sendingReminder}>
              {sendingReminder ? 'Sending…' : '📧 Send Reminder Email Now'}
            </button>
            {reminderResult && (
              <div className={reminderResult.error ? 'error' : 'success'} style={{ marginTop:12 }}>
                {reminderResult.message}
              </div>
            )}
          </div>

          {/* YouTube Connection */}
          <YouTubeConnectCard />

          {/* Community Update Message */}
          <div className="card">
            <h3 style={{ margin:'0 0 6px' }}>Community Update Message</h3>
            <p className="small" style={{ margin:'0 0 14px' }}>
              Send a custom message to all users with email reminders enabled. No events needed.
            </p>
            <label>Your Message</label>
            <textarea
              value={communityMsg}
              onChange={e => setCommunityMsg(e.target.value)}
              placeholder="Type your community update here…"
              style={{ minHeight:100, marginBottom:12 }}
            />
            <button onClick={sendCommunityMsg} disabled={sendingReminder || !communityMsg.trim()}>
              {sendingReminder ? 'Sending…' : '📣 Send to All Users'}
            </button>
            <div style={{ margin:'18px 0', borderTop:'1px solid var(--border)' }} />
            <h3 style={{ margin:'0 0 6px' }}>Store Availability Announcement</h3>
            <p className="small" style={{ margin:'0 0 12px' }}>
              Send the formatted Google Play, Apple App Store and Microsoft Store announcement.
            </p>
            <button onClick={sendStoreAnnouncement} disabled={sendingReminder}
              style={{ background:'#0f766e', color:'white' }}>
              {sendingReminder ? 'Sending…' : 'Send Store Announcement'}
            </button>
          </div>
        </>
      )}
    </>
  );
}
