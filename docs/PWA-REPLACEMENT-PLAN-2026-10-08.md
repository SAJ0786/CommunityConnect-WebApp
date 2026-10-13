# Community Connect PWA replacement and rollback

Prepared 8 October 2026; readiness update 9 October 2026. This is a release plan, not permission to publish. The live PWA stays in place while the candidate is built and checked locally.

## Release identity and current constraints

| Item | Recorded value |
| --- | --- |
| Intended existing production domain | communityconnect.siza.info, confirmed by the user |
| Local Firebase project alias | community-event-8b639 |
| Hosting site ID and custom-domain mapping | Must be verified; not established by the project alias |
| Current live release/version/source revision | Must be recorded before release |
| PWA ID, start URL, scope | `/`, `/`, `/`; preserved |
| Candidate | Uncommitted local changes; not a frozen release artifact |
| iOS baseline | 2.1.0 build 2; source mapping still unverified |
| Android baseline | 2.0.0 build 94; source mapping still unverified |
| Holds | Rules/backend write integration, native builds/releases and deployment. Existing-account sign-in and real-data reads are authorised only in the local read-only preview. |

`firebase.json` currently includes Hosting, Firestore, Storage and Functions. The package's broad deploy command is unsuitable for this web-only transition. When release is authorised, use an explicit verified Hosting target, or an isolated Hosting-only configuration with the confirmed site ID. Preserve the calendar/unsubscribe rewrites, `/app` and `/download`, store redirects, association files and cache headers.

## Gates before a release candidate can be approved

1. Finish the offline browser suites and inspect mobile/desktop evidence. Update manifest screenshots using the actual new UI and synthetic content; old login/profile screenshots are not accepted as current evidence.
2. Finish installed browser testing below. Node lifecycle tests verify logic but do not prove operating-system installation, storage eviction, push registration or standalone behaviour.
3. Resume service integration only after the user lifts the holds. The production App still does not mount the new private Directory workspace. Complete backend permission, account, upload, reporting, email, city-boundary and released-native compatibility acceptance before connecting it.
4. Resolve the existing worker-scope overlap: `swService.js` registers `/sw.js` and `notificationService.js` registers `/firebase-messaging-sw.js` without an explicit scope. Both default to the root. Coordinate their registration/push responsibilities in the deferred service phase and test notifications alongside offline navigation. Neither notification registration nor Firebase messaging was changed by this readiness pass.
5. Verify the Directory update-safety signal in the browser before integration. The workspace now supplies `__communityDirectoryCanAutoUpdate` for tracked drafts and in-flight actions, composed with the existing Events signal. Listing, promotion, enquiry, reply, support and category/service text drafts are tracked. Focused inputs and open modal dialogs also defer reloads. The new workspace remains fixture-only. Retaining the previous asset generation supports deferred reloads, but indefinitely open tabs across many releases are not guaranteed.
6. Verify the live Hosting site/domain mapping read-only, record the previous release/version ID, retain that version, and freeze the exact candidate source, configuration and built-file hashes. No DNS cutover should be assumed necessary for replacing files on the existing mapped domain.

## Installed-PWA and upgrade acceptance

Use an isolated staging origin and browser profile with synthetic data. Do not register a test worker on the live domain or use a preview connected to production accounts while the holds apply.

| Scenario | Required result |
| --- | --- |
| Fresh install, browser and standalone | Correct name/icon; root identity unchanged; app launches and navigation works |
| Candidate assets unavailable during installation | Installation fails; previous working worker stays active |
| Existing installation receives candidate | Current path, query and hash survive the controlled reload; no loop |
| Form or stream active, including a second tab activating | Reload waits for the safety signal; no draft loss |
| Browser storage unavailable/full | Network content remains readable; update handling does not throw |
| Previously loaded public Directory link offline | Cached shell renders; data freshness/offline states remain honest |
| Unvisited static help page offline | Offline explanation, not an unrelated app screen |
| Calendar and unsubscribe/report links offline | No cached success response or replay of an action |
| Return online / background resume | Update checks resume; fresh content replaces cached data appropriately |
| Notification permission granted/denied | Offline worker and messaging coexist after scope coordination |
| Roll forward, then roll back | Both ordinary tabs and installed app recover; no forced clearing of user storage |
| Device matrix | Desktop Chrome/Edge, Android Chrome and iPhone Safari/Home Screen; 320/390/768/1440 layout checks |

## Preview, replacement and rollback sequence

After the gates are satisfied and the user authorises publishing:

1. Record the current live release, its version ID and the approved rollback owner. Retain the current version and a reproducible artifact/configuration record.
2. Publish only the approved candidate to a preview channel of the verified Hosting site. A preview may still use the application's configured backend, so its data boundary must be explicitly established first.
3. Run the acceptance checklist against that exact preview version. Do not rebuild or change configuration between acceptance and promotion without rechecking the artifact.
4. Obtain approval for the concrete version, confirmed destination and rollback record. Promote the reviewed version to the existing site's live channel. Verify the domain, important routes and update behaviour immediately afterwards.
5. If core navigation, account access, legacy URLs or installed-app updates regress, restore the recorded previous live version and repeat connected-browser checks. Hosting rollback restores hosted content/configuration; it does not undo database writes, rules or function changes. This is why deployment boundaries matter.

Firebase supports moving a reviewed channel version to live by cloning, and rolling a site's live channel back through its release history. Cloning also publishes to its destination; it must not be run during this held preparation phase. See [Hosting versions and rollback](https://firebase.google.com/docs/hosting/manage-hosting-resources) and [explicit deploy targets](https://firebase.google.com/docs/cli/targets).

## Local verification commands

From the web repository, run this single command in a regular PowerShell terminal:

```powershell
& .\tools\run-offline-qa.ps1
```

The helper runs unit checks, refreshes the offline build, starts a hidden local preview when needed and runs both browser suites. It checks the fixture title before testing and stops only a server it started. It records completed stages and failure status in `run-status.json`. It neither deploys nor contacts live Firebase. Evidence defaults to `.qa-readiness-evidence`; copy reviewed evidence into the chat's `outputs` folder for handover. Do not change PowerShell execution policy just for this helper; its individual Node commands are available in the script if local policy blocks script execution.

## 9 October local result

51 unit tests pass, including update deferral with both application guards, focused fields and modal dialogs. Production and offline fixture builds pass. Edge exits during launch in the restricted agent environment, before browser assertions execute; browser checks and fresh screenshots remain pending. The one-command helper successfully started and cleaned up its own preview server. Do not mark the readiness milestone or installed-device acceptance complete from these results.

## Isolated rehearsal runner

The synthetic current-worker upgrade/rollback runner is available as `node tools/check-pwa-rehearsal.mjs`. See [rehearsal scope, results and device gates](PWA-REHEARSAL-2026-10-09.md). Its HTTP fixture and worker logic checks pass, but the agent browser run failed at Edge startup before assertions. This is not evidence of successful browser rollback or migration from the actual deployed worker.
