// Fills the unit stock (36 units, matching the masterplan). Safe to re-run: units that already exist are left untouched.
// A fresh install does this by itself on first start; this script is only for adding back missing units by hand.
// Usage: npm run seed-units        (in Docker: docker compose exec app node scripts/seed-units.js)
const db = require('../src/db');
const { UNITS, unmapped } = require('../lib/unit-plan');

(async () => {
  await db.migrate();
  let added = 0, kept = 0;
  for (const u of UNITS) {
    const r = await db.query('INSERT INTO units (no_unit, type) VALUES ($1, $2) ON CONFLICT (lower(no_unit)) DO NOTHING', [u.no_unit, u.type]);
    if (r.rowCount) added += 1; else kept += 1;
  }
  console.log(`Stok unit: ${added} ditambahkan, ${kept} sudah ada.`);
  if (unmapped().length) console.log(`Nomor 1–41 yang belum masuk type mana pun: ${unmapped().join(', ')}`);
  await db.close();
})().catch((e) => { console.error('Gagal:', e.message); process.exit(1); });
