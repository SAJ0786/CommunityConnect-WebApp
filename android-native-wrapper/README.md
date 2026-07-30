# Community Events Australia native Android wrapper

This is a fresh Android wrapper for the hosted Community Events Australia app.

Purpose:

- Load `https://communityevents.siza.info` in an app-owned WebView.
- Expose a JavaScript bridge named `CommunityEventsAndroid`.
- Let the web app keep Firebase, event permissions, and YouTube broadcast creation.
- Let Android native code handle camera, microphone, H.264/AAC encoding, and RTMPS upload to YouTube.

Why this exists:

- The old PWABuilder/Bubblewrap project is a Trusted Web Activity.
- A TWA runs inside Chrome and cannot provide a proper native camera/RTMPS streaming bridge.
- This wrapper is built from scratch so Android streaming can bypass browser `MediaRecorder`.

Build:

1. Open this folder in Android Studio.
2. Let Gradle sync dependencies.
3. Build an APK/AAB from `app`.

Important:

- The `applicationId` is `info.siza.communityevents.app`, matching the Play Store app id.
- Before production upload, check versionCode/versionName in `app/build.gradle`.
- Streaming depends on RootEncoder from JitPack.
