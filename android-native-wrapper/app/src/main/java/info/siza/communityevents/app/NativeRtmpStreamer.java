package info.siza.communityevents.app;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;

import com.pedro.common.ConnectChecker;
import com.pedro.encoder.input.video.CameraHelper;
import com.pedro.library.rtmp.RtmpCamera2;
import com.pedro.library.view.OpenGlView;

import org.json.JSONObject;

public class NativeRtmpStreamer implements ConnectChecker {
    private final RtmpCamera2 camera;
    private final OpenGlView view;
    private final NativeStreamBridge.EventSink events;
    private final Handler handler = new Handler(Looper.getMainLooper());

    private int width = 1280;
    private int height = 720;
    private int fps = 30;
    private int videoBitrate = 4500 * 1024;
    private int audioBitrate = 128 * 1024;
    private boolean muted = false;
    private boolean previewStarted = false;
    private boolean videoPrepared = false;
    private boolean audioPrepared = false;
    private CameraHelper.Facing facing = CameraHelper.Facing.BACK;
    private boolean portraitMode = false;
    private boolean stopping = false;
    private boolean suppressDisconnectCallback = false;
    private boolean everConnected = false;
    private int reconnectAttempts = 0;
    private String lastRtmpUrl = "";
    private static final int MAX_RECONNECT_ATTEMPTS = 4;
    private int fixedCaptureRotation = 0;

    NativeRtmpStreamer(Context context, OpenGlView view, NativeStreamBridge.EventSink events) {
        this.view = view;
        this.camera = new RtmpCamera2(view, this);
        this.events = events;
    }

    void configure(JSONObject options) {
        // A fresh stream must not inherit the previous preview/encoder state.
        // Android can recreate the surface during rotation, and RootEncoder may
        // otherwise keep the last landscape/portrait transform for the next run.
        suppressDisconnectCallback = true;
        stopAllInternal();
        suppressDisconnectCallback = false;

        String quality = options.optString("qualityProfile", "720p");
        String orientation = options.optString("orientation", "landscape");
        String facingMode = options.optString("facingMode", "environment");
        muted = options.optBoolean("muted", false);
        facing = "user".equals(facingMode) ? CameraHelper.Facing.FRONT : CameraHelper.Facing.BACK;
        portraitMode = "portrait".equals(orientation);
        reconnectAttempts = 0;
        everConnected = false;

        int baseWidth;
        int baseHeight;
        if ("1080p".equals(quality)) {
            baseWidth = 1920;
            baseHeight = 1080;
            videoBitrate = 6500 * 1024;
        } else if ("480p".equals(quality)) {
            baseWidth = 854;
            baseHeight = 480;
            videoBitrate = 1800 * 1024;
        } else {
            baseWidth = 1280;
            baseHeight = 720;
            videoBitrate = 4500 * 1024;
        }

        // RootEncoder expects the camera/encoder dimensions in the camera sensor's
        // natural landscape shape. For portrait it swaps the stream dimensions
        // internally when the rotation is 90/270. Supplying 720x1280 with rotation
        // 0 makes RootEncoder apply its own 270-degree GL rotation, which is the
        // anticlockwise portrait failure seen on Samsung devices.
        width = baseWidth;
        height = baseHeight;
        fixedCaptureRotation = portraitMode ? 90 : 0;
        view.setStreamRotation(0);
        view.setRotation(0);
        view.setEncoderSize(width, height);
        videoPrepared = false;
        audioPrepared = false;
    }

    void startPreview() {
        prepareEncoders();
        if (!previewStarted) {
            camera.startPreview(facing, width, height, fps, fixedCaptureRotation);
            previewStarted = true;
        }
    }

    void startStream(String rtmpUrl) {
        lastRtmpUrl = rtmpUrl;
        stopping = false;
        prepareEncoders();
        startPreview();
        if (camera.isStreaming()) return;

        if (muted) {
            camera.disableAudio();
        } else {
            camera.enableAudio();
        }
        camera.startStream(rtmpUrl);
        if (!muted) camera.enableAudio();
        send("status", "Connecting to YouTube");
    }

