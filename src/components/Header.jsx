import React, { useState, useEffect, useRef } from 'react';
import { APP_NAME, TAGLINE, ROLES } from '../utils/constants';
import { isAdminRole } from '../utils/permissions';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase/firebase';
import { compareEventsByDateTime } from '../services/dateUtils';

const AUTH_ITEMS = [
  { key: 'home',       label: '🏠 Home' },
  { key: 'search',     label: '🤖 AI Search' },
  { key: 'bulkshare',  label: '📤 Bulk Share Events', adminOnly: true },
  { key: 'calendar',   label: '📅 Calendar' },
  { key: 'hijri-calendar', label: '🌙 Hijri Calendar' },
  { key: 'streams',    label: '▶ Streamed Videos' },
  { key: 'profile',    label: '👤 Profile & Settings' },
];
const ADMIN_ITEMS = [
  { key: 'admin',     label: '🛠 Admin Dashboard' },
];
const GUEST_ITEMS = [
  { key: 'home',       label: '🏠 Home' },
  { key: 'search',     label: '🤖 AI Search' },
  { key: 'bulkshare',  label: '📤 Bulk Share Events', disabled: true },
  { key: 'calendar',   label: '📅 Calendar' },
  { key: 'hijri-calendar', label: '🌙 Hijri Calendar' },
  { key: 'streams',    label: '▶ Streamed Videos' },
  { key: 'profile',    label: '👤 Profile & Settings', disabled: true },
  { key: 'admin',      label: '🛠 Admin Dashboard', disabled: true },
];

// Minimal header shown on auth/login page
function MinimalHeader() {
  return (
    <header className="auth-header" style={{
      background: 'var(--card,#fff)',
      padding: '14px 18px 12px',
      borderBottom: '1px solid var(--border)',
      boxShadow: 'var(--shadow-sm)',
      }}>
      <img className="auth-header-logo" src="/logo.png" alt="Community Events Australia" />
      <div className="auth-header-title-wrap">
        <h1 className="auth-header-title">Community Events Australia</h1>
        <div className="auth-header-rule" aria-hidden="true" />
      </div>
      <div className="auth-header-spacer" aria-hidden="true" />
    </header>
  );
}

