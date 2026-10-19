import React, { useState, useEffect } from 'react';
import { Bell, Menu } from 'lucide-react';
import AccountMenu from './AccountMenu';
import { listenBellUnread } from '../services/notificationService';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase/firebase';

// Minimal header shown on auth/login page
function MinimalHeader() {
  return (
    <header className="auth-header" style={{
      background: 'var(--card,var(--cc-surface))',
      padding: '14px 18px 12px',
      borderBottom: '1px solid var(--border)',
      boxShadow: 'var(--shadow-sm)',
      }}>
      <img className="auth-header-logo" src="/logo.png" alt="Community Connect Australia" />
      <div className="auth-header-title-wrap">
        <h1 className="auth-header-title">Community Connect Australia</h1>
        <div className="auth-header-rule" aria-hidden="true" />
      </div>
      <div className="auth-header-spacer" aria-hidden="true" />
    </header>
  );
}

export default function Header({ user, profile, page, setPage, isGuest, showOnly = false, onDirectoryCommand }) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  useEffect(() => { setUnread(0); if (!isGuest && user?.uid && !user.isAnonymous) return listenBellUnread(user.uid, setUnread, () => setUnread(0)); }, [user?.uid, user?.isAnonymous, isGuest]);
  const directory = page === 'businesses';
  const openMenu = () => onDirectoryCommand ? onDirectoryCommand('menu') : setOpen(true);
  const openNotifications = () => onDirectoryCommand ? onDirectoryCommand('notifications') : setPage('notifications');
  const logout = async () => {
    try { localStorage.removeItem('socialLoginStarted'); await signOut(auth); setOpen(false); }
    catch { window.alert('Unable to sign out. Please try again.'); }
  };
  useEffect(() => {
    const handler = event => setOpen(Boolean(event.detail?.open));
    window.addEventListener('community-events-walkthrough-menu', handler);
    return () => window.removeEventListener('community-events-walkthrough-menu', handler);
  }, []);
  if (showOnly) return <MinimalHeader/>;
  return <><header className="cc-modern-header">
    <div className="cc-brand"><img src="/logo-transparent.png" alt="Community Connect Australia"/><div><small>COMMUNITY CONNECT</small><strong>{directory ? 'Business Directory' : 'Events'}</strong></div></div>
    <button className="cc-header-menu" data-walkthrough-target="top-hamburger" aria-label="Menu" aria-haspopup="dialog" onClick={openMenu}><Menu size={23}/><span>Menu</span></button>
    <button className="cc-icon-button cc-bell-button" data-walkthrough-target="top-bell" aria-label={isGuest ? 'Notifications require sign in' : 'Notifications'} disabled={isGuest} onClick={openNotifications}><Bell size={22}/>{unread > 0 && <span className="cc-bell-count" aria-label={`${unread} unread notifications`}>{unread > 99 ? '99+' : unread}</span>}</button>
  </header><AccountMenu open={open} onClose={() => setOpen(false)} directory={directory} user={user} profile={profile} isGuest={isGuest} onSignOut={logout} onNavigate={setPage}/></>;
}
