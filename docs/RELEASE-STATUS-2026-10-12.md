# Community Connect release status — 12 October 2026

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

## Unified blue theme — 13 October 2026

The shared web accent/legacy teal aliases now resolve to the blue primary palette. Backgrounds, borders and shadows are neutral. Success states and audience/observance colours retain separate semantic tokens; provider identities remain distinct. Replaced hard-coded navigation colours with shared tokens and fixed standalone install, account deletion, privacy, terms, support, AI report, offline, download/app and guide/demo styling. Static pages load a generated copy of src/styles/tokens.css, refreshed by Vite configuration; static CSS and its palette are included in the offline shell. No legal-policy text was rewritten. Map legend documentation was corrected to describe its existing audience colours.

Build and whitespace checks passed; 19 theme/PWA tests passed. All active web component/styles reference defined central colour tokens, excluding the separate unreleased registration prototype and historical SIZA_PC copies. Browser checks verified blue controls on Events, Business Directory, Calendar, Hijri and Profile; blue Privacy/Support headers and neutral backgrounds; 390px Hijri without horizontal overflow or console errors. Evidence: .qa-shared-theme-tests.log and .qa-web-release/shared-blue-theme.jpg. Admin/auth screens inherit the checked shared palette but were not individually exercised in a signed-out/admin session.

Published only to web-final-review. 130 hosted files match the candidate. Live Hosting remains cc2dca8280acf5eb; no backend, rules or native-app release. Outstanding admin/device/push acceptance remains unchanged.

## Single Map/List control — 13 October 2026

Removed the duplicate List/Map toggle beside the Events city selector on desktop and mobile. Quick access is now the only view switch and stays visible in mobile map mode so users can return to List. Updated walkthrough guidance. Production build and diff check passed; hosted browser verified Map → List at 390px and 1280px and absence of the old toggle. Updated only web-final-review; hosted files match the candidate. Evidence: .qa-web-release/events-single-map-control.jpg. Existing release acceptance remains pending.

## Events sidebar — 13 October 2026

Events now follows the Business Directory desktop layout with a persistent, icon-labelled left sidebar, active-page highlight, scrollable navigation and role-filtered administrator tools. The old right-side utility block was removed. Desktop account Menu contains profile/help/sharing/sign-out; Events navigation is no longer appended there. Below 900px, the sidebar is hidden and the complete hamburger sheet and bottom navigation remain available. Calendar/dashboard layouts adapt to the remaining content width.

Published to the existing web-final-review preview only. Build and 12 navigation/workspace tests passed. Hosted browser checks passed at 1280px and 900px (sidebar, Home/Hijri navigation, active state, compact account menu) and 390px (sidebar hidden, full mobile menu and bottom tabs, no horizontal overflow). No console errors during these checks. Screenshot: .qa-web-release/events-sidebar-desktop.jpg. Admin role visibility is covered by navigation tests; admin account acceptance and device push/update checks remain pending. Live Hosting remains cc2dca8280acf5eb; no backend/rules/native release was performed.


## Native screen reconciliation — 13 October 2026 evening

Updated the existing web-final-review preview after comparing the native source. Changes include the four Events Quick access panels (Map/List, Live, Hijri, Calendar), hamburger controls, six native notification preferences and default home module, shared Notifications from the top bell, left-aligned directory sidebar icons, compact entry/sign-in panels, and native Events/Business admin menu labels and grouping. Events admin now separates Calendar Settings, Community Messaging, Import & Export, Diagnostics Register and Tools. Diagnostic review remains Super Admin restricted; no roles or rules changed.

Hijri Calendar now shows Hijri-first Today and next observance, city-based Jafari prayer times with sunrise/sunset, conversion in both directions with day validation, and Key Islamic Events with multi-select types and a current-month default. **No Azaan alarm option is displayed**, per the user's instruction. Rest of Australia explicitly labels Sydney reference times. Native sources were read only.

Validation: 21 focused tests passed, production candidate built, diff whitespace check passed. Browser checks on the hosted preview confirmed Quick access, hamburger, all six profile preferences, shared Notifications, 390px calendar without horizontal overflow or Azaan controls, cross-year Eid filtering and invalid Hijri input handling. At 1280px the directory sidebar buttons all have icons and left alignment. No account settings or notification read states were changed for QA; no test push was sent. Browser permission setup remains available even when the shared account push preference is already on.

