import { pool } from '../db.js';
import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { normalizeAddress, isOptionalStringOfMaxLen, badRequest } from '../validate.js';

const router = Router();

router.get('/:address', async (req, res) => {
  try {
    const address = normalizeAddress(req.params.address);
    if (!address) return badRequest(res, 'Invalid address format');
    const { rows } = await pool.query(
      'SELECT * FROM profiles WHERE address = $1',
      [address]
    );
    res.json(rows[0] || null);
  } catch (err) {
    console.error('Profile lookup error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const { address, username, bio, avatar_url } = req.body || {};
    const normalized = normalizeAddress(address);
    if (!normalized) return badRequest(res, 'Invalid address format');
    if (normalized !== req.address) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (!isOptionalStringOfMaxLen(username, 32)) {
      return badRequest(res, 'Username must be a string of at most 32 characters');
    }
    if (!isOptionalStringOfMaxLen(bio, 256)) {
      return badRequest(res, 'Bio must be a string of at most 256 characters');
    }
    if (!isOptionalStringOfMaxLen(avatar_url, 256)) {
      return badRequest(res, 'Avatar URL must be a string of at most 256 characters');
    }
    const { rows } = await pool.query(
      `INSERT INTO profiles (address, username, bio, avatar_url)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (address) DO UPDATE SET
         username = EXCLUDED.username,
         bio = EXCLUDED.bio,
         avatar_url = EXCLUDED.avatar_url
       RETURNING *`,
      [normalized, username, bio, avatar_url]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('Profile save error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
