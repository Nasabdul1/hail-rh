import webpush from 'web-push';
import { pool } from './db.js';

// Push notifications are optional: without VAPID keys in the environment
// every operation below is a no-op and the rest of the server is unaffected.
let enabled = false;

export function init() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'https://hailrh.online';

  if (!publicKey || !privateKey) {
    console.warn('⚠️  push notifications disabled: VAPID keys not set');
    return;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  enabled = true;
  console.log('🔔 Push notifications enabled');
}

// Send a push payload to every registered device of an address.
// Per-subscription errors are logged and never thrown; 404/410 responses
// mean the subscription is dead and are removed from the DB.
export async function sendToAddress(address, payload) {
  if (!enabled) return;

  let rows;
  try {
    const result = await pool.query(
      'SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE address = $1',
      [address.toLowerCase()]
    );
    rows = result.rows;
  } catch (err) {
    console.error('Push lookup error:', err.message);
    return;
  }

  await Promise.all(rows.map(async (row) => {
    const sub = {
      endpoint: row.endpoint,
      keys: { p256dh: row.p256dh, auth: row.auth }
    };
    try {
      await webpush.sendNotification(sub, JSON.stringify(payload), {
        TTL: 30,
        urgency: 'high'
      });
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        console.log(`Removing dead push subscription: ${row.endpoint}`);
        try {
          await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [row.endpoint]);
        } catch (dbErr) {
          console.error('Failed to delete dead subscription:', dbErr.message);
        }
      } else {
        console.error(`Push send error for ${row.endpoint}:`, err.message);
      }
    }
  }));
}
