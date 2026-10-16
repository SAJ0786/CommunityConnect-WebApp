# Event registration on web

## Unified event cards - 16 October 2026

Registration events now share Home, date/city/category/search filters, calendar,
Favourites and the normal EventCard. Quick Access toggles registration-only/all
events without opening another browser. Registration is no longer a menu item.
The production registration route is operation-only: create/edit event and form,
submit/edit own registration, responses or booking history. The older standalone
browser remains only in isolated design/workflow fixtures.

The callable-only feed consumes every scanned page, including empty pages with a
cursor. Public feeds include only approved, nondeleted events. Hosts see pending
events in My Events; My Events also retains attending history. Admin Event
Management uses the city-scoped `management` list. Superadmin User Management has
a global `review` panel (no city argument, including former/disabled cities) with
revision-checked approval. Pending cards say **UnApproved**; after approval that
note disappears without a replacement badge.

Card registration actions use server capability flags. Edit Event opens the
event/form editor, including existing-poster deletion and registration closing
date. Delete calls `deleteRegistrationEvent` with revision and `DELETE EVENT`;
it is not a direct Firestore deletion and preserves booking history. There is no
Cancel whole event control. Contact Host resolves registration IDs through the
callable before writing the existing participant-only inbox thread.

Private venue and poster bytes are loaded only from authorised detail/poster
callables into transient card/editor state. They are never shared, persisted in
event caches, placed in a public image URL, or exported to subscribed calendars.
Unregistered members and guests see suburb and fallback artwork only. Account,
role and background transitions clear or remount private state.

Optional `startTime`/`endTime` use strict city-local HH:mm; earlier end means the
next day. Backend-projected `startAt`/`endAt` are UTC. Missing times stay missing;
the Web does not invent a start time or duration. `/cal` now includes approved
registration events using public title/suburb only: date-only events are all-day,
timed events use server UTC instants and omit DTEND when no end is provided.

**Coordinated release prerequisites:** deploy the Native-owned registration
callables contract from `a6a6af083be82ee38bf6463d3bce5ebc91350ac3` or its successor
(list flags/scopes, global review, safe delete, schedule and safe live projection,
stored stream-state preservation), then the
Web-owned `calendarFeed` from `functions/index.js` with
`functions/registration-calendar.cjs`, before publishing this Web build.
Existing feature gates and notice/delivery switches are unchanged. No deployment
was performed by this change.

**Streaming decision:** the user approved normal Public/Unlisted YouTube options.
Unlisted links can be shared outside the app; this is not registrant-only video.
Registration posters, private venue and answers retain their separate restrictions.
Stream thumbnails and archive records use only an allowlisted
public registration projection (title/type/date/clocks/city/suburb/owner UID).

Deploy the Web-owned `nativeStreamStart`, `nativeStreamResume`,
`nativeStreamEndEvent`, `startExternalYouTubeStream`, `endExternalYouTubeStream`,
`getEventStream`, `nativeStreamCheckHealth`, `sendPrivateStreamLinkEmail`, `cleanupStaleLiveEvents`,
`cleanupStaleLiveEventsNow`, `listStreamVideos` and
`refreshStreamVideoThumbnails` with `functions/stream-events.cjs` before publishing
streaming clients. Event-ID calls explicitly pass
`eventCollection: 'registrationEvents'`; omitted collection remains legacy
`events`. Sessions and archive records retain collection identity; resume/end
reject cross-event or cross-collection sessions. Starts require an active owner
or authorised city admin/Superadmin and an approved, available event. Publication
transactionally rechecks availability and existing streams. Cancelled/deleted
events can still be ended by their managers; stale cleanup includes registrations.
The relay is session-only and needs no collection-specific change.

The matching Native-owned registration list/detail projection must include safe
live state. Unlisted watch URLs are never public: managers retrieve their own
existing external stream link through `getEventStream`; native resume already
returns its authorised session URL. Web registration streaming never calls
legacy direct-write `goLive`/`endLive` fallbacks or `notifyEventLive`. No new
notification delivery is activated: registration private-link emails are skipped
on clients and refused server-side, without altering ordinary-event delivery.

**Reminder release hold:** the candidate Web reminder source now supports explicit
`eventCollection: registrationEvents`, rechecking approval/deletion and exact
server-projected starts before scheduling/dispatch; it never reads private venue
or answers. Registration Reminder remains visible but disabled independently of the ordinary
`VITE_EVENT_REMINDERS_ENABLED=true` production flag. Its explicit
`REGISTRATION_REMINDERS_ENABLED=false` release hold is enforced in both card and
service before callable/token/notification work. The user-visible reason is:
"Registration reminders are awaiting separate backend activation. No reminder has
been scheduled." Future activation also requires an exact event start.
No reminder endpoints, worker or delivery gate are activated by this change.
Deploy/accept the candidate reminder backend separately before enabling it.
Do not enable registration clients before the collection-aware streaming backend
and safe callable live projection are deployed. Do not send registration IDs to
legacy-only reminder endpoints or mirror private registrations into `events`.

Focused offline browser checks:
`node tools/check-ui-preview.mjs` (5182) then
`node tools/check-unified-registration-preview.mjs`; this covers phone/desktop
filtering, guest sign-in, attendee edit, poster/address privacy, host form/poster
editing, global approval and Public/Unlisted stream controls. No Firebase or real
records are used. `tests/registration-streams.test.mjs` exercises the canonical
streaming callable bodies with in-memory Firestore/YouTube; the renderer suite
also exercises real React native/external start and failed-end retry paths.

## Earlier candidate integration (historical)

`RegistrationRoute.jsx` originally connected the candidate workspace to registration callables, with account-bound requests and `VITE_EVENT_REGISTRATION_ENABLED=false` by default. No backend has been deployed or gate enabled by this web work. The unified production entry points and release requirements above supersede the earlier standalone-list and host-cancellation UI.

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
