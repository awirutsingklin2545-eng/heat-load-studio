import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newProject, newRoom, syncLinks, fromHlp, toHlp, roomWarnings } from '../src/model.js';

test('walls linked to Outside follow the project outdoor condition', () => {
  const p = newProject('t'); const r = p.buildings[0].floors[0].rooms[0];
  r.walls[0].doors[0] = { count: 1, W: 2, H: 3 };
  syncLinks(p);
  assert.equal(r.walls[0].T, 35); assert.equal(r.walls[0].doors[0].RH, 60);
  p.outdoor.T = 38; p.outdoor.RH = 70; syncLinks(p);
  assert.equal(r.walls[3].T, 38); assert.equal(r.walls[0].doors[0].RH, 70);
});
test('walls linked to a room follow that room; typed door RH is kept', () => {
  const p = newProject('t'); const f = p.buildings[0].floors[0];
  const ante = f.rooms[0]; ante.T = 10; ante.RH = 80;
  const cold = newRoom('Cold'); f.rooms.push(cold);
  cold.walls[1].source = ante.id; cold.walls[1].doors[0] = { count: 1 }; cold.walls[1].doors[1] = { count: 1, RH: 55, rhManual: true };
  syncLinks(p);
  assert.equal(cold.walls[1].T, 10); assert.equal(cold.walls[1].doors[0].RH, 80); assert.equal(cold.walls[1].doors[1].RH, 55);
  ante.T = 12; syncLinks(p); assert.equal(cold.walls[1].T, 12);
  f.rooms.splice(0, 1); syncLinks(p); assert.equal(cold.walls[1].source, null); assert.equal(cold.walls[1].T, 12);
});
test('.hlp round trip and rejection of foreign files', () => {
  const p = newProject('Round trip'); const back = fromHlp(toHlp(p));
  assert.equal(back.name, 'Round trip'); assert.deepEqual(back.outdoor, { T: 35, RH: 60 });
  assert.throws(() => fromHlp('{"hello":1}'), /not a Heat Load Studio project/);
  assert.throws(() => fromHlp('not json'), /not a Heat Load Studio project/);
});
test('make-up air volume without temperature is an error', () => {
  const r = newRoom('x'); Object.assign(r, { T: 2, RH: 85, H: 3, W: 3, L: 3 }); r.makeUp = { CMH: 2000, T: null, RH: null };
  assert.ok(roomWarnings(r, null, {}).some((w) => w.level === 'error' && /Make-up air/.test(w.text)));
  r.makeUp = { CMH: 2, T: 35, RH: 60 };
  assert.ok(roomWarnings(r, null, {}).some((w) => /only 2 CMH/.test(w.text)));
});
