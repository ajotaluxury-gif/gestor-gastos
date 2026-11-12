// Ahorros: cuentas (dónde está la plata), metas, aportes/retiros y cotizaciones manuales.
import { tx, req, get, getAll } from './db.js';
import { stamp } from './records.js';
import { AMBITOS } from './state.js';
import { isValidISODate, monthBounds } from './dates.js';
import { decimalesDe, esMonedaValida, maxDe, formatCantidad, MAX_CENTAVOS } from './money.js';
import { ValidationError, normalizarNombre, NOTA_MAX } from './repo.js';

// ---------- Tipos de cuenta ----------

export const TIPOS_CUENTA = {
  efectivo: {
    label: 'Efectivo', emoji: '💵', moneda: 'ARS', detalleLabel: 'Detalle (opcional)', detalleRequerido: false,
    sugerencias: ['En casa', 'Billetera', 'Alcancía', 'Caja fuerte'],
  },
  banco: {
    label: 'Cuenta de banco', emoji: '🏦', moneda: 'ARS', detalleLabel: '¿Qué banco?', detalleRequerido: true,
    sugerencias: ['Banco Nación', 'Banco Provincia', 'Galicia', 'Santander', 'BBVA', 'Macro', 'ICBC', 'HSBC',
      'Credicoop', 'Ciudad', 'Supervielle', 'Patagonia', 'Comafi', 'Brubank', 'Banco del Sol'],
  },
  billetera: {
    label: 'Billetera virtual', emoji: '📱', moneda: 'ARS', detalleLabel: '¿Qué billetera?', detalleRequerido: true,
    sugerencias: ['Mercado Pago', 'Ualá', 'Naranja X', 'Personal Pay', 'Cuenta DNI', 'MODO', 'Lemon', 'Belo',
      'Prex', 'Astropay'],
  },
  dolar: {
    label: 'Dólares', emoji: '💲', moneda: 'USD', detalleLabel: '¿Qué tipo de dólar?', detalleRequerido: true,
    sugerencias: ['Billete (efectivo)', 'Cuenta en dólares', 'Dólar oficial', 'Dólar blue', 'Dólar tarjeta', 'Dólar cripto'],
  },
  dolar_mep: {
    label: 'Dólar MEP', emoji: '💹', moneda: 'USD', detalleLabel: '¿Dónde está?', detalleRequerido: true,
    sugerencias: ['Broker', 'Banco', 'IOL', 'Balanz', 'Cocos', 'PPI', 'Bull Market'],
  },
  cripto: {
    label: 'Cripto', emoji: '🪙', moneda: null, detalleLabel: '¿Qué cripto? (sigla)', detalleRequerido: true,
    sugerencias: ['BTC', 'ETH', 'USDT', 'USDC', 'DAI', 'SOL', 'BNB', 'ADA', 'XRP'],
  },
};

const DETALLE_MAX = 40;
const NOTA_CUENTA_MAX = 60;

/** Moneda que corresponde a una cuenta: la fija del tipo, o la sigla de la cripto. */
export function monedaDeCuenta(tipo, detalle) {
  const t = TIPOS_CUENTA[tipo];
  if (!t) return null;
  return t.moneda ?? String(detalle ?? '').trim().toUpperCase();
}

export function etiquetaCuenta(c) {
  const t = TIPOS_CUENTA[c.tipo];
  const base = c.detalle ? `${t?.label ?? c.tipo} · ${c.detalle}` : (t?.label ?? c.tipo);
  return c.nota ? `${base} (${c.nota})` : base;
}

export function validarCuenta(c) {
  const errors = {};
  if (!AMBITOS[c.ambito]) errors.ambito = 'Ámbito inválido.';
  const t = TIPOS_CUENTA[c.tipo];
  if (!t) errors.tipo = 'Elegí dónde está la plata.';
  const detalle = typeof c.detalle === 'string' ? c.detalle.trim() : '';
  if (t?.detalleRequerido && !detalle) errors.detalle = c.tipo === 'cripto' ? 'Escribí la sigla, por ejemplo BTC.' : 'Completá este dato.';
  else if (detalle.length > DETALLE_MAX) errors.detalle = `Hasta ${DETALLE_MAX} caracteres.`;
  if (c.tipo === 'cripto' && detalle && !/^[A-Za-z0-9]{2,10}$/.test(detalle)) {
    errors.detalle = 'Usá la sigla de la cripto, por ejemplo BTC o USDT.';
  }
  if (typeof c.nota !== 'string') errors.nota = 'Aclaración inválida.';
  else if (c.nota.length > NOTA_CUENTA_MAX) errors.nota = `Hasta ${NOTA_CUENTA_MAX} caracteres.`;
  if (t && !errors.detalle && !esMonedaValida(monedaDeCuenta(c.tipo, detalle))) errors.detalle = 'Moneda inválida.';
  return errors;
}

