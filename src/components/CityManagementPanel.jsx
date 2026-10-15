import React, { useMemo, useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase/firebase';
import { CITY_MANAGEMENT_ENABLED } from '../config/releaseGates.mjs';
import { createCityManagement, validCityPreview } from '../utils/cityManagement.mjs';
import { acceptCityCatalogue } from '../services/cityCatalogue';

export default function CityManagementPanel({ profile }) {
  const allowed = CITY_MANAGEMENT_ENABLED && profile?.role === 'superAdmin';
  const api = useMemo(() => createCityManagement((name, data) => httpsCallable(functions, name)(data), { enabled: allowed }), [allowed]);
  const [input, setInput] = useState(''), [code, setCode] = useState('');
  const [suggestions, setSuggestions] = useState([]), [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const lock = useRef(false);
  if (!allowed) return null;
  const run = async action => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setMessage('');
    try { await action(); } catch (error) { setMessage(error.message || 'Request could not be confirmed. Refresh before retrying.'); }
    finally { lock.current = false; setBusy(false); }
  };
  return <section className="card"><h2>Add a city</h2><p>Search for an Australian city or town, then review its coordinates and timezone.</p>
    <fieldset disabled={busy}><label>City name<input maxLength={100} value={input} onChange={e => { setInput(e.target.value); setPreview(null); setSuggestions([]); }}/></label>
      <button type="button" disabled={input.trim().length < 3} onClick={() => run(async () => { setPreview(null); const result = await api.search(input); setSuggestions(result.suggestions || []); if (!result.suggestions?.length) setMessage('No matching cities found.'); })}>Search cities</button>
      <ul>{suggestions.map(row => <li key={row.placeId}><button type="button" className="btn-light" onClick={() => run(async () => { setPreview(null); setCode(''); setPreview(await api.preview(row.placeId)); })}>{row.label}</button></li>)}</ul>
      {!!suggestions.length && <p className="small">Powered by Google Maps</p>}
      {preview && <div><h3>{preview.city?.label}</h3><dl><dt>Latitude</dt><dd>{preview.city?.latitude ?? 'Missing'}</dd><dt>Longitude</dt><dd>{preview.city?.longitude ?? 'Missing'}</dd><dt>Timezone</dt><dd>{preview.city?.timeZone || 'Missing'}</dd></dl>
        {!validCityPreview(preview) && <p role="alert">Verified coordinates and timezone are required. Search again.</p>}
        <label>City short code<input maxLength={6} value={code} onChange={e => setCode(e.target.value.toUpperCase())}/></label>
        <p>This makes the city available in compatible app versions. City centre coordinates are not an event venue.</p>
        <button type="button" disabled={!validCityPreview(preview) || !/^[A-Z0-9]{2,6}$/.test(code)} onClick={() => run(async () => {
          const result = await api.add(preview, code);
          if (!acceptCityCatalogue(result.catalogue)) throw new Error('The server response could not be validated. Refresh before trying again.');
          setPreview(null); setSuggestions([]); setInput(''); setCode(''); setMessage('City added with verified coordinates and timezone.');
        })}>Confirm and add city</button></div>}
    </fieldset>{busy && <p role="status">Working…</p>}{message && <p role="status">{message}</p>}
  </section>;
}
