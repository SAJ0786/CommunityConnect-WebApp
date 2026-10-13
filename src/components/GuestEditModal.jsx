import React, { useState, useRef } from 'react';
import { useDialogFocus } from '../utils/useDialogFocus';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getApp } from 'firebase/app';

// Normalize phone: strip spaces, dashes, brackets, handle +61 → 04
function normalizePhone(p) {
  if (!p) return '';
  let s = String(p).replace(/[\s\-().+]/g, '');
  if (s.startsWith('61') && s.length === 11) s = '0' + s.slice(2);
  return s.toLowerCase();
}

function normalizeEmail(e) {
  return String(e || '').trim().toLowerCase();
}

export default function GuestEditModal({ event, onClose, onVerified }) {
  const [step,    setStep]    = useState('input');   // input → sending → verify → done
  const [contact, setContact] = useState('');
  const [otp,     setOtp]     = useState('');
  const [token,   setToken]   = useState('');
  const [error,   setError]   = useState('');
  const [busy,    setBusy]    = useState(false);
  const dialogRef = useRef(null);
  useDialogFocus(dialogRef, true, onClose);

  const fns = getFunctions(getApp(), 'australia-southeast1');

  // Check if event has any contact info to match against
  const hasPhone = !!(event.hostPhone || event.hostContactOptional);
  const hasEmail = !!(event.hostContactOptional?.includes('@') || event.createdByUserEmail);

  if (!hasPhone && !hasEmail) {
    return (
      <>
        <div onClick={onClose} style={{ position:'fixed',inset:0,background:'color-mix(in srgb, var(--cc-overlay-base) 50%, transparent)',zIndex:300 }} />
        <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Edit your event" tabIndex={-1} style={modalStyle}>
          <h3 style={{ margin:'0 0 12px', color:'var(--cc-danger)' }}>Cannot Edit</h3>
          <p style={{ fontSize:'0.875rem', color:'var(--muted)', margin:'0 0 16px' }}>
            No contact information is stored for this event. Please contact an admin to make changes.
          </p>
          <button onClick={onClose} style={{ width:'100%' }}>Close</button>
        </div>
      </>
    );
  }

  const sendOtp = async () => {
    if (!contact.trim()) return setError('Please enter your phone number or email.');
    setError(''); setBusy(true);

    try {
      const fn = httpsCallable(fns, 'sendEditOtp');
      const result = await fn({ eventId: event.id, contact: contact.trim() });
      setToken(result.data.token);
      setStep('verify');
    } catch (e) {
      setError(e.message || 'Could not send verification code. Check your contact details match the event.');
    }
    setBusy(false);
  };

  const verifyOtp = async () => {
    if (!otp.trim()) return setError('Please enter the verification code.');
    setError(''); setBusy(true);

    try {
      const fn = httpsCallable(fns, 'verifyEditOtp');
      await fn({ token, otp: otp.trim(), eventId: event.id });
      setStep('done');
      setTimeout(() => {
        onVerified(event);
        onClose();
      }, 800);
    } catch (e) {
      setError(e.message || 'Invalid or expired code. Please try again.');
    }
    setBusy(false);
  };

  return (
    <>
      <div onClick={onClose} style={{ position:'fixed',inset:0,background:'color-mix(in srgb, var(--cc-overlay-base) 50%, transparent)',zIndex:300 }} />
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Edit your event" tabIndex={-1} style={modalStyle}>
        {step === 'input' && (
          <>
            <h3 style={{ margin:'0 0 8px' }}>Edit Your Event</h3>
            <p style={{ fontSize:'0.8125rem', color:'var(--muted)', margin:'0 0 16px', lineHeight:1.6 }}>
              Enter the phone number or email address stored on this event.
              We'll send you a verification code to confirm your identity.
            </p>
            <label>Phone number or email</label>
            <input
              placeholder="e.g. 0412 345 678 or email@example.com"
              value={contact}
              onChange={e => { setContact(e.target.value); setError(''); }}
              onKeyDown={e => e.key === 'Enter' && sendOtp()}
              autoFocus
            />
            {error && <p style={{ color:'var(--cc-danger)', fontSize:'0.8125rem', margin:'4px 0' }}>{error}</p>}
            <div style={{ display:'flex', gap:8, marginTop:12 }}>
              <button className="btn-muted" onClick={onClose} style={{ flex:1 }}>Cancel</button>
              <button onClick={sendOtp} disabled={busy} style={{ flex:2 }}>
                {busy ? 'Sending…' : '📲 Send Verification Code'}
              </button>
            </div>
          </>
        )}

        {step === 'verify' && (
          <>
            <h3 style={{ margin:'0 0 8px' }}>Enter Verification Code</h3>
            <p style={{ fontSize:'0.8125rem', color:'var(--muted)', margin:'0 0 16px', lineHeight:1.6 }}>
              A 6-digit code has been sent to <strong>{contact}</strong>.
              Enter it below to edit your event.
            </p>
            <label>6-digit code</label>
            <input
              placeholder="e.g. 847291"
              value={otp}
              onChange={e => { setOtp(e.target.value.replace(/\D/g,'')); setError(''); }}
              maxLength={6}
              inputMode="numeric"
              autoFocus
            />
            {error && <p style={{ color:'var(--cc-danger)', fontSize:'0.8125rem', margin:'4px 0' }}>{error}</p>}
            <div style={{ display:'flex', gap:8, marginTop:12 }}>
              <button className="btn-muted" onClick={() => setStep('input')} style={{ flex:1 }}>Back</button>
              <button onClick={verifyOtp} disabled={busy || otp.length !== 6} style={{ flex:2 }}>
                {busy ? 'Verifying…' : '✅ Verify & Edit'}
              </button>
            </div>
            <p style={{ fontSize:'0.6875rem', color:'var(--muted)', marginTop:8, textAlign:'center' }}>
              Code expires in 10 minutes. Check spam if not received.
            </p>
          </>
        )}

        {step === 'done' && (
          <div style={{ textAlign:'center', padding:'8px 0' }}>
            <div style={{ fontSize:'2.5rem', marginBottom:8 }}>✅</div>
            <p style={{ fontWeight:800, color:'var(--teal)' }}>Verified! Opening editor…</p>
          </div>
        )}
      </div>
    </>
  );
}

const modalStyle = {
  position: 'fixed', top:'50%', left:'50%',
  transform: 'translate(-50%,-50%)',
  background: 'var(--cc-surface)', borderRadius: 20, padding: 24,
  width: 'min(400px, calc(100vw - 32px))',
  maxHeight: 'calc(100dvh - 32px)', overflowY: 'auto',
  zIndex: 301, boxShadow: '0 24px 64px color-mix(in srgb, var(--cc-shadow-base) 20%, transparent)'
};
