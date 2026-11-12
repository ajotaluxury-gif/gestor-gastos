// Operaciones de dominio sobre la base: categorías y movimientos.
import { tx, req, get, getAll } from './db.js';
import { stamp } from './records.js';
import { isValidISODate, monthBounds } from './dates.js';
import { AMBITOS } from './state.js';
import { MAX_CENTAVOS } from './money.js';

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
export const normalizarNombre = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

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
  return tx(['categorias', 'movimientos', 'presupuestos', 'fijos'], 'readwrite', async ({ categorias, movimientos, presupuestos, fijos }) => {
    const usos = await req(movimientos.index('categoriaId').count(id));
    if (usos > 0) {
      throw new ValidationError({ general: 'Tiene movimientos cargados: archivala en lugar de borrarla.' });
    }
    if (await req(fijos.index('categoriaId').count(id)) > 0) {
      throw new ValidationError({ general: 'La usa un gasto fijo: cambiale la categoría a ese gasto o archivala.' });
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
    // Mientras tanto pudo haberse creado otra con el mismo nombre.
    const repetida = (await req(categorias.index('ambito').getAll(categoria.ambito))).find((c) =>
      c.id !== categoria.id && c.tipo === categoria.tipo
      && normalizarNombre(c.nombre) === normalizarNombre(categoria.nombre));
    if (repetida) {
      throw new ValidationError({
        general: `No se puede deshacer: ya existe otra categoría "${repetida.nombre}". Renombrala primero.`,
      });
    }
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

/**
 * Devuelve un objeto campo → mensaje (vacío si está todo bien).
 * `tope: false` no aplica el máximo por movimiento (para datos ya guardados por versiones anteriores).
 */
export function validarMovimiento(m, { tope = true } = {}) {
  const errors = {};
  if (!AMBITOS[m.ambito]) errors.ambito = 'Ámbito inválido.';
  if (!TIPOS.includes(m.tipo)) errors.tipo = 'Elegí si es gasto o ingreso.';
  if (!Number.isSafeInteger(m.montoCentavos) || m.montoCentavos <= 0) errors.monto = 'Ingresá un monto mayor a cero.';
  else if (tope && m.montoCentavos > MAX_CENTAVOS) errors.monto = 'El monto es demasiado grande.';
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
/**
 * Borra un movimiento. Si salió de tildar un gasto fijo, también se desmarca ese pago.
 * Devuelve { movimiento, pago } para poder deshacer con restaurarMovimiento().
 */
export function borrarMovimiento(id) {
  return tx(['movimientos', 'pagos'], 'readwrite', async ({ movimientos, pagos }) => {
    const movimiento = await req(movimientos.get(id));
    if (!movimiento) return { movimiento: null, pago: null };
    const pago = await req(pagos.index('movimientoId').get(id)) ?? null;
    if (pago) await req(pagos.delete(pago.id));
    await req(movimientos.delete(id));
    return { movimiento, pago };
  });
}

/**
 * Deshace un borrado (acepta { movimiento, pago } o el registro solo).
 * Si mientras tanto se borró su categoría, no se restaura: quedaría huérfano.
 */
export const restaurarMovimiento = (borrado) =>
  tx(['movimientos', 'categorias', 'pagos', 'fijos'], 'readwrite', async ({ movimientos, categorias, pagos, fijos }) => {
    const { movimiento, pago } = borrado.movimiento ? borrado : { movimiento: borrado, pago: null };
    const cat = await req(categorias.get(movimiento.categoriaId));
    if (!cat || cat.ambito !== movimiento.ambito || cat.tipo !== movimiento.tipo) {
      throw new ValidationError({ general: 'No se puede deshacer: la categoría de ese movimiento ya no existe.' });
    }
    await req(movimientos.put(movimiento));
    // El pago del fijo vuelve solo si el fijo sigue y ese mes no se volvió a marcar.
    if (pago && await req(fijos.get(pago.fijoId)) && !await req(pagos.index('fijo_mes').get([pago.fijoId, pago.mes]))) {
      await req(pagos.put(pago));
    }
  });

// ---------- Presupuestos ----------
// Un presupuesto es un tope mensual fijo para una categoría de gasto (único por categoría).

export const UMBRAL_ALERTA = 0.8;
const NIVEL_RANK = { ok: 0, alerta: 1, excedido: 2 };

/** Estado de un presupuesto: alerta desde el 80 %, excedido al pasar el 100 %. */
export function estadoPresupuesto(gastado, limite) {
  const pct = limite > 0 ? gastado / limite : 0;
  const nivel = pct > 1 ? 'excedido' : pct >= UMBRAL_ALERTA ? 'alerta' : 'ok';
  return { pct, nivel, restante: limite - gastado };
}

export const listPresupuestos = (ambito) => getAll('presupuestos', 'ambito', ambito);

export function validarPresupuesto(p, { tope = true } = {}) {
  const errors = {};
  if (!AMBITOS[p.ambito]) errors.ambito = 'Ámbito inválido.';
  if (!p.categoriaId) errors.categoria = 'Elegí una categoría.';
  if (!Number.isSafeInteger(p.montoCentavos) || p.montoCentavos <= 0) errors.monto = 'Ingresá un monto mayor a cero.';
  else if (tope && p.montoCentavos > MAX_CENTAVOS) errors.monto = 'El monto es demasiado grande.';
  return errors;
}

/** Crea o actualiza el presupuesto de una categoría de gasto. */
export async function guardarPresupuesto({ ambito, categoriaId, montoCentavos }) {
  const errors = validarPresupuesto({ ambito, categoriaId, montoCentavos });
  if (Object.keys(errors).length) throw new ValidationError(errors);
  return tx(['presupuestos', 'categorias'], 'readwrite', async ({ presupuestos, categorias }) => {
    const cat = await req(categorias.get(categoriaId));
    if (!cat || cat.ambito !== ambito || cat.tipo !== 'gasto') {
      throw new ValidationError({ categoria: 'Elegí una categoría de gasto de este ámbito.' });
    }
    const prev = await req(presupuestos.index('categoriaId').get(categoriaId));
    const record = stamp({ ...prev, ambito, categoriaId, montoCentavos });
    await req(presupuestos.put(record));
    return record;
  });
}

export function borrarPresupuesto(id) {
  return tx('presupuestos', 'readwrite', async ({ presupuestos }) => {
    const record = await req(presupuestos.get(id));
    if (record) await req(presupuestos.delete(id));
    return record;
  });
}

export const restaurarPresupuesto = (record) =>
  tx(['presupuestos', 'categorias'], 'readwrite', async ({ presupuestos, categorias }) => {
    const cat = await req(categorias.get(record.categoriaId));
    if (!cat) throw new ValidationError({ general: 'No se puede deshacer: la categoría ya no existe.' });
    const otro = await req(presupuestos.index('categoriaId').get(record.categoriaId));
    if (otro && otro.id !== record.id) {
      throw new ValidationError({ general: `No se puede deshacer: "${cat.nombre}" ya tiene otro presupuesto.` });
    }
    await req(presupuestos.put(record));
  });

/**
 * Presupuestos activos de un mes con lo gastado y su estado, más urgentes primero.
 * Los de categorías archivadas no se muestran.
 */
export async function resumenPresupuestos(ambito, ym) {
  const [pres, cats, movs] = await Promise.all([
    listPresupuestos(ambito), listCategorias(ambito), listMovimientosMes(ambito, ym),
  ]);
  const catMap = new Map(cats.map((c) => [c.id, c]));
  const gastos = new Map(sumarPorCategoria(movs, 'gasto').map((f) => [f.categoriaId, f.monto]));
  return pres
    .map((p) => {
      const gastado = gastos.get(p.categoriaId) ?? 0;
      return { presupuesto: p, categoria: catMap.get(p.categoriaId), gastado, ...estadoPresupuesto(gastado, p.montoCentavos) };
    })
    .filter((x) => x.categoria && !x.categoria.archivada)
    .sort((a, b) => b.pct - a.pct || a.categoria.orden - b.categoria.orden);
}

/**
 * Después de guardar un gasto: si hizo que su presupuesto suba de nivel
 * (ok → alerta → excedido), devuelve el nuevo estado; si no, null.
 * @param rec  movimiento guardado
 * @param prev movimiento antes de editar (o null si es nuevo)
 */
export async function cruceDeUmbral(rec, prev) {
  if (rec.tipo !== 'gasto') return null;
  const pres = await tx('presupuestos', 'readonly', ({ presupuestos }) =>
    req(presupuestos.index('categoriaId').get(rec.categoriaId)));
  if (!pres) return null;
  const ym = rec.fecha.slice(0, 7);
  const gastado = (await listMovimientosMes(rec.ambito, ym))
    .filter((m) => m.tipo === 'gasto' && m.categoriaId === rec.categoriaId)
    .reduce((s, m) => s + m.montoCentavos, 0);
  const mismoLugar = prev && prev.tipo === 'gasto' && prev.categoriaId === rec.categoriaId && prev.fecha.slice(0, 7) === ym;
  const antes = estadoPresupuesto(gastado - rec.montoCentavos + (mismoLugar ? prev.montoCentavos : 0), pres.montoCentavos);
  const ahora = estadoPresupuesto(gastado, pres.montoCentavos);
  return NIVEL_RANK[ahora.nivel] > NIVEL_RANK[antes.nivel] ? ahora : null;
}

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

/** Suma por categoría de un tipo, de mayor a menor: [{ categoriaId, monto }]. */
export function sumarPorCategoria(movs, tipo) {
  const sumas = new Map();
  for (const m of movs) {
    if (m.tipo === tipo) sumas.set(m.categoriaId, (sumas.get(m.categoriaId) ?? 0) + m.montoCentavos);
  }
  return [...sumas].map(([categoriaId, monto]) => ({ categoriaId, monto })).sort((a, b) => b.monto - a.monto);
}

/**
 * Agrupa las porciones chicas en "otras" para que el gráfico se lea bien.
 * @returns {{categoriaId: string|null, monto: number}[]} (categoriaId null = "Otras")
 */
export function agruparResto(filas, max) {
  if (filas.length <= max) return filas;
  const resto = filas.slice(max - 1).reduce((s, f) => s + f.monto, 0);
  return [...filas.slice(0, max - 1), { categoriaId: null, monto: resto }];
}

/** Variación relativa (0.12 = +12 %) o null si no hay base para comparar. */
export const variacion = (actual, anterior) => (anterior > 0 ? (actual - anterior) / anterior : null);

/** Más recientes primero: por fecha y, dentro del día, por momento de carga. */
export const ordenarMovimientos = (movs) =>
  movs.sort((a, b) => b.fecha.localeCompare(a.fecha) || b.createdAt.localeCompare(a.createdAt));
