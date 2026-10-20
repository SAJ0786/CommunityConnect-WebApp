# Unified Community Connect web app

Started 1 October 2026. Local work only; not deployed.

## Niaz Directory navigation correction, 20 October 2026

Event-card Niaz Arrangement now opens the unified Directory workspace in the
mounted PWA instead of reloading its public-only shell. The event city,
Food & Catering category and Niaz Preparation and supply service stay in the
URL and survive reload. Explicit Directory browse URLs take precedence over
the member's default module/city. Events switching and browser history restore
the matching experience; workspace hash destinations remain intact.

On direct `/businesses` and `/businesses/promotions` visits, Firebase restores
the session before selecting a shell. Signed-in members use the same App
profile-verification gates, release flags and Directory workspace as the Home
tab. Signed-out and anonymous visitors retain public browsing without member
tools. `/businesses/view/:id` shared links and unavailable-detail URLs remain
public. This changes navigation only, not authentication permissions or data
rules; native source and behavior are unchanged.

Focused checks:

```powershell
node --test tests/directory-navigation.test.mjs tests/business-routes-and-promotions.test.mjs tests/browse-ui.test.mjs
node tools/check-directory-navigation.mjs
# In another terminal, with the existing Playwright runner available:
node tests/check-directory-navigation.cjs
```

The offline fixture on port 5186 runs the real AppRouter, App, EventCard and
Directory UI with synthetic services. It blocks remote requests and checks tab
and Niaz identity, no document reload, retained filters, reload/history,
promotions, public shared links and guest isolation. It does not prove real OTP,
deployed Firestore permissions or production account behavior.

A release requires the approved private web build environment and an explicit
Hosting-only deployment to `community-event-8b639`; never use the broad `deploy`
script. Do not deploy root `firestore.rules` (the outdated Events-only rules),
Storage or Functions with this navigation correction. Preserve the restored
shared Firestore ruleset and the existing Host Inbox notification fix.

## Agreed direction

Events and Business Directory in one responsive web app, sharing the existing Firebase authentication session and selected city. The existing React/Vite Events app is the implementation base. The separate Sites directory prototype is not the production data/authentication foundation.

### Native release hold and coexistence

The user confirmed on 1 October 2026 that native builds/releases will wait until BOTH Android and iOS apps have been transferred to the user's accounts. There is no assumed transfer deadline. Do not build, submit or release native binaries from this web chat. Continue web development independently, while preserving the currently installed native clients. No backend rule or contract change may assume that native users have upgraded, and no forced minimum-version requirement is authorised. Confirm the exact released Android/iOS builds before claiming backward compatibility.

The user subsequently confirmed the released compatibility baselines: iOS **2.1.0, build 2** and Android **2.0.0, build 94**. Their source revisions/build manifests are still unverified; do not equate the earlier `db01c17^` emulator baseline with either release merely from the version numbers. Local app configuration contains different build numbers and is not authoritative evidence of what is installed in production.

## First implementation slice

- Community Connect branding on startup, sign-in and the main header.
- Events / Business Directory navigation for guests and members. Existing Events pages remain in place.
- Public directory with city, category and text search; expandable details, public contact links and supplied opening hours.
- Read-only access to `publicBusinesses`, matching the native app's public projection. No fallback to private `businesses`, contact-routing, enquiry or moderation records.
- Only approved, non-hidden records appear. Suburb-only address preferences are honoured defensively by the web adapter.
- Loading, retry, empty and cached-data states. No invented production listings.
- Existing Events bottom navigation and walkthrough are not presented as directory features.

## Next slices

See the native/web parity checkpoint below before release; the new registration backend must be deployed before publishing this web client.

1. Complete guest/member navigation and real phone sign-in acceptance when the user resumes that work. Read-only live data/config checks and signed-out startup have passed; authenticated flows and deployed-rule compatibility are not yet established. The active React UI colour migration is now complete (see the UI pass below); live sign-in work and Firebase changes are on hold.
2. Add public business detail URLs, promotions and member favourites, with refresh/back-button and old-link preservation tests.
3. Port owner listing creation/editing, address and ABN assistance, hours and submission validation against existing backend contracts.
4. Port Business Inbox and notifications with participant isolation, blocking and reporting tests.
5. Port administrator review and city-scoped management, then perform full mobile/desktop accessibility and acceptance testing.
6. Plan the in-place PWA upgrade and rollback before any Hosting release. The user confirmed that `communityconnect.siza.info` is the permanent domain and already serves the existing PWA; no domain migration is required. Preserve the download page, existing Events links and backend routes, and test an existing installed PWA upgrading to the new build.