export async function listCuentas(ambito) {
  const all = await getAll('cuentas', 'ambito', ambito);
  return all.sort((a, b) => a.archivada - b.archivada || a.createdAt.localeCompare(b.createdAt));
}

/** Crea o edita. Al editar, el tipo (y la moneda) no cambian. */
export function guardarCuenta(data) {
  return tx('cuentas', 'readwrite', async ({ cuentas }) => {
    const prev = data.id ? await req(cuentas.get(data.id)) : undefined;
    if (data.id && !prev) throw new ValidationError({ general: 'Esa cuenta ya no existe.' });
    const tipo = prev?.tipo ?? data.tipo;
    let detalle = (data.detalle ?? '').trim();
    if (tipo === 'cripto') detalle = prev ? prev.detalle : detalle.toUpperCase();
    const fields = { ambito: prev?.ambito ?? data.ambito, tipo, detalle, nota: (data.nota ?? '').trim() };
    const errors = validarCuenta(fields);
    if (Object.keys(errors).length) throw new ValidationError(errors);
    const moneda = prev?.moneda ?? monedaDeCuenta(tipo, detalle);

    const hermanas = (await req(cuentas.index('ambito').getAll(fields.ambito))).filter((c) => c.id !== data.id);
    const clave = (c) => `${c.tipo}|${normalizarNombre(c.detalle)}|${normalizarNombre(c.nota ?? '')}`;
    if (hermanas.some((c) => clave(c) === clave(fields))) {
      throw new ValidationError({ detalle: 'Ya tenés una cuenta igual. Usá la aclaración para distinguirlas.' });
    }
    const record = stamp(prev ? { ...prev, ...fields } : { ...fields, moneda, archivada: 0 });
    await req(cuentas.put(record));
    return record;
  });
}

export function archivarCuenta(id, archivar = true) {
  return tx('cuentas', 'readwrite', async ({ cuentas }) => {
    const prev = await req(cuentas.get(id));
    if (!prev) throw new ValidationError({ general: 'Esa cuenta ya no existe.' });
    const record = stamp({ ...prev, archivada: archivar ? 1 : 0 });
    await req(cuentas.put(record));
    return record;
  });
}

export function borrarCuenta(id) {
  return tx(['cuentas', 'ahorros'], 'readwrite', async ({ cuentas, ahorros }) => {
    const usos = await req(ahorros.index('cuentaId').count(id));
    if (usos > 0) throw new ValidationError({ general: 'Tiene movimientos: archivala en lugar de borrarla.' });
    const record = await req(cuentas.get(id));
    await req(cuentas.delete(id));
    return record;
  });
}

export const restaurarCuenta = (record) =>
  tx('cuentas', 'readwrite', async ({ cuentas }) => { await req(cuentas.put(record)); });

// ---------- Metas ----------

export const MONEDAS_META = ['ARS', 'USD'];
const NOMBRE_META_MAX = 40;

export function validarMeta(m) {
  const errors = {};
  if (!AMBITOS[m.ambito]) errors.ambito = 'Ámbito inválido.';
  const nombre = typeof m.nombre === 'string' ? m.nombre.trim() : '';
  if (!nombre) errors.nombre = 'Poné para qué es (auto, moto, TV…).';
  else if (nombre.length > NOMBRE_META_MAX) errors.nombre = `Hasta ${NOMBRE_META_MAX} caracteres.`;
  if (typeof m.emoji !== 'string' || !m.emoji.trim() || [...m.emoji.trim()].length > 8) errors.emoji = 'Elegí un emoji.';
  if (!MONEDAS_META.includes(m.moneda)) errors.moneda = 'Elegí pesos o dólares.';
  if (!Number.isSafeInteger(m.objetivo) || m.objetivo <= 0) errors.objetivo = 'Poné cuánto querés juntar.';
  else if (m.objetivo > MAX_CENTAVOS) errors.objetivo = 'El monto es demasiado grande.';
  return errors;
}

