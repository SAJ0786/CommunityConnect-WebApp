# Community Connect web launch checklist — 10 October 2026

## LIVE Hosting replacement - 13 October 2026, 7:29 pm Sydney

Production is now https://communityconnect.siza.info, version `c21e1ca7ed9d707d`, promoted from the verified web-final-review channel at 2026-10-13T08:29:24.454Z. The user explicitly requested replacement after the menu fix. This current status supersedes the historical production holds below.

The desktop account menu is anchored 8px below its top-right button, with matching right edges; mobile retains its bottom sheet. Verified on the final live public directory at 1280 x 900 and on the preview's Events/Business menus. Signed-out entry panels were visually checked. All 37 focused tests passed and all 130 live files match the final candidate; three app entry routes return the app shell. Evidence: `.qa-live-release-tests.log`, `.qa-web-release/live-hosted-file-verification.json`, `.qa-web-release/hosting-release-record.json`, and `.qa-web-release/live-menu-2026-10-13.jpg`.

This release changed Firebase Hosting only. No Functions, Firestore rules, Storage rules or native builds were deployed in this release. Existing deployed backend services remain in use.

The previous PWA version `cc2dca8280acf5eb` was preserved before replacement in `web-rollback-20261013`, which expires 20 October 2026 at approximately 7:23 pm Sydney. To restore it if needed (not executed):

```powershell
node "$env:APPDATA/npm/node_modules/firebase-tools/lib/bin/firebase.js" hosting:clone community-event-8b639:web-rollback-20261013 community-event-8b639:live --project community-event-8b639 --non-interactive
```

Device follow-ups remain open: actual iPhone/PC push and scheduled-reminder delivery, installed old-PWA update/offline behavior, Android acceptance, and administrator screen/action acceptance with an admin account. Earlier user-confirmed iPhone/PC sign-in and browsing remain valid for the preview tested then, not proof of these outstanding checks. Worker health is current but does not prove device delivery. No live data edits, SMS or test push were made for this browser QA.

---

## Native screen reconciliation — 13 October 2026 evening

Updated the existing web-final-review preview after comparing the native source. Changes include the four Events Quick access panels (Map/List, Live, Hijri, Calendar), hamburger controls, six native notification preferences and default home module, shared Notifications from the top bell, left-aligned directory sidebar icons, compact entry/sign-in panels, and native Events/Business admin menu labels and grouping. Events admin now separates Calendar Settings, Community Messaging, Import & Export, Diagnostics Register and Tools. Diagnostic review remains Super Admin restricted; no roles or rules changed.

Hijri Calendar now shows Hijri-first Today and next observance, city-based Jafari prayer times with sunrise/sunset, conversion in both directions with day validation, and Key Islamic Events with multi-select types and a current-month default. **No Azaan alarm option is displayed**, per the user's instruction. Rest of Australia explicitly labels Sydney reference times. Native sources were read only.

Validation: 21 focused tests passed, production candidate built, diff whitespace check passed. Browser checks on the hosted preview confirmed Quick access, hamburger, all six profile preferences, shared Notifications, 390px calendar without horizontal overflow or Azaan controls, cross-year Eid filtering and invalid Hijri input handling. At 1280px the directory sidebar buttons all have icons and left alignment. No account settings or notification read states were changed for QA; no test push was sent. Browser permission setup remains available even when the shared account push preference is already on.

Pending acceptance: administrator screens with an admin account, compact sign-in/experience panels in a signed-out session, iPhone installed-app layout, push/reminder delivery and update/offline checks. The regular member test session cannot validate admin data or actions. Earlier iPhone/PC browsing and sign-in acceptance does not cover these newly revised screens. Production Hosting replacement remains held; this pass deploys only the existing review channel, with no Functions or rules deployment.


**13 October navigation update:** Native-style mobile bars, account Menu sheets and grouped admin dashboards are published to the integrated final-review preview. 15 focused tests and 129 hosted-file checks passed. Mobile member navigation was verified at 390px; administrator/real-device visual acceptance and push testing remain pending. Live Hosting is unchanged. See the latest section of [release status](RELEASE-STATUS-2026-10-12.md).

**Current authority and status, 12 October:** The user authorised the full web deployment once remaining checks pass. A separate read-only Hosting acceptance preview has been published; the live channel is unchanged. The user can test on iPhone and PC. Native releases remain held pending account transfers. The consolidated [release status](RELEASE-STATUS-2026-10-12.md) supersedes the historical holds and counts below. Do not request the same release approval again.

## Latest completed work

**Earlier implementation pass, 12 October:** Earlier owner appeals and Gregorian/Hijri future-series rescheduling passed 196 local tests and 44 emulator checks. The earlier Hosting failure was misclassified using FirebaseError's default status; it was not a confirmed HTTP 500. Credential-cache access has since been corrected and the Hosting inventory succeeded. See the consolidated current release status for subsequent integration and acceptance evidence.

