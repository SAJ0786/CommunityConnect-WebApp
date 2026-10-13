# Community Connect final preview checkpoint — 10 October 2026

**Later UI revision:** The user subsequently requested native-style browsing, city menu improvements and investigation of real-number sign-in. See `NATIVE-BROWSE-REVIEW-2026-10-10.md`. The source/build fingerprints and held-file hash statement below describe the earlier checkpoint, not this newer revision. App's Events label and AuthPage's display text were explicitly updated for that request; Firebase rules and backend code were not changed.

The user confirmed the real-data preview works after the post-login adapter fix. This closes that reported blank-screen defect. It is not a sign-off of every page, every image, live writes, mobile installation or production replacement.

## Completed and verified

- Actual app read-only preview at http://localhost:5186/ with existing-account sign-in authorised by the user.
- User confirmation that the preview works after login; successful public Businesses and Promotions read probes from the preceding pass.
- Full local suite: 61 tests passed on 10 October. Whitespace check passed. The 11 held source files still match their reference hashes.
- Read-only guard, notification Promise-contract and shared form-label regression tests included.
- The built preview and source fingerprints are recorded in preview-fingerprints.json. This is a diagnostic checkpoint, not a frozen production release.

## Remaining work before replacing the live PWA

| Work | Current state | Completion evidence |
| --- | --- | --- |
| Final UI browser suites | Pending after shared Field fix; earlier revision had 111 workspace passes and 43 operations passes before its failure | Both suites complete on current revision, with reviewed screenshots |
| Worker upgrade/rollback rehearsal | Prepared; agent browser fails during startup | Successful browser report; then staging rehearsal with the actual old deployed worker |
| Private Directory Firebase integration | On hold pending scope decision | Account-scoped reads/writes, uploads, enquiries, saved items, moderation and staff permissions tested against existing contracts |
| Read-only preview limitations | Deliberate | Preview blocks edits, uploads, registration, push and most callables; do not confuse it with full integration |
| Messaging and offline worker scope | Existing overlap unresolved | Both functions coexist and pass update/offline/push checks |
| iPhone/Android installed PWA | Pending | Device/version records and installation, navigation, offline, reconnect and update checks |
| Native compatibility | Baselines recorded; exact source mappings unverified | Compatibility confirmed with iOS 2.1.0 build 2 and Android 2.0.0 build 94 before backend changes |
| Hosting destination and rollback | Domain known; hosting site/current release need verification | Verified hosting target and retained rollback version |
| Production release | Not authorised or prepared for publication | Approved integrated candidate on staging, then explicit live release |

## Keep viewing the read-only preview

From the web repository, leave this running in regular PowerShell:

    node tools/preview-live-readonly.mjs --serve-only

Open http://localhost:5186/ in the same browser tab to retain its session. The served build contains public Firebase web configuration; no password/OTP is stored in source. Authentication performs its normal session/SMS bookkeeping. Database content changes, uploads and account edits are blocked by this preview build.

## Next validation commands

Run these from the web repository when a regular browser runner is available:

    & .\tools\run-offline-qa.ps1
    node tools/check-pwa-rehearsal.mjs

These use isolated synthetic fixtures. They do not deploy or change live Firebase. The actual read-only preview runs separately on port 5186.

Firebase rules/functions, native releases and live deployment remain unchanged. Only existing-account sign-in and reading real data in the local preview have been explicitly enabled so far.
