import { pool } from '../db.js';
import { Router } from 'express';

const router = Router();

router.get('/:address', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM profiles WHERE address = $1',
      [req.params.address.toLowerCase()]
    );
    res.json(rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { address, username, bio, avatar_url } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO profiles (address, username, bio, avatar_url)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (address) DO UPDATE SET
         username = EXCLUDED.username,
         bio = EXCLUDED.bio,
         avatar_url = EXCLUDED.avatar_url
       RETURNING *`,
      [address.toLowerCase(), username, bio, avatar_url]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
