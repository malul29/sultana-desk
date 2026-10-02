const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Footer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun, AlignmentType,
  WidthType, BorderStyle, TableLayoutType, HeightRule, TabStopType, PageBreak, VerticalAlign,
} = require('docx');
const { terbilang, rupiah, tanggalID } = require('./terbilang');
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
function kv(rows, widths, size = 22) {
  const r = (t, o = {}) => run(t, { size, ...o });
  const toKids = (c) => (c === '' || c == null ? [] : Array.isArray(c) ? c : [r(c)]);
  return new Table({
    width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA }, columnWidths: widths, layout: TableLayoutType.FIXED, borders: NO_BORDERS,
    rows: rows.map((row) => new TableRow({
      cantSplit: true,
      children: widths.map((w, i) => new TableCell({
        width: { size: w, type: WidthType.DXA }, borders: NB, margins: { top: 20, bottom: 20, left: 40, right: 40 },
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
const LOGO_MARK = fs.readFileSync(path.join(__dirname, '..', 'assets', 'logo-mark.png'));
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
function jadwalTable(d, { reservasi = true } = {}) {
  const head = ['Keterangan', 'Tanggal Jatuh Tempo', 'Jumlah (Rp)'];
  const rows = [
    ...(reservasi ? [['Reservasi', d.jadwal?.reservasi]] : []),
    ['Booking Fee', d.jadwal?.booking],
    [`Uang Muka (${d.jadwal?.dpKali || '…'} Kali)`, d.jadwal?.dp],
    ['Pelunasan KPR', d.jadwal?.kpr],
  ];
  const widths = [3600, 3400, 2600];
  const mk = (t, i, o = {}) => cell([para([run(t, { size: 20, ...o })], { spacing: { after: 0 }, alignment: i === 0 ? AlignmentType.LEFT : AlignmentType.CENTER })], { width: { size: widths[i], type: WidthType.DXA } });
  return new Table({
    width: { size: 9600, type: WidthType.DXA }, columnWidths: widths, layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({ tableHeader: true, children: head.map((h, i) => mk(h, i, { bold: true })) }),
      ...rows.map(([k, r]) => new TableRow({ children: [mk(k, 0), mk(tanggalID(r?.tanggal), 1), mk(rupiah(r?.jumlah), 2)] })),
    ],
  });
}

const { UNIT_TYPES, formatLuas, luasTanah, luasBangunan } = require('./unit-types');
const SK_FONT = 'Calibri'; // Surat Konfirmasi Unit: body Calibri 10pt, judul 16pt
const FOOTER_TEXT = 'PT. Balla Sultana Samata  •  Jl. Paraikatte, Romang Polong, Kec. Somba Opu, Kab. Gowa, Sulawesi Selatan';
const RULE = { style: BorderStyle.SINGLE, size: 8, color: '444444' };

// Letterhead: logo flush left, title centred on the page, document number under it.
function kop(d, heading, titleSize = 32) {
  const SIDE = 1900;
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
    new Paragraph({ spacing: { before: 80, after: 160 }, border: { bottom: RULE }, children: [] }),
  ];
}

const footer = () => new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [run(FOOTER_TEXT, { size: 14, color: '666666' })] })] });

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
  const hbar = (t) => para([s(t, { bold: true, underline: {} })], { spacing: { before: 100, after: 40 } });
  return [
    para([run(`Rangkap ${rangkap}`, { bold: true, size: 20 })], { alignment: AlignmentType.RIGHT, spacing: { after: 60 } }),
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
      ['Sumber Informasi', ':', val(d.sumber)],
    ], [2200, 300, 7100], 20),
    para([s('-selanjutnya disebut sebagai '), s('PEMESAN', { bold: true }), s('.')], { spacing: { before: 40, after: 80 } }),
    para([s('Dengan ini sepakat dan setuju untuk memesan :')], { spacing: { after: 40 } }),
    kv([
      ['Unit', ':', 'Type', d.type ? `${d.type}    (${kamar}) Kamar` : '____________________    (__) Kamar'],
      ['', '', 'No Unit', val(d.noUnit, '______________')],
      ['', '', 'Luas Tanah', formatLuas(luasTanah(d))],
      ['', '', 'Luas Bangunan', formatLuas(luasBangunan(d))],
    ], W, 20),
    gap(100),
    kv([
      ['Harga Pengikatan', ':', d.harga ? `Rp. ${rupiah(d.harga)}` + (terbilang(d.harga) ? `  (${terbilang(d.harga)})` : '') : 'Rp. ____________________________'],
    ], [2200, 300, 7100], 20),
    gap(100),
    kv(included.map((r, i) => [i === 0 ? 'Harga Termasuk' : '', i === 0 ? ':' : '', r[0], r[1]]), [2200, 300, 3900, 3200], 20),
    kv(included2.map((t) => ['', '', t]), [2200, 300, 7100], 20),
    hbar('CARA PEMBAYARAN'),
    kv([
      [`${box(cara.tipe === 'tunai-keras')} Tunai Keras`, '=', 'dilunasi paling lambat 1 bulan dari Tanda Jadi / Booking Fee'],
      [`${box(cara.tipe === 'tunai-bertahap')} Tunai Bertahap`, '=', val(cara.tipe === 'tunai-bertahap' ? cara.ket : '', '.............................')],
      [`${box(cara.tipe === 'kpr')} KPR`, '=', val(cara.tipe === 'kpr' ? cara.ket : '', '.............................')],
    ], [2200, 300, 7100], 20),
    hbar('JADWAL PEMBAYARAN'),
    jadwalTable(d, { reservasi: variant.reservasi }),
    para('', { spacing: { after: 40 } }),
    para([s(`Pemesan telah membaca, mengerti dan menyetujui seluruh ketentuan yang tercantum dalam syarat-syarat dan ketentuan-ketentuan ${variant.label} yang tercantum di belakang halaman ini.`)], { alignment: AlignmentType.JUSTIFIED, spacing: { after: 40 } }),
    para([s(`Gowa, ${tanggalID(d.tanggal)}`)], { spacing: { after: 40 } }),
    new Table({
      width: { size: 9600, type: WidthType.DXA }, columnWidths: [3200, 3200, 3200], layout: TableLayoutType.FIXED, borders: NO_BORDERS,
      rows: [
        new TableRow({ cantSplit: true, children: ['Pemesan', 'Penerima Pesanan', 'Sales'].map((h) => cell([para([s(h)], { alignment: AlignmentType.CENTER, spacing: { after: 400 } })], { width: { size: 3200, type: WidthType.DXA }, borders: NB })) }),
        new TableRow({ cantSplit: true, children: [d.nama, d.penerima, d.sales].map((n) => cell([para([s(`(${n && n.trim() ? '  ' + n.trim() + '  ' : '____________________'})`)], { alignment: AlignmentType.CENTER, spacing: { after: 0 } })], { width: { size: 3200, type: WidthType.DXA }, borders: NB })) }),
      ],
    }),
    para([s('•  Rangkap 1 : Pemesan, Rangkap 2 : Penerima Pesanan, Rangkap 3 : Sales')], {
      alignment: AlignmentType.CENTER,
      spacing: { before: 120, after: 0 },
    }),
  ];
}