    private void prepareEncoders() {
        if (!videoPrepared) {
            videoPrepared = camera.prepareVideo(width, height, fps, videoBitrate, 2, fixedCaptureRotation);
            if (!videoPrepared) throw new IllegalStateException("Video encoder could not start");
        }
        if (!audioPrepared) {
            audioPrepared = camera.prepareAudio(audioBitrate, 44100, true, false, false);
            if (!audioPrepared) throw new IllegalStateException("Audio encoder could not start");
        }
    }

    void switchCamera() {
        camera.switchCamera();
        facing = facing == CameraHelper.Facing.BACK ? CameraHelper.Facing.FRONT : CameraHelper.Facing.BACK;
    }

    void setMuted(boolean muted) {
        this.muted = muted;
        if (camera.isStreaming()) {
            if (muted) camera.disableAudio();
            else camera.enableAudio();
        }
    }

    void stopAll() {
        stopping = true;
        reconnectAttempts = 0;
        lastRtmpUrl = "";
        suppressDisconnectCallback = true;
        stopAllInternal();
        suppressDisconnectCallback = false;
    }

    private void stopAllInternal() {
        if (camera.isStreaming()) camera.stopStream();
        if (previewStarted) {
            camera.stopPreview();
            previewStarted = false;
        }
        videoPrepared = false;
        audioPrepared = false;
    }

    private void scheduleReconnect(String reason) {
        if (stopping || lastRtmpUrl == null || lastRtmpUrl.isEmpty()) return;
        if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
            send("error", "Disconnected from YouTube: " + reason);
            stopAllInternal();
            return;
        }

        reconnectAttempts++;
        long delayMs;
        if (reconnectAttempts == 1) delayMs = everConnected ? 1500 : 2500;
        else if (reconnectAttempts == 2) delayMs = 5000;
        else delayMs = 8000;

        String message = everConnected
                ? "Connection interrupted - reconnecting (" + reconnectAttempts + "/" + MAX_RECONNECT_ATTEMPTS + ")"
                : "Preparing YouTube connection (" + reconnectAttempts + "/" + MAX_RECONNECT_ATTEMPTS + ")";
        send("status", message);
        suppressDisconnectCallback = true;
        stopAllInternal();
        suppressDisconnectCallback = false;
        handler.postDelayed(() -> {
            if (stopping || lastRtmpUrl == null || lastRtmpUrl.isEmpty()) return;
            try {
                startStream(lastRtmpUrl);
            } catch (Exception e) {
                scheduleReconnect(e.getMessage() == null ? e.toString() : e.getMessage());
            }
        }, delayMs);
    }

    private void send(String type, String message) {
        try {
            JSONObject payload = new JSONObject();
            payload.put("type", type);
            payload.put("message", message == null ? "" : message);
            events.send(payload.toString());
        } catch (Exception ignored) {
        }
    }

    @Override
    public void onConnectionStarted(String url) {
        send("status", "Connection started");
    }

    @Override
    public void onConnectionSuccess() {
        everConnected = true;
        reconnectAttempts = 0;
        send("live", "Streaming to YouTube");
    }

    @Override
    public void onConnectionFailed(String reason) {
        scheduleReconnect(reason == null || reason.isEmpty() ? "Connection failed" : reason);
    }

    @Override
    public void onNewBitrate(long bitrate) {
        try {
            JSONObject payload = new JSONObject();
            payload.put("type", "stats");
            payload.put("bitrate", bitrate);
            payload.put("micActive", !muted);
            payload.put("micLevel", muted ? 0 : 0.72);
            int longEdge = Math.max(width, height);
            payload.put("qualityProfile", longEdge >= 1920 ? "1080p" : longEdge >= 1280 ? "720p" : "480p");
            events.send(payload.toString());
        } catch (Exception ignored) {
        }
    }

    @Override
    public void onDisconnect() {
        if (suppressDisconnectCallback) return;
        if (stopping) {
            send("stopped", "Stopped");
        } else {
            scheduleReconnect(everConnected ? "Disconnected" : "Disconnected before live");
        }
    }

    @Override
    public void onAuthError() {
        send("error", "YouTube authentication failed");
    }

    @Override
    public void onAuthSuccess() {
        send("status", "YouTube authentication accepted");
    }
}
