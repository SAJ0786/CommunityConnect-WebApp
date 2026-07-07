import React, { useState } from 'react';
import CitySelector from './CitySelector';
import { DEFAULT_CITY } from '../utils/cities';

export default function DefaultCityPrompt({ onSave }) {
  const [city, setCity] = useState(DEFAULT_CITY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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
    <div role="dialog" aria-modal="true" aria-labelledby="default-city-title"
      style={{ position:'fixed', inset:0, zIndex:12000, display:'grid', placeItems:'center',
        padding:20, background:'rgba(15,23,42,.72)' }}>
      <div style={{ width:'100%', maxWidth:420, padding:24, borderRadius:8,
        background:'var(--card,#fff)', boxShadow:'0 24px 70px rgba(0,0,0,.3)' }}>
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
