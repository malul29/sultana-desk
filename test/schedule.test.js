const { test } = require('node:test');
const assert = require('node:assert/strict');
const S = require('../lib/schedule');
const terms = require('../lib/terms');
const company = require('../lib/company');
const { missing, filesFor, SUMBER } = require('../lib/validation');

test('due dates move month by month and never skip a short month', () => {
  assert.equal(S.addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(S.addMonths('2026-01-31', 2), '2026-03-31');
  assert.equal(S.addMonths('2028-01-31', 1), '2028-02-29');
  assert.equal(S.addMonths('2026-12-15', 1), '2027-01-15');
  assert.equal(S.addMonths('', 1), '');
});

test('tunai keras: reservasi, booking fee and pelunasan only', () => {
  const d = { cara: { tipe: 'tunai-keras' }, jadwal: { booking: { tanggal: '2026-10-31' } } };
  assert.deepEqual(S.rows(d, { reservasi: true }).map((r) => r.label), ['Reservasi', 'Booking Fee', 'Pelunasan']);
  assert.deepEqual(S.rows(d, { reservasi: false }).map((r) => r.label), ['Booking Fee', 'Pelunasan']);
  assert.equal(S.rows(d, {}).at(-1).tanggal, '2026-11-30', 'pelunasan due 1 month after booking fee');
});

test('tunai bertahap: up to 10 instalments with automatic monthly dates', () => {
  const d = { cara: { tipe: 'tunai-bertahap' }, jadwal: { kali: '10', mulai: '2026-11-30', cicilan: Array.from({ length: 10 }, () => ({ jumlah: 1 })) } };
  const rows = S.rows(d, { reservasi: true });
  assert.equal(rows.length, 12);
  assert.deepEqual(rows.slice(2, 6).map((r) => r.tanggal), ['2026-11-30', '2026-12-30', '2027-01-30', '2027-02-28']);
  assert.equal(rows.at(-1).label, 'Angsuran 10/10');
  assert.equal(S.rows({ ...d, jadwal: { ...d.jadwal, kali: '50' } }, {}).length, 11, 'capped at 10 (+ booking fee)');
  assert.match(S.describe(d), /angsuran 10 kali/);
});

test('KPR: up to 12 down-payment instalments, then pelunasan KPR', () => {
  const d = { cara: { tipe: 'kpr' }, jadwal: { kali: '12', mulai: '2026-11-05' } };
  const rows = S.rows(d, { reservasi: true });
  assert.deepEqual([rows[0].label, rows[1].label, rows[2].label, rows.at(-1).label], ['Reservasi', 'Booking Fee', 'Uang Muka 1/12', 'Pelunasan KPR']);
  assert.equal(rows.length, 15);
  assert.equal(S.rows({ ...d, jadwal: { ...d.jadwal, kali: '13' } }, {}).length, 14, 'capped at 12');
  assert.equal(S.rows({ ...d, jadwal: { ...d.jadwal, kali: '3' } }, {}).length, 5);
});

test('S&K follow the original sheets: numbered clauses with lettered sub-clauses', () => {
  const p = terms.SURAT_PESANAN;
  assert.equal(p.items.length, 11);
  assert.deepEqual(p.items.map((i) => (typeof i === 'string' ? 0 : (i.subs || []).length)), [0, 0, 0, 0, 5, 4, 3, 2, 0, 0, 0]);
  assert.match(p.items[4].text, /^Fasilitas Kredit Bank/);
  const pay = p.items[7].subs[0];
  assert.ok(pay.account && /^-dengan mencantumkan nama Perumahan/.test(pay.para), 'the paragraph after the account block is kept');
  assert.equal(p.items[8].dashPara.startsWith('-dalam hal terjadi keterlambatan serah terima'), true);
  for (const [spec, name] of [[terms.SURAT_KONFIRMASI, 'Surat Konfirmasi Unit'], [terms.SURAT_PESANAN_UNIT, 'Surat Pemesanan Unit']]) {
    assert.equal(spec.items.length, 11, 'same clauses as the Surat Pesanan template');
    assert.ok(spec.title.includes(name.toUpperCase()) && !JSON.stringify(spec).includes('Surat Pesanan'), 'document name swapped in everywhere');
  }
});

test('SKU prints the Mandiri account, SPU the company BTN account', () => {
  assert.deepEqual(terms.ACCOUNT_KONFIRMASI, [['Atas nama', 'MEGAWATI DAN ROSDIANA'], ['Bank', 'MANDIRI'], ['Acc', '174-00-1310120-9']]);
  assert.deepEqual(terms.ACCOUNT_PESANAN.at(-1), ['Acc', '01057-01-30-000035-8'], 'the Surat Pesanan sheet keeps the BTN company account');
});

test('company footer carries the phone number', () => {
  assert.match(company.footerText, /Telp\/WA 0877-8575-8656/);
  assert.match(company.footerText, /Jl\. Paraikatte/);
});

test('validation: choices and uploads', () => {
  assert.deepEqual(Object.values(SUMBER), ['Medsos', 'Referensi', 'Walk in', 'Undangan', 'Lain-lain']);
  assert.deepEqual(filesFor('surat-konfirmasi', { cara: { tipe: 'kpr' } }), ['ktp', 'npwp']);
  assert.deepEqual(filesFor('surat-pemesanan', { cara: { tipe: 'tunai-keras' } }), ['ktp', 'npwp']);
  assert.deepEqual(filesFor('surat-pemesanan', { cara: { tipe: 'kpr' } }), ['ktp', 'npwp', 'kk', 'rekening', 'nikah']);
  assert.ok(missing('surat-konfirmasi', {}).includes('Sumber Informasi'));
  assert.ok(missing('surat-konfirmasi', { sumber: 'lain-lain' }).includes('Sumber Informasi (lain-lain)'));
});
