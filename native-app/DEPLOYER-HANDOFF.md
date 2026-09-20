# Community Connect Australia: native production handoff

## Scope and source

This `native-app/` directory is the React Native / Expo SDK 54 application.
The repository root remains the existing PWA. Do not replace the root package,
Firebase configuration, website files, or `android-native-wrapper/` with this app.
Run native commands from **`native-app/`**, never from the repository root.

Imported from https://github.com/SAJ0786/CommunityEvents-Native at commit
`dfe3751d141998eb8756d858d7bc968bbd18b043` on 20 September 2026.
All 247 tracked source files are included. The only import adjustments are this
handoff guide and native-local Git/EAS ignore rules for folder isolation and
signing-secret protection. Runtime code and dependency versions are unchanged.
The included `android/app/debug.keystore` is a development key, NOT a release key.
No production keystore, certificate private key, credential file, local `.env`,
node_modules, generated iOS project or finished app artifact was imported.

The standalone native repository remains the authoritative development source;
this directory is a release handoff snapshot, not an automatically synchronized
copy. Coordinate future changes with the app owner before refreshing it.

## Existing store app: do not create a replacement listing

| Setting | Required value |
| --- | --- |
| Display/store name | Community Connect Australia |
| iOS production bundle ID | `info.siza.communityevents` |
| Android package | `info.siza.communityevents.app` |
| Firebase project | `community-event-8b639` |
| Proposed marketing version | `2.0.0` (confirm against existing App Store versions) |
| EAS production profile | `production` |

Use the Apple Developer team that owns the existing App Store record. Confirm
the existing numeric App Store Connect Apple ID, marketing version and latest
uploaded build number (including TestFlight) before building. `app.json` contains
an iOS build-number baseline of `1`; it is NOT evidence that 1 is available.
EAS production uses remote versioning and auto-increment, which still must be
checked against the existing App Store record before uploading.

Use a valid Apple Distribution certificate/private key and an App Store
provisioning profile for this bundle ID on that team. A personal-test profile
cannot be used for this update. Confirm Push Notifications and production
App Attest entitlements/profile support. Configure the production APNs/Firebase
delivery credentials separately from app signing, then test them on TestFlight.

Rename the existing store listing to Community Connect Australia. Keeping the
existing store identity allows an update of the installed wrapper; user/device
automatic-update settings still govern when it installs. Existing wrapper-local
login/session data is not assumed to migrate to the native app.

## Install and validate

Use Node 22 (the existing CI pins 22.14.0), from the repository root:

```sh
cd native-app
npm ci
npm run check
npm run check:release
npm run test:regressions
```

Do not skip the `postinstall` hook: `patch-package` applies the native livestream
bridge fixes. Keep `patches/` and `plugins/with-rnfirebase-cocoapods.js` intact.
There is no checked-in `ios/` directory: Expo prebuild generates it with those
plugins and the production Firebase plist. Expo Go cannot test this application.

Known validation caveat at this source revision: the regression suite has
previously stopped in `scripts/test-stream-lifecycle.cjs` at "Ended stream must
not minimise" because the assertion targets the older minimise implementation.
This is not an all-tests-passed handoff. Review the assertion and verify actual
livestream/PiP behavior on devices before public release. Do not bypass checks
or claim that a static source check constitutes a signed-iOS device test.

## Build with EAS

The checked-in config links to the owner's existing Expo project. Obtain access
to that Expo project/account before building; do not run `eas init` to silently
replace its project ID. The Expo account can differ from the Apple owning team.

The EAS `production` environment must contain the protected
`GOOGLE_MAPS_API_KEY`; the app config requires it even when generating iOS.
Do not copy production keys or passwords into this repository. The production
profile sets `APP_RELEASE_MODE=production` and `APP_CHECK_PROVIDER=production`.
Remove personal-test overrides from the build environment: in particular
`IOS_BUNDLE_IDENTIFIER`, `IOS_GOOGLE_SERVICES_FILE`, and App Check debug tokens.
The production plist is `GoogleService-Info.plist`.

From `native-app/`, after signing access and store version numbers are confirmed:

```sh
npx eas-cli@latest credentials --platform ios
npx eas-cli@latest build --platform ios --profile production
```

Select **production** and the owning Apple team when configuring credentials.
This builds an IPA; it does not automatically publish a store release.
The pinned EAS image is `macos-sequoia-15.6-xcode-26.0`.

## If using Codemagic or a Mac instead

**Do not launch `native-app/codemagic.yaml`'s `ios-personal-testflight` workflow
for production.** It deliberately targets
`info.siza.communityconnect.personaltest` and a different numeric Apple ID.
It is retained only as part of the exact source snapshot.

Codemagic normally reads `codemagic.yaml` from the repository root. This handoff
does not create or enable a root workflow, modify the PWA build, configure your
Apple integration, or trigger an automatic submission. The developer should
configure an explicit production workflow with `working_directory: native-app`,
the owning Apple integration, the production bundle ID, and a confirmed build
number above existing uploads. Run native scripts in `native-app/` and resolve
IPA artifact paths under `native-app/build/ios/ipa/` if using the same build tool.

For a local Mac/Xcode archive, first supply `GOOGLE_MAPS_API_KEY` privately, set
`APP_RELEASE_MODE=production` and `APP_CHECK_PROVIDER=production`, and clear
personal-test environment overrides. After `npm ci`, generate only iOS:

```sh
npx expo prebuild --platform ios
```

Install CocoaPods if prebuild has not installed them, open the generated
`ios/*.xcworkspace`, select the owning Apple team, set the confirmed version and
build number, and archive/export for App Store Connect. Do not regenerate
Android: its checked-in native source contains the custom streaming component.

## Before delivery

- Verify the actual IPA's bundle ID, team, version/build and entitlements.
- Upload to the existing app record and test sign-in/App Check, messages,
  notifications (including Azaan sound), calendar and live-stream/PiP on iPhone.
- Obtain owner approval before public release. No release is triggered here.
- Native `backend/` is included for source completeness; do not deploy it or the
  root PWA backend merely as part of building this iOS app.
- Keep credentials outside Git and share any necessary signing files securely.

References: [EAS builds in a monorepo](https://docs.expo.dev/build-reference/build-with-monorepos/),
[existing signing credentials](https://docs.expo.dev/app-signing/existing-credentials/),
[Codemagic monorepo configuration](https://docs.codemagic.io/partials/monorepo-apps/).
