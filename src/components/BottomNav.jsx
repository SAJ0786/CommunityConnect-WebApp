import React from 'react';

export default function BottomNav({ page, setPage, isGuest }) {
  // Always show bottom nav — even for guests (greyed out for restricted items)
  const item = (key, icon, label, disabled = false, target = null) => {
    const active = !disabled && page === key;
    return (
      <button
        data-walkthrough-target={target || undefined}
        onClick={() => { if (!disabled) setPage(key); }}
        title={disabled ? 'Sign in to access' : undefined}
        style={{
          flex: 1, background: 'none', border: 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
          padding: '6px 0', boxShadow: 'none',
          color: disabled ? '#c8d5d3' : active ? 'var(--teal,#0f766e)' : 'var(--muted,#7a8a87)',
          opacity: disabled ? 0.5 : 1,
        }}>
        <span style={{ fontSize: '1.1875rem', lineHeight: 1 }}>{icon}</span>
        <span style={{ fontSize: '0.6875rem', fontWeight: active ? 800 : 600 }}>{label}</span>
      </button>
    );
  };

  return (
    <>
      <div className="mobile-bottom-nav-spacer" style={{ height: 'calc(66px + env(safe-area-inset-bottom))' }} />
      <nav className="mobile-bottom-nav" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 40,
        height: 'calc(66px + env(safe-area-inset-bottom))',
        paddingBottom: 'env(safe-area-inset-bottom)',
        background: 'white', borderTop: '1px solid var(--border,#e8edec)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-around',
        boxShadow: '0 -2px 16px rgba(0,0,0,0.06)',
        maxWidth: 1200, margin: '0 auto',
      }}>
        {item('home', '\u{1F3E0}', 'Home', false, 'bottom-home')}
        {item('my',   '\u{1F4C5}', 'My Events', isGuest, 'bottom-my-events')}

        {/* Center FAB — Add Event */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center' }}>
          <button
            data-walkthrough-target="bottom-add"
            onClick={() => { if (!isGuest) setPage('add'); }}
            aria-label="Add Event"
            title={isGuest ? 'Sign in to add events' : undefined}
            style={{
              width: 54, height: 54, borderRadius: '50%', marginTop: -26,
              background: isGuest
                ? 'linear-gradient(135deg,#a8c5c2,#8fb3b0)'
                : 'linear-gradient(135deg,#16a34a,#0f766e)',
              border: '4px solid white', cursor: isGuest ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', fontSize: '1.875rem', fontWeight: 300, lineHeight: 1,
              boxShadow: isGuest
                ? '0 4px 12px rgba(0,0,0,0.15)'
                : '0 6px 18px rgba(22,163,74,0.45)',
              padding: 0, opacity: isGuest ? 0.6 : 1,
            }}>+</button>
          <span style={{ fontSize: '0.6875rem', fontWeight: 800, marginTop: 1,
            color: isGuest ? '#c8d5d3' : 'var(--teal,#0f766e)' }}>
            Add Event
          </span>
        </div>

        {item('favourites', '\u2764\uFE0F', 'Favourites', isGuest, 'bottom-favourites')}

        {/* Profile is always present and remains unavailable to guests. */}
        {item('profile', '\u{1F464}', 'Profile', isGuest, 'bottom-profile')}
      </nav>
    </>
  );
}
