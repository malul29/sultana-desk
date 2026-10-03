const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Footer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun, AlignmentType,
  WidthType, BorderStyle, TableLayoutType, HeightRule, SectionType, LineRuleType, TabStopType, PageBreak, VerticalAlign,
} = require('docx');
const { terbilang, rupiah, tanggalID, tanggalPendek } = require('./terbilang');
const Schedule = require('./schedule');
const CARA_LABEL = { 'tunai-keras': 'Tunai Keras', 'tunai-bertahap': 'Tunai Bertahap', kpr: 'KPR' };
const Validation = require('./validation');
const T = require('./terms');
const masterplan = require('./masterplan');

const LOGO = fs.readFileSync(path.join(__dirname, '..', 'assets', 'logo.png'));
const FONT = 'Times New Roman';
// Active body font for the document currently being built (see withFont()).
let CUR = FONT;
const withFont = (font, fn) => { const prev = CUR; CUR = font; try { return fn(); } finally { CUR = prev; } };
const BLANK = '_'.repeat(58);
const NONE = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const NO_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE };

const KW_GREEN = '3F5636'; // dark accent, derived from the brand green
const KW_GREEN_TINT = 'EEF3ED';
const KW_MUTE = '9AA79A';
const KW_W = 9600;

const run = (text, o = {}) => new TextRun({ text: String(text ?? ''), font: CUR, size: 22, ...o });
const para = (children, o = {}) =>
  new Paragraph({ spacing: { after: 60 }, ...o, children: Array.isArray(children) ? children : [run(children)] });
const box = (on) => (on ? '☒' : '☐');
const val = (v, fallback = BLANK) => (v && String(v).trim() ? String(v).trim() : fallback);
const underlined = (v, fallback = '______________') =>
  v && String(v).trim() ? run(String(v).trim(), { underline: {} }) : run(fallback);

const logo = (w = 150) =>
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 120 },
    children: [new ImageRun({ type: 'png', data: LOGO, transformation: { width: w, height: Math.round((w * 175) / 359) } })],
  });

const title = (t, size = 28) =>
  para([run(t, { bold: true, size })], { alignment: AlignmentType.CENTER, spacing: { after: 160 } });

// Borderless table rows for "Label : value" blocks (robust across Word/LibreOffice).
const NB = { top: NONE, bottom: NONE, left: NONE, right: NONE };
function kv(rows, widths, size = 22, indent = 0) {
  const r = (t, o = {}) => run(t, { size, ...o });
  const toKids = (c) => (c === '' || c == null ? [] : Array.isArray(c) ? c : [r(c)]);
  return new Table({
    width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA }, columnWidths: widths, layout: TableLayoutType.FIXED, borders: NO_BORDERS,
    indent: indent ? { size: indent, type: WidthType.DXA } : undefined,
    rows: rows.map((row) => new TableRow({
      cantSplit: true,
      children: widths.map((w, i) => new TableCell({
        width: { size: w, type: WidthType.DXA }, borders: NB, margins: { top: 14, bottom: 14, left: 40, right: 40 },
        children: [new Paragraph({ spacing: { after: 0 }, children: toKids(row[i]) })],
      })),
    })),
  });
}

const cell = (children, o = {}) =>
  new TableCell({
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    ...o,
    children: (Array.isArray(children) ? children : [children]).map((c) => (typeof c === 'string' ? para(c, { spacing: { after: 0 } }) : c)),
  });

// ───────────────── Modern receipt-style documents (Kwitansi, Tanda Terima) ─────────────────
const M = { DARK: '2F4530', GOLD: 'B8965A', INK: '1F2A24', LABEL: '7A857D', LINE: 'D5DBD3', TINT: 'F1F4EF' };
const LOGO_WHITE = fs.readFileSync(path.join(__dirname, '..', 'assets', 'logo-kop.png'));
const LOGO_MARK = fs.readFileSync(path.join(__dirname, '..', 'assets', 'logo-color.png'));
const LOGO_MARK_RATIO = 307 / 796;
const HAIR = { style: BorderStyle.SINGLE, size: 4, color: M.LINE };
const GAP = 240;

