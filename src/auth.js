const crypto = require('crypto');
const { promisify } = require('util');
const config = require('./config');
const db = require('./db');

const scrypt = promisify(crypto.scrypt);
const COOKIE = 'sid';

class HttpError extends Error {
  constructor(status, message, details) { super(message); this.status = status; this.details = details; }
}

// ── passwords: scrypt, format  scrypt$<saltHex>$<hashHex> ──
async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(pw, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}
async function verifyPassword(pw, stored) {
  const [alg, saltHex, hashHex] = String(stored || '').split('$');
  if (alg !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scrypt(pw, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}
function checkPasswordStrength(pw) {
  if (typeof pw !== 'string' || pw.length < 8) throw new HttpError(400, 'Password minimal 8 karakter.');
  if (pw.length > 200) throw new HttpError(400, 'Password terlalu panjang.');
}

// ── sessions: random token in an httpOnly cookie, only its hash is stored ──
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');

async function createSession(userId, req) {
  const token = crypto.randomBytes(32).toString('base64url');
  await db.query(
    "INSERT INTO sessions (token_hash, user_id, expires_at, ip, user_agent) VALUES ($1, $2, now() + ($3 || ' days')::interval, $4, $5)",
    [sha(token), userId, String(config.sessionDays), req.ip, String(req.get('user-agent') || '').slice(0, 300)]);
  return token;
}
const destroySession = (token) => db.query('DELETE FROM sessions WHERE token_hash = $1', [sha(token)]);
const purgeExpired = () => db.query('DELETE FROM sessions WHERE expires_at < now()');

function setCookie(res, token) {
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, maxAge: config.sessionDays * 864e5, path: '/' });
}
const clearCookie = (res) => res.clearCookie(COOKIE, { httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, path: '/' });

function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return '';
}

// Loads req.user (or null) from the session cookie.
async function loadUser(req, _res, next) {
  req.user = null;
  const token = readCookie(req, COOKIE);
  if (token) {
    const r = await db.query(
      `SELECT u.id, u.username, u.name, u.role FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > now() AND u.active`, [sha(token)]);
    if (r.rows[0]) { req.user = r.rows[0]; req.sessionToken = token; }
  }
  next();
}

const requireAuth = (req, _res, next) => (req.user ? next() : next(new HttpError(401, 'Silakan login terlebih dahulu.')));
const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user) return next(new HttpError(401, 'Silakan login terlebih dahulu.'));
  return roles.includes(req.user.role) ? next() : next(new HttpError(403, 'Anda tidak memiliki akses untuk tindakan ini.'));
};

// Browsers cannot add custom headers cross-site without a CORS preflight (which we never allow),
// so requiring one on every write blocks CSRF on top of SameSite cookies.
function csrfGuard(req, _res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  return req.get('x-requested-with') ? next() : next(new HttpError(403, 'Permintaan ditolak (header keamanan tidak ada).'));
}

// ── brute-force protection: 5 failures per (ip, username) → 15 minute lock ──
const fails = new Map();
const LIMIT = 5, WINDOW = 15 * 60 * 1000;
const key = (ip, u) => `${ip}|${String(u).toLowerCase()}`;
function loginLocked(ip, u) {
  const e = fails.get(key(ip, u));
  if (!e) return 0;
  if (Date.now() - e.first > WINDOW) { fails.delete(key(ip, u)); return 0; }
  return e.n >= LIMIT ? Math.ceil((WINDOW - (Date.now() - e.first)) / 60000) : 0;
}
function loginFailed(ip, u) {
  const k = key(ip, u), e = fails.get(k);
  if (!e || Date.now() - e.first > WINDOW) fails.set(k, { n: 1, first: Date.now() });
  else e.n += 1;
}
const loginOk = (ip, u) => fails.delete(key(ip, u));

module.exports = {
  HttpError, hashPassword, verifyPassword, checkPasswordStrength,
  createSession, destroySession, purgeExpired, setCookie, clearCookie, readCookie, COOKIE,
  loadUser, requireAuth, requireRole, csrfGuard, loginLocked, loginFailed, loginOk,
};
