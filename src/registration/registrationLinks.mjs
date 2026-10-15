const safeId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
export function registrationNotificationLink(data) {
  if (data?.module !== 'registration' || !String(data.type || '').startsWith('registration.') || !safeId(data.eventId) || !safeId(data.recipientUid)) return null;
  return '/?registration=' + encodeURIComponent(data.eventId) + '&recipient=' + encodeURIComponent(data.recipientUid);
}
export function registrationEntry(search, uid) {
  const params = new URLSearchParams(search), eventId = params.get('registration'), recipient = params.get('recipient');
  if (!safeId(eventId) || recipient && (!safeId(recipient) || recipient !== uid)) return null;
  return eventId;
}
