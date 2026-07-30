package info.siza.communityevents.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.os.Build;

import androidx.core.app.NotificationCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

public class CommunityFirebaseMessagingService extends FirebaseMessagingService {
    private static final String CHANNEL_ID = "community_events_alerts";

    @Override
    public void onNewToken(String token) {
        super.onNewToken(token);
        getSharedPreferences("community_push", MODE_PRIVATE)
                .edit()
                .putString("fcmToken", token)
                .apply();
    }

    @Override
    public void onMessageReceived(RemoteMessage message) {
        super.onMessageReceived(message);
        RemoteMessage.Notification notification = message.getNotification();
        String title = notification != null && notification.getTitle() != null
                ? notification.getTitle()
                : "Community Events Australia";
        String body = notification != null && notification.getBody() != null
                ? notification.getBody()
                : "Open the app for the latest event update.";
        showNotification(title, body);
    }

    private void showNotification(String title, String body) {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Community Events Alerts",
                    NotificationManager.IMPORTANCE_DEFAULT
            );
            channel.setDescription("Event reminders and live stream alerts");
            channel.enableLights(true);
            channel.setLightColor(Color.rgb(15, 118, 110));
            manager.createNotificationChannel(channel);
        }

        Intent intent = new Intent(this, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this,
                0,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setAutoCancel(true)
                .setContentIntent(pendingIntent)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT);

        manager.notify((int) System.currentTimeMillis(), builder.build());
    }
}
