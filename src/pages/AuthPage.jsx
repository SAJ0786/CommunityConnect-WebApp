import React, { useEffect, useRef, useState } from 'react';
import {
  browserLocalPersistence,
  setPersistence,
  signInWithPhoneNumber,
  RecaptchaVerifier,
  updateProfile as fbUpdateProfile,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from '../firebase/firebase';

function formatAU(raw) {
  let s = String(raw || '').replace(/[\s\-().]/g, '');
  if (s.startsWith('0'))                        s = '+61' + s.slice(1);
  if (s.startsWith('61') && !s.startsWith('+')) s = '+' + s;
  return s;
}
function isValidAU(n)    { return /^\+614\d{8}$/.test(n); }
function isValidEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim()); }

export default function AuthPage({ onAuthComplete, authError = '', onRegistrationStart }) {
  // Steps: main | phone | otp | register | link-confirm
  const [step,        setStep]        = useState('main');
  const [loading,     setLoading]     = useState('');
  const [error,       setError]       = useState('');
  const [phone,       setPhone]       = useState('');
  const [otp,         setOtp]         = useState('');
  const [name,        setName]        = useState('');
  const [email,       setEmail]       = useState('');
  const [confirm,     setConfirm]     = useState(null);
  const [pendingUser, setPendingUser] = useState(null);
  const [accepted,    setAccepted]    = useState(false);
  const [matchedProfile, setMatchedProfile] = useState(null); // existing profile found by email
  const rcRef    = useRef(null);
  const widgetRef = useRef(null);

  const displayError = error || authError;
  const isInstalledApp = window.matchMedia?.('(display-mode: standalone)')?.matches
    || window.navigator.standalone === true;

  useEffect(() => () => { clearRc(); }, []);

  const clearRc = () => {
    try { if (rcRef.current) rcRef.current.clear(); } catch {}
    rcRef.current = null; widgetRef.current = null;
  };

  const getVerifier = async () => {
    clearRc();
    rcRef.current = new RecaptchaVerifier(auth, 'recaptcha-container', {
      size: 'invisible', callback: () => {},
      'expired-callback': clearRc,
    });
    widgetRef.current = await rcRef.current.render();
    return rcRef.current;
  };

  // ── Send OTP ───────────────────────────────────────────────────────────────
  const sendOtp = async () => {
    if (!accepted) { setError('Please accept the Privacy Policy and Terms of Use.'); return; }
    const fmt = formatAU(phone);
    if (!isValidAU(fmt)) { setError('Please enter a valid Australian mobile (04XX XXX XXX).'); return; }
    setError(''); setLoading('otp');
    try {
      await setPersistence(auth, browserLocalPersistence);
      const res = await signInWithPhoneNumber(auth, fmt, await getVerifier());
      setConfirm(res);
      setStep('otp');
    } catch (e) {
      try { if (window.grecaptcha && widgetRef.current !== null) window.grecaptcha.reset(widgetRef.current); } catch {}
      setError(
        e.code === 'auth/too-many-requests'    ? 'Too many attempts. Please wait a few minutes.' :
        e.code === 'auth/invalid-phone-number' ? 'Invalid number. Use 04XX XXX XXX.' :
        e.code === 'auth/captcha-check-failed' ? 'Security verification failed. Refresh and try again.' :
        e.code === 'auth/invalid-app-credential' ? 'This app address could not be verified. Please open communityevents.siza.info and try again.' :
        `SMS error: ${e.code || e.message}. Please try again.`
      );
    }
    setLoading('');
  };

  // ── Verify OTP ─────────────────────────────────────────────────────────────
  const verifyOtp = async () => {
    if (otp.length !== 6 || !confirm) return;
    setError(''); setLoading('verify');
    try {
      if (onRegistrationStart) onRegistrationStart();
      const res  = await confirm.confirm(otp);
      const user = res.user;
      clearRc();

      const snap = await getDoc(doc(db, 'users', user.uid));

      if (snap.exists() && snap.data()?.fullName) {
        // Fully registered user — go straight in
        onAuthComplete(user, {});
      } else {
        // New phone number — show registration form
        setPendingUser(user);
        setName(snap.data()?.fullName || '');
        setEmail(snap.data()?.email || '');
        setStep('register');
        setLoading('');
      }
    } catch (e) {
      setLoading('');
      setError(
        e.code === 'auth/invalid-verification-code' ? 'Incorrect code. Please try again.' :
        e.code === 'auth/code-expired'              ? 'Code expired. Go back and resend.' :
        'Verification failed. Please try again.'
      );
    }
  };

  // ── Check email for existing account match ─────────────────────────────────
  // Called when user submits registration form — before creating a new account
  // check if this email already exists in Firestore under a different UID
  // (i.e. they previously signed in with Google or Microsoft).
  const checkEmailAndProceed = async () => {
    if (!name.trim())         { setError('Please enter your full name.'); return; }
    if (!isValidEmail(email)) { setError('Please enter a valid email address.'); return; }
    if (!pendingUser)         { setError('Session expired. Please start again.'); return; }
    setError(''); setLoading('check');

    try {
      // Search Firestore users collection for a matching email
      const lookupPhoneAccount = httpsCallable(functions, 'lookupPhoneAccountByEmail');
      const result = await lookupPhoneAccount({ email: email.trim().toLowerCase() });
      const existing = result.data?.profile || null;

      // Filter out the current user's own doc (in case they're re-registering)
      const matches = existing?.id ? [existing] : [];

      if (matches.length > 0) {
        // Found an existing account with this email — show link prompt
        setMatchedProfile(matches[0]);
        setLoading('');
        setStep('link-confirm');
      } else {
        // No match — proceed with normal new registration
        await completeRegistration();
      }
    } catch (e) {
      setLoading('');
      setError('Could not check account. Please try again.');
    }
  };

  // ── Link phone to existing Google/Microsoft account ─────────────────────────
  // This connects the verified phone credential to the existing Firebase Auth
  // account (the one the user previously used with Google/Microsoft).
  // After linking, their phone number works as a login method for that account.
  const linkToExistingAccount = async () => {
    if (!pendingUser || !matchedProfile) return;
    setLoading('link');
    try {
      const migratePhoneAccount = httpsCallable(functions, 'migratePhoneAccountByEmail');
      const result = await migratePhoneAccount({ email: matchedProfile.email });
      const migrated = result.data?.profile || matchedProfile;

      // Complete as new phone user but pass the existing profile data
      // so App.jsx builds the right profile (name, role, etc.)
      await fbUpdateProfile(pendingUser, { displayName: matchedProfile.fullName });
      onAuthComplete(pendingUser, migrated);
    } catch (e) {
      setLoading('');
      setError('Could not link accounts. Please try again.');
    }
  };

  // ── Complete normal registration ─────────────────────────────────────────────
  const completeRegistration = async () => {
    if (!pendingUser) { setError('Session expired. Please start again.'); return; }
    setLoading('register');
    try {
      await fbUpdateProfile(pendingUser, { displayName: name.trim() });
      onAuthComplete(pendingUser, { fullName: name.trim(), email: email.trim().toLowerCase() });
    } catch (e) {
      setLoading('');
      setError('Could not save details. Please try again.');
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="auth-page auth-theme">
    <div className="auth-card">
      <div id="recaptcha-container" />

      {/* ── MAIN ── */}
      {step === 'main' && (<>
        <div className="auth-main-heading">
          <img src="/icons/icon-192.png" alt="Community Events Australia" className="auth-login-logo" />
          <h2 style={{ margin: '0 0 4px' }}>Sign In</h2>
          <p className="small" style={{ margin: 0, color: 'var(--muted)' }}>Use your Australian mobile number to continue</p>
        </div>

        <label className="auth-consent">
          <input type="checkbox" checked={accepted} onChange={e => { setAccepted(e.target.checked); setError(''); }} />
          <span>
            I agree to the{' '}
            <a href="/privacy.html" target="_blank" rel="noreferrer">Privacy Policy</a>
            {' '}and{' '}
            <a href="/terms.html" target="_blank" rel="noreferrer">Terms of Use</a>.
          </span>
        </label>

        {displayError && <div className="error" style={{ marginBottom: 10 }}>{displayError}</div>}

        <button className="auth-primary"
          onClick={() => { if (!accepted) return setError('Please accept the Privacy Policy first.'); setError(''); setStep('phone'); }}>
          Continue with Mobile Number
        </button>

        <button className="btn-light auth-secondary"
          onClick={() => { if (!accepted) { setError('Please accept the Privacy Policy first.'); return; } onAuthComplete(null); }}>
          Browse as Guest
        </button>

        {!isInstalledApp && <section className="auth-store-section" aria-labelledby="store-download-heading">
          <div className="auth-store-divider"><span id="store-download-heading">Install the app from here</span></div>
          <div className="auth-store-badges">
            <a className="auth-store-original" href="https://apps.apple.com/au/app/community-events-australia/id6782770347"
              target="_blank" rel="noreferrer" aria-label="Download Community Events Australia from the Apple App Store">
              <img src="/store-apple-vector.svg" alt="Apple App Store" />
            </a>
            <a className="auth-store-original" href="https://play.google.com/store/apps/details?id=info.siza.communityevents.app"
              target="_blank" rel="noreferrer" aria-label="Download Community Events Australia from Google Play">
              <img src="/store-google-play.svg" alt="Google Play" />
            </a>
            <a className="auth-store-original" href="https://apps.microsoft.com/detail/9NDGJZHL86KJ"
              target="_blank" rel="noreferrer" aria-label="Download Community Events Australia from Microsoft Store">
              <img src="/store-microsoft.svg" alt="Microsoft Store" />
            </a>
          </div>
        </section>}
      </>)}

      {/* ── PHONE ── */}
      {step === 'phone' && (<>
        <button className="btn-muted" style={{ marginBottom: 12, fontSize: '0.8125rem' }}
          onClick={() => { clearRc(); setStep('main'); setError(''); setPhone(''); }}>← Back</button>
        <h3 style={{ margin: '0 0 8px' }}>📱 Mobile Sign In</h3>
        <p className="small" style={{ margin: '0 0 16px', color: 'var(--muted)', lineHeight: 1.5 }}>
          Enter your Australian mobile number to receive a verification code.
        </p>
        <label>Mobile number <span style={{ color: 'var(--danger,#dc2626)' }}>*</span></label>
        <input type="tel" placeholder="04XX XXX XXX" value={phone} autoFocus
          onChange={e => { setPhone(e.target.value); setError(''); }}
          onKeyDown={e => e.key === 'Enter' && sendOtp()} />
        <p style={{ fontSize: '0.6875rem', color: 'var(--muted)', margin: '2px 0 14px' }}>Australian mobiles only (+61).</p>
        {displayError && <div className="error" style={{ marginBottom: 10 }}>{displayError}</div>}
        <button onClick={sendOtp} disabled={!!loading || !isValidAU(formatAU(phone))} style={{ width: '100%' }}>
          {loading === 'otp' ? 'Sending…' : '📲 Send Verification Code'}
        </button>
      </>)}

      {/* ── OTP ── */}
      {step === 'otp' && (<>
        <h3 style={{ margin: '0 0 8px' }}>Enter Verification Code</h3>
        <p className="small" style={{ margin: '0 0 14px', color: 'var(--muted)', lineHeight: 1.5 }}>
          A 6-digit code was sent to <strong>{formatAU(phone)}</strong>.
        </p>
        <label>6-digit code</label>
        <input placeholder="847291" value={otp} inputMode="numeric" maxLength={6} autoFocus
          onChange={e => { setOtp(e.target.value.replace(/\D/g, '')); setError(''); }}
          onKeyDown={e => e.key === 'Enter' && verifyOtp()} />
        {displayError && <div className="error" style={{ marginBottom: 10 }}>{displayError}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button className="btn-muted" style={{ flex: 1 }}
            onClick={() => { setStep('phone'); setOtp(''); setError(''); }}>← Back</button>
          <button style={{ flex: 2 }} disabled={otp.length !== 6 || !!loading} onClick={verifyOtp}>
            {loading === 'verify' ? 'Verifying…' : '✅ Verify'}
          </button>
        </div>
        <button className="btn-light" style={{ width: '100%', marginTop: 8, fontSize: '0.75rem' }}
          disabled={!!loading} onClick={() => { setOtp(''); sendOtp(); }}>Resend code</button>
      </>)}

      {/* ── REGISTER (new users) ── */}
      {step === 'register' && (<>
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: '2.25rem', marginBottom: 8 }}>👋</div>
          <h3 style={{ margin: '0 0 4px' }}>Welcome! One last step.</h3>
          <p className="small" style={{ margin: 0, color: 'var(--muted)', lineHeight: 1.5 }}>
            Your mobile is verified. Please enter your name and email to complete registration.
          </p>
        </div>

        {/* Hint for existing users */}
        <div style={{
          background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10,
          padding: '8px 12px', marginBottom: 14, fontSize: '0.75rem', color: '#1e40af', lineHeight: 1.5,
        }}>
          💡 If you previously signed in with Google or Microsoft, enter that same email address below — we'll connect you to your existing account.
        </div>

        <label>Full name <span style={{ color: 'var(--danger,#dc2626)' }}>*</span></label>
        <input placeholder="e.g. Ali Hussain" value={name} autoFocus
          onChange={e => { setName(e.target.value); setError(''); }}
          onKeyDown={e => e.key === 'Enter' && email && checkEmailAndProceed()} />

        <label style={{ marginTop: 12 }}>
          Email address <span style={{ color: 'var(--danger,#dc2626)' }}>*</span>
        </label>
        <input type="email" placeholder="e.g. ali@example.com" value={email}
          onChange={e => { setEmail(e.target.value); setError(''); }}
          onKeyDown={e => e.key === 'Enter' && checkEmailAndProceed()} />
        <p style={{ fontSize: '0.6875rem', color: 'var(--muted)', margin: '2px 0 14px' }}>
          Used for event reminders. Not shared publicly.
        </p>

        {displayError && <div className="error" style={{ marginBottom: 10 }}>{displayError}</div>}

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-muted" style={{ flex: 1 }}
            onClick={() => {
              import('firebase/auth').then(({ signOut }) => signOut(auth).catch(() => {}));
              setPendingUser(null); setStep('main');
              setName(''); setEmail(''); setOtp(''); setPhone(''); setError('');
            }}>✕ Cancel</button>
          <button style={{ flex: 2 }}
            disabled={!name.trim() || !isValidEmail(email) || !!loading}
            onClick={checkEmailAndProceed}>
            {loading === 'check' || loading === 'register' ? 'Please wait…' : '✅ Continue'}
          </button>
        </div>
      </>)}

      {/* ── LINK CONFIRM — existing account found by email ── */}
      {step === 'link-confirm' && matchedProfile && (<>
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: '2.625rem', marginBottom: 8 }}>🔗</div>
          <h3 style={{ margin: '0 0 6px' }}>Existing Account Found</h3>
        </div>

        <div style={{
          background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 14,
          padding: '14px 16px', marginBottom: 16, lineHeight: 1.7,
        }}>
          <div style={{ fontSize: '0.8125rem', color: 'var(--text)' }}>
            We found an existing account with this email:
          </div>
          <div style={{ fontWeight: 800, fontSize: '0.9375rem', margin: '4px 0 2px', color: 'var(--teal)' }}>
            {matchedProfile.fullName}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
            {matchedProfile.email}
          </div>
        </div>

        <p style={{ fontSize: '0.8125rem', color: 'var(--text)', lineHeight: 1.6, margin: '0 0 16px' }}>
          We'll connect your mobile number to this account so you can sign in with your phone going forward. All your existing events, favourites and settings will be preserved.
        </p>

        {displayError && <div className="error" style={{ marginBottom: 10 }}>{displayError}</div>}

        <button style={{ width: '100%', marginBottom: 10 }}
          disabled={!!loading} onClick={linkToExistingAccount}>
          {loading === 'link' ? 'Connecting…' : '✅ Yes, Connect to My Existing Account'}
        </button>

        <button className="btn-light" style={{ width: '100%', fontSize: '0.8125rem' }}
          disabled={!!loading}
          onClick={() => {
            // User says this isn't their account — proceed as new user
            setMatchedProfile(null);
            setStep('register');
            setEmail('');
          }}>
          ✗ That's not my account — create a new one
        </button>
      </>)}
    </div>
    {step === 'main' && (
      <div className="auth-security-note">
        <span className="auth-security-icon" aria-hidden="true">🔒</span>
        <span>Phone verification keeps<br />community accounts secure.</span>
      </div>
    )}
    </div>
  );
}
