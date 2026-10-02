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
const validation = require('../lib/validation');
const isObj = (d) => d && typeof d === 'object' && !Array.isArray(d);

function assertComplete(jenis, d) {
  const miss = validation.missing(jenis, d);
  if (miss.length) throw new HttpError(422, 'Lengkapi dulu: ' + miss.join(', ') + '.', { missing: miss });
}

// A unit document may only claim a free unit; receipts (Kwitansi) can always be issued for a unit,
// because further payments on an already sold unit are normal.
const unitBusyMessage = (u) => `Unit ${u.no_unit} sudah berstatus "${u.status}"${u.pemesan ? ' atas nama ' + u.pemesan : ''}${u.doc_no ? ' (' + u.doc_no + ')' : ''}. Ubah statusnya di menu Stok Unit bila ingin memakainya lagi.`;
const lockUnit = async (c, no) => (str(no) ? (await c.query('SELECT * FROM units WHERE lower(no_unit) = lower($1) FOR UPDATE', [str(no)])).rows[0] || null : null);
// SKU/SPU reserve a unit ("dipesan"); a Kwitansi marks it "terjual".
const statusFor = (jenis) => (jenis === 'kwitansi' ? 'terjual' : 'dipesan');

// Checks the uploads named in doc.files belong to this document (or are fresh ones from this user).
async function claimFiles(c, jenis, doc, user, attached = {}) {
  const files = {};
  for (const kind of validation.filesFor(jenis, doc)) {
    const id = str(doc.files && doc.files[kind]);
    if (!id) continue;
    const r = (await c.query('SELECT user_id, document_id FROM uploads WHERE id::text = $1 AND kind = $2 FOR UPDATE', [id, kind])).rows[0];
    const mine = attached[kind] === id;
    if (!r || (!mine && (r.document_id != null || (r.user_id !== user.id && user.role !== 'admin')))) {
      throw new HttpError(422, `Berkas ${validation.FILE_KINDS[kind]} tidak valid atau sudah dipakai. Unggah ulang.`, { missing: [`Unggah ${validation.FILE_KINDS[kind]}`] });
    }
    files[kind] = id;
  }
  return files;
}
const attachFiles = async (c, docId, files) => {
  const ids = Object.values(files);
  await c.query('DELETE FROM uploads WHERE document_id = $1 AND NOT (id::text = ANY($2))', [docId, ids]); // replaced / dropped
  if (ids.length) await c.query('UPDATE uploads SET document_id = $1 WHERE id::text = ANY($2)', [docId, ids]);
};

// One transaction: validate → lock unit → take number → render → save → reserve unit.
// If anything fails nothing is saved and no number is used.
async function createDocument(jenis, data, user, render) {
  if (!isObj(data)) throw new HttpError(400, 'Data dokumen tidak valid.');
  assertComplete(jenis, data);
  return db.tx(async (c) => {
    const unit = HOLDS_UNIT.has(jenis) ? await lockUnit(c, data.noUnit) : null;
    if (unit && jenis !== 'kwitansi' && unit.status === 'terjual') throw new HttpError(409, unitBusyMessage(unit));
    const no = await numbering.take(c, data.tanggal);
    const doc = { ...data, no };
    if (unit) doc.noUnit = unit.no_unit; // canonical spelling from stock
    doc.files = await claimFiles(c, jenis, doc, user);
    const buffer = await render(doc);
    const ins = await c.query(
      'INSERT INTO documents (no, jenis, nama, no_unit, jumlah, tanggal, data, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
      [no, jenis, str(doc[WHO[jenis]]), str(doc.noUnit), int(doc.jumlah ?? doc.harga), isoDate(doc.tanggal), JSON.stringify(doc), user.id]);
    const id = ins.rows[0].id;
    await attachFiles(c, id, doc.files);
    if (unit) {
      const next = jenis === 'kwitansi' && unit.status === 'terjual' ? unit.status : statusFor(jenis); // never step a sold unit back
      const keepOwner = jenis === 'kwitansi' && unit.status === 'terjual';
      await c.query('UPDATE units SET status=$1, pemesan=$2, doc_no=$3, updated_by=$4, updated_at=now() WHERE id=$5',
        [next, keepOwner ? unit.pemesan : (str(doc[WHO[jenis]]) || unit.pemesan), keepOwner ? unit.doc_no : no, user.id, unit.id]);
      await audit(c, user.id, next === 'terjual' ? 'unit.sold' : 'unit.reserve', 'unit', unit.id, { no_unit: unit.no_unit, doc_no: no });
    }
    await audit(c, user.id, 'document.create', 'document', id, { no, jenis });
    return { buffer, doc, id };
  });
}

