# Local upgrade and rollback rehearsal

This rehearsal is prepared, but browser acceptance has not passed. On 9 October the agent's Edge process exited during sandbox startup, before the first browser assertion. The two HTTP-fixture checks and twelve worker/client logic checks passed.

## Run

From `C:\Users\sajja\Documents\Codex\2026-08-10\this-chat-is-for-community-events\community-events-deployer`:

```powershell
node tools/check-pwa-rehearsal.mjs
```

The runner starts its own loopback server on an available port and opens a fresh isolated browser context. It closes both afterwards, including on failure. Results go to `.qa-pwa-rehearsal/results.json`; screenshots are saved only if a browser page was opened. An optional first argument changes the evidence directory. A failed launch is recorded as failed with zero checks, never as successful QA.

## What it exercises

- The actual current `public/sw.js` and `src/services/swService.js` sources.
- Synthetic release A, a candidate with a deliberately missing asset, release B, and restoration of the exact A worker bytes.
- Failed install retaining the working release; a dirty tab deferring activation and reload even when another tab activates; deep-link preservation; previous cached assets remaining readable.
- Offline Directory shell loading, an unvisited static page's offline explanation, and failure rather than cached success for an offline server-backed action.
- Rollback and offline relaunch within the same browser context, without clearing its storage.

The server includes no production app, account data, Firebase configuration, API proxy or live-site fallback. Only local synthetic routes are served; non-GET requests are rejected. The runner cannot accept a production URL. No deployment takes place.

## Limits and remaining gates

This is a worker/client rehearsal with synthetic bundles. Both A and B use the current worker implementation. It does not prove migration from the actual old deployed PWA: its previous source/version must first be identified and used in the later staging rehearsal. It does not test authentication, Firebase messaging, native releases, operating-system installation, or the full Directory UI. The two UI browser suites still need a successful run after the shared form-label fix.

Use a separate authorised staging origin for the integrated app and devices. The localhost runner is intentionally unavailable to phones and is not an installable production candidate. Do not expose it on a LAN or substitute the live domain merely to test installation.

| Later acceptance | Evidence required | Status |
| --- | --- | --- |
| Desktop UI | Both UI browser suites pass on the final shared-label revision; inspect screenshots | Pending |
| Desktop worker lifecycle | This rehearsal passes and its screenshots/results are reviewed | Blocked by agent browser startup |
| Existing-PWA migration | Known old release upgrades to the integrated candidate on isolated staging | Pending old-release identification and integration |
| iPhone Home Screen | Record device/iOS version; launch, navigation, offline/reconnect, draft preservation and update behaviour | Pending |
| Android installed PWA | Record device/browser version; same checks plus install identity | Pending |
| Messaging and offline worker | Resolve root-scope overlap, then verify notifications with offline/update behaviour | Held with service integration |
| Actual release rollback | Restore the retained old hosting version in staging; verify ordinary and installed clients | Pending |

No release-readiness sign-off should be inferred from Node tests or a synthetic rehearsal alone. Sign-in, rules/backend integration, native releases and live deployment remain on hold.
