// End-to-end tests against a real PostgreSQL (embedded, throw-away) and the real Express app.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const pdf = require('../lib/pdf');
const fs = require('fs');
const os = require('os');
const path = require('path');

let pg, server, base;
const jar = {};   // username -> cookie

async function call(method, url, { body, as, headers } = {}) {
  const h = { 'X-Requested-With': 'fetch', ...(body ? { 'Content-Type': 'application/json' } : {}), ...(headers || {}) };
  if (as && jar[as]) h.Cookie = jar[as];
  const r = await fetch(base + url, { method, headers: h, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
  return r;
}
async function login(u, p) {
  const r = await call('POST', '/api/auth/login', { body: { username: u, password: p } });
  if (r.ok) jar[u] = r.headers.get('set-cookie').split(';')[0];
  return r;
}

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
  const r = await call('GET', '/healthz');
  assert.equal(r.status, 200);
});

test('app and api need a session; login page is public', async () => {
  assert.equal((await call('GET', '/')).status, 302);
  assert.equal((await call('GET', '/api/units')).status, 401);
  assert.equal((await call('GET', '/login.html')).status, 200);
  assert.equal((await call('GET', '/assets/logo-mark.png')).status, 200);
  assert.equal((await call('GET', '/index.html')).status, 302);
});

test('every document endpoint refuses anonymous requests', async () => {
  for (const [m, u] of [['GET', '/api/unit-types'], ['GET', '/api/next-number'], ['GET', '/api/documents'], ['GET', '/api/documents/1/download'],
    ['POST', '/api/kwitansi'], ['POST', '/api/tanda-terima'], ['POST', '/api/surat-konfirmasi'], ['POST', '/api/surat-pemesanan'], ['POST', '/api/syarat-pesanan'],
    ['GET', '/api/units'], ['GET', '/api/users']]) {
    const r = await call(m, u, m === 'POST' ? { body: {} } : {});
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
  const r = await fetch(base + '/api/auth/logout', { method: 'POST', headers: { Cookie: jar.boss } });
  assert.equal(r.status, 403);
});

test('admin creates a staff user; staff cannot manage users or stock', async () => {
  let r = await call('POST', '/api/users', { as: 'boss', body: { username: 'sales1', name: 'Sales Satu', role: 'staff', password: 'sales-pass-1' } });
  assert.equal(r.status, 200);
  assert.equal((await call('POST', '/api/users', { as: 'boss', body: { username: 'SALES1', name: 'Dup', role: 'staff', password: 'sales-pass-1' } })).status, 409);
  assert.equal((await call('POST', '/api/users', { as: 'boss', body: { username: 'x', name: 'Short', role: 'staff', password: 'sales-pass-1' } })).status, 400);
  assert.equal((await login('sales1', 'sales-pass-1')).status, 200);
  assert.equal((await call('GET', '/api/users', { as: 'sales1' })).status, 403);
  assert.equal((await call('POST', '/api/units', { as: 'sales1', body: { no_unit: 'Z-1' } })).status, 403);
  assert.equal((await call('GET', '/api/units', { as: 'sales1' })).status, 200);
});

test('last admin cannot be demoted or disabled', async () => {
  const users = await (await call('GET', '/api/users', { as: 'boss' })).json();
  const boss = users.find((u) => u.username === 'boss');
  const r = await call('PATCH', `/api/users/${boss.id}`, { as: 'boss', body: { role: 'staff' } });
  assert.equal(r.status, 400);
});

test('stock: SKU marks a unit dipesan, Kwitansi marks it terjual, sold units are refused, release it', async () => {
  let r = await call('POST', '/api/units', { as: 'boss', body: { units: [{ no_unit: 'A-01', type: 'Deluxe', harga: 650000000 }, { no_unit: 'A-02', type: 'Executive' }] } });
  assert.deepEqual(await r.json(), { added: 2, skipped: [] });
  r = await call('POST', '/api/units', { as: 'boss', body: { units: [{ no_unit: 'a-01' }] } });
  assert.deepEqual(await r.json(), { added: 0, skipped: ['a-01'] });

  r = await call('POST', '/api/surat-konfirmasi', { as: 'sales1', body: { nama: 'Budi', noUnit: 'a-01', tanggal: '2026-09-30', harga: '650000000' } });
  assert.equal(r.status, 200);
  const created = await r.json();
  assert.equal(created.no, '001/SL-BSS/IX/2026');
  assert.equal(created.file, 'SKU_001_SL-BSS_IX_2026_Budi.pdf');
  assert.equal(created.pdf, `/api/documents/${created.id}/pdf`);
  if (pdf.available()) {
    assert.equal(created.pdfReady, true);
    const p = await call('GET', created.pdf, { as: 'sales1' });
    assert.equal(p.status, 200);
    assert.equal(p.headers.get('content-type'), 'application/pdf');
    assert.match(p.headers.get('content-disposition'), /^inline; filename="SKU_001_SL-BSS_IX_2026_Budi\.pdf"/);
    assert.equal(Buffer.from(await p.arrayBuffer()).subarray(0, 5).toString(), '%PDF-');
    const d = await call('GET', created.pdf + '?download=1', { as: 'sales1' });
    assert.match(d.headers.get('content-disposition'), /^attachment;/);
  }

  const units = await (await call('GET', '/api/units', { as: 'boss' })).json();
  const a1 = units.find((u) => u.no_unit === 'A-01');
  assert.equal(a1.status, 'dipesan'); assert.equal(a1.pemesan, 'Budi'); assert.equal(a1.doc_no, '001/SL-BSS/IX/2026');

  // a receipt for the unit marks it sold
  r = await call('POST', '/api/kwitansi', { as: 'sales1', body: { terimaDari: 'Budi', noUnit: 'A-01', jumlah: 5000000, tanggal: '2026-09-30' } });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).no, '002/SL-BSS/IX/2026');
  assert.equal((await (await call('GET', '/api/units', { as: 'boss' })).json()).find((u) => u.no_unit === 'A-01').status, 'terjual');

  r = await call('POST', '/api/surat-pemesanan', { as: 'boss', body: { nama: 'Ani', noUnit: 'A-01', tanggal: '2026-09-30' } });
  assert.equal(r.status, 409);
  assert.match((await r.json()).error, /Budi/);

  // refused booking must not consume a number
  assert.equal((await (await call('GET', '/api/next-number?tanggal=2026-09-30', { as: 'boss' })).json()).no, '003/SL-BSS/IX/2026');

  await call('POST', `/api/units/${a1.id}`, { as: 'boss', body: { status: 'tersedia' } });
  const again = (await (await call('GET', '/api/units', { as: 'boss' })).json()).find((u) => u.no_unit === 'A-01');
  assert.equal(again.status, 'tersedia'); assert.equal(again.pemesan, '');
});

