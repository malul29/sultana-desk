const { test } = require('node:test');
const assert = require('node:assert/strict');
const { UNIT_TYPES, formatLuas, luasTanah, luasBangunan } = require('../lib/unit-types');

test('unit type specs are as agreed', () => {
  assert.deepEqual(UNIT_TYPES.Premiere, { kamar: 10, lb: '145', lt: '7x11' });
  assert.deepEqual(UNIT_TYPES.Executive, { kamar: 5, lb: '82', lt: '6,5x11' });
  assert.deepEqual(UNIT_TYPES.Deluxe, { kamar: 8, lb: '129', lt: '6,5x11' });
});

test('formatLuas adds m² and works out width x length', () => {
  assert.equal(formatLuas('129'), '129 m²');
  assert.equal(formatLuas('7x11'), '77 m²');
  assert.equal(formatLuas('6,5x11'), '71,5 m²');
  assert.equal(formatLuas('6,5 X 11'), '71,5 m²');
  assert.equal(formatLuas('90 m2'), '90 m²');
  assert.equal(formatLuas('90m²'), '90 m²');
  assert.equal(formatLuas(''), '______________ m²');
});

test('typed size wins, otherwise the type default', () => {
  assert.equal(luasTanah({ type: 'Premiere' }), '77');
  assert.equal(luasTanah({ type: 'Deluxe' }), '71,5');
  assert.equal(luasBangunan({ type: 'Deluxe' }), '129');
  assert.equal(luasBangunan({ type: 'Deluxe', luasBangunan: '130' }), '130');
  assert.equal(luasTanah({}), '');
});
