export function registrationEventCard(row) {
  return { ...row, registrationOnly: true, metroArea: row.city, eventDate: row.date, eventType: row.customEventType || row.eventType,
    eventSubject: row.title, hostName: row.title, createdByUserId: row.ownerUid,
    organiserType: 'private', address: { suburb: row.suburb || '' }, imageUrl: '' };
}

export async function registrationEventPages(api, options) {
  const events = new Map(), cursors = new Set();
  let cursor = null;
  do {
    const page = await api.list({ ...options, cursor });
    for (const row of page.events || []) events.set(row.id, registrationEventCard(row));
    cursor = page.nextCursor || null;
    if (cursor && cursors.has(cursor)) throw new Error('Registration pagination repeated a cursor. Refresh events to retry.');
    if (cursor) cursors.add(cursor);
  } while (cursor);
  return [...events.values()];
}

export function mergePublicEvents(events, registrations) {
  return [...events, ...registrations.filter(event => event.status === 'approved' && !event.deletedAt)];
}
