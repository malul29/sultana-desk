// Domain logic on top of PostgreSQL: documents, unit stock, users, audit trail.
const db = require('./db');
const numbering = require('./numbering');
const { HttpError, hashPassword, verifyPassword, checkPasswordStrength } = require('./auth');

const str = (v) => (v == null ? '' : String(v).trim());
const int = (v) => (str(v) !== '' && Number.isFinite(+v) ? Math.round(+v) : null);
const isoDate = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(str(v)) ? str(v) : null);

// Person on each document type, and which types reserve a unit.
const WHO = { 'surat-konfirmasi': 'nama', 'surat-pemesanan': 'nama', kwitansi: 'terimaDari', 'tanda-terima': 'kepada' };
const HOLDS_UNIT = new Set(['surat-konfirmasi', 'surat-pemesanan', 'kwitansi']);
const STATUS = ['tersedia', 'dipesan', 'terjual'];
const TS = (col) => `to_char(${col} AT TIME ZONE '${require('./config').timezone}', 'YYYY-MM-DD HH24:MI')`;

async function audit(c, userId, action, entity, entityId, detail) {
  await c.query('INSERT INTO audit_log (user_id, action, entity, entity_id, detail) VALUES ($1,$2,$3,$4,$5)',
    [userId || null, action, entity || null, entityId == null ? null : String(entityId), detail ? JSON.stringify(detail) : null]);
}

// ───────── documents ─────────
// One transaction: lock unit → take number → render → save → reserve unit.
// If rendering fails nothing is saved and no number is used.
async function createDocument(jenis, data, user, render) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new HttpError(400, 'Data dokumen tidak valid.');
  return db.tx(async (c) => {
    let unit = null;
    if (HOLDS_UNIT.has(jenis) && str(data.noUnit)) {
      unit = (await c.query('SELECT * FROM units WHERE lower(no_unit) = lower($1) FOR UPDATE', [str(data.noUnit)])).rows[0] || null;
      if (unit && unit.status === 'terjual') {
        throw new HttpError(409, `Unit ${unit.no_unit} sudah berstatus "terjual"${unit.pemesan ? ' atas nama ' + unit.pemesan : ''}${unit.doc_no ? ' (' + unit.doc_no + ')' : ''}. Ubah statusnya di menu Stok Unit bila ingin memakainya lagi.`);
      }
    }
    const no = await numbering.take(c, data.tanggal);
    const doc = { ...data, no };
    if (unit) doc.noUnit = unit.no_unit; // canonical spelling from stock
    const buffer = await render(doc);
    const ins = await c.query(
      'INSERT INTO documents (no, jenis, nama, no_unit, jumlah, tanggal, data, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
      [no, jenis, str(doc[WHO[jenis]]), str(doc.noUnit), int(doc.jumlah ?? doc.harga), isoDate(doc.tanggal), JSON.stringify(doc), user.id]);
    if (unit) {
      const isSold = jenis === 'kwitansi';
      const newStatus = isSold ? 'terjual' : 'dipesan';
      const pemesanName = str(doc[WHO[jenis]]) || unit.pemesan;
      await c.query("UPDATE units SET status=$1, pemesan=$2, doc_no=$3, updated_by=$4, updated_at=now() WHERE id=$5", [newStatus, pemesanName, no, user.id, unit.id]);
      await audit(c, user.id, isSold ? 'unit.sold' : 'unit.reserve', 'unit', unit.id, { no_unit: unit.no_unit, doc_no: no });
    }
    await audit(c, user.id, 'document.create', 'document', ins.rows[0].id, { no, jenis });
    return { buffer, doc, id: ins.rows[0].id };
  });
}

