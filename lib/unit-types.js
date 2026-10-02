// Fixed specification of each unit type. Single source: documents, live preview and forms all read this.
//   kamar = number of rooms · lb = luas bangunan (m²) · lt = luas tanah, written as width x length (m)
const UNIT_TYPES = {
  Deluxe:    { kamar: 8,  lb: '129', lt: '6,5x11' },
  Executive: { kamar: 5,  lb: '82',  lt: '6,5x11' },
  Premiere:  { kamar: 10, lb: '145', lt: '7x11' },
};

const num = (s) => parseFloat(String(s).replace(',', '.'));
const idNum = (n) => String(Math.round(n * 100) / 100).replace('.', ',');
const UNIT = /\s*(m\s*[²2]|m\^2|meter\s*persegi)\s*$/i;

// Area of "6,5x11" -> "71,5" (Indonesian decimal comma); plain numbers pass through unchanged.
function areaOf(v) {
  const t = String(v ?? '').trim();
  const m = /^(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)$/i.exec(t);
  return m ? idNum(num(m[1]) * num(m[2])) : t;
}

// "129" -> "129 m²"   "7x11" -> "77 m²"   "6,5x11" -> "71,5 m²"
// "72 m2" -> "72 m²"  ""     -> "______________ m²" (fill-in line for handwriting)
function formatLuas(v) {
  const t = String(v ?? '').trim().replace(UNIT, '');
  if (!t) return '______________ m²';
  return `${areaOf(t)} m²`;
}

// Value typed by staff wins; otherwise the type's fixed size.
const luasTanah = (d) => areaOf(String(d.luasTanah ?? '').trim() || UNIT_TYPES[d.type]?.lt || '');
const luasBangunan = (d) => (String(d.luasBangunan ?? '').trim() || UNIT_TYPES[d.type]?.lb || '');

module.exports = { UNIT_TYPES, areaOf, formatLuas, luasTanah, luasBangunan };
