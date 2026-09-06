package online.hailrh.app;

import android.app.KeyguardManager;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;

/**
 * Full-screen incoming-call UI shown over the lock screen while a hail rings.
 */
public class IncomingCallActivity extends AppCompatActivity {

    private static IncomingCallActivity showing;

    public static void finishIfShowing() {
        IncomingCallActivity activity = showing;
        if (activity != null) activity.finish();
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
            KeyguardManager km = getSystemService(KeyguardManager.class);
            if (km != null) km.requestDismissKeyguard(this, null);
        } else {
            getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                    | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                    | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD);
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        setContentView(R.layout.activity_incoming_call);

        String from = getIntent().getStringExtra("from");
        TextView caller = findViewById(R.id.caller_address);
        caller.setText(shortAddress(from));

        findViewById(R.id.btn_answer).setOnClickListener(v -> {
            HailConnectionService.answerCurrent(this);
            finish();
        });
        findViewById(R.id.btn_decline).setOnClickListener(v -> {
            HailConnectionService.rejectCurrent(this);
            finish();
        });
    }

    @Override
    protected void onResume() {
        super.onResume();
        showing = this;
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (showing == this) showing = null;
    }

    private static String shortAddress(String address) {
        if (address == null) return "Unknown caller";
        if (address.length() > 13) {
            return address.substring(0, 8) + "…" + address.substring(address.length() - 6);
        }
        return address;
    }
}
