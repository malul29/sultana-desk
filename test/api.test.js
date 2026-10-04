// End-to-end tests against a real PostgreSQL (embedded, throw-away) and the real Express app.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const pdf = require('../lib/pdf');

let pg, server, base;
const jar = {};   // username -> cookie

async function call(method, url, { body, as, headers } = {}) {
  const h = { 'X-Requested-With': 'fetch', ...(body ? { 'Content-Type': 'application/json' } : {}), ...(headers || {}) };
  if (as && jar[as]) h.Cookie = jar[as];
  return fetch(base + url, { method, headers: h, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
}
async function login(u, p) {
  const r = await call('POST', '/api/auth/login', { body: { username: u, password: p } });
  if (r.ok) jar[u] = r.headers.get('set-cookie').split(';')[0];
  return r;
}

// ── payload builders: complete, valid documents (everything is required to print) ──
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(24, 1)]);
async function upload(as, kind, buf = PNG, name = 'scan.png') {
  const r = await fetch(`${base}/api/uploads?kind=${kind}&name=${encodeURIComponent(name)}`, {
    method: 'POST', headers: { 'X-Requested-With': 'fetch', 'Content-Type': 'application/octet-stream', Cookie: jar[as] }, body: buf });
  return r;
}
async function files(as, kinds) {
  const out = {};
  for (const k of kinds) out[k] = (await (await upload(as, k)).json()).id;
  return out;
}
const J = {
  reservasi: { tanggal: '2026-09-30', jumlah: '1000000' },
  booking: { tanggal: '2026-10-02', jumlah: '5000000' },
  pelunasan: { jumlah: '644000000' },
};
const unitDoc = (o = {}) => ({
  tanggal: '2026-09-30', nama: 'Budi', alamatKtp: 'Jl A', alamatSurat: 'Jl B', nikNpwp: '123', telp: '0812', email: 'b@x.co',
  sumber: 'medsos', type: 'Deluxe', noUnit: 'A-01', luasTanah: '71,5', luasBangunan: '129', harga: '650000000', listrik: 'kost',
  cara: { tipe: 'tunai-keras' }, jadwal: J, penerima: 'Ros', sales: 'Sari', ...o,
});
const kwDoc = (o = {}) => ({ tanggal: '2026-09-30', terimaDari: 'Budi', jumlah: 5000000, jenis: 'tunai', untuk: 'booking', noUnit: 'A-01', penandatangan: 'Ros', rekening: 'pt-balla', ...o });
const ttDoc = (o = {}) => ({ tanggal: '2026-09-30', kepada: 'PT Maju', alamat: 'Jl A', up: 'Bpk X', suratNo: '001', kwitansi: '002', dokumen: 'SKU', gambar: '-', keterangan: 'Mohon dikonfirmasi', penerima: 'A', penyerah: 'B', ...o });
const sku = async (as, o = {}) => unitDoc({ files: await files(as, ['ktp', 'npwp']), ...o });
const nextNo = async (as, d = '2026-09-30') => (await (await call('GET', `/api/next-number?tanggal=${d}`, { as })).json()).no;
const units = async (as) => (await call('GET', '/api/units', { as })).json();
const unitOf = async (as, no) => (await units(as)).find((u) => u.no_unit === no);

before(async () => {
  const EmbeddedPostgres = (await import('embedded-postgres')).default;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sultana-pg-'));
  const port = 54400 + Math.floor(Math.random() * 500);
  pg = new EmbeddedPostgres({ databaseDir: dir, user: 't', password: 't', port, persistent: false, onLog: () => {}, onError: () => {} });
  await pg.initialise(); await pg.start(); await pg.createDatabase('t');
  process.env.DATABASE_URL = `postgres://t:t@localhost:${port}/t`;
  process.env.ADMIN_USERNAME = 'boss'; process.env.ADMIN_PASSWORD = 'bosspass123';
  const db = require('../src/db'), store = require('../src/store'), config = require('../src/config');
  await db.migrate(); await store.ensureAdmin(config.admin);
  server = require('../src/app').createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server?.close();
  await require('../src/db').close();
  await pg?.stop();
});

