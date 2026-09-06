package online.hailrh.app;

import androidx.annotation.NonNull;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/**
 * Receives high-priority FCM data messages for calls. Data-only messages so
 * this runs even when the app is in the background or killed.
 */
public class HailFirebaseMessagingService extends FirebaseMessagingService {

    @Override
    public void onMessageReceived(@NonNull RemoteMessage message) {
        Map<String, String> data = message.getData();
        String type = data.get("type");
        if ("incoming_call".equals(type)) {
            String from = data.get("from");
            String callId = data.get("callId");
            if (from == null || callId == null) return;
            // The web app is connected and showing its own incoming-call UI.
            if (HailCallPlugin.isWebCallUiActive()) return;
            HailConnectionService.startIncomingCall(this, from, callId);
        } else if ("end_call".equals(type)) {
            HailConnectionService.endCall(this, data.get("callId"));
        }
    }

    @Override
    public void onNewToken(@NonNull String token) {
        // The web layer registers the current token with the backend on every
        // app start, so nothing to do here.
    }
}
