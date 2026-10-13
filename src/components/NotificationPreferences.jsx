import React, { useState } from 'react';
import { Bell } from 'lucide-react';
import { NOTIFICATION_PREFERENCES, readNotificationPreferences, notificationPreferencePayload } from '../utils/profilePreferences.mjs';
import { updateProfile } from '../services/userService';
import { saveExperience } from '../config/experiences.mjs';
export default function NotificationPreferences({ user, profile, setProfile }) {
  const [values, setValues] = useState(() => readNotificationPreferences(profile));
  const [module, setModule] = useState(profile?.defaultModule === 'directory' ? 'directory' : 'events');
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const save = async () => {
    setBusy(true); setError(''); setMessage('');
    try {
      const payload = notificationPreferencePayload(values, module);
      await updateProfile(user.uid, payload);
      setProfile(previous => ({ ...previous, ...payload }));
      saveExperience(window.sessionStorage, module === 'directory' ? 'businesses' : 'events');
      setMessage('Notification settings saved.');
    } catch (failure) { setError(failure.message || 'Could not save notification settings.'); }
    finally { setBusy(false); }
  };
  return <section className="cc-preferences"><h3><Bell size={21} aria-hidden="true"/>Notifications</h3>
    <p>Choose how you receive optional updates. Business enquiries, replies and administrative decisions remain enabled as service notifications.</p>
    {NOTIFICATION_PREFERENCES.map(([key,label]) => <label className="cc-preference-row" key={key}><span>{label}</span><input type="checkbox" role="switch" checked={values[key]} disabled={busy} onChange={event => setValues(previous => ({ ...previous, [key]: event.target.checked }))}/></label>)}
    <p className="small">Push alerts also need permission on this browser. Prayer-time reminders are scheduled in the native app when it reads your saved preferences; the web app does not schedule prayer-time alarms.</p>
    <fieldset className="cc-home-module"><legend>Default home module</legend>{[['events','Events'],['directory','Business Directory']].map(([value,label]) => <label key={value}><input type="radio" name="default-home-module" value={value} checked={module === value} onChange={() => setModule(value)} disabled={busy}/>{label}</label>)}</fieldset>
    <button onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save Notification Settings'}</button>
    {message && <p role="status">{message}</p>}{error && <p role="alert" className="error">{error}</p>}
  </section>;
}