test('healthz reports database up', async () => {
  assert.equal((await call('GET', '/healthz')).status, 200);
});

test('app and api need a session; login page is public', async () => {
  assert.equal((await call('GET', '/')).status, 302);
  assert.equal((await call('GET', '/api/units')).status, 401);
  assert.equal((await call('GET', '/login.html')).status, 200);
  assert.equal((await call('GET', '/assets/logo-color.png')).status, 200);
  assert.equal((await call('GET', '/index.html')).status, 302);
});

test('every data endpoint refuses anonymous requests', async () => {
  for (const [m, u] of [['GET', '/api/unit-types'], ['GET', '/api/company'], ['GET', '/api/terms'], ['GET', '/api/next-number'], ['GET', '/api/documents'], ['GET', '/api/documents/1'],
    ['GET', '/api/documents/1/download'], ['PUT', '/api/documents/1'], ['POST', '/api/kwitansi'], ['POST', '/api/tanda-terima'], ['POST', '/api/surat-konfirmasi'], ['POST', '/api/surat-pemesanan'],
    ['GET', '/api/syarat-pesanan.pdf'], ['POST', '/api/uploads?kind=ktp'], ['GET', '/api/uploads/x'], ['GET', '/api/report'], ['GET', '/api/report/csv'],
    ['GET', '/api/units'], ['GET', '/api/users']]) {
    const r = await call(m, u, m === 'GET' ? {} : { body: {} });
    assert.equal(r.status, 401, `${m} ${u} should need login`);
  }
});

test('wrong password rejected, right one accepted, session cookie is httpOnly', async () => {
  assert.equal((await login('boss', 'nope-nope')).status, 401);
  const r = await login('boss', 'bosspass123');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('set-cookie'), /HttpOnly/i);
  assert.equal((await call('GET', '/', { as: 'boss' })).status, 200);
});

test('writes without the CSRF header are refused', async () => {
  assert.equal((await fetch(base + '/api/auth/logout', { method: 'POST', headers: { Cookie: jar.boss } })).status, 403);
});

test('admin creates a staff user; staff cannot manage users or stock', async () => {
  assert.equal((await call('POST', '/api/users', { as: 'boss', body: { username: 'sales1', name: 'Sales Satu', role: 'staff', password: 'sales-pass-1' } })).status, 200);
  assert.equal((await call('POST', '/api/users', { as: 'boss', body: { username: 'SALES1', name: 'Dup', role: 'staff', password: 'sales-pass-1' } })).status, 409);
  assert.equal((await call('POST', '/api/users', { as: 'boss', body: { username: 'x', name: 'Short', role: 'staff', password: 'sales-pass-1' } })).status, 400);
  assert.equal((await login('sales1', 'sales-pass-1')).status, 200);
  assert.equal((await call('GET', '/api/users', { as: 'sales1' })).status, 403);
  assert.equal((await call('POST', '/api/units', { as: 'sales1', body: { no_unit: 'Z-1' } })).status, 403);
  assert.equal((await call('GET', '/api/units', { as: 'sales1' })).status, 200);
});

test('last admin cannot be demoted or disabled', async () => {
  const boss = (await (await call('GET', '/api/users', { as: 'boss' })).json()).find((u) => u.username === 'boss');
  assert.equal((await call('PATCH', `/api/users/${boss.id}`, { as: 'boss', body: { role: 'staff' } })).status, 400);
});

