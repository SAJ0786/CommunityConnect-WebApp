import React, { useState, useRef } from 'react';
import { useDialogFocus } from '../utils/useDialogFocus';
import CitySelector from './CitySelector';
import { DEFAULT_CITY } from '../utils/cities';

export default function DefaultCityPrompt({ onSave }) {
  const [city, setCity] = useState(DEFAULT_CITY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const dialogRef = useRef(null);
  useDialogFocus(dialogRef, true);

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await onSave(city);
    } catch (err) {
      setError(err.message || 'Could not save your city. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="default-city-title"
      style={{ position:'fixed', inset:0, zIndex:12000, display:'grid', placeItems:'center',
        padding:20, background:'color-mix(in srgb, var(--cc-overlay-base) 72%, transparent)' }}>
      <div style={{ width:'100%', maxWidth:420, maxHeight:'calc(100dvh - 40px)', overflowY:'auto', padding:24, borderRadius:'var(--cc-radius-card)',
        background:'var(--card,var(--cc-surface))', boxShadow:'0 24px 70px color-mix(in srgb, var(--cc-shadow-base) 30%, transparent)' }}>
        <h2 id="default-city-title" style={{ margin:'0 0 8px' }}>Choose your default city</h2>
        <p style={{ margin:'0 0 18px', color:'var(--muted)', fontSize:'0.875rem', lineHeight:1.55 }}>
          We will show events from this city first. You can view another city from Home or change your default later in Profile.
        </p>
        <CitySelector value={city} onChange={setCity} />
        {error && <div className="error" style={{ marginTop:12 }}>{error}</div>}
        <button onClick={save} disabled={saving} style={{ width:'100%', marginTop:16, minHeight:48 }}>
          {saving ? 'Saving...' : 'Continue'}
        </button>
      </div>
    </div>
  );
}
