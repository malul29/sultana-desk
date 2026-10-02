// Usage: npm run create-user -- <username> "<Nama Lengkap>" <admin|staff>   (password is asked interactively)
const readline = require('readline');
const store = require('../src/store');
const db = require('../src/db');

const [username, name, role = 'staff'] = process.argv.slice(2);
if (!username || !name) { console.error('Pemakaian: npm run create-user -- <username> "<Nama>" <admin|staff>'); process.exit(1); }

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
// Muted prompt so the password is not echoed.
rl._writeToOutput = (s) => { if (rl.muted) return; rl.output.write(s); };
rl.question('Password (min 8 karakter): ', async (pw) => {
  rl.close(); console.log('');
  try {
    await db.migrate();
    await store.createUser({ username, name, password: pw, role }, null);
    console.log(`Pengguna "${username}" (${role}) dibuat.`);
  } catch (e) { console.error('Gagal:', e.message); process.exitCode = 1; }
  await db.close();
});
rl.muted = true;
