// Gastos fijos y cuotas (alquiler, servicios, préstamos, tarjetas…) y su checklist mensual.
//
// fijo: { id, ambito, nombre, categoriaId, montoCentavos, dia (1-31 | null),
//         inicio 'aaaa-mm' (mes de la cuota 1 o desde cuándo corre),
//         desde  'aaaa-mm' (primer mes que aparece en la checklist; las cuotas anteriores ya estaban pagas),
//         cuotas (n | null = todos los meses), hasta ('aaaa-mm' | null = sin fin) }
// pago:  { id, ambito, fijoId, mes 'aaaa-mm', movimientoId, montoCentavos, fecha }
import { tx, req, getAll } from './db.js';
import { stamp } from './records.js';
import { AMBITOS } from './state.js';
import { addMonths, lastDayOfMonth, isValidISODate, todayISO } from './dates.js';
import { MAX_CENTAVOS } from './money.js';
import { ValidationError, validarMovimiento } from './repo.js';

export const NOMBRE_FIJO_MAX = 40;
export const CUOTAS_MAX = 600;
const YM = /^\d{4}-(0[1-9]|1[0-2])$/;

export const esMes = (s) => typeof s === 'string' && YM.test(s);

/** Meses de diferencia: mesesEntre('2026-01', '2026-03') === 2 */
export function mesesEntre(a, b) {
  const [ya, ma] = a.split('-').map(Number);
  const [yb, mb] = b.split('-').map(Number);
  return (yb * 12 + mb) - (ya * 12 + ma);
}

/** Último mes en que aparece (o null si no termina). */
export function ultimoMes(f) {
  const porCuotas = f.cuotas ? addMonths(f.inicio, f.cuotas - 1) : null;
  if (porCuotas && f.hasta) return porCuotas < f.hasta ? porCuotas : f.hasta;
  return porCuotas ?? f.hasta ?? null;
}

/**
 * Qué le toca a un fijo en un mes.
 * @returns {null | {numero: number|null, total: number|null, vence: string|null}}
 */
export function cuotaEnMes(f, ym) {
  if (ym < f.desde || ym < f.inicio) return null;
  const ult = ultimoMes(f);
  if (ult && ym > ult) return null;
  const vence = f.dia ? `${ym}-${String(Math.min(f.dia, Number(lastDayOfMonth(ym).slice(8)))).padStart(2, '0')}` : null;
  return { numero: f.cuotas ? mesesEntre(f.inicio, ym) + 1 : null, total: f.cuotas ?? null, vence };
}

/** Días entre dos fechas "aaaa-mm-dd" (b − a). */
export function diasEntre(a, b) {
  const t = (s) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
  return Math.round((t(b) - t(a)) / 86_400_000);
}

export const DIAS_AVISO = 3;

/** Estado de un vencimiento sin pagar respecto de hoy. */
export function estadoVencimiento(vence, hoy = todayISO()) {
  if (!vence) return { nivel: 'sin', dias: null };
  const dias = diasEntre(hoy, vence);
  if (dias < 0) return { nivel: 'vencido', dias };
  if (dias === 0) return { nivel: 'hoy', dias };
  if (dias <= DIAS_AVISO) return { nivel: 'pronto', dias };
  return { nivel: 'ok', dias };
}

/**
 * Capital comprometido en cuotas desde `desdeYm` (inclusive): lo que falta pagar de los planes en cuotas.
 * @param pagados Set de `${fijoId}|${mes}`
 */
export function capitalComprometido(fijos, pagados, desdeYm) {
  let monto = 0;
  let cuotas = 0;
  let planes = 0;
  for (const f of fijos) {
    if (!f.cuotas) continue;
    const ult = ultimoMes(f);
    let mes = [f.inicio, f.desde, desdeYm].sort().at(-1);
    let cuenta = 0;
    while (mes <= ult) {
      if (!pagados.has(`${f.id}|${mes}`)) { monto += f.montoCentavos; cuenta++; }
      mes = addMonths(mes, 1);
    }
    if (cuenta) { cuotas += cuenta; planes++; }
  }
  return { monto, cuotas, planes };
}

// ---------- Validación y guardado ----------

