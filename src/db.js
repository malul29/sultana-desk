const fs = require('fs');
const path = require('path');
const { Pool, types } = require('pg');
const config = require('./config');

types.setTypeParser(20, (v) => Number(v));   // BIGINT -> number (rupiah amounts fit easily)
types.setTypeParser(1082, (v) => v);         // DATE   -> 'YYYY-MM-DD' string, no timezone shifting

let pool;
function getPool() {
  if (!pool) {
    if (!config.databaseUrl) throw new Error('DATABASE_URL belum diatur (lihat .env.example).');
    pool = new Pool({ connectionString: config.databaseUrl, max: 10, ssl: config.pgSsl ? { rejectUnauthorized: false } : undefined });
    pool.on('error', (e) => console.error('[pg] idle client error:', e.message));
  }
  return pool;
}

const query = (text, params) => getPool().query(text, params);

async function tx(fn) {
  const c = await getPool().connect();
  try {
    await c.query('BEGIN');
    const out = await fn(c);
    await c.query('COMMIT');
    return out;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

// Applies src/migrations/*.sql in order, once each. Safe to run from several processes.
async function migrate() {
  const c = await getPool().connect();
  try {
    await c.query('SELECT pg_advisory_lock(727274)');
    await c.query('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
    const done = new Set((await c.query('SELECT version FROM schema_migrations')).rows.map((r) => r.version));
    const dir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
    const applied = [];
    for (const f of files) {
      if (done.has(f)) continue;
      await c.query('BEGIN');
      try {
        await c.query(fs.readFileSync(path.join(dir, f), 'utf8'));
        await c.query('INSERT INTO schema_migrations (version) VALUES ($1)', [f]);
        await c.query('COMMIT');
        applied.push(f);
      } catch (e) { await c.query('ROLLBACK'); throw new Error(`Migrasi ${f} gagal: ${e.message}`); }
    }
    return applied;
  } finally {
    await c.query('SELECT pg_advisory_unlock(727274)').catch(() => {});
    c.release();
  }
}

const close = async () => { if (pool) { await pool.end(); pool = null; } };

module.exports = { query, tx, migrate, close, getPool };
