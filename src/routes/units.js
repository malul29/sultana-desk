const { Router } = require('express');
const auth = require('../auth');
const store = require('../store');

const r = Router();
r.use(auth.requireAuth);
const id = (req) => { if (!/^\d+$/.test(req.params.id)) throw new auth.HttpError(404, 'Tidak ditemukan.'); return +req.params.id; };

r.get('/', async (_req, res) => res.json(await store.listUnits()));

// Stock changes are admin-only; staff still get unit data through the booking forms.
r.post('/', auth.requireRole('admin'), async (req, res) => {
  const list = Array.isArray(req.body?.units) ? req.body.units : [req.body];
  if (list.length > 500) throw new auth.HttpError(400, 'Maksimal 500 unit sekali simpan.');
  res.json(await store.addUnits(list, req.user));
});
r.post('/:id', auth.requireRole('admin'), async (req, res) => { await store.updateUnit(id(req), req.body || {}, req.user); res.json({ ok: true }); });
r.delete('/:id', auth.requireRole('admin'), async (req, res) => { await store.deleteUnit(id(req), req.user); res.json({ ok: true }); });

module.exports = r;
