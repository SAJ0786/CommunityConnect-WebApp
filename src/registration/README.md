# Registration prototype

Isolated, memory-only UI review. No Firebase, service worker, production routing or real booking authority.

Run `node tools/preview-registration.mjs` from the web project, or double-click `preview-registration.cmd`. Open the printed local URL (port 5196). `--build-only` validates bundling; `--serve-only` serves the existing bundle.

The build also exports `.qa-registration-preview/registration-preview.html`, a self-contained offline HTML review file. Open it in a normal browser without a server. Browser review in the agent runtime remains blocked: loopback times out and file URLs are disallowed. No visual verification is claimed.

Tests: `node --test tests/registration-prototype.test.mjs`.

The native mirror is `sdk51-package-backup/src/registration/prototypeModel.js`; the parity test checks it when the sibling checkout is available.

Uses the web project's existing `src/styles/tokens.css`. That shared stylesheet belongs to the ongoing PWA work and must be committed before this preview is a self-contained Git checkout. Do not deploy the preview as a replacement for the application.

Working: event choices, event setup, ten question types, required flags, editing/reordering/removal, session-only drafts/templates, attendee validation, demo confirmation and immutable question/answer snapshot.

Not implemented here: real identity/permissions, persisted templates, per-attendee repeated fields, closing-time enforcement, server capacity, cancellation, CSV export, actual publication, protected event details or notifications. Native has a development-only screen with the same model; no store build has been produced.
