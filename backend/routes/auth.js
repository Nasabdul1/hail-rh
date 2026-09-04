import crypto from 'crypto';
import { Router } from 'express';
import { verifyMessage } from 'viem';
import { mintToken } from '../auth.js';

const router = Router();

const NONCE_TTL_MS = 5 * 60 * 1000;

// In-memory nonce store: nonce -> expiry timestamp. Nonces are single-use
// (deleted on successful login) and expire after 5 minutes.
const nonces = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [nonce, expiry] of nonces) {
    if (expiry <= now) nonces.delete(nonce);
  }
}, 60 * 1000).unref();

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

router.get('/nonce', (req, res) => {
  const nonce = crypto.randomBytes(32).toString('hex');
  nonces.set(nonce, Date.now() + NONCE_TTL_MS);
  res.json({ nonce });
});

router.post('/login', async (req, res) => {
  try {
    const { address, signature, nonce } = req.body || {};
    if (!address || !signature || !nonce) {
      return res.status(400).json({ error: 'Missing address, signature or nonce' });
    }
    if (!ADDRESS_RE.test(address)) {
      return res.status(400).json({ error: 'Invalid address format' });
    }
    const storedExpiry = nonces.get(nonce);
    if (!storedExpiry) {
      return res.status(400).json({ error: 'Invalid or used nonce' });
    }
    if (storedExpiry <= Date.now()) {
      nonces.delete(nonce);
      return res.status(400).json({ error: 'Nonce expired' });
    }

    const recovered = await verifyMessage({
      address: address,
      message: `Hail login: ${nonce}`,
      signature,
    });
    if (!recovered) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    nonces.delete(nonce);
    const addr = address.toLowerCase();
    res.json({ token: mintToken(addr), address: addr });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
