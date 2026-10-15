import { REGISTRATION_ENABLED } from '../config/releaseGates.mjs';
export function navigationTabs(directory = false) {
  return directory ? [
    { key: 'home', label: 'Home' }, { key: 'promotions', label: 'Promotions' },
    { key: 'listing', label: 'Add Business', primary: true, member: true },
    { key: 'owner', label: 'My Business', member: true }, { key: 'menu', label: 'Menu' },
  ] : [
    { key: 'home', label: 'Home', target: 'bottom-home' },
    { key: 'my', label: 'My Events', member: true, target: 'bottom-my-events' },
    { key: 'add', label: 'Add Event', primary: true, member: true, target: 'bottom-add' },
    { key: 'favourites', label: 'Favourites', member: true, target: 'bottom-favourites' },
    { key: 'menu', label: 'Menu', target: 'bottom-profile' },
  ];
}
export function userInitials(profile, user, guest = false) {
  if (guest) return 'G';
  const name = String(profile?.fullName || user?.displayName || '').trim().split(/\s+/).filter(Boolean);
  return name.length ? name.slice(0, 2).map(word => [...word][0]).join('').toUpperCase()
    : String(user?.email || 'U').slice(0, 2).toUpperCase();
}
export function accountItems({ directory = false, guest = false, role } = {}) {
  const admin = !guest && ['admin', 'superAdmin'].includes(role);
  return [
    ...(!guest ? [
      { key: 'profile', label: 'My Profile', icon: 'user' },
      { key: 'notifications', label: 'Notifications', icon: 'bell' },
      { key: directory ? 'inbox' : 'host-inbox', label: directory ? 'Business Inbox' : 'Host Inbox', icon: 'inbox' },
    ] : []),
    ...(admin ? [{ key: 'admin', label: 'Admin Dashboard', icon: 'shield' },
      ...(!directory ? [{ key: 'bulkshare', label: 'Bulk Share Events', icon: 'share' }] : [])] : []),
    ...(directory && !guest ? [{ key: 'saved', label: 'Saved businesses', icon: 'heart' }, { key: 'support', label: 'Feedback and support', icon: 'help' }] : []),
    { key: 'help', label: 'Help & Policies', icon: 'help' },
    { key: 'share-app', label: 'Share App', icon: 'share' },
  ];
}
export const eventExploreItems = [
  ...(REGISTRATION_ENABLED ? [{ key: 'registration', label: 'Registration events', icon: 'calendar' }] : []),
  { key: 'home', label: 'Home', icon: 'home' }, { key: 'my', label: 'My Events', icon: 'calendar', member: true },
  { key: 'add', label: 'Add Event', icon: 'plus', member: true }, { key: 'favourites', label: 'Favourites', icon: 'heart', member: true },
  { key: 'search', label: 'AI Search', icon: 'search' }, { key: 'calendar', label: 'Calendar', icon: 'calendar' },
  { key: 'hijri-calendar', label: 'Hijri Calendar', icon: 'moon' }, { key: 'streams', label: 'Streamed Videos', icon: 'video' },
  { key: 'install', label: 'Install App', icon: 'download', member: true },
];

export const eventWorkspaceAccountKeys = ['notifications', 'host-inbox', 'admin', 'bulkshare'];
export function eventsSidebarItems({ guest = false, role } = {}) {
  const explore = eventExploreItems.filter(item => !guest || !item.member);
  return [
    ...explore.filter(item => item.key !== 'add'),
    ...accountItems({ guest, role }).filter(item => eventWorkspaceAccountKeys.includes(item.key)),
    ...explore.filter(item => item.key === 'add'),
  ];
}
