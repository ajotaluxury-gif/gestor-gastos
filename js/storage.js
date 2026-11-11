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

/** Espacio usado por la app, en bytes (o null si no se puede saber). */
export async function storageUsage() {
  try {
    const { usage } = await navigator.storage.estimate();
    return usage ?? null;
  } catch {
    return null;
  }
}

export function formatBytes(bytes) {
  if (bytes == null) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toLocaleString('es-AR', { maximumFractionDigits: 1 })} ${units[i]}`;
}
