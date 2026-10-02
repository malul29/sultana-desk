// Site plan (assets/masterplan.webp, 896×659 px) and where each numbered lot sits on it.
// Used by the Stok Unit map in the browser and by the "Denah Lokasi Unit" printed on SKU/SPU.
const path = require('path');

const IMAGE = path.join(__dirname, '..', 'assets', 'masterplan.webp');
const SIZE = { w: 896, h: 659 };
// Part of the image worth showing (drops empty margins), and the printed title + land-size legend we hide.
const VIEW = { x: 40, y: 90, w: 820, h: 560 };
const LEGEND = { x: 520, y: 515, w: 376, h: 144 };

// Lot rectangles in image pixels, measured from the lot lines on the plan.
const LOTS = (() => {
  const top = [41, 39, 38, 37, 36, 35, 34, 33, 32, 31, 30, 29, 28, 27, 26];
  const xs = [171, 210, 249, 288, 327, 366, 405, 444, 483, 522, 561, 600, 640, 679, 718, 757];
  const mid = [238, 287, 326, 366, 405, 444, 483, 522, 561, 600, 652];
  const L = top.map((n, i) => ({ n, x: xs[i], y: 135, w: xs[i + 1] - xs[i], h: 66 }));
  [21, 20, 19, 18, 17, 16, 15, 12, 11, 10].forEach((n, i) => L.push({ n, x: mid[i], y: 243, w: mid[i + 1] - mid[i], h: 67 }));
  [1, 2, 3, 5, 6, 7, 8, 9].forEach((n, i) => L.push({ n, x: mid[i + 2], y: 310, w: mid[i + 3] - mid[i + 2], h: 66 }));
  [[25, 247, 50], [24, 297, 39], [23, 336, 39]].forEach(([n, y, h]) => L.push({ n, x: 691, y, w: 67, h }));
  return L;
})();

// "D-02" / "E-26" / "26" -> lot 2 / 26 / 26
const lotNumber = (noUnit) => { const m = /(\d+)\s*$/.exec(String(noUnit || '')); return m ? Number(m[1]) : null; };
const lotFor = (noUnit) => LOTS.find((l) => l.n === lotNumber(noUnit)) || null;

const RED = '#d0302f';
const xmlEsc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// JPEG of the plan (white background) with the chosen unit marked (no mark when the unit is not on the plan).
// Rendered at 2× so it stays sharp on paper.
async function mapImage(noUnit) {
  const sharp = require('sharp');
  const lot = lotFor(noUnit);
  let mark = '';
  if (lot) {
    const cx = lot.x + lot.w / 2, label = `UNIT ${String(noUnit).trim().toUpperCase()}`;
    const tw = label.length * 8.6 + 22, ty = lot.y < 200 ? lot.y + lot.h + 8 : lot.y - 30; // callout below top-row lots, above the rest
    mark =
      `<rect x="${lot.x}" y="${lot.y}" width="${lot.w}" height="${lot.h}" fill="${RED}" fill-opacity=".35" stroke="${RED}" stroke-width="4"/>` +
      `<rect x="${cx - tw / 2}" y="${ty}" width="${tw}" height="22" rx="11" fill="${RED}"/>` +
      `<text x="${cx}" y="${ty + 15.5}" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="13" font-weight="700" fill="#fff">${xmlEsc(label)}</text>`;
  }
  const overlay = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE.w}" height="${SIZE.h}">` +
    `<rect x="${LEGEND.x}" y="${LEGEND.y}" width="${LEGEND.w}" height="${LEGEND.h}" fill="#fff"/>${mark}</svg>`);
  const flat = await sharp(IMAGE).flatten({ background: '#ffffff' }).composite([{ input: overlay, top: 0, left: 0 }]).png().toBuffer();
  return sharp(flat)
    .extract({ left: VIEW.x, top: VIEW.y, width: VIEW.w, height: VIEW.h })
    .resize(VIEW.w * 2, VIEW.h * 2, { kernel: 'lanczos3' })
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer();
}

module.exports = { LOTS, VIEW, LEGEND, SIZE, lotFor, lotNumber, mapImage };