// Clean header: logo left, document title + number right, separated by a thin rule. No background band.
function banner(title, d) {
  const L = 3000, R = KW_W - L;
  const logoW = 140;
  const c = (kids, w) => new TableCell({
    width: { size: w, type: WidthType.DXA }, borders: NB, verticalAlign: VerticalAlign.BOTTOM,
    margins: { top: 0, bottom: 0, left: 0, right: 0 }, children: kids,
  });
  return new Table({
    width: { size: KW_W, type: WidthType.DXA }, columnWidths: [L, R], layout: TableLayoutType.FIXED, borders: NO_BORDERS,
    rows: [
      new TableRow({ cantSplit: true, children: [
        c([new Paragraph({ spacing: { after: 0 }, children: [new ImageRun({ type: 'png', data: LOGO_MARK, transformation: { width: logoW, height: Math.round(logoW * LOGO_MARK_RATIO) } })] })], L),
        c([
          new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 30 }, children: [run(title, { bold: true, size: 36, color: M.DARK, characterSpacing: 40 })] }),
          new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 0 }, children: [
            run('No. ', { size: 18, color: M.LABEL }), run(val(d.no, '—'), { size: 18, bold: true, color: M.INK }),
          ] }),
        ], R),
      ] }),
      new TableRow({ cantSplit: true, children: [
        new TableCell({
          width: { size: KW_W, type: WidthType.DXA }, columnSpan: 2,
          borders: { top: NONE, left: NONE, right: NONE, bottom: { style: BorderStyle.SINGLE, size: 8, color: M.LINE } },
          margins: { top: 120, bottom: 0, left: 0, right: 0 }, children: [new Paragraph('')],
        })
      ] })
    ],
  });
}

// Stacked form field: small caps label above the value, hairline beneath.
function fld(label, kids, width, o = {}) {
  const content = kids == null || kids === '' ? [] : Array.isArray(kids) ? kids : [run(String(kids), { size: 22, color: M.INK })];
  const extra = (o.lines || []).map((t) => new Paragraph({ spacing: { after: 0, line: 300 }, children: [run(t || '', { size: 22, color: M.INK })] }));
  return new TableCell({
    width: { size: width, type: WidthType.DXA }, verticalAlign: VerticalAlign.BOTTOM,
    borders: { top: NONE, left: NONE, right: NONE, bottom: HAIR }, margins: { top: 40, bottom: 50, left: 0, right: 0 },
    shading: o.tint ? { fill: M.TINT } : undefined,
    children: [
      new Paragraph({ spacing: { after: 30 }, children: [run(String(label).toUpperCase(), { size: 14, bold: true, color: M.LABEL, characterSpacing: 30 })] }),
      ...(extra.length ? extra : [new Paragraph({ spacing: { after: 0 }, children: content })]),
    ],
  });
}

// One row of fields with `GAP` between them. cols = [[label, kids, fraction, opts?], …]
function fieldRow(cols, minHeight) {
  const usable = KW_W - GAP * (cols.length - 1);
  const cells = []; const widths = [];
  cols.forEach(([label, kids, frac, o], i) => {
    const w = Math.round(usable * frac);
    if (i) { cells.push(new TableCell({ width: { size: GAP, type: WidthType.DXA }, borders: NB, children: [new Paragraph({ children: [] })] })); widths.push(GAP); }
    cells.push(fld(label, kids, w, o)); widths.push(w);
  });
  return new TableRow({ cantSplit: true, height: minHeight ? { value: minHeight, rule: HeightRule.ATLEAST } : undefined, children: cells, _w: widths });
}
function fields(rows) {
  const widths = rows.reduce((best, r) => (r.options?._w?.length > best.length ? r.options._w : best), []);
  const t = new Table({ width: { size: KW_W, type: WidthType.DXA }, columnWidths: rows[0].options._w, layout: TableLayoutType.FIXED, borders: NO_BORDERS, rows });
  return t;
}
// "Rangkap n" in a small box at the right margin.
const rangkapBox = (n, size = 20) => new Table({
  width: { size: 1500, type: WidthType.DXA }, columnWidths: [1500], layout: TableLayoutType.FIXED, alignment: AlignmentType.RIGHT,
  borders: NO_BORDERS,
  rows: [new TableRow({ cantSplit: true, children: [new TableCell({
    width: { size: 1500, type: WidthType.DXA }, margins: { top: 50, bottom: 50, left: 100, right: 100 },
    borders: { top: { style: BorderStyle.SINGLE, size: 8, color: '222222' }, bottom: { style: BorderStyle.SINGLE, size: 8, color: '222222' }, left: { style: BorderStyle.SINGLE, size: 8, color: '222222' }, right: { style: BorderStyle.SINGLE, size: 8, color: '222222' } },
    children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0 }, children: [run(`Rangkap ${n}`, { bold: true, size })] })],
  })] })],
});
// "Medsos" / "Walk in" / "Lain-lain: pameran" — falls back to a fill-in line when nothing is chosen.
const sumberText = (d) => {
  const label = Validation.SUMBER[String(d.sumber || '')];
  if (!label) return val(d.sumber);
  return d.sumber === 'lain-lain' && String(d.sumberLain || '').trim() ? `${label}: ${String(d.sumberLain).trim()}` : label;
};
// Receiving account printed on a transfer/cheque receipt: "PT. Balla Sultana Samata · BTN KCP CIPAYUNG · 01057-…".
const rekeningText = () => T.ACCOUNT_PESANAN.map(([, v]) => v).join('  ·  ');
// ~5pt of vertical air without the height of an empty text line
// room left for a handwritten signature between the role label and the name line (twips)
const SIGN_SPACE_BY_ROWS = (n) => (n > 12 ? 380 : n > 8 ? 520 : n > 5 ? 800 : 1000);
const thinGap = () => new Paragraph({ spacing: { before: 0, after: 0, line: 100, lineRule: LineRuleType.EXACT }, children: [] });
const tinySpacer = () => new Paragraph({ spacing: { before: 0, after: 0, line: 60, lineRule: LineRuleType.EXACT }, children: [] });
const gap = (n = 120) => new Paragraph({ spacing: { after: n }, children: [] });

