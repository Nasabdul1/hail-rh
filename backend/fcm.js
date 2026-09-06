import fs from 'fs';
import { pool } from './db.js';

// Firebase Cloud Messaging is optional: without FIREBASE_SERVICE_ACCOUNT in the
// environment every operation below is a no-op and the rest of the server is
// unaffected. The variable may hold the service-account JSON itself or a path
// to the JSON file.
let messaging = null;

export async function initFcm() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw || !raw.trim()) {
    console.warn('⚠️  FCM disabled: FIREBASE_SERVICE_ACCOUNT not set');
    return;
  }

  try {
    const { default: admin } = await import('firebase-admin');
    const trimmed = raw.trim();
    const credentials = trimmed.startsWith('{')
      ? JSON.parse(trimmed)
      : JSON.parse(fs.readFileSync(trimmed, 'utf8'));
    admin.initializeApp({ credential: admin.credential.cert(credentials) });
    messaging = admin.messaging();
    console.log('🔔 FCM (native push) enabled');
  } catch (err) {
    console.warn('⚠️  FCM disabled:', err.message);
    messaging = null;
  }
}

// Send a high-priority data message to every registered native device of an
// address. Data (not notification) messages so the app's own service decides
// how to surface the call, even when the app is killed. Per-token errors are
// logged and never thrown; unregistered tokens are removed from the DB.
export async function sendCallToAddress(address, { from, callId }) {
  if (!messaging) return;

  let rows;
  try {
    const result = await pool.query(
      'SELECT token FROM fcm_tokens WHERE address = $1',
      [address.toLowerCase()]
    );
    rows = result.rows;
  } catch (err) {
    console.error('FCM lookup error:', err.message);
    return;
  }
  if (rows.length === 0) return;

  const tokens = rows.map((r) => r.token);
  try {
    const res = await messaging.sendEachForMulticast({
      tokens,
      data: { type: 'incoming_call', from, callId: String(callId) },
      android: { priority: 'HIGH', ttl: 30000 }
    });
    const dead = [];
    res.responses.forEach((r, i) => {
      if (!r.success) {
        const code = r.error?.code || '';
        if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
          dead.push(tokens[i]);
        } else {
          console.error(`FCM send error for token ${i}:`, r.error?.message);
        }
      }
    });
    for (const token of dead) {
      try {
        await pool.query('DELETE FROM fcm_tokens WHERE token = $1', [token]);
      } catch (dbErr) {
        console.error('Failed to delete dead FCM token:', dbErr.message);
      }
    }
  } catch (err) {
    console.error('FCM send failed:', err.message);
  }
}

// Tell native devices an incoming call is over (caller hung up / timeout) so
// the native ringing UI can be dismissed.
export async function sendCallEndToAddress(address, { callId }) {
  if (!messaging) return;
  try {
    const result = await pool.query('SELECT token FROM fcm_tokens WHERE address = $1', [address.toLowerCase()]);
    const tokens = result.rows.map((r) => r.token);
    if (tokens.length === 0) return;
    await messaging.sendEachForMulticast({
      tokens,
      data: { type: 'end_call', callId: String(callId) },
      android: { priority: 'HIGH', ttl: 15000 }
    });
  } catch (err) {
    console.error('FCM end_call send failed:', err.message);
  }
}
