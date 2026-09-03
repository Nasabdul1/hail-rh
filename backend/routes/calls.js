import { pool } from '../db.js';
import { Router } from 'express';

const router = Router();

router.get('/:address', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM calls 
       WHERE caller = $1 OR recipient = $1 
       ORDER BY timestamp DESC LIMIT 50`,
      [req.params.address.toLowerCase()]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { call_id, caller, recipient, value } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO calls (call_id, caller, recipient, value)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [call_id, caller.toLowerCase(), recipient.toLowerCase(), value]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
