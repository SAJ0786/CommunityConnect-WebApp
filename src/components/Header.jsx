import React, { useState, useEffect, useRef } from 'react';
import { APP_NAME, TAGLINE, ROLES } from '../utils/constants';
import { isAdminRole } from '../utils/permissions';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase/firebase';

const AUTH_ITEMS = [
  { key: 'home',       label: '🏠 Home' },
  { key: 'search',     label: '🤖 AI Search' },
  { key: 'add',        label: '➕ Add Event' },
  { key: 'series',     label: '📅 Add Series Events' },
  { key: 'favourites', label: '⭐ Favourites' },
  { key: 'calendar',   label: '📅 Calendar Sync' },
  { key: 'my',         label: '📋 My Events' },
  { key: 'profile',    label: '👤 Profile & Settings' },
];
const ADMIN_ITEMS = [
  { key: 'admin',     label: '🛠 Admin Dashboard' },
  { key: 'bulkshare', label: '📤 Bulk Share Events' },
];
const GUEST_ITEMS = [
  { key: 'home',   label: '🏠 Home' },
  { key: 'search', label: '🤖 AI Search' },
];

// Minimal header shown on auth/login page
function MinimalHeader() {
  return (
    <header style={{
      background: 'var(--bg,#f8f9fa)',
      padding: '14px 18px 12px',
      display: 'flex', alignItems: 'center', gap: 14,
      borderBottom: '1px solid var(--border)',
      boxShadow: 'var(--shadow-sm)',
    }}>
      <img src="/logo.png" alt="logo" style={{
        width: 56, height: 56, borderRadius: 0,
        background: 'transparent', objectFit: 'contain', flexShrink: 0,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--text)', letterSpacing: '-0.3px', lineHeight: 1.1 }}>
          Community Events
        </div>
        <div style={{ height: 2, background: 'var(--red,#c0392b)', borderRadius: 2, margin: '3px 0' }} />
        <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--muted)', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
          Create &nbsp;–&nbsp; Share &nbsp;–&nbsp; Connect
        </div>
      </div>
    </header>
  );
}

