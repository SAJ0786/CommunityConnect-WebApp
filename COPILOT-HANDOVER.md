# Community Connect Web App handover

Canonical repository: https://github.com/SAJ0786/CommunityConnect-WebApp, branch main. Read AGENTS.md first. Fetch incoming changes, preserve local work, test completed changes, commit/publish and verify local/remote HEAD and tree equality. Never push to the former deployer.

Current implementation and acceptance evidence: [PWA integration handover](docs/PWA-INTEGRATION-HANDOVER-2026-10-16.md).

## Current scope

The live PWA was replaced on 13 October. The new registration and dynamic-city work is a **disabled candidate**, not another live deployment. All three candidate environment flags in .env.example remain false. Do not deploy Firebase, modify security configuration, enable flags or publish store builds without separate release authority. Native/backend candidate code belongs to the sibling native checkout and must not be modified by web work.

Registration includes builder/templates, discovery/approval, attending list, attendee edit/cancel/confirmation, organiser responses/deletion/cancellation, private venue/poster lifecycle and account-deletion/notification surfaces. Dynamic cities include bundled and remote schema, disabled-ID retention, cache, routing/timezone usage and Super Admin search/preview/coordinate confirmation/Add. Details and limitations are in the linked handover.

## Next acceptance work

1. Browser layout and iPhone/PC workflow review when browser control is available; the tool could not start in the implementation session.
2. Candidate backend/rules/App Check, real roles, private storage and notification end-to-end acceptance under separately approved release work. Component fixtures are synthetic and do not replace these checks.
3. Align PWA promotion audience controls/feed with the native candidate contract; this remains a separate parity task.

## Verification commands

```powershell
node --test tests/*.test.mjs
npm ci --prefix tests/registration-renderer
npm test --prefix tests/registration-renderer
node tools/check-unified-web.mjs
node tools/check-candidate-integrations.mjs
git diff --check
```

The ordinary build uses disabled gates. The candidate build compiles enabled routes into .qa-integration-candidate for validation only; it does not deploy or change saved release flags. The workflow review at port 5198 uses a fictional in-memory API and refuses Firebase imports.
