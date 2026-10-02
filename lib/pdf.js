// .docx -> .pdf with LibreOffice (headless). The Word layout stays the single source of truth;
// the PDF is just a faithful rendering of it, ready to print.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const CANDIDATES = [
  process.env.SOFFICE_PATH,
  '/Applications/LibreOffice.app/Contents/MacOS/soffice', // macOS (development)
  '/usr/bin/soffice', '/usr/bin/libreoffice',              // Linux / Docker
  '/usr/lib/libreoffice/program/soffice',
].filter(Boolean);

let binary;
function sofficePath() {
  if (binary !== undefined) return binary;
  binary = CANDIDATES.find((p) => { try { fs.accessSync(p, fs.constants.X_OK); return true; } catch { return false; } }) || null;
  return binary;
}
const available = () => !!sofficePath();

// LibreOffice cannot run two conversions on one user profile at once, so we keep a
// small pool of profiles ("slots") and queue work onto them.
const SLOTS = Math.max(1, Number(process.env.PDF_WORKERS) || 2);
const free = Array.from({ length: SLOTS }, (_, i) => i);
const waiting = [];
const acquire = () => (free.length ? Promise.resolve(free.pop()) : new Promise((r) => waiting.push(r)));
const release = (slot) => (waiting.length ? waiting.shift()(slot) : free.push(slot));

function run(bin, args, timeout) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout }, (err, stdout, stderr) => (err ? reject(new Error(`LibreOffice gagal: ${err.message}${stderr ? ' — ' + String(stderr).trim() : ''}`)) : resolve(stdout)));
  });
}

async function docxToPdf(docx) {
  const bin = sofficePath();
  if (!bin) throw Object.assign(new Error('Konversi PDF belum tersedia: LibreOffice tidak ditemukan di server.'), { status: 503 });
  const slot = await acquire();
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'sultana-pdf-'));
  try {
    const profile = path.join(os.tmpdir(), `sultana-lo-profile-${slot}`);
    const src = path.join(work, 'doc.docx');
    fs.writeFileSync(src, docx);
    await run(bin, [
      `-env:UserInstallation=file://${profile}`,
      '--headless', '--norestore', '--nologo', '--nolockcheck', '--nodefault',
      '--convert-to', 'pdf:writer_pdf_Export', '--outdir', work, src,
    ], 120000);
    const out = path.join(work, 'doc.pdf');
    if (!fs.existsSync(out)) throw new Error('LibreOffice tidak menghasilkan PDF.');
    return fs.readFileSync(out);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
    release(slot);
  }
}

module.exports = { docxToPdf, available, sofficePath };
