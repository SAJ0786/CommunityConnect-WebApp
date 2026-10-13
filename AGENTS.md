# Community Connect Web App

## Repository ownership and sync

User instruction, 14 October 2026: the approved web repository is
https://github.com/SAJ0786/CommunityConnect-WebApp.git, branch `main`.

- Before new work, fetch this remote and check for changes. Reconcile safely with local work; preserve unrelated edits.
- After every completed coherent change, run appropriate checks, commit the intended files, push to `origin/main`, and verify that local and remote commit IDs match.
- Report any authentication, network, divergence or push failure explicitly. Never silently leave completed work local-only or force-push.
- Never push to `Amazingly-Intelligent-Solutions/community-events-australia`, through any remote, explicit URL or API. The optional `former-deployer` remote is reference-only and must retain its disabled push URL.
- Keep private environment files, credentials, dependency folders and generated QA/build artifacts out of Git. Keep `.env.example` as the setup template.
- This repository includes the web/PWA, its backend source and web wrapper history. The separate React Native app belongs in `SAJ0786/CommunityEvents-Native`; do not merge that checkout into this repository.
- Git sync does not authorise Firebase deployment, native builds or store publication. Registration prototype/candidate files are not proof of production registration integration.

## Local verification

From this repository root:

```powershell
npm ci
node --test tests/*.test.mjs
node tools/check-unified-web.mjs
git diff --check
```

The build command does not deploy. Integration/emulator/device checks have separate prerequisites; consult the release and workflow documents under `docs/`.
