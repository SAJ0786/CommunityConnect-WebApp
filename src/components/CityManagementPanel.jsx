import React, { useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase/firebase';
import { CITY_MANAGEMENT_ENABLED } from '../config/releaseGates.mjs';
import { createCityManagement, validCityPreview } from '../utils/cityManagement.mjs';
import { acceptCityCatalogue } from '../services/cityCatalogue';
import { getCityDefinitions, cityCatalogueRevision, subscribeCityCatalogue } from '../utils/cities';
import { suggestCityCode } from '../utils/airportCodes.mjs';

const BUILT_IN = new Set(['adelaide', 'brisbane', 'canberra', 'hobart', 'melbourne', 'perth', 'rest-of-australia', 'sydney']);

export default function CityManagementPanel({ profile }) {
  const allowed = CITY_MANAGEMENT_ENABLED && profile?.role === 'superAdmin';
  const api = useMemo(() => createCityManagement((name, data) => httpsCallable(functions, name)(data), { enabled: allowed }), [allowed]);
  const [input, setInput] = useState(''), [code, setCode] = useState('');
  const [suggestions, setSuggestions] = useState([]), [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [suggested, setSuggested] = useState(false), [edits, setEdits] = useState({});
  const revision = useSyncExternalStore(subscribeCityCatalogue, cityCatalogueRevision, cityCatalogueRevision);
  const cities = useMemo(() => getCityDefinitions(), [revision]);
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
      <ul>{suggestions.map(row => <li key={row.placeId}><button type="button" className="btn-light" onClick={() => run(async () => { setPreview(null); setCode(''); setSuggested(false); const next = await api.preview(row.placeId); const guess = suggestCityCode(next.city); setCode(guess); setSuggested(!!guess); setPreview(next); })}>{row.label}</button></li>)}</ul>
      {!!suggestions.length && <p className="small">Powered by Google Maps</p>}
      {preview && <div><h3>{preview.city?.label}</h3><dl><dt>Latitude</dt><dd>{preview.city?.latitude ?? 'Missing'}</dd><dt>Longitude</dt><dd>{preview.city?.longitude ?? 'Missing'}</dd><dt>Timezone</dt><dd>{preview.city?.timeZone || 'Missing'}</dd></dl>
        {!validCityPreview(preview) && <p role="alert">Verified coordinates and timezone are required. Search again.</p>}
        <label>City short code<input maxLength={6} value={code} onChange={e => { setCode(e.target.value.toUpperCase()); setSuggested(false); }}/></label>
        <p className="small">{suggested ? 'Pre-filled with the local airport code. You can change it.' : code ? '' : 'No airport code found for this city. Enter a short code of 2-6 letters or digits.'}</p>
        <p>This makes the city available in compatible app versions. City centre coordinates are not an event venue.</p>
        <button type="button" disabled={!validCityPreview(preview) || !/^[A-Z0-9]{2,6}$/.test(code)} onClick={() => run(async () => {
          const result = await api.add(preview, code);
          if (!acceptCityCatalogue(result.catalogue)) throw new Error('The server response could not be validated. Refresh before trying again.');
          setPreview(null); setSuggestions([]); setInput(''); setCode(''); setMessage('City added with verified coordinates and timezone.');
        })}>Confirm and add city</button></div>}
    </fieldset>
    <h3>Cities in the catalogue</h3>
    <ul>{cities.map(city => { const draft = edits[city.id] ?? city.code; return <li key={city.id}>
      <strong>{city.label}</strong>{!city.enabled && ' (hidden)'}
      <div className="small">{city.latitude === null ? 'No coordinates' : `${city.latitude.toFixed(4)}, ${city.longitude.toFixed(4)}`} {city.timeZone}</div>
      <fieldset disabled={busy}><label>Short code<input aria-label={`Short code for ${city.label}`} maxLength={6} value={draft} onChange={e => setEdits({ ...edits, [city.id]: e.target.value.toUpperCase() })}/></label>
        <button type="button" disabled={draft === city.code || !/^[A-Z0-9]{2,6}$/.test(draft)} onClick={() => run(async () => {
          const result = await api.update(city.id, { code: draft });
          if (!acceptCityCatalogue(result.catalogue)) throw new Error('The server response could not be validated. Refresh before trying again.');
          setEdits(({ [city.id]: _, ...rest }) => rest); setMessage(`${city.label} code saved.`);
        })}>Save code</button>
        {!BUILT_IN.has(city.id) && <button type="button" className="btn-light" onClick={() => run(async () => {
          const result = await api.update(city.id, { enabled: !city.enabled });
          if (!acceptCityCatalogue(result.catalogue)) throw new Error('The server response could not be validated. Refresh before trying again.');
          setMessage(city.enabled ? `${city.label} hidden from city selectors. Members keep their saved city.` : `${city.label} is visible again.`);
        })}>{city.enabled ? 'Remove from selectors' : 'Restore'}</button>}
      </fieldset></li>; })}</ul>    {busy && <p role="status">Working…</p>}{message && <p role="status">{message}</p>}
  </section>;
}
