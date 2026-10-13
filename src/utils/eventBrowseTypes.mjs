// Filters use the stored event type, not an event's custom display title.
export function eventBrowseType(event) {
  return String(event.eventType || event.eventTypeDisplay || event.customEventType || '').trim();
}

export function availableEventTypes(events, defaults = []) {
  return [...new Set([...defaults, ...events.map(eventBrowseType)])]
    .filter(type => type && type.toLowerCase() !== 'test event');
}

const TYPE_ICONS = {
  prayers: '🕌', majlis: '📖', milad: '✨', 'friday prayers': '🕌',
  dua: '🤲', 'prayers & amal': '📿', 'dua-e-kumail': '📖',
  'dua-e-tawassul': '🤲', 'dua-e-nutba': '📜', 'dua-e-nudba': '📜',
  birthday: '🎂', marriage: '💍', 'informal get together': '☕',
  'community event': '👥', custom: '🏷️',
};

export function eventTypeIcon(type) {
  const key = String(type).trim().toLowerCase();
  if (TYPE_ICONS[key]) return TYPE_ICONS[key];
  if (/prayer|salah|namaz/.test(key)) return '🕌';
  if (/dua|supplication/.test(key)) return '🤲';
  if (/quran|lecture|class|workshop/.test(key)) return '📖';
  if (/meal|iftar|niaz/.test(key)) return '🍽️';
  if (/gathering|community|meeting/.test(key)) return '👥';
  return '🏷️';
}
