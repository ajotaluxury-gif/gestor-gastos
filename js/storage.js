// Almacenamiento persistente: le pide a Android que no borre los datos.

/** @returns {Promise<'granted'|'not-granted'|'unsupported'>} */
export async function persistStatus() {
  if (!navigator.storage?.persisted) return 'unsupported';
  try {
    return (await navigator.storage.persisted()) ? 'granted' : 'not-granted';
  } catch {
    return 'unsupported';
  }
}

/** Pide persistencia si todavía no la tiene. Devuelve el estado final. */
export async function requestPersist() {
  if (!navigator.storage?.persist) return 'unsupported';
  try {
    if (await navigator.storage.persisted()) return 'granted';
    return (await navigator.storage.persist()) ? 'granted' : 'not-granted';
  } catch {
    return 'unsupported';
  }
}

/**
 * Espacio usado por la app y cuota que le da el navegador, en bytes (null si no se puede saber).
 * La cuota depende del espacio libre del teléfono: si el teléfono se llena, la cuota baja.
 */
export async function storageUsage() {
  try {
    const { usage, quota } = await navigator.storage.estimate();
    return { usage: usage ?? null, quota: quota ?? null };
  } catch {
    return { usage: null, quota: null };
  }
}

/** Avisar si queda poco: más del 80 % usado o menos de 50 MB libres para la app. */
export const ALERTA_ESPACIO = { pct: 0.8, libreMin: 50 * 1024 * 1024 };
export function espacioBajo({ usage, quota }) {
  if (usage == null || !quota) return false;
  return usage / quota > ALERTA_ESPACIO.pct || quota - usage < ALERTA_ESPACIO.libreMin;
}

export function formatBytes(bytes) {
  if (bytes == null) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toLocaleString('es-AR', { maximumFractionDigits: 1 })} ${units[i]}`;
}