Pending acceptance: administrator screens with an admin account, compact sign-in/experience panels in a signed-out session, iPhone installed-app layout, push/reminder delivery and update/offline checks. The regular member test session cannot validate admin data or actions. Earlier iPhone/PC browsing and sign-in acceptance does not cover these newly revised screens. Production Hosting replacement remains held; this pass deploys only the existing review channel, with no Functions or rules deployment.


## Navigation update — 13 October 2026

The user reopened UI acceptance because the hamburger menu/admin dashboard were old and mobile Business Directory lacked native-style bottom navigation. The updated **web-final-review** preview is published at the same URL below (expires 20 October). Live Hosting remains **cc2dca8280acf5eb**, rechecked after this publish. No Functions, Firestore rules, Storage rules or native releases were changed in this update.

- Floating, safe-area-aware five-tab navigation now covers Events, the member Business Directory and public business routes. Events: Home / My Events / Add Event / Favourites / Menu. Businesses: Home / Promotions / Add Business / My Business / Menu.
- The hamburger dropdown is replaced by an account Menu sheet with role-filtered tools, module-specific inbox/admin destinations, profile, help and sharing. Desktop uses the top account Menu and directory sidebar. Business My Profile stays inside the Business Directory; unsaved business forms retain their leave confirmation.
- Events administration opens grouped People & Events / Operations cards; business administration opens People & Businesses / Operations cards. Existing working tools and server permissions are retained. This is a presentation update, not a claim that every native-only tool has been implemented on web.
- **15 focused tests passed, zero failed**, production and isolated UI builds passed, and **129/129 hosted files** match the candidate. Diff whitespace check passed. Evidence: .qa-navigation-tests.log, .qa-navigation-build.log, .qa-web-release/navigation-verification.json and hosted-file-verification.json.
- Hosted browser checks at an observed 390px width passed: both bottom bars, both member account menus, business profile routing, hidden administrator entries for a regular member, no page-width overflow and no console errors. The service worker visibly loaded the new build after reload. Screenshot: .qa-web-release/navigation-mobile.jpg.
- **Still pending:** administrator visual acceptance, additional widths/real iPhone installed layout, push delivery and the remaining release acceptance below. The local synthetic admin server built successfully but was unreachable from the browser; its error tab was blocked by URL policy and was not bypassed. A requested 320px override did not change the tested tab, so that width and desktop are not marked verified.

Previous iPhone/PC sign-in and browsing acceptance remains recorded, but does not constitute acceptance of this new navigation. The live site switch remains held until remaining checks pass.

---

## Current release authority and preview

The user authorised the **full web deployment once remaining tasks pass**, and can test on **iPhone and PC**. Do not ask for the same release approval again. Native app transfers remain pending; do not release native builds. Recorded versions remain iOS 2.1.0 build 2 and Android 2.0.0 build 94.

**Latest stage completed, 12 October evening:** The 10 additive web functions and tested Firestore rules have now been deployed to the shared Firebase project. Storage rules and all eight existing callable deployments are unchanged. The live Hosting channel is still version `cc2dca8280acf5eb`; it has not been replaced.

The **integrated final preview** is now:
https://community-event-8b639--web-final-review-rfgev4f9.web.app

This preview is connected to **live data and enabled write workflows**. Any user edits are real. It expires on 19 October at approximately 18:34 Sydney time. All 128 hosted files match the frozen release hashes, including service workers and app association files; business/promotion/event entry routes return the app shell. Its hostname is authorised in Firebase Auth. HTTP/file checks do not establish browser/device acceptance.

The user confirmed **sign-in and browsing pass on both iPhone and PC**. Push has not been tested yet. Owned write workflows, installed-app update/offline behaviour and scheduled-reminder delivery have not been separately confirmed. For iPhone push, add the preview to the Home Screen and open it there before granting notifications, as described by [WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/). Android remains unverified. Do not infer delivery from a local notification or a server acknowledgement alone.

Read-only worker health check at 07:43 UTC / 18:43 Sydney: scheduler ENABLED every minute, last attempt successful, last sweep current, zero records examined or dispatched. Evidence: `.qa-web-release/reminder-worker-health.json`. No test notification was sent by this check.

