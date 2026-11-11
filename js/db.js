// Capa fina sobre IndexedDB: promesas + errores con mensajes entendibles.
import { DB_NAME, DB_VERSION, runMigrations } from './migrations.js';

export class DBError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'DBError';
    this.cause = cause;
  }
}

function friendlyMessage(err) {
  switch (err?.name) {
    case 'QuotaExceededError': return 'No hay espacio suficiente en el teléfono para guardar los datos.';
    case 'VersionError': return 'Los datos son de una versión más nueva de la app. Recargá la página.';
    case 'InvalidStateError': return 'La base de datos no está disponible. ¿Estás en modo incógnito?';
    case 'ConstraintError': return 'Ya existe un registro con esos datos.';
    case 'AbortError': return 'La operación se canceló y no se guardó nada.';
    default: return 'Hubo un problema con la base de datos.';
  }
}

const wrap = (err) => (err instanceof DBError ? err : new DBError(friendlyMessage(err), err));

/** Envuelve un IDBRequest en una promesa. */
export const req = (r) => new Promise((resolve, reject) => {
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
});

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) {
      reject(new DBError('Este navegador no soporta IndexedDB, así que no se pueden guardar datos.'));
      return;
    }
    let open;
    try {
      open = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (e) {
      reject(wrap(e));
      return;
    }
    open.onupgradeneeded = (ev) => {
      try {
        runMigrations(open.result, open.transaction, ev.oldVersion, ev.newVersion);
      } catch (e) {
        console.error('Migración fallida', e);
        open.transaction.abort();
        reject(new DBError('No se pudo actualizar la base de datos. Tus datos anteriores no se tocaron.', e));
      }
    };
    open.onsuccess = () => {
      const db = open.result;
      // Otra pestaña abrió una versión más nueva: cerramos para no bloquearla.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
        dispatchEvent(new CustomEvent('db-versionchange'));
      };
      db.onclose = () => { dbPromise = null; };
      resolve(db);
    };
    open.onerror = () => reject(wrap(open.error));
    open.onblocked = () => dispatchEvent(new CustomEvent('db-blocked'));
  });
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}

/**
 * Corre `fn(stores, tx)` dentro de una transacción. Resuelve con lo que devuelva
 * `fn` recién cuando la transacción se confirma (oncomplete).
 */
export async function tx(storeNames, mode, fn) {
  const db = await openDB();
  const names = [].concat(storeNames);
  return new Promise((resolve, reject) => {
    let t;
    let result;
    try {
      t = db.transaction(names, mode);
    } catch (e) {
      reject(wrap(e));
      return;
    }
    t.oncomplete = () => resolve(result);
    t.onabort = () => reject(wrap(t.error ?? new DOMException('Transacción abortada', 'AbortError')));
    const fail = (e) => {
      try { t.abort(); } catch { /* ya terminó */ }
      reject(wrap(e));
    };
    try {
      const stores = Object.fromEntries(names.map((n) => [n, t.objectStore(n)]));
      Promise.resolve(fn(stores, t)).then((v) => { result = v; }, fail);
    } catch (e) {
      fail(e);
    }
  });
}

export const get = (store, key) =>
  tx(store, 'readonly', (s) => req(s[store].get(key)));

export const getAll = (store, indexName, query) =>
  tx(store, 'readonly', (s) => {
    const source = indexName ? s[store].index(indexName) : s[store];
    return req(source.getAll(query));
  });

export const put = (store, value) =>
  tx(store, 'readwrite', (s) => req(s[store].put(value))).then(() => value);

export const del = (store, key) =>
  tx(store, 'readwrite', (s) => req(s[store].delete(key)));

export async function getMeta(key, fallback = null) {
  const row = await get('meta', key);
  return row === undefined ? fallback : row.value;
}

export const setMeta = (key, value) => put('meta', { key, value });

export { DB_VERSION };
