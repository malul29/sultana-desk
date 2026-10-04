const { Router } = require('express');
const auth = require('../auth');
const store = require('../store');

const r = Router();
r.use(auth.requireRole('admin')); // sales and money figures are for admins only

const isoOrNull = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '');

r.get('/', async (req, res) => res.json(await store.salesReport({ from: isoOrNull(req.query.from), to: isoOrNull(req.query.to) })));

// Excel-friendly CSV (UTF-8 with BOM, semicolon-separated for Indonesian regional settings).
r.get('/csv', async (req, res) => {
  const rep = await store.salesReport({ from: isoOrNull(req.query.from), to: isoOrNull(req.query.to) });
  const cell = (v) => { const t = String(v ?? ''); return /[";\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
  const head = ['Tanggal', 'No. Dokumen', 'Pemesan', 'Unit', 'Type', 'Harga (Rp)', 'Cara Bayar', 'Sales', 'Status Unit'];
  const lines = [head, ...rep.rows.map((x) => [x.tanggal, x.no, x.nama, x.unit, x.type, x.harga, x.cara, x.sales, x.status])].map((l) => l.map(cell).join(';'));
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="laporan-penjualan.csv"' });
  res.send('\ufeff' + lines.join('\r\n') + '\r\n');
});

module.exports = r;
