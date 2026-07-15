import React, { useEffect, useRef, useState } from 'react';
import { hasGoogleMapsKey, loadGoogleMapsScript as loadSharedGoogleMapsScript, waitForGooglePlaces } from '../services/googleMapsLoader';

const PLACES_KEY = import.meta.env.VITE_GOOGLE_PLACES_KEY || '';

// ── Reliable singleton Maps loader ───────────────────────────────────────────
// Uses a simple polling approach — most reliable cross-browser method
function loadGoogleMapsScript() {
  if (!PLACES_KEY) return;
  if (document.getElementById('google-maps-script')) return;
  const s = document.createElement('script');
  s.id  = 'google-maps-script';
  s.src = `https://maps.googleapis.com/maps/api/js?key=${PLACES_KEY}&libraries=places`;
  // No callback, no async/defer — synchronous load for reliability
  document.head.appendChild(s);
}

function waitForGoogle(cb, attempts = 0) {
  if (window.google?.maps?.places?.Autocomplete) { cb(); return; }
  if (attempts > 100) { console.warn('Google Maps failed to load after 10s'); return; }
  setTimeout(() => waitForGoogle(cb, attempts + 1), 100);
}

export default function AddressAutocomplete({ value = {}, onChange, required, invalid = false }) {
  const inputRef = useRef(null);
  const acRef    = useRef(null);
  const [ready,  setReady]  = useState(false);
  const [text,   setText]   = useState(value?.fullAddress || '');
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (!hasGoogleMapsKey()) return;
    loadSharedGoogleMapsScript();
    waitForGooglePlaces(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!ready || !inputRef.current || acRef.current) return;
    try {
      const ac = new window.google.maps.places.Autocomplete(inputRef.current, {
        componentRestrictions: { country: 'au' },
        fields: ['address_components', 'formatted_address', 'geometry'],
        types:  ['address']
      });

      ac.addListener('place_changed', () => {
        const place = ac.getPlace();
        if (!place?.address_components) return;

        let streetNum = '', route = '', suburb = '', state = 'NSW', postcode = '';
        place.address_components.forEach(c => {
          if (c.types.includes('street_number'))              streetNum = c.long_name;
          if (c.types.includes('route'))                       route     = c.long_name;
          if (c.types.includes('locality'))                    suburb    = c.long_name;
          if (c.types.includes('administrative_area_level_1')) state     = c.short_name;
          if (c.types.includes('postal_code'))                 postcode  = c.long_name;
        });

        const street      = [streetNum, route].filter(Boolean).join(' ');
        const fullAddress = place.formatted_address || '';
        const lat         = place.geometry?.location?.lat() ?? null;
        const lng         = place.geometry?.location?.lng() ?? null;

        setText(fullAddress);
        setStatus(`${suburb} ${state} ${postcode}${lat ? ' · GPS ✓' : ''}`);
        onChange({ fullAddress, street, suburb, state, postcode, latitude: lat, longitude: lng });
      });

      acRef.current = ac;
    } catch (e) {
      console.error('Autocomplete error:', e);
    }
  }, [ready]);

  // No API key → manual fields
  if (!hasGoogleMapsKey()) {
    return <ManualAddress value={value} onChange={onChange} required={required} />;
  }

  return (
    <div>
      <input
        ref={inputRef}
        required={required}
        aria-invalid={invalid}
        value={text}
        onChange={e => {
          const fullAddress = e.target.value;
          setText(fullAddress);
          setStatus('');
          onChange({ ...value, fullAddress });
        }}
        placeholder={ready ? 'Start typing address…' : 'Loading address search…'}
        disabled={!ready}
        style={{ ...inputStyle, borderColor: invalid ? '#b42318' : '#0f766e' }}
      />
      {status && (
        <p style={{ fontSize: '0.75rem', color: 'var(--teal)', margin: '2px 0 8px 2px' }}>
          📍 {status}
        </p>
      )}
      {!status && (
        <p style={{ fontSize: '0.75rem', color: 'var(--muted)', margin: '2px 0 12px' }}>
          Select an address from the dropdown. If it doesn't appear, type the full address.
        </p>
      )}
    </div>
  );
}

const inputStyle = {
  width: '100%', padding: 13, fontSize: '0.9375rem',
  border: '1px solid #0f766e', borderRadius: 12,
  background: 'white', marginTop: 6, marginBottom: 4,
  boxSizing: 'border-box', color: 'var(--text)'
};

function ManualAddress({ value = {}, onChange, required }) {
  const upd = (k, v) => {
    const n = { ...value, [k]: v };
    n.fullAddress = `${n.street||''}, ${n.suburb||''} ${n.state||''} ${n.postcode||''}`.trim();
    onChange(n);
  };
  return (
    <>
      <input required={required} placeholder="Street number and name"
        value={value.street || ''} onChange={e => upd('street', e.target.value)}
        style={{ ...inputStyle, marginBottom: 12 }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={{ fontWeight: 800, fontSize: '0.875rem' }}>Suburb *</label>
          <input required value={value.suburb || ''} onChange={e => upd('suburb', e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={{ fontWeight: 800, fontSize: '0.875rem' }}>State *</label>
          <input required value={value.state || 'NSW'} onChange={e => upd('state', e.target.value)} style={inputStyle} />
        </div>
      </div>
      <label style={{ fontWeight: 800, fontSize: '0.875rem' }}>Postcode *</label>
      <input required value={value.postcode || ''} onChange={e => upd('postcode', e.target.value)} style={inputStyle} />
    </>
  );
}
