// Operaciones de dominio sobre la base: categorías y movimientos.
import { tx, req, get, getAll } from './db.js';
import { stamp } from './records.js';
import { isValidISODate, monthBounds } from './dates.js';
import { AMBITOS } from './state.js';

export const TIPOS = ['gasto', 'ingreso'];
export const NOTA_MAX = 200;

export class ValidationError extends Error {
  /** @param {Record<string, string>} errors campo → mensaje */
  constructor(errors) {
    super(Object.values(errors)[0] ?? 'Datos inválidos.');
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

// ---------- Categorías ----------

export const NOMBRE_MAX = 40;

const porOrden = (a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es');
const normalizarNombre = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

export async function listCategorias(ambito) {
  const all = await getAll('categorias', 'ambito', ambito);
  return all.sort(porOrden);
}

export const getCategoria = (id) => get('categorias', id);

/** Cuenta los grafemas (un emoji compuesto como 🏋️ cuenta como uno). */
function graphemes(s) {
  if (globalThis.Intl?.Segmenter) return [...new Intl.Segmenter('es', { granularity: 'grapheme' }).segment(s)].length;
  return [...s].length;
}

export function validarCategoria(c) {
  const errors = {};
  if (!AMBITOS[c.ambito]) errors.ambito = 'Ámbito inválido.';
  if (!TIPOS.includes(c.tipo)) errors.tipo = 'Elegí si es de gasto o de ingreso.';
  const nombre = typeof c.nombre === 'string' ? c.nombre.trim() : '';
  if (!nombre) errors.nombre = 'Poné un nombre.';
  else if (nombre.length > NOMBRE_MAX) errors.nombre = `El nombre puede tener hasta ${NOMBRE_MAX} caracteres.`;
  const emoji = typeof c.emoji === 'string' ? c.emoji.trim() : '';
  if (!emoji) errors.emoji = 'Elegí un emoji.';
  else if (graphemes(emoji) !== 1 || !/\p{Extended_Pictographic}|\p{Regional_Indicator}|⃣/u.test(emoji)) {
    errors.emoji = 'Usá un solo emoji.';
  }
  if (!/^#[0-9a-f]{6}$/i.test(c.color ?? '')) errors.color = 'Elegí un color.';
  return errors;
}

/** Crea o edita una categoría. Al editar, el ámbito y el tipo no cambian. */
export async function guardarCategoria(data) {
  return tx('categorias', 'readwrite', async ({ categorias }) => {
    const prev = data.id ? await req(categorias.get(data.id)) : undefined;
    if (data.id && !prev) throw new ValidationError({ nombre: 'Esa categoría ya no existe.' });
    const fields = {
      ambito: prev?.ambito ?? data.ambito,
      tipo: prev?.tipo ?? data.tipo,
      nombre: (data.nombre ?? '').trim(),
      emoji: (data.emoji ?? '').trim(),
      color: data.color,
    };
    const errors = validarCategoria(fields);
    if (Object.keys(errors).length) throw new ValidationError(errors);

    const hermanas = (await req(categorias.index('ambito').getAll(fields.ambito)))
      .filter((c) => c.tipo === fields.tipo && c.id !== data.id);
    const repetida = hermanas.find((c) => normalizarNombre(c.nombre) === normalizarNombre(fields.nombre));
    if (repetida) {
      throw new ValidationError({
        nombre: `Ya existe "${repetida.nombre}"${repetida.archivada ? ' (archivada)' : ''}.`,
      });
    }

    const record = stamp(prev
      ? { ...prev, ...fields }
      : { ...fields, archivada: 0, orden: Math.max(-1, ...hermanas.map((c) => c.orden)) + 1 });
    await req(categorias.put(record));
    return record;
  });
}

export function archivarCategoria(id, archivar = true) {
  return tx('categorias', 'readwrite', async ({ categorias }) => {
    const prev = await req(categorias.get(id));
    if (!prev) throw new ValidationError({ nombre: 'Esa categoría ya no existe.' });
    const record = stamp({ ...prev, archivada: archivar ? 1 : 0 });
    await req(categorias.put(record));
    return record;
  });
}

/** Mueve una categoría un lugar arriba (-1) o abajo (+1) entre las activas de su tipo. */
export function moverCategoria(id, dir) {
  return tx('categorias', 'readwrite', async ({ categorias }) => {
    const cat = await req(categorias.get(id));
    if (!cat) return;
    const lista = (await req(categorias.index('ambito').getAll(cat.ambito)))
      .filter((c) => c.tipo === cat.tipo && !c.archivada)
      .sort(porOrden);
    const i = lista.findIndex((c) => c.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= lista.length) return;
    [lista[i], lista[j]] = [lista[j], lista[i]];
    // Renumeramos todo para que el orden quede compacto y sin empates.
    await Promise.all(lista.map((c, orden) =>
      (c.orden === orden ? null : req(categorias.put({ ...c, orden, updatedAt: new Date().toISOString() })))));
  });
}

/** Cantidad de movimientos de una categoría. */
export const contarUsos = (id) =>
  tx('movimientos', 'readonly', ({ movimientos }) => req(movimientos.index('categoriaId').count(id)));

/** Cantidad de movimientos por categoría en un ámbito. */
export async function contarPorCategoria(ambito) {
  const movs = await listMovimientos(ambito);
  const counts = new Map();
  for (const m of movs) counts.set(m.categoriaId, (counts.get(m.categoriaId) ?? 0) + 1);
  return counts;
}

/**
 * Borra una categoría (y su presupuesto) solo si no tiene movimientos.
 * Devuelve lo borrado, para poder deshacer con restaurarCategoria().
 */
export function borrarCategoria(id) {
  return tx(['categorias', 'movimientos', 'presupuestos'], 'readwrite', async ({ categorias, movimientos, presupuestos }) => {
    const usos = await req(movimientos.index('categoriaId').count(id));
    if (usos > 0) {
      throw new ValidationError({ general: 'Tiene movimientos cargados: archivala en lugar de borrarla.' });
    }
    const categoria = await req(categorias.get(id));
    const presupuesto = await req(presupuestos.index('categoriaId').get(id));
    if (presupuesto) await req(presupuestos.delete(presupuesto.id));
    await req(categorias.delete(id));
    return { categoria, presupuesto };
  });
}

export const restaurarCategoria = ({ categoria, presupuesto }) =>
  tx(['categorias', 'presupuestos'], 'readwrite', async ({ categorias, presupuestos }) => {
    await req(categorias.put(categoria));
    if (presupuesto) await req(presupuestos.put(presupuesto));
  });

// ---------- Movimientos ----------

/** Movimientos de un ámbito entre dos fechas "aaaa-mm-dd" (inclusive). */
export function listMovimientos(ambito, desde = '0000-01-01', hasta = '9999-12-31') {
  return getAll('movimientos', 'ambito_fecha', IDBKeyRange.bound([ambito, desde], [ambito, hasta]));
}

export const listMovimientosMes = (ambito, ym) => listMovimientos(ambito, ...monthBounds(ym));

export const getMovimiento = (id) => get('movimientos', id);

/** Devuelve un objeto campo → mensaje (vacío si está todo bien). */
export function validarMovimiento(m) {
  const errors = {};
  if (!AMBITOS[m.ambito]) errors.ambito = 'Ámbito inválido.';
  if (!TIPOS.includes(m.tipo)) errors.tipo = 'Elegí si es gasto o ingreso.';
  if (!Number.isSafeInteger(m.montoCentavos) || m.montoCentavos <= 0) errors.monto = 'Ingresá un monto mayor a cero.';
  if (!m.categoriaId) errors.categoria = 'Elegí una categoría.';
  if (!isValidISODate(m.fecha)) errors.fecha = 'Elegí una fecha válida.';
  if (typeof m.nota !== 'string') errors.nota = 'Nota inválida.';
  else if (m.nota.length > NOTA_MAX) errors.nota = `La nota puede tener hasta ${NOTA_MAX} caracteres.`;
  return errors;
}

/** Crea o actualiza un movimiento (si trae id). Devuelve el registro guardado. */
export async function guardarMovimiento(data) {
  const fields = {
    ambito: data.ambito,
    tipo: data.tipo,
    montoCentavos: data.montoCentavos,
    categoriaId: data.categoriaId,
    fecha: data.fecha,
    nota: (data.nota ?? '').trim(),
  };
  const errors = validarMovimiento(fields);
  if (Object.keys(errors).length) throw new ValidationError(errors);

  return tx(['movimientos', 'categorias'], 'readwrite', async ({ movimientos, categorias }) => {
    const cat = await req(categorias.get(fields.categoriaId));
    if (!cat || cat.ambito !== fields.ambito || cat.tipo !== fields.tipo) {
      throw new ValidationError({ categoria: 'La categoría elegida no corresponde a este tipo o ámbito.' });
    }
    const prev = data.id ? await req(movimientos.get(data.id)) : undefined;
    const record = stamp({ ...prev, ...fields });
    await req(movimientos.put(record));
    return record;
  });
}

/** Borra y devuelve el registro borrado (para poder deshacer). */
export function borrarMovimiento(id) {
  return tx('movimientos', 'readwrite', async ({ movimientos }) => {
    const record = await req(movimientos.get(id));
    if (record) await req(movimientos.delete(id));
    return record;
  });
}

/** Vuelve a guardar un registro tal cual estaba (deshacer borrado). */
export const restaurarMovimiento = (record) =>
  tx('movimientos', 'readwrite', ({ movimientos }) => req(movimientos.put(record)));

// ---------- Cálculos ----------

export function totales(movs) {
  let ingresos = 0;
  let gastos = 0;
  for (const m of movs) {
    if (m.tipo === 'ingreso') ingresos += m.montoCentavos;
    else gastos += m.montoCentavos;
  }
  return { ingresos, gastos, balance: ingresos - gastos };
}

/** Más recientes primero: por fecha y, dentro del día, por momento de carga. */
export const ordenarMovimientos = (movs) =>
  movs.sort((a, b) => b.fecha.localeCompare(a.fecha) || b.createdAt.localeCompare(a.createdAt));