// Radio-style option: filled dot + bold when selected.
const opt = (label, on) => [
  run(on ? '●  ' : '○  ', { size: 20, color: on ? M.DARK : 'B5BDB4', bold: on }),
  run(label + '      ', { size: 20, color: on ? M.INK : M.LABEL, bold: on }),
];

function signatureCols(cols, heading = true) {
  const n = cols.length, w = Math.floor(KW_W / n);
  return new Table({
    width: { size: w * n, type: WidthType.DXA }, columnWidths: cols.map(() => w), layout: TableLayoutType.FIXED, borders: NO_BORDERS,
    rows: [new TableRow({ cantSplit: true, children: cols.map(({ head, name, sub }) => new TableCell({
      width: { size: w, type: WidthType.DXA }, borders: NB, margins: { left: 200, right: 200, top: 0, bottom: 0 },
      children: [
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 700 }, children: [run(head.toUpperCase(), { size: 15, bold: true, color: M.LABEL, characterSpacing: 30 })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: M.INK } }, children: [run(name && name.trim() ? name.trim() : ' ', { size: 20, bold: true, color: M.INK })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0 }, children: [run(sub, { size: 16, color: M.LABEL })] }),
      ],
    })) })],
  });
}

// Total: no background — gold rule above, hairline below; what it pays for on the left, amount on the right.
function totalBar(jumlah, sub) {
  const w1 = 4800, w2 = KW_W - w1;
  const edge = { top: { style: BorderStyle.SINGLE, size: 18, color: M.GOLD }, bottom: HAIR, left: NONE, right: NONE };
  const cell = (kids, w, margins) => new TableCell({ width: { size: w, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER, borders: edge, margins, children: kids });
  return new Table({
    width: { size: KW_W, type: WidthType.DXA }, columnWidths: [w1, w2], layout: TableLayoutType.FIXED, borders: NO_BORDERS,
    rows: [new TableRow({ cantSplit: true, children: [
      cell([
        new Paragraph({ spacing: { after: 30 }, children: [run('TOTAL PEMBAYARAN', { size: 16, bold: true, color: M.LABEL, characterSpacing: 60 })] }),
        new Paragraph({ spacing: { after: 0 }, children: [run(sub || ' ', { size: 18, color: M.INK })] }),
      ], w1, { top: 200, bottom: 200, left: 0, right: 100 }),
      cell([
        new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 0 }, children: [run('Rp ', { size: 26, color: M.GOLD }), run(jumlah ? rupiah(jumlah) : '0', { size: 56, bold: true, color: M.DARK })] }),
      ], w2, { top: 200, bottom: 200, left: 100, right: 0 }),
    ] })],
  });
}

function tandaTerima(d) {
  return withFont(SK_FONT, () => {
    const L = (v, n) => { const o = String(v || '').split('\n').map((x) => x.trim()); return Array.from({ length: n }, (_, i) => o[i] || ''); };
    const tgl = d.tanggal ? `Gowa, ${tanggalID(d.tanggal)}` : '……………….,  …………………';
    const notes = L(d.keterangan, 6);
    const kids = [
      banner('TANDA TERIMA', d),
      gap(260),
      fields([
        fieldRow([['Kepada Yth', d.kepada, 1]]),
        fieldRow([['Alamat', null, 1, { lines: L(d.alamat, 3) }]]),
        fieldRow([['U.P', null, 1, { lines: L(d.up, 2) }]]),
      ]),
      gap(200),
      para([run('Bersama ini kami kirimkan/terima :', { size: 20, color: M.INK, italics: true })], { spacing: { after: 100 } }),
      fields([
        fieldRow([['Surat No', d.suratNo, 0.5], ['Kwitansi', d.kwitansi, 0.5]]),
        fieldRow([['Dokumen', d.dokumen, 0.5], ['Gambar', d.gambar, 0.5]]),
      ]),
      gap(200),
      fields([fieldRow([['Keterangan', null, 1, { lines: notes, tint: true }]])]),
      para([run(tgl, { size: 20, color: M.INK })], { alignment: AlignmentType.RIGHT, spacing: { before: 240, after: 200 } }),
      signatureCols([
        { head: 'Yang Menerima', name: d.penerima, sub: 'Nama Jelas' },
        { head: 'Yang Menyerahkan', name: d.penyerah, sub: 'Nama Jelas' },
      ]),
    ];
    return build([{ page: 'A4', margin: 1000, footer: true, children: kids }], SK_FONT, 20);
  });
}

