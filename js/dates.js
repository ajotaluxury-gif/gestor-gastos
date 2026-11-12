// Fechas como strings "aaaa-mm-dd" (sin zona horaria) y meses como "aaaa-mm".

const pad = (n) => String(n).padStart(2, '0');

/** Fecha local de hoy como "aaaa-mm-dd". */
export function todayISO(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Fecha LOCAL ("aaaa-mm-dd") de una marca de tiempo ISO (que está en UTC).
 * Ojo: "2026-11-12T01:00Z".slice(0, 10) da el 12, pero en Argentina todavía es el 11.
 */
export const fechaLocal = (isoTimestamp) => todayISO(new Date(isoTimestamp));

/** Mes local actual como "aaaa-mm". */
export const currentMonth = (d = new Date()) => todayISO(d).slice(0, 7);

export function isValidISODate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** "2026-11-05" → "05/11/2026" */
export function toDisplay(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** "5/11/2026" → "2026-11-05" (o null si no es válida) */
export function fromDisplay(s) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(s).trim());
  if (!m) return null;
  const iso = `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  return isValidISODate(iso) ? iso : null;
}

/** addMonths("2026-01", -1) → "2025-12" */
export function addMonths(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`;
}

/** Límites para consultar un mes por rango de strings (incluye ambos extremos). */
export const monthBounds = (ym) => [`${ym}-01`, `${ym}-31`];

/** Último día real del mes: "2026-02" → "2026-02-28" */
export function lastDayOfMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return `${ym}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
}

const ymToDate = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1));
};
const nameFmt = new Intl.DateTimeFormat('es-AR', { month: 'long', timeZone: 'UTC' });
const shortFmt = new Intl.DateTimeFormat('es-AR', { month: 'short', timeZone: 'UTC' });

/** "2026-10" → "octubre" */
export const monthName = (ym) => nameFmt.format(ymToDate(ym));

/** "2026-10" → "oct" */
export const monthShort = (ym) => shortFmt.format(ymToDate(ym)).replace('.', '');

const monthFmt = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** "2026-11" → "Noviembre de 2026" */
export function monthLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  const s = monthFmt.format(new Date(Date.UTC(y, m - 1, 1)));
  return s.charAt(0).toUpperCase() + s.slice(1);
}
