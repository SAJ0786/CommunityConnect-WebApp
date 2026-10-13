import React from 'react';
import { Map, List, Radio, Moon, CalendarDays } from 'lucide-react';
export default function EventQuickAccess({ viewMode, setViewMode, setPage, isGuest }) {
  const items = [
    { label: viewMode === 'map' ? 'List' : 'Map', Icon: viewMode === 'map' ? List : Map, action: () => setViewMode(viewMode === 'map' ? 'list' : 'map'), restricted: isGuest },
    { label: 'Live', Icon: Radio, action: () => setPage('streams') },
    { label: 'Hijri', Icon: Moon, action: () => setPage('hijri-calendar') },
    { label: 'Calendar', Icon: CalendarDays, action: () => setPage('calendar') },
  ];
  return <section className="cc-quick-access" aria-label="Quick access"><h2>Quick access</h2><div>{items.map(({label,Icon,action,restricted}) => <button type="button" key={label} onClick={action} disabled={restricted} title={restricted ? 'Sign in to use the map' : undefined}><span><Icon size={23} aria-hidden="true"/></span>{label}</button>)}</div></section>;
}
