import { httpsCallable, getFunctions } from 'firebase/functions';
import { getApp } from 'firebase/app';
import { auth } from '../firebase/firebase';
// ─── Community Event Calendar (Live ICS feed) ─────────────────────────────────
// Short URL format: https://communityevents.siza.info/cal?t=<uid>
// This proxies through Firebase Hosting → calendarFeed Cloud Function

const APP_DOMAIN = 'https://communityevents.siza.info';

export async function getCalendarFeed(uid) {
  if (!uid || auth.currentUser?.uid !== uid || auth.currentUser.isAnonymous) throw new Error('Sign in before syncing your calendar.');
  const key = 'community-connect-secure-calendar/' + uid;
  let cached;try { cached = localStorage.getItem(key); } catch {}
  const valid = value => /^https:\/\/communityevents\.siza\.info\/cal\?s=[A-Za-z0-9_-]{43}$/.test(value || '');
  if (valid(cached)) return cached;
  const result = await httpsCallable(getFunctions(getApp(),'australia-southeast1'),'createCalendarSubscription')({});
  if (auth.currentUser?.uid !== uid) throw new Error('Your sign-in changed.');
  const url = result.data?.url;if (!valid(url)) throw new Error('Your secure calendar link could not be created.');
  try { localStorage.setItem(key,url); } catch {}
  return url;
}

export function icsInstructions() {
  return {
    iphone: [
      'Open the Settings app on your iPhone',
      'Tap Calendar → Accounts → Add Account',
      'Choose "Other" → "Add Subscribed Calendar"',
      'Paste your personal feed URL and tap Next',
      'Tap Save — events will appear in your Calendar app'
    ],
    android: [
      'Copy your personal feed URL',
      'Open Google Calendar in a browser: calendar.google.com',
      'Click the "+" next to "Other calendars"',
      'Choose "From URL" and paste your feed URL',
      'Click Add Calendar — it syncs to your Android automatically'
    ],
    outlook: [
      'Copy your personal feed URL',
      'In Outlook go to Calendar view',
      'Click "Add Calendar" → "Subscribe from web"',
      'Paste your feed URL and click Import'
    ]
  };
}
