import { pool } from '../db.js';
import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { normalizeAddress, isStringOfMaxLen, badRequest } from '../validate.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM tokens ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    console.error('Tokens lookup error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/creator/:address', async (req, res) => {
  try {
    const address = normalizeAddress(req.params.address);
    if (!address) return badRequest(res, 'Invalid address format');
    const { rows } = await pool.query(
      'SELECT * FROM tokens WHERE creator = $1 ORDER BY created_at DESC',
      [address]
    );
    res.json(rows);
  } catch (err) {
    console.error('Tokens by creator error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const { address, name, symbol, supply } = req.body || {};
    const tokenAddress = normalizeAddress(address);
    if (!tokenAddress) return badRequest(res, 'Invalid token address format');
    if (!isStringOfMaxLen(name, 64)) {
      return badRequest(res, 'Name must be a string of at most 64 characters');
    }
    if (!isStringOfMaxLen(symbol, 16)) {
      return badRequest(res, 'Symbol must be a string of at most 16 characters');
    }
    if (!isStringOfMaxLen(supply ?? '', 64)) {
      return badRequest(res, 'supply must be a string of at most 64 characters');
    }
    const { rows } = await pool.query(
      `INSERT INTO tokens (address, creator, name, symbol, supply)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (address) DO UPDATE SET
         creator = EXCLUDED.creator,
         name = EXCLUDED.name,
         symbol = EXCLUDED.symbol,
         supply = EXCLUDED.supply
       RETURNING *`,
      [tokenAddress, req.address, name, symbol, supply ?? '0']
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('Token save error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