The current work does not implement new matrimonial or managed WhatsApp services, and does not change the native app's deferred bulk-share item.

## Local checks

Run `node --test tests/public-businesses.test.mjs` for visibility, privacy, URL safety, city/search and opening-hours checks.

Run `npm run build` for the real web bundle. For isolated UI checks, start Vite and visit `/tests/preview/`. The preview uses labelled synthetic data and does not connect to Firebase; its entry point is excluded from the production build. It tests presentation, not sign-in, Firestore permissions or live-data acceptance.

In the Windows sandbox the standard Vite config loader encounters an esbuild filesystem traversal error. `node tools/check-unified-web.mjs` uses Vite's API with the same project config and builds successfully. `node tools/check-unified-web.mjs --preview` builds and serves the isolated UI test on `http://127.0.0.1:5179/` without dependency scanning.

Checks completed on 1 October: five data/privacy unit tests; full web production compilation; local Edge interaction tests covering search, categories, city changes, module switching, details/hours, loading, empty, retry and cached-data states; no horizontal overflow at 320, 390, 768 and 1440 pixels. Desktop and phone screenshots were visually inspected. The isolated browser test produced no page errors and made no Firebase requests. Full authenticated Events regression and live Firestore acceptance are still outstanding.

Do not run the existing `deploy` script for this milestone: it deploys more than Hosting. No deployment, DNS, Firestore-rule or backend change is authorised by this note.

## Working copy

Work is in the workspace's `community-events-deployer` checkout. The OneDrive app source and the live site have not been updated. Existing download-preview and Android-manifest changes in this checkout belong to earlier work and are preserved.

## Shared theme foundation

`src/styles/tokens.css` is the central palette. Its default blue primary, teal accent, navy text and soft background match the native app's `src/theme.js`. Components consume semantic properties such as `--cc-primary`, `--cc-surface`, `--cc-text` and `--cc-border`; a future scheme should override those properties centrally, not rewrite components. Brand artwork is separate from the UI palette.

Migrated: the new directory/switch, shared stylesheet, app shell, header and sign-in page. The old forced-light-theme reset is removed. Some older Events feature components still contain inline colour literals and need migration and visual regression checks. No alternate theme selector or complete dark theme is shipped yet.

Tests guard the migrated files against literal hex/RGB/HSL values and verify native palette parity. The isolated browser test changes surface and navigation tokens at runtime, confirms the rendered colours change, then resets them. Future features must use these semantic tokens.

### Choice-first entry flow

Signed-out visitors now see the Community Events / Business Directory selector before sign-in, matching the native app's entry pattern. Continue opens the selected experience's sign-in screen; guest browsing remains available there after policy acceptance. Change experience returns to the selector. The selected destination is retained through member authentication, guest entry and refresh in the same browser tab. Already authenticated sessions continue into their selected module without another login. Selection is a tab-local preference, not a new user-profile field.

Experience titles and destinations live in `src/config/experiences.mjs`; `ExperienceEntry.jsx` and `entry.css` use the shared palette exclusively. The full-app signed-out browser check covers both choices, contextual guest buttons, change/back, native radio keyboard navigation, reload and 320/390/768/1440px layouts. Thirteen unit tests pass, including destination/storage tests. Actual OTP completion and authenticated end-to-end navigation are still pending; browser checks did not sign in or create guest accounts.

## Live-data and sign-in preparation, 1 October 2026

- Read-only preflight confirms the web and native configurations target `community-event-8b639`.
- Public Firestore REST reads returned five approved, visible public business records; no private collection fallback or records were changed.
- Public Auth configuration lists `localhost`, the existing Events domain and `communityconnect.siza.info` as authorised. `127.0.0.1` is not authorised for this sign-in configuration.
- New member profile creation now uses the native create-rule field contract, explicit policy consent and ordinary `user` role. Client-side email-based administrator promotion and old-profile copying/deletion are removed. Existing roles remain server-owned.
- Policy links and document version use the native app's configured legal documents. This is contract alignment, not verification of deployed rules.
- Ten unit tests and full Vite compilation passed. Signed-out full-app startup passed in Edge at desktop/mobile sizes without page errors or mobile horizontal overflow. The test blocked remote non-read requests and did not send SMS or sign in. Desktop/mobile screenshots were inspected.
- Real OTP sign-in, new registration, existing member/admin account handling, guest navigation and authenticated Events regression remain manual acceptance items.

