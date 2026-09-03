import { pool } from '../db.js';
import { Router } from 'express';

const router = Router();

router.get('/:owner', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM contacts WHERE owner = $1 ORDER BY created_at DESC',
      [req.params.owner.toLowerCase()]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { owner, address, name } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO contacts (owner, address, name)
       VALUES ($1, $2, $3)
       ON CONFLICT (owner, address) DO UPDATE SET name = EXCLUDED.name
       RETURNING *`,
      [owner.toLowerCase(), address.toLowerCase(), name]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM contacts WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