export async function listMetas(ambito) {
  const all = await getAll('metas', 'ambito', ambito);
  return all.sort((a, b) => a.archivada - b.archivada || a.createdAt.localeCompare(b.createdAt));
}

export function guardarMeta(data) {
  return tx('metas', 'readwrite', async ({ metas }) => {
    const prev = data.id ? await req(metas.get(data.id)) : undefined;
    if (data.id && !prev) throw new ValidationError({ general: 'Esa meta ya no existe.' });
    const fields = {
      ambito: prev?.ambito ?? data.ambito,
      nombre: (data.nombre ?? '').trim(),
      emoji: (data.emoji ?? '').trim(),
      moneda: data.moneda,
      objetivo: data.objetivo,
    };
    const errors = validarMeta(fields);
    if (Object.keys(errors).length) throw new ValidationError(errors);
    const record = stamp(prev ? { ...prev, ...fields } : { ...fields, archivada: 0 });
    await req(metas.put(record));
    return record;
  });
}

export function archivarMeta(id, archivar = true) {
  return tx('metas', 'readwrite', async ({ metas }) => {
    const prev = await req(metas.get(id));
    if (!prev) throw new ValidationError({ general: 'Esa meta ya no existe.' });
    const record = stamp({ ...prev, archivada: archivar ? 1 : 0 });
    await req(metas.put(record));
    return record;
  });
}

/** Borra la meta; sus aportes quedan como ahorro "sin meta". Devuelve lo necesario para deshacer. */
export function borrarMeta(id) {
  return tx(['metas', 'ahorros'], 'readwrite', async ({ metas, ahorros }) => {
    const meta = await req(metas.get(id));
    const vinculados = await req(ahorros.index('metaId').getAll(id));
    await Promise.all(vinculados.map((a) => req(ahorros.put({ ...a, metaId: null }))));
    await req(metas.delete(id));
    return { meta, ahorroIds: vinculados.map((a) => a.id) };
  });
}

export const restaurarMeta = ({ meta, ahorroIds }) =>
  tx(['metas', 'ahorros'], 'readwrite', async ({ metas, ahorros }) => {
    await req(metas.put(meta));
    for (const id of ahorroIds) {
      const a = await req(ahorros.get(id));
      if (a && a.metaId == null) await req(ahorros.put({ ...a, metaId: meta.id }));
    }
  });

// ---------- Aportes y retiros ----------

export const TIPOS_AHORRO = ['aporte', 'retiro'];

/** `tope: false` no aplica el máximo (datos de versiones anteriores, backups). */
export function validarAhorro(a, { tope = true } = {}) {
  const errors = {};
  if (!AMBITOS[a.ambito]) errors.ambito = 'Ámbito inválido.';
  if (!TIPOS_AHORRO.includes(a.tipo)) errors.tipo = 'Elegí aporte o retiro.';
  if (!a.cuentaId) errors.cuenta = 'Elegí dónde está la plata.';
  if (!esMonedaValida(a.moneda)) errors.cuenta = 'La cuenta tiene una moneda inválida.';
  if (!Number.isSafeInteger(a.cantidad) || a.cantidad <= 0) errors.monto = 'Ingresá un monto mayor a cero.';
  else if (tope && esMonedaValida(a.moneda) && a.cantidad > maxDe(a.moneda)) errors.monto = 'El monto es demasiado grande.';
  if (a.metaId != null && typeof a.metaId !== 'string') errors.meta = 'Meta inválida.';
  if (!isValidISODate(a.fecha)) errors.fecha = 'Elegí una fecha válida.';
  if (typeof a.nota !== 'string') errors.nota = 'Nota inválida.';
  else if (a.nota.length > NOTA_MAX) errors.nota = `La nota puede tener hasta ${NOTA_MAX} caracteres.`;
  if (a.pesos != null) {
    if (a.moneda === 'ARS') errors.pesos = 'Solo para cuentas en otra moneda.';
    else if (!Number.isSafeInteger(a.pesos) || a.pesos <= 0) errors.pesos = 'Monto en pesos inválido.';
    else if (tope && a.pesos > MAX_CENTAVOS) errors.pesos = 'El monto es demasiado grande.';
  }
  return errors;
}

