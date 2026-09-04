import { pool } from '../db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
const migrationsDir = __dirname;

async function migrate() {
  try {
    // Base schema is idempotent (CREATE IF NOT EXISTS), safe to re-run.
    await pool.query(schema);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMP DEFAULT NOW()
      )
    `);

    const { rows: applied } = await pool.query('SELECT name FROM schema_migrations');
    const appliedSet = new Set(applied.map((r) => r.name));

    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => /^\d+_.*\.sql$/.test(f))
      .sort();

    for (const file of files) {
      if (appliedSet.has(file)) continue;
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      console.log(`Applying migration: ${file}`);
      await pool.query(sql);
      await pool.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
    }

    console.log('✅ Migration completed successfully');
    console.log('Tables: profiles, calls, contacts, tokens, schema_migrations');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  }
}

migrate();
