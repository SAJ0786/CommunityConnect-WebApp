import React, { useEffect, useRef, useState } from 'react';
import EventCard from '../components/EventCard';
import { saveHijriSettings, getHijriSettings } from '../services/settingsService';
import { listUsers, updateUserRole } from '../services/userService';
import { canManageUsers, isAdminRole } from '../utils/permissions';
import { ROLES } from '../utils/constants';
import { getHijriDisplay } from '../services/hijriService';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getApp } from 'firebase/app';
import * as XLSX from 'xlsx';

const ROLE_LABELS = {
  [ROLES.USER]:        { label: 'User',        color: '#6b7280', bg: '#f3f4f6' },
  [ROLES.ADMIN]:       { label: 'Admin',       color: '#c0392b', bg: '#fdf2f1' },
  [ROLES.SUPER_ADMIN]: { label: 'Super Admin', color: '#7c3aed', bg: '#ede9fe' },
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
      // Open in NEW TAB — keeps the app open, avoids mixing with app login
      window.open(result.data.url, '_blank');
      // Check connection status after user completes OAuth
      setLoading(false);
      setStatus('waiting');
    } catch (e) {
      alert('Error: ' + e.message);
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
          <span style={{ color:'#27ae60', fontWeight:700, fontSize:14 }}>✅ Connected to YouTube</span>
          <button className="btn-light" style={{ fontSize:12 }} onClick={handleConnect}>
            Reconnect
          </button>
        </div>
      )}
      {status === 'disconnected' && (
        <button onClick={handleConnect} disabled={loading}
          style={{ background:'#FF0000', color:'white', border:'none',
            borderRadius:10, padding:'10px 20px', fontSize:14,
            fontWeight:900, cursor:'pointer', display:'flex',
            alignItems:'center', gap:8 }}>
          {loading ? 'Opening…' : '🔗 Connect YouTube Channel'}
        </button>
      )}
      {status === 'waiting' && (
        <div>
          <p className="small" style={{ color:'var(--muted)', marginBottom:12 }}>
            ✅ A new tab has opened. Complete the Google sign-in there using <strong>communityeventssydney@gmail.com</strong>, then come back and click below.
          </p>
          <button onClick={checkConnection}
            style={{ background:'#27ae60', color:'white', border:'none',
              borderRadius:10, padding:'10px 20px', fontSize:14,
              fontWeight:900, cursor:'pointer' }}>
            ✅ I've Connected — Check Status
          </button>
        </div>
      )}
    </div>
  );
}

// ── Backfill Live Stream Rooms ────────────────────────────────────────────────
function BackfillRoomsCard({ fns }) {
  const [loading, setLoading] = React.useState(false);
  const [result,  setResult]  = React.useState(null);

  const handleBackfill = async () => {
    if (!window.confirm('This will create a dedicated live stream room for every event that doesn\'t have one. Continue?')) return;
    setLoading(true);
    setResult(null);
    try {
      const r = await httpsCallable(fns, 'backfillEventRooms')();
      setResult(r.data);
    } catch (e) {
      setResult({ error: e.message });
    }
    setLoading(false);
  };

  return (
    <div className="card">
      <h3 style={{ margin:'0 0 6px' }}>🏠 Live Stream Room Backfill</h3>
      <p className="small" style={{ margin:'0 0 14px' }}>
        Assign a dedicated live stream room to all existing events. Run this once to fix events created before the per-event room feature was added.
      </p>
      <button onClick={handleBackfill} disabled={loading}
        style={{ background:'var(--teal)', color:'white', border:'none',
          borderRadius:10, padding:'10px 20px', fontSize:14,
          fontWeight:900, cursor:'pointer' }}>
        {loading ? 'Creating rooms…' : '🔧 Backfill All Event Rooms'}
      </button>
      {result && !result.error && (
        <p className="small" style={{ marginTop:10, color:'#27ae60' }}>
          ✅ Done — {result.created} rooms created, {result.skipped} already had rooms ({result.total} total events)
        </p>
      )}
      {result?.error && (
        <p className="small" style={{ marginTop:10, color:'#dc2626' }}>❌ {result.error}</p>
      )}
    </div>
  );
}

