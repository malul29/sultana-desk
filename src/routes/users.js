const { Router } = require('express');
const auth = require('../auth');
const store = require('../store');

const r = Router();
r.use(auth.requireRole('admin'));
const uid = (req) => { if (!/^\d+$/.test(req.params.id)) throw new auth.HttpError(404, 'Tidak ditemukan.'); return +req.params.id; };

r.get('/', async (_req, res) => res.json(await store.listUsers()));
r.post('/', async (req, res) => res.json({ id: await store.createUser(req.body || {}, req.user) }));
r.patch('/:id', async (req, res) => {
  const b = req.body || {};
  if (uid(req) === req.user.id && (b.active === false || (b.role && b.role !== req.user.role))) throw new auth.HttpError(400, 'Anda tidak dapat menonaktifkan atau mengubah peran akun sendiri.');
  await store.updateUser(uid(req), { name: b.name, role: b.role, active: b.active, password: b.password || undefined }, req.user);
  res.json({ ok: true });
});
r.get('/audit/log', async (_req, res) => res.json(await store.listAudit()));

module.exports = r;
