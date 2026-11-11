// Administración de categorías del ámbito actual.
import { h, emptyState, safeColor } from '../dom.js';
import { AMBITOS, notifyDataChanged } from '../state.js';
import { listCategorias, contarPorCategoria, moverCategoria } from '../repo.js';
import { toastError } from '../toast.js';
import { openCategoriaForm } from './categoria-form.js';

let tipoActivo = 'gasto';
let pendingFocus = null;

const usosTxt = (k) => (k === 0 ? 'Sin movimientos' : k === 1 ? '1 movimiento' : `${k} movimientos`);

export async function render(state) {
  const [cats, counts] = await Promise.all([listCategorias(state.ambito), contarPorCategoria(state.ambito)]);
  const activasDe = (t) => cats.filter((c) => c.tipo === t && !c.archivada);
  const activas = activasDe(tipoActivo);
  const archivadas = cats.filter((c) => c.tipo === tipoActivo && c.archivada);

  async function mover(id, dir) {
    try {
      await moverCategoria(id, dir);
      pendingFocus = { id, dir };
      notifyDataChanged();
    } catch (err) {
      toastError(err);
    }
  }

  const fila = (c, i) => h('li', { class: 'cat-item' },
    h('button', {
      type: 'button', class: 'mov-row',
      'aria-label': `${c.nombre}, ${usosTxt(counts.get(c.id) ?? 0)}. Editar.`,
      onClick: () => openCategoriaForm({ id: c.id }),
    },
    h('span', { class: 'cat-badge', style: `--cat:${safeColor(c.color)}`, 'aria-hidden': 'true' }, c.emoji),
    h('span', { class: 'mov-main' },
      h('span', { class: 'mov-cat' }, c.nombre),
      h('span', { class: 'mov-nota' }, usosTxt(counts.get(c.id) ?? 0)))),
    !c.archivada && h('div', { class: 'order-btns' },
      h('button', {
        type: 'button', class: 'icon-btn icon-btn-sm', 'aria-label': `Subir ${c.nombre}`,
        'data-move': `${c.id}:-1`, disabled: i === 0, onClick: () => mover(c.id, -1),
      }, '↑'),
      h('button', {
        type: 'button', class: 'icon-btn icon-btn-sm', 'aria-label': `Bajar ${c.nombre}`,
        'data-move': `${c.id}:1`, disabled: i === activas.length - 1, onClick: () => mover(c.id, 1),
      }, '↓')));

  const tabs = h('div', { class: 'seg-tabs', role: 'group', 'aria-label': 'Tipo de categoría' },
    ['gasto', 'ingreso'].map((t) => h('button', {
      type: 'button', 'aria-pressed': String(t === tipoActivo),
      onClick: () => { if (t !== tipoActivo) { tipoActivo = t; notifyDataChanged(); } },
    }, `${t === 'gasto' ? 'Gastos' : 'Ingresos'} (${activasDe(t).length})`)));

  // Después de reordenar, devolvemos el foco al mismo botón (o a su hermano si quedó deshabilitado).
  if (pendingFocus) {
    const { id, dir } = pendingFocus;
    pendingFocus = null;
    setTimeout(() => {
      const mismo = document.querySelector(`[data-move="${id}:${dir}"]`);
      const otro = document.querySelector(`[data-move="${id}:${-dir}"]`);
      (mismo && !mismo.disabled ? mismo : otro)?.focus();
    });
  }

  return h('section', null,
    h('div', { class: 'page-head' },
      h('a', { href: '#/ajustes', class: 'icon-btn', 'aria-label': 'Volver a Ajustes' }, '‹'),
      h('h2', null, `Categorías · ${AMBITOS[state.ambito].label}`)),
    tabs,
    h('p', { class: 'muted hint' }, 'Usá las flechas para ordenar: las primeras aparecen primero al cargar.'),
    activas.length
      ? h('ul', { class: 'rows' }, activas.map(fila))
      : emptyState('🏷️', 'No hay categorías activas', 'Creá una con el botón de abajo.'),
    h('button', {
      class: 'btn btn-block', type: 'button',
      onClick: () => openCategoriaForm({ ambito: state.ambito, tipo: tipoActivo }),
    }, `＋ Nueva categoría de ${tipoActivo}`),
    archivadas.length > 0 && h('details', { class: 'archived' },
      h('summary', null, `Archivadas (${archivadas.length})`),
      h('ul', { class: 'rows' }, archivadas.map(fila))));
}