function RoleBadge({ role }) {
  const r = ROLE_LABELS[role] || ROLE_LABELS[ROLES.USER];
  return (
    <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 9px',
      borderRadius: 99, background: r.bg, color: r.color }}>
      {r.label}
    </span>
  );
}

export default function AdminDashboard({ events, user, profile, setPage, setEditingEvent, handleDelete, handleCopy }) {
  const [tab,            setTab]            = useState('users');
  const [hijriSettings,  setHijriSettings]  = useState({ adjustmentDays: 0, anchorDate: '' });
  const [anchorDate,     setAnchorDate]     = useState('');
  const [users,          setUsers]          = useState([]);
  const [calCount,       setCalCount]       = useState(null);
  const [msg,            setMsg]            = useState({ text: '', type: '' });
  const [search,         setSearch]         = useState('');
  const [saving,         setSaving]         = useState(false);
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
  const fileInputRef = useRef(null);

  const isSuperAdmin = profile?.role === ROLES.SUPER_ADMIN;
  const fns = getFunctions(getApp(), 'australia-southeast1');

  useEffect(() => {
    if (!isAdminRole(profile?.role)) return;
    getHijriSettings().then(s => {
      setHijriSettings(s);
      setAnchorDate(s.anchorDate || '');
    });
    listUsers().then(setUsers);
    httpsCallable(fns, 'getCalendarStats')()
      .then(r => setCalCount(r.data.count))
      .catch(() => {});
  }, [profile]);

  // Auto-load admin events when events tab opens
  useEffect(() => {
    if (tab === 'events' && adminEvents === null) loadAdminEvents();
  }, [tab]);

  if (!isAdminRole(profile?.role)) {
    return <div className="card">Admin access required.</div>;
  }

  const showMsg = (text, type = 'success') => {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: '', type: '' }), 4000);
  };

  // ── Hijri save ──────────────────────────────────────────────────────────────
  const saveHijri = async () => {
    if (!anchorDate) return showMsg('Please select the Gregorian date for 1st of current Hijri month.', 'error');
    setSaving(true);
    try {
      // Calculate adjustment days from anchor date
      const anchor = new Date(anchorDate + 'T00:00:00');
      const today  = new Date();
      today.setHours(0,0,0,0);
      const diffDays = Math.round((anchor - today) / 86400000);
      await saveHijriSettings({ adjustmentDays: diffDays, anchorDate });
      setHijriSettings({ adjustmentDays: diffDays, anchorDate });
      showMsg(`Hijri setting saved. Adjustment: ${diffDays >= 0 ? '+' : ''}${diffDays} day(s).`);
    } catch (e) { showMsg(e.message, 'error'); }
    setSaving(false);
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
    } catch (e) { showMsg('Error loading events: ' + e.message, 'error'); }
  };

  // ── Clear live status ───────────────────────────────────────────────────────
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
      'Optional topic/subject','Gents only|Ladies only|Kids only|Mixed Audience',
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

  const filteredUsers = users.filter(u =>
    !search || u.email?.toLowerCase().includes(search.toLowerCase()) ||
    u.fullName?.toLowerCase().includes(search.toLowerCase())
  );

  const stats = [
    { label: 'Total Users',    value: users.length },
    { label: 'Super Admins',   value: users.filter(u => u.role === ROLES.SUPER_ADMIN).length },
    { label: 'Admins',         value: users.filter(u => u.role === ROLES.ADMIN).length },
    { label: 'Calendar Syncs', value: calCount ?? '…' },
    { label: 'Active Events',  value: events.length },
  ];

  const TABS = [
    { key: 'users',    label: 'Users'    },
    { key: 'import',   label: 'Import'   },
    { key: 'events',   label: 'Events'   },
    { key: 'settings', label: 'Settings' },
  ];

  return (
    <>
      {/* Header */}
      <div className="card" style={{
        background: 'linear-gradient(135deg,#c0392b,#a93226)',
        color: 'white', border: 'none', marginBottom: 0, borderRadius: '20px 20px 0 0'
      }}>
        <h2 style={{ color: 'white', margin: '0 0 4px' }}>Admin Dashboard</h2>
        <p style={{ color: 'rgba(255,255,255,.85)', margin: 0, fontSize: 13 }}>
          {profile?.fullName || user?.email} · <RoleBadge role={profile?.role} />
        </p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))',
        gap: 1, background: 'var(--border)', border: '1px solid var(--border)', borderTop: 'none' }}>
        {stats.map(s => (
          <div key={s.label} style={{ background: 'white', padding: '14px 12px', textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#c0392b' }}>{s.value}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)',
        background: 'white', marginBottom: 16, borderRadius: '0 0 20px 20px', overflow: 'hidden' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            flex: 1, padding: '12px 0', fontWeight: tab === t.key ? 900 : 600,
            fontSize: 13, border: 'none',
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
            <input placeholder="Search name or email…" value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width:220, padding:'8px 12px', fontSize:13,
                borderRadius:10, border:'1px solid var(--border)', marginBottom:0 }} />
          </div>
          {!isSuperAdmin && (
            <div className="notice" style={{ marginBottom:12 }}>Role changes require Super Admin access.</div>
          )}
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {filteredUsers.map(u => (
              <div key={u.id} style={{ display:'flex', alignItems:'center',
                justifyContent:'space-between', padding:'12px 14px',
                borderRadius:12, border:'1px solid var(--border)',
                background: u.id === user?.uid ? '#fdf2f1' : 'white',
                flexWrap:'wrap', gap:8 }}>
                <div>
                  <div style={{ fontWeight:800, fontSize:14 }}>
                    {u.fullName || '—'}
                    {u.id === user?.uid && <span style={{ fontSize:11, color:'#c0392b', marginLeft:6 }}>(you)</span>}
                  </div>
                  <div style={{ fontSize:12, color:'var(--muted)' }}>{u.email}</div>
                  {u.phone && <div style={{ fontSize:12, color:'var(--muted)' }}>{u.phone}</div>}
                  <div style={{ marginTop:4 }}><RoleBadge role={u.role} /></div>
                </div>
                {isSuperAdmin && (
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                    {Object.values(ROLES).filter(r => r !== u.role).map(r => (
                      <button key={r} onClick={() => changeRole(u, r)}
                        className="btn-light" style={{ fontSize:12, padding:'5px 10px' }}>
                        Make {ROLE_LABELS[r]?.label}
                      </button>
                    ))}
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
                fontWeight:900, fontSize:13, flexShrink:0 }}>{step.n}</div>
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
                    <span style={{ fontSize:12, color:'#c0392b', marginLeft:8 }}>
                      · {adminEvents.filter(e => e.isLive).length} 🔴 LIVE
                    </span>
                  )}
                </h3>
                <button className="btn-light" onClick={loadAdminEvents}
                  style={{ fontSize:12, margin:0 }}>🔄 Refresh</button>
              </div>
              {adminEvents.length === 0 && <div className="card">No active events.</div>}
              {adminEvents.map(e => (
                <div key={e.id}>
                  {e.isLive && (
                    <div style={{ padding:'4px 20px 2px', display:'flex',
                      alignItems:'center', gap:8 }}>
                      <span style={{ fontSize:11, fontWeight:900, color:'#c0392b',
                        animation:'liveBlink 1s infinite' }}>🔴 LIVE</span>
                      <button onClick={() => clearLiveStatus(e.id)}
                        style={{ fontSize:11, padding:'3px 12px', borderRadius:6,
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
              ))}
            </>
          )}
          <style>{`@keyframes liveBlink{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
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
              {getHijriDisplay(new Date())}
              {hijriSettings.anchorDate && (
                <span style={{ marginLeft:8, color:'var(--muted)', fontSize:12 }}>
                  (anchor: {hijriSettings.anchorDate})
                </span>
              )}
            </div>
            <label>Gregorian date = 1st of current Hijri month</label>
            <input type="date" value={anchorDate} onChange={e => setAnchorDate(e.target.value)} />
            <button onClick={saveHijri} disabled={saving || !anchorDate}>
              {saving ? 'Saving…' : 'Save Hijri Setting'}
            </button>
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

          {/* Backfill Live Stream Rooms */}
          <BackfillRoomsCard fns={getFunctions(getApp(), 'australia-southeast1')} />

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
          </div>
        </>
      )}
    </>
  );
}
