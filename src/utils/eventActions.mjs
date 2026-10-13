// UI availability is additional to server rules, never a replacement for them.
export function eventActions({ event, member, manage, admin, arrangeNiaz = manage, readOnly, handlers = {} }) {
  const hostUid = event.createdByUserId || event.ownerUid || event.createdByUid || event.userId;
  const series = Boolean(event.isSeries || event.isRecurring || event.seriesId || event.recurringSeriesId);
  const action = (id, label, allowed, writes = false, reason = 'You do not have permission for this action.') => {
    const unavailable = !allowed ? reason : writes && readOnly ? 'Disabled in the read-only preview.'
      : typeof handlers[id] !== 'function' ? 'This workflow is not connected in the web preview yet.' : '';
    return { id, label, disabled: Boolean(unavailable), reason: unavailable };
  };
  return [
    action('share', 'Share', true),
    action('directions', 'Directions', member && Boolean(event.address?.fullAddress || event.address?.suburb), false,
      !member ? 'Sign in to use directions.' : 'No location is available.'),
    action('contact', 'Contact Host', member && Boolean(hostUid) && hostUid !== handlers.uid, true,
      !member ? 'Sign in to contact the host.' : !hostUid ? 'This event has no linked host inbox.' : 'You are the host of this event.'),
    action('live', event.isLive && event.liveWatchUrl && event.liveAppVisibility !== 'private' ? 'Watch on YouTube' : event.isLive ? 'Manage Live' : 'Go Live',
      member && (manage || Boolean(event.isLive && event.liveWatchUrl && event.liveAppVisibility !== 'private')),
      !(event.isLive && event.liveWatchUrl && event.liveAppVisibility !== 'private')),
    action('reminder', 'Reminder', member, true, 'Sign in to set reminders.'),
    action('calendar', 'Sync Calendar', member, false, 'Sign in to sync your calendar.'),
    action('niaz', 'Niaz Arrangement', member && arrangeNiaz),
    action('edit', 'Edit', member && manage, true),
    ...(series ? [action('editSeries', 'Edit Series', member && manage, true)] : []),
    action('copy', 'Copy', member && admin, true),
    action('delete', 'Delete', member && manage, true),
    ...(series ? [action('deleteSeries', 'Delete Series', member && admin, true)] : []),
  ];
}
