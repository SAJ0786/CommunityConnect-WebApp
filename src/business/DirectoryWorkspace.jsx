import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Home, Tags, Heart, Inbox, Bell, Store, CircleHelp, ShieldCheck, Plus } from 'lucide-react';
import { BUSINESS_ADMIN_GROUPS } from '../utils/adminNavigation.mjs';
import BottomNav from '../components/BottomNav';
import AccountMenu from '../components/AccountMenu';
import AdminActionPanels from '../components/AdminActionPanels';
import { SavedBusinesses, Notifications, BusinessInbox, EnquiryForm } from './MemberScreens';
import OwnerScreen from './OwnerScreen';
import ConnectedOperations from './ConnectedOperations';
import { BusinessListingForm, BusinessPromotionForm } from './BusinessForms';
import { Reviews, DirectoryMembers, BusinessStatistics } from './AdminScreens';
import { CategoryManagement, Diagnostics, SupportRequestForm, SupportDelivery, ModerationQueue } from './OperationsScreens';
import { BUSINESS_CATEGORIES } from './categories.mjs';
import { isAdmin, historical, scopedBusinesses } from './workspaceModel.mjs';
import { Panel, Empty, Metrics } from './WorkspaceParts';
import PublicBusinessPage from '../pages/PublicBusinessPage';
import PublicPromotionList from '../components/PublicPromotionList';
import { activePublicPromotions } from '../utils/publicPromotions.mjs';
import { usePromotionDay } from '../utils/usePublicDirectory';
import { CITY_OPTIONS } from '../utils/cities';
import '../styles/directory.css';
import './workspace.css';

