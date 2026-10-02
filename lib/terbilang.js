const sat = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas'];

function say(n) {
  if (n < 12) return sat[n];
  if (n < 20) return say(n - 10) + ' belas';
  if (n < 100) return say(Math.floor(n / 10)) + ' puluh' + (n % 10 ? ' ' + say(n % 10) : '');
  if (n < 200) return 'seratus' + (n > 100 ? ' ' + say(n - 100) : '');
  if (n < 1000) return say(Math.floor(n / 100)) + ' ratus' + (n % 100 ? ' ' + say(n % 100) : '');
  if (n < 2000) return 'seribu' + (n > 1000 ? ' ' + say(n - 1000) : '');
  if (n < 1e6) return say(Math.floor(n / 1e3)) + ' ribu' + (n % 1e3 ? ' ' + say(n % 1e3) : '');
  if (n < 1e9) return say(Math.floor(n / 1e6)) + ' juta' + (n % 1e6 ? ' ' + say(n % 1e6) : '');
  if (n < 1e12) return say(Math.floor(n / 1e9)) + ' miliar' + (n % 1e9 ? ' ' + say(n % 1e9) : '');
  return say(Math.floor(n / 1e12)) + ' triliun' + (n % 1e12 ? ' ' + say(n % 1e12) : '');
}

function terbilang(n) {
  n = Math.floor(Number(n) || 0);
  if (n <= 0) return '';
  const s = say(n) + ' rupiah';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const rupiah = (n) => (Number(n) ? new Intl.NumberFormat('id-ID').format(Number(n)) : '');

const BULAN = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
function tanggalID(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? `${+m[3]} ${BULAN[+m[2] - 1]} ${m[1]}` : '';
}

module.exports = { terbilang, rupiah, tanggalID };
