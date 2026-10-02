const { Router } = require('express');
const auth = require('../auth');
const store = require('../store');

const r = Router();
const strOf = (v) => (typeof v === 'string' ? v : '');

r.post('/login', async (req, res) => {
  const username = strOf(req.body?.username).trim(), password = strOf(req.body?.password);
  if (!username || !password) throw new auth.HttpError(400, 'Username dan password wajib diisi.');
  const wait = auth.loginLocked(req.ip, username);
  if (wait) throw new auth.HttpError(429, `Terlalu banyak percobaan gagal. Coba lagi dalam ${wait} menit.`);
  const user = await store.authenticate(username, password);
  if (!user) {
    auth.loginFailed(req.ip, username);
    await store.audit(require('../db'), null, 'login.fail', 'user', null, { username, ip: req.ip });
    throw new auth.HttpError(401, 'Username atau password salah.');
  }
  auth.loginOk(req.ip, username);
  auth.setCookie(res, await auth.createSession(user.id, req));
  await store.audit(require('../db'), user.id, 'login', 'user', user.id, { ip: req.ip });
  res.json({ user });
});

r.post('/logout', async (req, res) => {
  if (req.sessionToken) await auth.destroySession(req.sessionToken);
  auth.clearCookie(res);
  res.json({ ok: true });
});

r.get('/me', auth.requireAuth, (req, res) => res.json({ user: req.user }));

r.post('/password', auth.requireAuth, async (req, res) => {
  await store.changeOwnPassword(req.user, strOf(req.body?.current), strOf(req.body?.next));
  res.json({ ok: true });
});

module.exports = r;
