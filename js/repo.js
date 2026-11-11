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

export async function listCategorias(ambito) {
  const all = await getAll('categorias', 'ambito', ambito);
  return all.sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, 'es'));
}

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
