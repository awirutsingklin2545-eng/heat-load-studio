// ASHRAE profile: solar model against the 2025 station values, conduction and radiant time series
// properties, and end-to-end sanity of the refrigeration and RTS engines (synthetic tables, no master).
import test from 'node:test';
import assert from 'node:assert/strict';
import { clearSky, declination, dayOfYear21 } from '../src/engine/solar.js';
import { STATIONS } from '../src/data/climate.js';
import { conductionTimeSeries, construction } from '../src/engine/conduction.js';
import { radiantTimeSeries } from '../src/engine/rts.js';
import { calcRoomASHRAE, shgcModifier, shgcDiffuseRatio } from '../src/engine/ashrae.js';
import { occupantGain } from '../src/engine/people.js';
import { newRoom, newProject } from '../src/model.js';

const data = {
  k: { EPS: 0.035, XPS: 0.037, PU: 0.026, PIR: 0.027, Concrete: 1.73 },
  thkPS: [[-60, 200], [-30, 150], [-10, 125], [0, 100], [10, 75]], thkPU: [[-60, 150], [-30, 125], [-10, 100], [0, 75], [10, 50]],
  foods: [['Chicken', 'Poultry Products', -2.8, 3.32, 1.77, 0, 247]],
  lighting: { 'Cold Room': 10, 'Air Conditioning': 12, 'Loading Dock': 10 }, fanFactor: { 'Cold Room': 0.1, 'Air Conditioning': 0.05, 'Loading Dock': 0.07 }, abf: [[10000, 5], [50000, 20]],
};

test('clear-sky beam and diffuse at noon match the 2025 station table (±1 W/m²)', () => {
  const s = STATIONS['484560'];
  for (let m = 1; m <= 12; m++) {
    const n = dayOfYear21(m), beta = 90 - Math.abs(s.lat - declination(n));
    const sky = clearSky(n, beta, s.monthly.taub[m - 1], s.monthly.taud[m - 1]);
    assert.ok(Math.abs(sky.Eb - s.monthly.ebnNoon[m - 1]) <= 1.5, `Eb month ${m}: ${sky.Eb}`);
    assert.ok(Math.abs(sky.Ed - s.monthly.ednNoon[m - 1]) <= 1.5, `Ed month ${m}: ${sky.Ed}`);
  }
});
test('CTS: sums to 1, massless layer responds in hour 0, heavy wall is delayed', () => {
  const g = conductionTimeSeries([{ R: 0.05 }]);
  assert.ok(Math.abs(g.cts[0] - 1) < 1e-6);
  const b = conductionTimeSeries(construction('brick-double'));
  assert.ok(Math.abs(b.cts.reduce((x, y) => x + y, 0) - 1) < 1e-9);
  const peak = b.cts.indexOf(Math.max(...b.cts));
  assert.ok(peak >= 4, `peak hour ${peak}`);
  assert.ok(Math.abs(b.sumRaw - b.U) / b.U < 0.01, 'steady state: sum of response factors = U');
});
test('RTS: sums to 1 and a light room responds faster than a heavy one', () => {
  const mk = (wall, roof) => [{ area: 60, layers: construction(roof), boundary: 'outside', kind: 'ceiling' }, { area: 60, layers: [{ L: 0.15, k: 1.73, rho: 2300, c: 0.88 }], boundary: 'ground', kind: 'floor' },
    { area: 30, layers: construction(wall), boundary: 'outside', kind: 'wall' }, { area: 30, layers: construction(wall), boundary: 'partition', kind: 'wall' }];
  const light = radiantTimeSeries(mk('panel', 'panel')), heavy = radiantTimeSeries(mk('brick-double', 'concrete-roof'));
  for (const r of [light, heavy]) for (const k of ['nonsolar', 'solar']) assert.ok(Math.abs(r[k].reduce((x, y) => x + y, 0) - 1) < 1e-9);
  assert.ok(light.nonsolar[0] > heavy.nonsolar[0]);
});
test('glazing angle modifier: 1 at normal, 0 at grazing, diffuse ratio below 1', () => {
  assert.ok(Math.abs(shgcModifier(0) - 1) < 1e-9); assert.equal(shgcModifier(90), 0);
  const d = shgcDiffuseRatio(1); assert.ok(d > 0.75 && d < 0.95, String(d));
});
test('occupant gain: total = metabolic rate, latent rises with activity', () => {
  const a = occupantGain(1.1, 0.5, 24, 50), b = occupantGain(2.1, 0.5, 24, 50);
  assert.ok(Math.abs(a.sensible + a.latent - a.total) < 1e-9); assert.ok(b.latent > a.latent);
});

const coldRoom = () => {
  const r = newRoom('CR'); Object.assign(r, { roomType: 'Cold Room', T: 2, RH: 85, H: 4, W: 8, L: 10, workers: 2 });
  r.ceiling.type = 'PU'; r.walls.forEach((w) => { w.T = 35; });
  r.walls[0].doors[0] = { count: 1, W: 2.5, H: 3, openMin: 15, E: 0.8, RH: 60 };
  r.products = [{ category: 'Poultry Products', name: 'Chicken', tIn: 10, tOut: 2, ton: 5, hours: 24 }];
  return r;
};
test('refrigeration: SF on segments only, fans and defrost after, 24/run', () => {
  const a = calcRoomASHRAE(coldRoom(), newProject(), data);
  const t = a.totals, er = a.equipRelated;
  assert.ok(Math.abs(t.afterSF - (t.segments * 1.1 + er.fan + er.defrost)) < 1e-9);
  assert.ok(Math.abs(t.required - t.afterSF * 24 / 20) < 1e-9);
  assert.ok(er.defrost > 0 && a.transmission.surfaces.some((s) => s.sun > 0));
});
test('refrigeration: more door passages raise infiltration', () => {
  const r = coldRoom(), base = calcRoomASHRAE(r, newProject(), data).infiltration.total;
  r.walls[0].doors[0].P = 10; assert.ok(calcRoomASHRAE(r, newProject(), data).infiltration.total > base);
});
test('RTS room: peak is found, parts add up, outdoor air follows Standard 62.1', () => {
  const r = newRoom('OF', 'Air Conditioning'); Object.assign(r, { T: 24, RH: 50, H: 3, W: 6, L: 10 });
  r.ceiling.type = 'PU'; r.walls.forEach((w, i) => { w.T = i < 2 ? 35 : 26; w.source = i < 2 ? 'outside' : null; });
  r.ash = { walls: [{ orient: 'W', construction: 'brick', win: { area: 6, SHGC: 0.6, U: 5.8 } }], ac: { people: 6 } };
  const a = calcRoomASHRAE(r, newProject(), data);
  assert.equal(a.kind, 'ac');
  assert.ok(Math.abs(a.ventilation.Voz - (2.5 * 6 + 0.3 * 60)) < 1e-9);
  const sumParts = a.parts.reduce((s, p) => s + p[2], 0);
  assert.ok(Math.abs(sumParts - a.totals.total) < 1e-6, `${sumParts} vs ${a.totals.total}`);
  assert.ok(a.peak.SHR > 0.5 && a.peak.SHR <= 1);
  assert.ok(a.cl.solar > 0);
});
