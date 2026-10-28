// Built-in tables must equal what the master file gives, and give the golden result on their own.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import JSZip from 'jszip';
import { BUILTIN } from '../src/data/tables.js';
import { extractV125 } from '../src/data/fromMaster.js';
import { calcRoomV125 } from '../src/engine/v125.js';
import { newRoom } from '../src/model.js';

test('golden case with built-in tables = 30.64 kW', () => {
  const g = newRoom('Golden'); Object.assign(g, { roomType: 'Cold Room', T: 2, RH: 85, H: 4, W: 8, L: 10, workers: 2 });
  g.ceiling.type = 'PU'; g.walls = [0, 1, 2, 3].map(() => ({ T: 35, doors: [{}, {}] })); g.walls[0].doors[0] = { RH: 60, count: 1, E: 0.8, openMin: 15, W: 2.5, H: 3 };
  g.products = [{ category: 'Poultry Products', name: 'Chicken', tIn: 10, tOut: 2, ton: 5, hours: 24 }]; g.makeUp = { T: 35, RH: 60, CMH: 0 };
  assert.ok(Math.abs(calcRoomV125(g, BUILTIN).totals.required - 30.6400317068338) < 1e-6);
});
const m = process.env.HLS_MASTER;
test('built-in tables equal the master file', { skip: m && existsSync(m) ? false : 'set HLS_MASTER' }, async () => {
  assert.deepEqual(BUILTIN, await extractV125(JSZip, readFileSync(m)));
});
