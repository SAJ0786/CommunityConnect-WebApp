# Prelaunch closing pass — 10 October 2026

Latest update: the saved expanded emulator result has now been verified: **28 passed, zero failed**. The previously pending moderation checks are complete. The [Events continuation](EVENT-SERIES-CHECKPOINT-2026-10-10.md) records 153 passing local checks and the new Delete Series client; browser acceptance remains pending. Earlier results below are historical.

The full replacement is not yet ready to publish. This pass completes additional local integrations; it does not deploy Hosting, rules or functions or enable production writes.

## Latest continuation — supersedes earlier pending results below

The user's expanded suite is now verified: **16 rules + nine backend checks passed**. Hosting/function inventory also succeeded; the live version for site community-event-8b639 is cc2dca8280acf5eb. Custom-domain mapping remains unverified, and both registration functions are absent from the inventory.

The isolated delivery-history reader and listing moderation candidate are now implemented. **145 local checks pass**, and all three preview builds pass. The backend loads eight isolated callables. Three new actual emulator checks are pending because this session's emulator hub failed before tests started; the new target is 28. Conversation blocking and legacy standalone-appeal migration remain unconnected. See [the operations checkpoint](OPERATIONS-INTEGRATION-CHECKPOINT-2026-10-10.md) for exact scope, evidence and the next command. Production remains held.

The sections below record the preceding checkpoint and its then-current results.

## Completed in the preceding pass

- ABN prefill and administrator verification now connect to the isolated Functions emulator. The existing handlers were recovered from the older web backend, wrapped with injected dependencies and recorded with source hashes. ABR transport uses a documented synthetic fixture only (51 824 753 556 / Example Community Catering). No ABR secret, external lookup or real verification is used.
- Account archive/restore now connects to the isolated Auth/Firestore/Functions emulators using the native lifecycle handlers. Synthetic Auth accounts are seeded explicitly. Contract checks cover owned-event archival, calendar deactivation, Auth disable/enable, permissions and the fact that restore does not republish events or reactivate calendar subscriptions.
- The isolated ABN wrapper adds active-account, city and historical-record guards. The recovered handler does not enforce city scope itself. These guards are a candidate correction, not evidence about production. A restored listing may retain archive timestamps and is allowed a new review based on its current status.
- Niaz Arrangement opens the native Food & Catering / Niaz Preparation and supply filter in the event's city. Owner and city-admin permissions match the native flow, including transferred owners and inactive accounts. The service filter survives refresh and the business detail return link. This is read-only browsing and does not place an order or send a message.
- Web event deletion now calls `archiveEventRecords` and requires an acknowledged archive count. It cannot fall back to direct Firestore deletion. Deployment inventory and actual end-to-end event archival acceptance remain pending.
- `node tools/check-release-inventory.mjs` collects Hosting sites/channels and deployed function names without changing Firebase. It writes only sanitised metadata to `.qa-release-inventory.json`; raw Functions configuration is never persisted. It does not prove custom-domain mapping or deployed-source parity.

## Verification and limits

133 local automated checks passed, zero failed. The read-only app, isolated Directory and offline UI builds pass. The isolated backend loads successfully with the installed SDK and exports only the six intended enquiry/support/ABN/account callables. Source/hash checks preserve the existing snapshots; production/reference rules were not edited.

The previously inspected user-run evidence remains 16 candidate rules checks plus five backend checks passed. Four new backend emulator checks have been added for ABN and Auth lifecycle, so the expanded target is 25 checks. Those four have not yet been executed successfully against the actual emulators; do not report the expanded suite as passed. ABN contract checks use synthetic provider responses even when the emulators pass.

Browser acceptance in this session was not completed: the prior local server was unavailable, and the agent-started server could not be reached by the browser. The agent stopped only its own temporary server. No new screenshot or phone acceptance is claimed. The read-only Hosting CLI request could not authenticate here; the user confirms normal PowerShell is already logged in. Do not ask for another login solely because this restricted session failed.

The user reconfirmed native transfers remain pending, iOS 2.1.0 build 2 and Android 2.0.0 build 94 remain the released versions, and they can test the web preview on phones. Native releases remain held.

## Commands requiring the user's normal terminal

Run from the actual web repository, not the chat output folder:

```powershell
cd "C:\Users\sajja\Documents\Codex\2026-08-10\this-chat-is-for-community-events\community-events-deployer"
node tools/check-release-inventory.mjs
& .\tools\run-firebase-workspace.ps1 -Full -CandidateRules
```

The first command is read-only against the existing project. The second writes synthetic fixtures only to `demo-community-connect-web` emulators and evaluates the separate candidate rules. Neither deploys. The expanded suite is justified by new backend integrations; the earlier 21 checks do not need an unchanged rerun on their own.

## Gates still open

| Gate | Work still needed |
| --- | --- |
| Directory operations | Server contracts for delivery-history reading and moderation; current email reports must not be presented as a connected moderation queue. Actual emulator browser workflows and image-upload acceptance. Broader permission acceptance beyond the limited candidate changes. |
| Events | Contact Host/inbox, reminders and series management remain unconnected. Browser verification of Niaz, actual archival acceptance and broader workflow regression. Native reminders use device scheduling; equivalent web behaviour needs an explicit implementation and acceptance, not a timer that only works while a tab stays open. |
| Backend compatibility | Inventory deployed registration/archive/ABN/account endpoints and rules, source mapping for the two released binaries, city/active-account enforcement, real ABR availability, partial-failure handling across Auth and Firestore. Production activation remains held. |
| Hosted and device acceptance | Isolated, explicitly authorised hosted preview after its target/data boundary are reviewed; real phone SMS, iPhone/Android layout, installed PWA upgrade/offline/push and rollback. Existing-account read-only sign-in is the only authorised live-account flow. |
| Release control | Confirm the domain's exact Hosting mapping and old live version, freeze the tested artifact, obtain final approval for the exact Hosting release. Rules/functions changes need separate review and approval; Hosting rollback cannot undo them. |

Continue from these gates. Do not describe unavailable buttons, synthetic backend success or a build as completion of all prelaunch work.