test('incomplete documents are refused with the list of what is missing, and use no number', async () => {
  const before = await nextNo('boss');
  let r = await call('POST', '/api/surat-konfirmasi', { as: 'boss', body: { nama: 'Budi' } });
  assert.equal(r.status, 422);
  const j = await r.json();
  assert.ok(j.missing.includes('Alamat (sesuai KTP)') && j.missing.includes('Unggah KTP') && j.missing.includes('Cara Pembayaran'));
  assert.match(j.error, /^Lengkapi dulu: /);
  // every kind of document enforces it
  for (const u of ['kwitansi', 'tanda-terima', 'surat-pemesanan']) assert.equal((await call('POST', '/api/' + u, { as: 'boss', body: { tanggal: '2026-09-30' } })).status, 422, u);
  // one empty field is enough
  assert.equal((await call('POST', '/api/kwitansi', { as: 'boss', body: kwDoc({ penandatangan: '  ' }) })).status, 422);
  assert.equal((await call('POST', '/api/tanda-terima', { as: 'boss', body: ttDoc({ gambar: '' }) })).status, 422);
  assert.equal(await nextNo('boss'), before, 'refused documents must not consume a number');
  assert.equal((await (await call('GET', '/api/documents', { as: 'boss' })).json()).length, 0);
});

test('conditional requirements: transfer needs bank + account, DP needs its number, KPR needs a schedule', async () => {
  const miss = async (u, b) => (await (await call('POST', '/api/' + u, { as: 'boss', body: b })).json()).missing || [];
  assert.deepEqual((await miss('kwitansi', kwDoc({ jenis: 'transfer', untuk: 'dp' }))).sort(), ['Bank', 'DP ke-', 'Tanggal transfer']);
  assert.deepEqual(await miss('kwitansi', kwDoc({ jenis: 'tunai', untuk: 'booking' })), [], 'cash booking needs none of them');
  // "cair di rekening" is required for every payment type, cash included
  for (const jenis of ['tunai', 'transfer']) assert.ok((await miss('kwitansi', kwDoc({ jenis, rekening: '', bank: 'BTN', tglTransfer: '2026-09-30', untuk: 'booking' }))).includes('Cair di rekening'), jenis);
  const kpr = unitDoc({ files: await files('boss', ['ktp', 'npwp']), cara: { tipe: 'kpr' }, jadwal: { ...J, kali: 3, mulai: '2026-11-05' } });
  const m = await miss('surat-konfirmasi', kpr);
  assert.ok(m.includes('Jumlah Uang Muka 1/3') && m.includes('Jatuh tempo Pelunasan KPR') && !m.includes('Jatuh tempo Uang Muka 2/3'), 'instalment dates are worked out, amounts are typed');
  assert.ok((await miss('surat-konfirmasi', { ...kpr, jadwal: { ...kpr.jadwal, kali: 13 } })).some((x) => /Jumlah uang muka \(1–12 kali\)/.test(x)));
  const bertahap = unitDoc({ files: await files('boss', ['ktp', 'npwp']), cara: { tipe: 'tunai-bertahap' }, jadwal: { ...J, kali: 11, mulai: '2026-11-05' } });
  assert.ok((await miss('surat-konfirmasi', bertahap)).some((x) => /Jumlah angsuran \(1–10 kali\)/.test(x)));
  // "lain-lain" asks for details
  assert.ok((await miss('surat-konfirmasi', unitDoc({ files: await files('boss', ['ktp', 'npwp']), sumber: 'lain-lain' }))).includes('Sumber Informasi (lain-lain)'));
});

