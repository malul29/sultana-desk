const config = require('./config');

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

// Today as YYYY-MM-DD in the company timezone (the server clock is usually UTC).
const todayISO = () => new Intl.DateTimeFormat('sv-SE', { timeZone: config.timezone }).format(new Date());
const validISO = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : todayISO());

function format(n, iso) {
  const [y, m] = validISO(iso).split('-');
  return `${String(n).padStart(3, '0')}/SL-BSS/${ROMAN[+m - 1]}/${y}`;
}

// Preview only — nothing is reserved.
async function peek(db, iso) {
  const r = await db.query("SELECT last FROM counters WHERE name = 'doc'");
  return format((r.rows[0]?.last || 0) + 1, iso);
}

// Atomic: run inside the transaction that inserts the document, so a failed
// document never burns a number and two people can never get the same one.
async function take(client, iso) {
  const r = await client.query(
    "INSERT INTO counters (name, last) VALUES ('doc', 1) ON CONFLICT (name) DO UPDATE SET last = counters.last + 1 RETURNING last");
  return format(r.rows[0].last, iso);
}

module.exports = { peek, take, todayISO, validISO };
