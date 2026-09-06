package online.hailrh.app;

import android.content.Context;
import android.telecom.Connection;
import android.telecom.DisconnectCause;

/** A single self-managed incoming call. */
public class HailConnection extends Connection {

    private final Context context;
    private final String from;
    private final String callId;

    public HailConnection(Context context, String from, String callId) {
        this.context = context.getApplicationContext();
        this.from = from;
        this.callId = callId;
        setConnectionProperties(PROPERTY_SELF_MANAGED);
        if (from != null) {
            setCallerDisplayName(from, PRESENTATION_ALLOWED);
        }
    }

    public String getFrom() {
        return from;
    }

    public String getCallId() {
        return callId;
    }

    @Override
    public void onAnswer() {
        HailConnectionService.answerCurrent(context);
    }

    @Override
    public void onReject() {
        HailConnectionService.rejectCurrent(context);
    }

    @Override
    public void onDisconnect() {
        end(new DisconnectCause(DisconnectCause.LOCAL));
    }

    public void end(DisconnectCause cause) {
        setDisconnected(cause);
        destroy();
    }
}