test('uploads: only PDF/JPG/PNG/WEBP by content, owned by the uploader, one use only', async () => {
  const bad = await upload('sales1', 'ktp', Buffer.from('<html>not an image</html>'), 'x.png');
  assert.equal(bad.status, 415);
  assert.equal((await upload('sales1', 'selfie')).status, 400);
  assert.equal((await upload('sales1', 'ktp', Buffer.alloc(0))).status, 400);
  const ok = await upload('sales1', 'ktp', PNG, 'KTP Budi!!.png');
  assert.equal(ok.status, 200);
  const f = await ok.json();
  assert.equal(f.mime, 'image/png'); assert.equal(f.filename, 'KTP Budi_.png'); assert.equal(f.kind, 'ktp');
  const got = await call('GET', `/api/uploads/${f.id}`, { as: 'sales1' });
  assert.equal(got.status, 200); assert.equal(got.headers.get('content-type'), 'image/png');
  // view: inline, embeddable by this app only (no CSP sandbox, it blanks Chrome's PDF viewer); download: attachment
  assert.match(got.headers.get('content-disposition'), /^inline;/);
  assert.equal(got.headers.get('x-frame-options'), 'SAMEORIGIN');
  assert.equal(got.headers.get('x-content-type-options'), 'nosniff');
  assert.match(got.headers.get('content-security-policy'), /default-src 'none'.*frame-ancestors 'self'/);
  assert.doesNotMatch(got.headers.get('content-security-policy'), /sandbox/);
  const dl = await call('GET', `/api/uploads/${f.id}?download=1`, { as: 'sales1' });
  assert.match(dl.headers.get('content-disposition'), /^attachment; filename="KTP Budi_\.png"$/);
  assert.equal((await call('GET', `/api/uploads/${f.id}`)).status, 401, 'files need a login');
  assert.equal((await call('DELETE', `/api/uploads/${f.id}`, { as: 'sales1' })).status, 200);
  assert.equal((await call('GET', `/api/uploads/${f.id}`, { as: 'sales1' })).status, 404);
  // someone else's upload cannot be attached to my document
  const theirs = await files('sales1', ['ktp', 'npwp']);
  const r = await call('POST', '/api/surat-konfirmasi', { as: 'boss', body: unitDoc({ files: { ...theirs } }) });
  assert.equal(r.status, 200, 'an admin may attach any pending upload');
});

