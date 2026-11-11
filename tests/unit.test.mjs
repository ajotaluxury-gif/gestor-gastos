// Tests de las funciones puras. Uso: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMonto, formatNumber } from '../js/money.js';
import {
  addMonths, fromDisplay, toDisplay, isValidISODate, monthBounds, lastDayOfMonth, monthName, monthShort,
} from '../js/dates.js';

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

test('validarMovimiento', async () => {
  const { validarMovimiento, totales } = await import('../js/repo.js');
  const ok = { ambito: 'personal', tipo: 'gasto', montoCentavos: 100, categoriaId: 'x', fecha: '2026-11-11', nota: '' };
  assert.deepEqual(validarMovimiento(ok), {});
  const bad = validarMovimiento({ ...ok, ambito: 'otro', tipo: 'x', montoCentavos: 0, categoriaId: '', fecha: '2026-02-30', nota: 'a'.repeat(201) });
  assert.deepEqual(Object.keys(bad).sort(), ['ambito', 'categoria', 'fecha', 'monto', 'nota', 'tipo']);
  assert.equal(validarMovimiento({ ...ok, montoCentavos: 1.5 }).monto !== undefined, true);
  assert.deepEqual(
    totales([{ tipo: 'gasto', montoCentavos: 300 }, { tipo: 'ingreso', montoCentavos: 1000 }]),
    { ingresos: 1000, gastos: 300, balance: 700 });
});

test('validarCategoria', async () => {
  const { validarCategoria } = await import('../js/repo.js');
  const ok = { ambito: 'negocio', tipo: 'ingreso', nombre: 'Ventas web', emoji: '🛒', color: '#2563eb' };
  assert.deepEqual(validarCategoria(ok), {});
  for (const emoji of ['🏋️', '👨‍👩‍👧', '🇦🇷', '1️⃣']) assert.deepEqual(validarCategoria({ ...ok, emoji }), {}, emoji);
  for (const emoji of ['', 'a', '🛒🛒', 'ab']) assert.ok(validarCategoria({ ...ok, emoji }).emoji, emoji);
  assert.ok(validarCategoria({ ...ok, nombre: '   ' }).nombre);
  assert.ok(validarCategoria({ ...ok, nombre: 'x'.repeat(41) }).nombre);
  assert.ok(validarCategoria({ ...ok, color: 'red' }).color);
  assert.ok(validarCategoria({ ...ok, tipo: 'otro' }).tipo);
});

test('el Service Worker precachea todos los archivos de la app', async () => {
  const { readFileSync, readdirSync } = await import('node:fs');
  const { join, relative } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = fileURLToPath(new URL('..', import.meta.url));
  const sw = readFileSync(join(root, 'sw.js'), 'utf8');
  const assets = new Set([...sw.matchAll(/'\.\/([^']+)'/g)].map((m) => m[1]));
  const walk = (dir) => readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) =>
    (e.isDirectory() ? walk(join(dir, e.name)) : [relative(root, join(root, dir, e.name)).replace(/\\/g, '/')]));
  const files = [...walk('js'), ...walk('css'), ...walk('icons'), 'vendor/chart.umd.min.js', 'index.html', 'manifest.webmanifest'];
  const faltan = files.filter((f) => !assets.has(f));
  assert.deepEqual(faltan, [], `Agregá a ASSETS en sw.js: ${faltan.join(', ')}`);
});

test('cálculos del resumen', async () => {
  const { sumarPorCategoria, agruparResto, variacion } = await import('../js/repo.js');
  const movs = [
    { tipo: 'gasto', categoriaId: 'a', montoCentavos: 100 },
    { tipo: 'gasto', categoriaId: 'b', montoCentavos: 500 },
    { tipo: 'gasto', categoriaId: 'a', montoCentavos: 300 },
    { tipo: 'ingreso', categoriaId: 'c', montoCentavos: 9999 },
  ];
  assert.deepEqual(sumarPorCategoria(movs, 'gasto'), [
    { categoriaId: 'b', monto: 500 }, { categoriaId: 'a', monto: 400 }]);
  const filas = [5, 4, 3, 2, 1].map((monto, i) => ({ categoriaId: `c${i}`, monto }));
  assert.equal(agruparResto(filas, 5), filas);
  assert.deepEqual(agruparResto(filas, 3), [filas[0], filas[1], { categoriaId: null, monto: 6 }]);
  assert.equal(variacion(120, 100), 0.2);
  assert.equal(variacion(50, 0), null);
});

