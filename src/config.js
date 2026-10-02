// All runtime configuration comes from environment variables (see .env.example).
try { process.loadEnvFile(require('path').join(__dirname, '..', '.env')); } catch { /* no .env file: rely on real env */ }

const env = process.env;
const prod = env.NODE_ENV === 'production';
const bool = (v, d) => (v == null || v === '' ? d : /^(1|true|yes|on)$/i.test(v));

module.exports = {
  prod,
  port: Number(env.PORT) || 3000,
  databaseUrl: env.DATABASE_URL || '',
  pgSsl: bool(env.PGSSL, false),
  // Cookies are only sent over HTTPS in production (Caddy terminates TLS).
  cookieSecure: bool(env.COOKIE_SECURE, prod),
  // Number of reverse-proxy hops to trust for client IP (Caddy = 1).
  trustProxy: env.TRUST_PROXY != null ? Number(env.TRUST_PROXY) : (prod ? 1 : 0),
  sessionDays: Number(env.SESSION_DAYS) || 7,
  timezone: env.APP_TIMEZONE || 'Asia/Jakarta',
  admin: { username: env.ADMIN_USERNAME || '', password: env.ADMIN_PASSWORD || '', name: env.ADMIN_NAME || 'Administrator' },
};
