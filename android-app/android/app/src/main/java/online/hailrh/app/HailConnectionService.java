package online.hailrh.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.telecom.Connection;
import android.telecom.DisconnectCause;
import android.telecom.PhoneAccount;
import android.telecom.PhoneAccountHandle;
import android.telecom.ConnectionRequest;
import android.telecom.ConnectionService;
import android.telecom.TelecomManager;

import androidx.core.app.NotificationCompat;

/**
 * Self-managed ConnectionService: surfaces incoming hails through the system
 * telecom stack (call log, Bluetooth/headset buttons) and posts the
 * full-screen incoming-call notification that shows IncomingCallActivity.
 */
public class HailConnectionService extends ConnectionService {

    public static final String CHANNEL_ID = "hail_incoming_calls";
    public static final int NOTIFICATION_ID = 1001;
    private static final long RING_TIMEOUT_MS = 60000;

    private static HailConnection currentConnection;
    private static final Handler handler = new Handler(Looper.getMainLooper());
    private static Runnable timeoutRunnable;

    public static PhoneAccountHandle getPhoneAccountHandle(Context context) {
        return new PhoneAccountHandle(new ComponentName(context, HailConnectionService.class), "hail");
    }

    /** Register the self-managed phone account (idempotent). */
    public static void registerPhoneAccount(Context context) {
        try {
            TelecomManager tm = context.getSystemService(TelecomManager.class);
            PhoneAccountHandle handle = getPhoneAccountHandle(context);
            PhoneAccount account = PhoneAccount.builder(handle, "Hail")
                .setCapabilities(PhoneAccount.CAPABILITY_SELF_MANAGED)
                .build();
            tm.registerPhoneAccount(account);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    public static boolean isPhoneAccountEnabled(Context context) {
        try {
            TelecomManager tm = context.getSystemService(TelecomManager.class);
            PhoneAccount account = tm.getPhoneAccount(getPhoneAccountHandle(context));
            return account != null && account.isEnabled();
        } catch (Exception e) {
            return false;
        }
    }

    /** Entry point from FCM: ring the device for an incoming call. */
    public static void startIncomingCall(Context context, String from, String callId) {
        try {
            TelecomManager tm = context.getSystemService(TelecomManager.class);
            PhoneAccountHandle handle = getPhoneAccountHandle(context);
            Bundle callExtras = new Bundle();
            callExtras.putString("from", from);
            callExtras.putString("callId", callId);
            Bundle extras = new Bundle();
            extras.putParcelable(TelecomManager.EXTRA_PHONE_ACCOUNT_HANDLE, handle);
            extras.putBundle(TelecomManager.EXTRA_INCOMING_CALL_EXTRAS, callExtras);
            tm.addNewIncomingCall(handle, extras);
        } catch (Exception e) {
            // Phone account not enabled (or telecom unavailable): fall back to
            // the full-screen notification alone.
            showIncomingCallNotification(context, from, callId);
            scheduleTimeout(context, callId);
        }
    }

    @Override
    public Connection onCreateIncomingConnection(PhoneAccountHandle connectionManagerPhoneAccount, ConnectionRequest request) {
        String from = null;
        String callId = null;
        Bundle extras = request.getExtras();
        if (extras != null) {
            Bundle inner = extras.getBundle(TelecomManager.EXTRA_INCOMING_CALL_EXTRAS);
            Bundle src = inner != null ? inner : extras;
            from = src.getString("from");
            callId = src.getString("callId");
        }
        HailConnection connection = new HailConnection(this, from, callId);
        connection.setRinging();
        currentConnection = connection;
        showIncomingCallNotification(this, from, callId);
        scheduleTimeout(this, callId);
        return connection;
    }

    @Override
    public void onCreateIncomingConnectionFailed(PhoneAccountHandle connectionManagerPhoneAccount, ConnectionRequest request) {
        String from = null;
        String callId = null;
        Bundle extras = request.getExtras();
        if (extras != null) {
            Bundle inner = extras.getBundle(TelecomManager.EXTRA_INCOMING_CALL_EXTRAS);
            Bundle src = inner != null ? inner : extras;
            from = src.getString("from");
            callId = src.getString("callId");
        }
        showIncomingCallNotification(this, from, callId);
        scheduleTimeout(this, callId);
    }

    private static void scheduleTimeout(Context context, String callId) {
        cancelTimeout();
        Context appContext = context.getApplicationContext();
        timeoutRunnable = () -> {
            HailConnection conn = currentConnection;
            if (conn != null && (callId == null || callId.equals(conn.getCallId()))) {
                endCurrent(appContext, new DisconnectCause(DisconnectCause.MISSED));
            }
        };
        handler.postDelayed(timeoutRunnable, RING_TIMEOUT_MS);
    }

    private static void cancelTimeout() {
        if (timeoutRunnable != null) {
            handler.removeCallbacks(timeoutRunnable);
            timeoutRunnable = null;
        }
    }

    /** User answered (in-app UI, headset button, or notification). */
    public static void answerCurrent(Context context) {
        HailConnection conn = currentConnection;
        String from = conn != null ? conn.getFrom() : null;
        String callId = conn != null ? conn.getCallId() : null;
        endCurrent(context.getApplicationContext(), new DisconnectCause(DisconnectCause.LOCAL));

        // Hand the call to the WebView app; MainActivity forwards these extras
        // to the JS layer (stored as pending on cold start).
        Intent intent = new Intent(context, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        intent.putExtra("hail_action", "answer");
        intent.putExtra("from", from);
        intent.putExtra("callId", callId);
        context.startActivity(intent);
    }

    /** User declined. */
    public static void rejectCurrent(Context context) {
        HailConnection conn = currentConnection;
        String from = conn != null ? conn.getFrom() : null;
        String callId = conn != null ? conn.getCallId() : null;
        endCurrent(context.getApplicationContext(), new DisconnectCause(DisconnectCause.REJECTED));
        // If the app is alive its JS layer is told, so it can notify the caller.
        HailCallPlugin.emitCallAction("decline", from, callId);
    }

    /** Remote side hung up / call withdrawn (FCM end_call). */
    public static void endCall(Context context, String callId) {
        HailConnection conn = currentConnection;
        if (conn != null && (callId == null || callId.equals(conn.getCallId()))) {
            endCurrent(context.getApplicationContext(), new DisconnectCause(DisconnectCause.REMOTE));
        } else if (conn == null) {
            // Ring was notification-only (fallback path).
            cancelTimeout();
            cancelNotification(context);
            IncomingCallActivity.finishIfShowing();
        }
    }

    private static void endCurrent(Context context, DisconnectCause cause) {
        cancelTimeout();
        HailConnection conn = currentConnection;
        currentConnection = null;
        if (conn != null) {
            try {
                conn.end(cause);
            } catch (Exception ignored) {
            }
        }
        cancelNotification(context);
        IncomingCallActivity.finishIfShowing();
    }

    private static void showIncomingCallNotification(Context context, String from, String callId) {
        NotificationManager nm = context.getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "Incoming calls", NotificationManager.IMPORTANCE_HIGH);
            Uri ringtone = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            channel.setSound(ringtone, new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build());
            channel.enableVibration(true);
            channel.setVibrationPattern(new long[]{0, 1000, 1000});
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            nm.createNotificationChannel(channel);
        }

        Intent fullScreen = new Intent(context, IncomingCallActivity.class);
        fullScreen.putExtra("from", from);
        fullScreen.putExtra("callId", callId);
        fullScreen.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent fullScreenPi = PendingIntent.getActivity(
            context, 0, fullScreen, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        Notification notification = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("Incoming hail")
            .setContentText(from != null ? from : "Unknown caller")
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setFullScreenIntent(fullScreenPi, true)
            .build();
        nm.notify(NOTIFICATION_ID, notification);
    }

    private static void cancelNotification(Context context) {
        NotificationManager nm = context.getSystemService(NotificationManager.class);
        nm.cancel(NOTIFICATION_ID);
    }
}
