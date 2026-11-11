// Dinero: siempre enteros en centavos. Formato y parseo es-AR.

const currencyFmt = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });
const numberFmt = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 123456 → "$ 1.234,56" */
export const formatARS = (centavos) => currencyFmt.format(centavos / 100);

/** 123456 → "1.234,56" (sin símbolo; para inputs y CSV) */
export const formatNumber = (centavos) => numberFmt.format(centavos / 100);

// Hasta 999.999.999.999,99: sobra y sigue siendo un entero seguro.
const MAX_ENTEROS = 12;

/**
 * Convierte lo que escribe el usuario a centavos.
 * Acepta "1234,56", "1.234,56", "1234", "1.234" (miles), "12.5" (decimal), "$ 1.234".
 * @returns {{ok: true, value: number} | {ok: false, error: string}}
 */
export function parseMonto(input) {
  const invalid = { ok: false, error: 'Monto inválido. Escribilo así: 1.234,56' };
  let s = String(input ?? '').trim().replace(/[\s $]/g, '');
  if (!s) return { ok: false, error: 'Ingresá un monto.' };
  if (s.startsWith('-')) return { ok: false, error: 'El monto tiene que ser positivo. Elegí "Gasto" o "Ingreso".' };

  if (s.includes(',')) {
    // Coma = decimal; los puntos solo pueden ser separadores de miles bien puestos.
    const parts = s.split(',');
    if (parts.length !== 2) return invalid;
    const [entero, dec] = parts;
    if (!/^(\d+|\d{1,3}(\.\d{3})+)$/.test(entero)) return invalid;
    s = `${entero.replace(/\./g, '')}.${dec}`;
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    // "1.234" o "1.234.567" → separador de miles (convención argentina).
    s = s.replace(/\./g, '');
  }
  // Si quedó un único punto (p. ej. "12.5"), se toma como decimal.

  const m = /^(\d+)(?:\.(\d{0,2}))?$/.exec(s);
  if (!m) return invalid;
  const entero = m[1].replace(/^0+(?=\d)/, '');
  if (entero.length > MAX_ENTEROS) return { ok: false, error: 'El monto es demasiado grande.' };

  const value = Number(entero) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
  if (value <= 0) return { ok: false, error: 'El monto tiene que ser mayor a cero.' };
  return { ok: true, value };
}
