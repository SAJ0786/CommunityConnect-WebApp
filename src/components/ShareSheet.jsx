import React, { useEffect, useState } from 'react';

export default function ShareSheet() {
  const [msg,       setMsg]       = useState('');
  const [imageUrl,  setImageUrl]  = useState('');
  const [shareTitle, setShareTitle] = useState('Share Event');
  const [fileName, setFileName] = useState('event-poster.jpg');
  const [open,      setOpen]      = useState(false);
  const [copied,    setCopied]    = useState(false);
  const [sharing,   setSharing]   = useState(false);

  useEffect(() => {
    // Accept either a plain string (legacy) or { text, imageUrl }
    window.__showShareSheet = (payload) => {
      const text  = typeof payload === 'string' ? payload : (payload.text  || '');
      const image = typeof payload === 'string' ? ''      : (payload.imageUrl || '');
      setMsg(text);
      setImageUrl(image);
      setShareTitle(typeof payload === 'string' ? 'Share Event' : (payload.title || 'Share Event'));
      setFileName(typeof payload === 'string' ? 'event-poster.jpg' : (payload.fileName || 'event-poster.jpg'));
      setCopied(false);
      setSharing(false);
      setOpen(true);
    };
    return () => { delete window.__showShareSheet; };
  }, []);

  if (!open) return null;

  const encoded = encodeURIComponent(msg);
  const close   = () => setOpen(false);

  const openWhatsApp = () => {
    close();
    // Same-window universal link works more reliably in PWAs and store wrappers
    // than target=_blank, and opens the installed WhatsApp app when available.
    window.location.assign(`https://api.whatsapp.com/send?text=${encoded}`);
  };

  const openSms = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: shareTitle, text: msg });
        close();
        return;
      } catch (error) {
        if (error.name === 'AbortError') return;
        console.warn('Native message sharing failed:', error.message);
      }
    }

    const isAppleMobile = /iPhone|iPad|iPod/i.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    close();
    window.location.href = isAppleMobile
      ? `sms:&body=${encoded}`
      : `sms:?body=${encoded}`;
  };

  const copyText = () => {
    navigator.clipboard.writeText(msg).then(() => {
      setCopied(true);
      setTimeout(() => { setCopied(false); setOpen(false); }, 1800);
    });
  };

  // Native share with poster image attached (Android + most iOS)
  const nativeShareWithImage = async () => {
    if (!imageUrl) return;
    setSharing(true);
    try {
      // Fetch the image as a blob
      const resp = await fetch(imageUrl);
      const blob = await resp.blob();
      const ext  = blob.type.includes('png') ? 'png' : 'jpg';
      const resolvedFileName = fileName.includes('.') ? fileName : `${fileName}.${ext}`;
      const file = new File([blob], resolvedFileName, { type: blob.type });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text: msg });
        setOpen(false);
      } else {
        // Can't share files — fall back to text-only native share
        await navigator.share({ text: msg });
        setOpen(false);
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        // If native share fails for any reason, continue showing the sheet
        console.warn('Native share failed:', e.message);
      }
    }
    setSharing(false);
  };

  // Whether native Web Share API is available at all
  const hasNativeShare = !!navigator.share;
  const hasPoster = !!imageUrl;

  return (
    <>
      {/* Backdrop */}
      <div onClick={close} style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,.45)', zIndex: 1000,
      }} />

      {/* Sheet */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'white', borderRadius: '20px 20px 0 0',
        padding: '20px 20px 36px', zIndex: 1001,
        boxShadow: '0 -8px 32px rgba(0,0,0,.15)',
      }}>
        {/* Handle */}
        <div style={{ width: 40, height: 4, borderRadius: 2, background: '#e5e7eb', margin: '0 auto 18px' }} />

        <h3 style={{ margin: '0 0 16px', fontSize: '1rem', textAlign: 'center' }}>{shareTitle}</h3>

        {/* Poster preview */}
        {hasPoster && (
          <div style={{ marginBottom: 14, borderRadius: 12, overflow: 'hidden',
            border: '1px solid var(--border)', position: 'relative' }}>
            <img src={imageUrl} alt={`${shareTitle} poster`}
              style={{ width: '100%', maxHeight: 160, objectFit: 'cover', display: 'block' }} />
            <div style={{ position: 'absolute', bottom: 6, right: 8,
              background: 'rgba(15,118,110,0.9)', color: 'white', fontSize: '0.625rem',
              fontWeight: 700, padding: '3px 9px', borderRadius: 20 }}>
              🖼 Poster will be shared
            </div>
          </div>
        )}

        {/* Share options */}
        <div style={{ display: 'grid',
          gridTemplateColumns: hasPoster && hasNativeShare ? 'repeat(4,1fr)' : 'repeat(3,1fr)',
          gap: 10, marginBottom: 14 }}>

          {/* Share with poster (native) — only shown when poster + Web Share API available */}
          {hasPoster && hasNativeShare && (
            <button onClick={nativeShareWithImage} disabled={sharing}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                padding: '12px 6px', borderRadius: 14,
                background: 'linear-gradient(135deg,#0f766e,#16a34a)',
                border: 'none', cursor: 'pointer',
              }}>
              <span style={{ fontSize: '1.625rem' }}>{sharing ? '⏳' : '🖼'}</span>
              <span style={{ fontSize: '0.625rem', fontWeight: 800, color: 'white', textAlign: 'center', lineHeight: 1.2 }}>
                {sharing ? 'Sharing…' : 'Share with\nPoster'}
              </span>
            </button>
          )}

          {/* WhatsApp — text only */}
          <button type="button" onClick={openWhatsApp}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
              padding: '12px 6px', borderRadius: 14, background: '#f0fdf4',
              border: '1px solid #bbf7d0', textDecoration: 'none', cursor: 'pointer',
            }}>
            <span style={{ fontSize: '1.625rem' }}>💬</span>
            <span style={{ fontSize: '0.625rem', fontWeight: 800, color: '#166534', textAlign: 'center', lineHeight: 1.2 }}>
              WhatsApp{hasPoster ? '\n(text only)' : ''}
            </span>
          </button>

          {/* Native share drawer — text only */}
          <button type="button" onClick={openSms}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
              padding: '12px 6px', borderRadius: 14, background: '#eff6ff',
              border: '1px solid #bfdbfe', textDecoration: 'none', cursor: 'pointer',
            }}>
            <span style={{ fontSize: '1.625rem' }}>📤</span>
            <span style={{ fontSize: '0.625rem', fontWeight: 800, color: '#1e40af', textAlign: 'center', lineHeight: 1.2 }}>
              Share via Apps{hasPoster ? '\n(text only)' : ''}
            </span>
          </button>

          {/* Copy text */}
          <button onClick={copyText}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
              padding: '12px 6px', borderRadius: 14,
              background: copied ? '#f0fdf4' : '#f9fafb',
              border: `1px solid ${copied ? '#86efac' : '#e5e7eb'}`,
              cursor: 'pointer', outline: 'none',
            }}>
            <span style={{ fontSize: '1.625rem' }}>{copied ? '✅' : '📋'}</span>
            <span style={{ fontSize: '0.625rem', fontWeight: 800, textAlign: 'center', lineHeight: 1.2,
              color: copied ? '#166534' : '#374151' }}>
              {copied ? 'Copied!' : 'Copy Text'}
            </span>
          </button>
        </div>

        {/* Hint when poster sharing is available */}
        {hasPoster && hasNativeShare && (
          <p style={{ fontSize: '0.6875rem', color: 'var(--muted)', textAlign: 'center',
            margin: '0 0 12px', lineHeight: 1.4 }}>
            💡 Tap <strong>Share with Poster</strong> to send the image + text via any app
          </p>
        )}

        <button onClick={close} style={{
          width: '100%', padding: '13px', borderRadius: 14, border: 'none',
          background: '#f3f4f6', color: '#374151', fontWeight: 800,
          fontSize: '0.875rem', cursor: 'pointer',
        }}>
          Cancel
        </button>
      </div>
    </>
  );
}
