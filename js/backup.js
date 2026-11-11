// Exportar a CSV, backup en JSON y restauración.
import { tx, req, getAll, getMeta, setMeta, DB_VERSION } from './db.js';
import { validarMovimiento, validarCategoria, validarPresupuesto } from './repo.js';
import { AMBITOS } from './state.js';
import { toDisplay, todayISO } from './dates.js';

export const APP_ID = 'gestor-gastos';
export const DIAS_RECORDATORIO = 30;
const STORES = ['movimientos', 'categorias', 'presupuestos'];
// Claves de meta que no viajan en el backup (son del dispositivo, no de los datos).
const META_LOCAL = new Set(['lastBackupAt', 'seededAt', 'backupSnoozeUntil']);
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
  const [movimientos, categorias, presupuestos, meta] = await Promise.all(
    [...STORES, 'meta'].map((s) => getAll(s)));
  const data = {
    app: APP_ID,
    schemaVersion: DB_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      movimientos,
      categorias,
      presupuestos,
      meta: meta.filter((m) => !META_LOCAL.has(m.key)),
    },
  };
  const json = JSON.stringify(data, null, 1);
  return {
    blob: new Blob([json], { type: 'application/json' }),
    nombre: `gestor-gastos-backup-${todayISO()}.json`,
    cantidad: movimientos.length,
  };
}

export const marcarBackupHecho = () => setMeta('lastBackupAt', new Date().toISOString());

/** Último backup y si corresponde recordarlo (más de 30 días, o nunca y la app tiene más de 30 días). */
export async function estadoBackup() {
  const [last, seeded, snooze, cantidad] = await Promise.all([
    getMeta('lastBackupAt'),
    getMeta('seededAt'),
    getMeta('backupSnoozeUntil'),
    tx('movimientos', 'readonly', ({ movimientos }) => req(movimientos.count())),
  ]);
  const diasDesde = (iso) => (iso ? Math.floor((Date.now() - Date.parse(iso)) / 86_400_000) : null);
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

/** Preparado para backups de esquemas viejos: acá se transformarían a la versión actual. */
function migrarBackup(backup) {
  // DB_VERSION 1: no hay nada que migrar todavía.
  return backup.data;
}

const pick = (obj, keys) => Object.fromEntries(keys.map((k) => [k, obj[k]]));
const esTexto = (v) => typeof v === 'string' && v.length > 0;

/**
 * Valida un backup ya parseado. No toca la base.
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
  const err = (msg) => { if (errores.length < MAX_ERRORES) errores.push(msg); };
  const now = new Date().toISOString();
  const tiempos = (r) => ({
    createdAt: esTexto(r.createdAt) ? r.createdAt : now,
    updatedAt: esTexto(r.updatedAt) ? r.updatedAt : now,
  });
  const primerError = (errs) => Object.values(errs)[0];

  // Categorías
  const catIds = new Map();
  const categorias = raw.categorias.map((c, i) => {
    const r = { ...pick(c ?? {}, ['id', 'ambito', 'tipo', 'nombre', 'emoji', 'color']), ...tiempos(c ?? {}) };
    r.archivada = c?.archivada ? 1 : 0;
    r.orden = Number.isFinite(c?.orden) ? c.orden : i;
    const e = validarCategoria(r);
    if (!esTexto(r.id)) err(`Categoría ${i + 1}: falta el id.`);
    else if (catIds.has(r.id)) err(`Categoría ${i + 1}: id repetido.`);
    else if (Object.keys(e).length) err(`Categoría ${i + 1} ("${r.nombre ?? '?'}"): ${primerError(e)}`);
    else catIds.set(r.id, r);
    return r;
  });

  // Movimientos
  const movIds = new Set();
  const movimientos = raw.movimientos.map((m, i) => {
    const r = {
      ...pick(m ?? {}, ['id', 'ambito', 'tipo', 'montoCentavos', 'categoriaId', 'fecha']),
      nota: typeof m?.nota === 'string' ? m.nota : '',
      ...tiempos(m ?? {}),
    };
    const e = validarMovimiento(r);
    const cat = catIds.get(r.categoriaId);
    if (!esTexto(r.id)) err(`Movimiento ${i + 1}: falta el id.`);
    else if (movIds.has(r.id)) err(`Movimiento ${i + 1}: id repetido.`);
    else if (Object.keys(e).length) err(`Movimiento ${i + 1}: ${primerError(e)}`);
    else if (!cat || cat.ambito !== r.ambito || cat.tipo !== r.tipo) err(`Movimiento ${i + 1}: su categoría no existe o no corresponde.`);
    movIds.add(r.id);
    return r;
  });

  // Presupuestos
  const presIds = new Set();
  const presPorCat = new Set();
  const presupuestos = raw.presupuestos.map((p, i) => {
    const r = { ...pick(p ?? {}, ['id', 'ambito', 'categoriaId', 'montoCentavos']), ...tiempos(p ?? {}) };
    const e = validarPresupuesto(r);
    const cat = catIds.get(r.categoriaId);
    if (!esTexto(r.id)) err(`Presupuesto ${i + 1}: falta el id.`);
    else if (presIds.has(r.id)) err(`Presupuesto ${i + 1}: id repetido.`);
    else if (Object.keys(e).length) err(`Presupuesto ${i + 1}: ${primerError(e)}`);
    else if (!cat || cat.ambito !== r.ambito || cat.tipo !== 'gasto') err(`Presupuesto ${i + 1}: su categoría no existe o no es de gasto.`);
    else if (presPorCat.has(r.categoriaId)) err(`Presupuesto ${i + 1}: hay dos presupuestos para la misma categoría.`);
    presIds.add(r.id);
    presPorCat.add(r.categoriaId);
    return r;
  });

  // Meta: solo preferencias conocidas (ámbito actual y últimas categorías usadas).
  const meta = (Array.isArray(raw.meta) ? raw.meta : [])
    .filter((m) => m && typeof m.key === 'string' && !META_LOCAL.has(m.key)
      && (m.key === 'ambitoActual' || m.key.startsWith('ultimaCat:')))
    .map((m) => ({ key: m.key, value: m.value }));

  if (errores.length) return { ok: false, errores };

  const resumen = { exportedAt: esTexto(backup.exportedAt) ? backup.exportedAt : null, porAmbito: {} };
  for (const a of Object.keys(AMBITOS)) {
    resumen.porAmbito[a] = {
      movimientos: movimientos.filter((m) => m.ambito === a).length,
      categorias: categorias.filter((c) => c.ambito === a).length,
      presupuestos: presupuestos.filter((p) => p.ambito === a).length,
    };
  }
  return { ok: true, errores: [], data: { movimientos, categorias, presupuestos, meta }, resumen };
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
  const [movimientos, categorias, presupuestos] = await Promise.all(STORES.map((s) => getAll(s)));
  const porAmbito = {};
  for (const a of Object.keys(AMBITOS)) {
    porAmbito[a] = {
      movimientos: movimientos.filter((m) => m.ambito === a).length,
      categorias: categorias.filter((c) => c.ambito === a).length,
      presupuestos: presupuestos.filter((p) => p.ambito === a).length,
    };
  }
  return porAmbito;
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