### Local previews

- `http://127.0.0.1:5179/`: synthetic UI fixture, no Firebase connection.
- `http://localhost:5180/`: full local application connected to live Firebase, visibly labelled. No release has been published. User actions here can affect their real account; this is not an emulator or read-only sandbox. Service-worker registration is disabled for this local build only.

Use `node tools/web-preflight.mjs --env-file <existing-web-env-path>` for read-only connectivity/configuration checks. Use `node tools/check-unified-web.mjs --live-preview --env-file <existing-web-env-path>` to build/serve the full local preview. The tool reads existing Vite configuration without copying the env file into source or printing its values; normal client configuration is still included in the local browser bundle.

Run `node --test tests/public-businesses.test.mjs tests/theme-and-registration.test.mjs tests/experiences.test.mjs` for the combined tests. UI evidence and browser scripts are in the parent workspace's `outputs/web-milestone-20261001/` folder.

## Native/web parity checkpoint — registration fix db01c17

The native registration fix is on GitHub main and in the original native checkout. The following web changes are local and not yet pushed or deployed; this section supersedes the earlier client-created profile description.

| Recent native change | Web status |
| --- | --- |
| Required name and email after verified Australian mobile sign-in | Implemented in a shared gate before either experience. Same length/format validation, explicit current-policy consent and read-only verified phone. |
| Existing incomplete profiles cannot bypass completion | Implemented on sign-in and refresh. Missing records show completion; failed server reads show retry. Cached/Auth fallback profiles cannot grant entry. Inactive accounts are blocked; guests still browse. |
| Server-owned identity and joining dates | Uses the same `completeMemberRegistration` callable in `australia-southeast1`. No client role/UID/phone/date assignment, email-based account linking or direct registration fallback. Email remains an unverified contact address. |
| Newest-joined-first admin users | Implemented for the existing Events web dashboard and its CSV. `registeredAt`, then legacy `createdAt`/`joinedAt`/`createdOn`; unknown dates last, stable UID ties. Email and phone displayed separately; missing city not presented as Sydney. |
| Business Directory admin users | Dashboard not yet ported. Shared tested comparator is ready for that milestone. No claim of complete admin parity. |
| Choice before login and shared colour scheme | Preserved. New completion UI uses existing theme styles; native/web primary palette parity remains tested. Legacy Events colour cleanup remains pending. |

Release prerequisites: deploy the native registration callable, registration-date trigger and associated rules deliberately before releasing web/native clients. Pushing Git alone did not deploy them. Until available, new/incomplete web members cannot finish registration; the UI keeps them on the form with an error. Existing dates are not fabricated or bulk-backfilled. Offline members must reconnect to verify their profile; guest browsing remains separate.

Automated checks: `node --test tests/*.test.mjs` compares native/web entry states, timestamp parsing, date sorting and payload allowlisting. `node tools/check-member-preview.mjs` serves the real App authentication orchestration with synthetic service adapters and lightweight destination stubs on port 5181; run `node tests/check-member-browser.cjs` against it. This fixture covers refresh, failed saves, retry, inactive accounts, guests, stale reads and the choice → simulated OTP → completion → chosen destination flow without contacting Firebase. It is not a real SMS, deployed-rule, or backend integration test. Production compilation uses `node tools/check-unified-web.mjs`.

Real OTP/member/admin acceptance, deployed callable/rule checks and the broader Business Directory management features remain outstanding. Do not publish the entire legacy Firebase default deploy configuration to release these changes.

Parity verification completed locally: 18 unit/contract tests, seven offline browser scenarios, 320/390/768/1440px overflow checks, mobile screenshot inspection and production compilation passed. Existing build warnings about package module type and mixed static/dynamic imports remain non-blocking. To refresh an already-running full preview without starting a second server, add `--build-only` to the documented `--live-preview --env-file` command.

## Acceptance preparation — dedicated web chat, 1 October 2026

The user authorised moving to the next web milestone. No backend deployment, Hosting release or native edits were performed. See `WEB-AUTH-ACCEPTANCE-2026-10-01.md` for the acceptance checklist.