async function listDocuments({ q = '', jenis = '' } = {}) {
  const like = `%${str(q)}%`;
  const r = await db.query(
    `SELECT d.id, d.no, d.jenis, d.nama, d.no_unit, d.jumlah, d.tanggal, ${TS('d.created_at')} AS created_at, u.name AS created_by
     FROM documents d LEFT JOIN users u ON u.id = d.created_by
     WHERE ($1 = '' OR d.jenis = $1) AND (d.no ILIKE $2 OR d.nama ILIKE $2 OR d.no_unit ILIKE $2)
     ORDER BY d.id DESC LIMIT 500`, [str(jenis), like]);
  return r.rows;
}
const getDocument = async (id) => (await db.query('SELECT id, no, jenis, nama, no_unit, jumlah, tanggal, data, created_by, created_at, pdf IS NOT NULL AS has_pdf FROM documents WHERE id = $1', [id])).rows[0] || null;
const getPdf = async (id) => (await db.query('SELECT pdf FROM documents WHERE id = $1', [id])).rows[0]?.pdf || null;
const savePdf = (id, buf) => db.query('UPDATE documents SET pdf = $1 WHERE id = $2', [buf, id]);

// ───────── units ─────────
const listUnits = async () => (await db.query('SELECT id, no_unit, type, harga, status, pemesan, doc_no FROM units ORDER BY type, no_unit')).rows;

async function addUnits(rows, user) {
  return db.tx(async (c) => {
    let added = 0; const skipped = [];
    for (const r of rows) {
      const no = str(r.no_unit);
      if (!no) continue;
      const res = await c.query(
        `INSERT INTO units (no_unit, type, harga, updated_by) VALUES ($1,$2,$3,$4)
         ON CONFLICT (lower(no_unit)) DO NOTHING RETURNING id`, [no, str(r.type), int(r.harga), user.id]);
      if (res.rowCount) added += 1; else skipped.push(no);
    }
    if (added) await audit(c, user.id, 'unit.add', 'unit', null, { added });
    return { added, skipped };
  });
}

const UNIT_DETAIL_FIELDS = ['no_unit', 'type', 'harga'];

