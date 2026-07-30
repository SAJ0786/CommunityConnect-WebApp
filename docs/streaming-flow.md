# Community Events Streaming Flow

## Current Streaming Modes

### Browser and iPhone path
1. Host taps Go Live.
2. `PreCheckCard` asks for stream visibility, orientation, and whether the host is streaming from the same device or another YouTube-enabled device.
3. For same-device streaming, the browser camera preview opens and lets the host check camera, mic, audio mode, and orientation.
4. `nativeStreamStart` creates/resumes a YouTube broadcast and relay session.
5. For another-device streaming, the host enters a valid YouTube live URL and the app marks the event live against that URL until the host ends it from the app.
6. Private streams use YouTube unlisted/link-only visibility. They must not create public event-card watch links or public stream-list entries, and the host may receive the private YouTube link by email after the stream is live.
7. `NativeStreamer` sends browser `MediaRecorder` chunks to Cloud Run relay.
8. Cloud Run relay pushes media to YouTube RTMPS.
9. `StreamCard` stays mounted as the host control frame, with End Stream, reconnect, mic meter, and orientation warnings.
10. End Stream calls `nativeStreamEndEvent`, clears event live fields, stops local media, and removes Watch on YouTube buttons.

### Android native wrapper path
1. Host taps Go Live.
2. `PreCheckCard` asks for stream visibility and orientation in the setup prompt.
3. Start is disabled until the physical phone orientation matches the selected orientation.
4. `nativeStreamStart` creates/resumes a YouTube broadcast and returns a direct RTMPS URL.
5. Android `NativeStreamBridge.startStream()` opens the native camera streaming surface, locks the selected capture orientation, and starts `NativeRtmpStreamer`.
6. `NativeRtmpStreamer` connects directly to YouTube RTMPS using RootEncoder.
7. The app waits for Android `live` confirmation and then checks YouTube health.
8. The event is marked live only after YouTube reports the stream is active/live.
9. The native camera screen owns the primary controls: Flip Camera, Mic On/Off, mic meter and End Stream. Controls may auto-hide while the video remains visible.
10. `StreamCard` remains mounted as the app-level fallback control surface. The native camera/controls are primary, but if Android's surface disappears, the host still has End Stream and retry controls.
11. Native End Stream dispatches `endConfirmed`; `StreamCard.handleEnd()` stops Android streaming and calls `nativeStreamEndEvent`.
12. `nativeStreamEndEvent` clears event live fields and removes Watch on YouTube buttons.

## Ownership Rules

- `PreCheckCard` owns only setup and start intent.
- Android native wrapper owns native camera preview, native flip/mic/end buttons, and direct RTMPS.
- `StreamCard` owns app-level host stream session, end confirmation, retry fallback, and live-state cleanup.
- Cloud Functions own YouTube broadcast/session creation, resume, end, thumbnails, and Firestore live status.
- Email functions may send private stream links to hosts and send configured reminder, update and admin emails through the active email provider.
- Event cards only reflect state. They must not be the only place a host can end a stream.

## Failure Rules

- Before first YouTube connection succeeds, Android messages should say "Preparing YouTube connection", not "Interrupted".
- Android must not mark the event live until YouTube ingest is active/live.
- After first successful live connection, disconnects can show reconnect/retry.
- If native camera screen disappears or turns black, `StreamCard` fallback must remain visible and able to end the stream.
- Event live state must never depend only on local UI state; it must be cleared by `nativeStreamEndEvent` or fallback Firestore update.
