import React, { useState } from 'react';

// Install page — same content/style as the original install modal.
export default function InstallApp() {
  const [installPlatform, setInstallPlatform] = useState('iphone');

  return (
    <div style={{ padding: 16, maxWidth: 460, margin: '0 auto' }}>
      <div style={{
        background: 'var(--card,white)', borderRadius: 22, padding: 24,
        boxShadow: '0 8px 30px rgba(0,0,0,0.08)', border: '1px solid var(--border)',
      }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 18, fontFamily: 'var(--font)', fontWeight: 900 }}>
          📲 Install App
        </h2>

        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {[['iphone', '🍎 iPhone'], ['android', '🤖 Android']].map(([key, label]) => (
            <button key={key} onClick={() => setInstallPlatform(key)} style={{
              flex: 1, padding: '10px 8px', borderRadius: 12, fontWeight: 800, fontSize: 13, cursor: 'pointer',
              background: installPlatform === key ? 'var(--teal,#0f766e)' : 'var(--bg,#f8f9fa)',
              color: installPlatform === key ? 'white' : 'var(--text)',
              border: `1.5px solid ${installPlatform === key ? 'var(--teal,#0f766e)' : 'var(--border)'}`,
              boxShadow: installPlatform === key ? '0 3px 10px rgba(15,118,110,0.3)' : 'none',
            }}>{label}</button>
          ))}
        </div>

        {installPlatform === 'iphone' ? (
          <ol style={{ margin: 0, paddingLeft: 22, color: 'var(--text)', fontSize: 14, lineHeight: 2, fontFamily: 'var(--font)', fontWeight: 600 }}>
            <li>Open in <strong>Safari</strong> (not Chrome)</li>
            <li>Tap <strong>Share ⬆️</strong> at the bottom</li>
            <li>Tap <strong>"Add to Home Screen"</strong></li>
            <li>Tap <strong>Add</strong> ✅</li>
          </ol>
        ) : (
          <ol style={{ margin: 0, paddingLeft: 22, color: 'var(--text)', fontSize: 14, lineHeight: 2, fontFamily: 'var(--font)', fontWeight: 600 }}>
            <li>Open in <strong>Chrome</strong></li>
            <li>Tap <strong>⋮ menu</strong> top right</li>
            <li>Tap <strong>"Add to Home Screen"</strong></li>
            <li>Tap <strong>Install</strong> ✅</li>
          </ol>
        )}

        <div style={{ marginTop: 14, padding: '10px 14px', background: 'var(--teal-l,#e6f4f1)',
          borderRadius: 10, fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, fontWeight: 600 }}>
          💡 Loads instantly, works offline, feels like a native app.
        </div>
      </div>
    </div>
  );
}
