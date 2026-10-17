import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Home from '../../src/pages/Home';
import CalendarView from '../../src/pages/CalendarView';
import HijriCalendar from '../../src/pages/HijriCalendar';
import AddEvent from '../../src/pages/AddEvent';
import EditEvent from '../../src/pages/EditEvent';
import AddSeriesEvents from '../../src/pages/AddSeriesEvents';
import StreamCard from '../../src/pages/StreamCard';
import PreCheckCard from '../../src/components/PreCheckCard';
import Profile from '../../src/pages/Profile';
import AdminDashboard from '../../src/pages/AdminDashboard';
import MyEvents from '../../src/pages/MyEvents';
import HostInbox from '../../src/pages/HostInbox';
import { auth } from './mocks';
import Favourites from '../../src/pages/Favourites';
import BulkShare from '../../src/pages/BulkShare';
import AISearch from '../../src/pages/AISearch';
import InstallApp from '../../src/pages/InstallApp';
import StreamedVideos from '../../src/pages/StreamedVideos';
import { BusinessDirectoryView } from '../../src/pages/BusinessDirectory';
import Header from '../../src/components/Header';
import BottomNav from '../../src/components/BottomNav';
import ShareSheet from '../../src/components/ShareSheet';
import DefaultCityPrompt from '../../src/components/DefaultCityPrompt';
import GuestEditModal from '../../src/components/GuestEditModal';
import Toast, { showToast } from '../../src/components/Toast';
import { toPublicBusiness } from '../../src/utils/publicBusinesses.mjs';
import { resolveThemeColor } from '../../src/utils/themeColor.mjs';
import PagePanel from '../../src/components/PagePanel';
import { RegistrationContext } from '../../src/registration/RegistrationContext';
import RegistrationWorkspace from '../../src/registration/RegistrationWorkspace';
import { registrationEventCard } from '../../src/registration/eventFeed.mjs';
import { registrationFixture } from './registrationFixture.mjs';
import '../../src/styles/theme.css';
import '../../src/styles/directory.css';
import './preview.css';
const today = new Date();
const date = new Date(today.getTime() - today.getTimezoneOffset()*60000).toISOString().slice(0,10);
const user = { uid: 'synthetic-member', phoneNumber: '+61400000000', email: 'member@example.test' };
const initialProfile = { fullName: 'Example Member', email: 'member@example.test', role: 'superAdmin', defaultCity: 'sydney', phone: '+61400000000' };
const events = ['Family Event','Ladies only','Gents only','Kids only'].map((audienceType, i) => ({
  id: `fixture-${i}`, eventDate: date, startTime: `1${i}:00`, endTime: `1${i+1}:00`, eventType: i%2 ? 'Community Event' : 'Majlis',
  hostName: ['Example Community Centre','Example Family Gathering','Example Learning Circle','Example Weekend Workshop'][i],
  hostPhone: '+61400000000', organiserType: 'organisation', organisationName: 'Example Community', audienceType,
  createdByUserId: user.uid, metroArea: 'sydney', notes: 'Synthetic event for visual review. No booking, notification or account action is sent.',
  address: { fullAddress: 'Example address, Parramatta NSW', suburb: 'Parramatta', state: 'NSW', postcode:'2150' },
}));
// Include long type labels and the excluded test option in visual filter reviews.
events.push(...['Friday Prayers', 'Dua-e-Tawassul', 'Dua-e-Kumail', 'Dua', 'Prayers & Amal', 'Test Event'].map((eventType, i) => ({
  ...events[0], id:`type-fixture-${i}`, eventType, hostName:'Example Type Review',
})));
Object.assign(events[0], { isRecurring: true, seriesId: 'synthetic-series' });
events.push(...[1, 2].map(day => {
  const next = new Date(today.getTime() + day * 86400000);
  return { ...events[0], id: `series-future-${day}`, eventDate: new Date(next.getTime() - next.getTimezoneOffset() * 60000).toISOString().slice(0,10),
    hostName: 'Synthetic future series occurrence' };
}));
window.__uiEvents = events;
window.__uiMembers = [initialProfile, { ...initialProfile, fullName: 'Another Member', role:'user' }].map((p,i)=>({...p,id:'example-'+i,registeredAt:{seconds:1700000000+i}}));
window.__resolveThemeColor = resolveThemeColor;
const businesses = [
  { id:'example', name:'Example Nearby Services', latitude:-33.81, longitude:151, age:2 },
  { id:'farther', name:'Example Established Services', latitude:-33.91, longitude:151, age:45 },
  { id:'newest', name:'Example New Business', latitude:-33.82, longitude:151, age:1 },
  { id:'missing', name:'Example Without Coordinates', age:3 },
].map(row => toPublicBusiness(row.id, { name:row.name, category:'Home Services', status:'approved', hidden:false,
  description:'Synthetic public listing for visual review.', firstPublishedAt:new Date(Date.now()-row.age*86400000),
  location:{city:'sydney',suburb:'Parramatta',state:'NSW',publicDisplay:'suburb',latitude:row.latitude,longitude:row.longitude},
  hours:{mon:{open:'09:00',close:'17:00'}}, contact:{website:'https://example.com'} }));
