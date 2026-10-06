// The 36-unit template and its one-time seeding on a fresh database (own throw-away PostgreSQL).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { UNITS, unmapped } = require('../lib/unit-plan');
const { UNIT_TYPES } = require('../lib/unit-types');

let pg;
before(async () => {
  const EmbeddedPostgres = (await import('embedded-postgres')).default;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sultana-seed-'));
  const port = 54900 + Math.floor(Math.random() * 90);
  pg = new EmbeddedPostgres({ databaseDir: dir, user: 't', password: 't', port, persistent: false, onLog: () => {}, onError: () => {} });
  await pg.initialise(); await pg.start(); await pg.createDatabase('t');
  process.env.DATABASE_URL = `postgres://t:t@localhost:${port}/t`;
  await require('../src/db').migrate();
});
after(async () => { await require('../src/db').close(); await pg?.stop(); });

test('the template is 36 unique units: 7 Deluxe, 23 Executive, 6 Premiere', () => {
  assert.equal(UNITS.length, 36);
  assert.equal(new Set(UNITS.map((u) => u.no_unit.toLowerCase())).size, 36);
  const by = (t) => UNITS.filter((u) => u.type === t).length;
  assert.deepEqual([by('Deluxe'), by('Executive'), by('Premiere')], [7, 23, 6]);
  assert.ok(UNITS.every((u) => UNIT_TYPES[u.type]), 'every type is a known unit type');
  assert.deepEqual(unmapped(), [4, 13, 14, 22, 40], 'the lots that have no unit on the masterplan');
});

test('a fresh database gets the 36 units, all available, once; deleted units stay deleted', async () => {
  const db = require('../src/db'), store = require('../src/store');
  assert.equal(await store.seedDefaultUnits(), 36);
  const rows = (await db.query('SELECT no_unit, type, status, pemesan FROM units ORDER BY id')).rows;
  assert.equal(rows.length, 36);
  assert.ok(rows.every((r) => r.status === 'tersedia' && !r.pemesan));
  assert.equal(await store.seedDefaultUnits(), 0, 'a second start adds nothing');
  await db.query("DELETE FROM units WHERE no_unit = 'D-01'");
  assert.equal(await store.seedDefaultUnits(), 0);
  assert.equal((await db.query("SELECT count(*)::int n FROM units WHERE no_unit = 'D-01'")).rows[0].n, 0, 'an admin deletion is not undone by a restart');
});

test('an installation that already has units is left alone (the marker is still set)', async () => {
  const db = require('../src/db'), store = require('../src/store');
  await db.query("DELETE FROM units; DELETE FROM counters WHERE name = 'seed-units'");
  await db.query("INSERT INTO units (no_unit, type) VALUES ('X-01', 'Deluxe')");
  assert.equal(await store.seedDefaultUnits(), 0);
  assert.equal((await db.query('SELECT count(*)::int n FROM units')).rows[0].n, 1);
  assert.equal((await db.query("SELECT count(*)::int n FROM counters WHERE name = 'seed-units'")).rows[0].n, 1);
});