function kwitansi(d) {
  return withFont(SK_FONT, () => {
    const jumlah = Number(d.jumlah) || 0;
    const terb = d.terbilang && d.terbilang.trim() ? d.terbilang.trim() : terbilang(jumlah);
    const transfer = d.jenis === 'transfer';
    const booking = d.untuk === 'booking';
    const kids = [
      banner('KWITANSI', d),
      gap(260),
      fields([
        fieldRow([['Telah terima dari', d.terimaDari, 1]]),
        fieldRow([['Uang sejumlah', terb ? [run(terb, { size: 22, italics: true, color: M.INK })] : null, 1]]),
      ]),
      gap(200),
      fields([
        fieldRow([
          ['Jenis pembayaran', transfer ? 'TRANSFER / CEK BANK' : 'TUNAI', transfer ? 0.6 : 1],
          ...(transfer ? [['Bank', d.bank, 0.2], ['Tanggal', tanggalID(d.tglTransfer), 0.2]] : [])
        ]),
      ]),
      gap(120),
      fields([fieldRow([['Cair di rekening', rekeningText(), 1]])]),
      gap(120),
      fields([
        fieldRow([
          ['Untuk pembayaran', booking ? 'BOOKING FEE' : 'UANG MUKA (DP)', 0.6],
          ...(booking ? [['Nomor unit', d.noUnit, 0.4]] : [['DP ke-', d.dpKe, 0.15], ['Nomor unit', d.noUnit, 0.25]])
        ]),
      ]),
      gap(120),
      para([run('1 Unit Perumahan Sultana Living', { size: 18, color: M.LABEL })], { spacing: { after: 240 } }),
      totalBar(jumlah, [booking ? 'Booking Fee' : 'Uang Muka (DP)' + (d.dpKe ? ' ke-' + d.dpKe : ''), d.noUnit ? 'Unit ' + d.noUnit : ''].filter(Boolean).join('  ·  ')),
      para([run(`Gowa, ${tanggalID(d.tanggal) || '_______________'}`, { size: 20, color: M.INK })], { alignment: AlignmentType.RIGHT, spacing: { before: 240, after: 160 } }),
      new Table({
        width: { size: KW_W, type: WidthType.DXA }, columnWidths: [5600, 4000], layout: TableLayoutType.FIXED, borders: NO_BORDERS,
        rows: [new TableRow({ cantSplit: true, children: [
          new TableCell({ width: { size: 5600, type: WidthType.DXA }, borders: NB, verticalAlign: VerticalAlign.BOTTOM, margins: { left: 0 }, children: [
            new Paragraph({ spacing: { after: 0 }, children: [run('Pembayaran dengan BG/Cek', { size: 16, italics: true, color: M.LABEL })] }),
            new Paragraph({ spacing: { after: 0 }, children: [run('dianggap sah setelah dicairkan', { size: 16, italics: true, color: M.LABEL })] }),
          ] }),
          new TableCell({ width: { size: 4000, type: WidthType.DXA }, borders: NB, margins: { left: 0, right: 0 }, children: [
            new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 700 }, children: [run('PENERIMA PEMBAYARAN', { size: 15, bold: true, color: M.LABEL, characterSpacing: 30 })] }),
            new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: M.INK } }, children: [run(d.penandatangan && d.penandatangan.trim() ? d.penandatangan.trim() : ' ', { size: 20, bold: true, color: M.INK })] }),
            new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0 }, children: [run('Nama Jelas', { size: 16, color: M.LABEL })] }),
          ] }),
        ] })],
      }),
    ];
    return build([{ page: 'A4', margin: 1000, footer: true, children: kids }], SK_FONT, 20);
  });
}

