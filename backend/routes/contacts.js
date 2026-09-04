import { pool } from '../db.js';
import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { normalizeAddress, isStringOfMaxLen, badRequest } from '../validate.js';

const router = Router();

router.use(requireAuth);

router.get('/:owner', async (req, res) => {
  try {
    const owner = normalizeAddress(req.params.owner);
    if (!owner) return badRequest(res, 'Invalid owner address format');
    if (owner !== req.address) return res.status(403).json({ error: 'Forbidden' });
    const { rows } = await pool.query(
      'SELECT * FROM contacts WHERE owner = $1 ORDER BY created_at DESC',
      [owner]
    );
    res.json(rows);
  } catch (err) {
    console.error('Contacts lookup error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { address, name } = req.body || {};
    const contact = normalizeAddress(address);
    if (!contact) return badRequest(res, 'Invalid contact address format');
    if (!isStringOfMaxLen(name, 64)) {
      return badRequest(res, 'Name must be a string of at most 64 characters');
    }
    const { rows } = await pool.query(
      `INSERT INTO contacts (owner, address, name)
       VALUES ($1, $2, $3)
       ON CONFLICT (owner, address) DO UPDATE SET name = EXCLUDED.name
       RETURNING *`,
      [req.address, contact, name]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('Contact save error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    if (!/^\d+$/.test(req.params.id)) return badRequest(res, 'Invalid contact id');
    const { rowCount } = await pool.query(
      'DELETE FROM contacts WHERE id = $1 AND owner = $2',
      [req.params.id, req.address]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('Contact delete error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
