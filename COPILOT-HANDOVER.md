# Community Connect Web App - Codex handover

Canonical repository: https://github.com/SAJ0786/CommunityConnect-WebApp, branch main. Read AGENTS.md first. Fetch incoming changes, preserve local work, test completed changes, commit/publish and verify local/remote HEAD and tree equality. Never push to the former deployer.

Updated 17 October 2026 Sydney. This current-state summary supersedes the
disabled-candidate descriptions in the historical sections of the
[PWA integration handover](docs/PWA-INTEGRATION-HANDOVER-2026-10-16.md).
See [release status](docs/RELEASE-STATUS-2026-10-12.md) and
[registration contract](src/registration/README.md) for detailed evidence.

## Release state

- Current source follow-up, **not deployed**: panel-only page headings, one
  registration details form in the user-requested field sequence, recurring
  registrations with separate occurrence capacity/closing and date preview,
  and Regular Events / Registration only Events tabs in Admin Event Management.
  The matching Native backend/client source is
  `1efe7330a316c98f204ddcd4e7cd851d653a0b8a`; it is not deployed or included in
  Android tester build 97. A future coordinated release must deploy the
  registration codebase with its new twentieth `createRegistrationSeries`
  callable before Web Hosting, and build fresh Native binaries. Existing
  production configuration, reminders and delivery holds must remain unchanged.
  See the registration README for the bounded recurrence contract, true Hijri
  cadence, per-event approval/edit semantics and private-poster quota recovery.
- Production URL: https://communityconnect.siza.info.
- Web follow-up source: `9729f2f36757d6995a69e854a6fb45eee3c59b79`.
  The user explicitly authorized coordinated backend/Web deployment and a
  side-by-side Native update on 17 October. This Web source is now LIVE as Hosting
  `aa458d7a89f29384`, released 2026-10-16T19:21:35.543Z (17 October 06:21 Sydney).
  All 134 hosted files match the production build; `/`, `/app` and `/businesses`
  return the exact expected artifacts. Signed-out 390px/1440px entries render
  without overflow or page errors. Thirteen safe empty-payload rejection probes
  pass: ten return UNAUTHENTICATED/401 and three registration handlers validate
  payload first with INVALID_ARGUMENT/400. These are not authenticated acceptance.
  Do not infer an installed Native update from a source commit.
- Native-owned staged registration backend/client source:
  `1848a204b318a2f5849540060c03a22382cbc470` in
  `SAJ0786/CommunityEvents-Native`. Native deployment/build status is maintained
  in that repository's root `COPILOT-HANDOVER.md`.
  Read-only production metadata on 17 October confirms all 19 registration
  functions ACTIVE; staged save/get/list/approve/poster handlers have new
  2026-10-16T19:19Z revisions with ENABLED=true, NOTICES=false and MAINTENANCE=true.
- Before this follow-up, live Hosting version was `97f9f2dedf9923d5` from Web
  `9f4170d`. The twelve canonical Web streaming/calendar functions were already
  deployed. This follow-up changes no canonical Web functions.
  Previous Hosting is preserved in channel `registration-pre-staged-20261017`.
  Ignored `.qa-registration-release/` holds build/hash/metadata verification and
  deploy logs; no credentials are recorded.
- Existing production flags remain true: directory workspace, ordinary event
  reminders, dynamic city catalogue, city management and registration.
  `.env.example` is a setup template, not proof of live flag state.
- Existing Firebase SDK, Places and VAPID configuration is reused without
  committing private environment files. No App Check site key or preview flag
  is introduced.
- Registration reminders remain explicitly disabled independently of the
  ordinary-event reminder flag. User-visible reason: "Registration reminders are
  awaiting separate backend activation. No reminder has been scheduled."
  Candidate `functions/web-event-reminders.cjs` remains unexported/undeployed.
- Registration notices, stream email and push delivery remain disabled. Native
  owns `events-email:sendPrivateStreamLinkEmail`; do not deploy the same-named
  source export from Web's default codebase.

## Completed implementation

1. Registration events share normal Home/event cards, city/date/search filters,
   calendars and host My Events. Quick Access toggles registration-only/all
   events; there is no standalone registration menu/browser in production.
2. Attendee registration returns directly to the expanded event card with
   Edit registrations. Manager response cards show only the saved participant
   name until opened, then show the original submitted form/answers.
3. Admin cards have an approval shortcut. Superadmin can approve initial pending
   events and submitted changes; approved events without changes show a disabled
   shortcut. Initial pending events remain private and prominently UnApproved.
4. User chose keeping the last approved version live during change review.
   Published callable detail/form/venue/poster/schedule and booking formVersion
   remain stable; only manager editor/review selects `pendingChanges`.
   Promotion is revision-checked and preserves live state/current booking counts.
5. Registration event details reuse normal EventForm options: organiser,
   on-behalf-of, host/contact, Gregorian/Hijri, fixed/prayer clocks, audience,
   subject, speaker and reciters. Capacity, closing date and form builder remain
   registration-specific. Contacts/posters/venue remain private callable data.
