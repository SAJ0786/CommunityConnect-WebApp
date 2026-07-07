import React, { useEffect, useState } from 'react';

// Global share sheet — called by EventCard when native share not available
let _show = null;

export function initShareSheet(fn) { _show = fn; }

export default function ShareSheet() {
  const [msg, setMsg]     = useState('');
  const [open, setOpen]   = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    window.__showShareSheet = (message) => {
      setMsg(message);
      setCopied(false);
      setOpen(true);
    };
    return () => { delete window.__showShareSheet; };
  }, []);

  if (!open) return null;

  const encoded = encodeURIComponent(msg);
  const close   = () => setOpen(false);

  const copyText = () => {
    navigator.clipboard.writeText(msg).then(() => {
      setCopied(true);
      setTimeout(() => { setCopied(false); setOpen(false); }, 1800);
    });
  };

  return (
    <>
      {/* Backdrop */}
      <div onClick={close} style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,.45)', zIndex: 1000
      }} />

      {/* Sheet */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'white', borderRadius: '20px 20px 0 0',
        padding: '20px 20px 36px', zIndex: 1001,
        boxShadow: '0 -8px 32px rgba(0,0,0,.15)'
      }}>
        {/* Handle */}
        <div style={{ width: 40, height: 4, borderRadius: 2, background: '#e5e7eb', margin: '0 auto 18px' }} />

        <h3 style={{ margin: '0 0 16px', fontSize: '1rem', textAlign: 'center' }}>Share Event</h3>

        {/* Share options */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
          {/* WhatsApp */}
          <a href={`https://wa.me/?text=${encoded}`} target="_blank" rel="noreferrer"
            onClick={close}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              padding: '14px 8px', borderRadius: 16, background: '#f0fdf4',
              border: '1px solid #bbf7d0', textDecoration: 'none', cursor: 'pointer'
            }}>
            <span style={{ fontSize: '1.75rem' }}>💬</span>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#166534' }}>WhatsApp</span>
          </a>

          {/* SMS */}
          <a href={`sms:?body=${encoded}`} onClick={close}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              padding: '14px 8px', borderRadius: 16, background: '#eff6ff',
              border: '1px solid #bfdbfe', textDecoration: 'none', cursor: 'pointer'
            }}>
            <span style={{ fontSize: '1.75rem' }}>✉️</span>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#1e40af' }}>SMS</span>
          </a>

          {/* Copy */}
          <button onClick={copyText}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              padding: '14px 8px', borderRadius: 16, background: copied ? '#f0fdf4' : '#f9fafb',
              border: `1px solid ${copied ? '#86efac' : '#e5e7eb'}`,
              cursor: 'pointer', outline: 'none'
            }}>
            <span style={{ fontSize: '1.75rem' }}>{copied ? '✅' : '📋'}</span>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: copied ? '#166534' : '#374151' }}>
              {copied ? 'Copied!' : 'Copy Text'}
            </span>
          </button>
        </div>

        <button
          onClick={close}
          style={{
            width: '100%', padding: '13px', borderRadius: 14, border: 'none',
            background: '#f3f4f6', color: '#374151', fontWeight: 800,
            fontSize: '0.875rem', cursor: 'pointer'
          }}>
          Cancel
        </button>
      </div>
    </>
  );
}
