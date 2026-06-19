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

const isPwa = () => window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator.standalone === true;

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
        e.code === 'auth/captcha-check-failed' ? 'Captcha failed. Refresh and try again.' :
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
      const res  = await confirm.confirm(otp);
      const user = res.user;
      clearRc();

      if (onRegistrationStart) onRegistrationStart();

      await new Promise(r => setTimeout(r, 500));
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
    <div className="auth-card">
      <div id="recaptcha-container" />

      {/* ── MAIN ── */}
      {step === 'main' && (<>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: '0 0 4px' }}>Sign In</h2>
          <p className="small" style={{ margin: 0, color: 'var(--muted)' }}>Community Events Australia</p>
        </div>

        {/* Migration notice for existing Google/Microsoft users */}
        <div style={{
          background: '#fefce8', border: '1px solid #fde68a', borderRadius: 12,
          padding: '10px 14px', marginBottom: 16, fontSize: 12.5, lineHeight: 1.6, color: '#92400e',
        }}>
          <strong>📢 Login update:</strong> Google and Microsoft sign-in have been removed.
          Please use your mobile number to sign in. If you previously used Google or Microsoft,
          enter the same email address when prompted — we'll connect you to your existing account automatically.
        </div>

        <button
          style={{ width: '100%', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          onClick={() => { if (!accepted) return setError('Please accept the Privacy Policy first.'); setError(''); setStep('phone'); }}>
          📱 Continue with Mobile Number
        </button>

        {displayError && <div className="error" style={{ marginBottom: 10 }}>{displayError}</div>}

        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
          <input type="checkbox" checked={accepted} onChange={e => { setAccepted(e.target.checked); setError(''); }} style={{ width: 'auto', marginTop: 3 }} />
          <span style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
            I agree to the{' '}
            <a href="/privacy.html" target="_blank" rel="noreferrer" style={{ color: 'var(--red)' }}>Privacy Policy</a>
            {' '}and{' '}
            <a href="/terms.html" target="_blank" rel="noreferrer" style={{ color: 'var(--red)' }}>Terms of Use</a>
          </span>
        </label>

        <button className="btn-light" style={{ width: '100%', marginTop: 14 }}
          onClick={() => { if (!accepted) { setError('Please accept the Privacy Policy first.'); return; } onAuthComplete(null); }}>
          👤 Browse as Guest
        </button>

        {!isPwa() && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0 0' }}>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              <span className="small" style={{ color: 'var(--muted)', fontSize: 11 }}>install</span>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            </div>
            <button className="btn-light"
              style={{ width: '100%', marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}
              onClick={() => document.getElementById('install-modal').style.display = 'flex'}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12" y2="18"/></svg>
              📲 Install This App
            </button>

            <div id="install-modal" style={{
              display: 'none', position: 'fixed', inset: 0, zIndex: 99999,
              background: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center', padding: 16,
            }} onClick={e => { if (e.target.id === 'install-modal') e.target.style.display = 'none'; }}>
              <div style={{ background: 'var(--card,white)', borderRadius: 20, padding: 24, width: '100%', maxWidth: 400, border: '1px solid var(--border)', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <h2 style={{ margin: 0, fontSize: 19, color: 'var(--text)' }}>📲 Install This App</h2>
                  <button onClick={() => document.getElementById('install-modal').style.display = 'none'}
                    style={{ background: 'transparent', border: 'none', fontSize: 22, cursor: 'pointer', color: 'var(--muted)', lineHeight: 1 }}>✕</button>
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                  {[['iphone', '🍎 iPhone / iPad'], ['android', '🤖 Android']].map(([key, label]) => (
                    <button key={key} data-tab={key}
                      onClick={() => {
                        document.querySelectorAll('[data-platform]').forEach(el => { el.style.display = el.dataset.platform === key ? 'block' : 'none'; });
                        document.querySelectorAll('[data-tab]').forEach(el => {
                          el.style.background  = el.dataset.tab === key ? 'var(--red)' : 'var(--bg,white)';
                          el.style.color       = el.dataset.tab === key ? 'white' : 'var(--text)';
                          el.style.borderColor = el.dataset.tab === key ? 'var(--red)' : 'var(--border)';
                        });
                      }}
                      style={{ flex: 1, padding: '8px', borderRadius: 10, fontWeight: 600, fontSize: 13, cursor: 'pointer',
                        background: key === 'iphone' ? 'var(--red)' : 'var(--bg,white)',
                        color:      key === 'iphone' ? 'white' : 'var(--text)',
                        border:     `1.5px solid ${key === 'iphone' ? 'var(--red)' : 'var(--border)'}` }}>
                      {label}
                    </button>
                  ))}
                </div>
                <ol data-platform="iphone" style={{ margin: 0, paddingLeft: 22, color: 'var(--text)', fontSize: 14, lineHeight: 2.1 }}>
                  <li>Open this link in <strong>Safari</strong> (not Chrome)</li>
                  <li>Tap the <strong>Share button ⬆️</strong> at the bottom</li>
                  <li>Scroll down and tap <strong>"Add to Home Screen"</strong></li>
                  <li>Tap <strong>Add</strong> — ✅ icon appears on your home screen</li>
                </ol>
                <ol data-platform="android" style={{ display: 'none', margin: 0, paddingLeft: 22, color: 'var(--text)', fontSize: 14, lineHeight: 2.1 }}>
                  <li>Open this link in <strong>Chrome</strong></li>
                  <li>Tap the <strong>three-dot menu ⋮</strong> at the top right</li>
                  <li>Tap <strong>"Add to Home Screen"</strong> or <strong>"Install App"</strong></li>
                  <li>Tap <strong>Install</strong> — ✅ icon appears on your home screen</li>
                </ol>
                <div style={{ marginTop: 16, padding: '10px 14px', background: 'var(--teal-l,#e6f4f1)', borderRadius: 10, fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
                  💡 Once installed the app loads instantly, works offline, and feels like a native app.
                </div>
                <button style={{ width: '100%', marginTop: 16 }} onClick={() => document.getElementById('install-modal').style.display = 'none'}>Got it!</button>
              </div>
            </div>
          </>
        )}
      </>)}

      {/* ── PHONE ── */}
      {step === 'phone' && (<>
        <button className="btn-muted" style={{ marginBottom: 12, fontSize: 13 }}
          onClick={() => { clearRc(); setStep('main'); setError(''); setPhone(''); }}>← Back</button>
        <h3 style={{ margin: '0 0 8px' }}>📱 Mobile Sign In</h3>
        <p className="small" style={{ margin: '0 0 16px', color: 'var(--muted)', lineHeight: 1.5 }}>
          Enter your Australian mobile number to receive a verification code.
        </p>
        <label>Mobile number <span style={{ color: 'var(--danger,#dc2626)' }}>*</span></label>
        <input type="tel" placeholder="04XX XXX XXX" value={phone} autoFocus
          onChange={e => { setPhone(e.target.value); setError(''); }}
          onKeyDown={e => e.key === 'Enter' && sendOtp()} />
        <p style={{ fontSize: 11, color: 'var(--muted)', margin: '2px 0 14px' }}>Australian mobiles only (+61).</p>
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
        <button className="btn-light" style={{ width: '100%', marginTop: 8, fontSize: 12 }}
          disabled={!!loading} onClick={() => { setOtp(''); sendOtp(); }}>Resend code</button>
      </>)}

      {/* ── REGISTER (new users) ── */}
      {step === 'register' && (<>
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>👋</div>
          <h3 style={{ margin: '0 0 4px' }}>Welcome! One last step.</h3>
          <p className="small" style={{ margin: 0, color: 'var(--muted)', lineHeight: 1.5 }}>
            Your mobile is verified. Please enter your name and email to complete registration.
          </p>
        </div>

        {/* Hint for existing users */}
        <div style={{
          background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10,
          padding: '8px 12px', marginBottom: 14, fontSize: 12, color: '#1e40af', lineHeight: 1.5,
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
        <p style={{ fontSize: 11, color: 'var(--muted)', margin: '2px 0 14px' }}>
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
          <div style={{ fontSize: 42, marginBottom: 8 }}>🔗</div>
          <h3 style={{ margin: '0 0 6px' }}>Existing Account Found</h3>
        </div>

        <div style={{
          background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 14,
          padding: '14px 16px', marginBottom: 16, lineHeight: 1.7,
        }}>
          <div style={{ fontSize: 13, color: 'var(--text)' }}>
            We found an existing account with this email:
          </div>
          <div style={{ fontWeight: 800, fontSize: 15, margin: '4px 0 2px', color: 'var(--teal)' }}>
            {matchedProfile.fullName}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            {matchedProfile.email}
          </div>
        </div>

        <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6, margin: '0 0 16px' }}>
          We'll connect your mobile number to this account so you can sign in with your phone going forward. All your existing events, favourites and settings will be preserved.
        </p>

        {displayError && <div className="error" style={{ marginBottom: 10 }}>{displayError}</div>}

        <button style={{ width: '100%', marginBottom: 10 }}
          disabled={!!loading} onClick={linkToExistingAccount}>
          {loading === 'link' ? 'Connecting…' : '✅ Yes, Connect to My Existing Account'}
        </button>

        <button className="btn-light" style={{ width: '100%', fontSize: 13 }}
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
  );
}