export function validarFijo(f, { tope = true } = {}) {
  const errors = {};
  if (!AMBITOS[f.ambito]) errors.ambito = 'Ámbito inválido.';
  const nombre = typeof f.nombre === 'string' ? f.nombre.trim() : '';
  if (!nombre) errors.nombre = 'Poné un nombre (alquiler, préstamo, Visa…).';
  else if (nombre.length > NOMBRE_FIJO_MAX) errors.nombre = `Hasta ${NOMBRE_FIJO_MAX} caracteres.`;
  if (!f.categoriaId) errors.categoria = 'Elegí una categoría.';
  if (!Number.isSafeInteger(f.montoCentavos) || f.montoCentavos <= 0) errors.monto = 'Ingresá un monto mayor a cero.';
  else if (tope && f.montoCentavos > MAX_CENTAVOS) errors.monto = 'El monto es demasiado grande.';
  if (f.dia != null && (!Number.isInteger(f.dia) || f.dia < 1 || f.dia > 31)) errors.dia = 'El día tiene que ser entre 1 y 31.';
  if (!esMes(f.inicio)) errors.inicio = 'Mes inválido.';
  if (!esMes(f.desde)) errors.inicio = 'Mes inválido.';
  if (f.cuotas != null && (!Number.isInteger(f.cuotas) || f.cuotas < 1 || f.cuotas > CUOTAS_MAX)) {
    errors.cuotas = `Entre 1 y ${CUOTAS_MAX} cuotas.`;
  }
  if (f.hasta != null && !esMes(f.hasta)) errors.hasta = 'Mes inválido.';
  if (!errors.inicio && f.desde < f.inicio) errors.inicio = 'Mes inválido.';
  if (!errors.cuotas && !errors.inicio && f.cuotas && f.desde > addMonths(f.inicio, f.cuotas - 1)) {
    errors.cuotaActual = 'La cuota actual no puede ser mayor a la cantidad de cuotas.';
  }
  return errors;
}

export async function listFijos(ambito) {
  const all = await getAll('fijos', 'ambito', ambito);
  return all.sort((a, b) => (a.dia ?? 99) - (b.dia ?? 99) || a.nombre.localeCompare(b.nombre, 'es'));
}

export const listPagosMes = (ambito, ym) => getAll('pagos', 'ambito_mes', [ambito, ym]);
export const listPagos = (ambito) =>
  getAll('pagos', 'ambito_mes', IDBKeyRange.bound([ambito, '0000-00'], [ambito, '9999-99']));

export function guardarFijo(data) {
  return tx(['fijos', 'categorias'], 'readwrite', async ({ fijos, categorias }) => {
    const prev = data.id ? await req(fijos.get(data.id)) : undefined;
    if (data.id && !prev) throw new ValidationError({ general: 'Ese gasto fijo ya no existe.' });
    const fields = {
      ambito: prev?.ambito ?? data.ambito,
      nombre: (data.nombre ?? '').trim(),
      categoriaId: data.categoriaId,
      montoCentavos: data.montoCentavos,
      dia: data.dia ?? null,
      inicio: data.inicio,
      desde: data.desde,
      cuotas: data.cuotas ?? null,
      hasta: data.hasta ?? null,
    };
    const errors = validarFijo(fields);
    if (Object.keys(errors).length) throw new ValidationError(errors);
    const cat = await req(categorias.get(fields.categoriaId));
    if (!cat || cat.ambito !== fields.ambito || cat.tipo !== 'gasto') {
      throw new ValidationError({ categoria: 'Elegí una categoría de gasto.' });
    }
    const record = stamp({ ...prev, ...fields });
    await req(fijos.put(record));
    return record;
  });
}

/** Deja de aparecer después de `ultimo` (inclusive). null = reactivar. */
export function terminarFijo(id, ultimo) {
  return tx('fijos', 'readwrite', async ({ fijos }) => {
    const prev = await req(fijos.get(id));
    if (!prev) throw new ValidationError({ general: 'Ese gasto fijo ya no existe.' });
    const record = stamp({ ...prev, hasta: ultimo });
    await req(fijos.put(record));
    return record;
  });
}

/** Borra el fijo y sus marcas de pago; los gastos ya cargados quedan. */
export function borrarFijo(id) {
  return tx(['fijos', 'pagos'], 'readwrite', async ({ fijos, pagos }) => {
    const fijo = await req(fijos.get(id));
    const susPagos = await req(pagos.index('fijoId').getAll(id));
    await Promise.all(susPagos.map((p) => req(pagos.delete(p.id))));
    await req(fijos.delete(id));
    return { fijo, pagos: susPagos };
  });
}

export const restaurarFijo = ({ fijo, pagos: susPagos }) =>
  tx(['fijos', 'pagos', 'movimientos'], 'readwrite', async ({ fijos, pagos, movimientos }) => {
    await req(fijos.put(fijo));
    for (const p of susPagos) {
      const mov = await req(movimientos.get(p.movimientoId));
      const otro = await req(pagos.index('fijo_mes').get([p.fijoId, p.mes]));
      if (mov && !otro) await req(pagos.put(p));
    }
  });

// ---------- Pagar / desmarcar ----------

