// Fills the unit stock (36 units, matching the masterplan). Safe to re-run: units that already exist are left untouched.
// Usage: npm run seed-units        (in Docker: docker compose exec app node scripts/seed-units.js)
const db = require('../src/db');

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const PLAN = {
  Deluxe: { prefix: 'D', nums: [1, 2, 3, 5, 6, 7, 8] },
  Executive: { prefix: 'E', nums: [11, 12, 15, 16, 17, 18, 19, 20, ...range(26, 39), 41] }, // no lot 40 on the masterplan
  Premiere: { prefix: 'P', nums: [21, 9, 10, 23, 24, 25] },
};
const pad = (n) => String(n).padStart(2, '0');

(async () => {
  await db.migrate();
  let added = 0, kept = 0;
  for (const [type, { prefix, nums }] of Object.entries(PLAN)) {
    for (const n of [...nums].sort((a, b) => a - b)) {
      const r = await db.query('INSERT INTO units (no_unit, type) VALUES ($1, $2) ON CONFLICT (lower(no_unit)) DO NOTHING', [`${prefix}-${pad(n)}`, type]);
      if (r.rowCount) added += 1; else kept += 1;
    }
  }
  const used = new Set(Object.values(PLAN).flatMap((p) => p.nums));
  const missing = range(1, 41).filter((n) => !used.has(n));
  console.log(`Stok unit: ${added} ditambahkan, ${kept} sudah ada.`);
  if (missing.length) console.log(`Nomor 1–41 yang belum masuk type mana pun: ${missing.join(', ')}`);
  await db.close();
})().catch((e) => { console.error('Gagal:', e.message); process.exit(1); });
