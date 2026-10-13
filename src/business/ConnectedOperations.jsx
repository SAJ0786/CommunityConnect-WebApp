import React, { useCallback, useEffect, useRef, useState } from 'react';
import { SupportDelivery, ModerationQueue } from './OperationsScreens';

// Mounted per account/scope, view and selected case. Never caches private reports.
export default function ConnectedOperations({ loadOperations, view, selectedId, profile, businesses, threads, onSelect, onAction }) {
  const [state, setState] = useState({ loading: true, rows: [], nextCursor: null, error: '' });
  const [queue, setQueue] = useState(selectedId?.startsWith('appeal:') ? 'appeals' : 'moderation');
  const generation = useRef(0);
  const load = useCallback(async (cursor = '') => {
    const version = ++generation.current;
    setState(previous => ({ ...previous, loading: true, error: '', ...(cursor ? {} : { rows: [], nextCursor: null }) }));
    try {
      const result = await loadOperations({ view: view === 'moderation' ? queue : view, cursor, id: view === 'moderation' ? selectedId : '' });
      if (generation.current !== version) return;
      const rows = view === 'deliveries' ? result.supportRequests : result.moderationCases;
      setState(previous => ({ loading: false, error: '', nextCursor: result.nextCursor, rows: cursor ? [...previous.rows, ...rows] : rows }));
    } catch (error) {
      if (generation.current === version) setState({ loading: false, rows: [], nextCursor: null, error: error.message || 'Unable to load reports.' });
    }
  }, [loadOperations, view, selectedId, queue]);
  useEffect(() => { load(); return () => { generation.current++; }; }, [load]);
  const decide = async (type, payload) => {
    const result = await onAction(type, payload);
    // A failed refresh does not turn a confirmed decision into a failed write.
    await load();
    return result;
  };
  return <>
    {view === 'moderation' && !selectedId && <div className="bw-actions" aria-label="Review queues">
      <button className={queue === 'moderation' ? '' : 'btn-light'} aria-pressed={queue === 'moderation'} onClick={() => setQueue('moderation')}>Reports and appeals</button>
      <button className={queue === 'appeals' ? '' : 'btn-light'} aria-pressed={queue === 'appeals'} onClick={() => setQueue('appeals')}>Earlier owner appeals</button>
    </div>}
    <div className="bw-actions"><button className="btn-light" disabled={state.loading} onClick={() => load()}>Refresh records</button></div>
    <p className="bw-muted">Filters search the loaded records. Load more to include additional pages.</p>
    {state.error && <p role="alert" className="bw-error">{state.error} Use Refresh records to retry.</p>}
    {state.loading && <p role="status">Loading private reports…</p>}
    <fieldset className="bw-form-body" disabled={state.loading}>
    {(!state.loading || state.rows.length > 0) && !state.error && (view === 'deliveries'
      ? <SupportDelivery rows={state.rows} profile={profile} onReview={onSelect}/>
      : <ModerationQueue rows={state.rows} profile={profile} businesses={businesses} threads={threads} selectedId={selectedId} onSelect={onSelect} onAction={decide}/>)}
    </fieldset>
    {state.nextCursor && <button disabled={state.loading} onClick={() => load(state.nextCursor)}>Load more records</button>}
  </>;
}