export const listAhorros = (ambito, desde = '0000-01-01', hasta = '9999-12-31') =>
  getAll('ahorros', 'ambito_fecha', IDBKeyRange.bound([ambito, desde], [ambito, hasta]));

export const getAhorro = (id) => get('ahorros', id);

const signo = (a) => (a.tipo === 'retiro' ? -a.cantidad : a.cantidad);

/** Saldo de cada cuenta (en su moneda, unidad mínima). */
export function saldosPorCuenta(ahorros) {
  const saldos = new Map();
  for (const a of ahorros) saldos.set(a.cuentaId, (saldos.get(a.cuentaId) ?? 0) + signo(a));
  return saldos;
}

async function saldoCuenta(store, cuentaId, excluirId) {
  const movs = await req(store.index('cuentaId').getAll(cuentaId));
  return movs.filter((a) => a.id !== excluirId).reduce((s, a) => s + signo(a), 0);
}

/** Crea o edita un aporte/retiro. No deja una cuenta en negativo. */
export function guardarAhorro(data) {
  return tx(['ahorros', 'cuentas', 'metas'], 'readwrite', async ({ ahorros, cuentas, metas }) => {
    const prev = data.id ? await req(ahorros.get(data.id)) : undefined;
    if (data.id && !prev) throw new ValidationError({ general: 'Ese movimiento ya no existe.' });
    const cuenta = await req(cuentas.get(data.cuentaId));
    if (!cuenta || cuenta.ambito !== data.ambito) throw new ValidationError({ cuenta: 'Elegí dónde está la plata.' });
    const fields = {
      ambito: data.ambito,
      tipo: data.tipo,
      cuentaId: cuenta.id,
      moneda: cuenta.moneda,
      cantidad: data.cantidad,
      metaId: data.metaId || null,
      fecha: data.fecha,
      nota: (data.nota ?? '').trim(),
      pesos: cuenta.moneda === 'ARS' ? null : (data.pesos ?? null),
    };
    const errors = validarAhorro(fields);
    if (Object.keys(errors).length) throw new ValidationError(errors);
    if (fields.metaId) {
      const meta = await req(metas.get(fields.metaId));
      if (!meta || meta.ambito !== fields.ambito) throw new ValidationError({ meta: 'Esa meta ya no existe.' });
    }
    // La cuenta (y la anterior, si se cambió de cuenta) no puede quedar en negativo.
    const saldo = await saldoCuenta(ahorros, cuenta.id, data.id) + signo(fields);
    if (saldo < 0) {
      throw new ValidationError({ monto: `No hay tanto en esa cuenta. Saldo disponible: ${formatCantidad(saldo - signo(fields), cuenta.moneda)}.` });
    }
    if (prev && prev.cuentaId !== cuenta.id && await saldoCuenta(ahorros, prev.cuentaId, prev.id) < 0) {
      throw new ValidationError({ cuenta: 'La cuenta anterior quedaría en negativo.' });
    }
    const record = stamp({ ...prev, ...fields });
    await req(ahorros.put(record));
    return record;
  });
}

export function borrarAhorro(id) {
  return tx('ahorros', 'readwrite', async ({ ahorros }) => {
    const record = await req(ahorros.get(id));
    if (!record) return null;
    if (record.tipo === 'aporte' && await saldoCuenta(ahorros, record.cuentaId, id) < 0) {
      throw new ValidationError({ general: 'No se puede borrar: la cuenta quedaría en negativo por retiros posteriores.' });
    }
    await req(ahorros.delete(id));
    return record;
  });
}

export const restaurarAhorro = (record) =>
  tx(['ahorros', 'cuentas', 'metas'], 'readwrite', async ({ ahorros, cuentas, metas }) => {
    if (!await req(cuentas.get(record.cuentaId))) {
      throw new ValidationError({ general: 'No se puede deshacer: la cuenta ya no existe.' });
    }
    const conMeta = record.metaId && await req(metas.get(record.metaId)) ? record : { ...record, metaId: null };
    if (signo(conMeta) < 0 && await saldoCuenta(ahorros, record.cuentaId, record.id) + signo(conMeta) < 0) {
      throw new ValidationError({ general: 'No se puede deshacer: la cuenta quedaría en negativo.' });
    }
    await req(ahorros.put(conMeta));
  });

