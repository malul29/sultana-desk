// Usage: npm run reset-password -- <username>     (the new password is asked interactively)
// Sets a new password for an existing user without needing the web UI; the user's sessions are ended.
const readline = require('readline');
const store = require('../src/store');
const db = require('../src/db');

const username = String(process.argv[2] || '').trim();
if (!username) { console.error('Pemakaian: npm run reset-password -- <username>'); process.exit(1); }

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
// Muted prompt so the password is not echoed.
rl._writeToOutput = (s) => { if (rl.muted) return; rl.output.write(s); };
const ask = (q) => new Promise((resolve) => { process.stdout.write(q); rl.muted = true; rl.question('', (a) => { rl.muted = false; process.stdout.write('\n'); resolve(a); }); });

(async () => {
  try {
    await db.migrate();
    const user = (await store.listUsers()).find((u) => u.username.toLowerCase() === username.toLowerCase());
    if (!user) throw new Error(`Pengguna "${username}" tidak ditemukan. Yang ada: ${(await store.listUsers()).map((u) => u.username).join(', ') || '(kosong)'}`);
    const pw = await ask('Password baru (min 8 karakter): ');
    const again = await ask('Ulangi password baru: ');
    if (pw !== again) throw new Error('Kedua password tidak sama. Tidak ada yang diubah.');
    await store.updateUser(user.id, { password: pw, active: true }, { id: null });
    console.log(`Password "${user.username}" diganti dan akun diaktifkan. Login memakai username: ${user.username}`);
  } catch (e) { console.error('Gagal:', e.message); process.exitCode = 1; }
  rl.close();
  await db.close();
})();
