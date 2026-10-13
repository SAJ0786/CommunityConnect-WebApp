# Web authentication acceptance

**On hold at the user's request.** Do not continue sign-in implementation, live OTP/account acceptance, registration-function deployment or Firebase rule changes until the user resumes this work. Local UI development and synthetic visual testing remain authorised. Existing local sign-in changes are preserved.

Production domain: `https://communityconnect.siza.info`, confirmed by the user as already serving the existing PWA. The release will upgrade that site in place.

Native release constraint: both app transfers to the user's accounts must complete before native builds/releases. Preserve support for currently installed Android/iOS versions throughout the delay. A web/backend release cannot assume a new native version is installed.

## Current evidence

- PASS: 18 unit/contract tests, production build and seven synthetic browser scenarios on 1 October 2026.
- PASS: read-only live public directory/config preflight; six approved visible records and matching native/web Firebase project.
- BLOCKED: full real registration acceptance. The user confirmed the registration functions and updated rules have not been deployed. The expected regional completion endpoint returned HTTP 404 to an unauthenticated GET. Authenticated deployment inventory could not be read because local CLI access was denied.
- PASS: reference backend registration tests and JavaScript syntax checks; no live calls.
- No SMS, member account writes, backend deployment or Hosting release performed during preparation.

## Backend prerequisite

Verify `completeMemberRegistration` and `recordMemberRegistrationDate` in `australia-southeast1`, plus compatibility of deployed Firestore rules. The reference implementation is in the existing native checkout under `backend/functions-lifecycle`, with `backend/firebase.lifecycle.json`; associated rules are in `backend/firestore.rules`. The web checkout's default functions source is different. Do not deploy using the broad web `npm run deploy` script.

Before any authorised backend deployment, inspect the exact source revision, rule diff, existing deployed functions and rollback options. Deployment is a separate action and remains pending. A source push or a compiled web bundle does not satisfy this prerequisite.

Reviewed source change: native commit `db01c17180e1a3ba9d01cafc7616b4deee3baa34` adds the completion callable and retry-safe creation trigger. Its rules delta prevents ordinary self-profile updates from modifying `registeredAt`, `profileCompletedAt` and `legalAcceptedAt`. This is the Git parent-to-commit comparison, not a comparison against deployed rules. Restore authenticated CLI access and compare the complete candidate ruleset against the live ruleset before requesting release approval. Native source was only read and tested; its unrelated AndroidManifest change was preserved.

## Real acceptance sequence

### Older-client check before deployment

The local emulator compatibility suite (`node tests/check-legacy-member-rules.cjs`, port 8089, fixed demo project) passed 36 expected permission outcomes. The previous native source's normal profile and favourite writes are accepted by candidate rules. The old web repository's new-profile payload is rejected by both native rules baselines, while its existing-profile edits pass. This incompatibility predates the latest timestamp protections. The live PWA source revision and deployed rules must be established before drawing production conclusions or replacing rules.

Released versions confirmed by the user: **iOS 2.1.0 (build 2)** and **Android 2.0.0 (build 94)**. Mapping these binaries to source revisions/build manifests remains pending; local app configuration has different build numbers. Local cloud CLI access remains denied despite the requested access grant. Neither a native release nor a production rule deployment is cleared by the emulator result.

### User-led live scenarios

Use the full local preview at `http://localhost:5180/` with the existing env file. Check the port before starting it. This preview connects to live Firebase; the user performs real phone/OTP interaction. Keep phone numbers, OTPs and contact details out of reports and screenshots.

| Scenario | Expected result | Status |
| --- | --- | --- |
| Signed-out choice and reload | Events/Directory selection retained; change/back works | Synthetic coverage passed; real navigation pending |
| Guest entry into both experiences | Intended public content available, member-only actions guarded | Live pending |
| Existing complete member | Phone sign-in enters chosen experience; reload retains access | Live pending |
| New/incomplete member | Verified Australian mobile requires valid name, contact email and policy consent | Blocked on backend prerequisite |
| Successful completion | Same UID; server-owned role, phone and joining date; selected destination opens | Blocked on backend prerequisite |
| Save/read failure and retry | No bypass; clear retry; no duplicate identity or client fallback creation | Synthetic passed; live pending |
| Existing administrator | Existing authority preserved; correct Events admin access and newest-first UI/CSV | Live pending |
| Sign-out, return and module switch | Expected auth state and chosen experience; no previous-member data leakage | Live pending |
| Existing Events regression | Browsing, details, existing URLs and authorised member/admin operations work | Live pending |

Use synthetic fixtures for inactive accounts and failure injection unless an appropriate existing test account is available; do not disable or alter real users for testing. Document any unavoidable test-account writes before performing them.

## Later release acceptance

Complete the agreed Directory features and remaining Events theme migration, then verify production configuration, keyboard/mobile accessibility, installed-PWA service-worker upgrade, old links, download page, calendar/unsubscribe routes and Hosting rollback. Keep web feature parity, native-only features and pending work explicit. This checklist does not authorise a release.
