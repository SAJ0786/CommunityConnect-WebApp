import React, { useEffect, useRef, useState } from 'react';
import {
  browserLocalPersistence,
  setPersistence,
  signInWithPopup,
  signInWithRedirect,
  signInWithPhoneNumber,
  RecaptchaVerifier,
  OAuthProvider,
  updateProfile as fbUpdateProfile,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, googleProvider, db } from '../firebase/firebase';

const microsoftProvider = new OAuthProvider('microsoft.com');
const isMobile   = () => /android|iphone|ipad|ipod/i.test(navigator.userAgent);
const isPwa      = () => window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator.standalone === true;
const sessionOk  = () => { try { sessionStorage.setItem('_t','1'); sessionStorage.removeItem('_t'); return true; } catch { return false; } };

function formatAU(raw) {
  let s = String(raw||'').replace(/[\s\-().]/g,'');
  if (s.startsWith('0'))                        s = '+61'+s.slice(1);
  if (s.startsWith('61') && !s.startsWith('+')) s = '+'+s;
  return s;
}
function isValidAU(n) { return /^\+614\d{8}$/.test(n); }
function isValidEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim()); }

export default function AuthPage({ onAuthComplete, authError = '', onRegistrationStart }) {
  // Steps: main | phone | otp | register (new users only)
  const [step,      setStep]     = useState('main');
  const [loading,   setLoading]  = useState('');
  const [error,     setError]    = useState('');
  const [phone,     setPhone]    = useState('');
  const [otp,       setOtp]      = useState('');
  const [name,      setName]     = useState('');
  const [email,     setEmail]    = useState('');
  const [confirm,   setConfirm]  = useState(null);
  const [pendingUser, setPendingUser] = useState(null); // verified Firebase user
  const [accepted,  setAccepted] = useState(false);
  const rcRef = useRef(null);
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

  // ── Send OTP ──────────────────────────────────────────────────────────────
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

  // ── Verify OTP ────────────────────────────────────────────────────────────
  const verifyOtp = async () => {
    if (otp.length !== 6 || !confirm) return;
    setError(''); setLoading('verify');
    try {
      const res  = await confirm.confirm(otp);
      const user = res.user;
      clearRc();

      // Signal App.jsx to pause — do this BEFORE any Firestore check
      if (onRegistrationStart) onRegistrationStart();

      // Check if existing user by reading Firestore directly
      // Use a small delay to let any concurrent writes settle
      await new Promise(r => setTimeout(r, 500));
      const snap = await getDoc(doc(db, 'users', user.uid));
      const existingName = snap.exists() ? (snap.data()?.fullName || '') : '';
      const existingEmail = snap.exists() ? (snap.data()?.email || '') : '';

      if (existingName) {
        // Existing user with profile — go straight in
        // Release the flag before completing
        onAuthComplete(user, {});
      } else {
        // New user OR existing user with no name — show registration form
        setPendingUser(user);
        setName(existingName);
        setEmail(existingEmail);
        setStep('register');
        setLoading('');
      }
    } catch (e) {
      // Release flag on error
      if (typeof onRegistrationStart === 'function') {
        // flag was set - need to clear it
        onAuthComplete && setPendingUser(null);
      }
      setLoading('');
      setError(
        e.code === 'auth/invalid-verification-code' ? 'Incorrect code. Please try again.' :
        e.code === 'auth/code-expired'              ? 'Code expired. Go back and resend.' :
        'Verification failed. Please try again.'
      );
    }
  };

  // ── Complete registration (new users) ─────────────────────────────────────
  const completeRegistration = async () => {
    if (!name.trim())         { setError('Please enter your full name.'); return; }
    if (!isValidEmail(email)) { setError('Please enter a valid email address.'); return; }
    if (!pendingUser)         { setError('Session expired. Please start again.'); return; }
    setError(''); setLoading('register');
    try {
      await fbUpdateProfile(pendingUser, { displayName: name.trim() });
      onAuthComplete(pendingUser, { fullName: name.trim(), email: email.trim() });
    } catch (e) {
      setLoading('');
      setError('Could not save details. Please try again.');
    }
  };

  // ── Social login ──────────────────────────────────────────────────────────
  const explainErr = (e) => {
    if (e.code === 'auth/account-exists-with-different-credential') {
      const p = e.customData?._tokenResponse?.verifiedProvider?.[0] || '';
      const m = p.includes('google') ? 'Google' : p.includes('microsoft') ? 'Microsoft' : 'another method';
      return `This email is already registered with ${m}. Please sign in with ${m}.`;
    }
    if (e.code === 'auth/popup-closed-by-user') return 'Sign-in window was closed.';
    return e.message || 'Login failed. Please try again.';
  };

  const doSocial = async (provider, key) => {
    if (!accepted) { setError('Please accept the Privacy Policy and Terms of Use.'); return; }
    setError(''); setLoading(key);
    try {
      await setPersistence(auth, browserLocalPersistence);
      try {
        const r = await signInWithPopup(auth, provider);
        try { localStorage.removeItem('socialLoginStarted'); } catch {}
        onAuthComplete(r.user);
      } catch (popupErr) {
        if (popupErr.code === 'auth/popup-closed-by-user') { setError(explainErr(popupErr)); setLoading(''); return; }
        const doRedirect = popupErr.code === 'auth/popup-blocked' ||
                           popupErr.code === 'auth/cancelled-popup-request' ||
                           isMobile() || isPwa();
        if (doRedirect) {
          try { localStorage.setItem('socialLoginStarted', JSON.stringify({ provider: key, at: Date.now() })); } catch {}
          await signInWithRedirect(auth, provider); return;
        }
        throw popupErr;
      }
    } catch (e) { setLoading(''); setError(explainErr(e)); }
  };

  const SOCIAL = [
    { key:'google',    label:'Google',    provider:googleProvider,
      logo:<svg width="24" height="24" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg> },
    { key:'microsoft', label:'Microsoft', provider:microsoftProvider,
      logo:<svg width="22" height="22" viewBox="0 0 21 21"><rect x="1" y="1" width="9" height="9" fill="#F25022"/><rect x="11" y="1" width="9" height="9" fill="#7FBA00"/><rect x="1" y="11" width="9" height="9" fill="#00A4EF"/><rect x="11" y="11" width="9" height="9" fill="#FFB900"/></svg> },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="auth-card">
      <div id="recaptcha-container" />

      {/* ── MAIN ── */}
      {step === 'main' && (<>
        <div style={{ textAlign:'center', marginBottom:20 }}>
          <h2 style={{ margin:'0 0 4px' }}>Sign In</h2>
          <p className="small" style={{ margin:0, color:'var(--muted)' }}>Community Events Australia</p>
        </div>

        <div style={{ display:'flex', justifyContent:'center', gap:14, marginBottom:16 }}>
          {SOCIAL.map(({ key, label, logo, provider }) => (
            <button key={key} title={`Sign in with ${label}`}
              onClick={() => doSocial(provider, key)} disabled={!!loading}
              style={{ width:56, height:56, borderRadius:14, border:'1.5px solid var(--border)',
                background:'white', cursor:'pointer', display:'flex', alignItems:'center',
                justifyContent:'center', boxShadow:'0 2px 8px rgba(0,0,0,.08)',
                opacity: loading ? .6 : 1 }}>
              {loading === key ? '⏳' : logo}
            </button>
          ))}
        </div>

        <div style={{ display:'flex', alignItems:'center', gap:10, margin:'0 0 14px' }}>
          <div style={{ flex:1, height:1, background:'var(--border)' }} />
          <span className="small" style={{ color:'var(--muted)' }}>or</span>
          <div style={{ flex:1, height:1, background:'var(--border)' }} />
        </div>

        <button style={{ width:'100%', marginBottom:14, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}
          onClick={() => { if (!accepted) return setError('Please accept the Privacy Policy first.'); setError(''); setStep('phone'); }}>
          📱 Continue with Mobile Number
        </button>

        {displayError && <div className="error" style={{ marginBottom:10 }}>{displayError}</div>}

        <label style={{ display:'flex', gap:8, alignItems:'flex-start', cursor:'pointer' }}>
          <input type="checkbox" checked={accepted} onChange={e => { setAccepted(e.target.checked); setError(''); }} style={{ width:'auto', marginTop:3 }} />
          <span style={{ fontSize:12, color:'var(--muted)', lineHeight:1.5 }}>
            I agree to the{' '}
            <a href="/privacy.html" target="_blank" rel="noreferrer" style={{ color:'var(--red)' }}>Privacy Policy</a>
            {' '}and{' '}
            <a href="/terms.html" target="_blank" rel="noreferrer" style={{ color:'var(--red)' }}>Terms of Use</a>
          </span>
        </label>

        <button className="btn-light" style={{ width:'100%', marginTop:14 }}
          onClick={() => {
            if (!accepted) { setError('Please accept the Privacy Policy first.'); return; }
            onAuthComplete(null);
          }}>
          👤 Browse as Guest
        </button>

        {/* Install App button — hidden when already running as PWA */}
        {!isPwa() && (
          <>
            <div style={{ display:'flex', alignItems:'center', gap:10, margin:'14px 0 0' }}>
              <div style={{ flex:1, height:1, background:'var(--border)' }} />
              <span className="small" style={{ color:'var(--muted)', fontSize:11 }}>install</span>
              <div style={{ flex:1, height:1, background:'var(--border)' }} />
            </div>
            <button
              className="btn-light"
              style={{ width:'100%', marginTop:10, display:'flex', alignItems:'center', justifyContent:'center', gap:10 }}
              onClick={() => document.getElementById('install-modal').style.display = 'flex'}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12" y2="18"/></svg>
              📲 Install This App
            </button>

            {/* Install modal */}
            <div id="install-modal" style={{
              display:'none', position:'fixed', inset:0, zIndex:99999,
              background:'rgba(0,0,0,0.65)',
              alignItems:'center', justifyContent:'center', padding:16,
            }} onClick={e => { if(e.target.id==='install-modal') e.target.style.display='none'; }}>
              <div style={{
                background:'var(--card,white)', borderRadius:20, padding:24,
                width:'100%', maxWidth:400, border:'1px solid var(--border)',
                boxShadow:'0 20px 60px rgba(0,0,0,0.4)',
              }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
                  <h2 style={{ margin:0, fontSize:19, color:'var(--text)' }}>📲 Install This App</h2>
                  <button onClick={() => document.getElementById('install-modal').style.display='none'}
                    style={{ background:'transparent', border:'none', fontSize:22, cursor:'pointer', color:'var(--muted)', lineHeight:1 }}>✕</button>
                </div>

                {/* Platform tabs */}
                <div style={{ display:'flex', gap:8, marginBottom:20 }}>
                  {[['iphone','🍎 iPhone / iPad'],['android','🤖 Android']].map(([key, label]) => (
                    <button key={key}
                      onClick={() => {
                        document.querySelectorAll('[data-platform]').forEach(el => {
                          el.style.display = el.dataset.platform === key ? 'block' : 'none';
                        });
                        document.querySelectorAll('[data-tab]').forEach(el => {
                          el.style.background = el.dataset.tab === key ? 'var(--red)' : 'var(--bg,white)';
                          el.style.color      = el.dataset.tab === key ? 'white'       : 'var(--text)';
                          el.style.borderColor= el.dataset.tab === key ? 'var(--red)' : 'var(--border)';
                        });
                      }}
                      data-tab={key}
                      style={{
                        flex:1, padding:'8px', borderRadius:10, fontWeight:600, fontSize:13, cursor:'pointer',
                        background: key==='iphone' ? 'var(--red)' : 'var(--bg,white)',
                        color:      key==='iphone' ? 'white'       : 'var(--text)',
                        border: `1.5px solid ${key==='iphone' ? 'var(--red)' : 'var(--border)'}`,
                      }}>
                      {label}
                    </button>
                  ))}
                </div>

                <ol data-platform="iphone" style={{ margin:0, paddingLeft:22, color:'var(--text)', fontSize:14, lineHeight:2.1 }}>
                  <li>Open this link in <strong>Safari</strong> (not Chrome)</li>
                  <li>Tap the <strong>Share button ⬆️</strong> at the bottom</li>
                  <li>Scroll down and tap <strong>"Add to Home Screen"</strong></li>
                  <li>Tap <strong>Add</strong> — ✅ icon appears on your home screen</li>
                </ol>

                <ol data-platform="android" style={{ display:'none', margin:0, paddingLeft:22, color:'var(--text)', fontSize:14, lineHeight:2.1 }}>
                  <li>Open this link in <strong>Chrome</strong></li>
                  <li>Tap the <strong>three-dot menu ⋮</strong> at the top right</li>
                  <li>Tap <strong>"Add to Home Screen"</strong> or <strong>"Install App"</strong></li>
                  <li>Tap <strong>Install</strong> — ✅ icon appears on your home screen</li>
                </ol>

                <div style={{ marginTop:16, padding:'10px 14px', background:'var(--teal-l,#e6f4f1)', borderRadius:10, fontSize:12, color:'var(--muted)', lineHeight:1.5 }}>
                  💡 Once installed the app loads instantly, works offline, and feels like a native app.
                </div>

                <button style={{ width:'100%', marginTop:16 }}
                  onClick={() => document.getElementById('install-modal').style.display='none'}>
                  Got it!
                </button>
              </div>
            </div>
          </>
        )}
      </>)}

      {/* ── PHONE ── */}
      {step === 'phone' && (<>
        <button className="btn-muted" style={{ marginBottom:12, fontSize:13 }}
          onClick={() => { clearRc(); setStep('main'); setError(''); setPhone(''); }}>
          ← Back
        </button>
        <h3 style={{ margin:'0 0 8px' }}>📱 Mobile Sign In</h3>
        <p className="small" style={{ margin:'0 0 16px', color:'var(--muted)', lineHeight:1.5 }}>
          Enter your Australian mobile number to receive a verification code.
        </p>
        <label>Mobile number <span style={{ color:'var(--danger,#dc2626)' }}>*</span></label>
        <input type="tel" placeholder="04XX XXX XXX" value={phone} autoFocus
          onChange={e => { setPhone(e.target.value); setError(''); }}
          onKeyDown={e => e.key === 'Enter' && sendOtp()} />
        <p style={{ fontSize:11, color:'var(--muted)', margin:'2px 0 14px' }}>Australian mobiles only (+61).</p>
        {displayError && <div className="error" style={{ marginBottom:10 }}>{displayError}</div>}
        <button onClick={sendOtp} disabled={!!loading || !isValidAU(formatAU(phone))} style={{ width:'100%' }}>
          {loading === 'otp' ? 'Sending…' : '📲 Send Verification Code'}
        </button>
      </>)}

      {/* ── OTP ── */}
      {step === 'otp' && (<>
        <h3 style={{ margin:'0 0 8px' }}>Enter Verification Code</h3>
        <p className="small" style={{ margin:'0 0 14px', color:'var(--muted)', lineHeight:1.5 }}>
          A 6-digit code was sent to <strong>{formatAU(phone)}</strong>.
        </p>
        <label>6-digit code</label>
        <input placeholder="847291" value={otp} inputMode="numeric" maxLength={6} autoFocus
          onChange={e => { setOtp(e.target.value.replace(/\D/g,'')); setError(''); }}
          onKeyDown={e => e.key === 'Enter' && verifyOtp()} />
        {displayError && <div className="error" style={{ marginBottom:10 }}>{displayError}</div>}
        <div style={{ display:'flex', gap:8, marginTop:12 }}>
          <button className="btn-muted" style={{ flex:1 }}
            onClick={() => { setStep('phone'); setOtp(''); setError(''); }}>
            ← Back
          </button>
          <button style={{ flex:2 }} disabled={otp.length !== 6 || !!loading} onClick={verifyOtp}>
            {loading === 'verify' ? 'Verifying…' : '✅ Verify'}
          </button>
        </div>
        <button className="btn-light" style={{ width:'100%', marginTop:8, fontSize:12 }}
          disabled={!!loading} onClick={() => { setOtp(''); sendOtp(); }}>
          Resend code
        </button>
      </>)}

      {/* ── REGISTER (new users only) ── */}
      {step === 'register' && (<>
        <div style={{ textAlign:'center', marginBottom:16 }}>
          <div style={{ fontSize:36, marginBottom:8 }}>👋</div>
          <h3 style={{ margin:'0 0 4px' }}>Welcome! One last step.</h3>
          <p className="small" style={{ margin:0, color:'var(--muted)', lineHeight:1.5 }}>
            Your mobile is verified. Please enter your name and email to complete registration.
          </p>
        </div>

        <label>Full name <span style={{ color:'var(--danger,#dc2626)' }}>*</span></label>
        <input placeholder="e.g. Ali Hussain" value={name} autoFocus
          onChange={e => { setName(e.target.value); setError(''); }}
          onKeyDown={e => e.key === 'Enter' && email && completeRegistration()} />

        <label style={{ marginTop:12 }}>
          Email address <span style={{ color:'var(--danger,#dc2626)' }}>*</span>
        </label>
        <input type="email" placeholder="e.g. ali@example.com" value={email}
          onChange={e => { setEmail(e.target.value); setError(''); }}
          onKeyDown={e => e.key === 'Enter' && completeRegistration()} />
        <p style={{ fontSize:11, color:'var(--muted)', margin:'2px 0 14px' }}>
          Used for event reminders. Not shared publicly.
        </p>

        {displayError && <div className="error" style={{ marginBottom:10 }}>{displayError}</div>}

        <div style={{ display:'flex', gap:8 }}>
          <button className="btn-muted" style={{ flex:1 }}
            onClick={() => {
              // Cancel — sign out and return to login
              import('firebase/auth').then(({ signOut }) => signOut(auth).catch(() => {}));
              setPendingUser(null); setStep('main');
              setName(''); setEmail(''); setOtp(''); setPhone(''); setError('');
            }}>
            ✕ Cancel
          </button>
          <button style={{ flex:2 }}
            disabled={!name.trim() || !isValidEmail(email) || !!loading}
            onClick={completeRegistration}>
            {loading === 'register' ? 'Saving…' : '✅ Complete Registration'}
          </button>
        </div>
      </>)}
    </div>
  );
}
