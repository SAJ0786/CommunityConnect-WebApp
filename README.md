# Community Events

**Create – Share – Connect**

A Progressive Web App for discovering and sharing community events (Majlis, Milad, Birthdays, Informal gatherings).

---

## Quick Start

```bash
npm install
npm run dev        # local dev → http://localhost:5173
npm run build      # production build → dist/
firebase deploy    # deploy to Firebase Hosting
```

---

## Before First Deploy

1. **Create your Firebase project** at [console.firebase.google.com](https://console.firebase.google.com)
2. **Copy your Firebase config** into `src/firebase/firebase.js`
3. **Enable Authentication** → Email/Password + Google
4. **Create Firestore Database** → Production mode, region `australia-southeast1`
5. **Set first Super Admin manually** in Firestore Console:
   - Collection: `users` → Document ID = your Firebase Auth UID
   - Set field `role` to `superAdmin`

---

## Fill in Placeholders

Replace in all public HTML files and source files:
- `[Insert Date]` → effective date
- `[Insert Contact Email]` → your support email

---

## Project Structure

```
src/
  firebase/        Firebase config
  services/        eventService, userService, calendarService, hijriService, geoService, settingsService
  utils/           constants, permissions
  components/      Header, BottomNav, EventCard, EventForm, ReciterFields
  pages/           AuthPage, Home, AddEvent, EditEvent, SearchEvents, CalendarSync, MyEvents, Profile, AdminDashboard
  styles/          theme.css
public/
  privacy.html     Privacy Policy
  terms.html       Terms of Use
  support.html     Support
  delete-account.html  Account Deletion (required by Facebook + App Stores)
  docs/user-guide.html User Guide
  manifest.json    PWA manifest
  icons/           icon-192.png, icon-512.png, apple-touch-icon.png (add your own)
functions/
  index.js         Daily email reminders, event cleanup, user deletion cascade
```

---

## Key Design Decisions (from brief)

| Feature | Decision |
|---|---|
| Speaker + Reciters | Shown for **Majlis AND Milad** (not Majlis only) |
| Calendar export | Excludes speaker/reciters – keeps entries clean |
| Email reminders | Includes full details including reciters in one column |
| Event cleanup | Auto-deleted 7 days after event date (Cloud Function) |
| Account deletion | Deletes user + all their events (client + Cloud Function) |
| SuperAdmin safety | Cannot step down if last SuperAdmin in system |

---

## Environment Variables (Functions)

Set in Firebase Console → Functions → Configuration:

```
SMTP_HOST      your SMTP host (e.g. smtp.sendgrid.net)
SMTP_PORT      587
SMTP_USER      your SMTP username
SMTP_PASS      your SMTP password
EMAIL_FROM     noreply@yourdomain.com
```

---

## Launch Path

1. ✅ Test as PWA → `firebase deploy` and open the hosted URL
2. ✅ Assign yourself as Super Admin in Firestore Console
3. ✅ Test login, add event, search, calendar export, profile
4. 🔜 Add app to Google Play Store (Capacitor/TWA)
5. 🔜 Add app to Apple App Store (Capacitor)
