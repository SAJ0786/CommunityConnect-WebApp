import React, { useState, useEffect, useRef } from 'react';
import { APP_NAME, TAGLINE, ROLES } from '../utils/constants';
import { isAdminRole } from '../utils/permissions';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase/firebase';
import { compareEventsByDateTime } from '../services/dateUtils';

const AUTH_ITEMS = [
  { key: 'home',       label: '🏠 Home' },
  { key: 'search',     label: '🤖 AI Search' },
  { key: 'series',     label: '📅 Add Series Events' },
  { key: 'bulkshare',  label: '📤 Bulk Share Events', adminOnly: true },
  { key: 'calendar',   label: '📅 Calendar' },
  { key: 'profile',    label: '👤 Profile & Settings' },
];
const ADMIN_ITEMS = [
  { key: 'admin',     label: '🛠 Admin Dashboard' },
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
        <div style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--text)', letterSpacing: '-0.3px', lineHeight: 1.1 }}>
          Community Events
        </div>
        <div style={{ height: 2, background: 'var(--red,#0f766e)', borderRadius: 2, margin: '3px 0' }} />
        <div style={{ fontSize: '0.625rem', fontWeight: 800, color: 'var(--muted)', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
          Create &nbsp;–&nbsp; Share &nbsp;–&nbsp; Connect
        </div>
      </div>
    </header>
  );
}

