import BackControl from '../components/BackControl';
import React, { useEffect, useRef, useState } from 'react';
import {
  browserLocalPersistence,
  setPersistence,
  signInWithPhoneNumber,
  RecaptchaVerifier,
} from 'firebase/auth';
import { auth } from '../firebase/firebase';
import { phoneAuthAddressError } from '../utils/phoneAuthMessages.mjs';
import { LEGAL_URLS } from '../config/legal.mjs';

function formatAU(raw) {
  let s = String(raw || '').replace(/[\s\-().]/g, '');
  if (s.startsWith('0'))                        s = '+61' + s.slice(1);
  if (s.startsWith('61') && !s.startsWith('+')) s = '+' + s;
  return s;
}
function isValidAU(n)    { return /^\+614\d{8}$/.test(n); }

export default function AuthPage({ onAuthComplete, authError = '', experienceTitle = 'Events', onChooseExperience }) {
  // Profile completion is enforced centrally by App after every sign-in.
  const [step,        setStep]        = useState('main');
  const [loading,     setLoading]     = useState('');
  const [error,       setError]       = useState('');
  const [phone,       setPhone]       = useState('');
  const [otp,         setOtp]         = useState('');
  const [confirm,     setConfirm]     = useState(null);
  const [accepted,    setAccepted]    = useState(false);
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
    if (loading) return;
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
        e.code === 'auth/invalid-app-credential' ? phoneAuthAddressError(window.location.hostname) :
        `SMS error: ${e.code || e.message}. Please try again.`
      );
    }
    setLoading('');
  };

  // App owns profile loading and completion, including after a refresh.
  const verifyOtp = async () => {
    if (loading || otp.length !== 6 || !confirm) return;
    setError(''); setLoading('verify');
    try {
      const result = await confirm.confirm(otp);
      clearRc();
      await onAuthComplete(result.user);
    } catch (error) {
      setError(error.code === 'auth/invalid-verification-code' ? 'Incorrect code. Please try again.'
        : error.code === 'auth/code-expired' ? 'Code expired. Go back and resend.'
        : 'Verification failed. Please try again.');
    } finally { setLoading(''); }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="auth-page auth-theme">
    <div className="auth-card">
      <div id="recaptcha-container" />
      {step === 'main' && onChooseExperience && <BackControl onClick={onChooseExperience} label="Change experience"/>}
      {import.meta.env.VITE_LOCAL_PREVIEW === 'true' && ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname) &&
        <p className="small" role="note">Local preview: use a configured test number. Real SMS sign-in requires an authorised hosted preview.</p>}
      <p className="auth-experience">Continue to {experienceTitle}</p>

      {/* ── MAIN ── */}
      {step === 'main' && (<>
        <div className="auth-main-heading">
          <img src="/icons/icon-192.png" alt="Community Connect Australia" className="auth-login-logo" />
          <h2 style={{ margin: '0 0 4px' }}>Sign In</h2>
          <p className="small" style={{ margin: 0, color: 'var(--muted)' }}>One account for Events and Business Directory. Use your Australian mobile number to continue.</p>
        </div>

        <label className="auth-consent">
          <input type="checkbox" checked={accepted} onChange={e => { setAccepted(e.target.checked); setError(''); }} />
          <span>
            I agree to the{' '}
            <a href={LEGAL_URLS.privacy} target="_blank" rel="noreferrer">Privacy Policy</a>
            {' '}and{' '}
            <a href={LEGAL_URLS.terms} target="_blank" rel="noreferrer">Terms of Use</a>.
          </span>
        </label>

        {displayError && <div className="error" style={{ marginBottom: 10 }}>{displayError}</div>}

        <button className="auth-primary"
          onClick={() => { if (!accepted) return setError('Please accept the Privacy Policy first.'); setError(''); setStep('phone'); }}>
          Continue with Mobile Number
        </button>

        <button className="btn-light auth-secondary"
          onClick={() => { if (!accepted) { setError('Please accept the Privacy Policy first.'); return; } onAuthComplete(null); }}>
          Browse {experienceTitle} as Guest
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
        <BackControl onClick={() => { clearRc(); setStep('main'); setError(''); setPhone(''); }} label="Back"/>
        <h3 style={{ margin: '0 0 8px' }}>📱 Mobile Sign In</h3>
        <p className="small" style={{ margin: '0 0 16px', color: 'var(--muted)', lineHeight: 1.5 }}>
          Enter your Australian mobile number to receive a verification code.
        </p>
        <label>Mobile number <span style={{ color: 'var(--danger,var(--cc-danger))' }}>*</span></label>
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
        <BackControl onClick={() => { setStep('phone'); setOtp(''); setError(''); }} disabled={!!loading} label="Back"/>
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

          <button style={{ flex: 2 }} disabled={otp.length !== 6 || !!loading} onClick={verifyOtp}>
            {loading === 'verify' ? 'Verifying…' : '✅ Verify'}
          </button>
        </div>
        <button className="btn-light" style={{ width: '100%', marginTop: 8, fontSize: '0.75rem' }}
          disabled={!!loading} onClick={() => { setOtp(''); sendOtp(); }}>Resend code</button>
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
