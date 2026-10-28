// Self-contained checks that run without company files (CI-safe).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sheetNames, setInputValue, stripCachedValues } from '../src/export/excel.js';

test('sheet names: illegal chars, 31-char limit, duplicates, reserved', () => {
  const n = sheetNames(['Cold/Room:A', 'x'.repeat(40), 'Cold-Room-A', 'for copy', '']);
  assert.equal(n[0], 'Cold-Room-A');
  assert.equal(n[1].length, 31);
  assert.equal(n[2], 'Cold-Room-A (2)');
  assert.equal(n[3], 'for copy (2)');
  assert.equal(n[4], 'Room 5');
});
test('input cells never overwrite formulas (except dropdown defaults)', () => {
  const xml = '<sheetData><row r="9"><c r="J9" s="1"/><c r="L9"><f>1+1</f><v>2</v></c></row></sheetData>';
  assert.match(setInputValue(xml, 'J9', 2), /<c r="J9" s="1"><v>2<\/v><\/c>/);
  assert.throws(() => setInputValue(xml, 'L9', 5), /formula/);
});
test('inserting a missing cell keeps column order', () => {
  const xml = '<sheetData><row r="5"><c r="A5"/><c r="M5"/></row></sheetData>';
  assert.match(setInputValue(xml, 'D5', 'x'), /<c r="A5"\/><c r="D5" t="inlineStr">.*<c r="M5"\/>/);
});
test('stripCachedValues removes every formula result', () => {
  const xml = '<c r="A1"><f>1</f><v>1</v></c><c r="A2" t="str"><f t="shared" si="0"/><v>x</v></c><c r="A3"><v>7</v></c>';
  assert.equal(stripCachedValues(xml), '<c r="A1"><f>1</f></c><c r="A2"><f t="shared" si="0"/></c><c r="A3"><v>7</v></c>');
});
