import { useEffect, useRef, useState } from 'react';
import { listenHostThreads, listenHostMessages, markHostThreadRead, sendHostReply } from '../services/hostMessagingService';
export default function HostInbox({ user, initialThreadId = '' }) {
  const [threads, setThreads] = useState([]), [messages, setMessages] = useState([]), [selected, setSelected] = useState(initialThreadId);
  const [error, setError] = useState(''), [text, setText] = useState(''), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true);
  const readOnly = import.meta.env.VITE_READ_ONLY_PREVIEW === 'true';
  const pending = useRef(false), generation = useRef(0);
  useEffect(() => () => { generation.current += 1; }, [user?.uid]);
  useEffect(() => {
    setThreads([]); setMessages([]); setSelected(initialThreadId); setText(''); setError(''); setLoading(true);
    return listenHostThreads(rows => { setThreads(rows); setLoading(false); }, e => { setError(e.message); setLoading(false); });
  }, [user?.uid, initialThreadId]);
  const thread = threads.find(row => row.id === selected);
  useEffect(() => {
    let active = true;
    setMessages([]); setError('');
    if (!thread) return;
    const markRead = () => { if (!readOnly) markHostThreadRead(thread.id).catch(e => { if (active) setError(e.message); }); };
    markRead();
    const stop = listenHostMessages(thread.id, rows => { if (active) { setMessages(rows); markRead(); } }, e => { if (active) setError(e.message); });
    return () => { active = false; stop(); };
  }, [thread?.id, user?.uid, readOnly]);
  async function reply(e) {
    e.preventDefault(); if (pending.current || !thread || !text.trim()) return;
    pending.current = true;
    const current = generation.current;
    setBusy(true); setError('');
    try { await sendHostReply(thread.id, text); if (current === generation.current) setText(''); }
    catch (problem) { if (current === generation.current) setError(problem.message + ' Check the conversation before retrying.'); }
    finally { pending.current = false; if (current === generation.current) setBusy(false); }
  }
  return <section className="card host-inbox">
    {error && <p role="alert">{error}</p>}
    {loading ? <p role="status">Loading conversations…</p> : !thread ? <>
      {!threads.length && !error && <p>No conversations yet. Use Contact Host on an event to start one.</p>}
      {threads.map(row => <button className="host-inbox-thread btn-light" key={row.id} onClick={() => { setSelected(row.id); setText(''); }}>
        <span>{row.eventTitle}</span><small>{row.hostUid === user.uid ? 'From ' + row.senderName : 'Your enquiry'}{row.unreadBy?.[user.uid] > 0 ? ' · Unread' : ''}</small><span>{row.lastMessage}</span>
      </button>)}</> : <>
      <button className="btn-light" disabled={busy} onClick={() => { if (!text || window.confirm('Discard your unsent reply?')) { setSelected(''); setText(''); } }}>All conversations</button>
      <h3>{thread.eventTitle}</h3><p className="small">Private conversation · Showing up to 200 recent messages.</p>
      <div className="host-inbox-messages" aria-label="Conversation messages">{messages.map(row => <article key={row.id}><strong>{row.senderUid === user.uid ? 'You' : row.senderName}</strong><p>{row.text}</p></article>)}</div>
      {readOnly ? <p>Replies are disabled in the read-only preview.</p> : <form onSubmit={reply}><label>Write a reply<textarea value={text} onChange={e => setText(e.target.value)} rows={4} maxLength={2000} disabled={busy} required /></label>
        <button disabled={busy || !text.trim()}>{busy ? 'Sending…' : 'Send reply'}</button></form>}
    </>}
  </section>;
}
