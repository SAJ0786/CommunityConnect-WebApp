# Emulator browser acceptance — 10 October 2026

The user started the full candidate emulator preview at http://127.0.0.1:5187/. Browser testing used synthetic accounts and records only. No production rules, functions, Hosting release or native build changed.

## Observed browser results

- Customer submitted a business report and received receipt aec73b30b85883de25b221447be7dac49dc9fb8bce9f71b49cab3cb6bb54fd5b.
- City administrator found the queued receipt, opened its case and saved an under-review decision. Its history appeared and repeating the same decision was disabled.
- Switching to a regular member removed private administration content. Switching to an inactive account blocked the account flow.
- The business owner saw the notice and submitted an appeal. The administrator found the appeal and dismissed the report. Reopening the case retained both decision-history entries.
- Owner uploaded the repository fixture public/images/programs-update-header.jpg. A legacy-field rule error initially prevented the listing save; after the local candidate fix below, save and resubmission succeeded. Reopening the editor loaded the persisted image from the Storage emulator on port 9198 (natural width 1108px).
- Public directory retained its previous category fallback while the resubmission awaited review.
- At a 375px viewport the document width was 370px. At 320px it was 315px. The category strip scrolled inside its container; opening the city picker caused no document overflow. Selecting Melbourne displayed one Melbourne business.

Evidence is saved under .qa-firebase-evidence/browser/: saved-logo-mobile.jpg, city-picker-320.jpg and resolved-appeal-desktop.jpg. Phone-width browser checks are not physical-device acceptance.

## Legacy listing fix

The reference owner-update rule directly compared tier and foundingMember, raising an evaluation error when foundingMember was absent. The emulator-only generator now checks that neither field is in the document diff. Missing fields can remain missing; owners cannot add, remove or change either authority field.

Only tests/firebase-integration/ruleCandidate.mjs and its generated firestore.candidate.rules changed, plus two regression cases in rules.test.mjs. Deployable and reference rules remain unchanged. All three rule-candidate generator checks pass; git diff --check passes.

The last accepted emulator evidence remains 16 rules checks plus 12 backend checks, all passing. Two new regression cases cover legacy/current-field preservation and forbidden authority changes/removals/cross-owner edits. The expanded rules suite now has 18 checks. The agent's rerun stopped in emulator readiness with connect EACCES 127.0.0.1:8089; assertions did not run. This is a connection restriction, not a completed regression result. The user has been asked to run the expanded rules suite from a second normal PowerShell window while leaving the preview running.

## Still open

The new 18-check rules result, remaining Events browser/backend acceptance, operations pagination/takedown UI coverage, conversation blocking and legacy standalone appeals remain open. Real phone SMS, physical iPhone/Android PWA acceptance, installed-client upgrade/rollback, deployed-source compatibility and exact custom-domain mapping remain launch gates. No production activation is implied by these local results.