test('estado de presupuestos (80 % y 100 %)', async () => {
  const { estadoPresupuesto, validarPresupuesto } = await import('../js/repo.js');
  const nivel = (g) => estadoPresupuesto(g, 1000).nivel;
  assert.equal(nivel(0), 'ok');
  assert.equal(nivel(799), 'ok');
  assert.equal(nivel(800), 'alerta');
  assert.equal(nivel(1000), 'alerta');   // llegar justo al tope todavía no es pasarse
  assert.equal(nivel(1001), 'excedido');
  assert.deepEqual(estadoPresupuesto(1250, 1000), { pct: 1.25, nivel: 'excedido', restante: -250 });
  assert.deepEqual(validarPresupuesto({ ambito: 'personal', categoriaId: 'x', montoCentavos: 100 }), {});
  assert.deepEqual(Object.keys(validarPresupuesto({ ambito: 'x', categoriaId: '', montoCentavos: 0 })).sort(),
    ['ambito', 'categoria', 'monto']);
});

test('CSV: separador ";", BOM, CRLF, escapes y montos con signo', async () => {
  const { construirCSV, montoCSV, campoCSV } = await import('../js/backup.js');
  assert.equal(montoCSV(123456), '1234,56');
  assert.equal(montoCSV(-5), '-0,05');
  assert.equal(campoCSV('hola; "che"'), '"hola; ""che"""');
  assert.equal(campoCSV('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(campoCSV('-1234,56'), '-1234,56'); // número negativo: sin escapar
  const catMap = new Map([['c1', { nombre: 'Súper' }], ['c2', { nombre: 'Sueldo' }]]);
  const csv = construirCSV([
    { fecha: '2026-11-10', ambito: 'personal', tipo: 'gasto', categoriaId: 'c1', montoCentavos: 150050, nota: 'línea1\nlínea2', createdAt: 'b' },
    { fecha: '2026-11-01', ambito: 'negocio', tipo: 'ingreso', categoriaId: 'c2', montoCentavos: 100000, nota: '', createdAt: 'a' },
  ], catMap);
  assert.ok(csv.startsWith('﻿Fecha;Ámbito;Tipo;Categoría;Monto;Nota\r\n'));
  const lineas = csv.slice(1).split('\r\n');
  assert.equal(lineas[1], '01/11/2026;Negocio;Ingreso;Sueldo;1000,00;');
  assert.equal(lineas[2], '10/11/2026;Personal;Gasto;Súper;-1500,50;"línea1\nlínea2"');
});

test('validarBackup', async () => {
  const { validarBackup, APP_ID } = await import('../js/backup.js');
  const t = '2026-11-01T00:00:00.000Z';
  const cat = { id: 'c1', ambito: 'personal', tipo: 'gasto', nombre: 'Súper', emoji: '🛒', color: '#2563eb', archivada: 0, orden: 0, createdAt: t, updatedAt: t };
  const mov = { id: 'm1', ambito: 'personal', tipo: 'gasto', montoCentavos: 1000, categoriaId: 'c1', fecha: '2026-11-05', nota: '', createdAt: t, updatedAt: t };
  const pres = { id: 'p1', ambito: 'personal', categoriaId: 'c1', montoCentavos: 5000, createdAt: t, updatedAt: t };
  const base = { app: APP_ID, schemaVersion: 1, exportedAt: t,
    data: { movimientos: [mov], categorias: [cat], presupuestos: [pres], meta: [{ key: 'ambitoActual', value: 'negocio' }, { key: 'raro', value: 1 }] } };

  const ok = validarBackup(base);
  assert.equal(ok.ok, true, ok.errores.join());
  assert.deepEqual(ok.resumen.porAmbito.personal, { movimientos: 1, categorias: 1, presupuestos: 1 });
  assert.deepEqual(ok.data.meta, [{ key: 'ambitoActual', value: 'negocio' }]); // descarta claves desconocidas

  const conData = (data) => validarBackup({ ...base, data: { ...base.data, ...data } });
  assert.match(validarBackup({ app: 'otra' }).errores[0], /no es un backup/);
  assert.match(validarBackup({ ...base, schemaVersion: 99 }).errores[0], /más nueva/);
  assert.match(conData({ movimientos: 'x' }).errores[0], /falta la lista/);
  assert.match(conData({ movimientos: [{ ...mov, categoriaId: 'nope' }] }).errores[0], /categoría no existe/);
  assert.match(conData({ movimientos: [{ ...mov, montoCentavos: -1 }] }).errores[0], /monto/i);
  assert.match(conData({ movimientos: [mov, mov] }).errores[0], /id repetido/);
  assert.match(conData({ presupuestos: [pres, { ...pres, id: 'p2' }] }).errores[0], /misma categoría/);
  assert.match(conData({ categorias: [{ ...cat, emoji: 'xx' }] }).errores[0], /emoji/);
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
  assert.equal(lastDayOfMonth('2026-02'), '2026-02-28');
  assert.equal(lastDayOfMonth('2024-02'), '2024-02-29');
  assert.equal(lastDayOfMonth('2026-12'), '2026-12-31');
  assert.equal(monthName('2026-10'), 'octubre');
  assert.equal(monthShort('2026-09'), 'sept');
});
