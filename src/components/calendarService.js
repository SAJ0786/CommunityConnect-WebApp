// ─── Community Event Calendar (Live ICS feed) ─────────────────────────────────
// Short URL format: https://communityevents.siza.info/cal?t=<uid>
// This proxies through Firebase Hosting → calendarFeed Cloud Function

const APP_DOMAIN = 'https://communityevents.siza.info';

export function buildFeedUrl(projectId, region, uid) {
  // Short URL via hosting rewrite — much cleaner than the raw function URL
  return `${APP_DOMAIN}/cal?t=${uid}`;
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
