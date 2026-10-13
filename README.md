# CommunityConnect-WebApp

The user-owned repository for the Community Connect web app and PWA:
https://github.com/SAJ0786/CommunityConnect-WebApp (branch `main`).

Live site: https://communityconnect.siza.info.

The repository contains the web source, assets, backend source, tests, tooling and release documentation, including the separate registration prototype. Prototype/candidate files do not imply those features have been deployed. The native React Native app is maintained separately in `SAJ0786/CommunityEvents-Native`.

## Work from another computer

```powershell
git clone https://github.com/SAJ0786/CommunityConnect-WebApp.git
cd CommunityConnect-WebApp
npm ci
Copy-Item .env.example .env
# Fill in the approved Firebase/web configuration in .env.
npm run dev
```

Private configuration and generated QA artifacts are intentionally excluded. Some Firebase acceptance and release tools require authenticated CLI access or emulator fixtures; read their documentation before running them against live data.

Run `node --test tests/*.test.mjs` and `node tools/check-unified-web.mjs` for local tests and a build without deployment. Read `AGENTS.md` for the standing test/commit/push/verify workflow. Fetch remote updates before new work and push completed changes to this repository. Never push to the former deployer's repository.

The setup notes below are historical. The existing Firebase project and production services are already configured; do not recreate them or run the broad deploy command as part of Git synchronisation. See `docs/RELEASE-STATUS-2026-10-12.md` for the live Hosting release and pending device checks.

## Historical project notes

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
