import React from 'react';
import { CalendarDays, ClipboardList, Heart, Home, Search, ShieldCheck, UserRound, Radio, Mail, PlusCircle, Moon, Download, Share2 } from 'lucide-react';
import '../styles/page-panel.css';

const pages = {
  home: ['Community events', 'Discover events and connect with your local community.', Home],
  add: ['Add an event', 'Bring your community together.', PlusCircle],
  edit: ['Edit event', 'Update your event details and poster.', CalendarDays],
  my: ['My Events', 'Events you created and your registrations. Registration events appear publicly after Superadmin approval.', CalendarDays],
  favourites: ['Favourites', 'Your saved community events. Save an event to find it here.', Heart],
  search: ['Find events', 'Explore events that matter to you.', Search],
  admin: ['Admin Dashboard', 'Manage your community with care.', ShieldCheck],
  profile: ['Profile & Settings', 'Your account and app preferences.', UserRound],
  calendar: ['Event calendar', 'Plan ahead with your community.', CalendarDays],
  'hijri-calendar': ['Hijri calendar', 'Dates, prayer times and quick conversion.', Moon],
  streams: ['Streamed videos', 'Stay connected with community broadcasts.', Radio],
  'host-inbox': ['Host Inbox', 'Conversations about your events.', Mail],
  notifications: ['Notifications', 'Your latest community updates.', Mail],
  registration: ['Event registration', 'Manage your event registration securely.', ClipboardList],
  'registration-create': ['Create registration event', 'Prepare your event and registration form for approval.', ClipboardList],
  install: ['Install App', 'Keep your community close.', Download],
  bulkshare: ['Share events', 'Filter events, select the ones you want, then share or copy.', Share2],
};

export default function PagePanel({ page, title, subtitle, Icon, headingId }) {
  const entry = pages[page] || ['Community Connect', 'Your community, connected.', Home];
  const Symbol = Icon || entry[2];
  return <section className="cc-page-panel" aria-label={title || entry[0]}>
    <span className="cc-page-panel-icon"><Symbol size={22} aria-hidden="true"/></span>
    <div><span className="cc-page-panel-eyebrow">COMMUNITY CONNECT</span><h1 id={headingId}>{title || entry[0]}</h1><p>{subtitle || entry[1]}</p></div>
  </section>;
}