- Reran all 18 unit/contract tests, all seven offline browser scenarios and production compilation successfully. The browser fixture made no remote requests.
- Read-only live preflight confirmed the same Firebase project as native, six approved visible public directory records, and authorised `localhost` and `communityconnect.siza.info` domains. `127.0.0.1` remains unauthorised for Auth.
- An unauthenticated GET to the expected `completeMemberRegistration` regional endpoint returned HTTP 404. No credentials or registration payload were sent. This does not establish the deployed trigger or rules state, and it does not prove why the endpoint is unavailable.
- Authenticated function inventory could not be obtained: local Google Cloud/Firebase CLI access was blocked by filesystem permissions. Deployment status remains unverified; do not describe real registration acceptance as passed.
- The user subsequently confirmed that the registration functions and updated rules have NOT been deployed. The shared backend remains the prerequisite for real profile-completion acceptance. Reference backend tests and JavaScript syntax checks also passed without live calls.
- Use native logic and backend contracts as the parity reference. Current web/native helpers are aligned copies with parity tests, not a single shared package. Extracting a shared package or adopting React Native Web requires a separately scoped change; native source remains reference-only here.

## Older-client compatibility checkpoint — 1 October 2026

`node tests/check-legacy-member-rules.cjs` runs historical native/web profile services against a local Firestore emulator on port 8089 using only `demo-web-member-compat`. All 36 expected permission outcomes passed. No live account data, credentials, SMS or deployment were involved.

- Source baselines: native `db01c17^` (before the registration fix), web `439008a`, and candidate native rules from the existing reference checkout. These have NOT been mapped to released binaries or the live Hosting build.
- Old native creation, reopening a profile after server dates are added, contact/consent/city updates, event favourites and business favourites are accepted by candidate rules. Ordinary clients cannot overwrite the three protected server timestamps under the candidate rules.
- Existing old-web profile reopening, contact edits and event favourites are accepted in the tested scenarios.
- Old-web NEW profile creation is rejected by BOTH pre-fix and candidate native rules, but accepted by the legacy web repository rules. This proves a source-contract mismatch that predates the registration fix; it does not establish a new live production failure. Do not replace the whole live ruleset with the native file without a live-rules comparison and a coexistence plan.
- Server timestamps were seeded with emulator administrator access; this is not execution of the creation trigger. Live backend inventory/rules access remains blocked by local CLI permissions even after the requested access grant. No deployment was performed.

Next release gate: identify store build source revisions and the live PWA/rules baseline, then verify narrowly scoped additive backend changes. Keep web UI work and synthetic tests moving independently while that gate and the account transfers remain pending.

## Complete visual consistency pass — 1 October 2026

The user put web sign-in implementation, Firebase security rules and registration-function deployment on hold, then authorised completing the UI changes together. This pass changes the appearance and accessibility of existing screens; it does not add the pending owner/inbox/Business Directory administration features or establish complete functional native parity.

- Migrated remaining literal colours in the active React UI to `src/styles/tokens.css`. The automated check covers all 49 active JSX/CSS files outside the token file. Unused `-SIZA_PC` backup copies are preserved and excluded; they are not the active UI. Static download/legal pages and native capture-canvas internals were not restyled.
- Added semantic video-surface/contrast, third-party brand and audience tokens. Calendar and map audience colours agree. Standalone map marker SVGs resolve CSS variables into concrete colours at render time, rather than embedding unresolved CSS variables in image URLs.
- Unified Events cards, search/filter controls, calendars, forms, profile, admin, sharing, notices, onboarding and streaming surfaces with the existing blue/teal palette. Central native primary/accent parity is preserved.
- Improved keyboard focus, explicit disabled guest-navigation controls, current-page semantics, short city labels, destructive-action colours, and stream heading contrast.
- Sharing and guest-edit dialogs contain keyboard focus, close on Escape and restore the trigger focus. Default-city selection contains keyboard focus. Panels scroll on short viewports. Streaming confirmation supports the same keyboard behaviour without changing stream operations.
- Fixed 320px series-date overflow by stacking form rows on narrow phones; Hijri month selectors receive their own row when needed.

Offline review: `node tools/check-ui-preview.mjs` serves `http://127.0.0.1:5182/`. It uses real UI components and synthetic service adapters, bypasses App/auth orchestration, and does not register a service worker. `--build-only` refreshes its bundle without starting a duplicate server. No env file is needed. The screen/state toolbar is test-only and absent from the production build.

