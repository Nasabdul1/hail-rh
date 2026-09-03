import { pool } from '../db.js';
import fs from 'fs';
import path from 'path';

const schema = fs.readFileSync(path.join(process.cwd(), 'migrations/schema.sql'), 'utf8');

async function migrate() {
  try {
    await pool.query(schema);
    console.log('✅ Migration completed successfully');
    console.log('Tables: profiles, calls, contacts, tokens');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  }
}

migrate();
