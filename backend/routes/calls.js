import { pool } from '../db.js';
import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { normalizeAddress, isUint256, isStringOfMaxLen, badRequest } from '../validate.js';

const router = Router();

router.get('/:address', requireAuth, async (req, res) => {
  try {
    const address = normalizeAddress(req.params.address);
    if (!address) return badRequest(res, 'Invalid address format');
    if (address !== req.address) return res.status(403).json({ error: 'Forbidden' });
    const { rows } = await pool.query(
      `SELECT * FROM calls
       WHERE caller = $1 OR recipient = $1
       ORDER BY timestamp DESC LIMIT 50`,
      [address]
    );
    res.json(rows);
  } catch (err) {
    console.error('Calls lookup error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const { call_id, recipient, value } = req.body || {};
    if (!isUint256(call_id)) {
      return badRequest(res, 'call_id must be a non-negative integer within uint256 range');
    }
    const to = normalizeAddress(recipient);
    if (!to) return badRequest(res, 'Invalid recipient address format');
    if (!isStringOfMaxLen(value ?? '', 64)) {
      return badRequest(res, 'value must be a string of at most 64 characters');
    }
    // On-chain calls table is a cache; duplicates are not an error.
    await pool.query(
      `INSERT INTO calls (call_id, caller, recipient, value)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (call_id) DO NOTHING`,
      [call_id.toString(), req.address, to, value ?? '0']
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Call record error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
