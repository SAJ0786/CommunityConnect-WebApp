import React from 'react';
import HorizontalStrip from './HorizontalStrip';
import '../styles/event-quick-access.css';
import { Map, List, Radio, Moon, CalendarDays, ClipboardList } from 'lucide-react';
import { REGISTRATION_ENABLED } from '../config/releaseGates.mjs';
export default function EventQuickAccess({ viewMode, setViewMode, setPage, isGuest, registrationOnly = false, onRegistrationOnly }) {
  const items = [
    ...(REGISTRATION_ENABLED && onRegistrationOnly ? [{ label: registrationOnly ? 'All events' : 'Registration only', accessibleLabel: registrationOnly ? 'All events' : 'Registration only events', Icon: ClipboardList, action: () => onRegistrationOnly(!registrationOnly), pressed: registrationOnly }] : []),
    { label: viewMode === 'map' ? 'List' : 'Map', Icon: viewMode === 'map' ? List : Map, action: () => setViewMode(viewMode === 'map' ? 'list' : 'map'), restricted: isGuest },
    { label: 'Live', Icon: Radio, action: () => setPage('streams') },
    { label: 'Hijri', Icon: Moon, action: () => setPage('hijri-calendar') },
    { label: 'Calendar', Icon: CalendarDays, action: () => setPage('calendar') },
  ];
  return <section className="cc-quick-access" aria-label="Quick access"><h2>Quick access</h2><div className="cc-quick-panel"><HorizontalStrip label="Quick access" className="cc-fit-strip cc-quick-options">{items.map(({label,accessibleLabel,Icon,action,restricted,pressed}) => <button type="button" key={label} className={pressed !== undefined ? 'cc-registration-filter' : undefined} onClick={action} aria-label={accessibleLabel || label} aria-pressed={pressed} disabled={restricted} title={restricted ? 'Sign in to use the map' : undefined}><span className="cc-quick-icon"><Icon size={23} aria-hidden="true"/></span><span className="cc-quick-label">{label}</span></button>)}</HorizontalStrip></div></section>;
}