A separate read-only Hosting preview was published on 12 October:
https://community-event-8b639--web-acceptance-llddrj9f.web.app

It expires on 19 October. Existing-account sign-in and real reads are enabled; registration, editing, uploads and reminder activation are disabled. The user has been asked to check real phone sign-in and Events/Businesses display on iPhone and PC; that result is pending. HTTP 200 and public data access were verified, but that is not visual/SMS acceptance.

The in-app browser failed to attach the new preview. Selecting its old failed local tab was explicitly blocked by browser security policy. No alternate automation workaround was attempted. This is a browser verification limitation, not a request for renewed deployment approval.

## Latest integration pass

- The integrated candidate includes the real Firebase Business Directory session, business address search and new member-profile completion. Default/read-only builds retain their existing guards.
- Ten additive backend exports are deployed in the separate `community-connect-web` codebase: member completion/date recording, operations moderation/reporting, web reminders and `callWebMemberOperation`. All are ACTIVE on Node 22 in australia-southeast1. The eight callable endpoints reject unauthenticated probes with 401/UNAUTHENTICATED; the reminder worker's exact query succeeds against production indexes. No signed-in test mutation, SMS or push was initiated by the agent.
- Eight existing deployed callable handler bodies were downloaded from their exact source generations and matched against the emulator snapshots. Their emulator-only permission protections have been extracted into a shared production web guard. The web endpoint forwards the original verified caller token to an allowlisted native endpoint, retaining existing native contracts. It cannot select arbitrary URLs or use an Admin credential, and does not retry uncertain writes.
- The earlier read-only preview remains separate. The new integrated preview includes the production integration; hosted signed-in workflow/device acceptance is still pending.
- The separate **event-registration builder** being reviewed in another chat is excluded from this release. It is not the member-profile completion prerequisite. A production bundle boundary rejects imports from `src/registration/` and test sources.
- Local emulator request timeout now accommodates cold starts, and numeric DOMException error codes no longer hide transport errors.

## Verified inventory and rollback

- `communityconnect.siza.info` maps to Hosting site `community-event-8b639`; ownership, hosting and certificate are ACTIVE.
- Live version **`cc2dca8280acf5eb`**, released 28 September 2026, was rechecked after preview publication and remained unchanged. Release name: `projects/community-event-8b639/sites/community-event-8b639/channels/live/releases/1790595446147000`.
- The same site also serves the existing communityevents and download aliases. A live Hosting deployment affects those aliases too.
- Previous Firestore ruleset: `5bcdd7db-45c8-48f9-9db4-95e19f1f84c8`; current released ruleset: `f01edbf1-02c5-4bcd-8b39-740505e970a3`. Storage remains `9c33f7fb-ea52-4b49-9eb6-ba899b06d070`. The previous Firestore source and inventory are preserved under `.qa-web-release/rollback/`; `.qa-live-rules/` now reflects current production.
- Storage rules match the unchanged reference. Released Firestore rules add self-update protection for `registeredAt`, `profileCompletedAt` and `legalAcceptedAt`, plus the tested business/host permission changes. Downloaded deployed source matches `.qa-web-release/firestore.rules` exactly. The legacy native profile-create contract passed emulator acceptance.
- Earlier Hosting failures were incorrectly described as HTTP 500 using FirebaseError's default status. The actual problem was expired credentials combined with unavailable credential-cache writes. After cache access was granted, refresh and all inventory reads succeeded; no new login was needed.

## Completed in this pass

- **Earlier owner appeals:** the operations workspace now has an Earlier owner appeals queue. It reads native moderation notices whose reports are absent from the newer support collection, with bounded pagination and current business-city/owner checks. Under review, dismissal and closure retain the original decision and appeal, record audit history and show the appeal result to the owner. The action does not republish a listing or grant access to private conversations.
- **Series rescheduling:** Edit Series can retain current dates or preview a new Gregorian/Hijri date and daily/weekly/monthly/yearly repeat pattern. It retains the same future occurrence count and IDs, ownership, historical series start/index/total, and past/live events. Saving validates dates and account/permission state and rejects concurrent native edits before writing. Prayer start times are recalculated for each new date.
- **Prayer timezone parity:** web now uses the native numeric timezone calculation rather than guessing an offset when offset-name formatting is unavailable. Australian daylight-saving and half-hour offsets are covered.
- **Read-only Hosting inventory tool:** now successfully inspects custom-domain mappings and live rollback versions and distinguishes real HTTP responses from default FirebaseError status values.

