import React, { useRef, useState } from 'react';
import { LEGAL_URLS } from '../config/legal.mjs';
import { validMemberName, validMemberEmail } from '../utils/memberProfile.mjs';

// No Firebase dependency: both authenticated modules pass through this gate.
export default function CompleteMemberProfile({ user, profile, state, onComplete, onRetry, onSignOut }) {
  const [name, setName] = useState(profile?.fullName || '');
  const [email, setEmail] = useState(profile?.email || '');
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const valid = validMemberName(name) && validMemberEmail(email) && accepted;
  const act = async action => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true); setError('');
    try { await action(); }
    catch (err) { setError(err.message || 'Could not save your details. Please try again.'); }
    finally { pending.current = false; setBusy(false); }
  };
  return <main className="auth-page auth-theme">
    <section className="auth-card" aria-labelledby="member-profile-title">
      <h1 id="member-profile-title">{state === 'complete-profile' ? 'Complete your profile' : 'Check your account'}</h1>
      {state === 'loading' && <p role="status">Checking your member profile…</p>}
      {state === 'retry' && <><p>We couldn’t verify your profile. Please reconnect and try again.</p><button disabled={busy} onClick={() => act(onRetry)}>Try again</button></>}
      {state === 'blocked' && <p role="alert">This account is inactive. Please contact support.</p>}
      {state === 'verify-phone' && <p>Sign out and sign in with your Australian mobile number to verify it.</p>}
      {state === 'complete-profile' && <form onSubmit={event => {
        event.preventDefault();
        if (valid) act(() => onComplete({ fullName: name, email, privacyAccepted: accepted, termsAccepted: accepted }));
      }}>
        <p>Your mobile is verified. Name and email are required for both Events and Business Directory.</p>
        <label htmlFor="member-phone">Verified mobile</label>
        <input id="member-phone" value={user.phoneNumber || ''} readOnly type="tel" />
        <label htmlFor="member-name">Full name</label>
        <input id="member-name" autoComplete="name" required minLength={2} maxLength={120} value={name} disabled={busy} onChange={event => setName(event.target.value)} />
        <label htmlFor="member-email">Email address</label>
        <input id="member-email" autoComplete="email" required type="email" maxLength={254} value={email} disabled={busy} onChange={event => setEmail(event.target.value)} />
        <p className="small">Used as your contact email. Entering an email does not verify ownership or link another account.</p>
        <label className="auth-consent"><input type="checkbox" checked={accepted} disabled={busy} onChange={event => setAccepted(event.target.checked)} />
          <span>I agree to the <a href={LEGAL_URLS.privacy} target="_blank" rel="noreferrer">Privacy Policy</a> and <a href={LEGAL_URLS.terms} target="_blank" rel="noreferrer">Terms of Use</a>.</span>
        </label>
        <button className="auth-primary" type="submit" disabled={busy || !valid}>{busy ? 'Saving…' : 'Save and continue'}</button>
      </form>}
      {error && <p role="alert" className="error">{error}</p>}
      <button className="btn-light auth-secondary" disabled={busy || state === 'loading'} onClick={() => act(onSignOut)}>Sign out</button>
    </section>
  </main>;
}
