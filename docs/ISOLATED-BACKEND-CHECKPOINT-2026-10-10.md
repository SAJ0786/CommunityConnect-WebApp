# Isolated backend continuation — 10 October 2026

This continues the [Business integration checkpoint](BUSINESS-INTEGRATION-CHECKPOINT-2026-10-10.md). Production, deployed Firebase rules, the existing PWA and native releases were not changed. All new write paths remain inside the synthetic local rehearsal.

## Implemented

- Business logo, cover and promotion-image uploads now use the Storage SDK connected to `127.0.0.1:9198`, with a fixed demo bucket and synthetic owner token. New files use native `business-images/{ownerUid}/{fileName}` paths. Types, file signatures, nonempty size and the native strict **smaller than 5 MB** limit are checked. The form picker now uses the same size boundary.
- Listing/promotion ownership, state and payload validation happen before uploads. The account is checked again after upload. A failure before saving cleans only objects created by that attempt. Previously published images are retained while a listing update awaits review. Existing promotion image paths now survive an unchanged form submission; forged paths are ignored.
- If a database save returns an uncertain outcome, its new images are retained. Deleting them could break a record whose write succeeded. An eventual production orphan-cleanup policy remains separate work.
- A local callable transport now connects only `sendBusinessEnquiry` and `submitSupportRequest` to `127.0.0.1:5002/demo-community-connect-web/australia-southeast1`. It implements Firebase's [callable protocol](https://firebase.google.com/docs/functions/callable-reference), preserves error codes, bounds requests and aborts them on account teardown. It cannot accept an arbitrary endpoint or function name. ABN and account lifecycle adapters remain unconnected.
- The isolated backend runs native enquiry/support handler snapshots. It refuses a non-demo project or missing/wrong emulator endpoints and accepts only synthetic test identities. An additional wrapper rejects inactive test profiles; this wrapper is **not evidence that production handlers enforce that check**.
- Email/push/background delivery triggers are not exported. Email rendering and transport are deliberately unavailable. Support records remain queued locally; no real email or SMS is sent. This tests submission/routing, not delivery acceptance.

## Source references

The preparation script reads `../sdk51-package-backup/backend/functions-business-workflow` and records native hashes in `tests/firebase-integration/functions/native/source-hashes.json`. It refuses source drift against the recorded snapshot. The enquiry handler body and support/notification-policy files are preserved; dependency injection and the emulator guard are test harness code. The email template is a throwing test stub, not a native snapshot.

Storage rules are an unchanged copy of `../sdk51-package-backup/backend/storage.rules`, SHA-256 `6CF9F20003F3C42ACCE621B5EF31CA155013AFDA21D270FF4C69576D2876B088`. They are a reference snapshot, not an inventory of deployed rules. No rule fix was deployed or silently substituted for acceptance tests.

## Verification

**115 local automated checks passed.** The 17 additions cover image validation/cleanup/retention and permission checks before upload, local callable boundaries and cancellation, and actual native handler logic for thread creation, blocks, owner unread counts, support idempotency, rate limiting and city routing. These use recording SDKs/transports; they do not evaluate Firebase rules or network concurrency.

The isolated Firebase and offline workspace builds passed. A Storage SDK export mismatch discovered during building was corrected using the installed SDK's instance retry settings; missing exports now fail the isolated build. Browser checks confirmed that the rebuilt SDK client renders an offline error with Retry when emulators are absent, and that the synthetic owner workspace still opens.

**Excluded from that passing count:** nine Firestore permission checks, five actual Functions/Storage acceptance checks, and two HTTP PWA rehearsal checks. None was represented as a pass.

The current execution session denies creating the dependency junction required by the isolated Functions workspace. The prior Java emulator attempt also failed its loopback connection with `Permission denied: connect`. Consequently, no end-to-end Storage upload or Functions request has been verified against running emulators here. These are local execution restrictions, not an automatic approval-review rejection.

## Run the full isolated acceptance suite

From `C:\Users\sajja\Documents\Codex\2026-08-10\this-chat-is-for-community-events\community-events-deployer` in normal PowerShell:

```powershell
& .\tools\run-firebase-workspace.ps1 -Full
```

The runner prepares the checked native snapshots, links already-installed Firebase SDKs without changing the native project, starts Auth/Firestore/Storage/Functions for the fixed demo project, runs both acceptance suites sequentially and saves their output under `.qa-firebase-evidence`. It does not deploy. Add `-Preview` to reseed and inspect http://127.0.0.1:5187/ after tests; failed checks stay failed, and Ctrl+C stops the preview/emulators.

The existing source-reference Firestore rules still have the two previously identified release gaps: inactive-account creation and cross-city public projection writes. Their denial tests are deliberately expected to fail until a reviewed compatible rule candidate exists. A successful emulator startup alone is not launch approval.

## Remaining work

Latest update: the user's next run passed **all five backend checks**. The reference rules allowed a cross-city public write; the inactive-account test also needed correction to use a complete listing and active control. See the [separate local rule candidate and expanded acceptance checks](LOCAL-RULE-CANDIDATE-2026-10-10.md). This supersedes the pending backend-verification status below; it does not approve a production deployment.

### User-run emulator results and fixes, later on 10 October

The supplied PowerShell output confirms all four emulators started and only the two intended callables loaded. **Three of five backend acceptance checks passed:** both Storage checks and the isolated inactive-account wrapper check. The nine Firestore checks did not reach their assertions because their shared fixture setup timed out. The two callable checks reached the handlers but failed at the legacy `admin.firestore.FieldValue.serverTimestamp` lookup. Those failures are not permission-test results or production-backend evidence.

The harness now imports `initializeApp`, `getFirestore` and `FieldValue` from the modular Admin SDK entry points, passing an explicit `FieldValue` dependency into the unchanged native handler snapshots. A regression check reproduces a legacy namespace with missing static properties. The runner now waits up to 60 seconds for an actual local Firestore read before running suites, with bounded retries for transient startup errors and a 15-second per-request timeout. Permission/configuration responses are not retried into success. Setup evidence is written separately, and unrun suite logs are labelled to avoid showing stale results.

All 118 local automated checks passed, including the new startup/bootstrap regression checks. A full corrected emulator rerun was attempted from the agent session but could not start the hub on `127.0.0.1:4400`; its results still need confirmation in normal PowerShell using the same `-Full` command above. No production code, rules, deployment or native release was changed by this repair.

Complete actual emulator acceptance; isolated ABN/account-lifecycle integration; report/moderation backend access; old-native-client compatibility and permission corrections; the outstanding Events workflows; authorised hosted real-phone sign-in; installed-device PWA upgrade/rollback checks; and verified Hosting target/release preparation. The full replacement remains undeployed and is not yet live-ready.
