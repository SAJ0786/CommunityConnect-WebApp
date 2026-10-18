import React from 'react';

export default function ExperienceSwitch({ directory, onEvents, onBusinesses, options, label = 'Choose community experience' }) {
  const tabs = options || [
    { id: 'events', label: 'Events', icon: '📅', selected: !directory, onClick: onEvents },
    { id: 'businesses', label: 'Business Directory', icon: '🏪', selected: directory, onClick: onBusinesses },
  ];
  return <nav className="experience-switch" aria-label={label} role={options ? 'tablist' : undefined}>
    {tabs.map((item, index) => <button type="button" key={item.id} id={options ? item.id : undefined}
      role={options ? 'tab' : undefined} aria-pressed={options ? undefined : item.selected} aria-selected={options ? item.selected : undefined}
      aria-controls={item.controls} tabIndex={options ? item.selected ? 0 : -1 : undefined} onClick={item.onClick}
      onKeyDown={event => { if (!options || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return; event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowLeft' ? -1 : 1) + tabs.length) % tabs.length;
        tabs[next].onClick(); document.getElementById(tabs[next].id)?.focus(); }}>
      {item.icon && <span aria-hidden="true">{item.icon}</span>}{item.label}
    </button>)}
  </nav>;
}