// ───────── SURAT KONFIRMASI UNIT / SURAT PEMESANAN UNIT ─────────
// Surat Pemesanan Unit is identical to Surat Konfirmasi Unit except it has no "Reservasi" row.
// Payment schedule: always ONE table. With many instalments the rows are made denser (smaller type, tighter
// padding) so the letter still fits on a single page.
function jadwalTable(d, { reservasi = true } = {}) {
  const items = Schedule.rows(d, { reservasi });
  const n = items.length;
  const size = n > 12 ? 16 : n > 8 ? 17 : n > 5 ? 19 : 20;      // half-points
  const pad = n > 12 ? 4 : n > 8 ? 12 : n > 5 ? 30 : 60;        // twips above/below the text
  const widths = [3600, 3400, 2600];
  const mk = (t, i, o = {}) => new TableCell({
    width: { size: widths[i], type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER,
    margins: { top: pad, bottom: pad, left: 100, right: 100 },
    children: [para([run(t, { size, ...o })], { spacing: { after: 0 }, alignment: i === 0 ? AlignmentType.LEFT : AlignmentType.CENTER })],
  });
  const head = ['Keterangan', 'Tanggal Jatuh Tempo', 'Jumlah (Rp)'];
  return new Table({
    width: { size: 9600, type: WidthType.DXA }, columnWidths: widths, layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({ tableHeader: true, cantSplit: true, children: head.map((h, i) => mk(h, i, { bold: true })) }),
      ...items.map((it) => new TableRow({ cantSplit: true, children: [mk(it.label, 0), mk(tanggalID(it.tanggal), 1), mk(rupiah(it.jumlah), 2)] })),
    ],
  });
}

const { UNIT_TYPES, formatLuas, luasTanah, luasBangunan } = require('./unit-types');
const SK_FONT = 'Calibri'; // Surat Konfirmasi Unit: body Calibri 10pt, judul 16pt
const FOOTER_TEXT = require('./company').footerText;
const RULE = { style: BorderStyle.SINGLE, size: 8, color: '444444' };

// Letterhead: logo flush left, title centred on the page, document number under it.
function kop(d, heading, titleSize = 32) {
  const SIDE = 2300;
  const MID = 9600 - SIDE * 2;
  const logoW = 130;
  const c = (children, w) => new TableCell({
    width: { size: w, type: WidthType.DXA }, borders: NB, margins: { top: 0, bottom: 0, left: 0, right: 0 },
    verticalAlign: VerticalAlign.CENTER, children,
  });
  return [
    new Table({
      width: { size: 9600, type: WidthType.DXA }, columnWidths: [SIDE, MID, SIDE], layout: TableLayoutType.FIXED, borders: NO_BORDERS,
      rows: [new TableRow({ cantSplit: true, children: [
        c([new Paragraph({ spacing: { after: 0 }, children: [new ImageRun({ type: 'png', data: LOGO_MARK, transformation: { width: logoW, height: Math.round(logoW * LOGO_MARK_RATIO) } })] })], SIDE),
        c([
          para([run(heading, { bold: true, size: titleSize })], { alignment: AlignmentType.CENTER, spacing: { after: 40 } }),
          para([run('No.  ', { size: 20 }), run(val(d.no, ''), { bold: true, size: 20 })], { alignment: AlignmentType.CENTER, spacing: { after: 0 } }),
        ], MID),
        c([new Paragraph({ spacing: { after: 0 }, children: [] })], SIDE),
      ] })],
    }),
    new Paragraph({ spacing: { before: 40, after: 100 }, border: { bottom: RULE }, children: [] }),
  ];
}

const footerParas = () => [new Paragraph({ alignment: AlignmentType.CENTER, children: [run(FOOTER_TEXT, { size: 14, color: '666666' })] })];
const footer = () => new Footer({ children: footerParas() });

