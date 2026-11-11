import { h, emptyState } from '../dom.js';
import { AMBITOS } from '../state.js';

export async function render(state) {
  return h('section', null,
    h('h2', null, `Movimientos · ${AMBITOS[state.ambito].label}`),
    emptyState('📋', 'Todavía no hay movimientos', 'La carga y el listado llegan en la etapa (b).'));
}
