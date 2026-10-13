# Events workflow checkpoint — 12 October 2026

## Status and boundaries

Contact Host, Host Inbox, shared future-series editing and a browser-push reminder candidate are implemented locally. This is not production activation or complete native workflow parity. Hosting, production rules/functions and native builds remain held. Existing-account production preview stays read-only. Compatibility targets remain iOS 2.1.0 build 2 and Android 2.0.0 build 94 while transfers are pending.

## Implemented

- Contact Host uses native deterministic thread IDs, participant lists and message shapes. Sender and host can reply and mark read; administrator status alone cannot read a private thread. The inbox shows the latest 200 messages in chronological order, clears subscriptions on account changes, and prevents duplicate submission while sending. Errors warn users to check the conversation before retrying an uncertain send.
- Edit Series selects future, non-live occurrences across both native series ID fields. It previews the affected occurrences and applies shared changes in one transaction, rechecking account state, edit permission and every original record. Full-record comparison also detects older clients that do not advance updatedAt. Ownership, status, series IDs and dates cannot be changed by this form. Prayer-based times are recomputed for each occurrence.
- Browser reminders offer 15/30/60/180 minutes or one day before an event. Durable records support read, replacement and cancellation. Event timestamps use Australian city/state timezones; invalid and ambiguous daylight-saving times are rejected.
- The proposed worker checks current event/account/token eligibility, responds to moved events, claims each revision transactionally, and records acknowledgement separately from an uncertain delivery. It never automatically retries an uncertain dispatch. Crashed dispatches become unconfirmed after five minutes.
- Data-only FCM payloads avoid duplicate automatic/custom notifications. The messaging worker retains the event ID and notification tag; a notification click opens the same-origin event route. Foreground permission activation and notification routing are covered in source.
- The synthetic UI preview now has stateful messaging, reminder and series-edit services, role changes and an error mode. Its reminders are simulations, not scheduled browser notifications.

## Verification

- **181 local automated tests passed, zero failures**, including the two local PWA rehearsal tests that were previously blocked by networking.
- **38 actual emulator acceptance tests passed, zero failures: 20 Firestore rules + 18 backend tests.** This includes native-shaped Contact Host batches, participant-only access, forged host/inactive/hidden-event denials, reminder persistence/cancellation/account isolation, and competing Firestore transactions producing only one simulated dispatch.
- No real SMS, email, push or production writes were sent by these tests.
- Evidence: .qa-local-tests-2026-10-12.txt, .qa-firebase-evidence/candidate/{rules-results,backend-results,setup-results}.txt; retained separately under .qa-firebase-evidence/accepted-2026-10-12-38-checks/.
- Synthetic UI and read-only application builds passed. The full application build is also checked separately; its log is .qa-full-build-2026-10-12.log. These are compilation checks, not device acceptance.
- **New browser UI acceptance is pending.** The in-app browser could not reach the server started in the sandbox. A normal PowerShell server on port 5193 was requested. Do not reuse the previous Delete Series browser acceptance as evidence for the new screens.

## Resume browser acceptance

Later on 12 October, the user was away and asked Codex to start the preview independently. Codex rebuilt and started port 5193, obtained turn-scoped network permission and restarted it, then also tested a localhost-bound preview on port 5194. Both browser navigations timed out. These are startup/build successes only, not browser acceptance. Both agent-started servers were stopped afterward so their ports are free. No test rerun or production change was performed during this retry.

From the web-project folder in normal PowerShell:

```powershell
node tools/check-ui-preview.mjs --port=5193
```

Keep the window open, then open http://127.0.0.1:5193/?screen=my.

1. Select member role, expand another host's event and send a synthetic Contact Host message. Open Host Inbox; check the sent text, then switch to owner and reply. Check privacy when switching roles and error handling with Review state set to error.
2. Use owner/admin Edit Series. Review the future occurrence list, update shared details, save and reopen. Check stale selections through the service tests; the UI mock is not a security or transaction proof.
3. Open Reminder, save each available interval, close/reopen, change and remove it. Check failed loading/saving and keyboard close/focus. No browser notification prompt should occur in this synthetic build.
4. Check these dialogs and the inbox at 320px/375px and desktop widths: no horizontal overflow, trapped dialog focus, visible errors and controls, readable long messages.

The expanded emulator acceptance is already complete; an unchanged rerun is not required.

## Reminder deployment candidate and remaining release work

The deployable candidate logic is functions/web-event-reminders.cjs and functions/web-event-reminder-schedule.cjs. Neither is registered by functions/index.js. The emulator imports only the handler module and always injects a simulated sender for dispatch tests. The browser flag VITE_EVENT_REMINDERS_ENABLED defaults off.

After separate approval, integrate the registration factory with the intended backend's Admin SDK, onCall, onSchedule and messaging dependencies, with enabled:true. Review exactly those four exports: getEventReminder, setEventReminder, removeEventReminder and deliverWebEventReminders. Do not deploy the legacy functions entry point as an incidental part of this milestone. Keep webEventReminders and webReminderWorkerState inaccessible to direct client writes (currently denied by the rules fallback).

The scheduler runs every minute, scans pending/dispatching records in document-ID order, and persists its cursor. Each invocation is limited to 1,000 records or 45 seconds; a full sweep may take multiple minutes at scale. Reading every pending reminder detects events moved earlier but has a Firestore cost. Measure backlog and costs, and review indexing, capacity, record retention and monitoring before activation. Acknowledged means accepted by FCM, not displayed or read. Browser/OS restrictions or lost acknowledgements can cause missed reminders. Cancellation cannot recall a push already handed to FCM.

Before enabling the flag: validate the web VAPID configuration, deploy only the approved backend candidate, and test real foreground/background/tab-closed delivery, revocation, token rotation, sign-out/shared-device behavior, event moves/cancellation and notification links on Android and iPhone/Home Screen. Also finish real-number sign-in, old native-client compatibility and the existing Hosting/PWA migration and rollback gates.

Series recurrence-pattern/date rescheduling is not implemented by the shared-details editor and must be implemented or explicitly deferred before declaring full native parity. The other previously recorded launch gates (including remaining business workflows and production registration prerequisites) remain open.

Technical references: [Firebase receiving web messages](https://firebase.google.com/docs/cloud-messaging/web/receive-messages) and [scheduled functions](https://firebase.google.com/docs/functions/schedule-functions).
