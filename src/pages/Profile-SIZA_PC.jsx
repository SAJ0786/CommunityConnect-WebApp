import React, { useState } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase/firebase';
import { deleteMyAccountAndEvents, updatePushPreference, updateReminderPreference } from '../services/userService';
import { enablePushNotifications, getNotificationPermissionState, sendTestPushNotification, showLocalTestNotification, syncGrantedNotificationToken } from '../services/notificationService';
import { STORE_SHARE_LINES } from '../utils/storeLinks';

function formatPushDiagnostic(result = {}) {
  const tokenSummary = Object.entries(result.tokenSummary || {})
    .map(([key, count]) => `${key} ${count}`)
    .join(', ');
  const failures = (result.failures || [])
    .map(failure => `${failure.platform || 'unknown'}:${failure.source || 'unknown'} ${failure.code || 'failed'}`)
    .join(', ');
  return [
    tokenSummary ? `Tokens: ${tokenSummary}.` : '',
    failures ? `Failed: ${failures}.` : '',
    result.invalidRemoved ? `Removed ${result.invalidRemoved} expired token(s).` : '',
  ].filter(Boolean).join(' ');
}

function formatLocalNotificationMessage(localResult) {
  if (localResult?.shown) return 'A local notification preview was also triggered on this device.';
  if (localResult?.reason === 'unsupported') return 'Local notification preview is not supported on this device.';
  if (localResult?.reason === 'denied') return 'Local notification preview is blocked in this device settings.';
  return `Local notification preview could not be shown (${localResult?.reason || 'unknown'}).`;
}

