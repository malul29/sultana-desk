// The unit stock every installation starts with: 36 units, matching the masterplan (no lot 40).
// Used by the automatic first-start seeding (src/store.js) and by `npm run seed-units`.
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const PLAN = {
  Deluxe: { prefix: 'D', nums: [1, 2, 3, 5, 6, 7, 8] },
  Executive: { prefix: 'E', nums: [11, 12, 15, 16, 17, 18, 19, 20, ...range(26, 39), 41] },
  Premiere: { prefix: 'P', nums: [21, 9, 10, 23, 24, 25] },
};
const pad = (n) => String(n).padStart(2, '0');
// [{ no_unit: 'D-01', type: 'Deluxe' }, …] in type, then number order
const UNITS = Object.entries(PLAN).flatMap(([type, { prefix, nums }]) => [...nums].sort((a, b) => a - b).map((n) => ({ no_unit: `${prefix}-${pad(n)}`, type })));
const unmapped = () => { const used = new Set(Object.values(PLAN).flatMap((p) => p.nums)); return range(1, 41).filter((n) => !used.has(n)); };

module.exports = { UNITS, unmapped };