const sidebarIcons = { home:Home, promotions:Tags, saved:Heart, inbox:Inbox, notifications:Bell, owner:Store, support:CircleHelp, admin:ShieldCheck };
const names = { profile: 'My Profile', tools: 'Categories and tools', diagnostics: 'Business diagnostics', support: 'Feedback and support', deliveries: 'Support delivery records', moderation: 'Moderation review', home: 'Discover businesses', promotions: 'Current promotions', saved: 'Saved businesses', notifications: 'Notifications', inbox: 'Business Inbox', owner: 'My businesses', listing: 'Business listing', promotion: 'Business promotion', admin: 'Admin Dashboard', reviews: 'Business and promotion reviews', manage: 'Manage businesses', members: 'Directory members', statistics: 'Business statistics', detail: 'Business details', enquiry: 'Contact business' };
const readRoute = () => { const [page = 'home', id = ''] = window.location.hash.replace(/^#\/?/, '').split('/'); try { return { page: names[page] ? page : 'home', id: decodeURIComponent(id) }; } catch { return { page: 'home', id: '' }; } };

// Data and commands are injected by the isolated controller or offline fixtures.
export default function DirectoryWorkspace({ onOpenNotification, data, profile, onAction, findAddresses, lookupAbn, status = 'ready', onRetry, listenMessages, renderHome, loadOperations, onRegisterNavigation, renderProfile, onSignOut }) {
  const [route, setRoute] = useState(readRoute), [city, setCity] = useState('sydney'), [query, setQuery] = useState(''), [message, setMessage] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const dirty = useRef(false), routeRef = useRef(route), inFlight = useRef(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const today = usePromotionDay();
  useEffect(() => {
    const previous = window.__communityDirectoryCanAutoUpdate;
    const guard = () => !dirty.current && !inFlight.current;
    window.__communityDirectoryCanAutoUpdate = guard;
    return () => {
      if (window.__communityDirectoryCanAutoUpdate === guard) {
        if (previous) window.__communityDirectoryCanAutoUpdate = previous;
        else delete window.__communityDirectoryCanAutoUpdate;
      }
    };
  }, []);
  useEffect(() => {
    const change = () => { if (dirty.current && !window.confirm('Leave this form and discard unsaved changes?')) { history.replaceState(history.state, '', `#/${routeRef.current.page}/${encodeURIComponent(routeRef.current.id)}`); return; } dirty.current = false; const next = readRoute(); routeRef.current = next; setRoute(next); setMessage(''); setError(''); };
    const unload = event => { if (dirty.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('hashchange', change); window.addEventListener('beforeunload', unload);
    return () => { window.removeEventListener('hashchange', change); window.removeEventListener('beforeunload', unload); };
  }, []);
  useEffect(() => { document.title = `${names[route.page]} | Community Connect Australia`; window.scrollTo(0,0); }, [route.page, route.id]);
  const canLeave = useCallback(() => {
    if (inFlight.current) return false;
    if (dirty.current && !window.confirm('Leave this form and discard unsaved changes?')) return false;
    dirty.current = false; return true;
  }, []);
  const navigate = useCallback((page, id = '') => {
    if (!canLeave()) return false;
    setMenuOpen(false); window.location.hash = `/${page}/${encodeURIComponent(id)}`; return true;
  }, [canLeave]);
  useEffect(() => {
    onRegisterNavigation?.(command => {
      if (command === 'menu') { setMenuOpen(true); return true; }
      if (command === 'leave') return canLeave();
      return navigate(command);
    });
    return () => onRegisterNavigation?.(null);
  }, [onRegisterNavigation, navigate, canLeave]);
  const run = async (type, payload) => {
    if (!onAction) throw new Error('Account actions are not connected yet.');
    if (inFlight.current) throw new Error('Please wait for the current action to finish.');
    inFlight.current = true; setBusy(true); setError(''); setMessage('');
    try { const result = await onAction(type, payload); setMessage('Changes saved.'); return result; }
    catch (error) { setError(error.message || 'The action failed. Please try again.'); throw error; }
    finally { inFlight.current = false; setBusy(false); }
  };
  const saveAndReturn = async (type, payload) => { await run(type, payload); dirty.current = false; navigate('owner'); };
  const ownerBusinesses = data.businesses.filter(row => row.ownerId === profile?.uid);
  const ownerPromotions = data.promotions.filter(row => row.ownerId === profile?.uid);
  const admin = isAdmin(profile);
  const adminBusinesses = scopedBusinesses(data.businesses, profile);
  const adminMembers = data.members.filter(row => profile?.role === 'superAdmin' || row.defaultCity === (profile?.adminCity || profile?.defaultCity));
  const adminPages = ['admin','reviews','manage','members','statistics','tools','diagnostics','deliveries','moderation'];
  const restricted = (!profile && !['home','promotions','detail'].includes(route.page)) || (adminPages.includes(route.page) && !admin);
  const publicRows = data.publicBusinesses.filter(row => row.city === city && [row.name,row.description,...row.services].join(' ').toLowerCase().includes(query.toLowerCase()));
  const business = data.publicBusinesses.find(row => row.id === route.id);
  const currentOffers = activePublicPromotions(data.publicPromotions, data.publicBusinesses, { today, ...(route.page === 'detail' ? { businessId: route.id } : { city }) });
  const nav = [['home','Businesses'],['promotions','Promotions'],['saved','Saved businesses'],['inbox','Business Inbox'],['notifications','Notifications'],['owner','My Business'],['support','Feedback and support'],...(admin ? [['admin','Admin Dashboard']] : [])];
  return <div className="bw-shell"><header className="bw-header bw-workspace-header"><div><p className="directory-eyebrow">Community Connect Australia</p><strong>Business Directory</strong></div><span>{profile?.fullName || 'Guest browsing'}</span></header>
    <div className="bw-layout"><nav id="workspace-navigation" className="bw-nav" aria-label="Business workspace">{nav.map(([key,label]) => { const Icon = sidebarIcons[key]; return <button key={key} aria-current={route.page === key ? 'page' : undefined} onClick={() => navigate(key)}><Icon size={20} aria-hidden="true"/><span>{label}{key === 'notifications' && data.notifications.some(row => !row.read) ? ` (${data.notifications.filter(row => !row.read).length})` : ''}</span></button>; })}<button className="bw-add" onClick={() => navigate('listing')}><Plus size={20} aria-hidden="true"/><span>Add Business</span></button></nav>
      <main className="bw-main" aria-labelledby="workspace-title"><div className="bw-page-heading" hidden={route.page === 'home' && !!renderHome}>{!['home','promotions'].includes(route.page) && <button className="btn-light" onClick={() => navigate(adminPages.includes(route.page) && route.page !== 'admin' ? 'admin' : 'home')}>← {adminPages.includes(route.page) && route.page !== 'admin' ? 'Administration' : 'Directory'}</button>}<h1 id="workspace-title">{names[route.page]}</h1></div>
        {message && <p role="status" className="bw-success">{message}</p>}{error && <p role="alert" className="bw-error">{error}</p>}
        {restricted && !['loading', 'error'].includes(status) ? <Empty title={profile ? 'Administrator access required' : 'Member access required'}><p>{profile ? 'This area is available to authorised directory administrators.' : 'Sign in to access saved businesses, conversations and owner tools.'}</p></Empty>
          : status === 'loading' ? <p role="status" className="bw-empty">Loading directory information…</p>
          : status === 'error' ? <Empty title="We couldn’t load this screen"><p>Please try again.</p><button onClick={onRetry}>Retry screen</button></Empty>
          : data.unavailablePages?.[route.page] && !(loadOperations && ['deliveries','moderation'].includes(route.page)) ? <Empty title="This workflow is not connected"><p>{data.unavailablePages[route.page]}</p></Empty>
          : <>
            {status === 'cached' && <p role="status" className="bw-notice">Showing saved information. Reconnect before making changes.</p>}
            <fieldset className="bw-form-body" disabled={busy || status === 'cached' || !onAction}>
            {(route.page === 'promotions' || route.page === 'home' && !renderHome) && <div className="bw-grid"><label className="bw-field">Your city<select value={city} onChange={event => setCity(event.target.value)}>{CITY_OPTIONS.map(row => <option key={row.value} value={row.value}>{row.label}</option>)}</select></label>{route.page === 'home' && <label className="bw-field">Search businesses<input value={query} onChange={event => setQuery(event.target.value)}/></label>}</div>}
            {route.page === 'home' && renderHome && renderHome({ city, setCity, navigate })}
            {route.page === 'home' && !renderHome && (publicRows.length ? <div className="bw-grid">{publicRows.map(row => <Panel key={row.id} title={row.name}><p>{row.categories.join(' · ')}</p><p>{row.description}</p><p className="bw-muted">{row.address}</p><div className="bw-actions"><button onClick={() => navigate('detail',row.id)}>View business</button>{profile && <button className="btn-light" onClick={() => run(data.savedIds.includes(row.id) ? 'saved.remove' : 'saved.add', { id: row.id }).catch(() => {})}>{data.savedIds.includes(row.id) ? 'Unsave business' : 'Save business'}</button>}</div></Panel>)}</div> : <Empty title="No matching businesses"/>)}
            {route.page === 'promotions' && <><PublicPromotionList rows={currentOffers} onOpenBusiness={id => navigate('detail',id)}/><p className="bw-muted">Open a business from the directory to start an enquiry.</p></>}
            {route.page === 'detail' && <>{business && profile && <div className="bw-actions"><button onClick={() => navigate('enquiry',business.id)}>Contact business</button><button className="btn-light" onClick={() => navigate('support',business.id)}>Report a problem</button><button className="btn-light" onClick={() => run(data.savedIds.includes(business.id) ? 'saved.remove' : 'saved.add', { id: business.id }).catch(() => {})}>{data.savedIds.includes(business.id) ? 'Unsave business' : 'Save business'}</button></div>}<PublicBusinessPage embedded business={business} onBack={() => navigate('home')} promotionState={{ rows: currentOffers }}/></>}
            {route.page === 'profile' && renderProfile?.()}
            {route.page === 'saved' && <SavedBusinesses businesses={data.publicBusinesses} savedIds={data.savedIds} onOpen={id => navigate('detail',id)} onAction={run}/>}
            {route.page === 'notifications' && <Notifications notifications={data.notifications} onAction={run} onOpen={async row => { try { await run('notification.read', { id: row.id }); if (onOpenNotification?.(row) === true) return; navigate(row.destination || 'owner',row.targetId || ''); } catch {} }}/>}
            {route.page === 'inbox' && <BusinessInbox listenMessages={listenMessages} onDirty={value => { dirty.current = value; }} key={route.id || 'inbox'} profile={profile} threads={data.threads} initialThread={route.id} onAction={run}/>}
            {route.page === 'enquiry' && (business ? <EnquiryForm onDirty={value => { dirty.current = value; }} business={business} onAction={run} onCancel={() => navigate('detail',business.id)} onDone={id => navigate('inbox',id)}/> : <Empty title="Business unavailable"/>)}
            {route.page === 'owner' && <OwnerScreen businesses={ownerBusinesses} promotions={ownerPromotions} onAdd={() => navigate('listing')} onEdit={row => navigate('listing',row.id)} onPromotion={(row,id) => navigate('promotion',row?.id || `new:${id}`)} onAction={run}/>}
            {route.page === 'listing' && (route.id && !ownerBusinesses.some(row => row.id === route.id && !historical(row)) ? <Empty title="This listing cannot be edited"/> : <div onChangeCapture={() => { dirty.current = true; }}><BusinessListingForm categories={data.categories || BUSINESS_CATEGORIES} onDirty={() => { dirty.current = true; }} key={route.id || 'new'} initial={ownerBusinesses.find(row => row.id === route.id)} findAddresses={findAddresses} lookupAbn={lookupAbn} onCancel={() => navigate('owner')} onSave={form => saveAndReturn('business.save', { ...form, id: route.id || undefined })}/></div>)}
            {route.page === 'promotion' && (route.id && !route.id.startsWith('new:') && !ownerPromotions.some(row => row.id === route.id && !historical(row)) ? <Empty title="This promotion cannot be edited"/> : <div onChangeCapture={() => { dirty.current = true; }}><BusinessPromotionForm onDirty={() => { dirty.current = true; }} key={route.id} initial={ownerPromotions.find(row => row.id === route.id)} businessId={route.id.startsWith('new:') ? route.id.slice(4) : ''} businesses={ownerBusinesses} onCancel={() => navigate('owner')} onSave={form => saveAndReturn('promotion.save', { ...form, id: route.id.startsWith('new:') ? undefined : route.id || undefined })}/></div>)}
            {route.page === 'admin' && <><p className="bw-muted">Manage your directory, members and community operations.</p><Metrics items={[["Businesses",adminBusinesses.length],["Awaiting review",adminBusinesses.filter(row => row.status === 'pending').length],["Members",adminMembers.length]]}/><AdminActionPanels onSelect={navigate} groups={BUSINESS_ADMIN_GROUPS}/></>}
            {['reviews','manage'].includes(route.page) && <Reviews key={route.page} businesses={data.businesses} promotions={data.promotions} profile={profile} onAction={run} management={route.page === 'manage'}/>}
            {route.page === 'members' && <DirectoryMembers members={data.members} businesses={data.businesses} profile={profile} onAction={run}/>}
            {route.page === 'statistics' && <BusinessStatistics businesses={data.businesses} statistics={data.statistics} profile={profile}/>}
            {route.page === 'tools' && <CategoryManagement onDirty={value => { dirty.current = value; }} categories={data.categories || BUSINESS_CATEGORIES} onAction={run}/>}
            {route.page === 'diagnostics' && <Diagnostics data={data} profile={profile} feedState={status} onSupport={() => navigate('support')}/>}
            {route.page === 'support' && (route.id && !business ? <Empty title="Business unavailable"/> : <SupportRequestForm key={route.id || 'app'} business={business} profile={profile} onAction={run} onDirty={(value = true) => { dirty.current = value; }} onDone={() => navigate(route.id ? 'detail' : 'home',route.id)}/>)}
            {loadOperations && ['deliveries','moderation'].includes(route.page) && <ConnectedOperations
              key={[profile?.uid,profile?.role,profile?.adminCity,profile?.defaultCity,route.page,route.id].join(':')}
              loadOperations={loadOperations} view={route.page} selectedId={route.id} profile={profile}
              businesses={adminBusinesses} threads={data.threads} onSelect={id => navigate('moderation',id)} onAction={run}/>}
            {!loadOperations && route.page === 'deliveries' && <SupportDelivery rows={data.supportRequests || []} profile={profile} onReview={id => navigate('moderation',id)}/>}
            {!loadOperations && route.page === 'moderation' && <ModerationQueue rows={data.moderationCases || []} businesses={adminBusinesses} threads={data.threads} profile={profile} selectedId={route.id} onSelect={id => navigate('moderation',id)} onAction={run}/>}
            </fieldset>
          </>}
      </main>
    </div>
    <BottomNav directory page={route.page} setPage={navigate} profile={profile} isGuest={!profile} onOpenMenu={() => setMenuOpen(true)}/>
    <AccountMenu directory profileAvailable={!!renderProfile} open={menuOpen} onClose={() => setMenuOpen(false)} profile={profile} isGuest={!profile}
      onNavigate={navigate}
      onSignOut={onSignOut ? () => { if (canLeave()) onSignOut(); } : undefined}/>
  </div>;
}
