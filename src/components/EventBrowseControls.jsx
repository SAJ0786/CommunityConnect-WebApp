import React from 'react';
import BrowseStrip from './BrowseStrip';
import { availableEventTypes, eventTypeIcon } from '../utils/eventBrowseTypes.mjs';

const PRESETS = [
  { value: '', label: 'Upcoming', icon: '▦' },
  { value: 'nearby', label: 'Near Me', icon: '⌖' },
  { value: 'today', label: 'Today', icon: '☀' },
  { value: 'tomorrow', label: 'Tomorrow', icon: '◷' },
  { value: 'week', label: 'This Week', icon: '▤' },
  { value: 'month', label: 'This Month', icon: '▦' },
];
export default function EventBrowseControls({ events, period, category, onPeriod, onCategory, locationNote }) {
  const types = availableEventTypes(events, ['Prayers', 'Majlis', 'Milad']);
  return <section className="event-browse-controls" aria-label="Browse events">
    <BrowseStrip label="Event filters" items={PRESETS} value={period} onChange={onPeriod} />
    {locationNote && <p className="browse-note" role="status">{locationNote}</p>}
    <BrowseStrip label="Event types" categories value={category} onChange={onCategory}
      items={[{ value: '', label: 'All', icon: '✦' }, ...types.map(label => ({ value: label, label, icon: eventTypeIcon(label) }))]} />
  </section>;
}
