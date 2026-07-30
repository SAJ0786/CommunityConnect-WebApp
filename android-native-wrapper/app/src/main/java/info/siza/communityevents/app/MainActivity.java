package info.siza.communityevents.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.OrientationEventListener;
import android.view.SurfaceHolder;
import android.view.View;
import android.view.WindowManager;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.annotation.Nullable;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.google.firebase.messaging.FirebaseMessaging;
import com.pedro.library.view.OpenGlView;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

public class MainActivity extends Activity {
    static final String APP_URL = "https://communityevents.siza.info";
    private static final int PERMISSION_REQUEST = 201;

    private WebView webView;
    private FrameLayout root;
    private OpenGlView cameraView;
    private LinearLayout nativeOverlay;
    private LinearLayout nativeButtons;
    private LinearLayout nativeTopPanel;
    private TextView nativeTitle;
    private TextView nativeStatus;
    private TextView nativeTimer;
    private TextView nativeStats;
    private TextView nativeOrientationWarning;
    private TextView nativeMicMeter;
    private TextView nativeMicLabel;
    private TextView nativeMicPercent;
    private View nativeMicFill;
    private View nativeMicRemainder;
    private TextView nativeMuteButton;
    private NativeRtmpStreamer streamer;
    private NativeStreamBridge bridge;
    private boolean nativeMuted = false;
    private boolean nativeSurfaceReady = false;
    private long nativeStartedAt = 0;
    private int nativeMicPulse = 0;
    private String nativeChosenOrientation = "landscape";
    private OrientationEventListener nativeOrientationListener;
    private final Handler nativeTimerHandler = new Handler(Looper.getMainLooper());
    private final Handler nativeControlsHandler = new Handler(Looper.getMainLooper());
    private String pendingNativePushToken = null;
    private final List<Runnable> pendingSurfaceActions = new ArrayList<>();
    private final Runnable hideNativeControls = () -> {
        if (nativeButtons != null) nativeButtons.setVisibility(View.INVISIBLE);
        if (nativeTopPanel != null) nativeTopPanel.setVisibility(View.INVISIBLE);
    };
    private final Runnable nativeTimerTick = new Runnable() {
        @Override
        public void run() {
            updateNativeTimer();
            nativeTimerHandler.postDelayed(this, 1000);
        }
    };

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        root = new FrameLayout(this);
        webView = new WebView(this);
        cameraView = new OpenGlView(this);
        cameraView.setVisibility(View.GONE);
        cameraView.setClickable(false);
        cameraView.setFocusable(false);
        cameraView.getHolder().addCallback(new SurfaceHolder.Callback() {
            @Override
            public void surfaceCreated(SurfaceHolder holder) {
                nativeSurfaceReady = holder.getSurface() != null && holder.getSurface().isValid();
                runPendingSurfaceActions();
            }

            @Override
            public void surfaceChanged(SurfaceHolder holder, int format, int width, int height) {
                nativeSurfaceReady = holder.getSurface() != null && holder.getSurface().isValid();
                runPendingSurfaceActions();
            }

            @Override
            public void surfaceDestroyed(SurfaceHolder holder) {
                nativeSurfaceReady = false;
            }
        });
        nativeOverlay = buildNativeOverlay();
        nativeOverlay.setVisibility(View.GONE);