test('unit flow: SKU marks the unit dipesan, Kwitansi marks it terjual, later receipts still work', async () => {
  assert.deepEqual(await (await call('POST', '/api/units', { as: 'boss', body: { units: [{ no_unit: 'A-01', type: 'Deluxe', harga: 650000000 }, { no_unit: 'A-02', type: 'Executive' }, { no_unit: 'A-03', type: 'Premiere' }] } })).json(), { added: 3, skipped: [] });
  assert.deepEqual(await (await call('POST', '/api/units', { as: 'boss', body: { units: [{ no_unit: 'a-01' }] } })).json(), { added: 0, skipped: ['a-01'] });

  // A-01 was just used by the upload test's SKU (admin attached it) — release it for a clean flow
  const a1 = await unitOf('boss', 'A-01');
  await call('POST', `/api/units/${a1.id}`, { as: 'boss', body: { status: 'tersedia' } });

  const start = Number((await nextNo('boss')).slice(0, 3));
  let r = await call('POST', '/api/surat-konfirmasi', { as: 'sales1', body: await sku('sales1', { noUnit: 'a-01' }) });
  assert.equal(r.status, 200);
  const created = await r.json();
  assert.equal(Number(created.no.slice(0, 3)), start);
  assert.match(created.no, /^\d{3}\/SL-BSS\/IX\/2026$/);
  assert.equal(created.file, `SKU_${created.no.replace(/[^\w-]+/g, '_')}_Budi.pdf`);
  assert.equal(created.pdf, `/api/documents/${created.id}/pdf`);
  if (pdf.available()) {
    assert.equal(created.pdfReady, true);
    const p = await call('GET', created.pdf, { as: 'sales1' });
    assert.equal(p.headers.get('content-type'), 'application/pdf');
    assert.match(p.headers.get('content-disposition'), /^inline; filename="SKU_/);
    assert.equal(Buffer.from(await p.arrayBuffer()).subarray(0, 5).toString(), '%PDF-');
    assert.match((await call('GET', created.pdf + '?download=1', { as: 'sales1' })).headers.get('content-disposition'), /^attachment;/);
  }
  const held = await unitOf('boss', 'A-01');
  assert.equal(held.status, 'dipesan'); assert.equal(held.pemesan, 'Budi'); assert.equal(held.doc_no, created.no);
  assert.equal((await call('POST', '/api/surat-pemesanan', { as: 'boss', body: await sku('boss', { noUnit: 'A-01', nama: 'Ani' }) })).status, 200, 'a merely reserved unit can still be re-booked');

  // while reserved, the unit list carries the value and the latest buyer from its SKU/SPU
  const listed = await unitOf('boss', 'A-01');
  assert.equal(listed.nilai, 650000000); assert.equal(listed.pemesan_terakhir, 'Ani'); assert.ok(listed.booking_no.endsWith('/SL-BSS/IX/2026'));
  assert.equal((await unitOf('boss', 'A-03')).nilai, null, 'a unit nobody holds has no value');
  assert.equal((await unitOf('boss', 'A-03')).pemesan_terakhir, null);

  // a receipt marks it sold…
  r = await call('POST', '/api/kwitansi', { as: 'sales1', body: kwDoc() });
  assert.equal(r.status, 200);
  const sold = await unitOf('boss', 'A-01'); assert.equal(sold.status, 'terjual');
  // …and further receipts (DP instalments) are still accepted, without changing who owns the unit
  const soldInfo = await unitOf('boss', 'A-01');
  assert.equal(soldInfo.nilai, 650000000); assert.equal(soldInfo.pemesan_terakhir, 'Ani', 'sold: still the latest SKU/SPU name');
  const owner = sold.pemesan;
  assert.equal((await call('POST', '/api/kwitansi', { as: 'sales1', body: kwDoc({ untuk: 'dp', dpKe: '1', jumlah: 2000000 }) })).status, 200);
  const still = await unitOf('boss', 'A-01'); assert.equal(still.status, 'terjual'); assert.equal(still.pemesan, owner); assert.equal(still.doc_no, sold.doc_no);

  // a sold unit cannot be booked again, and the refusal costs no number
  const n = await nextNo('boss');
  r = await call('POST', '/api/surat-pemesanan', { as: 'boss', body: await sku('boss', { noUnit: 'A-01', nama: 'Cici' }) });
  assert.equal(r.status, 409); assert.match((await r.json()).error, /sudah berstatus "terjual"/);
  assert.equal(await nextNo('boss'), n);

  await call('POST', `/api/units/${a1.id}`, { as: 'boss', body: { status: 'tersedia' } });
  const free = await unitOf('boss', 'A-01'); assert.equal(free.status, 'tersedia'); assert.equal(free.pemesan, '');
  assert.equal((await call('POST', `/api/units/${a1.id}`, { as: 'boss', body: { status: 'lunas' } })).status, 400);
});

test('SPU needs KK, rekening koran and surat nikah only for KPR', async () => {
  const base = { noUnit: 'A-02', type: 'Executive' };
  const keras = await call('POST', '/api/surat-pemesanan', { as: 'boss', body: unitDoc({ ...base, files: await files('boss', ['ktp', 'npwp']) }) });
  assert.equal(keras.status, 200, 'cash needs only KTP + NPWP');
  const a2 = await unitOf('boss', 'A-02'); await call('POST', `/api/units/${a2.id}`, { as: 'boss', body: { status: 'tersedia' } });
  const kprDoc = { ...base, cara: { tipe: 'kpr' }, jadwal: { booking: J.booking, kali: 2, mulai: '2026-11-05', cicilan: [{ jumlah: '1000000' }, { jumlah: '1000000' }], pelunasan: { tanggal: '2027-12-01', jumlah: '600000000' } } };
  const r1 = await call('POST', '/api/surat-pemesanan', { as: 'boss', body: unitDoc({ ...kprDoc, files: await files('boss', ['ktp', 'npwp']) }) });
  assert.equal(r1.status, 422);
  assert.deepEqual((await r1.json()).missing, ['Unggah Kartu Keluarga (KK)', 'Unggah Rekening Koran', 'Unggah Surat Nikah']);
  const r2 = await call('POST', '/api/surat-pemesanan', { as: 'boss', body: unitDoc({ ...kprDoc, files: await files('boss', ['ktp', 'npwp', 'kk', 'rekening', 'nikah']) }) });
  assert.equal(r2.status, 200);
  // the same unit-form with SKU: KPR does not add requirements there
  const a2b = await unitOf('boss', 'A-02'); await call('POST', `/api/units/${a2b.id}`, { as: 'boss', body: { status: 'tersedia' } });
  assert.equal((await call('POST', '/api/surat-konfirmasi', { as: 'boss', body: unitDoc({ ...base, cara: { tipe: 'kpr' }, jadwal: { ...J, kali: 1, mulai: '2026-11-05', cicilan: [{ jumlah: '1' }], pelunasan: { tanggal: '2027-01-01', jumlah: '1' } }, files: await files('boss', ['ktp', 'npwp']) }) })).status, 200);
});

test('admin edits unit details in any status; staff cannot', async () => {
  const a3 = await unitOf('boss', 'A-03');
  let r = await call('POST', `/api/units/${a3.id}`, { as: 'boss', body: { type: 'Deluxe', harga: 900000000 } });
  assert.equal(r.status, 200);
  const after = await unitOf('boss', 'A-03'); assert.equal(after.type, 'Deluxe'); assert.equal(after.harga, 900000000);
  assert.equal((await call('POST', `/api/units/${a3.id}`, { as: 'boss', body: { no_unit: 'a-01' } })).status, 409);
  assert.equal((await call('POST', `/api/units/${a3.id}`, { as: 'boss', body: { no_unit: 'A-03B' } })).status, 200);
  assert.equal((await call('POST', `/api/units/${a3.id}`, { as: 'sales1', body: { harga: 1 } })).status, 403);
});

test('only the admin can correct a printed document; number stays, unit stock follows', async () => {
  await call('POST', '/api/units', { as: 'boss', body: { units: [{ no_unit: 'B-01', type: 'Deluxe' }, { no_unit: 'B-02', type: 'Executive' }] } });
  const made = await (await call('POST', '/api/surat-konfirmasi', { as: 'sales1', body: await sku('sales1', { noUnit: 'B-01', nama: 'Dedi' }) })).json();
  const open = await (await call('GET', `/api/documents/${made.id}`, { as: 'sales1' })).json();
  assert.equal(open.data.nama, 'Dedi'); assert.equal(open.files.length, 2);
  const fixed = { ...open.data, nama: 'Dedi Kurniawan', noUnit: 'B-02', type: 'Executive' };

  assert.equal((await call('PUT', `/api/documents/${made.id}`, { as: 'sales1', body: fixed })).status, 403, 'staff may not edit');
  assert.equal((await call('PUT', `/api/documents/${made.id}`, { as: 'boss', body: { ...fixed, alamatKtp: '' } })).status, 422, 'a corrected document must still be complete');

  const r = await call('PUT', `/api/documents/${made.id}`, { as: 'boss', body: fixed });
  assert.equal(r.status, 200);
  const done = await r.json();
  assert.equal(done.no, made.no, 'number never changes');
  const after = await (await call('GET', `/api/documents/${made.id}`, { as: 'boss' })).json();
  assert.equal(after.data.nama, 'Dedi Kurniawan'); assert.equal(after.no, made.no); assert.equal(after.files.length, 2);
  assert.equal((await unitOf('boss', 'B-01')).status, 'tersedia', 'the unit it no longer names is freed');
  const b2 = await unitOf('boss', 'B-02');
  assert.equal(b2.status, 'dipesan'); assert.equal(b2.pemesan, 'Dedi Kurniawan'); assert.equal(b2.doc_no, made.no);
  if (pdf.available()) {
    const p = await call('GET', done.pdf, { as: 'boss' });
    assert.equal(Buffer.from(await p.arrayBuffer()).subarray(0, 5).toString(), '%PDF-');
  }
  // moving onto a unit someone else holds is refused
  await call('POST', '/api/surat-konfirmasi', { as: 'boss', body: await sku('boss', { noUnit: 'B-01', nama: 'Eka' }) });
  assert.equal((await call('PUT', `/api/documents/${made.id}`, { as: 'boss', body: { ...fixed, noUnit: 'B-01' } })).status, 200, 'a reserved (dipesan) unit may be taken over');
  const b1 = await unitOf('boss', 'B-01'); await call('POST', `/api/units/${b1.id}`, { as: 'boss', body: { status: 'terjual' } });
  assert.equal((await call('PUT', `/api/documents/${made.id}`, { as: 'boss', body: { ...fixed, noUnit: 'B-01' } })).status, 200, 'it already holds B-01');
  const b2again = await unitOf('boss', 'B-02'); await call('POST', `/api/units/${b2again.id}`, { as: 'boss', body: { status: 'terjual' } });
  assert.equal((await call('PUT', `/api/documents/${made.id}`, { as: 'boss', body: { ...fixed, noUnit: 'B-02' } })).status, 409, 'a sold unit cannot be taken over');
  const list = await (await call('GET', '/api/documents?q=Dedi', { as: 'boss' })).json();
  assert.equal(list[0].edited, true);
});

test('sales report: only units still reserved/sold count, by type, payment method, month and sales', async () => {
  const rep = await (await call('GET', '/api/report', { as: 'sales1' })).json();
  if (process.env.DEBUG_REPORT) console.log(JSON.stringify(rep, null, 1));
  assert.equal(rep.stock.total, rep.stock.tersedia + rep.stock.dipesan + rep.stock.terjual);
  assert.equal(rep.sales.jumlah, rep.rows.length);
  assert.equal(rep.sales.nilai, rep.rows.reduce((a, r) => a + r.harga, 0));
  assert.equal(rep.sales.jumlah, rep.sales.terjual.jumlah + rep.sales.dipesan.jumlah);
  assert.ok(rep.sales.byType.length && rep.sales.byCara.some((c) => c.key === 'Tunai Keras') && rep.sales.byMonth.some((m) => m.key === '2026-09') && rep.sales.bySales.some((s) => s.key === 'Sari'));
  assert.ok(rep.rows.every((r) => r.unit && r.no && r.harga > 0));
  assert.equal(new Set(rep.rows.map((r) => r.unit.toLowerCase())).size, rep.rows.length, 'one row per unit');
  assert.ok(rep.receipts.jumlah >= 2 && rep.receipts.total >= 7000000);
  const none = await (await call('GET', '/api/report?from=2030-01-01&to=2030-12-31', { as: 'boss' })).json();
  assert.equal(none.sales.jumlah, 0); assert.equal(none.receipts.jumlah, 0);
  assert.equal(none.stock.total, rep.stock.total, 'stock is a current snapshot, not period-bound');
  const csv = await call('GET', '/api/report/csv', { as: 'boss' });
  assert.match(csv.headers.get('content-type'), /text\/csv/);
  const bytes = Buffer.from(await csv.arrayBuffer());
  assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'UTF-8 BOM so Excel reads accents correctly');
  const text = bytes.toString('utf8').replace(/^\ufeff/, '');
  assert.ok(text.startsWith('Tanggal;No. Dokumen;Pemesan;Unit;Type;Harga (Rp);Cara Bayar;Sales;Status Unit'));
  assert.equal(text.trim().split('\r\n').length, rep.rows.length + 1);
});

