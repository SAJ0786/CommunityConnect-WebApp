// Synthetic fixtures only. This entry point is not included in production builds.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BusinessDirectoryView } from '../../src/pages/BusinessDirectory';
import ExperienceSwitch from '../../src/components/ExperienceSwitch';
import { toPublicBusiness } from '../../src/utils/publicBusinesses.mjs';
import '../../src/styles/theme.css';
import '../../src/styles/directory.css';

const businesses = [
  ['one', 'Example Community Catering', 'Food & Catering', 'sydney', 'Parramatta'],
  ['two', 'Example Local Services', 'Home & Services', 'sydney', 'Blacktown'],
  ['three', 'Example Melbourne Catering', 'Food & Catering', 'melbourne', 'Melbourne'],
].map(([id, name, category, city, suburb]) => toPublicBusiness(id, {
  name, category, status: 'approved', hidden: false, description: 'Demonstration listing for local interface checks. No real business or account is represented here.',
  subcategories: ['Community services'], location: { city, suburb, state: city === 'melbourne' ? 'VIC' : 'NSW', publicDisplay: 'suburb' },
  hours: { mon: { periods: [{ open: '09:00', close: '12:00' }, { open: '14:00', close: '18:00' }] }, tue: { open24Hours: true }, sun: { closed: true } },
  contact: { website: 'https://example.com' }, abnVerified: id === 'one',
}));

function Preview() {
  const [directory, setDirectory] = useState(true);
  const [selectedCity, setSelectedCity] = useState('sydney');
  const [status, setStatus] = useState('ready');
  return <>
    <aside style={{ padding: 12, background: 'var(--cc-warning-soft)', textAlign: 'center' }}>
      Local UI test · synthetic listings · no Firebase connection
      <label style={{ marginLeft: 16 }}>Test state <select value={status} onChange={e => setStatus(e.target.value)}>
        {['ready', 'loading', 'error', 'empty', 'cached'].map(value => <option key={value}>{value}</option>)}
      </select></label>
    </aside>
    <header style={{ padding: '20px', textAlign: 'center', fontWeight: 800, background: 'var(--cc-surface)' }}>Community Connect Australia</header>
    <ExperienceSwitch directory={directory} onEvents={() => setDirectory(false)} onBusinesses={() => setDirectory(true)} />
    {directory ? <BusinessDirectoryView businesses={status === 'empty' ? [] : businesses} loading={status === 'loading'} error={status === 'error'} fromCache={status === 'cached'} selectedCity={selectedCity} setSelectedCity={setSelectedCity} onRetry={() => setStatus('ready')} />
      : <main style={{ padding: 30, textAlign: 'center' }}><h1>Events navigation selected</h1><p>This isolated test does not load the Events app or live data. Use the switch to return to Business Directory.</p></main>}
  </>;
}
createRoot(document.getElementById('root')).render(<Preview />);
