// Esquema de IndexedDB y migraciones.
//
// Reglas:
// - Nunca modifiques una migración que ya se publicó: agregá una nueva.
// - Para cambiar el esquema: subí DB_VERSION y agregá MIGRATIONS[nueva versión].
// - Cada migración recibe (db, tx) y corre dentro de la transacción de upgrade,
//   así que si algo falla se revierte todo.
import { seedCategorias } from './seed.js';

export const DB_NAME = 'gestor-gastos';
export const DB_VERSION = 1;

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
};

export function runMigrations(db, tx, oldVersion, newVersion) {
  for (let v = oldVersion + 1; v <= newVersion; v++) {
    const migrate = MIGRATIONS[v];
    if (!migrate) throw new Error(`Falta la migración a la versión ${v}`);
    migrate(db, tx);
  }
}
