import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import ConnectedDirectoryWorkspace from '../../src/business/ConnectedDirectoryWorkspace';
import { createLocalDirectorySession } from '../../src/services/directory/localClient.mjs';
import { identities, address, seedRecords } from './fixtures.mjs';
import { recordingFirestore } from './recordingFirestore.mjs';
import { createDirectoryGateway } from '../../src/services/directory/gateway.mjs';
import '../../src/styles/tokens.css';
import '../../src/styles/theme.css';
import '../../src/styles/browse.css';

const contractMode = new URLSearchParams(location.search).get('transport') === 'contract';
const transport = contractMode ? recordingFirestore(seedRecords()) : null;
function Preview() {
  const [identity, setIdentity] = useState('member');
  const gateway = useMemo(() => contractMode
    ? createDirectoryGateway({ db: {}, user: identities[identity], sdk: transport.sdk })
    : createLocalDirectorySession(identities[identity]), [identity]);
  useEffect(() => () => { Promise.resolve(gateway.close()).catch(() => {}); }, [gateway]);
  return <><aside style={{ padding: 16, background: '#fff4d6' }}>
    <strong>{contractMode ? 'Contract rehearsal — in-memory data, Firebase rules are not evaluated' : 'Isolated Firebase rehearsal — synthetic accounts and data'}</strong>
    <p>Listings, promotions, favourites, categories, appeals and existing conversations use {contractMode ? 'the recording test transport' : 'the local Firestore emulator'}.
      {contractMode ? ' Image uploads and backend actions require the full emulator preview.' : ' Image uploads, enquiries, support and account archive/restore use the local emulators (run with -Full). ABN checks use synthetic responses only: 51 824 753 556, Example Community Catering. These are not real ABR verification results.'} No real email, SMS or account changes are sent.</p>
    <label>Test account <select value={identity} onChange={event => {
      if (window.__communityDirectoryCanAutoUpdate?.() === false && !window.confirm('Discard unfinished work and switch test accounts?')) return;
      setIdentity(event.target.value);
    }}>{Object.keys(identities).map(name => <option key={name}>{name}</option>)}</select></label>
  </aside><ConnectedDirectoryWorkspace key={identity} gateway={gateway} findAddresses={async () => [address]} /></>;
}
createRoot(document.getElementById('root')).render(<Preview />);
