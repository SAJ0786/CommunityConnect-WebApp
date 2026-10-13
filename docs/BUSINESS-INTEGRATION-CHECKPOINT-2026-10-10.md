# Business workflow integration checkpoint — 10 October 2026

## Result and boundary

The private web workspace now has a Firebase SDK adapter and an isolated local entry point. It is **not activated against production**. The normal app still provides the existing read-only live-data preview at http://localhost:5186/.

The local adapter only constructs a `demo-community-connect-web` client at `127.0.0.1:8089`, on a localhost page, with explicitly named synthetic identities. It imports no production Firebase singleton. The test build rejects imports of that singleton. No rules, Functions, Hosting releases or native builds were deployed.

Review the connected UI with its recording transport at:

http://localhost:5186/firebase-review/?transport=contract

This mode runs the same gateway with an in-memory Firestore contract double. It **does not evaluate Firebase rules** and cannot send real messages or emails. Refresh resets synthetic database records; notification dismissals retain their device-local behaviour. The page explicitly identifies this mode.

## Later continuation

The [isolated backend continuation](ISOLATED-BACKEND-CHECKPOINT-2026-10-10.md) supersedes this checkpoint's earlier unconnected-upload/Functions status: image upload handling and local enquiry/support transports are now implemented, with 115 passing local checks. Actual emulator acceptance is still unverified. ABN/account-lifecycle execution and production changes remain held.

## Implemented and tested locally

| Workflow | Current integration |
| --- | --- |
| Favourites | Native `users.savedBusinesses` array transforms; live profile subscription; filter uses saved IDs. |
| Listings | Native pending submission, terms version and consent time, owner resubmission preserving the published version, no-ABN approval, rejection, visibility, archive and restore contracts. Existing image paths are preserved when their URLs do not change. |
| Promotions | Owner submission/resubmission, approval/rejection and archival. Edited offers leave public display until reviewed. Historical records are retained. |
| Inbox | Participant-scoped feeds, selected conversation messages, read status, reply batches and per-participant blocking. Administrators do not gain conversation access from their role. Message limit matches native/backend: 2000 characters. |
| Notifications | Recipient-scoped updates; mark read; clear ordinary notices on this device without deleting server history. Moderation history remains available. |
| Appeals | Owner-only notice update plus audit in one transaction; repeated submitted appeals are refused. |
| Categories | Native `settings/businessCategories` transaction format, duplicate checks, category icons and custom services in forms and discovery. |
| Administration | Fresh member/profile checks; city validation before listing/promotion decisions; super-only role changes, excluding self and super-administrator targets. |
| Session changes | Listener cleanup, account state/role invalidation, clearing stale private data and cancellation before delayed listing commits. |

The native business service was ported with injected SDK/session dependencies. Source reference: `../sdk51-package-backup/src/services/businesses.js`, SHA-256 `AA115C41F7F82E8CC92E4F46211DAE07C6916E2118B7992900D110A4E1C5C6F2`. Differences include removing the production connectivity probe, preserving document IDs, accepting promotions for a still-published pending business update, and refusing edits to archived promotions.

## Callable adapters prepared, execution still held

The gateway now maps the web UI to `sendBusinessEnquiry`, `submitSupportRequest`, `lookupBusinessAbnForSubmission`, `verifyBusinessAbn`, `adminDeleteUser` and `adminRestoreUser`. Contract tests use recording callbacks. **The local Firebase client does not yet connect a Functions transport**; these actions return a clear unavailable error instead of sending anything elsewhere.

Enquiries consume the actual `threadId` response. Support retries preserve `requestId`; the client cannot choose recipients, city routing or authority. Conversation reports include a thread reference and the supplied reason, not copied conversation contents. ABN lookup uses the actual `active` flag and official name. Account archival/restoration goes through the native lifecycle callable instead of merely changing `isActive`; the confirmation explains that archival also archives the account's events and disables its calendar subscription. Role and lifecycle changes are separate submissions.

Image upload integration and an isolated Storage environment remain unfinished. New image selections fail explicitly, while the selected form contents remain available.

Support delivery records cannot be read directly under the reference rules (`supportSubmissions` and `supportEmailOutbox` deny client reads). The current support callable routes reports to email; it does not populate the old moderation-inbox schema. Those workspace screens now explain the missing backend connection instead of presenting an empty queue as evidence that no records exist. Backend reader/moderation contracts must be designed and tested before enabling them.

## Rules verification and blockers

`tests/firebase-integration/firestore.rules` is an **unchanged copy** of the native reference rules, SHA-256 `529FB93D87E74327365EFAE6BD5C8AF425F3D0226152C1869A434520A59EF97D`. This is not evidence of the currently deployed production rules.

Source inspection identifies two release requirements absent from that copy:

1. Business creation checks registration but not inactive/archived/banned account state.
2. Public business projection writes permit any administrator, without the city restriction used on private business decisions.

The rules suite deliberately asserts the stricter required denials, so these checks are expected to fail against the unchanged reference copy. They must not be changed to accept the permissive behaviour merely to make the suite green. Any proposed fix needs native compatibility review and the existing rules hold lifted before deployment.

Actual emulator execution was attempted through Firebase CLI and the direct cached Java emulator. Java failed with `Unable to establish loopback connection` / `Permission denied: connect`. The prepared PowerShell runner reproduced the failure and saved `.qa-firebase-evidence/emulator-error.log`. **No emulator permission test passed in this session.**

Run this from the web-project folder in your normal PowerShell session:

```powershell
& .\tools\run-firebase-workspace.ps1
```

It starts the cached emulator with the copied rules and a fixed demo project, seeds synthetic data, runs the nine rules checks, saves results to `.qa-firebase-evidence/rules-results.txt`, and stops only the emulator it started. It does not deploy anything. To inspect the SDK-connected UI as well, use `-Preview`; failed permission checks remain visible and do not become release approval. That mode serves http://127.0.0.1:5187/ until Ctrl+C.

## PWA worker correction

Root `/sw.js` now registers explicitly at `/`. Messaging registers at `/firebase-cloud-messaging-push-scope`, waits for its own worker to activate, and passes that registration to `getToken`. Push registration can no longer replace the offline worker by claiming the same scope. Tests cover either registration order, first activation, failure/timeout, retained previous assets, deferred reloads, deep links and unsaved forms. The synthetic upgrade rehearsal server also serves and caches the new helper module.

This uses Firebase's supported [explicit service-worker registration option](https://firebase.google.com/docs/cloud-messaging/web/receive-messages). Real push delivery, old-install migration, installed iOS/Android behaviour and full browser rollback rehearsal still need acceptance testing. The live-data local preview continues to disable workers and push-token writes.

## Verification and remaining release work

98 local automated tests passed, including 23 directory Firebase-contract checks, 12 PWA lifecycle checks and three worker registration checks. The two HTTP rehearsal tests and the nine emulator rules tests are not included in that passing count. Browser recording-mode checks confirmed favourites filtering, reply display, recipient unread state after account switching, administrator conversation exclusion, inactive-account rejection and 320px layout without horizontal overflow. The final browser pass also confirmed custom category/service additions appearing in discovery and an owner appeal reaching the visible "Appeal submitted" state.

The next work is isolated Functions/Storage integration, server permission fixes with old-client compatibility, and the report/moderation backend boundary. Then complete the remaining Events integrations, hosted real-SMS acceptance, installed-device/PWA migration tests and verified Hosting target/rollback preparation. Only after those gates pass should a concrete Hosting-only release be approved. The full replacement is not yet live-ready, and completing it today cannot be guaranteed while those dependencies remain unresolved.
