import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '../firebase/firebase';
import { enablePushNotifications } from './notificationService';
import { REGISTRATION_REMINDERS_ENABLED, REGISTRATION_REMINDER_HOLD } from '../config/releaseGates.mjs';
function requireReminderRelease(registrationOnly) {
  if (registrationOnly && !REGISTRATION_REMINDERS_ENABLED) throw new Error(REGISTRATION_REMINDER_HOLD);
}
function context() {
  if (import.meta.env.VITE_READ_ONLY_PREVIEW === 'true') throw new Error('Disabled in the read-only preview.');
  if (import.meta.env.VITE_EVENT_REMINDERS_ENABLED !== 'true') throw new Error('Web push reminders are awaiting backend activation. No reminder has been scheduled.');
  if (!auth.currentUser?.uid || auth.currentUser.isAnonymous) throw new Error('Sign in to manage reminders.');
  let deviceId = localStorage.getItem('community-connect-reminder-browser');
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(deviceId || '')) { deviceId = crypto.randomUUID(); localStorage.setItem('community-connect-reminder-browser', deviceId); }
  return { uid:auth.currentUser.uid, deviceId };
}
async function call(name, eventId, extra = {}, savedContext = context()) {
  if (auth.currentUser?.uid !== savedContext.uid) throw new Error('Your account changed. Reopen Reminder.');
  const result = (await httpsCallable(functions, name)({ eventId, deviceId:savedContext.deviceId, ...extra })).data;
  if (auth.currentUser?.uid !== savedContext.uid) throw new Error('Your account changed. Reopen Reminder.');
  return result;
}
const collection = registrationOnly => ({ eventCollection: registrationOnly ? 'registrationEvents' : 'events' });
export async function getEventReminder(eventId, registrationOnly = false) {
  requireReminderRelease(registrationOnly);
  return (await call(registrationOnly ? 'registrationReminderStatus' : 'getEventReminder', eventId, collection(registrationOnly))).reminder;
}
export async function setEventReminder(eventId, minutesBefore, registrationOnly = false) {
  requireReminderRelease(registrationOnly);
  const member = context(), token = await enablePushNotifications(member.uid);
  if (!token) throw new Error('Browser notifications were not enabled. No reminder was scheduled.');
  if (registrationOnly) { const result = await call('scheduleRegistrationNotice', eventId, { minutesBefore }, member); return { status: 'pending', minutesBefore, fireAt: Date.parse(result.triggerAt) }; }
  const result = await call('setEventReminder', eventId, { minutesBefore, token, ...collection(registrationOnly) }, member);
  if (result?.reminder?.status !== 'pending') throw new Error('The reminder could not be confirmed. Reopen Reminder to check its status.');
  return result.reminder;
}
export async function removeEventReminder(eventId, registrationOnly = false) {
  requireReminderRelease(registrationOnly);
  if ((await call(registrationOnly ? 'registrationReminderStatus' : 'removeEventReminder', eventId, { ...collection(registrationOnly), remove: true })).removed !== true) throw new Error('Removal could not be confirmed. Reopen Reminder to check.');
}
