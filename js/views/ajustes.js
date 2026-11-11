import { h } from '../dom.js';
import { AMBITOS } from '../state.js';
import { getAll, DB_VERSION } from '../db.js';
import { persistStatus, requestPersist, storageUsage, formatBytes } from '../storage.js';
import { getAppVersion } from '../sw-client.js';
import { toast } from '../toast.js';

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
  const [persist, usage, version, categorias] = await Promise.all([
    persistStatus(),
    storageUsage(),
    getAppVersion(),
    getAll('categorias', 'ambito', state.ambito),
  ]);

  const activas = categorias.filter((c) => !c.archivada);
  const gastos = activas.filter((c) => c.tipo === 'gasto').length;
  const ingresos = activas.filter((c) => c.tipo === 'ingreso').length;

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
      h('h3', null, 'Almacenamiento'),
      persistSlot,
      h('dl', { class: 'kv' },
        h('dt', null, 'Espacio usado'), h('dd', null, formatBytes(usage)))),

    h('div', { class: 'card' },
      h('h3', null, `Categorías · ${AMBITOS[state.ambito].label}`),
      h('dl', { class: 'kv' },
        h('dt', null, 'De gasto'), h('dd', null, gastos),
        h('dt', null, 'De ingreso'), h('dd', null, ingresos)),
      h('p', { class: 'muted' }, 'La edición de categorías llega en la etapa (c).')),

    h('div', { class: 'card' },
      h('h3', null, 'Acerca de'),
      h('dl', { class: 'kv' },
        h('dt', null, 'Versión de la app'), h('dd', null, version ?? '— (sin Service Worker activo)'),
        h('dt', null, 'Esquema de datos'), h('dd', null, `v${DB_VERSION}`))));
}
