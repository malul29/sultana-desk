// Local development: starts a throw-away-ish real PostgreSQL (data kept in data/pg-dev) and the app.
// Production does NOT use this — it uses the postgres container from docker-compose.yml.
const path = require('path');
const fs = require('fs');

(async () => {
  let EmbeddedPostgres;
  try { EmbeddedPostgres = (await import('embedded-postgres')).default; }
  catch { console.error('Jalankan "npm install" dulu (paket embedded-postgres belum terpasang).'); process.exit(1); }

  const dir = path.join(__dirname, '..', 'data', 'pg-dev');
  const fresh = !fs.existsSync(path.join(dir, 'PG_VERSION'));
  const PORT = Number(process.env.DEV_PG_PORT) || 54320;
  const pg = new EmbeddedPostgres({ databaseDir: dir, user: 'sultana', password: 'sultana', port: PORT, persistent: true, onLog: () => {}, onError: () => {} });
  if (fresh) await pg.initialise();
  await pg.start();
  if (fresh) await pg.createDatabase('sultana');

  process.env.DATABASE_URL = process.env.DATABASE_URL || `postgres://sultana:sultana@localhost:${PORT}/sultana`;
  process.env.ADMIN_USERNAME ||= 'admin';
  process.env.ADMIN_PASSWORD ||= 'admin12345';
  console.log(`PostgreSQL dev aktif di port ${PORT}. Login awal: admin / admin12345 (hanya untuk lokal)`);

  const stop = async () => { await pg.stop().catch(() => {}); process.exit(0); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  require('../server');
})().catch((e) => { console.error(e); process.exit(1); });