export default function Header({ user, profile, page, setPage, isGuest, showOnly = false, events = [], onOpenEvent }) {
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

  useEffect(() => {
    const handler = event => {
      setOpen(Boolean(event.detail?.open));
    };
    window.addEventListener('community-events-walkthrough-menu', handler);
    return () => window.removeEventListener('community-events-walkthrough-menu', handler);
  }, []);

  const navTo = item => {
    if (item?.disabled) return;
    setPage(item.key);
    setOpen(false);
  };

  const formatLocalDate = d => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const timeToMinutes = value => {
    const match = String(value || '').match(/^(\d{1,2}):(\d{2})/);
    if (!match) return null;
    return Number(match[1]) * 60 + Number(match[2]);
  };

  // Events from now through tomorrow for the notification bell
  const todayStr = formatLocalDate(new Date());
  const tomorrowStr = (() => {
    const d = new Date(); d.setDate(d.getDate() + 1);
    return formatLocalDate(d);
  })();
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const notificationEvents = (events || [])
    .filter(e => {
      if (e.eventDate === tomorrowStr) return true;
      if (e.eventDate !== todayStr) return false;
      const eventMinutes = timeToMinutes(e.endTime || e.startTime);
      return eventMinutes === null || eventMinutes >= nowMinutes;
    })
    .sort(compareEventsByDateTime);
  const notificationSections = [
    { key: 'today', title: 'Today', events: notificationEvents.filter(e => e.eventDate === todayStr) },
    { key: 'tomorrow', title: 'Tomorrow', events: notificationEvents.filter(e => e.eventDate === tomorrowStr) },
  ].filter(section => section.events.length > 0);

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
      <header className="app-header" style={{
        background: 'var(--bg,#f8f9fa)',
        padding: '12px 14px 10px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        position: 'sticky', top: 0, zIndex: 20,
        borderBottom: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)',
      }}>
        {/* Hamburger (left) */}
        {user ? (
          <button data-walkthrough-target="top-hamburger" onClick={() => setOpen(o => !o)} aria-label="Menu" style={{
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, flex: 1.4, justifyContent: 'center', minWidth: 0 }}>
          <img src="/logo-transparent.png" alt="logo" style={{
            width: 50, height: 50, objectFit: 'contain', flexShrink: 0,
            filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.2))',
          }} />
          <div style={{ minWidth: 0 }}>
            <div className="app-header-brand-title">Community<br />Events Australia</div>
          </div>
        </div>

        {/* Notification bell (right) */}
        {user && !isGuest ? (
          <button
            data-walkthrough-target="top-bell"
            onMouseDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); setNotifOpen(o => !o); }}
            aria-label="Notifications"
            style={{
            background: 'white', border: '1px solid var(--border)',
            borderRadius: 12, width: 42, height: 42, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', boxShadow: 'none', padding: 0, position: 'relative', fontSize: '1.125rem',
          }}>
            🔔
            {notificationEvents.length > 0 && (
              <span style={{ position: 'absolute', top: -4, right: -4,
                background: '#dc2626', color: 'white', fontSize: '0.5625rem', fontWeight: 800,
                minWidth: 16, height: 16, borderRadius: 8, display: 'flex',
                alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>
                {notificationEvents.length}
              </span>
            )}
          </button>
        ) : user && isGuest ? (
          <button
            data-walkthrough-target="top-bell"
            aria-label="Notifications require sign in"
            disabled
            style={{
              background: 'white', border: '1px solid var(--border)',
              borderRadius: 12, width: 42, height: 42, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'not-allowed', boxShadow: 'none', padding: 0,
              position: 'relative', fontSize: '1.125rem', opacity: 0.45,
            }}>
            🔔
          </button>
        ) : <div style={{ width: 42 }} />}
      </header>

      {/* ── Notification panel ── */}
      {notifOpen && (
        <div ref={notifRef} onMouseDown={e => e.stopPropagation()} style={{
          position: 'fixed', top: 70, right: 12, width: 270, zIndex: 30,
          background: 'white', borderRadius: 16, border: '1px solid var(--border)',
          boxShadow: '0 12px 40px rgba(0,0,0,0.22)', overflow: 'hidden',
        }}>
          <div style={{ padding: '13px 15px', borderBottom: '1px solid var(--border)',
            fontWeight: 800, fontSize: '0.8125rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            Upcoming Alerts
            <span style={{ color: '#dc2626', fontSize: '0.75rem' }}>{notificationEvents.length}</span>
          </div>
          {notificationEvents.length === 0 ? (
            <div style={{ padding: '18px 15px', fontSize: '0.78125rem', color: 'var(--muted)', textAlign: 'center' }}>
              No events from now through tomorrow.
            </div>
          ) : notificationSections.map(section => (
            <div key={section.key}>
              <div style={{
                padding: '9px 15px',
                background: '#f8fafc',
                borderBottom: '1px solid #e5e7eb',
                color: '#0f766e',
                fontSize: '0.71875rem',
                fontWeight: 900,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <span>{section.title}</span>
                <span style={{ color: '#64748b', fontSize: '0.6875rem' }}>{section.events.length}</span>
              </div>
              {section.events.map(e => (
                <div key={e.id} onClick={() => { onOpenEvent?.(e.id); setNotifOpen(false); }}
                  style={{ padding: '11px 15px', borderBottom: '1px solid #f1f5f4',
                    display: 'flex', gap: 10, cursor: 'pointer' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%',
                    background: e.isLive ? 'var(--red)' : 'var(--green,#16a34a)', marginTop: 5, flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '0.78125rem', fontWeight: 700, whiteSpace: 'nowrap',
                      overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {(e.eventTypeDisplay || e.eventType)} - {e.hostName}
                    </div>
                    <div style={{ fontSize: '0.65625rem', color: 'var(--muted)' }}>
                      {e.startTime}{e.address?.suburb ? ` - ${e.address.suburb}` : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* ── Dropdown menu ── */}
      {open && (
        <div ref={menuRef} className="app-menu-panel" style={{
          position: 'fixed', top: 82, left: 14, width: 250,
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
            <button
              className="app-menu-item"
              key={item.key}
              onClick={() => navTo(item)}
              disabled={item.disabled}
              title={item.disabled ? 'Sign in to access' : undefined}
              style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '13px 18px', border: 'none',
              background: page === item.key ? 'var(--red-l,#e6f4f1)' : 'transparent',
              color: item.disabled ? 'var(--muted,#7b8794)' : (page === item.key ? 'var(--red)' : 'var(--text)'),
              fontWeight: page === item.key ? 900 : 600,
              fontSize: '0.875rem', cursor: item.disabled ? 'not-allowed' : 'pointer',
              borderBottom: '1px solid var(--border)',
              boxShadow: 'none',
              opacity: item.disabled ? 0.58 : 1,
            }}>
              {item.label}{item.disabled ? '  (sign in)' : ''}
            </button>
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