test('admin edits unit details in any status; staff cannot', async () => {
  const units = await (await call('GET', '/api/units', { as: 'boss' })).json();
  const a2 = units.find((u) => u.no_unit === 'A-02');
  let r = await call('POST', `/api/units/${a2.id}`, { as: 'boss', body: { type: 'Premiere', harga: 900000000 } });
  assert.equal(r.status, 200);
  const after = (await (await call('GET', '/api/units', { as: 'boss' })).json()).find((u) => u.id === a2.id);
  assert.equal(after.type, 'Premiere'); assert.equal(after.harga, 900000000);
  // renaming onto an existing number is refused
  r = await call('POST', `/api/units/${a2.id}`, { as: 'boss', body: { no_unit: 'a-01' } });
  assert.equal(r.status, 409);
  r = await call('POST', `/api/units/${a2.id}`, { as: 'boss', body: { no_unit: 'A-02B' } });
  assert.equal(r.status, 200);
  // staff cannot
  assert.equal((await call('POST', `/api/units/${a2.id}`, { as: 'sales1', body: { harga: 1 } })).status, 403);
  // booked unit: details stay editable, booking info is kept
  await call('POST', '/api/surat-pemesanan', { as: 'boss', body: { nama: 'Cici', noUnit: 'A-02B', tanggal: '2026-09-30' } });
  r = await call('POST', `/api/units/${a2.id}`, { as: 'boss', body: { harga: 950000000 } });
  assert.equal(r.status, 200);
  const booked = (await (await call('GET', '/api/units', { as: 'boss' })).json()).find((u) => u.id === a2.id);
  assert.equal(booked.harga, 950000000); assert.equal(booked.status, 'dipesan'); assert.equal(booked.pemesan, 'Cici');
  assert.equal((await call('POST', `/api/units/${a2.id}`, { as: 'boss', body: { status: 'tersedia' } })).status, 200);
  // "dipesan" no longer exists
  assert.equal((await call('POST', `/api/units/${a2.id}`, { as: 'boss', body: { status: 'lunas' } })).status, 400);
});

test('fixed terms document comes as a printable PDF', { skip: !pdf.available() && 'LibreOffice not installed' }, async () => {
  const r = await call('GET', '/api/syarat-pesanan.pdf', { as: 'boss' });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'application/pdf');
  assert.equal(Buffer.from(await r.arrayBuffer()).subarray(0, 5).toString(), '%PDF-');
});

test('numbers are unique and gap-free under concurrent requests', async () => {
  const start = Number((await (await call('GET', '/api/next-number?tanggal=2026-10-05', { as: 'boss' })).json()).no.slice(0, 3));
  const rs = await Promise.all(Array.from({ length: 12 }, (_, i) => call('POST', '/api/kwitansi', { as: i % 2 ? 'boss' : 'sales1', body: { terimaDari: 'T' + i, jumlah: 1000, tanggal: '2026-10-05' } })));
  assert.ok(rs.every((r) => r.status === 200));
  const nums = (await Promise.all(rs.map((r) => r.json()))).map((j) => j.no).sort();
  assert.equal(new Set(nums).size, 12);
  const seq = nums.map((n) => Number(n.slice(0, 3))).sort((a, b) => a - b);
  assert.deepEqual(seq, Array.from({ length: 12 }, (_, i) => start + i));
  assert.match(nums[0], /\/SL-BSS\/X\/2026$/);
});

test('history lists documents with author; re-download keeps the number', async () => {
  const list = await (await call('GET', '/api/documents?q=Budi&jenis=surat-konfirmasi', { as: 'boss' })).json();
  assert.equal(list.length, 1);
  assert.equal(list[0].created_by, 'Sales Satu');
  const r = await call('GET', `/api/documents/${list[0].id}/download`, { as: 'boss' });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-disposition'), /SKU_001_SL-BSS_IX_2026_Budi\.docx/);
  assert.equal((await call('GET', '/api/documents/999999/download', { as: 'boss' })).status, 404);
});

test('disabling a user ends their session; password reset forces re-login', async () => {
  const users = await (await call('GET', '/api/users', { as: 'boss' })).json();
  const s1 = users.find((u) => u.username === 'sales1');
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
  const log = await (await call('GET', '/api/users/audit/log', { as: 'boss' })).json();
  const actions = new Set(log.map((a) => a.action));
  for (const a of ['login', 'login.fail', 'document.create', 'unit.reserve', 'unit.sold', 'unit.status', 'user.create']) assert.ok(actions.has(a), a);
});
