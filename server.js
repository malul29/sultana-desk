const config = require('./src/config');
const db = require('./src/db');
const auth = require('./src/auth');
const store = require('./src/store');
const { createApp } = require('./src/app');

async function main() {
  const applied = await db.migrate();
  if (applied.length) console.log('Migrasi database:', applied.join(', '));

  if (await store.ensureAdmin(config.admin)) console.log(`Akun admin pertama dibuat: "${config.admin.username}"`);
  else if ((await db.query('SELECT count(*)::int n FROM users')).rows[0].n === 0) {
    console.warn('PERINGATAN: belum ada pengguna. Set ADMIN_USERNAME & ADMIN_PASSWORD di .env, atau jalankan: npm run create-user');
  }

  const seeded = await store.seedDefaultUnits();
  if (seeded) console.log(`Stok unit awal dibuat: ${seeded} unit tersedia.`);

  const app = createApp();
  const server = app.listen(config.port, () => console.log(`Sultana Desk → http://localhost:${config.port}`));

  const sweep = setInterval(() => { auth.purgeExpired().catch(() => {}); store.purgeOrphanUploads().catch(() => {}); }, 60 * 60 * 1000);
  sweep.unref();

  const stop = (sig) => {
    console.log(`${sig}: menutup server…`);
    server.close(async () => { await db.close(); process.exit(0); });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => stop('SIGTERM'));
  process.on('SIGINT', () => stop('SIGINT'));
}

main().catch((e) => { console.error('Gagal memulai:', e.message); process.exit(1); });
