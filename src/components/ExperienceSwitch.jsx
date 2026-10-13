import React from 'react';

export default function ExperienceSwitch({ directory, onEvents, onBusinesses }) {
  return (
    <nav className="experience-switch" aria-label="Choose community experience">
      <button type="button" aria-pressed={!directory} onClick={onEvents}>
        <span aria-hidden="true">📅</span> Events
      </button>
      <button type="button" aria-pressed={directory} onClick={onBusinesses}>
        <span aria-hidden="true">🏪</span> Business Directory
      </button>
    </nav>
  );
}
