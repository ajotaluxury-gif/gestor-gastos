// Esquema de IndexedDB y migraciones.
//
// Reglas:
// - Nunca modifiques una migración que ya se publicó: agregá una nueva.
// - Para cambiar el esquema: subí DB_VERSION y agregá MIGRATIONS[nueva versión].
// - Cada migración recibe (db, tx) y corre dentro de la transacción de upgrade,
//   así que si algo falla se revierte todo.
import { seedCategorias } from './seed.js';

export const DB_NAME = 'gestor-gastos';
export const DB_VERSION = 2;

/** Stores de datos (sin 'meta'), en el orden en que se respaldan. */
export const DATA_STORES = [
  'movimientos', 'categorias', 'presupuestos',
  'cuentas', 'metas', 'ahorros', 'cotizaciones', 'fijos', 'pagos',
];

const MIGRATIONS = {
  1(db, tx) {
    const movimientos = db.createObjectStore('movimientos', { keyPath: 'id' });
    movimientos.createIndex('ambito_fecha', ['ambito', 'fecha']);
    movimientos.createIndex('categoriaId', 'categoriaId');

    const categorias = db.createObjectStore('categorias', { keyPath: 'id' });
    categorias.createIndex('ambito', 'ambito');

    const presupuestos = db.createObjectStore('presupuestos', { keyPath: 'id' });
    presupuestos.createIndex('ambito', 'ambito');
    presupuestos.createIndex('categoriaId', 'categoriaId', { unique: true });

    db.createObjectStore('meta', { keyPath: 'key' });

    seedCategorias(tx.objectStore('categorias'));
    tx.objectStore('meta').put({ key: 'seededAt', value: new Date().toISOString() });
  },

  // v2: ahorros (cuentas, metas, aportes/retiros, cotizaciones) y gastos fijos/cuotas con sus pagos.
  2(db) {
    const cuentas = db.createObjectStore('cuentas', { keyPath: 'id' });
    cuentas.createIndex('ambito', 'ambito');

    const metas = db.createObjectStore('metas', { keyPath: 'id' });
    metas.createIndex('ambito', 'ambito');

    const ahorros = db.createObjectStore('ahorros', { keyPath: 'id' });
    ahorros.createIndex('ambito_fecha', ['ambito', 'fecha']);
    ahorros.createIndex('cuentaId', 'cuentaId');
    ahorros.createIndex('metaId', 'metaId'); // metaId null no se indexa (aportes sin meta)

    db.createObjectStore('cotizaciones', { keyPath: 'moneda' });

    const fijos = db.createObjectStore('fijos', { keyPath: 'id' });
    fijos.createIndex('ambito', 'ambito');
    fijos.createIndex('categoriaId', 'categoriaId');

    const pagos = db.createObjectStore('pagos', { keyPath: 'id' });
    pagos.createIndex('ambito_mes', ['ambito', 'mes']);
    pagos.createIndex('fijoId', 'fijoId');
    pagos.createIndex('movimientoId', 'movimientoId');
    pagos.createIndex('fijo_mes', ['fijoId', 'mes'], { unique: true });
  },
};

export function runMigrations(db, tx, oldVersion, newVersion) {
  for (let v = oldVersion + 1; v <= newVersion; v++) {
    const migrate = MIGRATIONS[v];
    if (!migrate) throw new Error(`Falta la migración a la versión ${v}`);
    migrate(db, tx);
  }
}