export default function Header({ user, profile, page, setPage, isGuest, showOnly = false }) {
  if (showOnly) return <MinimalHeader />;

  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  const displayName = profile?.fullName || user?.displayName || '';
  const email       = user?.email || '';

  useEffect(() => {
    const handler = e => {
      if (open && menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const navTo = key => { setPage(key); setOpen(false); };

  const items = isGuest
    ? GUEST_ITEMS
    : isAdminRole(profile?.role)
      ? [...AUTH_ITEMS, ...ADMIN_ITEMS]
      : AUTH_ITEMS;

  return (
    <>
      {/* ── Main header — same bg as page ── */}
      <header style={{
        background: 'var(--bg,#f8f9fa)',
        padding: '14px 18px 12px',
        display: 'flex', alignItems: 'center', gap: 14,
        position: 'sticky', top: 0, zIndex: 20,
        borderBottom: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)',
      }}>
        {/* Logo — transparent background, shadow only */}
        <img src="/logo-transparent.png" alt="logo" style={{
          width: 56, height: 56,
          objectFit: 'contain', flexShrink: 0,
          filter: 'drop-shadow(0 3px 8px rgba(0,0,0,0.25))',
        }} />

        {/* Title block */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 20, fontWeight: 900, color: 'var(--text)',
            letterSpacing: '-0.3px', lineHeight: 1.1, whiteSpace: 'nowrap',
          }}>
            Community Events
          </div>
          {/* Red divider line */}
          <div style={{ height: 2, background: 'var(--red,#c0392b)', borderRadius: 2, margin: '3px 0' }} />
          {/* Tagline — same width as title, small caps */}
          <div style={{
            fontSize: 10, fontWeight: 800, color: 'var(--muted)',
            letterSpacing: '0.5px', textTransform: 'uppercase', whiteSpace: 'nowrap',
          }}>
            Create &nbsp;–&nbsp; Share &nbsp;–&nbsp; Connect
          </div>
          {/* User info line */}
          {user && !isGuest && (
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {displayName ? <>{displayName} <span style={{ opacity: .7 }}>({email})</span></> : email}
            </div>
          )}
          {isGuest && (
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
              👀 Guest —{' '}
              <span style={{ cursor: 'pointer', color: 'var(--red)', fontWeight: 700, textDecoration: 'underline' }}
                onClick={() => signOut(auth)}>
                Login / Register
              </span>
            </div>
          )}
        </div>

        {/* Hamburger — red lines */}
        {user && (
          <button onClick={() => setOpen(o => !o)}
            aria-label="Menu"
            style={{
              background: 'var(--red-l,#fdf2f1)',
              border: '1.5px solid var(--red-m,#fadbd8)',
              borderRadius: 12, width: 42, height: 42,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: 4, cursor: 'pointer', flexShrink: 0,
              boxShadow: 'none', padding: 0,
            }}>
            {[0,1,2].map(i => (
              <div key={i} style={{
                height: 2, background: 'var(--red,#c0392b)',
                borderRadius: 2, width: i === 1 ? 14 : 18,
              }} />
            ))}
          </button>
        )}
      </header>

      {/* ── Dropdown menu ── */}
      {open && (
        <div ref={menuRef} style={{
          position: 'fixed', top: 82, right: 14, width: 250,
          background: 'var(--card,white)', border: '1px solid var(--border)',
          borderRadius: 20,
          boxShadow: '0 20px 60px rgba(26,26,46,0.16), 0 2px 8px rgba(26,26,46,0.08)',
          zIndex: 100, overflow: 'hidden',
        }}>
          {/* User info header */}
          <div style={{
            padding: '14px 18px',
            background: 'var(--red-l,#fdf2f1)',
            borderBottom: '1px solid var(--red-m,#fadbd8)',
          }}>
            {isGuest ? (
              <>
                <div style={{ fontWeight: 900, fontSize: 14, color: 'var(--red)' }}>Guest User</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Read-only access</div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 900, fontSize: 14, color: 'var(--red)' }}>{displayName || email}</div>
                {displayName && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{email}</div>}
                <div style={{ marginTop: 5 }}>
                  <span style={{
                    fontSize: 11, fontWeight: 800, padding: '3px 9px', borderRadius: 99,
                    background: 'var(--red-l,#fdf2f1)', color: 'var(--red)',
                    border: '1px solid var(--red-m,#fadbd8)',
                  }}>
                    {profile?.role === ROLES.SUPER_ADMIN ? '👑 Super Admin' :
                     profile?.role === ROLES.ADMIN        ? '🛠 Admin' : '👤 User'}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Nav items */}
          {items.map(item => (
            <button key={item.key} onClick={() => navTo(item.key)} style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '13px 18px', border: 'none',
              background: page === item.key ? 'var(--red-l,#fdf2f1)' : 'transparent',
              color: page === item.key ? 'var(--red)' : 'var(--text)',
              fontWeight: page === item.key ? 900 : 600,
              fontSize: 14, cursor: 'pointer',
              borderBottom: '1px solid var(--border)',
              boxShadow: 'none',
            }}>{item.label}</button>
          ))}

          {/* Guest login prompt */}
          {isGuest && (
            <button onClick={() => { try { localStorage.removeItem('socialLoginStarted'); } catch {} signOut(auth); setOpen(false); }} style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '13px 18px', border: 'none',
              background: 'var(--red-l,#fdf2f1)', color: 'var(--red)',
              fontWeight: 900, fontSize: 14, cursor: 'pointer', boxShadow: 'none',
            }}>🔑 Login / Create Account</button>
          )}

          {/* Sign out */}
          {!isGuest && (
            <button onClick={() => {
              try { localStorage.removeItem('socialLoginStarted'); } catch {}
              signOut(auth); setOpen(false);
            }} style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '13px 18px', border: 'none', background: 'transparent',
              color: 'var(--danger,#e74c3c)', fontWeight: 800,
              fontSize: 14, cursor: 'pointer', boxShadow: 'none',
            }}>🚪 Sign Out</button>
          )}
        </div>
      )}
    </>
  );
}
