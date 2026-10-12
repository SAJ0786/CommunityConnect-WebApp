# Registration prototype

Isolated, memory-only UI review. No Firebase, service worker, production routing or real booking authority.

Run `node tools/preview-registration.mjs` from the web project, or double-click `preview-registration.cmd`. Open the printed local URL (port 5196). `--build-only` validates bundling; `--serve-only` serves the existing bundle.

The build also exports `.qa-registration-preview/registration-preview.html`, a self-contained offline HTML review file. Open it in a normal browser without a server. Browser review in the agent runtime remains blocked: loopback times out and file URLs are disallowed. No visual verification is claimed.

Tests: `node --test tests/registration-prototype.test.mjs`.

The native mirror is `sdk51-package-backup/src/registration/prototypeModel.js`; the parity test checks it when the sibling checkout is available.

Uses the web project's existing `src/styles/tokens.css`. That shared stylesheet belongs to the ongoing PWA work and must be committed before this preview is a self-contained Git checkout. Do not deploy the preview as a replacement for the application.

Working: event choices, event setup, ten question types, required flags, editing/reordering/removal, session-only drafts/templates, attendee validation, demo confirmation and immutable question/answer snapshot.

12 October review update: added existing Add Event categories/custom category, detailed public notes, full private address plus confirmed public suburb, private poster preview, templates-first builder, required host-written consent terms (1,000 characters) pinned last, strictly earlier-day closing validation, host confirmation, attendee edit/confirmation and role-simulated event cards.

`registrationClient.mjs` and `firebaseRegistration.mjs` provide a feature-disabled transport adapter. They are NOT imported by the demo. Backend candidate lives in the native checkout under `backend/functions-registration`; tested locally and against an isolated Firestore emulator, not deployed. Native/PWA model and transport files mirror one another.

Still to connect: production host/attendee screens and event discovery/cards, persistent template UI, address autocomplete/dynamic event options, private poster lifecycle/Storage tests, real role/auth/App Check acceptance and confirmation delivery. Backend primitives for capacity, revisions, private access, cancellation and templates exist, but that does not make this demo a production booking system. Native entry remains development-only; no test APK or store build produced.

Hosted isolated review: https://community-event-8b639--registration-prototype-20261012-k6z9852a.web.app (expires 19 October). Not the live PWA.
