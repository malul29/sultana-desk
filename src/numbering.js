const config = require('./config');

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

// Today as YYYY-MM-DD in the company timezone (the server clock is usually UTC).
const todayISO = () => new Intl.DateTimeFormat('sv-SE', { timeZone: config.timezone }).format(new Date());
const validISO = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : todayISO());

// The sequence restarts at 001 every month: one counter per document month ("doc-2026-10").
// A month that already has documents numbered before this rule (one global counter) is continued
// from its highest number, so a number is never issued twice.
const parts = (iso) => { const [y, m] = validISO(iso).split('-'); return { y, m: +m }; };
const format = (n, iso) => { const { y, m } = parts(iso); return `${String(n).padStart(3, '0')}/SL-BSS/${ROMAN[m - 1]}/${y}`; };
const keyOf = (iso) => { const { y, m } = parts(iso); return `doc-${y}-${String(m).padStart(2, '0')}`; };
// Highest sequence already printed on a document of that month (0 if none).
const seeded = async (db, iso) => {
  const { y, m } = parts(iso);
  const r = await db.query("SELECT COALESCE(max(split_part(no, '/', 1)::int), 0) AS n FROM documents WHERE no LIKE $1 AND split_part(no, '/', 1) ~ '^[0-9]+$'", [`%/SL-BSS/${ROMAN[m - 1]}/${y}`]);
  return r.rows[0].n;
};

// Preview only — nothing is reserved.
async function peek(db, iso) {
  const r = await db.query('SELECT last FROM counters WHERE name = $1', [keyOf(iso)]);
  const last = r.rows[0] ? r.rows[0].last : await seeded(db, iso);
  return format(Number(last) + 1, iso);
}

// Atomic: run inside the transaction that inserts the document, so a failed
// document never burns a number and two people can never get the same one.
async function take(client, iso) {
  const seed = await seeded(client, iso);
  const r = await client.query(
    'INSERT INTO counters (name, last) VALUES ($1, $2 + 1) ON CONFLICT (name) DO UPDATE SET last = counters.last + 1 RETURNING last',
    [keyOf(iso), seed]);
  return format(Number(r.rows[0].last), iso);
}

module.exports = { peek, take, todayISO, validISO };