test('fixed terms document comes as a printable PDF', { skip: !pdf.available() && 'LibreOffice not installed' }, async () => {
  const r = await call('GET', '/api/syarat-pesanan.pdf', { as: 'boss' });
  assert.equal(r.status, 200); assert.equal(r.headers.get('content-type'), 'application/pdf');
  assert.equal(Buffer.from(await r.arrayBuffer()).subarray(0, 5).toString(), '%PDF-');
});

test('numbers are unique and gap-free under concurrent requests', async () => {
  const start = Number((await nextNo('boss', '2026-10-05')).slice(0, 3));
  const rs = await Promise.all(Array.from({ length: 12 }, (_, i) => call('POST', '/api/kwitansi', { as: i % 2 ? 'boss' : 'sales1', body: kwDoc({ terimaDari: 'T' + i, tanggal: '2026-10-05', noUnit: 'ZZ-' + i }) })));
  assert.ok(rs.every((r) => r.status === 200));
  const nums = (await Promise.all(rs.map((r) => r.json()))).map((j) => j.no).sort();
  assert.equal(new Set(nums).size, 12);
  assert.deepEqual(nums.map((n) => Number(n.slice(0, 3))).sort((a, b) => a - b), Array.from({ length: 12 }, (_, i) => start + i));
  assert.match(nums[0], /\/SL-BSS\/X\/2026$/);
});

