// Tests de las funciones puras. Uso: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMonto, formatNumber } from '../js/money.js';
import {
  addMonths, fromDisplay, toDisplay, isValidISODate, monthBounds, lastDayOfMonth, monthName, monthShort, fechaLocal,
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
  ok('9.999.999.999,99', 999999999999);   // tope por movimiento
});

test('parseMonto rechaza basura', () => {
  for (const s of ['', '   ', 'abc', '1,2,3', '12,345', '1.23.4', '-5', '0', '0,00', ',5', '1234567890123',
    '10.000.000.000', '99999999999', '1e5', '１２３']) {
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
  assert.deepEqual(ok.resumen.porAmbito.personal, { movimientos: 1, categorias: 1, presupuestos: 1, fijos: 0, ahorros: 0, metas: 0 });
  // Un backup v1 (sin ahorros ni fijos) se migra con listas vacías.
  assert.deepEqual(ok.data.cuentas, []);
  assert.deepEqual(ok.data.pagos, []);
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
  // Nombre repetido: se restaura renombrado y con aviso (no se rechaza todo el backup).
  const dup = conData({ categorias: [cat, { ...cat, id: 'c2', nombre: 'SÚPER' }, { ...cat, id: 'c3' }] });
  assert.equal(dup.ok, true, dup.errores.join());
  assert.deepEqual(dup.data.categorias.map((c) => c.nombre), ['Súper', 'SÚPER (2)', 'Súper (3)']);
  assert.equal(dup.resumen.avisos.length, 2);
  // Un monto guardado por una versión anterior (más alto que el tope actual) se restaura igual.
  assert.equal(conData({ movimientos: [{ ...mov, montoCentavos: 10 ** 13 }] }).ok, true);
  assert.equal(conData({ movimientos: [{ ...mov, montoCentavos: 2 ** 53 }] }).ok, false);
  // Fecha de exportación inválida: se ignora en lugar de mostrar basura.
  assert.equal(validarBackup({ ...base, exportedAt: 'pepe' }).resumen.exportedAt, null);
  assert.equal(validarBackup({ ...base, exportedAt: 12345 }).resumen.exportedAt, null);
});

test('montos en otras monedas (USD y cripto)', async () => {
  const { parseCantidad, formatCantidad } = await import('../js/money.js');
  const v = (s, m) => parseCantidad(s, m);
  assert.deepEqual(v('1.500', 'USD'), { ok: true, value: 150000 });
  assert.deepEqual(v('0.001', 'BTC'), { ok: true, value: 100000 });     // cripto: el punto es decimal
  assert.deepEqual(v('0,00012345', 'BTC'), { ok: true, value: 12345 });
  assert.deepEqual(v('1.234,5', 'ETH'), { ok: true, value: 123450000000 });
  assert.equal(v('0,000000001', 'BTC').ok, false);                     // más de 8 decimales
  assert.equal(v('10000000', 'BTC').ok, false);                        // demasiado grande
  assert.equal(formatCantidad(150000, 'USD'), 'US$ 1.500,00');
  assert.equal(formatCantidad(12345, 'BTC'), '0,00012345 BTC');
});

test('gastos fijos: cuotas, meses y vencimientos', async () => {
  const F = await import('../js/fijos.js');
  // Préstamo de 12 cuotas: en noviembre se paga la 5 → arrancó en julio; se sigue desde noviembre.
  const p = { id: 'p', inicio: '2026-07', desde: '2026-11', cuotas: 12, hasta: null, dia: 31, montoCentavos: 1000 };
  assert.equal(F.cuotaEnMes(p, '2026-10'), null);                       // antes de empezar a seguirlo
  assert.deepEqual(F.cuotaEnMes(p, '2026-11'), { numero: 5, total: 12, vence: '2026-11-30' }); // día 31 → 30
  assert.deepEqual(F.cuotaEnMes(p, '2027-02'), { numero: 8, total: 12, vence: '2027-02-28' });
  assert.equal(F.cuotaEnMes(p, '2027-06').numero, 12);
  assert.equal(F.cuotaEnMes(p, '2027-07'), null);                       // terminó
  // Todos los meses, terminado en enero
  const a = { id: 'a', inicio: '2026-01', desde: '2026-01', cuotas: null, hasta: '2027-01', dia: null, montoCentavos: 500 };
  assert.deepEqual(F.cuotaEnMes(a, '2026-12'), { numero: null, total: null, vence: null });
  assert.equal(F.cuotaEnMes(a, '2027-02'), null);
  // Capital comprometido desde noviembre: cuotas 5..12 = 8, menos 1 pagada
  const cap = F.capitalComprometido([p, a], new Set(['p|2026-11']), '2026-11');
  assert.deepEqual(cap, { monto: 7000, cuotas: 7, planes: 1 });
  // Vencimientos
  assert.equal(F.estadoVencimiento('2026-11-10', '2026-11-11').nivel, 'vencido');
  assert.equal(F.estadoVencimiento('2026-11-11', '2026-11-11').nivel, 'hoy');
  assert.equal(F.estadoVencimiento('2026-11-14', '2026-11-11').nivel, 'pronto');
  assert.equal(F.estadoVencimiento('2026-11-15', '2026-11-11').nivel, 'ok');
  assert.equal(F.estadoVencimiento(null).nivel, 'sin');
  assert.equal(F.diasEntre('2026-12-31', '2027-01-01'), 1);
  // Validación
  const base = { ambito: 'personal', nombre: 'Visa', categoriaId: 'c', montoCentavos: 100, dia: 10, inicio: '2026-11', desde: '2026-11', cuotas: 3, hasta: null };
  assert.deepEqual(F.validarFijo(base), {});
  assert.ok(F.validarFijo({ ...base, dia: 32 }).dia);
  assert.ok(F.validarFijo({ ...base, cuotas: 0 }).cuotas);
  assert.ok(F.validarFijo({ ...base, desde: '2027-02' }).cuotaActual); // cuota actual > total
  assert.ok(F.validarFijo({ ...base, inicio: '2026-13' }).inicio);
});

test('ahorros: conversión, metas y ahorro del mes', async () => {
  const A = await import('../js/ahorros.js');
  const cotiz = new Map([['USD', { moneda: 'USD', centavos: 120000 }], ['BTC', { moneda: 'BTC', centavos: 10000000000 }]]);
  assert.equal(A.convertir(10000, 'USD', 'ARS', cotiz), 12000000);       // US$100 × $1.200
  assert.equal(A.convertir(12000000, 'ARS', 'USD', cotiz), 10000);
  assert.equal(A.convertir(1000000, 'BTC', 'ARS', cotiz), 100000000);    // 0,01 BTC × $100.000.000 = $1.000.000
  assert.equal(A.convertir(100, 'ETH', 'ARS', cotiz), null);              // sin cotización
  const ah = [
    { id: '1', tipo: 'aporte', cuentaId: 'k1', moneda: 'ARS', cantidad: 50000000, metaId: 'm', fecha: '2026-11-02' },
    { id: '2', tipo: 'aporte', cuentaId: 'k2', moneda: 'USD', cantidad: 10000, metaId: 'm', fecha: '2026-11-03', pesos: 11500000 },
    { id: '3', tipo: 'retiro', cuentaId: 'k1', moneda: 'ARS', cantidad: 10000000, metaId: null, fecha: '2026-11-04' },
    { id: '4', tipo: 'aporte', cuentaId: 'k3', moneda: 'ETH', cantidad: 5, metaId: 'm', fecha: '2026-10-01' },
  ];
  assert.deepEqual([...A.saldosPorCuenta(ah)], [['k1', 40000000], ['k2', 10000], ['k3', 5]]);
  const meta = { id: 'm', moneda: 'ARS', objetivo: 100000000 };
  const p = A.progresoMeta(meta, ah, cotiz);
  assert.equal(p.acumulado, 62000000);                                     // $500.000 + US$100 a $1.200
  assert.deepEqual(p.sinCotizacion, ['ETH']);
  assert.equal(p.faltan, 38000000);
  const mes = A.ahorroDelMes(ah, '2026-11', cotiz);
  assert.equal(mes.aportado, 50000000 + 11500000);                        // el USD usa los pesos indicados
  assert.equal(mes.neto, 61500000 - 10000000);
  const tot = A.totalesAhorro(ah, cotiz);
  assert.deepEqual(tot.sinCotizacion, ['ETH']);
  assert.equal(tot.totalPesos, 40000000 + 12000000);
  // Validaciones
  assert.deepEqual(A.validarCuenta({ ambito: 'personal', tipo: 'cripto', detalle: 'usdt', nota: '' }), {});
  assert.equal(A.monedaDeCuenta('cripto', ' usdt '), 'USDT');
  assert.ok(A.validarCuenta({ ambito: 'personal', tipo: 'cripto', detalle: 'bit coin', nota: '' }).detalle);
  assert.ok(A.validarCuenta({ ambito: 'personal', tipo: 'banco', detalle: '', nota: '' }).detalle);
  assert.deepEqual(A.validarCuenta({ ambito: 'personal', tipo: 'efectivo', detalle: '', nota: '' }), {});
  assert.ok(A.validarAhorro({ ambito: 'personal', tipo: 'aporte', cuentaId: 'k', moneda: 'ARS', cantidad: 1, fecha: '2026-11-01', nota: '', pesos: 5 }).pesos);
});

test('validarBackup v2: referencias de ahorros y fijos', async () => {
  const { validarBackup, APP_ID } = await import('../js/backup.js');
  const t = '2026-11-01T00:00:00.000Z';
  const cat = { id: 'c1', ambito: 'personal', tipo: 'gasto', nombre: 'Alquiler', emoji: '🏠', color: '#2563eb', archivada: 0, orden: 0, createdAt: t, updatedAt: t };
  const mov = { id: 'm1', ambito: 'personal', tipo: 'gasto', montoCentavos: 1000, categoriaId: 'c1', fecha: '2026-11-05', nota: '', createdAt: t, updatedAt: t };
  const cuenta = { id: 'k1', ambito: 'personal', tipo: 'dolar_mep', detalle: 'Broker', moneda: 'USD', nota: '', archivada: 0, createdAt: t, updatedAt: t };
  const meta = { id: 'g1', ambito: 'personal', nombre: 'Moto', emoji: '🏍️', moneda: 'USD', objetivo: 300000, archivada: 0, createdAt: t, updatedAt: t };
  const aporte = { id: 'a1', ambito: 'personal', tipo: 'aporte', cuentaId: 'k1', moneda: 'USD', cantidad: 5000, metaId: 'g1', fecha: '2026-11-02', nota: '', pesos: null, createdAt: t, updatedAt: t };
  const fijo = { id: 'f1', ambito: 'personal', nombre: 'Alquiler', categoriaId: 'c1', montoCentavos: 1000, dia: 10, inicio: '2026-11', desde: '2026-11', cuotas: null, hasta: null, createdAt: t, updatedAt: t };
  const pago = { id: 'p1', ambito: 'personal', fijoId: 'f1', mes: '2026-11', movimientoId: 'm1', montoCentavos: 1000, fecha: '2026-11-05', createdAt: t, updatedAt: t };
  const data = { movimientos: [mov], categorias: [cat], presupuestos: [], cuentas: [cuenta], metas: [meta], ahorros: [aporte], cotizaciones: [{ moneda: 'USD', centavos: 120000, updatedAt: t }], fijos: [fijo], pagos: [pago], meta: [] };
  const b = (d) => validarBackup({ app: APP_ID, schemaVersion: 2, exportedAt: t, data: { ...data, ...d } });
  const ok = b({});
  assert.equal(ok.ok, true, ok.errores.join());
  assert.equal(ok.data.pagos.length, 1);
  assert.match(b({ ahorros: [{ ...aporte, cuentaId: 'x' }] }).errores[0], /cuenta no existe/);
  assert.match(b({ ahorros: [{ ...aporte, moneda: 'ARS' }] }).errores[0], /cuenta no existe o no corresponde/);
  assert.match(b({ cuentas: [{ ...cuenta, moneda: 'ARS' }] }).errores[0], /moneda no corresponde/);
  assert.match(b({ fijos: [{ ...fijo, categoriaId: 'x' }] }).errores[0], /categoría no existe/);
  assert.match(b({ cuentas: undefined }).errores[0], /falta la lista de cuentas/);
  // Lo menor se corrige con aviso: meta inexistente, pago huérfano, cotización inválida.
  const r = b({ ahorros: [{ ...aporte, metaId: 'nope' }], pagos: [{ ...pago, movimientoId: 'nope' }], cotizaciones: [{ moneda: 'USD', centavos: -1 }] });
  assert.equal(r.ok, true, r.errores.join());
  assert.equal(r.data.ahorros[0].metaId, null);
  assert.equal(r.data.pagos.length, 0);
  assert.equal(r.data.cotizaciones.length, 0);
  assert.equal(r.resumen.avisos.length, 3);
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
  // Una marca de tiempo de las 23:30 locales es de ese día aunque en UTC ya sea el siguiente.
  assert.equal(fechaLocal(new Date(2026, 10, 11, 23, 30).toISOString()), '2026-11-11');
  assert.equal(fechaLocal(new Date(2026, 0, 1, 0, 5).toISOString()), '2026-01-01');
});
