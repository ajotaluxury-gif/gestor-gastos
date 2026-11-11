// Tests de las funciones puras. Uso: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMonto, formatNumber } from '../js/money.js';
import { addMonths, fromDisplay, toDisplay, isValidISODate, monthBounds } from '../js/dates.js';

test('parseMonto acepta formatos argentinos', () => {
  const ok = (s, v) => assert.deepEqual(parseMonto(s), { ok: true, value: v }, s);
  ok('1234,56', 123456);
  ok('1.234,56', 123456);
  ok('1.234.567,8', 123456780);
  ok('1234', 123400);
  ok('1.234', 123400);   // punto como miles
  ok('12.5', 1250);      // un solo punto con 1-2 decimales → decimal
  ok('0,01', 1);
  ok('$ 1.234,56', 123456);
  ok(' 15 ', 1500);
  ok('007', 700);
});

test('parseMonto rechaza basura', () => {
  for (const s of ['', '   ', 'abc', '1,2,3', '12,345', '1.23.4', '-5', '0', '0,00', ',5', '1234567890123']) {
    assert.equal(parseMonto(s).ok, false, s);
  }
});

test('formatNumber usa formato es-AR', () => {
  assert.equal(formatNumber(123456), '1.234,56');
  assert.equal(formatNumber(5), '0,05');
});

test('fechas', () => {
  assert.equal(toDisplay('2026-03-05'), '05/03/2026');
  assert.equal(fromDisplay('5/3/2026'), '2026-03-05');
  assert.equal(fromDisplay('31/02/2026'), null);
  assert.equal(isValidISODate('2024-02-29'), true);
  assert.equal(isValidISODate('2025-02-29'), false);
  assert.equal(addMonths('2026-01', -1), '2025-12');
  assert.equal(addMonths('2026-12', 1), '2027-01');
  assert.equal(addMonths('2026-05', -17), '2024-12');
  assert.deepEqual(monthBounds('2026-02'), ['2026-02-01', '2026-02-31']);
});
