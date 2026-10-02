const { Router } = require('express');
const auth = require('../auth');
const store = require('../store');
const numbering = require('../numbering');
const docs = require('../../lib/docs');
const pdf = require('../../lib/pdf');
const db = require('../db');
const { UNIT_TYPES } = require('../../lib/unit-types');
const masterplan = require('../../lib/masterplan');

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const safe = (s) => String(s || '').replace(/[^\w\-]+/g, '_').replace(/^_+|_+$/g, '');

// jenis → [renderer, base file name (no extension)]
const TYPES = {
  kwitansi: [docs.kwitansi, (d) => `Kwitansi_${safe(d.no)}`],
  'tanda-terima': [docs.tandaTerima, (d) => `Tanda_Terima_${safe(d.no)}_${safe(d.kepada)}`],
  'surat-konfirmasi': [docs.suratKonfirmasi, (d) => `SKU_${safe(d.no)}_${safe(d.nama)}`],
  'surat-pemesanan': [docs.suratPemesanan, (d) => `SPU_${safe(d.no)}_${safe(d.nama)}`],
};

const r = Router();
r.use(auth.requireAuth);

// inline = open in the browser's PDF viewer (ready to print); otherwise save as a file.
function sendFile(res, buffer, filename, type, inline) {
  res.set({
    'Content-Type': type,
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${filename}"`,
    'Cache-Control': 'private, no-store',
  });
  res.send(buffer);
}

const findDoc = async (id) => {
  const row = /^\d+$/.test(id) ? await store.getDocument(id) : null;
  if (!row || !TYPES[row.jenis]) throw new auth.HttpError(404, 'Dokumen tidak ditemukan.');
  return row;
};

// PDF of a stored document: the archived copy if we have it, otherwise render + archive now.
async function pdfOf(row) {
  const kept = await store.getPdf(row.id);
  if (kept) return kept;
  const out = await pdf.docxToPdf(await TYPES[row.jenis][0](row.data));
  await store.savePdf(row.id, out);
  return out;
}

r.get('/unit-types', (_req, res) => res.json(UNIT_TYPES));
r.get('/masterplan', (_req, res) => res.json({ lots: masterplan.LOTS, view: masterplan.VIEW, legend: masterplan.LEGEND }));
r.get('/next-number', async (req, res) => res.json({ no: await numbering.peek(db, req.query.tanggal) }));

// Fixed-text terms document: not numbered, not stored. Rendered once, then served from memory.
let termsPdf = null;
r.get('/syarat-pesanan.pdf', async (req, res) => {
  termsPdf ||= await pdf.docxToPdf(await docs.syaratPesanan());
  sendFile(res, termsPdf, 'Syarat_dan_Ketentuan_Surat_Pesanan.pdf', 'application/pdf', !req.query.download);
});

// Create a numbered document. Returns where to fetch its PDF; the PDF itself is made right
// after the database commit so a slow conversion never holds the numbering lock.
for (const [jenis, [render, name]] of Object.entries(TYPES)) {
  r.post('/' + jenis, async (req, res) => {
    const { doc, id } = await store.createDocument(jenis, req.body, req.user, render);
    let pdfReady = true;
    try { await pdfOf({ id, jenis, data: doc }); }
    catch (e) { pdfReady = false; console.error(`[pdf] dokumen ${doc.no}:`, e.message); }
    res.json({ id, no: doc.no, file: name(doc) + '.pdf', pdfReady, pdf: `/api/documents/${id}/pdf` });
  });
}

r.get('/documents', async (req, res) => res.json(await store.listDocuments({ q: String(req.query.q || ''), jenis: String(req.query.jenis || '') })));

// Same number, same content, nothing new is reserved.
r.get('/documents/:id/pdf', async (req, res) => {
  const row = await findDoc(req.params.id);
  sendFile(res, await pdfOf(row), TYPES[row.jenis][1](row.data) + '.pdf', 'application/pdf', !req.query.download);
});
r.get('/documents/:id/download', async (req, res) => {
  const row = await findDoc(req.params.id);
  sendFile(res, await TYPES[row.jenis][0](row.data), TYPES[row.jenis][1](row.data) + '.docx', DOCX, false);
});

module.exports = r;
