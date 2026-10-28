// toNum lives in fields.js which imports preact; test a copy of the rule via dynamic import with an import map stub
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../src/ui/fields.js', import.meta.url), 'utf8');
const body = src.slice(src.indexOf('export function toNum'), src.indexOf('\n}\n', src.indexOf('export function toNum')) + 2).replace('export ', '');
const toNum = new Function(`${body}; return toNum;`)();
test('number entry: thousands separators and decimal comma', () => {
  assert.equal(toNum('2,000'), 2000);
  assert.equal(toNum('1,250.5'), 1250.5);
  assert.equal(toNum('12,500,000'), 12500000);
  assert.equal(toNum('1,5'), 1.5);
  assert.equal(toNum('-25'), -25);
  assert.equal(toNum(' 3.0 '), 3);
  assert.equal(toNum(''), null);
  assert.equal(toNum('abc'), undefined);
  assert.equal(toNum('1,25,0'), undefined);
});
