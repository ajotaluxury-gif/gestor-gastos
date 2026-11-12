// Exportar a CSV, backup en JSON y restauración.
import { tx, req, getAll, getMeta, setMeta, DB_VERSION } from './db.js';
import { DATA_STORES } from './migrations.js';
import { seedCategorias } from './seed.js';
import { validarMovimiento, validarCategoria, validarPresupuesto, normalizarNombre, esUnEmoji } from './repo.js';
import { validarCuenta, validarMeta, validarAhorro, monedaDeCuenta } from './ahorros.js';
import { validarFijo } from './fijos.js';
import { esMonedaValida, MAX_CENTAVOS } from './money.js';
import { AMBITOS } from './state.js';
import { toDisplay, todayISO, isValidISODate, fechaLocal } from './dates.js';

export const APP_ID = 'gestor-gastos';
export const DIAS_RECORDATORIO = 30;
const STORES = DATA_STORES;
// Stores que se agregaron en el esquema 2 (un backup v1 no los tiene).
const STORES_V2 = ['cuentas', 'metas', 'ahorros', 'cotizaciones', 'fijos', 'pagos'];
// Claves de meta que no viajan en el backup (son del dispositivo, no de los datos).
const META_LOCAL = new Set(['lastBackupAt', 'seededAt', 'backupSnoozeUntil']);
const META_PREFIJOS = ['ultimaCat:', 'ultimaCuenta:'];
const MAX_ERRORES = 20;

// ---------- CSV ----------