const screens = { home:Home, calendar:CalendarView, hijri:HijriCalendar, add:AddEvent, edit:EditEvent, series:AddSeriesEvents, my:MyEvents, 'host-inbox':HostInbox, favourites:Favourites, profile:Profile, admin:AdminDashboard, bulk:BulkShare, search:AISearch, install:InstallApp, videos:StreamedVideos, stream:StreamCard, precheck:PreCheckCard };
const noop = () => {};
function Preview() {
  const [page,setPage] = useState(new URLSearchParams(location.search).get('screen') || 'home');
  const [profile,setProfile] = useState(initialProfile);
  const [city,setCity] = useState('sydney');
  const [modal,setModal] = useState('');
  const [guest,setGuest] = useState(false);
  const [persona,setPersona] = useState('superAdmin');
  const [status,setStatus] = useState('ready');
  const [editingEvent,setEditingEvent] = useState(events[0]);
  const [eventRows,setEventRows] = useState(events);
  const [registrationRevision,setRegistrationRevision] = useState(0), [operation,setOperation] = useState(null), [focusEventId,setFocusEventId] = useState(null);
  auth.currentUser = guest ? null : persona === 'member' ? {...user,uid:'synthetic-viewer'} : user;
  const registrationReview = new URLSearchParams(location.search).has('registration');
  const fixture = useMemo(() => registrationReview ? registrationFixture(date, auth.currentUser || user, profile.role, guest,
    new URLSearchParams(location.search).has('registered'), new URLSearchParams(location.search).has('changes')) : null, [registrationReview, guest, persona]);
  if (fixture) window.__registrationCalls = fixture.calls;
  window.__uiReviewStatus = status;
  const Screen = screens[page] || Home;
  const props = { events: status==='empty'?[]:[...eventRows,...(fixture ? fixture.publicRows().map(registrationEventCard) : [])], user:auth.currentUser || user, profile, setProfile, setPage, setEditingEvent, handleDelete:noop, handleCopy:noop, isGuest:guest, loadEvents:async()=>setEventRows([...window.__uiEvents]), savedIds:['fixture-0'], onSaveToggle:noop, onStreamStart:noop, selectedCity:city, setSelectedCity:setCity, focusEventId, setFocusEventId, onSaved:()=>{setEventRows([...window.__uiEvents]);setPage('my');}, eventsLoading:status==='loading', offlineMode:status==='cached', editingEvent, event:events[0], role:'host', nativeStream:{mode:'external'}, onClose:()=>setPage('home'), onCancel:()=>setPage('home') };
  return <>
    <aside className="ui-review-bar"><strong>Offline UI review</strong><span>Synthetic data · no Firebase · no sign-in</span>
      <label>Screen <select aria-label="Review screen" value={page} onChange={e=>setPage(e.target.value)}>{[...Object.keys(screens),'directory','registration-create'].map(p=><option key={p}>{p}</option>)}</select></label>
      <label><input type="checkbox" checked={guest} onChange={e=>setGuest(e.target.checked)}/> Guest layout</label>
      <label>Role <select aria-label="Review role" value={persona} onChange={e=>{setPersona(e.target.value);setProfile(current=>({...current,role:['member','owner'].includes(e.target.value)?'user':e.target.value}));}}>{['member','owner','admin','superAdmin'].map(role=><option key={role}>{role}</option>)}</select></label>
      <label>State <select aria-label="Review state" value={status} onChange={e=>setStatus(e.target.value)}>{['ready','empty','loading','cached','error'].map(s=><option key={s}>{s}</option>)}</select></label>
      <button onClick={()=>window.__showShareSheet({text:'Example event for UI review only.'})}>Share dialog</button>
      <button onClick={()=>setModal('city')}>City dialog</button><button onClick={()=>setModal('guest')}>Guest dialog</button>
      <button onClick={()=>showToast('Example success message','success')}>Toast</button>
    </aside>
    <Header {...props} page={page}/>
    <main className={`ui-review-content ${page==='home'?'is-home':''}`} key={page+'-'+guest+'-'+persona}>
      <RegistrationContext.Provider value={fixture ? { api:fixture.api, revision:registrationRevision, refresh:()=>setRegistrationRevision(value=>value+1),
        open:(event,action)=>{ if(guest) { window.__registrationGuestPrompt=true; return; } setOperation({id:event.id,action}); setPage('registration'); } } : null}>
      {!['directory', 'registration', 'registration-create'].includes(page) && <PagePanel page={({hijri:'hijri-calendar',bulk:'bulkshare',videos:'streams',series:'add',stream:'streams',precheck:'streams'})[page] || page}/>}
      {(page === 'registration' && operation || page === 'registration-create') ? <RegistrationWorkspace api={fixture.api} enabled operationsOnly initialCreate={page === 'registration-create'} initialEventId={operation?.id} initialAction={operation?.action}
        user={props.user} profile={profile} city={city} onSubmitted={event=>{setFocusEventId(event.id);setOperation(null);setRegistrationRevision(value=>value+1);setPage('home');}} onBack={()=>{setOperation(null);setRegistrationRevision(value=>value+1);setPage('home');}}/>
        :
      page==='directory'?<BusinessDirectoryView businesses={status==='empty'?[]:businesses} loading={status==='loading'} error={status==='error'} fromCache={status==='cached'} selectedCity={city} setSelectedCity={setCity} onRetry={()=>setStatus('ready')} requestLocation={async()=>{if(status==='error')throw new Error('Location denied in the synthetic review.');return {latitude:-33.81,longitude:151};}}/>:<Screen {...props}/>
      }
      </RegistrationContext.Provider>
    </main>
    {page!=='directory'&&<BottomNav page={page} setPage={setPage} isGuest={guest} profile={profile} user={user} onOpenMenu={() => window.dispatchEvent(new CustomEvent('community-events-walkthrough-menu', {detail:{open:true}}))}/>}
    <ShareSheet/><Toast/>
    {modal==='city'&&<DefaultCityPrompt onSave={async()=>setModal('')}/>}
    {modal==='guest'&&<GuestEditModal event={events[0]} onClose={()=>setModal('')} onVerified={noop}/>}
  </>;
}
createRoot(document.getElementById('root')).render(<Preview/>);
