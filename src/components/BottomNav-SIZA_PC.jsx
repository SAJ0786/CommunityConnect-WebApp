import React, { useState, useEffect } from 'react';

// Detect if running as an installed PWA (standalone display mode)
function useIsStandalone() {
  const [standalone, setStandalone] = useState(() => {
    try {
      return window.matchMedia?.('(display-mode: standalone)')?.matches
        || window.navigator.standalone === true; // iOS Safari
    } catch { return false; }
  });
  useEffect(() => {
    const mq = window.matchMedia?.('(display-mode: standalone)');
    if (!mq) return;
    const handler = e => setStandalone(e.matches);
    mq.addEventListener?.('change', handler);
    return () => mq.removeEventListener?.('change', handler);
  }, []);
  return standalone;
}

// Bottom navigation — 5 items.
// 5th slot: "Install" normally, but "Profile" when already running as a PWA.
export default function BottomNav({ page, setPage, isGuest }) {
  const isStandalone = useIsStandalone();
  if (isGuest) return null;

  const item = (key, icon, label) => {
    const active = page === key;
    return (
      <button onClick={() => setPage(key)} style={{
        flex: 1, background: 'none', border: 'none', cursor: 'pointer',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
        padding: '6px 0', boxShadow: 'none',
        color: active ? 'var(--teal,#0f766e)' : 'var(--muted,#7a8a87)',
      }}>
        <span style={{ fontSize: 19, lineHeight: 1 }}>{icon}</span>
        <span style={{ fontSize: 9.5, fontWeight: active ? 800 : 600 }}>{label}</span>
      </button>
    );
  };

  return (
    <>
      {/* Spacer so content isn't hidden behind the fixed bar */}
      <div style={{ height: 'calc(66px + env(safe-area-inset-bottom))' }} />

      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 40,
        height: 'calc(66px + env(safe-area-inset-bottom))',
        paddingBottom: 'env(safe-area-inset-bottom)',
        background: 'white', borderTop: '1px solid var(--border,#e8edec)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-around',
        boxShadow: '0 -2px 16px rgba(0,0,0,0.06)',
        maxWidth: 1200, margin: '0 auto',
      }}>
        {item('home', '\u{1F3E0}', 'Home')}
        {item('my', '\u{1F4C5}', 'My Events')}

        {/* Center FAB — Add Event */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center' }}>
          <button onClick={() => setPage('add')} aria-label="Add Event" style={{
            width: 54, height: 54, borderRadius: '50%', marginTop: -26,
            background: 'linear-gradient(135deg,#16a34a,#0f766e)',
            border: '4px solid white', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', fontSize: 30, fontWeight: 300, lineHeight: 1,
            boxShadow: '0 6px 18px rgba(22,163,74,0.45)', padding: 0,
          }}>+</button>
          <span style={{ fontSize: 9.5, fontWeight: 800, color: 'var(--teal,#0f766e)', marginTop: 1 }}>
            Add Event
          </span>
        </div>

        {item('favourites', '\u2764\uFE0F', 'Favourites')}

        {/* 5th slot: Profile when installed as PWA, otherwise Install */}
        {isStandalone
          ? item('profile', '\u{1F464}', 'Profile')
          : item('install', '\u2B07\uFE0F', 'Install')}
      </nav>
    </>
  );
}