**Later 12 October update:** Verified business conversation reporting and city-scoped block/unblock are implemented in the isolated workspace. **187 local tests and 42 emulator checks (22 rules + 20 backend) passed, zero failed; the isolated workspace build passed.** Conversation blocking is no longer an implementation gap in that workspace, but browser acceptance and production integration remain pending. Legacy standalone appeals and full series rescheduling remain open. See [the conversation moderation checkpoint](CONVERSATION-MODERATION-CHECKPOINT-2026-10-12.md). These results supersede older test counts and conversation-blocking gap statements below.

**12 October update:** Contact Host/inbox, shared future-series editing and the browser-push reminder candidate are implemented locally. **181 local tests and 38 emulator checks (20 rules + 18 backend) passed, zero failed.** New screen acceptance awaits a normal-terminal preview on port 5193; real push/device acceptance and production activation remain held. Series date/recurrence-pattern rescheduling is still outside the implemented editor. See [the current checkpoint](EVENT-WORKFLOWS-CHECKPOINT-2026-10-12.md). This supersedes older feature-gap and acceptance-count statements below; those paragraphs describe earlier milestones.

Latest verified acceptance on 11 October: **all 34 emulator checks passed (18 rules + 16 backend), zero failed**. The legacy-listing rule regression and Events archival backend checks are complete in the isolated demo. The Delete Series synthetic browser pass also passed. See [accepted evidence](EVENT-ARCHIVE-CHECKPOINT-2026-10-11.md). This supersedes the pending-34 notes below; do not request an unchanged rerun. Next feature gaps remain Contact Host/inbox, Edit Series and durable reminders, alongside the previously recorded operations and release gates.

Later 11 October browser update: the user-started port 5192 preview passed synthetic Delete Series confirmation/cancellation, keyboard focus, owner/admin action availability, empty-selection recovery, event-type filtering and 320px dialog/city-menu containment. See the browser section of [the Events checkpoint](EVENT-ARCHIVE-CHECKPOINT-2026-10-11.md). This supersedes the pending dialog/browser status below; the expanded 34-check Firebase acceptance is still pending.

11 October continuation: the native event archive handlers are now included in the isolated backend, with six new contract checks. **159 non-network checks pass**, both rehearsal builds pass and ten isolated callables load. The expanded emulator target is **34 checks (18 rules + 16 backend)**, still pending; the last accepted evidence remains 28. Events browser testing awaits a normal-terminal UI server. See [the current Events checkpoint](EVENT-ARCHIVE-CHECKPOINT-2026-10-11.md).

Latest browser pass: synthetic report → administrator review → owner appeal → dismissal, account access changes, persisted image upload and 320/375px layout checks passed. A missing legacy-field error was fixed only in the emulator rule candidate. Three generator checks pass; the two added rule regressions await a normal-terminal emulator run (18 rules checks total). See [browser evidence and remaining limits](BROWSER-ACCEPTANCE-CHECKPOINT-2026-10-10.md). The earlier 28-check evidence predates this final candidate adjustment.

Business discovery now retains the existing native public fields instead of discarding them. Near me uses public location coordinates, rounded to two decimals for suburb-only listings, requests browser location only after a click and sorts within the selected city. Visitor location is held in component memory, not saved or transmitted by this filter. Records without coordinates are omitted. Recently added uses firstPublishedAt, with legacy createdAt/approvedAt fallback, for an inclusive 30-day window and newest-first order; updatedAt is deliberately ignored.

The earlier statement that the public business feed lacked these fields was too broad: native publication source already includes them, while the web projection discarded them. Actual browser testing of the rebuilt public feed returned six recently published Sydney listings. An anonymous shell REST inspection failed DNS resolution, so it provided no field inventory evidence.

Verification: 18 relevant unit tests passed, including coordinate privacy, malformed data, date boundaries, original-publication priority and city-scoped distance order. Actual and synthetic builds passed. Browser synthetic nearest sorting produced three located businesses in distance order, excluded the coordinate-less record, and recent sorting excluded the 45-day-old record. 320px layout had document width 315px. Real browser geolocation permission was not granted or exercised by the agent; that device check remains pending. Favourites remains held.

## Ordered gates for the full replacement launch

### Integration checkpoint added later on 10 October

The isolated Business Directory gateway, image handling, enquiry/support transport and native-handler harness are implemented. Categories, appeals, inbox and owner/admin workflows are included. The actual app remains read-only. ABN/account lifecycle have passed the expanded isolated emulator acceptance; production compatibility remains pending. Delivery history and listing moderation are now implemented as an emulator-only candidate, including owner appeals. Their three actual emulator checks now pass; browser acceptance remains pending; conversation blocking and legacy standalone appeals need further work. The latest [prelaunch closing pass](PRELAUNCH-CLOSING-PASS-2026-10-10.md) records 153 passing local checks, the Niaz browsing connection, native event archival correction and remaining gates. Earlier details are in the [Business integration checkpoint](BUSINESS-INTEGRATION-CHECKPOINT-2026-10-10.md) and [backend continuation](ISOLATED-BACKEND-CHECKPOINT-2026-10-10.md).

