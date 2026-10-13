import React, { useEffect, useState } from 'react';
import { collection, query, orderBy, limit, onSnapshot, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/firebase';
export default function DiagnosticsRegister({ user, profile }) {
  const [rows,setRows] = useState([]), [loading,setLoading] = useState(true), [error,setError] = useState('');
  const [search,setSearch] = useState(''), [filter,setFilter] = useState('active'), [selected,setSelected] = useState(null), [note,setNote] = useState(''), [busy,setBusy] = useState(false);
  useEffect(() => {
    if (profile?.role !== 'superAdmin') { setLoading(false); return; }
    return onSnapshot(query(collection(db,'diagnosticSessions'),orderBy('lastSeenAt','desc'),limit(200)), snapshot => { setRows(snapshot.docs.map(item => ({...item.data(),id:item.id}))); setLoading(false); setError(''); }, failure => { setError(failure.message || 'Could not load diagnostic sessions.'); setLoading(false); });
  }, [profile?.role, user?.uid]);
  if (profile?.role !== 'superAdmin') return <p className="notice">The Diagnostics Register requires Super Admin access.</p>;
  const visible = rows.filter(row => filter === 'all' || (filter === 'archived' ? row.archived : !row.archived)).filter(row => [row.installationId,row.sessionId,row.platform,row.currentScreen,row.appVersion,row.adminStatus].join(' ').toLowerCase().includes(search.toLowerCase()));
  const review = async status => {
    setBusy(true); setError('');
    try {
      await updateDoc(doc(db,'diagnosticSessions',selected.id),{adminStatus:status,adminNote:note.trim().slice(0,1000),archived:status==='archived',reviewedBy:user.uid,reviewedAt:serverTimestamp()});
      setSelected(null);
    } catch(failure) { setError(failure.message || 'Could not save this review.'); }
    finally { setBusy(false); }
  };
  return <section className="cc-diagnostics"><h2>Diagnostics Register</h2><p>Latest 200 sessions · installation, session and issue history</p>
    <label>Search installations or sessions<input value={search} onChange={event=>setSearch(event.target.value)}/></label>
    <label>Records<select value={filter} onChange={event=>setFilter(event.target.value)}><option value="active">Active</option><option value="archived">Archived</option><option value="all">All</option></select></label>
    {loading && <p role="status">Loading diagnostic sessions…</p>}{error && <p role="alert" className="error">{error}</p>}
    {!loading && !visible.length && <p>No matching diagnostic sessions.</p>}
    {visible.map(row => <article className="card" key={row.id}><h3>{row.platform || 'App'} · {row.appVersion || 'Unknown version'}</h3><p>Installation: {row.installationId}<br/>Session: {row.sessionId}</p><p>{row.currentScreen} · {row.adminStatus || 'new'} · {Number(row.errorCount)||0} errors</p><button className="btn-light" onClick={()=>{setSelected(row);setNote(row.adminNote||'');}}>Review session</button></article>)}
    {selected && <section className="card" aria-label="Diagnostic review"><h3>Review session</h3><p>{selected.sessionId}</p><label>Admin note<textarea value={note} maxLength={1000} onChange={event=>setNote(event.target.value)}/></label><div className="bw-actions">{['investigating','resolved',selected.archived?'new':'archived'].map(status=><button key={status} disabled={busy} onClick={()=>review(status)}>{status==='new'?'Restore':status==='archived'?'Archive':status==='resolved'?'Mark resolved':'Investigate'}</button>)}<button className="btn-light" disabled={busy} onClick={()=>setSelected(null)}>Cancel</button></div></section>}
  </section>;
}
