import React, { useEffect, useRef, useState } from 'react';
import { Badge, Panel, Empty, Field, ConfirmDialog } from './WorkspaceParts';

export function SavedBusinesses({ businesses, savedIds, onOpen, onAction }) {
  const [confirm, setConfirm] = useState(null);
  const rows = businesses.filter(row => savedIds.includes(row.id));
  return <>{!rows.length ? <Empty title="No saved businesses"><p>Save a business to find it here later.</p></Empty> : <div className="bw-grid">{rows.map(row => <Panel key={row.id} title={row.name}><p>{row.category || row.categories?.join(' · ')}</p><p className="bw-muted">{row.location?.suburb}</p><div className="bw-actions"><button onClick={() => onOpen(row.id)}>View business</button><button className="btn-light" onClick={() => setConfirm(row)}>Remove saved business</button></div></Panel>)}</div>}{confirm && <ConfirmDialog title="Remove saved business?" description={confirm.name} confirmLabel="Remove" onClose={() => setConfirm(null)} onConfirm={() => onAction('saved.remove', { id: confirm.id })}/>}</>;
}

export function Notifications({ notifications, onAction, onOpen }) {
  const [appeal, setAppeal] = useState(null), [clear, setClear] = useState(false);
  return <><div className="bw-actions"><p>{notifications.filter(row => !row.read).length} unread updates</p><button className="btn-light" disabled={!notifications.some(row => !row.moderation)} onClick={() => setClear(true)}>Clear notifications on this device</button></div>
    {!notifications.length && <Empty title="No notifications yet"><p>Updates from Events and the Business Directory will appear here.</p></Empty>}
    <div className="bw-stack">{notifications.map(row => <Panel key={row.id} className={!row.read ? 'bw-unread' : ''}><div className="bw-card-heading"><h2>{row.title}</h2>{!row.read && <Badge status="Unread"/>}</div><p>{row.body}</p>{row.appealDecision && <p>Appeal decision: {row.appealDecision}. {row.appealReason}</p>}<p className="bw-muted">{row.date}</p>{row.moderation ? <><p>Moderation notices are retained when other notifications are cleared.</p>{row.appealStatus === 'submitted' ? <Badge status="Appeal submitted"/> : <button className="btn-light" onClick={() => setAppeal(row)}>Appeal decision</button>}</> : <button className="btn-light" onClick={() => onOpen(row)}>Open update</button>}</Panel>)}</div>
    {clear && <ConfirmDialog title="Clear notifications?" description="Regular updates will be marked read and cleared on this device. Moderation notices will remain." confirmLabel="Clear notifications" onClose={() => setClear(false)} onConfirm={() => onAction('notifications.clear', {})}/>}
    {appeal && <ConfirmDialog title="Appeal moderation decision" description="Explain why this decision should be reconsidered. The original decision and appeal are retained." requireReason confirmLabel="Submit appeal" onClose={() => setAppeal(null)} onConfirm={reason => { if (reason.length < 20) throw new Error('Please provide at least 20 characters.'); return onAction('notification.appeal', { id: appeal.id, reason }); }}/>}
  </>;
}