// ---------- Cotizaciones (manuales) ----------
// { moneda: 'USD', centavos: pesos (en centavos) por 1 unidad, updatedAt }

export async function cotizaciones() {
  const all = await getAll('cotizaciones');
  return new Map(all.map((c) => [c.moneda, c]));
}

export function guardarCotizacion(moneda, centavos) {
  if (!esMonedaValida(moneda) || moneda === 'ARS') throw new ValidationError({ general: 'Moneda inválida.' });
  if (!Number.isSafeInteger(centavos) || centavos <= 0 || centavos > MAX_CENTAVOS) {
    throw new ValidationError({ general: 'Cotización inválida.' });
  }
  return tx('cotizaciones', 'readwrite', ({ cotizaciones: s }) =>
    req(s.put({ moneda, centavos, updatedAt: new Date().toISOString() })));
}

export const borrarCotizacion = (moneda) =>
  tx('cotizaciones', 'readwrite', ({ cotizaciones: s }) => req(s.delete(moneda)));

/** Pesos (centavos) que vale 1 unidad mínima de `moneda`, o null si no hay cotización. */
function pesosPorMinimo(moneda, cotiz) {
  if (moneda === 'ARS') return 1;
  const c = cotiz.get(moneda);
  return c ? c.centavos / 10 ** decimalesDe(moneda) : null;
}

/** Convierte entre monedas usando las cotizaciones (null si falta alguna). */
export function convertir(minor, desde, hacia, cotiz) {
  if (desde === hacia) return minor;
  const a = pesosPorMinimo(desde, cotiz);
  const b = pesosPorMinimo(hacia, cotiz);
  if (a == null || b == null) return null;
  return Math.round((minor * a) / b);
}

/**
 * Totales por moneda y equivalente en pesos.
 * @returns {{porMoneda: Map<string, number>, totalPesos: number, sinCotizacion: string[]}}
 */
export function totalesAhorro(ahorros, cotiz) {
  const porMoneda = new Map();
  for (const a of ahorros) porMoneda.set(a.moneda, (porMoneda.get(a.moneda) ?? 0) + signo(a));
  let totalPesos = 0;
  const sinCotizacion = [];
  for (const [moneda, minor] of porMoneda) {
    if (minor === 0) continue;
    const p = convertir(minor, moneda, 'ARS', cotiz);
    if (p == null) sinCotizacion.push(moneda);
    else totalPesos += p;
  }
  return { porMoneda, totalPesos, sinCotizacion };
}

/**
 * Progreso de una meta, en la moneda de la meta.
 * @returns {{acumulado: number, pct: number, faltan: number, sinCotizacion: string[]}}
 */
export function progresoMeta(meta, ahorros, cotiz) {
  let acumulado = 0;
  const sinCotizacion = new Set();
  for (const a of ahorros) {
    if (a.metaId !== meta.id) continue;
    const v = convertir(signo(a), a.moneda, meta.moneda, cotiz);
    if (v == null) sinCotizacion.add(a.moneda);
    else acumulado += v;
  }
  const pct = meta.objetivo > 0 ? Math.max(0, acumulado) / meta.objetivo : 0;
  return { acumulado, pct, faltan: Math.max(0, meta.objetivo - acumulado), sinCotizacion: [...sinCotizacion] };
}

/**
 * Cuánto se ahorró en un mes, en pesos: aportes − retiros.
 * Los de otra moneda usan los pesos indicados al cargarlos o, si no, la cotización actual.
 */
export function ahorroDelMes(ahorros, ym, cotiz) {
  const [desde, hasta] = monthBounds(ym);
  let aportado = 0;
  let retirado = 0;
  const sinValuar = [];
  for (const a of ahorros) {
    if (a.fecha < desde || a.fecha > hasta) continue;
    const pesos = a.moneda === 'ARS' ? a.cantidad : (a.pesos ?? convertir(a.cantidad, a.moneda, 'ARS', cotiz));
    if (pesos == null) { sinValuar.push(a); continue; }
    if (a.tipo === 'retiro') retirado += pesos;
    else aportado += pesos;
  }
  return { aportado, retirado, neto: aportado - retirado, sinValuar };
}
