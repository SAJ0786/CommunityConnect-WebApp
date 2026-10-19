import React, { useEffect, useState } from 'react';
import { Notifications } from './MemberScreens';
import DirectoryWorkspace from './DirectoryWorkspace';
import PagePanel from '../components/PagePanel';
import { BusinessDirectoryView } from '../pages/BusinessDirectory';
import { emptyDirectoryData } from '../services/directory/gateway.mjs';

export default function ConnectedDirectoryWorkspace({ gateway, findAddresses, onRegisterNavigation, renderProfile, onSignOut, view, onOpenNotification }) {
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState({ data: emptyDirectoryData(), status: 'loading', profile: null });
  useEffect(() => {
    setState({ data: emptyDirectoryData(), status: 'loading', profile: null });
    return gateway.subscribe(setState, {notificationsOnly:view === 'notifications'});
  }, [gateway, retry, view]);
  const [notificationError, setNotificationError] = useState('');
  if (view === 'notifications') return <main className="cc-notifications bw-shell"><PagePanel page="notifications" subtitle="Updates from Events and the Business Directory."/>
    {state.error || notificationError ? <p role="alert" className="bw-error">{state.error || notificationError}</p> : null}
    {state.status === 'loading' ? <p role="status">Loading notifications…</p> : state.status === 'error' ? <button onClick={() => setRetry(value => value + 1)}>Retry</button> : <Notifications notifications={state.data.notifications} onAction={gateway.action} onOpen={async row => { try { await gateway.action('notification.read', {id:row.id}); onOpenNotification?.(row); } catch(error) { setNotificationError(error.message); } }}/>}</main>;
  return <>
    {state.error && <p role="alert" className="bw-error">{state.error}</p>}
    <DirectoryWorkspace {...state} onOpenNotification={onOpenNotification} onRegisterNavigation={onRegisterNavigation} renderProfile={renderProfile} onSignOut={onSignOut} onAction={gateway.action} listenMessages={gateway.listenMessages} loadOperations={gateway.loadOperations}
      findAddresses={findAddresses} lookupAbn={gateway.lookupAbn} onRetry={() => setRetry(value => value + 1)}
      renderHome={({ city, setCity, navigate }) => <BusinessDirectoryView showPagePanel={false} businesses={state.data.publicBusinesses}
        selectedCity={city} setSelectedCity={setCity} savedIds={state.data.savedIds} categoryCatalogue={state.data.categories}
        onOpenBusiness={id => navigate('detail', id)} onPromotions={() => navigate('promotions')} />}
    />
  </>;
}