/** 123456 → "1234,56"; -500 → "-5,00" (sin separador de miles: Excel lo lee mejor). */
export function montoCSV(cents) {
  const abs = Math.abs(cents);
  return `${cents < 0 ? '-' : ''}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
}

/** Escapa un campo para CSV con ";" y evita que Excel lo tome como fórmula. */
export function campoCSV(valor) {
  let s = String(valor ?? '');
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(,\d+)?$/.test(s)) s = `'${s}`;
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Arma el CSV (con BOM, separador ";" y fin de línea CRLF).
 * Los gastos van en negativo, así la suma de la columna Monto da el balance.
 */
export function construirCSV(movimientos, catMap) {
  const filas = [['Fecha', 'Ámbito', 'Tipo', 'Categoría', 'Monto', 'Nota']];
  const ordenados = [...movimientos].sort((a, b) =>
    a.fecha.localeCompare(b.fecha) || (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
  for (const m of ordenados) {
    filas.push([
      toDisplay(m.fecha),
      AMBITOS[m.ambito]?.label ?? m.ambito,
      m.tipo === 'gasto' ? 'Gasto' : 'Ingreso',
      catMap.get(m.categoriaId)?.nombre ?? 'Sin categoría',
      montoCSV(m.tipo === 'gasto' ? -m.montoCentavos : m.montoCentavos),
      m.nota ?? '',
    ]);
  }
  return `﻿${filas.map((f) => f.map(campoCSV).join(';')).join('\r\n')}\r\n`;
}

/**
 * @param {{ambito: string|null, mes: string|null}} opts ambito null = ambos; mes null = todo
 * @returns {Promise<{blob: Blob, nombre: string, cantidad: number}>}
 */
export async function exportarCSV({ ambito, mes }) {
  const [movs, cats] = await Promise.all([getAll('movimientos'), getAll('categorias')]);
  const filtrados = movs.filter((m) => (!ambito || m.ambito === ambito) && (!mes || m.fecha.startsWith(mes)));
  const csv = construirCSV(filtrados, new Map(cats.map((c) => [c.id, c])));
  const nombre = `gastos-${ambito ?? 'todo'}-${mes ?? todayISO()}.csv`;
  return { blob: new Blob([csv], { type: 'text/csv;charset=utf-8' }), nombre, cantidad: filtrados.length };
}

// ---------- Backup ----------

export async function crearBackup() {
  const todos = await Promise.all([...STORES, 'meta'].map((s) => getAll(s)));
  const data = Object.fromEntries(STORES.map((s, i) => [s, todos[i]]));
  data.meta = todos.at(-1).filter((m) => !META_LOCAL.has(m.key));
  const json = JSON.stringify({ app: APP_ID, schemaVersion: DB_VERSION, exportedAt: new Date().toISOString(), data }, null, 1);
  return {
    blob: new Blob([json], { type: 'application/json' }),
    nombre: `gestor-gastos-backup-${todayISO()}.json`,
    cantidad: data.movimientos.length,
  };
}

export const marcarBackupHecho = () => setMeta('lastBackupAt', new Date().toISOString());

/** Último backup y si corresponde recordarlo (más de 30 días, o nunca y la app tiene más de 30 días). */
export async function estadoBackup() {
  const [last, seeded, snooze, cantidad] = await Promise.all([
    getMeta('lastBackupAt'),
    getMeta('seededAt'),
    getMeta('backupSnoozeUntil'),
    tx(['movimientos', 'ahorros'], 'readonly', async ({ movimientos, ahorros }) =>
      (await req(movimientos.count())) + (await req(ahorros.count()))),
  ]);
  // Días de calendario local (no de 24 h): un backup de anoche a las 23 h es "Ayer", no "Hoy".
  const diasDesde = (iso) => (iso && !Number.isNaN(Date.parse(iso))
    ? Math.round((Date.parse(todayISO()) - Date.parse(fechaLocal(iso))) / 86_400_000)
    : null);
  const dias = diasDesde(last ?? seeded);
  const pospuesto = snooze && Date.parse(snooze) > Date.now();
  return {
    last,
    diasDesdeUltimo: diasDesde(last),
    recordar: cantidad > 0 && dias !== null && dias > DIAS_RECORDATORIO && !pospuesto,
  };
}

export const posponerRecordatorio = (dias = 7) =>
  setMeta('backupSnoozeUntil', new Date(Date.now() + dias * 86_400_000).toISOString());

// ---------- Validación y restauración ----------

/** Lleva los datos de un backup viejo al esquema actual. */
function migrarBackup(backup) {
  const data = backup.data;
  if (!data || typeof data !== 'object') return data;
  if (backup.schemaVersion < 2) {
    // v1 → v2: no había ahorros ni gastos fijos.
    return { ...data, ...Object.fromEntries(STORES_V2.map((s) => [s, []])) };
  }
  return data;
}

const pick = (obj, keys) => Object.fromEntries(keys.map((k) => [k, obj?.[k]]));
const esTexto = (v) => typeof v === 'string' && v.length > 0;

/**
 * Valida un backup ya parseado. No toca la base.
 * Regla: lo que una versión anterior guardó tiene que poder restaurarse. Se rechaza solo lo que
 * rompería la app (tipos inválidos, referencias rotas); lo menor se corrige y se avisa.
 * @returns {{ok: boolean, errores: string[], data?: object, resumen?: object}}
 */
export function validarBackup(backup) {
  const fail = (msg) => ({ ok: false, errores: [msg] });
  if (!backup || typeof backup !== 'object' || backup.app !== APP_ID) {
    return fail('El archivo no es un backup de Gestor de Gastos.');
  }
  if (!Number.isInteger(backup.schemaVersion) || backup.schemaVersion < 1) {
    return fail('El backup no tiene una versión válida.');
  }
  if (backup.schemaVersion > DB_VERSION) {
    return fail('El backup es de una versión más nueva de la app. Actualizá la app y probá de nuevo.');
  }
  const raw = migrarBackup(backup);
  if (!raw || typeof raw !== 'object') return fail('El backup no tiene datos.');
  for (const s of STORES) {
    if (!Array.isArray(raw[s])) return fail(`Al backup le falta la lista de ${s}.`);
  }

  const errores = [];
  const avisos = [];
  const err = (msg) => { if (errores.length < MAX_ERRORES) errores.push(msg); };
  const now = new Date().toISOString();
  const tiempos = (r) => ({
    createdAt: esTexto(r?.createdAt) ? r.createdAt : now,
    updatedAt: esTexto(r?.updatedAt) ? r.updatedAt : now,
  });
  const primerError = (errs) => Object.values(errs)[0];
  /** Valida id único; devuelve false (y registra el error) si falta o está repetido. */
  const idOk = (ids, r, etiqueta) => {
    if (!esTexto(r.id)) { err(`${etiqueta}: falta el id.`); return false; }
    if (ids.has(r.id)) { err(`${etiqueta}: id repetido.`); return false; }
    ids.add(r.id);
    return true;
  };

  // Categorías
  const catIds = new Map();
  const catNombres = new Set();
  const vistosCat = new Set();
  const categorias = raw.categorias.map((c, i) => {
    const r = { ...pick(c, ['id', 'ambito', 'tipo', 'nombre', 'emoji', 'color']), ...tiempos(c) };
    r.archivada = c?.archivada ? 1 : 0;
    r.orden = Number.isFinite(c?.orden) ? c.orden : i;
    const e = validarCategoria(r);
    if (!idOk(vistosCat, r, `Categoría ${i + 1}`)) return r;
    if (Object.keys(e).length) { err(`Categoría ${i + 1} ("${typeof r.nombre === 'string' ? r.nombre : '?'}"): ${primerError(e)}`); return r; }
    // Nombre repetido: no es grave, se renombra ("Viajes (2)") y se avisa.
    const clave = (n) => `${r.ambito}|${r.tipo}|${normalizarNombre(n)}`;
    if (catNombres.has(clave(r.nombre))) {
      const original = r.nombre;
      let n = 2;
      while (catNombres.has(clave(`${original} (${n})`))) n++;
      r.nombre = `${original} (${n})`;
      avisos.push(`La categoría "${original}" estaba repetida: se restaura como "${r.nombre}".`);
    }
    catNombres.add(clave(r.nombre));
    catIds.set(r.id, r);
    return r;
  });

  // Movimientos
  const movIds = new Set();
  const movimientos = raw.movimientos.map((m, i) => {
    const r = { ...pick(m, ['id', 'ambito', 'tipo', 'montoCentavos', 'categoriaId', 'fecha']), nota: typeof m?.nota === 'string' ? m.nota : '', ...tiempos(m) };
    // Sin el tope actual por movimiento: lo que una versión anterior guardó se tiene que poder restaurar.
    const e = validarMovimiento(r, { tope: false });
    const cat = catIds.get(r.categoriaId);
    if (!idOk(movIds, r, `Movimiento ${i + 1}`)) return r;
    if (Object.keys(e).length) err(`Movimiento ${i + 1}: ${primerError(e)}`);
    else if (!cat || cat.ambito !== r.ambito || cat.tipo !== r.tipo) err(`Movimiento ${i + 1}: su categoría no existe o no corresponde.`);
    return r;
  });
  const movMap = new Map(movimientos.map((m) => [m.id, m]));

  // Presupuestos
  const presIds = new Set();
  const presPorCat = new Set();
  const presupuestos = raw.presupuestos.map((p, i) => {
    const r = { ...pick(p, ['id', 'ambito', 'categoriaId', 'montoCentavos']), ...tiempos(p) };
    const e = validarPresupuesto(r, { tope: false });
    const cat = catIds.get(r.categoriaId);
    if (!idOk(presIds, r, `Presupuesto ${i + 1}`)) return r;
    if (Object.keys(e).length) err(`Presupuesto ${i + 1}: ${primerError(e)}`);
    else if (!cat || cat.ambito !== r.ambito || cat.tipo !== 'gasto') err(`Presupuesto ${i + 1}: su categoría no existe o no es de gasto.`);
    else if (presPorCat.has(r.categoriaId)) err(`Presupuesto ${i + 1}: hay dos presupuestos para la misma categoría.`);
    presPorCat.add(r.categoriaId);
    return r;
  });

  // Cuentas de ahorro
  const cuentaIds = new Map();
  const vistosCuenta = new Set();
  const cuentas = raw.cuentas.map((c, i) => {
    const r = { ...pick(c, ['id', 'ambito', 'tipo', 'detalle', 'moneda']), nota: typeof c?.nota === 'string' ? c.nota : '', ...tiempos(c) };
    if (typeof r.detalle !== 'string') r.detalle = '';
    r.archivada = c?.archivada ? 1 : 0;
    if (!idOk(vistosCuenta, r, `Cuenta ${i + 1}`)) return r;
    const e = validarCuenta(r);
    if (Object.keys(e).length) err(`Cuenta ${i + 1}: ${primerError(e)}`);
    else if (r.moneda !== monedaDeCuenta(r.tipo, r.detalle)) err(`Cuenta ${i + 1}: la moneda no corresponde al tipo de cuenta.`);
    else cuentaIds.set(r.id, r);
    return r;
  });

  // Metas
  const metaIds = new Map();
  const vistosMeta = new Set();
  const metas = raw.metas.map((m, i) => {
    const r = { ...pick(m, ['id', 'ambito', 'nombre', 'emoji', 'moneda', 'objetivo']), ...tiempos(m) };
    r.archivada = m?.archivada ? 1 : 0;
    if (!idOk(vistosMeta, r, `Meta ${i + 1}`)) return r;
    // Hasta la 1.2 una meta podía tener texto como "emoji": se restaura con 🎯 en lugar de rechazar el backup.
    if (typeof r.emoji === 'string' && r.emoji.trim() && !esUnEmoji(r.emoji)) {
      avisos.push(`La meta "${typeof r.nombre === 'string' ? r.nombre : '?'}" tenía un emoji inválido: se restaura con 🎯.`);
      r.emoji = '🎯';
    }
    const e = validarMeta(r);
    if (Object.keys(e).length && !(Object.keys(e).length === 1 && e.objetivo === 'El monto es demasiado grande.')) {
      err(`Meta ${i + 1}: ${primerError(e)}`);
    } else metaIds.set(r.id, r);
    return r;
  });

  // Aportes y retiros
  const vistosAhorro = new Set();
  const ahorros = raw.ahorros.map((a, i) => {
    const r = {
      ...pick(a, ['id', 'ambito', 'tipo', 'cuentaId', 'moneda', 'cantidad', 'fecha']),
      metaId: a?.metaId ?? null,
      nota: typeof a?.nota === 'string' ? a.nota : '',
      pesos: a?.pesos ?? null,
      ...tiempos(a),
    };
    if (!idOk(vistosAhorro, r, `Ahorro ${i + 1}`)) return r;
    const e = validarAhorro(r, { tope: false });
    const cuenta = cuentaIds.get(r.cuentaId);
    if (Object.keys(e).length) err(`Ahorro ${i + 1}: ${primerError(e)}`);
    else if (!cuenta || cuenta.ambito !== r.ambito || cuenta.moneda !== r.moneda) err(`Ahorro ${i + 1}: su cuenta no existe o no corresponde.`);
    else if (r.metaId && metaIds.get(r.metaId)?.ambito !== r.ambito) {
      avisos.push(`Un aporte apuntaba a una meta que no existe: queda como ahorro sin meta.`);
      r.metaId = null;
    }
    return r;
  });

  // Cotizaciones: si alguna es inválida se descarta (se puede volver a cargar).
  const cotizaciones = raw.cotizaciones.filter((c) => {
    const ok = c && esMonedaValida(c.moneda) && c.moneda !== 'ARS' && Number.isSafeInteger(c.centavos) && c.centavos > 0 && c.centavos <= MAX_CENTAVOS;
    if (!ok) avisos.push(`Se descartó una cotización inválida (${typeof c?.moneda === 'string' ? c.moneda : '?'}).`);
    return ok;
  }).map((c) => ({ moneda: c.moneda, centavos: c.centavos, updatedAt: esTexto(c.updatedAt) ? c.updatedAt : now }));

  // Gastos fijos
  const fijoIds = new Map();
  const vistosFijo = new Set();
  const fijos = raw.fijos.map((f, i) => {
    const r = {
      ...pick(f, ['id', 'ambito', 'nombre', 'categoriaId', 'montoCentavos', 'inicio', 'desde']),
      dia: f?.dia ?? null, cuotas: f?.cuotas ?? null, hasta: f?.hasta ?? null, ...tiempos(f),
    };
    if (!idOk(vistosFijo, r, `Gasto fijo ${i + 1}`)) return r;
    const e = validarFijo(r, { tope: false });
    const cat = catIds.get(r.categoriaId);
    if (Object.keys(e).length) err(`Gasto fijo ${i + 1}: ${primerError(e)}`);
    else if (!cat || cat.ambito !== r.ambito || cat.tipo !== 'gasto') err(`Gasto fijo ${i + 1}: su categoría no existe o no es de gasto.`);
    else fijoIds.set(r.id, r);
    return r;
  });

  // Pagos de fijos: si falta el fijo o el gasto, o hay dos para el mismo mes, se descarta la marca (los gastos quedan).
  const vistosPago = new Set();
  const pagoPorMes = new Set();
  let descartados = 0;
  const pagos = raw.pagos.filter((p) => {
    const f = fijoIds.get(p?.fijoId);
    const mov = movMap.get(p?.movimientoId);
    const clave = `${p?.fijoId}|${p?.mes}`;
    const ok = p && esTexto(p.id) && !vistosPago.has(p.id) && f && mov && f.ambito === p.ambito
      && typeof p.mes === 'string' && /^\d{4}-\d{2}$/.test(p.mes) && !pagoPorMes.has(clave)
      && Number.isSafeInteger(p.montoCentavos) && p.montoCentavos > 0 && isValidISODate(p.fecha);
    if (!ok) { descartados++; return false; }
    vistosPago.add(p.id);
    pagoPorMes.add(clave);
    return true;
  }).map((p) => ({ ...pick(p, ['id', 'ambito', 'fijoId', 'mes', 'movimientoId', 'montoCentavos', 'fecha']), ...tiempos(p) }));
  if (descartados) avisos.push(`${descartados} marca(s) de "pagado" de gastos fijos no eran válidas y se descartaron (los gastos quedan).`);

  // Meta: solo preferencias conocidas.
  const meta = (Array.isArray(raw.meta) ? raw.meta : [])
    .filter((m) => m && typeof m.key === 'string' && !META_LOCAL.has(m.key)
      && (m.key === 'ambitoActual' || m.key === 'prefs' || META_PREFIJOS.some((p) => m.key.startsWith(p))))
    .map((m) => ({ key: m.key, value: m.value }));

  if (errores.length) return { ok: false, errores };

  const exportedAt = esTexto(backup.exportedAt) && !Number.isNaN(Date.parse(backup.exportedAt))
    ? new Date(backup.exportedAt).toISOString()
    : null;
  const data = { movimientos, categorias, presupuestos, cuentas, metas, ahorros, cotizaciones, fijos, pagos, meta };
  return { ok: true, errores: [], data, resumen: { exportedAt, avisos, porAmbito: contarPorAmbito(data) } };
}

const CONTEOS = ['movimientos', 'categorias', 'presupuestos', 'fijos', 'ahorros', 'metas'];

function contarPorAmbito(data) {
  const porAmbito = {};
  for (const a of Object.keys(AMBITOS)) {
    porAmbito[a] = Object.fromEntries(CONTEOS.map((s) => [s, data[s].filter((r) => r.ambito === a).length]));
  }
  return porAmbito;
}

/** Lee y valida un archivo elegido por el usuario. */
export async function leerBackup(file) {
  if (!file) return { ok: false, errores: ['No se eligió ningún archivo.'] };
  if (file.size > 50 * 1024 * 1024) return { ok: false, errores: ['El archivo es demasiado grande para ser un backup.'] };
  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    return { ok: false, errores: ['El archivo no es un JSON válido. ¿Elegiste el backup correcto?'] };
  }
  return validarBackup(parsed);
}

/** Cuántos registros hay hoy, por ámbito (para comparar antes de restaurar). */
export async function conteoActual() {
  const todos = await Promise.all(CONTEOS.map((s) => getAll(s)));
  return contarPorAmbito(Object.fromEntries(CONTEOS.map((s, i) => [s, todos[i]])));
}

/**
 * Deja la app como recién instalada: borra todos los datos y la personalización,
 * y vuelve a cargar las categorías iniciales. Todo en una transacción.
 */
export function borrarTodo() {
  return tx([...STORES, 'meta'], 'readwrite', async (s) => {
    await Promise.all([...STORES, 'meta'].map((n) => req(s[n].clear())));
    seedCategorias(s.categorias);
    await req(s.meta.put({ key: 'seededAt', value: new Date().toISOString() }));
  });
}

/**
 * Reemplaza TODOS los datos por los del backup en una sola transacción:
 * si algo falla, no se cambia nada.
 */
export function restaurarBackup({ data, resumen }) {
  return tx([...STORES, 'meta'], 'readwrite', async (s) => {
    const seededAt = await req(s.meta.get('seededAt'));
    await Promise.all([...STORES, 'meta'].map((n) => req(s[n].clear())));
    const puts = [];
    for (const n of STORES) for (const r of data[n]) puts.push(req(s[n].put(r)));
    for (const m of data.meta) puts.push(req(s.meta.put(m)));
    if (seededAt) puts.push(req(s.meta.put(seededAt)));
    // Los datos quedan iguales al backup: cuenta como respaldados en esa fecha.
    puts.push(req(s.meta.put({ key: 'lastBackupAt', value: resumen.exportedAt ?? new Date().toISOString() })));
    await Promise.all(puts);
  });
}
