# Local rule candidate — 10 October 2026

This is an emulator-only proposal. Neither the native reference rules, web deployable rules, deployed Firebase rules nor the live PWA have been changed. The user's production-rules hold remains in effect.

## Latest observed emulator result

11 October accepted update: the saved candidate rules suite now confirms **18 passed, zero failed**, including the legacy-field owner resubmission and authority-mutation denial cases. The backend suite confirms **16 passed, zero failed**, for **34 emulator checks total**. See [the current checkpoint](EVENT-ARCHIVE-CHECKPOINT-2026-10-11.md). This supersedes the pending regression note below. The candidate remains local only and is not approved for deployment.

Later update: the accepted suite grew to 16 rules plus 12 backend checks, all passing. Browser acceptance then exposed an owner image-save error on an older listing without foundingMember. The emulator candidate now protects tier/foundingMember using changed-key detection, tolerating absent fields without allowing owners to alter them. Browser save/reopen passed after the fix and three generator checks passed. Two additional rule regressions (18 rules checks total) await a normal-terminal run because the agent terminal cannot connect to the emulator. See [the browser checkpoint](BROWSER-ACCEPTANCE-CHECKPOINT-2026-10-10.md). Results below are earlier checkpoints.

The user's second PowerShell run completed the setup and both suites. All **five backend acceptance checks passed**, covering enquiry creation/participant reads, support receipt persistence and retry, the local inactive-account wrapper, and both Storage permission/size checks. No delivery trigger was enabled.

The rules suite reported eight passes and one failure. The confirmed failure allowed a Sydney administrator to update the Melbourne public business projection (`200` instead of `403`). This establishes a gap in the **reference snapshot tested locally**, not in an independently verified production deployment.

The inactive-account test's apparent pass was not valid evidence: it submitted a raw fixture missing `categoryId`, `abnVerified` and `foundingMember`. The rules could reject that malformed listing independently of account status. The corrected check first proves a complete submission succeeds for an active account, then changes only the owner/identity for the inactive attempt. The reference snapshot is expected to fail this corrected denial check; that result has not yet been observed.

## Candidate changes

`tests/firebase-integration/firestore.candidate.rules` is generated separately from the unchanged reference snapshot. `firebase.candidate.json` selects it only for the local emulator. The normal `-Full` command still selects the reference rules.

The candidate adds an account-state condition to private business creation and public business writes. Existing profiles without newer status fields remain eligible, while explicit `isActive: false`, `active: false` and archived/banned/deleted account states are refused. It does not introduce new registration fields or change the Events/registration rules.

Public business create/update/delete authority is scoped to the city of the authoritative private business before and after a batch, together with the public projection's city. Changing a public city field cannot grant authority over a different-city private record. Super Admin authority and an active owner's withdrawal permission are retained. [Firebase documents `getAfter` for checking the final state of atomic writes](https://firebase.google.com/docs/firestore/manage-data/transactions).

This is a limited proposal, not a complete security audit. Other areas, including contact routing, promotion administration, inactive-account updates beyond these operations and server callables, still need their own permission/compatibility review. The candidate is not approved for production deployment.

## Verified emulator acceptance

The user's candidate run completed successfully on 10 October. The saved `.qa-firebase-evidence/candidate/rules-results.txt` was inspected and confirms **16 passed, zero failed**. This includes positive same-city controls, forged-city attempts, cross-city creation/deletion, corrected account-state controls, Super Admin and owner operations, and native-shaped approval/archive batches.

The saved `backend-results.txt` confirms **five passed, zero failed**, and `setup-results.txt` confirms database readiness. Thus **all 21 checks in this isolated emulator suite passed**. The 121 previously passing local checks are separate evidence. The agent session's emulator-hub restriction did not prevent verification of the user's saved successful run.

For a future rerun from the web-project folder in normal PowerShell (no repeat is needed now):

```powershell
& .\tools\run-firebase-workspace.ps1 -Full -CandidateRules
```

This generates/selects only the local candidate and runs the 16 rules checks plus the five backend checks. There is no deployment command. New evidence is separated into `.qa-firebase-evidence/candidate/` and `.qa-firebase-evidence/reference/`, so the proposal's results cannot be mistaken for the unchanged reference's results. Add `-Preview` only if you also want to inspect the local synthetic UI afterwards.

Next, complete the remaining integrations and permission coverage, and review compatibility with the released native clients. This suite does not establish actual released-binary compatibility, email/push delivery, browser upload completion or full Events acceptance. Any future production rule change needs separate approval after the existing hold is lifted.