Verification commands: `node --test tests/*.test.mjs`, `node tools/check-unified-web.mjs`, `node tests/check-ui-browser.cjs <evidence-directory>` and `node tests/check-ui-interactions.cjs <evidence-directory>`. Browser checks block and report all remote requests. Evidence is saved in the dedicated web chat's `outputs/ui-review-20261001` folder. Actual map-provider behaviour, camera/stream delivery, member operations and live services are outside these offline checks.

Final results: all 18 unit/contract checks, production build, 52 screen/viewport cases and 56 interaction/layout checks passed. Browser suites reported no remote requests or runtime errors. Representative phone/desktop screenshots were visually inspected. Existing module-type and mixed-import build warnings remain non-blocking.

Sign-in component/service code, App authentication orchestration and Firebase configuration/rules were hash-checked unchanged for this pass. Existing unrelated download and AndroidManifest edits were preserved. No native build, push, backend deployment or Hosting publication was performed.

## Public business pages and promotions — 2 October 2026

Implemented locally following approval to continue public browsing. Production remains on the existing PWA at `https://communityconnect.siza.info`; this milestone is not deployed.

- Added `/businesses`, `/businesses/view/<encoded-id>` and `/businesses/promotions`. The small `AppRouter` entry wrapper handles only this namespace and lazily delegates all other paths to the existing App. Public pages do not mount its sign-in/account orchestration. The existing directory inside App links into these public pages. `main.jsx` only changes its rendered entry component; service-worker registration is unchanged.
- Dedicated business pages show public description/services, privacy-respecting location, phone/email/WhatsApp, website/social links, logo/cover with failed-image fallback, opening hours, ABN disclaimer and current offer conditions. Browser share is supported, with clipboard and selectable-link fallbacks. Links use the current origin, so production sharing will use the existing Community Connect domain.
- Directory city/search/category filters are encoded in URLs and retained through refresh, browser back/forward and explicit return links. Direct business links find the listing independently of city. A direct-link return defaults to that business's city. Events navigation selects the existing Events experience before returning to App.
- Promotions read only `publicBusinessPromotions`, matching the native public collection. Explicit projection excludes owner, moderation and storage-path fields. Only active, visible, in-date offers with an approved visible public business are shown; removing the parent removes its offers. The feed filters by city and orders sponsored offers first, then newest. Offers retain full details and conditions on the business page.
- Date eligibility deliberately matches native UTC calendar-day semantics, including inclusive end dates and legacy open-ended offers. Malformed dates fail closed. A timer plus focus/visibility refresh rechecks expiry without waiting for Firestore changes. Owner-first ordering, personalised favourites, analytics, inbox and owner/admin operations are outside this public milestone.
- Independent business/promotion loading, cache, empty, error and retry states are included. A cached missing record does not claim the business was deleted. No fallback reads from private collections, account writes or new rules are introduced.

Offline review: `node tools/check-public-preview.mjs` serves `http://127.0.0.1:5183/businesses`. Add `--build-only` to refresh an existing server. This fixture uses the actual public router, pages and projection helpers, with synthetic feeds and a stub at the legacy App boundary. It forbids Firebase imports, blocks remote browser requests and registers no service worker. It is not deployed-rule, real account or live Hosting acceptance.

Verification: `node --test tests/*.test.mjs` (23 checks), `node tools/check-unified-web.mjs` (production compilation), and `node tests/check-public-browser.cjs <evidence-directory>` (55 browser assertions, including three public page types at 320/390/768/1440px). Representative screenshots were inspected. Build retains existing module-type and mixed-import warnings. Evidence/report live in the dedicated web chat's `outputs/public-browsing-20261002` directory.

The existing Hosting catch-all already routes these URLs to the SPA; no Hosting configuration changed. Per-business social preview metadata and server-rendered search indexing are not part of these client-rendered pages. Before publication, verify live public collection access and production deep links, coexistence with existing links and installed-PWA updates. The native reference currently shares business text, not these new web URLs; no native code was modified.

App authentication orchestration, AuthPage, profile completion, member service, Firebase config/rules, Hosting config and unrelated AndroidManifest/download changes were hash-checked unchanged. All sign-in/backend release holds and native account-transfer prerequisites remain in effect. No commit, push, native build or deployment occurred.

## Member, owner and administrator UI milestone — 2 October 2026

The user approved building the next-step screen list with synthetic data while sign-in and Firebase integration remain on hold. Reusable components now live in `src/business/`; the production App and public routes do not mount these new account screens yet. `DirectoryWorkspace` receives data, a profile and command/address/ABR callbacks. No new private Firebase services, account orchestration or rules were implemented.

