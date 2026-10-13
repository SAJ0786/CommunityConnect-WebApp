# Events archival acceptance continuation — 11 October 2026

## Latest accepted result

The user-run evidence was inspected on 11 October: **18 rules checks and 16 backend checks passed, zero failures, cancellations or skips**. Database readiness also passed. Results are preserved under .qa-firebase-evidence/accepted-2026-10-11-34-checks/.

This closes the two legacy authority-field regression cases and the four new event archival emulator cases. Single-event audit/history retention, unauthorized/inactive/live/cross-city denial, future-series deduplication and history retention, stale selections and mixed-city denial all passed against the actual demo emulators. The synthetic Events dialog/browser pass is recorded below. No unchanged rerun is needed.

The pending-34 language below describes the earlier checkpoint and is superseded by this result. Full production parity, remaining feature integrations and physical-device/PWA/hosted acceptance remain open. No deployment or native release occurred.

Production writes, rules/functions/Hosting deployment and native releases remain held. This change adds two existing native event archival handlers to the isolated demo backend; it does not deploy or alter the native backend.

## Implemented

- The preparation tool copies the reviewed native archiveEventRecords and archiveFutureSeriesEvents bodies plus their timezone helper into dependency-injected snapshots. Source hashes and a parity test guard against unnoticed drift. No production entrypoint or delivery trigger is imported.
- The demo Functions harness now exposes ten callables. Its synthetic-identity and active-account guards also cover archival. The single-event route rejects the old all-series payload. The series route requires an administrator, matching the web action's existing availability. These are emulator candidate restrictions, not verified deployed behaviour.
- Six local contract checks cover source parity, owner archival with retained audit history, denied single-event operations, both native series fields and deduplication, stale/mixed-city selections, and the transaction recheck when a selected event becomes live.
- Four actual emulator checks were added to backend.test.mjs for single-event persistence/denials and future-series persistence/stale/permission cases. They are pending execution.

## Verified

159 non-network local checks passed, zero failed. The two PWA rehearsal server tests cannot run in this restricted shell: localhost connections fail with EACCES. They were excluded explicitly from the successful 159-check command; no passing PWA result is claimed.

The offline Events UI build and isolated Firebase workspace build passed. The installed Firebase SDK loaded all ten intended callables successfully. git diff --check passed.

The last accepted emulator evidence remains 16 rules + 12 backend checks (28 total), preserved under .qa-firebase-evidence/accepted-2026-10-10-28-checks/. The two legacy-field rule regressions from the previous pass and four new backend tests are still pending. The new acceptance target is 18 rules + 16 backend = 34, zero failures.

## Normal-terminal acceptance

### Completed browser pass on port 5192

The user started the alternate-port preview using `node tools/check-ui-preview.mjs --port=5192`. The agent verified it in the browser on 11 October:

- Delete Series listed three future occurrences (including today's 10:00 occurrence, still future at test time). Cancel and Escape closed without archiving; focus returned to Delete Series. Tab and Shift+Tab wrapped between the dialog controls.
- Ordinary owner role had Delete Series disabled; administrator role could open it.
- Confirm displayed “3 future events archived.” Reopening reported no future events; Refresh selection retained that empty-selection state with no confirm button.
- At 320×740, document width was 315px and the dialog was contained between x=16 and x=299. Text and buttons fit.
- Dua-e-Tawassul selected the matching event; Test Event was absent from the type buttons. The open city menu stayed between x=16 and x=264 with internal vertical scrolling. Melbourne produced the expected empty state. The viewport override was reset and the preview returned to Sydney.

Evidence: .qa-firebase-evidence/browser/series-confirmation-320.jpg, series-confirmed-320.jpg and events-city-menu-320.jpg.

This closes the synthetic Delete Series dialog/browser acceptance only. Its in-memory service records the selection as archived during the session, but the static Home fixture and a full page reload restore fixture rows; this is not persistence evidence. No Firebase or production event was archived by these browser actions. The actual emulator target remains 34 pending checks; saved results still contain the older 16+12 pass counts.

The original startup notes below are historical; the working browser URL is now http://127.0.0.1:5192/?screen=my.

The browser could not reach the agent-started Events server. That child was stopped; no user-owned server was stopped. The user has been asked to start the following from the actual web repository and leave it open:

```powershell
node tools/check-ui-preview.mjs
```

Open http://127.0.0.1:5182/?screen=my. In My Events, expand the recurring example as an administrator and open Delete Series. Check selection, cancel, confirm, keyboard focus and narrow layout. This UI preview uses an in-memory transport; it does not prove backend persistence.

For the updated real emulator tests, stop the previous emulator run with Ctrl+C in its own terminal if it is still running, then:

```powershell
& .\tools\run-firebase-workspace.ps1 -Full -CandidateRules -Preview
```

This refreshes the local backend snapshots and evaluates the new 34-check suite before serving the Directory rehearsal on port 5187. It deploys nothing. The Events synthetic UI and Directory emulator UI remain distinct previews.

## Remaining scope

Actual emulator execution and Events browser acceptance remain open. These contract checks do not establish production source parity, physical-device behaviour or concurrency guarantees beyond the snapshot's transaction logic. Single-event archival follows the native handler's read-then-batch behaviour; it is not a newly transactionally hardened production endpoint. Large series are processed in chunks, so an interrupted operation requires refreshing the authoritative selection before retry.

Contact Host/inbox, durable reminders and Edit Series remain unconnected. Conversation blocking and legacy standalone appeals, registration compatibility, hosted real SMS, physical-device/PWA upgrade and rollback acceptance, exact custom-domain mapping and final release approval remain separate launch gates. The released native versions remain iOS 2.1.0 build 2 and Android 2.0.0 build 94.
