import { h, emptyState } from '../dom.js';
import { AMBITOS } from '../state.js';

export async function render(state) {
  return h('section', null,
    h('h2', null, `Presupuestos · ${AMBITOS[state.ambito].label}`),
    emptyState('🎯', 'Próximamente', 'Los presupuestos por categoría llegan en la etapa (e).'));
}
