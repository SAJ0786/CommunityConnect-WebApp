# Business conversation moderation checkpoint — 12 October 2026

## Completed locally

The isolated Firebase workspace now supports participant reports and city-scoped administrator blocking/unblocking of a verified business conversation.

- A report derives its business, city and reporter identity from server records. Only an active participant can submit it. Stable request references prevent duplicate reports, and a short submission limit prevents rapid repeats.
- Administrators receive the report text and verified conversation reference, without access to private messages. Free-text references in older reports cannot authorize a conversation block.
- Decisions recheck administrator scope, the report, the business relationship, the current appeal and conversation moderation version in one transaction. Stale or cross-city decisions fail without partial changes.
- Blocking/unblocking records an audit entry and an owner notice. Unblocking preserves participants' own blocks. Member replies remain denied while an administrator block is active.
- The candidate rules also restrict the existing native-shaped direct moderation operation to active administrators assigned to the business city, or super administrators.
- Report receipts say the report was recorded; this candidate does not send email, SMS or push.

The new callable and operations backend remain emulator-only. Production/reference rules, Hosting and released native apps were not changed. The live-account web preview remains read-only.

## Verification

- **187 local tests passed, zero failures.** This excludes the separate registration prototype being developed in another chat.
- **42 actual Firebase emulator checks passed: 22 rules and 20 backend, zero failures.** These include verified report submission, duplicate prevention, privacy, city boundaries, inactive-account denials, block/reply denial/unblock/reply success, and stale-decision rejection.
- The isolated Firebase workspace build passed.
- Evidence is retained under `.qa-firebase-evidence/accepted-2026-10-12-42-checks/`, with source hashes in its manifest. Local logs: `.qa-conversation-local-tests-2026-10-12.txt`, `.qa-conversation-emulator-2026-10-12.log` and `.qa-conversation-build-2026-10-12.log`.
- Browser acceptance of this new moderation flow remains pending. The earlier browser pass covers listing moderation, not this addition. Agent-started preview servers remain unreachable from the in-app browser; repeated server starts are not passing evidence.

## Remaining work before a full replacement launch

1. Complete or explicitly defer legacy standalone-appeal handling and full series date/recurrence rescheduling. The existing series editor changes shared details only.
2. Finish browser acceptance for Contact Host/inbox, reminders, series editing and conversation moderation, including mobile layout and error recovery.
3. Resolve registration/backend prerequisites and verify compatibility with released iOS 2.1.0 build 2 and Android 2.0.0 build 94. Account transfers and native releases remain held.
4. Confirm the exact Hosting custom-domain target and rollback release, then obtain approval for the isolated hosted acceptance preview and any required production changes.
5. Complete real-number sign-in, browser-push delivery, installed PWA upgrade/offline/rollback and iPhone/Android acceptance. These require the approved hosted/backend setup and device participation.

This checkpoint closes the local conversation moderation implementation and automated acceptance milestone. It does not authorize deployment or establish full release readiness.
