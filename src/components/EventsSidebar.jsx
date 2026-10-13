import React from 'react';
import { Home, CalendarDays, Plus, Heart, Search, Moon, Video, Download, Bell, Inbox, ShieldCheck, Share2, CircleHelp } from 'lucide-react';
import { eventsSidebarItems } from '../utils/navigation.mjs';
import '../styles/navigation.css';

const icons = { home: Home, calendar: CalendarDays, plus: Plus, heart: Heart, search: Search, moon: Moon, video: Video, download: Download, bell: Bell, inbox: Inbox, shield: ShieldCheck, share: Share2 };

export default function EventsSidebar({ page, onNavigate, isGuest, profile }) {
  return <nav className="cc-events-sidebar" aria-label="Events workspace">
    {eventsSidebarItems({ guest:isGuest, role:profile?.role }).map(item => {
      const Icon = icons[item.icon];
      return <button key={item.key} type="button" className={item.key === 'add' ? 'cc-sidebar-add' : undefined}
        aria-current={(page === item.key || (page === 'edit' && item.key === 'my')) ? 'page' : undefined}
        onClick={() => onNavigate(item.key)}><Icon size={20} aria-hidden="true"/><span>{item.label}</span></button>;
    })}
    <a href="/support.html"><CircleHelp size={20} aria-hidden="true"/><span>Feedback and support</span></a>
  </nav>;
}