        root.addView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
        ));
        root.addView(cameraView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
        ));
        root.addView(nativeOverlay, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
        ));
        setContentView(root);

        streamer = new NativeRtmpStreamer(this, cameraView, this::dispatchNativeEvent);
        bridge = new NativeStreamBridge(this, streamer, this::dispatchNativeEvent);
        nativeOrientationListener = new OrientationEventListener(this) {
            @Override
            public void onOrientationChanged(int orientation) {
                updateNativeOrientationWarning(orientation);
            }
        };

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setGeolocationEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);

        webView.addJavascriptInterface(bridge, "CommunityEventsAndroid");
        webView.setWebViewClient(new AppWebViewClient());
        webView.setWebChromeClient(new AppChromeClient());

        requestRuntimePermissions();
        webView.loadUrl(resolveInitialUrl());
        setupNativePushNotifications();
    }

    private String resolveInitialUrl() {
        Intent intent = getIntent();
        Uri data = intent != null ? intent.getData() : null;
        if (data != null && "communityevents.siza.info".equalsIgnoreCase(data.getHost())) {
            return data.toString();
        }
        return APP_URL;
    }

    void setNativePreviewVisible(boolean visible) {
        runOnUiThread(() -> {
            cameraView.setVisibility(visible ? View.VISIBLE : View.GONE);
            nativeOverlay.setVisibility(visible ? View.VISIBLE : View.GONE);
            if (visible) {
                cameraView.bringToFront();
                nativeOverlay.bringToFront();
                cameraView.setElevation(20f);
                nativeOverlay.setElevation(30f);
                nativeMuted = false;
                if (nativeMuteButton != null) nativeMuteButton.setText("Mic On");
                updateNativeStatus("Starting camera...");
                updateNativeStats("Preparing YouTube connection");
                showNativeControlsTemporarily();
            } else {
                unlockNativeStreamOrientation();
                stopNativeOrientationMonitor();
                stopNativeTimer();
                nativeControlsHandler.removeCallbacks(hideNativeControls);
            }
        });
    }

    void setNativeChosenOrientation(String orientation) {
        runOnUiThread(() -> {
            nativeChosenOrientation = "portrait".equalsIgnoreCase(orientation) ? "portrait" : "landscape";
            if (nativeOrientationListener != null && nativeOrientationListener.canDetectOrientation()) {
                nativeOrientationListener.enable();
            }
            if (nativeOrientationWarning != null) nativeOrientationWarning.setVisibility(View.GONE);
        });
    }

    void lockNativeStreamOrientation(String orientation) {
        runOnUiThread(() -> {
            boolean landscape = "landscape".equalsIgnoreCase(orientation);
            clearNativeSurfaceWaits();
            setRequestedOrientation(landscape
                    ? ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
                    : ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
        });
    }

    void unlockNativeStreamOrientation() {
        runOnUiThread(() -> setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_FULL_SENSOR));
    }

    private void stopNativeOrientationMonitor() {
        if (nativeOrientationListener != null) nativeOrientationListener.disable();
        if (nativeOrientationWarning != null) nativeOrientationWarning.setVisibility(View.GONE);
    }

    private void updateNativeOrientationWarning(int degrees) {
        if (nativeOrientationWarning == null || degrees == OrientationEventListener.ORIENTATION_UNKNOWN) return;
        boolean landscape = (degrees >= 45 && degrees <= 135) || (degrees >= 225 && degrees <= 315);
        String current = landscape ? "landscape" : "portrait";
        if (!current.equals(nativeChosenOrientation)) {
            nativeOrientationWarning.setText("Rotate phone back to " + nativeChosenOrientation);
            nativeOrientationWarning.setVisibility(View.VISIBLE);
            nativeOrientationWarning.bringToFront();
        } else {
            nativeOrientationWarning.setVisibility(View.GONE);
        }
    }

    void clearNativeSurfaceWaits() {
        nativeSurfaceReady = false;
        pendingSurfaceActions.clear();
    }

    void setNativeEventTitle(String title) {
        runOnUiThread(() -> {
            String cleanTitle = title == null || title.trim().isEmpty() ? "Community Events Live" : title.trim();
            if (nativeTitle != null) nativeTitle.setText(cleanTitle);
        });
    }

    void runWhenNativeSurfaceReady(Runnable action) {
        runOnUiThread(() -> {
            SurfaceHolder holder = cameraView.getHolder();
            boolean hasValidSurface = holder != null && holder.getSurface() != null && holder.getSurface().isValid();
            nativeSurfaceReady = hasValidSurface;
            if (nativeSurfaceReady) {
                cameraView.postDelayed(action, 300);
            } else {
                pendingSurfaceActions.add(action);
                updateNativeStatus("Waiting for camera surface...");
                cameraView.postDelayed(() -> {
                    SurfaceHolder retryHolder = cameraView.getHolder();
                    boolean retryReady = retryHolder != null && retryHolder.getSurface() != null && retryHolder.getSurface().isValid();
                    if (retryReady) {
                        nativeSurfaceReady = true;
                        runPendingSurfaceActions();
                    }
                }, 350);
                cameraView.postDelayed(() -> {
                    if (!nativeSurfaceReady && pendingSurfaceActions.contains(action)) {
                        pendingSurfaceActions.remove(action);
                        dispatchNativeEvent("{\"type\":\"error\",\"message\":\"Camera preview surface was not ready. Please close and try again.\"}");
                    }
                }, 5000);
            }
        });
    }

    private void runPendingSurfaceActions() {
        if (!nativeSurfaceReady || pendingSurfaceActions.isEmpty()) return;
        List<Runnable> actions = new ArrayList<>(pendingSurfaceActions);
        pendingSurfaceActions.clear();
        for (Runnable action : actions) cameraView.postDelayed(action, 300);
    }

    void postNativeActionDelayed(Runnable action, long delayMs) {
        runOnUiThread(() -> cameraView.postDelayed(action, delayMs));
    }

    void updateNativeStatus(String message) {
        runOnUiThread(() -> {
            if (nativeStatus != null) nativeStatus.setText(message == null || message.isEmpty() ? "Native streaming" : message);
        });
    }

    private void updateNativeStats(String message) {
        runOnUiThread(() -> {
            if (nativeStats != null) nativeStats.setText(message == null || message.isEmpty() ? "" : message);
        });
    }

    private void updateNativeMicMeter(boolean micActive, double level) {
        runOnUiThread(() -> {
            if (nativeMicMeter == null || nativeMicFill == null || nativeMicLabel == null || nativeMicPercent == null) return;
            if (!micActive) {
                nativeMicLabel.setText("Mic muted");
                nativeMicLabel.setTextColor(0xfffecaca);
                nativeMicPercent.setText("0%");
            nativeMicFill.setLayoutParams(new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, 0f));
            if (nativeMicRemainder != null) {
                nativeMicRemainder.setLayoutParams(new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, 100f));
            }
            return;
            }
            nativeMicPulse = (nativeMicPulse + 1) % 7;
            double pulsedLevel = Math.max(level, 0.25 + nativeMicPulse * 0.09);
            int percent = Math.max(1, Math.min(100, (int) Math.round(pulsedLevel * 100)));
            nativeMicLabel.setText(percent < 8 ? "No mic input" : "Mic active");
            nativeMicLabel.setTextColor(percent < 8 ? 0xfffecaca : 0xffbbf7d0);
            nativeMicPercent.setText(percent + "%");
            nativeMicFill.setLayoutParams(new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, Math.max(1, percent)));
            if (nativeMicRemainder != null) {
                nativeMicRemainder.setLayoutParams(new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, Math.max(0, 100 - percent)));
            }
        });
    }

    private void showNativeControlsTemporarily() {
        runOnUiThread(() -> {
            if (nativeTopPanel != null) nativeTopPanel.setVisibility(View.VISIBLE);
            if (nativeButtons != null) nativeButtons.setVisibility(View.VISIBLE);
            nativeControlsHandler.removeCallbacks(hideNativeControls);
            nativeControlsHandler.postDelayed(hideNativeControls, 4200);
        });
    }

    private void startNativeTimer() {
        nativeStartedAt = System.currentTimeMillis();
        nativeTimerHandler.removeCallbacks(nativeTimerTick);
        updateNativeTimer();
        nativeTimerHandler.postDelayed(nativeTimerTick, 1000);
    }

    private void stopNativeTimer() {
        nativeTimerHandler.removeCallbacks(nativeTimerTick);
        nativeStartedAt = 0;
        if (nativeTimer != null) nativeTimer.setText("00:00");
        if (nativeStats != null) nativeStats.setText("");
    }

    private void updateNativeTimer() {
        if (nativeTimer == null || nativeStartedAt <= 0) return;
        long elapsed = Math.max(0, (System.currentTimeMillis() - nativeStartedAt) / 1000);
        long minutes = elapsed / 60;
        long seconds = elapsed % 60;
        nativeTimer.setText(String.format("%02d:%02d", minutes, seconds));
    }

    void dispatchNativeEvent(String jsonPayload) {
        runOnUiThread(() -> {
            try {
                JSONObject payload = new JSONObject(jsonPayload);
                String type = payload.optString("type", "status");
                String message = payload.optString("message", type);
                if ("live".equals(type)) {
                    updateNativeStatus("Live on YouTube");
                    updateNativeStats("Streaming quality looks good");
                    startNativeTimer();
                    showNativeControlsTemporarily();
                } else if ("error".equals(type)) {
                    updateNativeStatus("Streaming error");
                    updateNativeStats(message);
                    stopNativeTimer();
                } else if ("stats".equals(type)) {
                    long kbps = payload.optLong("bitrate", 0) / 1000;
                    String quality = payload.optString("qualityProfile", "");
                    boolean micActive = payload.optBoolean("micActive", true);
                    double micLevel = payload.optDouble("micLevel", micActive ? 0.7 : 0);
                    updateNativeStatus("Live on YouTube");
                    updateNativeStats((quality.isEmpty() ? "" : quality + " - ") + kbps + " kbps");
                    updateNativeMicMeter(micActive, micLevel);
                } else if ("endConfirmed".equals(type)) {
                    updateNativeStatus("Ending stream...");
                    updateNativeStats("Please wait while YouTube and the app are updated");
                } else if ("stopped".equals(type)) {
                    updateNativeStatus("Stream stopped");
                    stopNativeTimer();
                }
                else if (!"endConfirmed".equals(type)) updateNativeStatus(message);
            } catch (Exception ignored) {
            }
            String escaped = jsonPayload
                    .replace("\\", "\\\\")
                    .replace("'", "\\'")
                    .replace("\n", "\\n")
                    .replace("\r", "");
            webView.evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('communityevents:nativeStreamEvent',{detail:JSON.parse('" + escaped + "')}));",
                    null
            );
        });
    }

    private LinearLayout buildNativeOverlay() {
        LinearLayout overlay = new LinearLayout(this);
        overlay.setOrientation(LinearLayout.VERTICAL);
        overlay.setGravity(Gravity.BOTTOM);
        overlay.setPadding(18, 28, 18, 30);
        overlay.setBackgroundColor(Color.TRANSPARENT);
        overlay.setOnClickListener(v -> showNativeControlsTemporarily());

        nativeTopPanel = new LinearLayout(this);
        nativeTopPanel.setOrientation(LinearLayout.VERTICAL);
        nativeTopPanel.setPadding(14, 8, 14, 8);
        nativeTopPanel.setBackground(roundedBackground(0xbb000000, 18, 0x33000000));

        nativeMicMeter = new TextView(this);
        nativeMicMeter.setVisibility(View.GONE);

        nativeOrientationWarning = new TextView(this);
        nativeOrientationWarning.setText("");
        nativeOrientationWarning.setTextColor(0xff7c2d12);
        nativeOrientationWarning.setTextSize(15);
        nativeOrientationWarning.setTypeface(null, Typeface.BOLD);
        nativeOrientationWarning.setGravity(Gravity.CENTER);
        nativeOrientationWarning.setPadding(12, 12, 12, 12);
        nativeOrientationWarning.setVisibility(View.GONE);
        nativeOrientationWarning.setBackground(roundedBackground(0xfffff3c4, 16, 0xfff59e0b));

        LinearLayout micPanel = new LinearLayout(this);
        micPanel.setOrientation(LinearLayout.HORIZONTAL);
        micPanel.setGravity(Gravity.CENTER_VERTICAL);
        micPanel.setPadding(12, 8, 12, 8);
        micPanel.setBackground(roundedBackground(0xbb000000, 16, 0x44ffffff));

        nativeMicLabel = new TextView(this);
        nativeMicLabel.setText("Mic waiting");
        nativeMicLabel.setTextColor(0xffd1fae5);
        nativeMicLabel.setTextSize(13);
        nativeMicLabel.setTypeface(null, Typeface.BOLD);
        nativeMicLabel.setGravity(Gravity.CENTER_VERTICAL);

        LinearLayout meterTrack = new LinearLayout(this);
        meterTrack.setOrientation(LinearLayout.HORIZONTAL);
        meterTrack.setGravity(Gravity.CENTER_VERTICAL);
        meterTrack.setPadding(0, 0, 0, 0);
        meterTrack.setBackground(roundedBackground(0xff374151, 8, 0x00ffffff));

        nativeMicFill = new View(this);
        nativeMicFill.setBackground(roundedBackground(0xffff4d5e, 8, 0x00ffffff));
        nativeMicRemainder = new View(this);
        meterTrack.addView(nativeMicFill, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, 3f));
        meterTrack.addView(nativeMicRemainder, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, 97f));

        nativeMicPercent = new TextView(this);
        nativeMicPercent.setText("0%");
        nativeMicPercent.setTextColor(0xffffffff);
        nativeMicPercent.setTextSize(12);
        nativeMicPercent.setTypeface(null, Typeface.BOLD);
        nativeMicPercent.setGravity(Gravity.CENTER_VERTICAL | Gravity.RIGHT);

        micPanel.addView(nativeMicLabel, new LinearLayout.LayoutParams(dp(105), LinearLayout.LayoutParams.WRAP_CONTENT));
        LinearLayout.LayoutParams trackParams = new LinearLayout.LayoutParams(0, dp(12), 1f);
        trackParams.setMargins(10, 0, 10, 0);
        micPanel.addView(meterTrack, trackParams);
        micPanel.addView(nativeMicPercent, new LinearLayout.LayoutParams(dp(42), LinearLayout.LayoutParams.WRAP_CONTENT));

        nativeButtons = new LinearLayout(this);
        nativeButtons.setOrientation(LinearLayout.HORIZONTAL);
        nativeButtons.setGravity(Gravity.CENTER);
        nativeButtons.setPadding(0, dp(12), 0, 0);

        TextView switchButton = nativeButton("Flip Camera");
        switchButton.setOnClickListener(v -> {
            try {
                streamer.switchCamera();
                updateNativeStatus("Camera switched");
            } catch (Exception e) {
                updateNativeStatus("Switch failed: " + e.getMessage());
            }
        });

        nativeMuteButton = nativeButton("Mic On");
        nativeMuteButton.setOnClickListener(v -> {
            nativeMuted = !nativeMuted;
            streamer.setMuted(nativeMuted);
            nativeMuteButton.setText(nativeMuted ? "Mic Off" : "Mic On");
            updateNativeStatus(nativeMuted ? "Microphone muted" : "Microphone active");
        });

        TextView endButton = nativeButton("End Stream");
        endButton.setTextColor(Color.WHITE);
        endButton.setBackground(roundedBackground(0xffb91c1c, 18, 0x00ffffff));
        endButton.setOnClickListener(v -> dispatchNativeEvent("{\"type\":\"endConfirmed\",\"message\":\"Ending stream\"}"));

        nativeButtons.addView(switchButton, buttonLayout());
        nativeButtons.addView(nativeMuteButton, buttonLayout());
        nativeButtons.addView(endButton, buttonLayout());

        nativeTopPanel.addView(micPanel, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        ));
        LinearLayout.LayoutParams warningParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        warningParams.setMargins(8, 0, 8, 12);
        overlay.addView(nativeOrientationWarning, warningParams);
        overlay.addView(new View(this), new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                0,
                1f
        ));
        overlay.addView(nativeTopPanel, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        ));
        overlay.addView(nativeButtons, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        ));
        return overlay;
    }

    private TextView nativeButton(String label) {
        TextView button = new TextView(this);
        button.setText(label);
        button.setTextSize(15);
        button.setTextColor(Color.WHITE);
        button.setTypeface(null, Typeface.BOLD);
        button.setGravity(Gravity.CENTER);
        button.setClickable(true);
        button.setFocusable(true);
        button.setPadding(dp(8), 0, dp(8), 0);
        button.setBackground(roundedBackground(0xdd0f766e, 18, 0x22ffffff));
        return button;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private LinearLayout.LayoutParams buttonLayout() {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, dp(54), 1f);
        params.setMargins(dp(5), 0, dp(5), 0);
        return params;
    }

    private GradientDrawable roundedBackground(int color, int radiusDp, int strokeColor) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(color);
        drawable.setCornerRadius(radiusDp * getResources().getDisplayMetrics().density);
        if (strokeColor != 0x00ffffff) {
            drawable.setStroke(1, strokeColor);
        }
        return drawable;
    }

    private void requestRuntimePermissions() {
        List<String> permissions = new ArrayList<>();
        permissions.add(Manifest.permission.CAMERA);
        permissions.add(Manifest.permission.RECORD_AUDIO);
        if (Build.VERSION.SDK_INT >= 33) {
            permissions.add(Manifest.permission.POST_NOTIFICATIONS);
        }

        List<String> missingPermissions = new ArrayList<>();
        for (String permission : permissions) {
            if (ContextCompat.checkSelfPermission(this, permission) != PackageManager.PERMISSION_GRANTED) {
                missingPermissions.add(permission);
            }
        }
        if (!missingPermissions.isEmpty()) {
            ActivityCompat.requestPermissions(this, missingPermissions.toArray(new String[0]), PERMISSION_REQUEST);
        }
    }

    private void setupNativePushNotifications() {
        try {
            String cached = getSharedPreferences("community_push", MODE_PRIVATE).getString("fcmToken", null);
            if (cached != null && !cached.isEmpty()) deliverNativePushTokenToWeb(cached);
            FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
                if (!task.isSuccessful() || task.getResult() == null || task.getResult().isEmpty()) return;
                String token = task.getResult();
                getSharedPreferences("community_push", MODE_PRIVATE)
                        .edit()
                        .putString("fcmToken", token)
                        .apply();
                deliverNativePushTokenToWeb(token);
            });
        } catch (Exception ignored) {
        }
    }

    private void deliverNativePushTokenToWeb(String token) {
        pendingNativePushToken = token;
        if (webView == null || token == null || token.isEmpty()) return;
        runOnUiThread(() -> {
            String tokenJson = JSONObject.quote(token);
            webView.evaluateJavascript(
                    "window.__communityEventsNativePushToken=" + tokenJson + ";" +
                            "window.dispatchEvent(new CustomEvent('community-events-native-push-token',{detail:{token:" +
                            tokenJson + ",platform:'android-native'}}));",
                    null
            );
        });
    }

    void updateNativePushToken(String token) {
        if (token == null || token.isEmpty()) return;
        getSharedPreferences("community_push", MODE_PRIVATE)
                .edit()
                .putString("fcmToken", token)
                .apply();
        deliverNativePushTokenToWeb(token);
    }

    private void deliverPendingNativePushToken() {
        if (pendingNativePushToken != null && !pendingNativePushToken.isEmpty()) {
            deliverNativePushTokenToWeb(pendingNativePushToken);
        }
    }

    private class AppChromeClient extends WebChromeClient {
        @Override
        public void onPermissionRequest(PermissionRequest request) {
            runOnUiThread(() -> request.grant(request.getResources()));
        }

        @Override
        public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
            callback.invoke(origin, true, false);
        }
    }

    private class AppWebViewClient extends WebViewClient {
        @Override
        public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);
            deliverPendingNativePushToken();
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (uri == null) return false;
            String scheme = uri.getScheme();
            String host = uri.getHost();
            if ("https".equalsIgnoreCase(scheme) && "communityevents.siza.info".equalsIgnoreCase(host)) {
                return false;
            }
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
                return true;
            } catch (Exception ignored) {
                return false;
            }
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        stopNativeTimer();
        stopNativeOrientationMonitor();
        unlockNativeStreamOrientation();
        streamer.stopAll();
        if (webView != null) webView.destroy();
        super.onDestroy();
    }
}
