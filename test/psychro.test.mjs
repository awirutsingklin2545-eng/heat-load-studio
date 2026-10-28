// Psychrometrics vs PsychroLib (ASHRAE Fundamentals equations) and PMV vs pythermalcomfort (ISO 7730).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pAtm, stateTRH, stateTWb, pmv, comfortZone, mix } from '../src/engine/psychro.js';

const ref = JSON.parse(readFileSync(new URL('./psychro.ref.json', import.meta.url)));
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

for (const r of ref.psy) {
  test(`state ${r.t} °C ${r.rh} % z=${r.z}`, () => {
    const p = pAtm(r.z);
    near(p, r.P, 1e-6, 'p');
    const s = stateTRH(r.t, r.rh, p);
    near(s.W, r.W, 1e-9, 'W'); near(s.h, r.h, 1e-6, 'h'); near(s.v, r.v, 1e-9, 'v');
    near(s.tdp, r.tdp, 1e-4, 'tdp'); near(s.twb, r.twb, 2e-3, 'twb');
    const back = stateTWb(r.t, s.twb, p); near(back.W, s.W, 1e-6, 'W from twb');
  });
}
test('PMV vs pythermalcomfort (ISO 7730)', () => {
  for (const r of ref.pmv) near(pmv(r.ta, r.ta, 0.1, r.rh, 1.1, r.clo), r.pmv, 0.0051, `pmv ${r.ta}/${r.rh}/${r.clo}`);
});
test('comfort zone spans sensible temperatures', () => {
  const z = comfortZone(0.5);
  assert.ok(z.left.length > 10 && z.right.length > 10);
  const [tl] = z.left[0], [tr] = z.right[0];
  assert.ok(tl > 22 && tl < 26 && tr > 26 && tr < 30, `${tl} ${tr}`);
});
test('mixing conserves mass and enthalpy', () => {
  const a = stateTRH(35, 60), b = stateTRH(24, 50), m = mix(a, 1, b, 3);
  near(m.h, (a.h + 3 * b.h) / 4, 1e-6, 'h'); near(m.W, (a.W + 3 * b.W) / 4, 1e-12, 'W');
});
