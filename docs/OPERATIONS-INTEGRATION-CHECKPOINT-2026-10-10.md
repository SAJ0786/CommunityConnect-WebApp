# Isolated report and moderation integration — 10 October 2026

Latest update: the saved expanded emulator result has now been verified: **28 passed, zero failed**. The previously pending moderation checks are complete. The [Events continuation](EVENT-SERIES-CHECKPOINT-2026-10-10.md) records 153 passing local checks and the new Delete Series client; browser acceptance remains pending. Earlier results below are historical.

## Verified previous results

Later browser update: report submission, administrator review, owner notice and appeal, dismissal, persisted history, account access changes, image upload/save/reopen and narrow layouts now pass. A legacy-field error required an emulator-only rule fix; its two new permission regressions await the user's normal-terminal run. See [the detailed browser checkpoint](BROWSER-ACCEPTANCE-CHECKPOINT-2026-10-10.md). Pagination/takedown UI coverage and remaining Events acceptance are still open.

The user's saved candidate evidence passed: 16 rules checks and nine backend checks, zero failures. Those 25 results are preserved in `.qa-firebase-evidence/accepted-2026-10-10-25-checks/`. ABN and account lifecycle emulator acceptance are now confirmed for the synthetic harness, not for production.

The inventory collected at 2026-10-10T09:23:09.982Z succeeded. Site `community-event-8b639` has live version `cc2dca8280acf5eb`, released 28 September 2026 at 11:37:26.147 UTC. Site `mwacentralcal` was also found. The exact custom-domain mapping is still unverified. The recorded version is a rollback reference for that site; do not assume the domain points there.

The deployed function names include event archival, ABN verification, account lifecycle, enquiries and support. They do **not** include `completeMemberRegistration` or `recordMemberRegistrationDate`. Source parity, deployed rules and released-native compatibility remain open.

## New candidate implementation

Only the fixed demo emulator client enables two new candidate callables: `listDirectoryOperations` and `decideDirectoryReport`. They are not native handler snapshots and are not deployed.

- Private reports are read through a bounded, paginated server projection. City staff see business reports for both their assigned city and the business's current city. Super administrators can also see app feedback. Email recipients, delivery errors, business enquiry/reply outbox entries and private conversation messages are excluded.
- Caller access is checked before reading and again before returning private results. The client also checks current scope and discards results after session closure. Refresh and load-more failures clear displayed private records.
- Decisions require a current version and appeal reference. The transaction retains an audit entry and an owner notice. It rejects stale retries and cross-city decisions. No email or push-delivery trigger is registered.
- Takedown retains the private listing, reports, conversations and promotion records, while withdrawing public listing/promotion projections and the private contact route. More than 200 linked promotions requires a separate archive operation; this candidate rejects before writing.
- Appeals to earlier notices remain discoverable after later decisions. Review retains the original notice and appeal text; it never automatically republishes an archived listing.
- The UI has explicit loading, refresh, pagination and failure states. A refresh failure after an acknowledged decision is not presented as a failed write. Filters operate on loaded pages, ordered by reference rather than chronology.

No production rule, function, Hosting release or native build changed. Existing-account read-only preview remains the only authorised production account workflow.

## Verification

145 local automated checks pass, including ten candidate backend contracts and two added gateway contracts. The installed SDK successfully loads exactly eight isolated callable exports. These checks are not actual transaction-concurrency or rule-emulator proof.

Three actual emulator acceptance checks were added: scoped native support retrieval; concurrent decisions, takedown and owner appeal; cross-city/forged-authority denial and server-only cases. The expanded target is **28 checks** (16 rules + 12 backend). This session's attempt stopped before tests: the local Firebase hub on 127.0.0.1:4400 did not become reachable within 60 seconds. The new three checks are therefore **pending**, not passed. Do not repeat Firebase login for this local startup failure.

Run from the web repository in normal PowerShell:

```powershell
& .\tools\run-firebase-workspace.ps1 -Full -CandidateRules
```

For subsequent browser acceptance, add `-Preview`. Use the emulator mode at http://127.0.0.1:5187/, submit a synthetic business report as Customer, then switch to City admin and open Support delivery records → Review moderation case. Verify a decision, switch to the owner to appeal, and return to administration to review it. Test refresh, phone-width layout, access changes and image uploads. This browser sequence has not been verified in this agent session.

## Remaining limitations

Conversation reports retain the submitted concern, but their free-text conversation ID is not trusted authority for a global conversation block. That separate operation remains unconnected. Older standalone notices whose report IDs do not correspond to native support receipts need an explicit migration/reader contract. The production candidate also needs review of query indexes, deployment configuration and compatibility before activation; emulator acceptance alone cannot prove those.

Next: inspect the expanded emulator result, finish actual browser workflows, then the remaining Events integrations. Real SMS, phone/PWA migration and rollback acceptance and explicit release approval still follow. Native transfers remain pending; released iOS 2.1.0 build 2 and Android 2.0.0 build 94 remain the compatibility targets.
