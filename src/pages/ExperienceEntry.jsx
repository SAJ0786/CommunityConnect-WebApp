import React, { useState } from 'react';
import { CalendarDays, Store } from 'lucide-react';
import { EXPERIENCES, getExperience } from '../config/experiences.mjs';
import AuthPage from './AuthPage';
import '../styles/entry.css';

export default function ExperienceEntry({ selected, onSelect, ...authProps }) {
  const [stage, setStage] = useState('choose');
  const experience = getExperience(selected);
  if (stage === 'login') return <AuthPage {...authProps} experienceTitle={experience.title} onChooseExperience={() => setStage('choose')} />;

  return <main className="experience-entry" aria-labelledby="entry-title">
    <div className="entry-brand">
      <img src="/icons/icon-192.png" alt="" width="76" height="76" />
      <div><p className="entry-brand-name">Community Connect Australia</p><p className="entry-eyebrow">One app · Two experiences</p></div>
    </div>
    <div className="entry-intro">
      <p className="entry-eyebrow">Where would you like to start?</p>
      <h1 id="entry-title">Everything community,<br />all in one place.</h1>
      <p>Choose an experience now. You can switch between both at any time after entering the app.</p>
    </div>
    <fieldset className="entry-options">
      <legend className="entry-legend">Choose your experience</legend>
      {EXPERIENCES.map(item => {
        const Icon = item.icon === 'calendar' ? CalendarDays : Store;
        return <label key={item.id} className={`entry-option entry-option--${item.id}`}>
          <input type="radio" name="experience" value={item.id} checked={experience.id === item.id} onChange={() => onSelect(item.id)} />
          <span className="entry-option-icon" aria-hidden="true"><Icon size={32} /></span>
          <span className="entry-option-copy"><strong>{item.title}</strong><span>{item.description}</span></span>
        </label>;
      })}
    </fieldset>
    <button className="entry-continue" onClick={() => setStage('login')}>Continue to {experience.title}</button>
    <p className="entry-footnote">Next, sign in with your mobile number or browse as a guest.</p>
  </main>;
}
