// Dinero: siempre enteros en la unidad mínima (centavos; satoshis-like para cripto).
// Formato y parseo es-AR.

const currencyFmt = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });
const numberFmt = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 123456 → "$ 1.234,56" */
export const formatARS = (centavos) => currencyFmt.format(centavos / 100);

/** 123456 → "1.234,56" (sin símbolo; para inputs y CSV) */
export const formatNumber = (centavos) => numberFmt.format(centavos / 100);

// Hasta 9.999.999.999,99 por movimiento. Con este tope, la suma de cientos de miles
// de movimientos sigue siendo un entero exacto en JavaScript (Number.MAX_SAFE_INTEGER).
const MAX_ENTEROS = 10;
export const MAX_CENTAVOS = 10 ** (MAX_ENTEROS + 2) - 1;

// ---------- Monedas ----------
// ARS y USD con 2 decimales; cualquier otra (cripto: BTC, ETH, USDT…) con 8.

const FIAT = { ARS: 2, USD: 2 };
const CRIPTO_DEC = 8;
const CRIPTO_MAX_ENTEROS = 7; // 9.999.999 unidades × 10^8 sigue siendo un entero seguro

export const esFiat = (moneda) => moneda in FIAT;
export const decimalesDe = (moneda) => FIAT[moneda] ?? CRIPTO_DEC;
export const esMonedaValida = (m) => typeof m === 'string' && (esFiat(m) || /^[A-Z0-9]{2,10}$/.test(m));

/** Máximo en unidades mínimas para una moneda. */
export const maxDe = (moneda) => (esFiat(moneda) ? MAX_CENTAVOS : 10 ** (CRIPTO_MAX_ENTEROS + CRIPTO_DEC) - 1);

const usdFmt = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const criptoFmt = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: CRIPTO_DEC });

/** Formatea una cantidad en su moneda: "$ 1.234,56", "US$ 500,00", "0,0125 BTC". */
export function formatCantidad(minor, moneda) {
  if (moneda === 'ARS') return formatARS(minor);
  if (moneda === 'USD') return `US$ ${usdFmt.format(minor / 100)}`;
  return `${criptoFmt.format(minor / 10 ** CRIPTO_DEC)} ${moneda}`;
}

/** Para precargar un input: "1.234,56" / "0,0125". */
export function formatInput(minor, moneda) {
  if (esFiat(moneda)) return formatNumber(minor);
  return criptoFmt.format(minor / 10 ** CRIPTO_DEC);
}

/**
 * Convierte lo que escribe el usuario a la unidad mínima de la moneda.
 * Pesos/dólares: acepta "1234,56", "1.234,56", "1234", "1.234" (miles), "12.5" (decimal), "$ 1.234".
 * Cripto: además "0.0005" o "0,0005" (un punto solo siempre es decimal).
 * @returns {{ok: true, value: number} | {ok: false, error: string}}
 */
export function parseCantidad(input, moneda = 'ARS') {
  const dec = decimalesDe(moneda);
  const maxEnteros = esFiat(moneda) ? MAX_ENTEROS : CRIPTO_MAX_ENTEROS;
  const invalid = { ok: false, error: `Monto inválido. Escribilo así: ${esFiat(moneda) ? '1.234,56' : '0,0005'}` };
  let s = String(input ?? '').trim().replace(/[\s $]/g, '').replace(/^US/i, '');
  if (!s) return { ok: false, error: 'Ingresá un monto.' };
  if (s.startsWith('-')) return { ok: false, error: 'El monto tiene que ser positivo.' };

  if (s.includes(',')) {
    // Coma = decimal; los puntos solo pueden ser separadores de miles bien puestos.
    const parts = s.split(',');
    if (parts.length !== 2) return invalid;
    const [entero, d] = parts;
    if (!/^(\d+|\d{1,3}(\.\d{3})+)$/.test(entero)) return invalid;
    s = `${entero.replace(/\./g, '')}.${d}`;
  } else if (esFiat(moneda) && /^\d{1,3}(\.\d{3})+$/.test(s)) {
    // "1.234" o "1.234.567" → separador de miles (convención argentina). En cripto no:
    // "0.001" es un milésimo de BTC, no mil.
    s = s.replace(/\./g, '');
  }
  // Si quedó un único punto (p. ej. "12.5"), se toma como decimal.

  const m = new RegExp(`^(\\d+)(?:\\.(\\d{0,${dec}}))?$`).exec(s);
  if (!m) {
    if (/^\d+\.\d+$/.test(s)) return { ok: false, error: `Usá como máximo ${dec} decimales.` };
    return invalid;
  }
  const entero = m[1].replace(/^0+(?=\d)/, '');
  if (entero.length > maxEnteros) return { ok: false, error: 'El monto es demasiado grande.' };

  const value = Number(entero) * 10 ** dec + Number((m[2] ?? '').padEnd(dec, '0'));
  if (value <= 0) return { ok: false, error: 'El monto tiene que ser mayor a cero.' };
  return { ok: true, value };
}

/** Pesos (atajo de parseCantidad con mensajes de movimientos). */
export function parseMonto(input) {
  const r = parseCantidad(input, 'ARS');
  if (!r.ok && r.error === 'El monto tiene que ser positivo.') {
    return { ok: false, error: 'El monto tiene que ser positivo. Elegí "Gasto" o "Ingreso".' };
  }
  return r;
}
