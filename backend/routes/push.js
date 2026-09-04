import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../auth.js';
import { badRequest, isStringOfMaxLen } from '../validate.js';

const router = Router();

// Endpoint URLs are long but bounded; keys are base64url, typically < 200 chars.
const ENDPOINT_MAX = 2048;
const KEY_MAX = 512;

function isValidSubscription(sub) {
  return (
    sub &&
    typeof sub === 'object' &&
    isStringOfMaxLen(sub.endpoint, ENDPOINT_MAX) &&
    sub.endpoint.startsWith('https://') &&
    sub.keys &&
    typeof sub.keys === 'object' &&
    isStringOfMaxLen(sub.keys.p256dh, KEY_MAX) &&
    isStringOfMaxLen(sub.keys.auth, KEY_MAX)
  );
}

router.post('/subscribe', requireAuth, async (req, res) => {
  try {
    const { subscription } = req.body || {};
    if (!isValidSubscription(subscription)) {
      return badRequest(res, 'Invalid subscription: expected { endpoint, keys: { p256dh, auth } }');
    }
    const { endpoint, keys } = subscription;
    await pool.query(
      `INSERT INTO push_subscriptions (address, endpoint, p256dh, auth)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (endpoint) DO UPDATE
         SET address = EXCLUDED.address, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
      [req.address, endpoint, keys.p256dh, keys.auth]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Push subscribe error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/subscribe', requireAuth, async (req, res) => {
  try {
    const { endpoint } = req.body || {};
    if (!isStringOfMaxLen(endpoint, ENDPOINT_MAX)) {
      return badRequest(res, 'Invalid endpoint');
    }
    await pool.query(
      'DELETE FROM push_subscriptions WHERE endpoint = $1 AND address = $2',
      [endpoint, req.address]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Push unsubscribe error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/public-key', (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || null });
});

export default router;