export function BusinessInbox({ threads, profile, onAction, initialThread, onDirty, listenMessages }) {
  const [selectedId, setSelectedId] = useState(initialThread || '');
  const reportRequest = useRef(null);
  const [reply, setReply] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [dialog, setDialog] = useState('');
  useEffect(() => { onDirty?.(Boolean(reply)); }, [reply, onDirty]);
  const visible = threads.filter(row => row.ownerUid === profile.uid || row.senderUid === profile.uid).sort((a,b) => b.updatedMillis - a.updatedMillis);
  const selected = visible.find(row => row.id === selectedId);
  const [messages, setMessages] = useState([]);
  useEffect(() => {
    setMessages([]); setError('');
    if (!selected?.id || !listenMessages) return;
    return listenMessages(selected.id, setMessages, error => setError(error.message || 'Could not load messages.'));
  }, [selected?.id, listenMessages]);
  if (!selected) return <>{!visible.length ? <Empty title="No conversations yet"><p>Start an enquiry from a business page. Replies and customer messages will appear here.</p></Empty> : <div className="bw-stack">{visible.map(row => <button className="bw-thread" key={row.id} onClick={async () => { setSelectedId(row.id); setReply(''); setError(''); try { await onAction('thread.read', { id: row.id }); } catch (error) { setError(error.message); } }}><span className="directory-initial" aria-hidden="true">{row.businessName[0]}</span><span><strong>{row.businessName}</strong><small>{row.ownerUid === profile.uid ? `From ${row.senderName}` : 'Your enquiry'}</small><span>{row.lastMessage || row.messages.at(-1)?.text}</span><small>{row.date}</small></span>{row.unread > 0 && <span className="bw-badge">{row.unread} unread</span>}</button>)}</div>}{error && <p role="alert" className="bw-error">{error}</p>}</>;
  const blocked = selected.blocked || selected.adminBlocked || selected.blockedByOther;
  return <><button className="btn-light" onClick={() => { if (reply && !window.confirm('Discard your unsent reply?')) return; setReply(''); onDirty?.(false); setSelectedId(''); }}>← All conversations</button><Panel title={selected.businessName}><p>{selected.ownerUid === profile.uid ? `Enquiry from ${selected.senderName}` : 'Your enquiry to this business'}</p><div className="bw-actions"><button className="btn-light" onClick={() => setDialog('block')}>{selected.blocked ? 'Unblock conversation' : 'Block conversation'}</button><button className="btn-light" onClick={() => setDialog('report')}>Report conversation</button></div></Panel>
    <div role="log" aria-label="Conversation" className="bw-messages">{(listenMessages ? messages : selected.messages).map(message => <div key={message.id} className={`bw-message ${message.senderUid === profile.uid ? 'bw-mine' : ''}`}><p>{message.text}</p><small>{message.date}</small></div>)}</div>
    <Panel>{blocked ? <p role="status">{selected.adminBlocked ? 'An administrator has blocked this conversation.' : 'This conversation is blocked.'}</p> : <form onSubmit={async event => { event.preventDefault(); if (!reply.trim() || busy) return; setBusy(true); setError(''); try { await onAction('thread.reply', { id: selected.id, text: reply.trim() }); setReply(''); } catch (error) { setError(error.message); } finally { setBusy(false); } }}><Field label="Write a reply"><textarea maxLength={2000} value={reply} disabled={busy} onChange={event => setReply(event.target.value)}/></Field><button disabled={!reply.trim() || busy}>{busy ? 'Sending…' : 'Send reply'}</button></form>}{error && <p role="alert" className="bw-error">{error}</p>}</Panel>
    {dialog && <ConfirmDialog title={dialog === 'report' ? 'Report conversation' : selected.blocked ? 'Unblock conversation?' : 'Block conversation?'} description={dialog === 'report' ? 'Describe the safety, fraud or conduct concern for the directory team.' : 'Blocking prevents further replies until the conversation is unblocked.'} requireReason={dialog === 'report'} onClose={() => setDialog('')} onConfirm={reason => { const fingerprint = JSON.stringify([selected.id, reason]); if (dialog === 'report' && reportRequest.current?.fingerprint !== fingerprint) reportRequest.current = { fingerprint, id: 'support_' + crypto.randomUUID() }; return onAction(dialog === 'report' ? 'thread.report' : 'thread.block', { id: selected.id, reason, blocked: !selected.blocked, ...(dialog === 'report' ? { requestId: reportRequest.current.id } : {}) }); }}/>}
  </>;
}

export function EnquiryForm({ business, onAction, onDone, onCancel, onDirty }) {
  const [text, setText] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  return <Panel title={`Contact ${business.name}`}><p>Your enquiry is delivered through Business Inbox to the listing owner.</p><form onSubmit={async event => { event.preventDefault(); if (!text.trim()) return; setBusy(true); setError(''); try { const result = await onAction('thread.create', { businessId: business.id, text: text.trim() }); onDirty?.(false); onDone(result?.id); } catch (error) { setError(error.message); } finally { setBusy(false); } }}><Field label="Your enquiry"><textarea maxLength={2000} value={text} onChange={event => { setText(event.target.value); onDirty?.(Boolean(event.target.value)); }}/></Field>{error && <p role="alert" className="bw-error">{error}</p>}<div className="bw-actions"><button disabled={busy || !text.trim()}>{busy ? 'Sending…' : 'Send enquiry'}</button><button type="button" className="btn-light" disabled={busy} onClick={onCancel}>Cancel</button></div></form></Panel>;
}
