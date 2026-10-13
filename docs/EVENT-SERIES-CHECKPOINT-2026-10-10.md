# Event series continuation — 10 October 2026

Latest continuation: [11 October archive checkpoint](EVENT-ARCHIVE-CHECKPOINT-2026-10-11.md). The isolated native archival handlers are now implemented and 159 non-network checks pass. Four new backend emulator checks await execution; browser acceptance remains pending. Older handoff details below are historical.

## Accepted evidence

Inspected the latest user-run files in `.qa-firebase-evidence/candidate/`: 16 rules checks and 12 backend checks passed, zero failures. This closes the three pending moderation emulator checks from the preceding checkpoint. No new emulator test was added in this pass; do not ask for another unchanged acceptance run just to reconfirm these 28 results.

## Implemented

Delete Series now opens an accessible confirmation dialog showing the actual future occurrences selected from both native series ID fields. The future/live/historical and Australian timezone selection helper is identical to the native lifecycle helper, with a parity regression check.

The web client sends only `seriesId` and `expectedIds` to the existing `archiveFutureSeriesEvents` endpoint. It does not invoke the older all-series archive endpoint and has no direct delete fallback. The dialog explains that past/live events and archived history are retained.

Selection is discarded if the account changes. The adapter checks a current active administrator profile; final event permissions and stale-series checks belong to the backend. Invalid selections, duplicates, oversized series and malformed acknowledgements fail explicitly. A partial or zero acknowledgement displays the actual count. Any failed attempt clears the selection and requires a refresh before another attempt.

The dialog is keyboard focused, scrolls long occurrence lists and blocks dismissal while its operation is in flight. These behaviours are implemented but browser/phone verification is still pending. The read-only build continues to disable this action at both the UI and service boundary.

## Verification and limits

- **153 local checks passed**, including eight new series selection/transport checks.
- The read-only application and synthetic UI builds passed. Embedded previews were rebuilt after the main build.
- The current deployed endpoint name exists in the earlier inventory, but deployed source parity and actual event archival acceptance have not been verified.
- Browser testing was attempted against the existing full-site address and a newly started synthetic preview. Connections were refused or timed out. The agent stopped only its own temporary server. No browser or mobile layout result is claimed.
- No production write, Firebase rule change, deployment, native build or release occurred.

## Browser handoff

The pending user request is to start and leave open the full emulator preview from normal PowerShell:

```powershell
& .\tools\run-firebase-workspace.ps1 -Full -CandidateRules -Preview
```

That existing command reruns its acceptance prerequisite before serving http://127.0.0.1:5187/. Its purpose now is to keep the browser rehearsal running. Test report → decision → owner appeal → review, then uploads and role changes.

For the new Events dialog, run `node tools/check-ui-preview.mjs` in a separate normal terminal. It serves synthetic UI at http://127.0.0.1:5182/. In My Events, expand a recurring example as administrator, open Delete Series, inspect the two future occurrences, and test cancel/confirm. This transport is in-memory only and does not prove Firebase rules or real archival. Check keyboard focus and a narrow phone viewport.

## Remaining launch work

Browser workflow acceptance; actual event/archive backend compatibility and permission acceptance; Edit Series, Contact Host/inbox and durable reminders; conversation-blocking/legacy-appeal integration; registration prerequisites; authorised hosted SMS and phone/PWA migration/rollback checks. Production activation and native releases remain held under the existing user instructions.