async function updateUnit(id, f, user) {
  return db.tx(async (c) => {
    const u = (await c.query('SELECT * FROM units WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!u) throw new HttpError(404, 'Unit tidak ditemukan.');
    const status = f.status ?? u.status;
    if (!STATUS.includes(status)) throw new HttpError(400, 'Status tidak valid.');
    const editsDetails = UNIT_DETAIL_FIELDS.some((k) => f[k] !== undefined);
    const no = f.no_unit !== undefined ? str(f.no_unit) : u.no_unit;
    if (!no) throw new HttpError(400, 'Nomor unit wajib diisi.');
    const free = status === 'tersedia';
    try {
      await c.query(
        `UPDATE units SET no_unit=$1, type=$2, harga=$3, status=$4, pemesan=$5, doc_no=$6, updated_by=$7, updated_at=now() WHERE id=$8`,
        [no, f.type !== undefined ? str(f.type) : u.type, f.harga !== undefined ? int(f.harga) : u.harga,
          status, free ? '' : (f.pemesan ?? u.pemesan), free ? '' : (f.doc_no ?? u.doc_no), user.id, id]);
    } catch (e) {
      if (e.code === '23505') throw new HttpError(409, `Nomor unit "${no}" sudah dipakai unit lain.`);
      throw e;
    }
    if (status !== u.status) await audit(c, user.id, 'unit.status', 'unit', id, { no_unit: u.no_unit, from: u.status, to: status });
    if (editsDetails) await audit(c, user.id, 'unit.edit', 'unit', id, { no_unit: no, before: { no_unit: u.no_unit, type: u.type, harga: u.harga } });
  });
}
async function deleteUnit(id, user) {
  const r = await db.query('DELETE FROM units WHERE id = $1 RETURNING no_unit', [id]);
  if (r.rowCount) await audit(db, user.id, 'unit.delete', 'unit', id, { no_unit: r.rows[0].no_unit });
}

// ───────── users ─────────
const USERNAME = /^[a-z0-9._-]{3,32}$/i;
const userCols = `id, username, name, role, active, ${TS('created_at')} AS created_at, ${TS('last_login')} AS last_login`;
const listUsers = async () => (await db.query(`SELECT ${userCols} FROM users ORDER BY active DESC, lower(username)`)).rows;

async function createUser({ username, name, password, role }, actor) {
  username = str(username); name = str(name);
  if (!USERNAME.test(username)) throw new HttpError(400, 'Username 3–32 karakter: huruf, angka, titik, garis bawah atau strip.');
  if (!name) throw new HttpError(400, 'Nama wajib diisi.');
  if (!['admin', 'staff'].includes(role)) throw new HttpError(400, 'Peran tidak valid.');
  checkPasswordStrength(password);
  const hash = await hashPassword(password);
  try {
    const r = await db.query('INSERT INTO users (username, name, password_hash, role) VALUES ($1,$2,$3,$4) RETURNING id', [username, name, hash, role]);
    await audit(db, actor?.id, 'user.create', 'user', r.rows[0].id, { username, role });
    return r.rows[0].id;
  } catch (e) {
    if (e.code === '23505') throw new HttpError(409, 'Username sudah dipakai.');
    throw e;
  }
}

async function updateUser(id, patch, actor) {
  return db.tx(async (c) => {
    const u = (await c.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!u) throw new HttpError(404, 'Pengguna tidak ditemukan.');
    const role = patch.role ?? u.role;
    const active = patch.active ?? u.active;
    if (!['admin', 'staff'].includes(role)) throw new HttpError(400, 'Peran tidak valid.');
    if (u.role === 'admin' && u.active && (role !== 'admin' || !active)) {
      const others = (await c.query("SELECT count(*)::int n FROM users WHERE role='admin' AND active AND id <> $1", [id])).rows[0].n;
      if (!others) throw new HttpError(400, 'Harus ada minimal satu admin aktif.');
    }
    const name = patch.name !== undefined ? str(patch.name) : u.name;
    if (!name) throw new HttpError(400, 'Nama wajib diisi.');
    let hash = u.password_hash;
    if (patch.password) { checkPasswordStrength(patch.password); hash = await hashPassword(patch.password); }
    await c.query('UPDATE users SET name=$1, role=$2, active=$3, password_hash=$4 WHERE id=$5', [name, role, !!active, hash, id]);
    if (!active || patch.password) await c.query('DELETE FROM sessions WHERE user_id = $1', [id]); // force re-login
    await audit(c, actor.id, 'user.update', 'user', id, { username: u.username, role, active, password_reset: !!patch.password });
  });
}

async function changeOwnPassword(user, current, next) {
  const row = (await db.query('SELECT password_hash FROM users WHERE id = $1', [user.id])).rows[0];
  if (!row || !(await verifyPassword(String(current ?? ''), row.password_hash))) throw new HttpError(400, 'Password saat ini salah.');
  checkPasswordStrength(next);
  await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [await hashPassword(next), user.id]);
  await audit(db, user.id, 'user.password', 'user', user.id, null);
}

async function authenticate(username, password) {
  const u = (await db.query('SELECT * FROM users WHERE lower(username) = lower($1)', [str(username)])).rows[0];
  // Verify against a dummy hash for unknown users so timing does not reveal which usernames exist.
  const ok = await verifyPassword(String(password ?? ''), u ? u.password_hash : DUMMY);
  if (!u || !u.active || !ok) return null;
  await db.query('UPDATE users SET last_login = now() WHERE id = $1', [u.id]);
  return { id: u.id, username: u.username, name: u.name, role: u.role };
}
let DUMMY = 'scrypt$00000000000000000000000000000000$' + '00'.repeat(64);

async function ensureAdmin(cfg) {
  const n = (await db.query('SELECT count(*)::int n FROM users')).rows[0].n;
  if (n || !cfg.username || !cfg.password) return false;
  await createUser({ username: cfg.username, name: cfg.name, password: cfg.password, role: 'admin' }, null);
  return true;
}

const listAudit = async (limit = 200) => (await db.query(
  `SELECT a.id, ${TS('a.at')} AS at, u.name AS user, a.action, a.entity, a.entity_id, a.detail FROM audit_log a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT $1`, [limit])).rows;

module.exports = {
  audit, createDocument, listDocuments, getDocument, getPdf, savePdf, listUnits, addUnits, updateUnit, deleteUnit,
  listUsers, createUser, updateUser, changeOwnPassword, authenticate, ensureAdmin, listAudit, str,
};