function suratKonfirmasiPage(d, rangkap, variant) {
  const s = (t, o = {}) => run(t, { size: 20, ...o });
  const lines = (v) => String(v || '').split('\n').map((x) => x.trim()).filter(Boolean);
  const two = (v) => { const l = lines(v); return [l[0] || BLANK, l[1] || (l.length ? '' : BLANK)]; };
  const [ktp1, ktp2] = two(d.alamatKtp);
  const [srt1, srt2] = two(d.alamatSurat);
  const W = [2200, 300, 1500, 5600];
  const listrik = d.listrik;
  const cara = d.cara || {};
  const kamar = UNIT_TYPES[d.type]?.kamar;
  const addons = (d.addons || []).map((x) => String(x).trim()).filter(Boolean);
  const included = [
    ['- Sertifikat SHM', '- IMB/PBG'],
    ['- Air Bersih', '- BPHTB, AJB & Balik Nama Sertifikat'],
    ['- Biaya KPR (maksimal 7% dari Plafond KPR)', ''],
  ];
  // Listrik: label line, then both options on ONE line; add-ons follow.
  const NB2 = '\u00A0'.repeat(10);
  const included2 = [
    '- Listrik (Beri tanda checklist √) :',
    `  ${box(listrik === 'rumah')} Rumah Tinggal 2200 Watt${NB2}${box(listrik === 'kost')} Rumah Kost 1300 Watt, @ 900 Watt Per Kamar`,
    ...addons.map((a) => `- ${a}`),
  ];
  const rowsN = Schedule.rows(d, { reservasi: variant.reservasi }).length;
  const signSpace = SIGN_SPACE_BY_ROWS(rowsN);   // the longer the schedule, the less signing room fits on the sheet
  const hbar = (t) => para([s(t, { bold: true, underline: {} })], { spacing: { before: 100, after: 40 } });
  const body = [
    rangkapBox(rangkap),
    tinySpacer(), // keeps the two tables from merging into one
    ...kop(d, variant.heading),
    kv([
      ['Nama (sesuai KTP)', ':', val(d.nama)],
      ['Alamat (sesuai KTP)', ':', ktp1],
      ['', '', ktp2],
      ['Alamat surat-menyurat', ':', srt1],
      ['', '', srt2],
      ['NIK & NPWP', ':', val(d.nikNpwp)],
      ['Telp/HP', ':', val(d.telp)],
      ['Email', ':', val(d.email)],
      ['Sumber Informasi', ':', sumberText(d)],
    ], [2200, 300, 7100], 20),
    para([s('-selanjutnya disebut sebagai '), s('PEMESAN', { bold: true }), s('.')], { spacing: { before: 40, after: 80 } }),
    para([s('Dengan ini sepakat dan setuju untuk memesan :')], { spacing: { after: 40 } }),
    kv([
      ['Unit', ':', 'Type', d.type ? `${d.type}    (${kamar}) Kamar` : '____________________    (__) Kamar'],
      ['', '', 'No Unit', val(d.noUnit, '______________')],
      ['', '', 'Luas Tanah', formatLuas(luasTanah(d))],
      ['', '', 'Luas Bangunan', formatLuas(luasBangunan(d))],
    ], W, 20),
    thinGap(),
    kv([
      ['Harga Pengikatan', ':', d.harga ? `Rp. ${rupiah(d.harga)}` + (terbilang(d.harga) ? `  (${terbilang(d.harga)})` : '') : 'Rp. ____________________________'],
    ], [2200, 300, 7100], 20),
    thinGap(),
    kv(included.map((r, i) => [i === 0 ? 'Harga Termasuk' : '', i === 0 ? ':' : '', r[0], r[1]]), [2200, 300, 3900, 3200], 20),
    kv(included2.map((t) => ['', '', t]), [2200, 300, 7100], 20),
    hbar('CARA PEMBAYARAN'),
    // only the chosen method is printed (nothing is chosen on a blank form: one fill-in line)
    kv([
      cara.tipe && CARA_LABEL[cara.tipe]
        ? [CARA_LABEL[cara.tipe], '=', val(Schedule.describe(d), '.............................')]
        : ['', '=', '.............................'],
    ], [2200, 300, 7100], 20),
    hbar('JADWAL PEMBAYARAN'),
    jadwalTable(d, { reservasi: variant.reservasi }),
    thinGap(),
    para([s(`Pemesan telah membaca, mengerti dan menyetujui seluruh ketentuan yang tercantum dalam syarat-syarat dan ketentuan-ketentuan ${variant.label} yang tercantum di belakang halaman ini.`)], { alignment: AlignmentType.JUSTIFIED, spacing: { after: 40 } }),
  ];
  // Date, signatures and the copy legend sit in the page footer, so they always rest at the bottom of the sheet,
  // right above the company address, however long the letter above is.
  const foot = [
    para([s(`Gowa, ${tanggalID(d.tanggal)}`)], { spacing: { before: 40, after: 100 } }),
    new Table({
      width: { size: 9600, type: WidthType.DXA }, columnWidths: [3200, 3200, 3200], layout: TableLayoutType.FIXED, borders: NO_BORDERS,
      rows: [
        new TableRow({ cantSplit: true, children: ['Pemesan', 'Penerima Pesanan', 'Sales'].map((h) => cell([para([s(h)], { alignment: AlignmentType.CENTER, spacing: { after: signSpace } })], { width: { size: 3200, type: WidthType.DXA }, borders: NB })) }),
        new TableRow({ cantSplit: true, children: [d.nama, d.penerima, d.sales].map((n) => cell([para([s(`(${n && n.trim() ? '  ' + n.trim() + '  ' : '____________________'})`)], { alignment: AlignmentType.CENTER, spacing: { after: 0 } })], { width: { size: 3200, type: WidthType.DXA }, borders: NB })) }),
      ],
    }),
    para([s('•  Rangkap 1 : Pemesan, Rangkap 2 : Penerima Pesanan, Rangkap 3 : Sales')], { alignment: AlignmentType.CENTER, spacing: { before: 60, after: 120 } }),
    new Paragraph({ spacing: { before: 0, after: 40 }, border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'BBBBBB' } }, children: [] }),
    ...footerParas(),
  ];
  return { body, foot: new Footer({ children: foot }) };
}

