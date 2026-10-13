export const NOTIFICATION_PREFERENCES = [
  ['pushNotificationsEnabled', 'Push notifications'],
  ['smsNotificationsEnabled', 'SMS notifications'],
  ['emailNotificationsEnabled', 'Email notifications'],
  ['eventNotificationsEnabled', 'Community Events updates'],
  ['prayerRemindersEnabled', 'Prayer-time reminders'],
  ['businessNotificationsEnabled', 'Business Directory updates'],
];
export function readNotificationPreferences(profile = {}) {
  return Object.fromEntries(NOTIFICATION_PREFERENCES.map(([key]) => [key, profile[key] !== false]));
}
export function notificationPreferencePayload(values, defaultModule) {
  if (!['events', 'directory'].includes(defaultModule)) throw new Error('Choose a home module.');
  const payload = { defaultModule };
  for (const [key] of NOTIFICATION_PREFERENCES) {
    if (typeof values[key] !== 'boolean') throw new Error('Invalid notification setting.');
    payload[key] = values[key];
  }
  // The existing email job uses this legacy switch; keep it in sync.
  payload.reminderEmailEnabled = values.emailNotificationsEnabled;
  return payload;
}
