// Payment schedule rules, shared by the server (documents, validation) and the browser (form, preview).
// Works as a CommonJS module and as a plain <script> (exposes window.Schedule).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Schedule = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  const MAX = { 'tunai-bertahap': 10, kpr: 12 };

  const pad = (n) => String(n).padStart(2, '0');
  const isISO = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));

  // Same day of the month, k months later; 31 Jan + 1 month = 28/29 Feb (never skips a month).
  function addMonths(iso, k) {
    if (!isISO(iso)) return '';
    const [y, m, d] = iso.split('-').map(Number);
    const t = (m - 1) + k, yy = y + Math.floor(t / 12), mm = ((t % 12) + 12) % 12;
    const last = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
    return `${yy}-${pad(mm + 1)}-${pad(Math.min(d, last))}`;
  }

  const clampKali = (cara, kali) => {
    const max = MAX[cara] || 0, n = Math.floor(Number(kali));
    return Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : 0;
  };

  // The rows a schedule has for the chosen payment method.
  //   opts.reservasi : true for Surat Konfirmasi Unit (it has a reservation step), false for Surat Pemesanan Unit
  // Row = { key, label, tanggal, jumlah, auto? }   — `auto` rows have their due date worked out, not typed.
  function rows(d, opts = {}) {
    const cara = d.cara && d.cara.tipe;
    const j = d.jadwal || {};
    const out = [];
    const pick = (key, label) => out.push({ key, label, tanggal: (j[key] && j[key].tanggal) || '', jumlah: (j[key] && j[key].jumlah) || '' });
    if (opts.reservasi) pick('reservasi', 'Reservasi');
    pick('booking', 'Booking Fee');
    if (cara === 'tunai-keras') {
      // paid in full at most one month after Booking Fee
      const b = j.booking && j.booking.tanggal;
      out.push({ key: 'pelunasan', label: 'Pelunasan', tanggal: (j.pelunasan && j.pelunasan.tanggal) || addMonths(b, 1), jumlah: (j.pelunasan && j.pelunasan.jumlah) || '' });
    } else if (cara === 'tunai-bertahap' || cara === 'kpr') {
      const n = clampKali(cara, j.kali);
      const list = Array.isArray(j.cicilan) ? j.cicilan : Object.keys(j.cicilan || {}).sort((a, b) => a - b).map((k) => j.cicilan[k]);
      for (let i = 0; i < n; i++) {
        out.push({
          key: 'cicilan' + (i + 1), auto: i > 0,
          label: cara === 'kpr' ? `Uang Muka ${i + 1}/${n}` : `Angsuran ${i + 1}/${n}`,
          tanggal: i === 0 ? (j.mulai || '') : addMonths(j.mulai, i),
          jumlah: (list[i] && list[i].jumlah) || '',
        });
      }
      if (cara === 'kpr') pick('pelunasan', 'Pelunasan KPR');
    }
    return out;
  }

  // Human description printed next to the chosen payment method.
  function describe(d) {
    const cara = d.cara && d.cara.tipe, n = clampKali(cara, d.jadwal && d.jadwal.kali);
    if (cara === 'tunai-keras') return 'dilunasi paling lambat 1 bulan dari Tanda Jadi / Booking Fee';
    if (cara === 'tunai-bertahap') return n ? `angsuran ${n} kali, jatuh tempo setiap bulan` : '';
    if (cara === 'kpr') return n ? `uang muka ${n} kali, pelunasan melalui KPR` : 'pelunasan melalui KPR';
    return '';
  }

  return { MAX, addMonths, clampKali, rows, describe, isISO };
}));
