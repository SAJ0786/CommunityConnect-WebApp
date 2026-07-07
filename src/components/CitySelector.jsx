import React from 'react';
import { ChevronDown, MapPin } from 'lucide-react';
import { CITY_OPTIONS } from '../utils/cities';

export default function CitySelector({ value, onChange, compact = false }) {
  return (
    <label style={{ display:'flex', alignItems:'center', gap:8, minWidth:0,
      padding:'0 11px', height:compact ? 38 : 40,
      boxSizing:'border-box', border:'1.5px solid #0f766e', borderRadius:8,
      background:'#fff', color:'#0f766e', boxShadow:'0 2px 7px rgba(15,118,110,0.12)' }}>
      <MapPin size={20} strokeWidth={2.6} fill="#0f766e" color="#0f766e"
        aria-hidden="true" style={{ flexShrink:0 }} />
      <select value={value} onChange={event => onChange(event.target.value)}
        aria-label="Events location"
        style={{ width:'100%', minWidth:0, border:0, outline:0, background:'transparent',
          color:'#0f4f4a', fontSize:compact ? '0.875rem' : '0.9375rem', fontWeight:800,
          cursor:'pointer', padding:0, appearance:'none', WebkitAppearance:'none' }}>
        {CITY_OPTIONS.map(city => <option key={city.value} value={city.value}>{city.label}</option>)}
      </select>
      <ChevronDown size={18} strokeWidth={2.5} aria-hidden="true" style={{ flexShrink:0 }} />
    </label>
  );
}
