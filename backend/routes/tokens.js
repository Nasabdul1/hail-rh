import { pool } from '../db.js';
import { Router } from 'express';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM tokens ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/creator/:address', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM tokens WHERE creator = $1 ORDER BY created_at DESC',
      [req.params.address.toLowerCase()]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { address, creator, name, symbol, supply } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO tokens (address, creator, name, symbol, supply)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [address.toLowerCase(), creator.toLowerCase(), name, symbol, supply]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