- Member UI: saved businesses, notifications, retained moderation notices/appeals, inbox list/conversations, enquiry/reply composer, block/unblock and report dialogs.
- Owner UI: listing and promotion dashboards; approved/pending/changes-required/history states; listing creation/editing, categories/services, contact/social fields, image selection/preview, address-selection callback, public-display choice, hours including split/overnight/24-hour schedules, private community referrer and fresh consent/declaration. Promotions include conditions, date validation and image selection. History stays read-only.
- Admin UI: listing/promotion queues, reference/ABN/history review controls, approve/request changes, tier/founding status, visibility/archive/restore, newest-first member list with owner filtering, member-access editor for the super-administrator preview, and scoped aggregate statistics with city/category/business filters. Actual permission enforcement remains a backend integration requirement.
- Native reuse: `businessHours.mjs` is copied unchanged from the reference native pure helper; `categories.mjs` contains its initial category catalogue without sample listings. Tests verify both references. Member sorting uses the existing shared web comparator. Views are web React components, not unmodified React Native screen code.
- Forms emit allowlisted listing/promotion fields and omit owner IDs, moderation status, publishing authority and timestamps. Server adapters are still required. The initial category catalogue is static for this UI milestone; live/custom category loading remains integration work.
- Navigation uses hash routes in the preview, a desktop sidebar and collapsible mobile menu. Unsaved form changes prompt before navigation; confirmation dialogs trap focus/restore it and support Escape. Validation summaries receive focus and scroll into view. State/failure testing preserves drafts on failed saves.

`tests/workspace-preview` supplies all synthetic data and tab-local simulation commands. These fixture files must never be imported into production. Demonstrations include pending edits preserving the approved public listing, promotion edits returning to private review, archive withdrawing linked offers, restore returning to private review, retained moderation notices, and blocked conversations preventing replies. File selection previews images locally but does not upload them or persist media after submit. ABR and address results are explicitly synthetic.

Run `node tools/check-workspace-preview.mjs` for `http://127.0.0.1:5184/`, or add `--build-only` to refresh its existing server. Its toolbar selects role, loading/error/empty/cached states, simulated failures and reset; it links to the Events UI review on 5182 and public browsing on its own `/businesses` paths. The fixture blocks Firebase imports and browser tests block remote requests. Role selection is a preview convenience, not authorisation.

Verification: `node --test tests/*.test.mjs` (30 checks), `node tests/check-workspace-browser.cjs <evidence-directory>` (106 layout/workflow assertions, including 16 screens at four viewport widths), workspace compilation and `node tools/check-unified-web.mjs` all passed. No browser errors or remote requests. Mobile/desktop screenshots were reviewed; the evidence/report is in the dedicated chat's `outputs/directory-workspace-20261002`. Existing production module-type/mixed-import warnings remain. The public detail component gained an optional embedded section container to avoid nested main landmarks; default standalone behaviour is preserved.

This is completion of the agreed member/owner/admin UI list, not complete native functional parity. Category administration, diagnostic tools, staff support/moderation inboxes and other unlisted native features remain separate scope. Next is user review of these screens; real service integration and account/storage/rule acceptance resume only after the relevant holds are lifted. The live domain, existing Hosting configuration and native account-transfer prerequisites are unchanged. No commit, push, deployment, native edit or native build occurred.

## Directory operations UI — 7 October 2026

The user authorised the next UI milestone. Category administration, local diagnostic summaries, feedback/business-report forms and staff moderation review are now implemented in the prop-driven workspace. Authentication, Firebase services/rules, real email and native releases remain held. These account screens still are not mounted by the production App.

Native reference correction: `BusinessSupportInboxScreen.js` exports `SupportForm`; support is handled through email, not a separate chat inbox. App feedback routes to support@siza.info; business reports route privately to the business city administrators and super administrators. The web form follows the native category choices, field limits and stable request-reference retry pattern. All commands in this preview are synthetic; no email is sent.

