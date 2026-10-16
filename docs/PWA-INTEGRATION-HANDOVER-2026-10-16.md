# PWA integration handover - historical 16 October checkpoint

**Current status, 17 October:** the descriptions below are retained as historical
implementation evidence, not current release instructions. Registration,
dynamic-city catalogue and city management were subsequently released with
existing production flags enabled. Unified registration cards and streaming are
implemented; a staged-change review/normal-form usability follow-up is recorded
in [the current Codex handover](../COPILOT-HANDOVER.md),
[release status](RELEASE-STATUS-2026-10-12.md) and
[registration contract](../src/registration/README.md). Browser checks now pass.
Registration reminders and notification delivery remain held. Native installed
app delivery must be confirmed separately from source/backend deployment.

Canonical repository: SAJ0786/CommunityConnect-WebApp, main. Native source is read-only reference in the sibling sdk51-package-backup checkout. Do not deploy Firebase or enable candidate gates as part of this work.

## Dynamic cities checkpoint

- Adopted native schemaVersion 1, bundled coordinates/timezones, stable IDs, disabled-ID retention, alias/postcode validation and last-known-good caching. Unknown cities are not rewritten to Sydney.
- Catalogue refresh is gated by VITE_DYNAMIC_CITY_CATALOGUE_ENABLED=false. Root refresh updates Events and public/member Business screens; city options, public business projection, opening hours, prayer locations and future-series selection use the catalogue. Hijri Today follows the selected city timezone. Rest of Australia remains an aggregate with an explicitly labelled Sydney prayer reference.
- Super Admin Add City is under Admin Dashboard > Tools and additionally gated by VITE_CITY_MANAGEMENT_ENABLED=false. Search, server preview, latitude/longitude/timezone review, code entry and confirmation use searchCatalogueCities, previewCatalogueCity and addCatalogueCity. Missing/invalid coordinates block Add. The server receives the preview fingerprint, not client-authoritative coordinates.
- No backend, rules, App Check, release configuration or production catalogue was changed. Required callable deployment/App Check acceptance and real-device/live acceptance remain release follow-ups.
- The legacy emulator archive fixtures remain pinned to their recorded deployed-source hashes. New native candidate code is checked separately by the web series-helper parity test; it is not substituted into those frozen fixtures.

## Registration

The callable-connected registration candidate is implemented. VITE_EVENT_REGISTRATION_ENABLED remains false. The isolated design prototype remains separate and excluded from release bundles.

- Registration events are reachable through Events navigation and the new Add Event choice when the gate is enabled. Single Event and Recurring Event names/descriptions remain unchanged.
- Implemented public/mine/review/attending lists, empty scanned-page pagination, host event/form editor, reusable templates, ten question types, attendee preview, initial approval, submit/edit/confirmation, post-closing answer/reduced-place edits, registration deletion, host cancellation, response pagination, CSV of loaded responses and permanent answer deletion.
- Server flags determine permission. Revision/form-version tokens accompany writes; uncertain submissions retain their request ID and freeze editing until retry or authoritative reload. Cancellation and destructive actions have explicit confirmation screens.
- Private venue/address search with validated coordinates, private maps/directions, poster upload/retry/remove/read are connected. Changing address text clears old coordinates. Public cards show only the server public projection. No private drafts, posters or answers are written to browser storage.
- Account changes and role/city-scope changes remount the workspace. Requests verify account identity before and after each callable. Backgrounding removes private state; foregrounding reloads authorised detail. Unsaved in-memory drafts are cleared when backgrounded.
- Approved edits retain approval and show queued-notification messaging. Changed forms ask attendees to review and re-consent. Account deletion copy describes cancellation of upcoming hosted registration events, attendee notices, deletion of the account holder's answers/templates and retention of other attendees' answers. Existing deleteUserData remains the transport; native owns candidate worker implementation.
- Foreground/background push and notification-list registration links use an origin-local event link bound to recipientUid. The registration screen still requires server authorisation. No notification has been sent for testing.

## Evidence and remaining release acceptance

- 245 root unit/contract tests passed (240 at the registration/city checkpoint); 10 isolated React component workflow tests passed. Default web build, candidate-enabled production-route build and isolated workflow-preview build passed. Git whitespace checks passed.
- Renderer checks cover off-gate silence, empty-page continuation, public/private separation, lost-response retry with stable request IDs, post-closing place limits, templates/editor, new-event save, partial poster recovery, approval/cancellation, response pagination/deletion, background privacy clearing, Super Admin city visibility and coordinate/fingerprint confirmation.
- Reproduce: `node --test tests/*.test.mjs`; `npm ci --prefix tests/registration-renderer`; `npm test --prefix tests/registration-renderer`; `node tools/check-candidate-integrations.mjs`; `node tools/preview-registration-workflows.mjs --build-only`.
- Browser visual checks are NOT passed: the browser-control runtime could not start because its local assets path was unavailable, including after reset. No browser-security bypass or alternative UI driver was used. Device/browser layout and live Firebase/App Check/role/Storage/notification acceptance remain release gates.
- No Firebase deployment, rules/security change, app-store build or production flag enablement occurred. Native owns the candidate backend. Promotion audience parity is completed in code at 23b2efe (`VITE_PROMOTION_AUDIENCE_ENABLED=false`; admin confirms audience via `approvePromotionAudience`; feature-off keeps legacy local approval; only server-approved Australia-wide offers cross city feeds; native callable owns server-side email/push preference delivery; nothing sent or deployed). Evidence: 5/5 focused, 245/245 root, 10/10 renderer, candidate and unified builds passed. Browser, live Firebase/App Check, device and notification limitations still apply.
- City checkpoint synced at 2a0043a13be12c9a771ba6bd20f44b3d3d11e36a. Use Git history for the subsequent registration checkpoint and verify remote main before further work.
