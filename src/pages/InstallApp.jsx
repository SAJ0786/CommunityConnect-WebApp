import React, { useState } from 'react';

// Install page — same content/style as the original install modal.
export default function InstallApp() {
  const [installPlatform, setInstallPlatform] = useState('iphone');

  return (
    <div style={{ padding: 16, maxWidth: 460, margin: '0 auto' }}>
      <div style={{
        background: 'var(--card,var(--cc-surface))', borderRadius: 22, padding: 24,
        boxShadow: '0 8px 30px color-mix(in srgb, var(--cc-shadow-base) 8%, transparent)', border: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {[['iphone', '🍎 iPhone'], ['android', '🤖 Android']].map(([key, label]) => (
            <button key={key} onClick={() => setInstallPlatform(key)} style={{
              flex: 1, padding: '10px 8px', borderRadius: 12, fontWeight: 800, fontSize: '0.8125rem', cursor: 'pointer',
              background: installPlatform === key ? 'var(--teal,var(--cc-accent-strong))' : 'var(--bg,var(--cc-background))',
              color: installPlatform === key ? 'var(--cc-on-primary)' : 'var(--text)',
              border: `1.5px solid ${installPlatform === key ? 'var(--teal,var(--cc-accent-strong))' : 'var(--border)'}`,
              boxShadow: installPlatform === key ? '0 3px 10px color-mix(in srgb, var(--cc-accent-strong) 30%, transparent)' : 'none',
            }}>{label}</button>
          ))}
        </div>

        {installPlatform === 'iphone' ? (
          <ol style={{ margin: 0, paddingLeft: 22, color: 'var(--text)', fontSize: '0.875rem', lineHeight: 2, fontFamily: 'var(--font)', fontWeight: 600 }}>
            <li>Open Community Connect in <strong>Safari</strong></li>
            <li>Open <strong>Share</strong> (sometimes inside the page menu)</li>
            <li>Tap <strong>"Add to Home Screen"</strong></li>
            <li>If shown, enable <strong>Open as Web App</strong>, then tap <strong>Add</strong></li>
          </ol>
        ) : (
          <ol style={{ margin: 0, paddingLeft: 22, color: 'var(--text)', fontSize: '0.875rem', lineHeight: 2, fontFamily: 'var(--font)', fontWeight: 600 }}>
            <li>Open in <strong>Chrome</strong></li>
            <li>Tap <strong>⋮ menu</strong> top right</li>
            <li>Choose <strong>Install and create shortcut</strong> or <strong>Add to Home screen</strong></li>
            <li>Tap <strong>Install</strong> ✅</li>
          </ol>
        )}

        <div style={{ marginTop: 14, padding: '10px 14px', background: 'var(--teal-l,var(--cc-accent-soft))',
          borderRadius: 10, fontSize: '0.75rem', color: 'var(--muted)', lineHeight: 1.5, fontWeight: 600 }}>
          Previously visited screens may be available offline. Fresh information, sign-in and account actions need an internet connection.
        </div>
        <p><a href="/install.html">Installation help and existing store apps</a></p>
      </div>
    </div>
  );
}