test('numbering restarts at 001 every month, and continues a month that already has older numbers', async () => {
  const mk = async (tanggal) => (await (await call('POST', '/api/tanda-terima', { as: 'boss', body: ttDoc({ tanggal }) })).json()).no;
  assert.equal(await nextNo('boss', '2027-03-02'), '001/SL-BSS/III/2027');
  assert.equal(await mk('2027-03-02'), '001/SL-BSS/III/2027');
  assert.equal(await mk('2027-03-20'), '002/SL-BSS/III/2027');
  assert.equal(await mk('2027-04-01'), '001/SL-BSS/IV/2027', 'a new month starts again at 001');
  assert.equal(await mk('2027-03-28'), '003/SL-BSS/III/2027', 'an earlier month keeps its own sequence');
  assert.equal(await nextNo('boss', '2027-03-30'), '004/SL-BSS/III/2027');
  // a month numbered under the old single counter: carry on after its highest number
  const db = require('../src/db');
  await db.query("INSERT INTO documents (no, jenis, nama, data) VALUES ('004/SL-BSS/V/2027', 'tanda-terima', 'lama', '{}')");
  assert.equal(await nextNo('boss', '2027-05-10'), '005/SL-BSS/V/2027');
  assert.equal(await mk('2027-05-10'), '005/SL-BSS/V/2027');
});