// One .docx holding Rangkap 1 (Pemesan), 2 (Penerima Pesanan), 3 (Sales); each = form page + terms page.
const VARIANTS = {
  konfirmasi: { heading: 'SURAT  KONFIRMASI  UNIT', label: 'Surat Konfirmasi Unit', reservasi: true, terms: () => [T.SURAT_KONFIRMASI, T.ACCOUNT_KONFIRMASI] },
  pemesanan: { heading: 'SURAT  PEMESANAN  UNIT', label: 'Surat Pemesanan Unit', reservasi: false, terms: () => [T.SURAT_PESANAN_UNIT, T.ACCOUNT_KONFIRMASI] },
};

// "Denah Lokasi Unit": its own page at the back of each copy — the site plan with the ordered unit marked.
function denahPage(img, d, rangkap, variant) {
  const W = 640, H = Math.round((W * masterplan.VIEW.h) / masterplan.VIEW.w); // full text width of the page
  const unit = String(d.noUnit || '').trim();
  const onPlan = !!masterplan.lotFor(unit);
  return [
    para([run(`Rangkap ${rangkap}`, { bold: true, size: 20 })], { alignment: AlignmentType.RIGHT, spacing: { after: 200 } }),
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
      sections.push({ page: 'A4', margin: 1000, marginY: 700, footer: true, children: suratKonfirmasiPage(d, n, variant) });
      sections.push({ page: 'A4', margin: 1134, footer: true, children: termsBlock(terms, account, 20, 32) });
      sections.push({ page: 'A4', margin: 1134, footer: true, children: denahPage(img, d, n, variant) });
    }
    return build(sections, SK_FONT, 20);
  });
}

const suratKonfirmasi = (d) => suratUnit(d, VARIANTS.konfirmasi);
const suratPemesanan = (d) => suratUnit(d, VARIANTS.pemesanan);

// ───────────────────── SYARAT & KETENTUAN (numbered) ─────────────────────
function termsBlock(spec, account, size = 20, titleSize = size + 4) {
  const r = (t, o = {}) => run(t, { size, ...o });
  const out = [para([r(spec.title, { bold: true, size: titleSize })], { alignment: AlignmentType.CENTER, spacing: { after: 160 } })];
  let n = 0;
  for (const raw of spec.items) {
    const it = typeof raw === 'string' ? { text: raw } : raw;
    if (it.heading) { out.push(para([r(it.heading, { bold: true })], { spacing: { before: 80, after: 40 }, keepNext: true })); continue; }
    const text = it.text;
    n += 1;
    out.push(para([r(`${n}.\t${text}`)], { alignment: AlignmentType.JUSTIFIED, tabStops: [{ type: TabStopType.LEFT, position: 400 }], indent: { left: 400, hanging: 400 } }));
    if (it.account) {
      out.push(kv(account.map(([k, v]) => [[r(k, { bold: true })], ':', [r(v, { bold: true })]]), [1300, 300, 6000], size));
    }
    (it.sub || []).forEach((sb) => out.push(para([r(`-\t${sb}`)], { alignment: AlignmentType.JUSTIFIED, tabStops: [{ type: TabStopType.LEFT, position: 800 }], indent: { left: 800, hanging: 400 } })));
  }
  out.push(para([r(spec.closing)], { alignment: AlignmentType.JUSTIFIED, spacing: { before: 160 } }));
  return out;
}

function syaratPesanan() {
  return build([{ page: 'A4', margin: 1134, children: termsBlock(T.SURAT_PESANAN, T.ACCOUNT_PESANAN, 20) }]);
}

function build(sections, font = FONT, size = 22) {
  const doc = new Document({
    creator: 'Sultana Living',
    styles: { default: { document: { run: { font, size } } } },
    sections: sections.map((s) => ({
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: s.marginY || s.margin, bottom: s.marginY || s.margin, left: s.margin, right: s.margin } } },
      footers: s.footer ? { default: footer() } : undefined,
      children: s.children,
    })),
  });
  return Packer.toBuffer(doc);
}

module.exports = { kwitansi, tandaTerima, suratKonfirmasi, suratPemesanan, syaratPesanan };
