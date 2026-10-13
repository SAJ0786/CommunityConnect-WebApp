import React from 'react';
import { Home, CalendarDays, Plus, Heart, Tags, Store, Menu } from 'lucide-react';
import { navigationTabs, userInitials } from '../utils/navigation.mjs';
import '../styles/navigation.css';
const icons = { home: Home, my: CalendarDays, add: Plus, favourites: Heart, promotions: Tags, listing: Plus, owner: Store, menu: Menu };
export default function BottomNav({ page, setPage, isGuest = false, directory = false, profile, user, onOpenMenu }) {
  return <><div className="mobile-bottom-nav-spacer"/><nav className="mobile-bottom-nav" aria-label={directory ? 'Business Directory shortcuts' : 'Events shortcuts'}>
    {navigationTabs(directory).map(item => {
      const Icon = icons[item.key], disabled = isGuest && item.member;
      return <button key={item.key} type="button" className={item.primary ? 'cc-tab cc-tab-primary' : 'cc-tab'} disabled={disabled} title={disabled ? 'Sign in to access' : undefined}
        aria-current={page === item.key ? 'page' : undefined} data-walkthrough-target={item.target}
        onClick={() => item.key === 'menu' ? onOpenMenu?.() : setPage(item.key)}>
        <span className="cc-tab-icon" aria-hidden="true">{Icon ? <Icon size={22} strokeWidth={1.8}/> : userInitials(profile, user, isGuest)}</span><span className="cc-tab-label">{item.label}</span>
      </button>;
    })}</nav></>;
}
