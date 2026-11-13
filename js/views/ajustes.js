import { h } from '../dom.js';
import { AMBITOS } from '../state.js';
import { getAll, DB_VERSION } from '../db.js';
import { persistStatus, requestPersist, storageUsage, formatBytes, espacioBajo } from '../storage.js';
import { getAppVersion } from '../sw-client.js';
import { toast } from '../toast.js';
import { tarjetaDatos } from './datos.js';
import { openPersonalizar, openBorrarTodo, resumenPrefs } from './config.js';

const PERSIST_INFO = {
  granted: ['ok', '✅', 'Datos protegidos', 'Android no va a borrar tus datos aunque falte espacio.'],
  'not-granted': ['warn', '⚠️', 'Datos sin protección todavía',
    'Instalá la app en la pantalla de inicio y volvé a intentar: Chrome suele otorgarlo a las apps instaladas. Igual, hacé backups.'],
  unsupported: ['warn', '⚠️', 'No se puede pedir protección',
    'Este navegador no permite pedir almacenamiento persistente. Hacé backups seguido.'],
};

function persistBlock(status, onRequest) {
  const [kind, icon, title, text] = PERSIST_INFO[status];
  return h('div', null,
    h('div', { class: `status status-${kind}` },
      h('span', { class: 'status-icon', 'aria-hidden': 'true' }, icon),
      h('div', null, h('strong', null, title), h('p', null, text))),
    status === 'not-granted' &&
      h('button', { class: 'btn', type: 'button', onClick: onRequest }, 'Pedir protección de nuevo'));
}

export async function render(state) {
  const [persist, usage, version, categorias, datos] = await Promise.all([
    persistStatus(),
    storageUsage(),
    getAppVersion(),
    getAll('categorias', 'ambito', state.ambito),
    tarjetaDatos(state),
  ]);

  const activas = categorias.filter((c) => !c.archivada);
  const gastos = activas.filter((c) => c.tipo === 'gasto').length;
  const ingresos = activas.filter((c) => c.tipo === 'ingreso').length;
  const archivadas = categorias.length - activas.length;

  const persistSlot = h('div', null);
  const paintPersist = (status) => persistSlot.replaceChildren(persistBlock(status, async () => {
    const result = await requestPersist();
    paintPersist(result);
    if (result !== 'granted') toast('Chrome no otorgó la protección por ahora.');
  }));
  paintPersist(persist);

  return h('section', null,
    h('h2', null, 'Ajustes'),

    h('div', { class: 'card' },
      h('h3', null, 'Personalizar'),
      h('p', { class: 'muted hint' }, resumenPrefs()),
      h('button', { class: 'btn btn-block', type: 'button', onClick: openPersonalizar }, '🎨 Personalizar la app')),

    datos,

    h('div', { class: 'card' },
      h('h3', null, `Categorías · ${AMBITOS[state.ambito].label}`),
      h('dl', { class: 'kv' },
        h('dt', null, 'De gasto'), h('dd', null, gastos),
        h('dt', null, 'De ingreso'), h('dd', null, ingresos),
        archivadas > 0 && h('dt', null, 'Archivadas'), archivadas > 0 && h('dd', null, archivadas)),
      h('a', { class: 'btn btn-block', href: '#/categorias' }, 'Administrar categorías ›'),
      h('p', { class: 'muted hint' }, 'Cada ámbito tiene sus propias categorías: cambiá de ámbito arriba para editar las del otro.')),

    h('div', { class: 'card' },
      h('h3', null, 'Almacenamiento'),
      persistSlot,
      h('dl', { class: 'kv' },
        h('dt', null, 'Espacio usado'), h('dd', null, formatBytes(usage.usage)),
        usage.quota != null && h('dt', null, 'Disponible para la app'),
        usage.quota != null && h('dd', null, formatBytes(usage.quota - (usage.usage ?? 0)))),
      espacioBajo(usage)
        ? h('div', { class: 'status status-warn', role: 'alert' },
          h('span', { class: 'status-icon', 'aria-hidden': 'true' }, '⚠️'),
          h('div', null,
            h('strong', null, 'Queda poco espacio'),
            h('p', null, 'El teléfono está casi lleno. Hacé un backup ahora y liberá espacio (fotos, videos, apps) para que la app pueda seguir guardando.')))
        : h('p', { class: 'muted hint' }, 'Cada movimiento ocupa menos de 1 KB: tenés lugar de sobra para muchos años.')),

    h('div', { class: 'card' },
      h('h3', null, 'Acerca de'),
      h('dl', { class: 'kv' },
        h('dt', null, 'Versión de la app'), h('dd', null, version ?? '— (sin Service Worker activo)'),
        h('dt', null, 'Esquema de datos'), h('dd', null, `v${DB_VERSION}`))),

    h('div', { class: 'card danger-card' },
      h('h3', null, 'Zona de peligro'),
      h('p', { class: 'muted hint' }, 'Borra todo lo cargado en los dos ámbitos y deja la app como recién instalada.'),
      h('button', { class: 'btn btn-danger btn-block', type: 'button', onClick: openBorrarTodo }, '🗑️ Borrar todos los datos')));
}