export default function Profile({ user, profile, setProfile }) {
  const [pushStatus, setPushStatus] = useState(() => getNotificationPermissionState());
  const [pushBusy, setPushBusy] = useState('');
  const [pushMessage, setPushMessage] = useState('');
  const emailReminderEnabled = profile?.reminderEmailEnabled !== false;
  const pushEnabled = profile?.pushNotificationsEnabled !== undefined
    ? profile.pushNotificationsEnabled !== false
    : emailReminderEnabled;

  const toggleReminder = async () => {
    const next = !emailReminderEnabled;
    await updateReminderPreference(user.uid, next);
    setProfile({ ...profile, reminderEmailEnabled: next });
  };

  const enablePush = async () => {
    setPushBusy('enable');
    setPushMessage('');
    await updatePushPreference(user.uid, true);
    const token = await enablePushNotifications(user.uid);
    setPushStatus(getNotificationPermissionState());
    setProfile({ ...profile, pushNotificationsEnabled: true });
    setPushMessage(token ? 'Push notifications are enabled on this device.' : 'Notifications could not be enabled on this device.');
    setPushBusy('');
  };

  const disablePush = async () => {
    setPushBusy('disable');
    setPushMessage('');
    await updatePushPreference(user.uid, false);
    setProfile({ ...profile, pushNotificationsEnabled: false });
    setPushMessage('Push notifications are disabled.');
    setPushBusy('');
  };

  const testPush = async () => {
    setPushBusy('test');
    setPushMessage('');
    await syncGrantedNotificationToken(user.uid, profile);
    const result = await sendTestPushNotification();
    const localResult = result?.sent ? await showLocalTestNotification() : null;
    const diagnostic = formatPushDiagnostic(result);
    setPushMessage(result?.sent
      ? `Test push sent to ${result.sent} of ${result.tokenCount || result.sent} token(s). ${formatLocalNotificationMessage(localResult)} ${diagnostic}`
      : 'No active push token was found.');
    setPushBusy('');
  };

  const deleteAccount = async () => {
    if (!confirm(
      'This will permanently delete your account and ALL events you created.\n\nThis cannot be undone. Continue?'
    )) return;
    try {
      await deleteMyAccountAndEvents(auth.currentUser);
      location.reload();
    } catch (e) {
      alert(e.message);
    }
  };

  return (
    <div className="card">
      <h2>Profile &amp; Settings</h2>

      <p><b>Email:</b> {user?.email}</p>
      <p><b>Role:</b> {profile?.role}</p>
      <p>
        <b>Email Reminders:</b>{' '}
        {emailReminderEnabled ? 'Enabled' : 'Disabled'}
      </p>

      <button className="btn-light" onClick={toggleReminder}>
        {emailReminderEnabled ? 'Disable' : 'Enable'} Email Reminders
      </button>

      <div style={{ marginTop:16, padding:16, border:'1px solid var(--border)', borderRadius:10 }}>
        <h3>Push Notifications</h3>
        <p><b>Status:</b> {pushEnabled ? 'Enabled' : 'Disabled'} ({pushStatus.native ? 'native app' : pushStatus.permission})</p>
        {pushEnabled ? (
          <button className="btn-light" onClick={disablePush} disabled={!!pushBusy}>
            {pushBusy === 'disable' ? 'Saving...' : 'Disable Push Notifications'}
          </button>
        ) : (
          <button className="btn-light" onClick={enablePush} disabled={!!pushBusy}>
            {pushBusy === 'enable' ? 'Enabling...' : 'Enable Push Notifications'}
          </button>
        )}
        {pushEnabled && (
          <button className="btn-muted" onClick={testPush} disabled={!!pushBusy}>
            {pushBusy === 'test' ? 'Sending...' : 'Send Test Push'}
          </button>
        )}
        {pushMessage && <p className="small">{pushMessage}</p>}
      </div>

      <button className="btn-muted" onClick={() => signOut(auth)}>
        Logout
      </button>

      <div className="divider" />

      <h3>Share the App</h3>
      <p className="small" style={{ marginBottom: 12 }}>
        Invite your community to join Community Events Australia.
      </p>
      <button style={{ width: '100%' }} onClick={() => {
        const msg = [
          '🌙 *Community Events Australia*',
          '_Your free community events app_',
          '*Features:*',
          '📅 Browse upcoming Majalis, Milads & community events',
          '🔔 Get push notifications before events',
          '📲 Install as an app on iPhone & Android',
          '📤 Share events to WhatsApp instantly',
          '🗺️ Get directions to any event',
          '🌙 Hijri dates on every event',
          '📅 Sync events to your phone calendar',
          '🤖 AI Search — ask anything about events',
          '⭐ Save your favourite events',
          '➕ Add & manage your own events',
          '',
          ...STORE_SHARE_LINES,
          '',
          '_Download Community Events App to keep connected with community_',
        ].join('\n');
        if (window.__showShareSheet) {
          window.__showShareSheet(msg);
        } else if (navigator.share) {
          navigator.share({ text: msg }).catch(() => {});
        } else {
          navigator.clipboard.writeText(msg).then(() => alert('Message copied! Paste it in WhatsApp.'));
        }
      }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="white" style={{ flexShrink: 0 }}>
          <path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.37 5.07L2 22l5.09-1.34A9.94 9.94 0 0012 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm0 18c-1.66 0-3.22-.46-4.55-1.26l-.32-.19-3.03.8.81-2.96-.21-.34A7.96 7.96 0 014 12c0-4.42 3.58-8 8-8s8 3.58 8 8-3.58 8-8 8zm4.45-5.95c-.24-.12-1.43-.7-1.65-.78-.22-.08-.38-.12-.54.12-.16.24-.62.78-.76.94-.14.16-.28.18-.52.06-.24-.12-1.01-.37-1.92-1.18-.71-.63-1.19-1.41-1.33-1.65-.14-.24-.01-.37.1-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78-.19-.47-.39-.4-.54-.41h-.46c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.69 2.58 4.1 3.62.57.25 1.02.39 1.37.5.57.18 1.09.16 1.5.1.46-.07 1.43-.58 1.63-1.15.2-.57.2-1.06.14-1.15-.06-.1-.22-.16-.46-.28z"/>
        </svg>
        Share the App
      </button>

      <div className="divider" />

      <h3>Help &amp; Policies</h3>
      <p><a href="/shia-events-australia.html" target="_blank">Shia Majlis and Muharram programs across Australia</a></p>
      <p><a href="/docs/user-guide.html" target="_blank">📘 User Guide</a></p>
      <p><a href="/privacy.html"       target="_blank">Privacy Policy</a></p>
      <p><a href="/terms.html"         target="_blank">Terms of Use</a></p>
      <p><a href="/support.html"       target="_blank">Support &amp; Contact</a></p>
      <p><a href="/delete-account.html" target="_blank">Account Deletion Policy</a></p>

      <div className="divider" />

      <button className="btn-danger" onClick={deleteAccount}>
        Delete My Account &amp; All My Events
      </button>
    </div>
  );
}