// Correct a printed document (admin only — enforced by the route). Number and PDF archive slot stay;
// the PDF is rebuilt by the caller afterwards.
async function updateDocument(id, data, user, render) {
  if (!isObj(data)) throw new HttpError(400, 'Data dokumen tidak valid.');
  return db.tx(async (c) => {
    const old = (await c.query('SELECT * FROM documents WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!old) throw new HttpError(404, 'Dokumen tidak ditemukan.');
    const jenis = old.jenis;
    const attached = Object.fromEntries((await c.query('SELECT kind, id::text AS id FROM uploads WHERE document_id = $1', [id])).rows.map((r) => [r.kind, r.id]));
    const merged = { ...data, no: old.no, files: { ...attached, ...(isObj(data.files) ? data.files : {}) } };
    assertComplete(jenis, merged);

    const oldUnit = HOLDS_UNIT.has(jenis) ? await lockUnit(c, old.no_unit) : null;
    const newUnit = HOLDS_UNIT.has(jenis) ? await lockUnit(c, merged.noUnit) : null;
    const moved = newUnit && (!oldUnit || newUnit.id !== oldUnit.id);
    if (moved && jenis !== 'kwitansi' && newUnit.status === 'terjual') throw new HttpError(409, unitBusyMessage(newUnit)); // same rule as issuing a new document
    if (newUnit) merged.noUnit = newUnit.no_unit;
    merged.files = await claimFiles(c, jenis, merged, user, attached);
    await render(merged); // fail before anything is written

    await c.query(
      'UPDATE documents SET nama=$1, no_unit=$2, jumlah=$3, tanggal=$4, data=$5, pdf=NULL, edited_at=now(), edited_by=$6 WHERE id=$7',
      [str(merged[WHO[jenis]]), str(merged.noUnit), int(merged.jumlah ?? merged.harga), isoDate(merged.tanggal), JSON.stringify(merged), user.id, id]);
    await attachFiles(c, id, merged.files);

    // Unit stock follows the correction: free the old unit if this document was holding it, then hold the new one.
    if (oldUnit && moved || (oldUnit && !newUnit)) {
      if (oldUnit.doc_no === old.no) await c.query("UPDATE units SET status='tersedia', pemesan='', doc_no='', updated_by=$1, updated_at=now() WHERE id=$2", [user.id, oldUnit.id]);
    }
    if (newUnit && moved) {
      await c.query('UPDATE units SET status=$1, pemesan=$2, doc_no=$3, updated_by=$4, updated_at=now() WHERE id=$5',
        [statusFor(jenis), str(merged[WHO[jenis]]) || newUnit.pemesan, old.no, user.id, newUnit.id]);
    } else if (newUnit && newUnit.doc_no === old.no) {
      await c.query('UPDATE units SET pemesan=$1, updated_by=$2, updated_at=now() WHERE id=$3', [str(merged[WHO[jenis]]) || newUnit.pemesan, user.id, newUnit.id]);
    }
    const changed = Object.keys({ ...old.data, ...merged }).filter((k) => JSON.stringify(old.data[k]) !== JSON.stringify(merged[k]));
    await audit(c, user.id, 'document.edit', 'document', id, { no: old.no, jenis, changed });
    return { doc: merged, id, jenis };
  });
}

async function listDocuments({ q = '', jenis = '' } = {}) {
  const like = `%${str(q)}%`;
  const r = await db.query(
    `SELECT d.id, d.no, d.jenis, d.nama, d.no_unit, d.jumlah, d.tanggal, ${TS('d.created_at')} AS created_at, u.name AS created_by,
            d.edited_at IS NOT NULL AS edited,
            (SELECT json_agg(json_build_object('kind', f.kind, 'id', f.id::text, 'filename', f.filename) ORDER BY f.kind) FROM uploads f WHERE f.document_id = d.id) AS files
     FROM documents d LEFT JOIN users u ON u.id = d.created_by
     WHERE ($1 = '' OR d.jenis = $1) AND (d.no ILIKE $2 OR d.nama ILIKE $2 OR d.no_unit ILIKE $2)
     ORDER BY d.id DESC LIMIT 500`, [str(jenis), like]);
  return r.rows;
}
const getDocument = async (id) => (await db.query('SELECT id, no, jenis, nama, no_unit, jumlah, tanggal, data, created_by, created_at, pdf IS NOT NULL AS has_pdf FROM documents WHERE id = $1', [id])).rows[0] || null;
const getDocumentFiles = async (id) => (await db.query('SELECT kind, id::text AS id, filename, mime, size FROM uploads WHERE document_id = $1 ORDER BY kind', [id])).rows;
const getPdf = async (id) => (await db.query('SELECT pdf FROM documents WHERE id = $1', [id])).rows[0]?.pdf || null;
const savePdf = (id, buf) => db.query('UPDATE documents SET pdf = $1 WHERE id = $2', [buf, id]);

// ───────── uploads (customer documents) ─────────
async function saveUpload({ user, kind, filename, mime, data }) {
  const r = await db.query('INSERT INTO uploads (user_id, kind, filename, mime, size, data) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id::text AS id',
    [user.id, kind, filename, mime, data.length, data]);
  return { id: r.rows[0].id, kind, filename, mime, size: data.length };
}
const getUpload = async (id) => (/^[0-9a-f-]{36}$/i.test(str(id)) ? (await db.query('SELECT id::text AS id, kind, filename, mime, size, data, user_id, document_id FROM uploads WHERE id = $1', [id])).rows[0] : null) || null;
async function deleteUpload(id, user) {
  const u = await getUpload(id);
  if (!u) return false;
  if (u.document_id != null) throw new HttpError(409, 'Berkas ini sudah menjadi bagian dari dokumen yang tercetak.');
  if (u.user_id !== user.id && user.role !== 'admin') throw new HttpError(403, 'Berkas ini bukan milik Anda.');
  await db.query('DELETE FROM uploads WHERE id = $1', [id]);
  return true;
}
// Files that were uploaded but never attached to a printed document.
const purgeOrphanUploads = () => db.query("DELETE FROM uploads WHERE document_id IS NULL AND created_at < now() - interval '1 day'");

// ───────── units ─────────
// For a unit that is reserved or sold: the value (Harga Pengikatan) and the buyer's name from its most recent
// SKU / SPU, so the stock list and the map can show who has it and for how much.
const listUnits = async () => (await db.query(
  `SELECT u.id, u.no_unit, u.type, u.harga, u.status, u.pemesan, u.doc_no,
          COALESCE(NULLIF(b.nama, ''), NULLIF(u.pemesan, '')) AS pemesan_terakhir,
          CASE WHEN b.data->>'harga' ~ '^[0-9]+$' THEN (b.data->>'harga')::bigint END AS nilai,
          b.no AS booking_no, b.tanggal AS booking_tanggal
   FROM units u
   LEFT JOIN LATERAL (
     SELECT d.nama, d.no, d.tanggal, d.data FROM documents d
     WHERE d.jenis IN ('surat-konfirmasi', 'surat-pemesanan') AND lower(d.no_unit) = lower(u.no_unit)
     ORDER BY d.id DESC LIMIT 1) b ON u.status <> 'tersedia'
   ORDER BY u.type, u.no_unit`)).rows;

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

// ───────── sales report ─────────
const CARA_LABEL = { 'tunai-keras': 'Tunai Keras', 'tunai-bertahap': 'Tunai Bertahap', kpr: 'KPR' };

// A "sale" = the latest SKU/SPU of a unit that is still reserved/sold (cancelled units drop out).
// Period filters on the document date. Stock figures are always current.
async function salesReport({ from, to } = {}) {
  const f = isoDate(from), t = isoDate(to);
  const sold = (await db.query(
    `SELECT x.id, x.no, x.jenis, x.nama, x.no_unit, x.tanggal, x.data, x.type, x.status FROM (
       SELECT DISTINCT ON (lower(d.no_unit)) d.id, d.no, d.jenis, d.nama, d.no_unit, d.tanggal, d.data, u.type, u.status
       FROM documents d JOIN units u ON lower(u.no_unit) = lower(d.no_unit) AND u.status <> 'tersedia'
       WHERE d.jenis IN ('surat-konfirmasi', 'surat-pemesanan') AND d.no_unit <> ''
       ORDER BY lower(d.no_unit), d.id DESC) x
     WHERE ($1::date IS NULL OR x.tanggal >= $1) AND ($2::date IS NULL OR x.tanggal <= $2)
     ORDER BY x.tanggal DESC NULLS LAST, x.id DESC`, [f, t])).rows;
  const rows = sold.map((r) => ({
    id: r.id, tanggal: r.tanggal, no: r.no, jenis: r.jenis, nama: r.nama, unit: r.no_unit, type: r.type || '',
    harga: Number(r.data && r.data.harga) || 0, cara: CARA_LABEL[r.data && r.data.cara && r.data.cara.tipe] || '—',
    sales: str(r.data && r.data.sales) || '—', status: r.status,
  }));
  const group = (keyFn) => {
    const m = new Map();
    for (const r of rows) { const k = keyFn(r); const g = m.get(k) || { key: k, jumlah: 0, nilai: 0 }; g.jumlah += 1; g.nilai += r.harga; m.set(k, g); }
    return [...m.values()];
  };
  const sum = (list) => ({ jumlah: list.length, nilai: list.reduce((a, r) => a + r.harga, 0) });

  const units = (await db.query('SELECT type, status, count(*)::int n FROM units GROUP BY type, status')).rows;
  const stock = { total: 0, tersedia: 0, dipesan: 0, terjual: 0, byType: {} };
  for (const u of units) {
    stock.total += u.n; stock[u.status] = (stock[u.status] || 0) + u.n;
    const t2 = (stock.byType[u.type || '—'] ||= { total: 0, tersedia: 0, dipesan: 0, terjual: 0 });
    t2.total += u.n; t2[u.status] += u.n;
  }
  const rec = (await db.query(
    "SELECT count(*)::int n, COALESCE(sum(jumlah), 0)::bigint total FROM documents WHERE jenis = 'kwitansi' AND ($1::date IS NULL OR tanggal >= $1) AND ($2::date IS NULL OR tanggal <= $2)", [f, t])).rows[0];
  return {
    period: { from: f, to: t }, stock,
    sales: {
      ...sum(rows), terjual: sum(rows.filter((r) => r.status === 'terjual')), dipesan: sum(rows.filter((r) => r.status === 'dipesan')),
      byType: group((r) => r.type || '—').sort((a, b) => a.key.localeCompare(b.key)),
      byCara: group((r) => r.cara).sort((a, b) => b.nilai - a.nilai),
      byMonth: group((r) => (r.tanggal || '').slice(0, 7) || '—').sort((a, b) => a.key.localeCompare(b.key)),
      bySales: group((r) => r.sales).sort((a, b) => b.nilai - a.nilai || b.jumlah - a.jumlah),
    },
    receipts: { jumlah: rec.n, total: Number(rec.total) },
    rows,
  };
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
  audit, salesReport, saveUpload, getUpload, deleteUpload, purgeOrphanUploads, createDocument, updateDocument, listDocuments, getDocument, getDocumentFiles, getPdf, savePdf, listUnits, addUnits, updateUnit, deleteUnit,
  listUsers, createUser, updateUser, changeOwnPassword, authenticate, ensureAdmin, listAudit, str,
};
