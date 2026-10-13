import React from 'react';
import { Share2, Route, Mail, Radio, Bell, CalendarDays as CalendarSync, Soup, Pencil, FolderPen, Copy, Trash2, ListX, Youtube } from 'lucide-react';
import '../styles/event-card.css';

const ICONS = { share:Share2, directions:Route, contact:Mail, live:Radio, reminder:Bell, calendar:CalendarSync,
  niaz:Soup, edit:Pencil, editSeries:FolderPen, copy:Copy, delete:Trash2, deleteSeries:ListX };
export default function EventActionPanel({ actions, handlers }) {
  return <div className="event-action-panel" role="group" aria-label="Event actions" onClick={event => event.stopPropagation()}>
    {actions.map(action => {
      const Icon = action.label === 'Watch on YouTube' ? Youtube : ICONS[action.id];
      return <button key={action.id} type="button" className={`event-action event-action-${action.id}`} disabled={action.disabled}
        aria-label={action.label} aria-description={action.reason || undefined} title={action.reason || action.label}
        onClick={event => { if (!action.disabled) handlers[action.id]?.(event); }}>
        <span className="event-action-bubble"><Icon size={22} strokeWidth={1.7} aria-hidden="true" /></span>
        <span className="event-action-label">{action.label}</span>
      </button>;
    })}
  </div>;
}