- Categories: add category or service, name normalisation and duplicate checks, catalogue search, custom choices available in owner listing forms, ABN checksum and an explicit official-record link. The original native catalogue remains unchanged. Live metadata loading/persistence is deferred.
- Diagnostics: explicit metadata/count projection with city scoping and copy fallback; excludes typed reports, account contacts, ABNs and private addresses. This is a local summary, not server-health verification.
- Support delivery records: proposed read-only staff view with queued/sent/failed states and city scoping. This is an offline prototype, not an existing native inbox. Native rules deny direct reads of support submissions and delivery outbox collections. A server-authorised, redacted service contract must be designed before connecting this view; do not loosen those rules to expose the collections.
- Moderation: city-scoped business/conversation reports and owner appeals, retained decision history, reason confirmation, valid target checks, owner notices, synthetic takedown withdrawing linked public promotions and staff conversation blocks preventing replies. Appeals retain the original decision and do not automatically republish listings. Backend authorisation and atomic effects remain integration requirements.
- Shared validation summaries focus only when error text changes, preventing focus jumps while correcting a field.

Verification this turn: all **39 unit checks** passed, workspace compilation passed, production compilation passed using Vite's `resolve.preserveSymlinks` option for the shared Windows dependency junction. Existing mixed-import/module warnings remain. All 11 held-file hashes (App/router/main, auth/profile completion/service, Firebase init/rules/config, native wrapper manifest, download page) matched their pre-turn values. `git diff --check` passed. No deployment, commit, push, native source edit or native build occurred.

Browser verification is **pending**, not passed this turn. The existing 106-check regression runner could not launch Edge; a new operations runner was prepared but could not execute because browser startup/installation hit Windows EPERM errors. The in-app browser also timed out on the local preview despite network permission. Do not carry forward the 2 October browser result as verification of these additions. When the local environment permits, start `node tools/check-workspace-preview.mjs`, then run `node tests/check-workspace-browser.cjs <evidence-directory>` and `node tests/check-operations-browser.cjs <evidence-directory>`. The new runner covers eight screens at 320/390/768/1440px, failures/retries, custom categories, diagnostics, role/city gates, moderation and remote-request exclusion. Inspect the screenshots after execution.

Next: finish that browser/visual QA and user review while service integration remains held. The live domain remains communityconnect.siza.info serving the existing PWA; replacement and service-worker upgrade acceptance are later release steps.

## User review and PWA preparation — 7 October 2026

The user reviewed the local UI and authorised moving to the next task. In-app browser checks verified category save failure/retry, service creation, duplicate rejection and custom choices in owner forms. The standalone Edge runner still failed to launch. In-app testing then stalled on the native unsaved-changes confirmation; the documented control APIs could not dismiss it, and user dismissal was requested. The remaining browser/visual checks are still pending, not passed.

Independent release preparation updated the manifest name/short name/theme colour, root loading title, canonical/social/structured metadata, robots sitemap reference, both sitemaps, and static Events/app landing-page domain references for communityconnect.siza.info. Manifest app identity, start URL and scope remain `/`. Static historical installation/help text, old screenshot assets and native/store branding remain a separate coordinated review; existing download-page/store destinations were preserved.

All 39 unit checks and production compilation passed. Manifest assets, sitemap XML/local targets, the 11 held-file hashes and diff whitespace were verified. No deployment or integration hold was lifted. Dedicated-chat report: `outputs/directory-final-qa-20261007/REVIEW.md`. Installed-PWA upgrade testing remains a release prerequisite; current update code returns to the root and needs explicit deep-link acceptance or a targeted fix before release.

## PWA readiness work — 8 October 2026

The user authorised the readiness plan. Installation/help copy now covers the web app, current browser install menus, public Directory browsing, honest offline limitations and retained Events guide links. Existing manifest screenshots await fresh verified captures; old preview-toolbar screenshots were not substituted.

The worker now requires successful caching of the shell plus the production build assets, retains the previous complete asset generation, preserves unrelated caches, bypasses calendar/unsubscribe/report routes, and gives uncached static pages an offline explanation. The build stamps the actual asset list into the worker. Registration preserves the current path/query/hash across updates, waits for the existing app safety signal even when another tab activates a worker, and handles unavailable session storage. Actual installed-device acceptance remains required; the private Directory workspace will need its own safety signal when integrated.

49 unit/contract checks passed, including 10 tests executing actual worker/registration source under controlled cache/browser objects. Production compilation passed; 40 build assets are referenced by the stamped worker and all exist. All 11 held-file hashes remained unchanged. `tools/run-offline-qa.ps1` can run the offline browser suites in a regular terminal. The agent-started preview remained unreachable to the browser and was stopped; user restart on port 5184 was requested. Full browser QA, guide layout inspection, screenshots and installed-PWA testing remain pending, not passed.