## Accepted evidence

- **207 local tests passed, zero failed**, excluding the separate event-registration prototype. Log: `.qa-release-final-local.log`.
- **49 real emulator checks passed, zero failed: 23 rules + 26 backend**, including the shared web guard, legacy profile creation and idempotent registration-date recording. Archive: `.qa-firebase-evidence/accepted-2026-10-12-49-checks/`. Earlier 44- and 45-check evidence remains preserved. Log: `.qa-release-guarded-emulator.log`.
- The integrated production build passed with prototype/test imports excluded and the service worker stamped. Log: `.qa-integrated-release-final-build.log`. Candidate files and hashes: `.qa-web-release/site-manifest.json`.
- Deployment logs: `.qa-web-backend-deploy-retry.log`, `.qa-web-rules-deploy.log`, `.qa-web-final-preview-deploy.log`. Verification: `.qa-web-release/backend-verification.json`, `hosted-file-verification.json`, `final-preview-preflight.json`. The first backend attempt stopped before creation because Firebase required explicit acknowledgement of trigger retries; the retry flag was applied only after the trigger idempotency test passed and only to this isolated codebase.
- Full application, synthetic UI and isolated Firebase workspace builds passed. The synthetic build still emits a bundle-size warning; build success is not visual/device acceptance.
- Evidence and source hashes: `.qa-firebase-evidence/accepted-2026-10-12-44-checks/`.
- Local log: `.qa-final-gaps-local-2026-10-12.log`; emulator log: `.qa-final-gaps-emulator-2026-10-12.log`.
- Build logs: `.qa-final-gaps-{full,ui,workspace}-build.log`.

## Open launch gates

| Gate | Current status | What closes it |
| --- | --- | --- |
| Browser workflow acceptance | User confirmed sign-in and browsing pass on both iPhone and PC; agent browser automation is unavailable. | Remaining owned write workflows and installed-app acceptance against the staged preview. |
| Member profile and production integration | Deployed and automatically verified; event-registration prototype is excluded. | Device confirmation of signed-in flows; fix any observed errors before live Hosting replacement. |
| Existing native releases | Source-shaped emulator compatibility passes for tested operations; installed-binary compatibility is unverified. Transfers are still recorded as pending. | Exercise iOS 2.1.0 build 2 and Android 2.0.0 build 94 against the approved backend candidate. |
| Hosting target and rollback | Verified; live version `cc2dca8280acf5eb` unchanged after preview publication. | Recheck immediately before replacing the live channel. |
| Phone sign-in, push and PWA acceptance | Sign-in/browsing pass on iPhone and PC. Push remains untested; scheduler health passes. Android device is unavailable. No SMS/email/push was sent by the agent. | Foreground/background/closed-tab push, scheduled reminder and install/offline/update/deep-link acceptance on available devices; record Android as unverified. |
| Production activation | Full web release is conditionally authorised. Additive backend, Firestore rules and integrated preview are deployed; live Hosting, account transfers and native releases are unchanged. | Finish device/workflow checks, then promote the verified Hosting candidate; do not ask for duplicate authorisation. |

The two previously listed implementation gaps—legacy standalone appeals and series date/recurrence editing—are now implemented and automatically tested locally. This is not a claim that every workflow or release gate is complete.

## Browser acceptance for the additions

1. In the isolated Firebase workspace, open Moderation review → Earlier owner appeals. Review a synthetic native notice, retain it under review, dismiss it, and inspect the owner's notice and audit history. Confirm another city's case is unavailable and a changed appeal cannot accept a stale decision.
2. In Edit Series, switch from Keep current dates to Change dates and repeat pattern. Preview Gregorian and Hijri schedules, end-by-count and end-by-date, and require the same remaining count. Save and reopen; compare all occurrence dates and retained past/live records.
3. Check narrow layouts, complete-word labels, keyboard operation, errors, saving state, back/cancel behavior, and a failed calendar-settings load. Verify prayer times across the DST boundary with a real event address.

Hosting API reference: [list custom domains](https://firebase.google.com/docs/reference/hosting/rest/v1beta1/projects.sites.customDomains/list). This is a read operation; the tool does not create domains or releases.
