// Parity tests: engine vs. Load Calculation V1.25 recalculated in LibreOffice.
// Needs local, private inputs (not in this public repo):
//   HLS_MASTER=/path/to/Load_Calculation_V1.25.xlsx   and   test/golden.json (from tools/golden.py)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import JSZip from 'jszip';
import { calcRoomV125 } from '../src/engine/v125.js';
import { extractV125 } from '../src/data/fromMaster.js';

const master = process.env.HLS_MASTER;
const goldenPath = new URL('./golden.json', import.meta.url);
const ready = master && existsSync(master) && existsSync(goldenPath);
const close = (a, b) => Math.abs((a ?? 0) - (b ?? 0)) <= 1e-9 + 1e-9 * Math.abs(b ?? 0);

function mapResult(r) {
  const s = r.transmission.surfaces, d = r.infiltration.doors, p = r.product.items, e = r.equipment, t = r.totals;
  const pq = (i) => p[i]?.q ?? 0;
  return { C69: s[0].q, C70: s[1].q, C71: s[2].q, C72: s[3].q, C73: s[4].q, C74: s[5].q, C75: r.transmission.total,
    F69: d[0].q, F70: d[1].q, F71: d[2].q, F72: d[3].q, F73: d[4].q, F74: d[5].q, F75: d[6].q, F76: d[7].q, F77: r.infiltration.makeUp.q, F78: r.infiltration.total,
    I69: pq(0), I70: pq(1), I71: pq(2), I72: pq(3), I73: pq(4), I74: r.product.total,
    L69: e.lighting, L70: e.workers, L71: e.fan, L72: e.motors, L73: e.total, L75: t.total, L77: t.afterSF, L78: t.runHours, L79: t.required, G66: e.forkliftFactor };
}

test('golden parity vs V1.25', { skip: ready ? false : 'set HLS_MASTER and create test/golden.json' }, async (t) => {
  const data = await extractV125(JSZip, readFileSync(master));
  const G = JSON.parse(readFileSync(goldenPath));
  for (const [i, c] of G.cases.entries()) {
    await t.test(`case ${c.id} ${c.roomType} T=${c.T}`, () => {
      const got = mapResult(calcRoomV125(c, data)), exp = G.expected[i];
      const bad = Object.keys(exp).filter((k) => !close(got[k], exp[k])).map((k) => `${k}: app ${got[k]} vs xlsx ${exp[k]}`);
      assert.deepEqual(bad, []);
    });
  }
});
