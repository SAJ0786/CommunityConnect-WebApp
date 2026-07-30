package info.siza.communityevents.app;

import android.webkit.JavascriptInterface;

import org.json.JSONObject;

public class NativeStreamBridge {
    private final MainActivity activity;
    private final NativeRtmpStreamer streamer;
    private final EventSink events;

    interface EventSink {
        void send(String jsonPayload);
    }

    NativeStreamBridge(MainActivity activity, NativeRtmpStreamer streamer, EventSink events) {
        this.activity = activity;
        this.streamer = streamer;
        this.events = events;
    }

    @JavascriptInterface
    public boolean isAvailable() {
        return true;
    }

    @JavascriptInterface
    public String getPlatform() {
        return "android-native";
    }

    @JavascriptInterface
    public void requestPreview(String optionsJson) {
        activity.runOnUiThread(() -> {
            try {
                JSONObject options = new JSONObject(optionsJson == null ? "{}" : optionsJson);
                String orientation = options.optString("orientation", "landscape");
                activity.setNativeChosenOrientation(orientation);
                activity.lockNativeStreamOrientation(orientation);
                streamer.configure(options);
                activity.setNativePreviewVisible(true);
                activity.runWhenNativeSurfaceReady(() -> {
                    try {
                        streamer.startPreview();
                        send("previewReady", "Native camera preview ready", null);
                    } catch (Exception e) {
                        send("error", e.getMessage(), null);
                    }
                });
            } catch (Exception e) {
                send("error", e.getMessage(), null);
            }
        });
    }

    @JavascriptInterface
    public void startStream(String optionsJson) {
        activity.runOnUiThread(() -> {
            try {
                JSONObject options = new JSONObject(optionsJson == null ? "{}" : optionsJson);
                String rtmpUrl = options.optString("rtmpUrl", "");
                if (rtmpUrl.isEmpty()) throw new IllegalArgumentException("Missing RTMPS URL");
                activity.setNativeEventTitle(options.optString("eventTitle", "Community Events Live"));
                String orientation = options.optString("orientation", "landscape");
                activity.setNativeChosenOrientation(orientation);
                activity.lockNativeStreamOrientation(orientation);
                activity.setNativePreviewVisible(true);
                activity.postNativeActionDelayed(() -> {
                    streamer.configure(options);
                    activity.runWhenNativeSurfaceReady(() -> {
                        startStreamWithSurfaceRetry(rtmpUrl, false);
                    });
                }, 650);
            } catch (Exception e) {
                send("error", e.getMessage(), null);
            }
        });
    }

    @JavascriptInterface
    public void stopStream() {
        activity.runOnUiThread(() -> {
            activity.clearNativeSurfaceWaits();
            streamer.stopAll();
            activity.setNativePreviewVisible(false);
            activity.unlockNativeStreamOrientation();
            send("stopped", "Stopped", null);
        });
    }

    @JavascriptInterface
    public void switchCamera() {
        activity.runOnUiThread(() -> {
            try {
                streamer.switchCamera();
                send("status", "Camera switched", null);
            } catch (Exception e) {
                send("error", e.getMessage(), null);
            }
        });
    }

    @JavascriptInterface
    public void setMuted(boolean muted) {
        activity.runOnUiThread(() -> {
            streamer.setMuted(muted);
            send("status", muted ? "Microphone muted" : "Microphone active", null);
        });
    }

    private void send(String type, String message, JSONObject extra) {
        try {
            JSONObject payload = extra == null ? new JSONObject() : extra;
            payload.put("type", type);
            payload.put("message", message == null ? "" : message);
            events.send(payload.toString());
        } catch (Exception ignored) {
        }
    }

    private void startStreamWithSurfaceRetry(String rtmpUrl, boolean retried) {
        try {
            streamer.startStream(rtmpUrl);
        } catch (Exception e) {
            String message = e.getMessage() == null ? "" : e.getMessage();
            boolean surfaceIssue = message.contains("Surface") || message.contains("surface");
            if (surfaceIssue && !retried) {
                send("status", "Camera surface settling - retrying stream start", null);
                try { streamer.stopAll(); } catch (Exception ignored) {}
                activity.clearNativeSurfaceWaits();
                activity.postNativeActionDelayed(() -> activity.runWhenNativeSurfaceReady(
                        () -> startStreamWithSurfaceRetry(rtmpUrl, true)
                ), 700);
                return;
            }
            send("error", message.isEmpty() ? e.toString() : message, null);
        }
    }
}
