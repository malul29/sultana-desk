const { test } = require('node:test');
const assert = require('node:assert/strict');
const mp = require('../lib/masterplan');

test('every lot on the plan is known, lot 40 does not exist', () => {
  const nums = mp.LOTS.map((l) => l.n).sort((a, b) => a - b);
  assert.equal(nums.length, 36);
  assert.ok(!nums.includes(40) && !nums.includes(4) && !nums.includes(13));
  assert.equal(new Set(nums).size, 36);
});

test('unit numbers map to lots', () => {
  assert.equal(mp.lotFor('D-02').n, 2);
  assert.equal(mp.lotFor('e-26').n, 26);
  assert.equal(mp.lotFor('P-10').n, 10);
  assert.equal(mp.lotFor('E-40'), null);
  assert.equal(mp.lotFor(''), null);
});

test('printed map is a JPEG of the cropped plan at 2x', async () => {
  const sharp = require('sharp');
  const img = await mp.mapImage('D-02');
  const meta = await sharp(img).metadata();
  assert.equal(meta.format, 'jpeg');
  assert.equal(meta.width, mp.VIEW.w * 2);
  assert.equal(meta.height, mp.VIEW.h * 2);
  assert.ok(img.length < 400 * 1024);
});
