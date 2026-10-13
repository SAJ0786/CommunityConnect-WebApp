export const EXPERIENCES = [
  { id: 'events', page: 'home', title: 'Events', description: 'Events, prayer times, calendars and live streams', icon: 'calendar' },
  { id: 'businesses', page: 'businesses', title: 'Business Directory', description: 'Discover local businesses, services and contact details', icon: 'store' },
];

const preferenceKey = 'communityWebExperience';
export const getExperience = id => EXPERIENCES.find(item => item.id === id) || EXPERIENCES[0];
export function readExperience(storage) {
  try { return getExperience(storage.getItem(preferenceKey)).id; } catch { return 'events'; }
}
export function saveExperience(storage, id) {
  const experience = getExperience(id);
  try { storage.setItem(preferenceKey, experience.id); } catch {}
  return experience;
}