6. Exact city-local clocks, overnight end and server UTC instants are supported.
   No default time/duration is invented. Read-only investigation confirmed the
   user's reported existing event lacked all saved clock/instant fields; nothing
   was backfilled or changed. The host must enter and submit its schedule.
7. Normal Public/Unlisted streaming is collection-aware and preserves private
   registration metadata. Registration clients skip legacy writes and delivery.
8. Business detail actions are aligned 88x100 tiles with desktop single-row and
   even phone wrapping. Native-style decorative page headers are implemented.
9. Dynamic cities, Superadmin Add City and related timezone/catalogue wiring are
   implemented. Promotion audience parity exists in code but its release flag
   remains disabled; do not silently enable it.

## Remaining tasks / acceptance (do not mark complete prematurely)

1. Confirm and record actual Android/iOS runtime delivery (OTA group or build/
   store identifiers and channel/runtime). Native source and Functions deployment
   alone do not update installed binaries; consult the Native handover.
   Investigation confirmed no OTA support (`expo-updates`/runtime/channel absent;
   Android updates disabled). The user explicitly authorized version 2.1.1
   TestFlight and Android test APK builds with registration enabled on 17 October.
   These tester builds are being handled by the Native session. No public-store
   submission is authorized; delivery safeguards remain disabled. Do not call
   Native runtime updated until build/distribution identifiers are recorded.
   Native tester configuration is pushed at `05686cd` (2.1.1, dedicated tester
   registration gate). The first iOS noninteractive/frozen-credentials attempt
   failed before queueing: "Credentials are not set up." There is no iOS artifact
   or TestFlight submission; only the remote build number advanced. The Native
   owner selected the existing production certificate (valid until 1 September
   2027), but EAS requires a matching provisioning profile and interactive Apple
   Developer login/2FA. The coordinator owns the user-authentication action.
   No certificate/profile creation, replacement or revocation was completed.
   Android 2.1.1/build 97 FINISHED using the existing keystore, source `05686cd`,
   internal `registration-apk` profile:
   [EAS build c1b96322-25ce-49ca-a2e2-0214fa78e25f](https://expo.dev/accounts/siza-apps/projects/community-events-australia-native/builds/c1b96322-25ce-49ca-a2e2-0214fa78e25f).
   [Download tester APK](https://expo.dev/artifacts/eas/-Hrp4ReIrDwVyReXSm7TSzFg39rg4WD3TV8D4EaiFck.apk).
   Native downloaded and verified actual package/version 2.1.1/code 97/SDK 36,
   valid v2 signature, and packaged registration=true, city=false,
   promotion=false and debug App Check configuration. APK SHA256:
   `95c7b199301923cd5cacb14300844bfedd9a175d7d0bcba3511e9ce9e28609f3`.
   Canonical Native handover is pushed at
   `34f46c866fb637bd4853c13203554f8cde4caf9d`.
   APK availability does not establish installation or device acceptance.
   iOS/TestFlight remains incomplete pending the authentication action above.
2. Authenticated, separately authorized acceptance using real roles/devices:
   new registration, edit, host responses, staged event/form/poster review,
   Superadmin approval, private venue/poster access and stream resume/end.
   Local synthetic workflows and signed-out probes do not establish this.
3. Separately decide/authorize registration reminder backend activation, then
   validate collection identity, permission, timing and device delivery before
   removing the explicit Web hold. Ordinary reminders must remain unaffected.
4. Registration notice/email/push activation and live delivery acceptance remain
   separate work. Do not send test messages or mutate real registrations as an
   incidental release check.
5. Promotion-audience release activation and live acceptance remain separate;
   the implementation is not a reason to enable the flag.
6. Preserve backend/codebase ownership and existing rules/App Check/indexes.
   No rules/index migration or data backfill is part of this release.

## Verification evidence

Current source follow-up: 283 root Node tests, 21 actual React workflows,
95 responsive layouts, phone/desktop panel-heading uniqueness, exact unified
field order, recurrence selectors and admin event-tab isolation all pass.
Series coverage includes true Hijri cadence, DST-safe closing offsets, per-date
prayer clocks, separate capacity/closing, per-occurrence private poster uploads
and quota-aware retry without recreating the series. Unified Web build passes.
These are synthetic/local checks, not a new deployment or device acceptance.

At Web source `9729f2f`: 277 root Node tests, 18 actual React workflows,
95 responsive layouts, phone/desktop unified registration scenarios (including
staged approval and response-name cards), unified Web build and whitespace
checks pass. Browser checks are now available and passed; older notes saying
the browser runtime was unavailable describe a previous checkpoint only.

## Verification commands

```powershell
node --test tests\*.test.mjs
npm test --prefix tests\registration-renderer
node tools\check-unified-web.mjs
git diff --check
```

Restore dependencies only if missing or lockfiles change. Default builds use
setup-template gates and are not deployable production configuration. Release
builds must preserve the existing five live flags/configuration and explicit
registration reminder hold. The offline previews use synthetic in-memory APIs
and refuse live Firebase access. QA artifacts, dependency folders, environment
files and builds remain ignored. No Native build/store publication should be
claimed without concrete delivery evidence.
