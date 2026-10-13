import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, UserRound, Bell, Inbox, ShieldCheck, Share2, CircleHelp, Heart, Home, CalendarDays, Plus, Search, Moon, Video, Download, ChevronRight, LogOut } from 'lucide-react';
import { useDialogFocus } from '../utils/useDialogFocus';
import { accountItems, eventExploreItems, eventWorkspaceAccountKeys, userInitials } from '../utils/navigation.mjs';
import '../styles/navigation.css';
import { LEGAL_URLS } from '../config/legal.mjs';
const icons = { user: UserRound, bell: Bell, inbox: Inbox, shield: ShieldCheck, share: Share2, help: CircleHelp, heart: Heart, home: Home, calendar: CalendarDays, plus: Plus, search: Search, moon: Moon, video: Video, download: Download };
export default function AccountMenu({ open, onClose, directory = false, profile, user, isGuest = false, onNavigate, onSignOut, profileAvailable = true }) {
  const ref = useRef(null);
  const [notice, setNotice] = useState('');
  const [help, setHelp] = useState(false);
  const [position, setPosition] = useState({});
  useLayoutEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const place = () => {
      const anchor = document.querySelector('.cc-header-menu');
      if (!anchor || !window.matchMedia('(min-width: 900px)').matches) { setPosition({}); return; }
      const bounds = anchor.getBoundingClientRect();
      const width = Math.min(360, window.innerWidth - 24);
      const top = Math.max(12, Math.min(bounds.bottom + 8, window.innerHeight - 100));
      const left = Math.max(12, Math.min(bounds.right - width, window.innerWidth - width - 12));
      setPosition({ '--account-menu-left': `${left}px`, '--account-menu-top': `${top}px`, '--account-menu-width': `${width}px`, '--account-menu-height': `${Math.max(0, window.innerHeight - top - 12)}px` });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open]);
  useDialogFocus(ref, open, onClose);
  useEffect(() => {
    if (!open) return;
    setNotice(''); setHelp(false);
  }, [open]);
  if (!open) return null;
  const select = async key => {
    if (key === 'help') { setHelp(value => !value); return; }
    if (key === 'share-app') {
      const url = 'https://communityconnect.siza.info/';
      try {
        if (navigator.share) await navigator.share({ title: 'Community Connect Australia', url });
        else { await navigator.clipboard.writeText(url); setNotice('App link copied.'); }
      } catch (error) { if (error.name !== 'AbortError') setNotice('Share this link: ' + url); }
      return;
    }
    if (onNavigate?.(key) !== false) onClose();
  };
  const rows = items => items.map(item => {
    const Icon = icons[item.icon];
    return <button className={`cc-menu-row ${!directory && eventWorkspaceAccountKeys.includes(item.key) ? "cc-event-menu-tool" : ""}`} key={item.key} onClick={() => select(item.key)}>
      <span className={`cc-menu-icon tone-${item.icon}`}><Icon size={21} aria-hidden="true"/></span>
      <span>{item.label}</span><ChevronRight size={17} aria-hidden="true"/>
    </button>;
  });
  return createPortal(<div className="cc-menu-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="cc-account-menu" style={position} ref={ref} role="dialog" aria-modal="true" aria-labelledby="cc-menu-title" tabIndex={-1}>
      <div className="cc-menu-heading"><div><h2 id="cc-menu-title">Menu</h2><p>Account, services and app settings</p></div><button className="cc-icon-button" aria-label="Close menu" onClick={onClose}><X size={22}/></button></div>
      <div className="cc-menu-identity"><span className="cc-avatar">{userInitials(profile, user, isGuest)}</span><div><strong>{isGuest ? 'Guest' : profile?.fullName || user?.displayName || 'Member'}</strong><p>{isGuest ? 'Sign in to use member tools' : [profile?.role === 'superAdmin' ? 'Super Admin' : profile?.role === 'admin' ? 'Admin' : 'Member', profile?.adminCity || profile?.defaultCity].filter(Boolean).join(' · ')}</p></div></div>
      <nav aria-label={directory ? 'Business account menu' : 'Events account menu'}>{rows(accountItems({ directory, guest: isGuest, role: profile?.role }).filter(item => profileAvailable || item.key !== 'profile'))}</nav>
      {help && <div className="cc-help-links"><a href={LEGAL_URLS.privacy} target="_blank" rel="noopener noreferrer">Privacy policy</a><a href={LEGAL_URLS.terms} target="_blank" rel="noopener noreferrer">Terms of use</a><p>Use the Events or Business Directory switch to change services. Your shortcuts stay available in Menu and the mobile bottom bar.</p></div>}
      {!directory && <div className="cc-mobile-event-shortcuts"><h3 className="cc-menu-section-title">Events shortcuts</h3><nav aria-label="More Events shortcuts">{rows(eventExploreItems.filter(item => !isGuest || !item.member))}</nav></div>}
      {notice && <p role="status" className="cc-menu-notice">{notice}</p>}
      {onSignOut && <button className="cc-menu-row cc-sign-out" onClick={onSignOut}><LogOut size={21}/><span>{isGuest ? 'Sign in / Create account' : 'Sign Out'}</span></button>}
    </section>
  </div>, document.body);
}
