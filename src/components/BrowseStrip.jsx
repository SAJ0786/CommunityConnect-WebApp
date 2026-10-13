import React from 'react';
import '../styles/browse.css';

export default function BrowseStrip({ label, items, value, onChange, categories = false, tiles = false }) {
  return <div className="browse-strip-frame"><div className={`browse-strip${categories ? ' browse-categories' : ''}${tiles ? ' browse-quick-tiles' : ''}`} role="group" aria-label={label}>
    {items.map(item => <button type="button" key={item.value} aria-label={item.label} aria-pressed={value === item.value}
      disabled={item.disabled} title={item.hint} onClick={() => onChange(item.value)}>
      {(item.Icon || item.icon) && <span className={`browse-strip-icon browse-tone-${item.tone || 'blue'}`} aria-hidden="true">{item.Icon ? <item.Icon size={20} strokeWidth={1.7} /> : item.icon}</span>}
      <span className="browse-strip-label">{item.label.split(/\s+/).map((word, index) => <React.Fragment key={index}>{index > 0 ? ' ' : ''}<span className="browse-strip-word">{word}</span></React.Fragment>)}</span>
    </button>)}
  </div></div>;
}