See `PWA-REPLACEMENT-PLAN-2026-10-08.md` for the release and rollback gates. Read-only source review also identified root-scope overlap between `/sw.js` and the existing Firebase messaging worker; notification integration was left unchanged under the hold and must be coordinated before release. No deployment, native change, commit or push occurred. Dedicated-chat evidence summary: `outputs/pwa-readiness-20261008/REVIEW.md`.

## 9 October: update safety and one-command local QA

Directory now supplies a separate update-safety guard for tracked drafts and in-flight actions. The service-worker client composes it with Events safety and also defers for focused fields/modal dialogs. Enquiry/reply and category/service text draft tracking was added. No auth/router/Firebase/native changes were made. Unit tests: 51 pass; production build and final offline fixture build pass; 40 built worker assets verified. Browser startup still fails inside the restricted agent environment before assertions run, so current browser screenshots and installed-device acceptance are pending. Run tools/run-offline-qa.ps1 from the repository in a regular terminal; it now manages its own preview server and writes run-status.json. Full report: chat outputs/readiness-20261009/REVIEW.md.

## 9 October: user-run browser results and diagnostic label fix

User-run QA confirms 111 workspace checks passed, with no runtime errors or remote requests. Operations passed 32 layout and three category checks before the diagnostic fallback exact-label lookup timed out. The screenshot confirms fallback content rendered. Added a stable explicit accessible label to its populated read-only textarea, retained the strict lookup, and extended checks for read-only valid JSON. Removed duplicate dirty-state callbacks. The helper now accepts -OperationsOnly to rerun the pending suite. Updated fixture build and script syntax checks pass; browser rerun remains pending because agent browser startup is unavailable. Evidence/report: chat outputs/qa-fix-20261009.

## 9 October: shared form-label correction

User operations rerun passed 43 checks through diagnostics/support, then exact Moderation decision lookup failed. Field now links native controls to a unique caption using aria-labelledby, separating hint descriptions. Added three real-component HTML render regression tests. All 54 tests and the offline build pass. Agent rerun with network permission still failed at Edge sandbox startup before browser assertions. Full browser suites must be rerun after the shared label change; deployment/auth/Firebase/native holds remain. See chat outputs/shared-label-qa-20261009/REVIEW.md.

## 9 October: isolated worker upgrade/rollback rehearsal

Added tools/check-pwa-rehearsal.mjs and tests/pwa-rehearsal/server.mjs. They serve synthetic A/B/broken bundles with the actual current worker/client sources on loopback, exercise failed install, two-tab draft safety, offline routes/assets and rollback, and always write a result including startup failures. No production app or Firebase is served. Both new fixture checks and the twelve existing lifecycle tests pass. Agent-run Edge again exited during sandbox startup before any browser assertion. See docs/PWA-REHEARSAL-2026-10-09.md and chat outputs/pwa-rehearsal-20261009/results.json. Real old-release migration, UI browser acceptance and device installation remain pending; service/deployment holds remain.

## 10 October: authorised actual-site read-only Firebase preview

User explicitly authorised connecting the local preview to the existing project and using existing-account sign-in to see real data/images, while keeping the live PWA untouched. Added tools/preview-live-readonly.mjs and tools/readonly-preview-policy.mjs. The actual App is built into .qa-site-preview with Firebase mutation guards, tab-session authentication, disabled notification registration and no service worker. Four guard tests pass; public Businesses/Promotions read probes both return HTTP 200. Held source/rules/configuration files remain unchanged. Sign-in and image rendering are not browser-verified; sandbox server is unreachable from the user browser and was stopped. Run node tools/preview-live-readonly.mjs --serve-only in regular PowerShell, then open http://localhost:5186/. Full record: chat outputs/live-readonly-20261010/REVIEW.md. This authorisation is for this local preview; no rules/functions/live deployment or private Directory integration was performed.

## Post-login blank screen fix

The preview notification adapter returned a synchronous cleanup function for startForegroundPushNotifications, but App calls its result with .catch() in a signed-in effect. This creates a TypeError after account verification for notification-enabled profiles. The adapter now returns a resolved Promise, matching the real async service while keeping notifications disabled. A regression test imports the actual generated adapter and exercises the App call plus all exported async notification functions. All five read-only preview tests pass. Rebuilt the served preview; user should reload the same tab to retain its sign-in session. Browser automation remains unavailable, so visual confirmation after login is pending. No production source, Firebase rule or data mutation was made.