The service-worker scope overlap below is now corrected in source and covered by unit tests. Real push and installed-client migration/rollback acceptance remain outstanding.

The latest user-run candidate evidence has been inspected: **16 rules checks and 12 backend checks passed, zero failed**. The three moderation checks are now verified. The [operations checkpoint](OPERATIONS-INTEGRATION-CHECKPOINT-2026-10-10.md) records the new candidate and its limitations. Production/reference rules remain unchanged.

Read-only inventory succeeded and recorded site community-event-8b639's live version cc2dca8280acf5eb (28 September 2026). The exact domain mapping and deployed-source/rule compatibility remain unverified. Both registration callables are absent from the deployed function-name inventory.

1. **Complete the feature and integration pass.** Complete browser workflows against the emulators, including image uploads. The 28 current emulator checks already pass. Resolve conversation blocking and legacy standalone-appeal handling. Broaden permission acceptance to remaining collections and operations; the current 28-check emulator suite covers the limited candidate changes. The integrated preview is not connected to production writes. Delete Series is implemented with eight new client-contract checks; actual backend and browser acceptance remain pending. Complete or explicitly defer Contact Host, reminders and Edit Series. See [the series checkpoint](EVENT-SERIES-CHECKPOINT-2026-10-10.md). Niaz browsing is implemented; browser acceptance remains pending. Verify roles, city boundaries and account state on every flow. A hidden or disabled placeholder is not completed functionality. Current production-write integration holds still apply.

2. **Resolve registration/backend prerequisites with old-client compatibility first.** Confirm deployed inventory and rules against the exact intended source. completeMemberRegistration, recordMemberRegistrationDate and associated rule changes remain recorded as undeployed. Check compatibility against the released iOS 2.1.0 build 2 and Android 2.0.0 build 94; source-to-binary mapping remains unverified. Test in an isolated environment before requesting any production changes. Native builds/releases stay held until both account transfers complete. A web release must not assume users have upgraded their native app.

3. **Prepare an isolated hosted acceptance preview.** Verify the Hosting site and domain mapping, freeze the candidate source/configuration and establish its backend/data boundary. Then publish only after authorisation. Test real phone SMS/reCAPTCHA on an authorised hosted address; localhost test-number success is not real SMS acceptance. Cover existing, new/incomplete, inactive and administrator accounts, sign-out/reload, registration and error recovery. Read-only preview sign-in is the only currently authorised real-account flow.

4. **Complete PWA and device acceptance.** The root-scope overlap between /sw.js and /firebase-messaging-sw.js has been corrected in source: messaging now uses its own scope. Test actual push and offline behaviour together, existing-install upgrades, deferred updates with unsaved work, reconnect, deep links, calendar and unsubscribe routes, and rollback from the actual deployed old worker. Run current workspace/operations suites and installed Android Chrome and iPhone Safari/Home Screen checks. Earlier loopback/browser-runner restrictions are unresolved verification limits, not passing evidence.

5. **Approve and perform a controlled Hosting-only replacement.** Confirm communityconnect.siza.info's exact Hosting target and retain the current live release/version for rollback. Review the exact tested build, then obtain explicit live-release approval. Publish that version, preserving existing routes, PWA identity/scope, store redirects and association files. Immediately check accounts, browse flows, links, installed updates and core workflows. Keep rules/functions deployments separate; Hosting rollback cannot undo database changes.

## Timing and the native account transfers

Local UI, read-only features, synthetic integration tests and staging preparation can continue now. The native account transfers do not by themselves force a delay to a compatible Hosting-only release; they do constrain native builds and any change that requires those new builds. The full web launch still depends on lifting the relevant integration/deployment holds and passing the gates above. No reliable launch date can be assigned until those dependencies and acceptance results are known.

The next technical milestone is browser workflow acceptance and the remaining Events integration pass. The user reconfirmed the native transfers are pending and the released versions unchanged, and can test the web preview on phones. The user-run inventory succeeded; do not request another login or an unchanged inventory rerun. Do not silently remove read-only guards to treat the preview as a production build.

References: [Firebase phone authentication](https://firebase.google.com/docs/auth/web/phone-auth), [Hosting preview versions and rollback](https://firebase.google.com/docs/hosting/manage-hosting-resources). See also PWA-REPLACEMENT-PLAN-2026-10-08.md and WEB-AUTH-ACCEPTANCE-2026-10-01.md for the detailed earlier gates; later local preview authorisations supersede their older blanket sign-in hold only to the extent explicitly granted by the user.
