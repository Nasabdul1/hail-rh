package online.hailrh.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Bridge between the native incoming-call UI and the web app running in the
 * WebView. Call actions (answer/decline) are emitted as the "callAction" JS
 * event when a listener is attached; otherwise they are stored and handed out
 * once via getPendingCallAction() (cold-start path).
 */
@CapacitorPlugin(name = "HailCall")
public class HailCallPlugin extends Plugin {

    private static HailCallPlugin instance;
    private static volatile boolean webCallUiActive = false;

    private static String pendingAction;
    private static String pendingFrom;
    private static String pendingCallId;

    @Override
    public void load() {
        instance = this;
    }

    @Override
    protected void handleOnDestroy() {
        if (instance == this) instance = null;
    }

    @PluginMethod
    public void getPendingCallAction(PluginCall call) {
        JSObject ret = new JSObject();
        synchronized (HailCallPlugin.class) {
            if (pendingAction != null) {
                ret.put("action", pendingAction);
                ret.put("from", pendingFrom);
                ret.put("callId", pendingCallId);
                pendingAction = null;
                pendingFrom = null;
                pendingCallId = null;
            }
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void setWsConnected(PluginCall call) {
        Boolean connected = call.getBoolean("connected", false);
        webCallUiActive = connected != null && connected;
        call.resolve();
    }

    /** True when the web layer has a live signaling connection and presents the call itself. */
    public static boolean isWebCallUiActive() {
        return webCallUiActive;
    }

    public static void emitCallAction(String action, String from, String callId) {
        HailCallPlugin plugin = instance;
        if (plugin != null && plugin.hasListeners("callAction")) {
            JSObject data = new JSObject();
            data.put("action", action);
            data.put("from", from);
            data.put("callId", callId);
            plugin.notifyListeners("callAction", data);
        } else {
            synchronized (HailCallPlugin.class) {
                pendingAction = action;
                pendingFrom = from;
                pendingCallId = callId;
            }
        }
    }
}
