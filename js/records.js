// Utilidades para registros: IDs y marcas de tiempo.

export function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  // Respaldo para contextos donde randomUUID no está (UUID v4 a mano).
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Devuelve una copia del registro con id, createdAt y updatedAt completos. */
export function stamp(record) {
  const now = new Date().toISOString();
  return {
    ...record,
    id: record.id ?? newId(),
    createdAt: record.createdAt ?? now,
    updatedAt: now,
  };
}
