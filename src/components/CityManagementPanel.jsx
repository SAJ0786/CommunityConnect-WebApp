import React, { useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase/firebase';
import { CITY_MANAGEMENT_ENABLED } from '../config/releaseGates.mjs';
import { createCityManagement, validCityPreview } from '../utils/cityManagement.mjs';
import { acceptCityCatalogue } from '../services/cityCatalogue';
import { getCityDefinitions, cityCatalogueRevision, subscribeCityCatalogue } from '../utils/cities';
import CitySelector from './CitySelector';
import { suggestCityCode } from '../utils/airportCodes.mjs';

const BUILT_IN = new Set(['adelaide', 'brisbane', 'canberra', 'hobart', 'melbourne', 'perth', 'rest-of-australia', 'sydney']);

export default function CityManagementPanel({ profile }) {
  const allowed = CITY_MANAGEMENT_ENABLED && profile?.role === 'superAdmin';
  const api = useMemo(() => createCityManagement((name, data) => httpsCallable(functions, name)(data), { enabled: allowed }), [allowed]);
  const [input, setInput] = useState(''), [code, setCode] = useState('');
  const [suggestions, setSuggestions] = useState([]), [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [suggested, setSuggested] = useState(false), [managedId, setManagedId] = useState(''), [draft, setDraft] = useState(null);
  const revision = useSyncExternalStore(subscribeCityCatalogue, cityCatalogueRevision, cityCatalogueRevision);
  const cities = useMemo(() => getCityDefinitions(), [revision]);
  const manageOptions = useMemo(() => [{ value: '', label: 'Select a city' }, ...cities.map(city => ({ value: city.id, label: city.label + (city.enabled ? '' : ' (deleted)') }))], [cities]);
  const managed = cities.find(city => city.id === managedId);
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
    <h3>Manage existing cities</h3>
    <CitySelector label="City to manage" value={managed?.id || ''} options={manageOptions} showPin={false}
      onChange={id => { setManagedId(id); setDraft(null); setMessage(''); }}/>
    {managed && <fieldset disabled={busy}>
      <p className="small">{managed.latitude === null ? 'No coordinates' : `${managed.latitude.toFixed(4)}, ${managed.longitude.toFixed(4)}`} {managed.timeZone}{!managed.enabled && ' (deleted: hidden from selectors)'}</p>
      <label>Short code<input maxLength={6} value={draft ?? managed.code} onChange={e => setDraft(e.target.value.toUpperCase())}/></label>
      <button type="button" disabled={(draft ?? managed.code) === managed.code || !/^[A-Z0-9]{2,6}$/.test(draft ?? managed.code)} onClick={() => run(async () => {
        const result = await api.update(managed.id, { code: draft });
        if (!acceptCityCatalogue(result.catalogue)) throw new Error('The server response could not be validated. Refresh before trying again.');
        setDraft(null); setMessage(`${managed.label} code saved.`);
      })}>Save short code</button>
      {!BUILT_IN.has(managed.id) && <button type="button" className="btn-light" onClick={() => run(async () => {
        if (managed.enabled && !window.confirm(`Delete ${managed.label}? It disappears from city selectors; members keep their saved city and you can restore it here.`)) return;
        const result = await api.update(managed.id, { enabled: !managed.enabled });
        if (!acceptCityCatalogue(result.catalogue)) throw new Error('The server response could not be validated. Refresh before trying again.');
        setMessage(managed.enabled ? `${managed.label} deleted from city selectors.` : `${managed.label} restored.`);
      })}>{managed.enabled ? 'Delete city' : 'Restore city'}</button>}
      {BUILT_IN.has(managed.id) && <p className="small">Built-in cities cannot be deleted, but their short code can be changed.</p>}
    </fieldset>}
        {busy && <p role="status">Working…</p>}{message && <p role="status">{message}</p>}
  </section>;
}
