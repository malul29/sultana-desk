// One-time import of the old single-file SQLite data (data/sultana.db + data/counter.json) into PostgreSQL.
// Usage: npm run migrate-sqlite            (needs DATABASE_URL; safe to re-run, it skips what exists)
const fs = require('fs');
const path = require('path');
const db = require('../src/db');

(async () => {
  const dbFile = path.join(__dirname, '..', 'data', 'sultana.db');
  if (!fs.existsSync(dbFile)) { console.log('Tidak ada data/sultana.db, tidak ada yang diimpor.'); return; }
  const { DatabaseSync } = require('node:sqlite');
  const lite = new DatabaseSync(dbFile, { readOnly: true });
  await db.migrate();

  const docs = lite.prepare('SELECT * FROM documents ORDER BY id').all();
  const units = lite.prepare('SELECT * FROM units ORDER BY id').all();
  let last = 0;
  try { last = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'counter.json'), 'utf8')).last || 0; } catch {}

  await db.tx(async (c) => {
    let nu = 0, nd = 0;
    for (const u of units) {
      const r = await c.query(`INSERT INTO units (no_unit, type, harga, status, pemesan, doc_no)
        VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (lower(no_unit)) DO NOTHING`,
        [u.no_unit, u.type, u.harga, u.status, u.pemesan, u.doc_no]);
      nu += r.rowCount;
    }
    for (const d of docs) {
      const r = await c.query(`INSERT INTO documents (no, jenis, nama, no_unit, jumlah, tanggal, data, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (no) DO NOTHING`,
        [d.no, d.jenis, d.nama, d.no_unit, d.jumlah, /^\d{4}-\d{2}-\d{2}$/.test(d.tanggal || '') ? d.tanggal : null, d.data, d.created_at.replace(' ', 'T')]);
      nd += r.rowCount;
    }
    await c.query("INSERT INTO counters (name, last) VALUES ('doc', $1) ON CONFLICT (name) DO UPDATE SET last = GREATEST(counters.last, EXCLUDED.last)", [last]);
    console.log(`Diimpor: ${nd} dokumen, ${nu} unit. Nomor terakhir: ${last}.`);
  });
  await db.close();
})().catch((e) => { console.error('Gagal:', e.message); process.exit(1); });
