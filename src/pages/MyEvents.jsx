import { registrationUnavailable } from '../registration/registrationStatus.mjs';
import React, { useState, useEffect } from 'react';
import EventCard from '../components/EventCard';
import ExperienceSwitch from '../components/ExperienceSwitch';
import { ClipboardList } from 'lucide-react';
import { getMyEvents, toggleEventVisibility } from '../services/eventService';
import { useRegistration, useRegistrationFeed } from '../registration/RegistrationContext';
import { compareEventsByDateTime } from '../services/dateUtils';

export default function MyEvents({ user, profile, setPage, setEditingEvent, handleDelete, handleCopy, onStreamStart, savedIds = [], onSaveToggle }) {
  const [myEvents,  setMyEvents]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [sourceUid,setSourceUid] = useState(null), [selection,setSelection] = useState(null);
  const registration = useRegistration();
  const hosted = useRegistrationFeed(registration?.api, 'mine', undefined, registration?.revision);
  const attending = useRegistrationFeed(registration?.api, 'attending', undefined, registration?.revision);
  const unique = rows => [...new Map(rows.map(event => [event.id,event])).values()].sort(compareEventsByDateTime);
  const organising = unique([...(sourceUid === user?.uid ? myEvents : []), ...hosted.events]);
  const bookings = unique(attending.events.filter(event => !registrationUnavailable(event)));
  const history = unique(attending.events.filter(registrationUnavailable));
  const [historySelection, setHistorySelection] = useState(null);
  const historyOpen = historySelection === user?.uid;
  const selected = selection && selection.uid === user?.uid ? selection.view : organising.length || !(bookings.length || history.length) ? 'organising' : 'attending';
  const allEvents = selected === 'organising' ? organising : historyOpen ? history : bookings;
  useEffect(() => {
    let current = true;
    setSourceUid(user?.uid || null);setMyEvents([]);setExpandedId(null);
    if (!user?.uid) { setLoading(false); return; }
    setLoading(true);
    getMyEvents(user.uid)
      .then(rows => { if(current) setMyEvents(rows); })
      .catch(() => { if(current) setMyEvents([]); })
      .finally(() => { if(current) setLoading(false); });
    return () => { current = false; };
  }, [user?.uid]);

  const handleToggle = async (event) => {
    const newHidden = !event.hidden;
    try {
      await toggleEventVisibility(event.id, newHidden);
      setMyEvents(prev => prev.map(e =>
        e.id === event.id ? { ...e, hidden: newHidden } : e
      ));
      if (window.showToast) window.showToast(
        newHidden ? '🙈 Event hidden from home screen' : '👁 Event visible on home screen',
        'success'
      );
    } catch(e) {
      if (window.showToast) window.showToast('Error: ' + e.message, 'error');
    }
  };

  const handleMyDelete = async (id) => {
    await handleDelete(id);
    setMyEvents(prev => prev.filter(e => e.id !== id));
  };

  return (
    <>
      <ExperienceSwitch label="My event lists" options={[
        {id:'my-organising',label:`Events I organise (${organising.length})`,selected:selected === 'organising',controls:'my-event-list',onClick:()=>{setSelection({uid:user.uid,view:'organising'});setExpandedId(null);}},
        {id:'my-attending',label:`My registrations (${bookings.length})`,selected:selected === 'attending',controls:'my-event-list',onClick:()=>{setSelection({uid:user.uid,view:'attending'});setExpandedId(null);}},
      ]}/>
      <p className="small">{selected === 'organising' ? 'Events you submitted. Manage their details and registration responses.' : 'Events you booked places for. Open an event to view or edit your registration.'}</p>
      {selected === 'attending' && history.length > 0 && <button type="button" className="cc-registration-history-toggle" aria-pressed={historyOpen} onClick={() => {setHistorySelection(historyOpen ? null : user.uid);setExpandedId(null);}}>{historyOpen ? 'Back to active registrations' : `Registration history (${history.length})`}</button>}
      <section id="my-event-list" role="tabpanel" aria-labelledby={selected === 'organising' ? 'my-organising' : 'my-attending'}>
      {loading && (
        <div className="card center">
          <p style={{ color: 'var(--muted)' }}>Loading your events…</p>
        </div>
      )}

      {(hosted.error || attending.error) && <div className="card" role="alert">{hosted.error || attending.error}<button onClick={() => registration.refresh()}>Retry registration events</button></div>}
      {(hosted.loading || attending.loading) && <p role="status">Loading your registration events...</p>}
      {!loading && !hosted.loading && !attending.loading && allEvents.length === 0 && (
        <div className="card center">
          <p style={{ color: 'var(--muted)', marginBottom: 12 }}>{selected === 'organising' ? 'You haven’t submitted any events yet.' : 'You have no event registrations yet.'}</p>
          {selected === 'organising' && <button onClick={() => setPage('add')}>Add your first event</button>}
        </div>
      )}

      {!loading && allEvents.length > 0 && <div className="desktop-page-event-grid">
      {allEvents.map(e => (
        <div key={e.id}>
          {/* Visibility toggle row */}
          {!e.registrationOnly && <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '4px 4px 2px', flexWrap: 'wrap'
          }}>
            <span style={{
              fontSize: '0.6875rem', fontWeight: 600,
              color: e.hidden ? 'var(--cc-accent-strong)' : 'var(--cc-success)',
            }}>
              {e.hidden ? '🙈 Hidden from home screen' : '👁 Visible on home screen'}
            </span>
            <button
              onClick={() => handleToggle(e)}
              style={{
                fontSize: '0.6875rem', padding: '3px 10px', borderRadius: 6,
                border: 'none', cursor: 'pointer', fontWeight: 600,
                background: e.hidden ? 'var(--cc-accent-strong)' : 'var(--cc-background)',
                color: e.hidden ? 'var(--cc-on-primary)' : 'var(--cc-muted)',
              }}>
              {e.hidden ? '👁 Make Visible' : '🙈 Hide Event'}
            </button>
          </div>}

          {/* Event card with slight opacity if hidden */}
          <div style={{ opacity: e.hidden ? 0.65 : 1, transition: 'opacity 0.2s' }}>
            <EventCard
              event={e}
              user={user}
              profile={profile}
              onEdit={ev => { setEditingEvent(ev); setPage('edit'); }}
              onDelete={handleMyDelete}
              onCopy={handleCopy}
              isExpanded={expandedId === e.id}
              onExpand={setExpandedId}
              onStreamStart={onStreamStart}
              savedIds={savedIds} onSaveToggle={onSaveToggle} onCalendar={() => setPage('calendar')}
            />
            {e.registrationOnly && expandedId !== e.id && (e.canManage ?? (e.ownerUid === user?.uid)) && <div className="cc-registration-card-shortcuts"><button type="button" disabled={!registration?.open} onClick={() => registration.open(e, 'responses')}><ClipboardList size={19} aria-hidden="true"/>Registration responses</button></div>}
          </div>
        </div>
      ))}
      </div>}
      </section>
    </>
  );
}
