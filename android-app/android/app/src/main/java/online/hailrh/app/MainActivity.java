package online.hailrh.app;

import android.Manifest;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.webkit.PermissionRequest;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {

    private static final int PERMISSION_REQUEST_CODE = 100;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(HailCallPlugin.class);
        super.onCreate(savedInstanceState);

        HailConnectionService.registerPhoneAccount(this);
        handleCallIntent(getIntent());
        requestRuntimePermissions();
        promptPhoneAccountEnablement();
    }

    @Override
    public void onStart() {
        super.onStart();
        grantWebViewMicPermission();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleCallIntent(intent);
    }

    /** Forward answer/decline extras from the native call UI to the JS layer. */
    private void handleCallIntent(Intent intent) {
        if (intent == null) return;
        String action = intent.getStringExtra("hail_action");
        if (action == null) return;
        intent.removeExtra("hail_action");
        HailCallPlugin.emitCallAction(
            action,
            intent.getStringExtra("from"),
            intent.getStringExtra("callId"));
    }

    /** Allow getUserMedia audio capture inside the WebView. */
    private void grantWebViewMicPermission() {
        Bridge bridge = getBridge();
        if (bridge == null || bridge.getWebView() == null) return;
        bridge.getWebView().setWebChromeClient(new BridgeWebChromeClient(bridge) {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(() -> {
                    List<String> granted = new ArrayList<>();
                    for (String resource : request.getResources()) {
                        if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) {
                            granted.add(resource);
                        }
                    }
                    if (!granted.isEmpty()) {
                        request.grant(granted.toArray(new String[0]));
                    } else {
                        request.deny();
                    }
                });
            }
        });
    }

    private void requestRuntimePermissions() {
        List<String> needed = new ArrayList<>();
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED) {
            needed.add(Manifest.permission.RECORD_AUDIO);
        }
        if (Build.VERSION.SDK_INT >= 33
            && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED) {
            needed.add(Manifest.permission.POST_NOTIFICATIONS);
        }
        if (!needed.isEmpty()) {
            ActivityCompat.requestPermissions(this, needed.toArray(new String[0]), PERMISSION_REQUEST_CODE);
        }
    }

    /**
     * Self-managed calling accounts must be enabled by the user in system
     * settings before Android will route incoming calls to us. Prompt once.
     */
    private void promptPhoneAccountEnablement() {
        SharedPreferences prefs = getSharedPreferences("hail", MODE_PRIVATE);
        if (prefs.getBoolean("phone_account_prompted", false)) return;
        if (HailConnectionService.isPhoneAccountEnabled(this)) return;
        prefs.edit().putBoolean("phone_account_prompted", true).apply();
        try {
            Intent intent = new Intent(android.telecom.TelecomManager.ACTION_CHANGE_PHONE_ACCOUNTS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (Exception ignored) {
            // Settings screen unavailable; the notification fallback still rings.
        }
    }
}