export default function Header({ user, profile, page, setPage, isGuest, showOnly = false, events = [] }) {
  if (showOnly) return <MinimalHeader />;

  const [open, setOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const menuRef = useRef(null);
  const notifRef = useRef(null);

  const displayName = profile?.fullName || user?.displayName || '';
  const email       = user?.email || '';

  useEffect(() => {
    const handler = e => {
      if (open && menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
      if (notifOpen && notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, notifOpen]);

  const navTo = key => { setPage(key); setOpen(false); };

  // Tomorrow's events for the notification bell
  const tomorrowStr = (() => {
    const d = new Date(); d.setDate(d.getDate() + 1);
    const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), day = String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  })();
  const tomorrowEvents = (events || [])
    .filter(e => e.eventDate === tomorrowStr)
    .sort(compareEventsByDateTime);

  const isAdmin = isAdminRole(profile?.role);
  const items = isGuest
    ? GUEST_ITEMS
    : (isAdmin
        ? [...AUTH_ITEMS, ...ADMIN_ITEMS]
        : AUTH_ITEMS
      ).filter(it => !it.adminOnly || isAdmin);

  return (
    <>
      {/* ── Main header — hamburger left · brand center · bell right ── */}
      <header style={{
        background: 'var(--bg,#f8f9fa)',
        padding: '12px 14px 10px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        position: 'sticky', top: 0, zIndex: 20,
        borderBottom: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)',
      }}>
        {/* Hamburger (left) */}
        {user ? (
          <button onClick={() => setOpen(o => !o)} aria-label="Menu" style={{
            background: 'white', border: '1px solid var(--border)',
            borderRadius: 12, width: 42, height: 42, flexShrink: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: 4, cursor: 'pointer', boxShadow: 'none', padding: 0,
          }}>
            {[0,1,2].map(i => (
              <div key={i} style={{ height: 2.5, background: 'var(--teal,#0f766e)',
                borderRadius: 2, width: 18 }} />
            ))}
          </button>
        ) : <div style={{ width: 42 }} />}

        {/* Brand (center) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, flex: 1, justifyContent: 'center', minWidth: 0 }}>
          <img src="/logo-transparent.png" alt="logo" style={{
            width: 40, height: 40, objectFit: 'contain', flexShrink: 0,
            filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.2))',
          }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '0.9375rem', fontWeight: 900, color: 'var(--text)',
              lineHeight: 1.05, letterSpacing: '-0.2px' }}>
              Community<br/>Events Australia
            </div>
          </div>
        </div>

        {/* Notification bell (right) */}
        {user && !isGuest ? (
          <button onClick={() => setNotifOpen(o => !o)} aria-label="Notifications" style={{
            background: 'white', border: '1px solid var(--border)',
            borderRadius: 12, width: 42, height: 42, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', boxShadow: 'none', padding: 0, position: 'relative', fontSize: '1.125rem',
          }}>
            🔔
            {tomorrowEvents.length > 0 && (
              <span style={{ position: 'absolute', top: -4, right: -4,
                background: 'var(--red,#0f766e)', color: 'white', fontSize: '0.5625rem', fontWeight: 800,
                minWidth: 16, height: 16, borderRadius: 8, display: 'flex',
                alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>
                {tomorrowEvents.length}
              </span>
            )}
          </button>
        ) : <div style={{ width: 42 }} />}
      </header>

      {/* ── Notification panel ── */}
      {notifOpen && (
        <div ref={notifRef} style={{
          position: 'fixed', top: 70, right: 12, width: 270, zIndex: 30,
          background: 'white', borderRadius: 16, border: '1px solid var(--border)',
          boxShadow: '0 12px 40px rgba(0,0,0,0.22)', overflow: 'hidden',
        }}>
          <div style={{ padding: '13px 15px', borderBottom: '1px solid var(--border)',
            fontWeight: 800, fontSize: '0.8125rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            Tomorrow's Events
            <span style={{ color: 'var(--teal)', fontSize: '0.75rem' }}>{tomorrowEvents.length}</span>
          </div>
          {tomorrowEvents.length === 0 ? (
            <div style={{ padding: '18px 15px', fontSize: '0.78125rem', color: 'var(--muted)', textAlign: 'center' }}>
              No events scheduled for tomorrow.
            </div>
          ) : tomorrowEvents.map(e => (
            <div key={e.id} onClick={() => { setPage('home'); setNotifOpen(false); }}
              style={{ padding: '11px 15px', borderBottom: '1px solid #f1f5f4',
                display: 'flex', gap: 10, cursor: 'pointer' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%',
                background: e.isLive ? 'var(--red)' : 'var(--green,#16a34a)', marginTop: 5, flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.78125rem', fontWeight: 700, whiteSpace: 'nowrap',
                  overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {(e.eventTypeDisplay || e.eventType)} — {e.hostName}
                </div>
                <div style={{ fontSize: '0.65625rem', color: 'var(--muted)' }}>
                  {e.startTime}{e.address?.suburb ? ` · ${e.address.suburb}` : ''}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

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
            background: 'var(--red-l,#e6f4f1)',
            borderBottom: '1px solid var(--red-m,#b7d8d4)',
          }}>
            {isGuest ? (
              <>
                <div style={{ fontWeight: 900, fontSize: '0.875rem', color: 'var(--red)' }}>Guest User</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: 2 }}>Read-only access</div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 900, fontSize: '0.875rem', color: 'var(--red)' }}>{displayName || email}</div>
                {displayName && <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{email}</div>}
                <div style={{ marginTop: 5 }}>
                  <span style={{
                    fontSize: '0.6875rem', fontWeight: 800, padding: '3px 9px', borderRadius: 99,
                    background: 'var(--red-l,#e6f4f1)', color: 'var(--red)',
                    border: '1px solid var(--red-m,#b7d8d4)',
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
              background: page === item.key ? 'var(--red-l,#e6f4f1)' : 'transparent',
              color: page === item.key ? 'var(--red)' : 'var(--text)',
              fontWeight: page === item.key ? 900 : 600,
              fontSize: '0.875rem', cursor: 'pointer',
              borderBottom: '1px solid var(--border)',
              boxShadow: 'none',
            }}>{item.label}</button>
          ))}

          {/* Guest login prompt */}
          {isGuest && (
            <button onClick={() => { try { localStorage.removeItem('socialLoginStarted'); } catch {} signOut(auth); setOpen(false); }} style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '13px 18px', border: 'none',
              background: 'var(--red-l,#e6f4f1)', color: 'var(--red)',
              fontWeight: 900, fontSize: '0.875rem', cursor: 'pointer', boxShadow: 'none',
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
              fontSize: '0.875rem', cursor: 'pointer', boxShadow: 'none',
            }}>🚪 Sign Out</button>
          )}
        </div>
      )}
    </>
  );
}
