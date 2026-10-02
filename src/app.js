const path = require('path');
const express = require('express');
const config = require('./config');
const db = require('./db');
const auth = require('./auth');

const PUB = path.join(__dirname, '..', 'public');
const ASSETS = path.join(__dirname, '..', 'assets');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'same-origin',
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; frame-ancestors 'none'; form-action 'self'",
    });
    if (config.cookieSecure) res.set('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    const t0 = Date.now();
    res.on('finish', () => { const p = req.originalUrl.split('?')[0]; if (p !== '/healthz') console.log(`${req.method} ${p} ${res.statusCode} ${Date.now() - t0}ms`); });
    next();
  });

  // Liveness + database check, for the load balancer / docker healthcheck.
  app.get('/healthz', async (_req, res) => {
    try { await db.query('SELECT 1'); res.json({ ok: true }); } catch { res.status(503).json({ ok: false }); }
  });

  app.use(express.json({ limit: '1mb' }));
  app.use(auth.loadUser);

  // ── API ──
  app.use('/api', auth.csrfGuard);
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/users', require('./routes/users'));
  app.use('/api/units', require('./routes/units'));
  app.use('/api', require('./routes/documents'));
  app.use('/api', (_req, _res, next) => next(new auth.HttpError(404, 'Endpoint tidak ditemukan.')));

  // ── pages: logo + login are public; the app itself needs a session ──
  app.use('/assets', express.static(ASSETS, { maxAge: '1d' }));
  app.get('/', (req, res) => {
    if (!req.user) return res.redirect('/login.html');
    res.set('Cache-Control', 'no-store');
    res.sendFile(path.join(PUB, 'index.html'));
  });
  app.get('/index.html', (_req, res) => res.redirect('/'));
  app.get('/login.html', (req, res) => (req.user ? res.redirect('/') : res.sendFile(path.join(PUB, 'login.html'))));
  app.use(express.static(PUB, { index: false, maxAge: '1h' }));

  // ── errors ──
  app.use((err, req, res, _next) => {
    const status = err.status || (err.type === 'entity.parse.failed' ? 400 : err.type === 'entity.too.large' ? 413 : 500);
    if (status >= 500) console.error(`[error] ${req.method} ${req.path}:`, err);
    const msg = status >= 500 ? 'Terjadi kesalahan pada server.' : err.type === 'entity.parse.failed' ? 'Format data tidak valid.' : err.message;
    if (req.path.startsWith('/api')) res.status(status).json({ error: msg });
    else res.status(status).type('text').send(msg);
  });

  return app;
}

module.exports = { createApp };