/** Marca como pagado: crea el gasto y el registro de pago, en una sola transacción. */
export function pagarFijo(fijoId, ym, { montoCentavos, fecha }) {
  return tx(['fijos', 'pagos', 'movimientos', 'categorias'], 'readwrite', async ({ fijos, pagos, movimientos, categorias }) => {
    const f = await req(fijos.get(fijoId));
    if (!f) throw new ValidationError({ general: 'Ese gasto fijo ya no existe.' });
    const cuota = cuotaEnMes(f, ym);
    if (!cuota) throw new ValidationError({ general: 'Ese gasto no corresponde a este mes.' });
    if (await req(pagos.index('fijo_mes').get([fijoId, ym]))) {
      throw new ValidationError({ general: 'Ya estaba marcado como pagado.' });
    }
    const cat = await req(categorias.get(f.categoriaId));
    if (!cat) throw new ValidationError({ general: 'La categoría de este gasto ya no existe. Editalo y elegí otra.' });
    const nota = cuota.total ? `${f.nombre} (cuota ${cuota.numero}/${cuota.total})` : f.nombre;
    const mov = { ambito: f.ambito, tipo: 'gasto', montoCentavos, categoriaId: f.categoriaId, fecha, nota: nota.slice(0, 200) };
    const errors = validarMovimiento(mov);
    if (Object.keys(errors).length) throw new ValidationError(errors);
    const movimiento = stamp(mov);
    const pago = stamp({ ambito: f.ambito, fijoId, mes: ym, movimientoId: movimiento.id, montoCentavos, fecha });
    await req(movimientos.put(movimiento));
    await req(pagos.put(pago));
    return { pago, movimiento };
  });
}

/** Desmarca: borra el registro de pago y el gasto que se había creado. */
export function desmarcarPago(pagoId) {
  return tx(['pagos', 'movimientos'], 'readwrite', async ({ pagos, movimientos }) => {
    const pago = await req(pagos.get(pagoId));
    if (!pago) return null;
    const movimiento = pago.movimientoId ? await req(movimientos.get(pago.movimientoId)) : null;
    if (movimiento) await req(movimientos.delete(movimiento.id));
    await req(pagos.delete(pagoId));
    return { pago, movimiento };
  });
}

export const restaurarPago = ({ pago, movimiento }) =>
  tx(['pagos', 'movimientos', 'fijos', 'categorias'], 'readwrite', async ({ pagos, movimientos, fijos, categorias }) => {
    if (!await req(fijos.get(pago.fijoId))) throw new ValidationError({ general: 'No se puede deshacer: el gasto fijo ya no existe.' });
    if (await req(pagos.index('fijo_mes').get([pago.fijoId, pago.mes]))) {
      throw new ValidationError({ general: 'No se puede deshacer: ese mes ya figura como pagado.' });
    }
    if (movimiento) {
      if (!await req(categorias.get(movimiento.categoriaId))) {
        throw new ValidationError({ general: 'No se puede deshacer: la categoría ya no existe.' });
      }
      await req(movimientos.put(movimiento));
    }
    await req(pagos.put(pago));
  });

/**
 * Checklist de un mes: cada fijo que corresponde, con su pago (si hay) y el estado del vencimiento.
 * El monto pagado se toma del gasto (por si se editó después).
 */
export async function checklistMes(ambito, ym) {
  const [fijos, pagos, cats] = await Promise.all([listFijos(ambito), listPagosMes(ambito, ym), getAll('categorias', 'ambito', ambito)]);
  const movIds = pagos.map((p) => p.movimientoId).filter(Boolean);
  const movs = movIds.length
    ? await tx('movimientos', 'readonly', ({ movimientos }) => Promise.all(movIds.map((id) => req(movimientos.get(id)))))
    : [];
  const movMap = new Map(movs.filter(Boolean).map((m) => [m.id, m]));
  const catMap = new Map(cats.map((c) => [c.id, c]));
  const pagoDe = new Map(pagos.map((p) => [p.fijoId, p]));
  const hoy = todayISO();
  const items = [];
  for (const f of fijos) {
    const cuota = cuotaEnMes(f, ym);
    if (!cuota) continue;
    const pago = pagoDe.get(f.id) ?? null;
    const mov = pago ? movMap.get(pago.movimientoId) : null;
    items.push({
      fijo: f,
      cuota,
      categoria: catMap.get(f.categoriaId) ?? null,
      pago,
      montoPagado: pago ? (mov?.montoCentavos ?? pago.montoCentavos) : 0,
      estado: pago ? { nivel: 'pagado', dias: null } : estadoVencimiento(cuota.vence, hoy),
    });
  }
  const orden = { vencido: 0, hoy: 1, pronto: 2, ok: 3, sin: 4, pagado: 5 };
  items.sort((a, b) => orden[a.estado.nivel] - orden[b.estado.nivel]
    || (a.cuota.vence ?? '9999').localeCompare(b.cuota.vence ?? '9999')
    || a.fijo.nombre.localeCompare(b.fijo.nombre, 'es'));
  return items;
}

/** Totales de la checklist de un mes. */
export function totalesChecklist(items) {
  let comprometido = 0;
  let pagado = 0;
  for (const it of items) {
    comprometido += it.pago ? it.montoPagado : it.fijo.montoCentavos;
    if (it.pago) pagado += it.montoPagado;
  }
  return { comprometido, pagado, falta: comprometido - pagado };
}

/** Para el globito: fijos del mes sin pagar que están vencidos o vencen pronto. */
export async function alertasFijos(ambito, ym) {
  const items = await checklistMes(ambito, ym);
  return items.filter((it) => ['vencido', 'hoy', 'pronto'].includes(it.estado.nivel));
}

export const isValidFecha = isValidISODate;
