// Categorías iniciales. Se cargan una sola vez, dentro de la migración 1.
import { stamp } from './records.js';

export const PALETTE = [
  '#e11d48', '#ea580c', '#d97706', '#65a30d', '#059669', '#0891b2',
  '#2563eb', '#7c3aed', '#c026d3', '#db2777', '#0d9488', '#64748b',
];

const SEED = {
  personal: {
    gasto: [
      ['🛒', 'Supermercado'],
      ['🍔', 'Comida afuera'],
      ['🏠', 'Vivienda'],
      ['💡', 'Servicios'],
      ['🚌', 'Transporte'],
      ['🚗', 'Auto'],
      ['💊', 'Salud'],
      ['🎓', 'Educación'],
      ['🎉', 'Salidas y ocio'],
      ['👕', 'Ropa'],
      ['📱', 'Suscripciones'],
      ['🎁', 'Regalos'],
      ['📦', 'Otros gastos'],
    ],
    ingreso: [
      ['💼', 'Sueldo'],
      ['💸', 'Extras'],
      ['📈', 'Inversiones'],
      ['📦', 'Otros ingresos'],
    ],
  },
  negocio: {
    gasto: [
      ['📦', 'Mercadería e insumos'],
      ['🏢', 'Alquiler'],
      ['💡', 'Servicios'],
      ['👥', 'Sueldos y honorarios'],
      ['🧾', 'Impuestos'],
      ['🏦', 'Comisiones bancarias'],
      ['📣', 'Publicidad'],
      ['🚚', 'Envíos y logística'],
      ['🖥️', 'Software y herramientas'],
      ['🧰', 'Equipamiento'],
      ['📎', 'Otros gastos'],
    ],
    ingreso: [
      ['💰', 'Ventas'],
      ['🛠️', 'Servicios prestados'],
      ['📎', 'Otros ingresos'],
    ],
  },
};

/** Escribe las categorías iniciales en el object store recibido. */
export function seedCategorias(store) {
  for (const [ambito, porTipo] of Object.entries(SEED)) {
    let colorIdx = 0;
    for (const [tipo, lista] of Object.entries(porTipo)) {
      lista.forEach(([emoji, nombre], orden) => {
        store.put(stamp({
          ambito,
          tipo,
          nombre,
          emoji,
          color: PALETTE[colorIdx++ % PALETTE.length],
          archivada: 0,
          orden,
        }));
      });
    }
  }
}