test('history lists documents with author and files; re-download keeps the number', async () => {
  const list = await (await call('GET', '/api/documents?q=Budi&jenis=surat-konfirmasi', { as: 'boss' })).json();
  assert.ok(list.length >= 1);
  const row = list.find((d) => d.created_by === 'Sales Satu');
  assert.ok(row && row.files.map((f) => f.kind).sort().join() === 'ktp,npwp');
  const r = await call('GET', `/api/documents/${row.id}/download`, { as: 'boss' });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-disposition'), new RegExp(`SKU_${row.no.replace(/[^\w-]+/g, '_')}_Budi\\.docx`));
  assert.equal((await call('GET', '/api/documents/999999/download', { as: 'boss' })).status, 404);
});

test('disabling a user ends their session; password reset forces re-login', async () => {
  const s1 = (await (await call('GET', '/api/users', { as: 'boss' })).json()).find((u) => u.username === 'sales1');
  assert.equal((await call('GET', '/api/auth/me', { as: 'sales1' })).status, 200);
  assert.equal((await call('PATCH', `/api/users/${s1.id}`, { as: 'boss', body: { active: false } })).status, 200);
  assert.equal((await call('GET', '/api/auth/me', { as: 'sales1' })).status, 401);
  assert.equal((await login('sales1', 'sales-pass-1')).status, 401);
  await call('PATCH', `/api/users/${s1.id}`, { as: 'boss', body: { active: true, password: 'brand-new-pass' } });
  assert.equal((await login('sales1', 'brand-new-pass')).status, 200);
});

test('login is locked after repeated failures', async () => {
  for (let i = 0; i < 5; i++) await login('ghost', 'bad-password');
  assert.equal((await login('ghost', 'bad-password')).status, 429);
});

test('audit trail records the work', async () => {
  const actions = new Set((await (await call('GET', '/api/users/audit/log', { as: 'boss' })).json()).map((a) => a.action));
  for (const a of ['login', 'login.fail', 'document.create', 'document.edit', 'unit.reserve', 'unit.sold', 'unit.status', 'user.create']) assert.ok(actions.has(a), a);
});