// One .docx holding Rangkap 1 (Pemesan), 2 (Penerima Pesanan), 3 (Sales); each = form page + terms page.
const VARIANTS = {
  konfirmasi: { heading: 'SURAT  KONFIRMASI  UNIT', label: 'Surat Konfirmasi Unit', reservasi: true, terms: () => [T.SURAT_KONFIRMASI, T.ACCOUNT_KONFIRMASI] },
  pemesanan: { heading: 'SURAT  PEMESANAN  UNIT', label: 'Surat Pemesanan Unit', reservasi: false, terms: () => [T.SURAT_PESANAN_UNIT, T.ACCOUNT_PESANAN] },
};

// "Denah Lokasi Unit": its own page at the back of each copy — the site plan with the ordered unit marked.
function denahPage(img, d, rangkap, variant) {
  const W = 640, H = Math.round((W * masterplan.VIEW.h) / masterplan.VIEW.w); // full text width of the page
  const unit = String(d.noUnit || '').trim();
  const onPlan = !!masterplan.lotFor(unit);
  return [
    rangkapBox(rangkap),
    para('', { spacing: { after: 160 } }),
    para([run('DENAH LOKASI UNIT', { bold: true, size: 32 })], { alignment: AlignmentType.CENTER, spacing: { after: 60 } }),
    para([run(`Lampiran ${variant.label}${d.no ? ' No. ' + d.no : ''}`, { size: 20, color: '555555' })], { alignment: AlignmentType.CENTER, spacing: { after: 360 } }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [new ImageRun({ type: 'jpg', data: img, transformation: { width: W, height: H } })] }),
    kv([
      ['Unit yang dipesan', ':', onPlan ? unit : val(unit, '______________')],
      ['Type', ':', d.type ? `${d.type}${UNIT_TYPES[d.type] ? ' (' + UNIT_TYPES[d.type].kamar + ' kamar)' : ''}` : '______________'],
      ['Pemesan', ':', val(d.nama, '______________')],
    ], [2400, 300, 6900], 22),
    para([run(onPlan ? 'Lokasi unit ditandai dengan warna merah pada denah.' : 'Unit belum dipilih saat dokumen dibuat.', { size: 18, color: '555555', italics: true })], { spacing: { before: 160 } }),
  ];
}

async function suratUnit(d, variant) {
  const img = await masterplan.mapImage(d.noUnit);
  return withFont(SK_FONT, () => {
    const [terms, account] = variant.terms();
    const sections = [];
    for (const n of [1, 2, 3]) {
      const page = suratKonfirmasiPage(d, n, variant);
      sections.push({ page: 'A4', margin: 1000, marginY: 470, footer: page.foot, children: page.body });
      sections.push(...unitTerms(terms, account));
      sections.push({ page: 'A4', margin: 1134, footer: true, children: denahPage(img, d, n, variant) });
    }
    return build(sections, SK_FONT, 20);
  });
}

const suratKonfirmasi = (d) => suratUnit(d, VARIANTS.konfirmasi);
const suratPemesanan = (d) => suratUnit(d, VARIANTS.pemesanan);

// ───────────────────── SYARAT & KETENTUAN (numbered) ─────────────────────
const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

