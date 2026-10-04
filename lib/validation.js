// "All fields required to print": the server-side rules. The browser mirrors them to disable the Cetak
// button, but this is the authority — a document that fails here is never numbered or stored.
const Schedule = require('./schedule');
const { UNIT_TYPES } = require('./unit-types');

const SUMBER = { medsos: 'Medsos', referensi: 'Referensi', 'walk-in': 'Walk in', undangan: 'Undangan', 'lain-lain': 'Lain-lain' };
const REKENING = { 'pt-balla': 'PT. Balla Sultana Samata' };
const CARA = ['tunai-keras', 'tunai-bertahap', 'kpr'];
const FILE_KINDS = { ktp: 'KTP', npwp: 'NPWP', kk: 'Kartu Keluarga (KK)', rekening: 'Rekening Koran', nikah: 'Surat Nikah' };

// Uploads a unit document accepts (all optional). SPU takes the loan documents only when paying by KPR.
const filesFor = (jenis, d) => {
  const base = ['ktp', 'npwp'];
  return jenis === 'surat-pemesanan' && d.cara && d.cara.tipe === 'kpr' ? [...base, 'kk', 'rekening', 'nikah'] : base;
};

const text = (v) => (v == null ? '' : String(v).trim());
const iso = (v) => /^\d{4}-\d{2}-\d{2}$/.test(text(v));
const money = (v) => Number.isFinite(Number(v)) && Number(v) > 0;
const get = (o, path) => path.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);

function missing(jenis, d) {
  const out = [];
  const need = (ok, label) => { if (!ok) out.push(label); };
  const str = (path, label) => need(text(get(d, path)) !== '', label);
  const day = (path, label) => need(iso(get(d, path)), label);

  if (jenis === 'surat-konfirmasi' || jenis === 'surat-pemesanan') {
    day('tanggal', 'Tanggal');
    str('nama', 'Nama (sesuai KTP)'); str('alamatKtp', 'Alamat (sesuai KTP)'); str('alamatSurat', 'Alamat surat-menyurat');
    str('nikNpwp', 'NIK & NPWP'); str('telp', 'Telp/HP'); need(/.+@.+\..+/.test(text(d.email)), 'Email');
    need(Object.prototype.hasOwnProperty.call(SUMBER, text(d.sumber)), 'Sumber Informasi');
    if (text(d.sumber) === 'lain-lain') str('sumberLain', 'Sumber Informasi (lain-lain)');
    need(!!UNIT_TYPES[text(d.type)], 'Type'); str('noUnit', 'No Unit'); str('luasTanah', 'Luas Tanah'); str('luasBangunan', 'Luas Bangunan');
    need(money(d.harga), 'Harga Pengikatan');
    need(['rumah', 'kost'].includes(text(d.listrik)), 'Listrik');
    need(CARA.includes(text(get(d, 'cara.tipe'))), 'Cara Pembayaran');
    if (CARA.includes(text(get(d, 'cara.tipe')))) {
      const cara = d.cara.tipe, max = Schedule.MAX[cara];
      if (max) {
        const n = Number(get(d, 'jadwal.kali'));
        need(Number.isInteger(n) && n >= 1 && n <= max, `Jumlah ${cara === 'kpr' ? 'uang muka' : 'angsuran'} (1–${max} kali)`);
      }
      Schedule.rows(d, { reservasi: jenis === 'surat-konfirmasi' }).forEach((r) => {
        need(iso(r.tanggal), `Jatuh tempo ${r.label}`); need(money(r.jumlah), `Jumlah ${r.label}`);
      });
    }
    str('penerima', 'Penerima Pesanan'); str('sales', 'Sales');
    // Uploads (KTP, NPWP, …) are optional: they are attached when given, never required to print.
  } else if (jenis === 'kwitansi') {
    day('tanggal', 'Tanggal'); str('terimaDari', 'Telah terima dari'); need(money(d.jumlah), 'Jumlah');
    need(['tunai', 'transfer'].includes(text(d.jenis)), 'Jenis Pembayaran');
    if (text(d.jenis) === 'transfer') { str('bank', 'Bank'); day('tglTransfer', 'Tanggal transfer'); }
    need(Object.prototype.hasOwnProperty.call(REKENING, text(d.rekening)), 'Cair di rekening'); // every payment type is paid into the company account
    need(['booking', 'dp'].includes(text(d.untuk)), 'Untuk Pembayaran');
    if (text(d.untuk) === 'dp') str('dpKe', 'DP ke-');
    str('noUnit', 'Nomor Unit'); str('penandatangan', 'Nama penandatangan');
  } else if (jenis === 'tanda-terima') {
    day('tanggal', 'Tanggal'); str('kepada', 'Kepada Yth'); str('alamat', 'Alamat'); str('up', 'U.P');
    str('suratNo', 'Surat No'); str('kwitansi', 'Kwitansi'); str('dokumen', 'Dokumen'); str('gambar', 'Gambar'); str('keterangan', 'Keterangan');
    str('penerima', 'Yang Menerima'); str('penyerah', 'Yang Menyerahkan');
  }
  return out;
}

module.exports = { missing, filesFor, SUMBER, REKENING, CARA, FILE_KINDS };
