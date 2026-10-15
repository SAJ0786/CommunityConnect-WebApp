# Event registration on web

## Current candidate integration - 16 October 2026

`RegistrationRoute.jsx` connects the production UI to candidate registration callables, with account-bound requests and `VITE_EVENT_REGISTRATION_ENABLED=false` by default. No candidate backend has been deployed or gate enabled by this web work.

Implemented: public discovery with scanned-page cursors, My registrations, hosted/review lists, host event/form builder with ten question types, saved templates, attendee preview, initial approval, registration submit/edit/cancel/confirmation, responses and CSV, answer deletion, host cancellation, private venue/maps/directions and private poster upload/retry/remove/read. Approved-event edits preserve approval according to the server; attendees see form-review notices and post-closing restrictions from server flags. Profile deletion explains the candidate organiser-cancellation policy. Notification links enforce the intended account before opening the protected detail.

Private data stays in component memory. Switching account/admin scope remounts the workspace; backgrounding clears private rendered state and drafts, and foregrounding reloads permission-checked detail. Venue coordinates are cleared when the address text changes and must be resolved again. No public card receives a private venue or poster.

Read `docs/PWA-INTEGRATION-HANDOVER-2026-10-16.md` for evidence and remaining release acceptance. Candidate code is not a claim of live booking or notification delivery.

## Isolated previews

- `node tools/preview-registration-workflows.mjs`: actual connected UI with an in-memory fictional API on port 5198. No Firebase, emails, push or real bookings. `--build-only` compiles without starting a server.
- `node tools/preview-registration.mjs`: earlier design-only prototype on port 5196, including its self-contained offline HTML. `RegistrationPrototype.jsx` is never imported by the production route.

## Checks

```powershell
node --test tests/*.test.mjs
npm ci --prefix tests/registration-renderer
npm test --prefix tests/registration-renderer
node tools/check-candidate-integrations.mjs
```

The renderer tests exercise real React components against fictional callable responses. They do not establish browser layout, Firebase rules/App Check, production backend or device notification acceptance.