// Numbered clauses with lettered sub-clauses, as in the original .doc files.
function termsBlock(spec, account, o = {}) {
  const size = o.size || 20;
  const r = (t, x = {}) => run(t, { size, ...x });
  const just = AlignmentType.JUSTIFIED;
  const gapAfter = o.gap ?? 80;
  const out = [para([r(spec.title, { bold: true, size: o.titleSize || size + 4 })], { alignment: o.titleAlign === 'left' ? AlignmentType.LEFT : AlignmentType.CENTER, spacing: { after: o.titleGap ?? 200 } })];
  const L1 = o.l1 ?? 360, L2 = o.l2 ?? 720, H1 = o.h1 ?? 360, H2 = o.h2 ?? 360, before = o.before ?? 0, subGap = o.subGap ?? gapAfter;
  const rich = (t) => t.split(/(booking fee)/).filter(Boolean).map((x) => r(x, x === 'booking fee' ? { italics: true } : {}));
  const hang = (n, text, left, hanging, extra = {}) => para([r(`${n}\t`), ...rich(text)], { alignment: just, tabStops: [{ type: TabStopType.LEFT, position: left }], indent: { left, hanging }, spacing: { before: extra.sub ? 0 : before, after: extra.sub ? subGap : gapAfter }, keepNext: extra.keepNext });
  spec.items.forEach((raw, i) => {
    const it = typeof raw === 'string' ? { text: raw } : raw;
    out.push(hang(`${i + 1}.`, it.text, L1, H1, { keepNext: !!(it.subs && it.subs.length) }));
    (it.subs || []).forEach((rawSub, j) => {
      const sb = typeof rawSub === 'string' ? { text: rawSub } : rawSub;
      out.push(hang(`${LETTERS[j]}.`, sb.text, L2, H2, { sub: true, keepNext: !!sb.account }));
      if (sb.account) out.push(kv(account.map(([k, v]) => [[r(k)], ':', [r(v)]]), [o.accKey ?? 1300, 300, 4600], size, o.accIndent ?? 1080));
      if (sb.para) out.push(para([r(sb.para)], { alignment: just, indent: { left: L2 }, spacing: { before: o.paraBefore ?? 60, after: subGap } }));
      (sb.dashes || []).forEach((d) => out.push(para([r('- ' + d)], { alignment: just, indent: { left: L2 }, spacing: { after: o.dashGap ?? 40 } })));
    });
    if (it.dashPara) out.push(para([r(it.dashPara)], { alignment: just, indent: { left: L1 }, spacing: { before: o.paraBefore ?? 0, after: gapAfter } }));
  });
  return out;
}
const closingPara = (spec, size = 20, before = 160) => para([run(spec.closing, { size })], { alignment: AlignmentType.JUSTIFIED, spacing: { before } });

// Terms page of a unit document: same typography and two-column layout as the Surat Pesanan template,
// on an A4 page of the letter, closing sentence across the full width.
const TERMS_FMT = { size: 13, titleSize: 19, l1: 180, h1: 180, l2: 360, h2: 180, gap: 0, before: 60, subGap: 0, titleGap: 120, accIndent: 900, accKey: 1100, paraBefore: 30, dashGap: 0 };
const unitTerms = (spec, account) => {
  const geo = { page: 'A4', margin: 720, marginTop: 600, marginBottom: 1009, footer: true };
  return [
    { ...geo, columns: 2, colSpace: 362, children: termsBlock(spec, account, TERMS_FMT) },
    { ...geo, continuous: true, children: [closingPara(spec, 13, 100)] },
  ];
};

// S&K Surat Pesanan: mirrors "Syarat dan Ketentuan SURAT PESANAN REV.doc" — F4 (8.5×14 in), Calibri 6.5 pt,
// margins 0.5 in, two columns with the closing sentence across the full width.
function syaratPesanan() {
  const F4 = [12240, 20160];
  const geo = { size: F4, margin: 720, marginTop: 357, marginBottom: 1009 };
  return withFont(SK_FONT, () => build([
    { ...geo, columns: 2, colSpace: 362, children: termsBlock(T.SURAT_PESANAN, T.ACCOUNT_PESANAN, TERMS_FMT) },
    { ...geo, continuous: true, children: [closingPara(T.SURAT_PESANAN, 13, 100)] },
  ], SK_FONT, 13));
}

function build(sections, font = FONT, size = 22) {
  const doc = new Document({
    creator: 'Sultana Living',
    styles: { default: { document: { run: { font, size } } } },
    sections: sections.map((s) => ({
      properties: {
        type: s.continuous ? SectionType.CONTINUOUS : undefined,
        column: s.columns ? { count: s.columns, space: s.colSpace || 480, equalWidth: true } : undefined,
        page: { size: { width: s.size ? s.size[0] : 11906, height: s.size ? s.size[1] : 16838 }, margin: { top: s.marginTop ?? (s.marginY || s.margin), bottom: s.marginBottom ?? (s.marginY || s.margin), left: s.margin, right: s.margin } },
      },
      footers: s.footer ? { default: s.footer === true ? footer() : s.footer } : undefined,
      children: s.children,
    })),
  });
  return Packer.toBuffer(doc);
}

module.exports = { kwitansi, tandaTerima, suratKonfirmasi, suratPemesanan, syaratPesanan };
