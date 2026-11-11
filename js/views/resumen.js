import { h, emptyState } from '../dom.js';
import { AMBITOS } from '../state.js';
import { monthLabel } from '../dates.js';

export async function render(state) {
  return h('section', null,
    h('h2', null, `Resumen · ${AMBITOS[state.ambito].label}`),
    h('p', { class: 'muted' }, monthLabel(state.mes)),
    emptyState('📊', 'Próximamente', 'El resumen mensual con gráficos llega en la etapa (d).'));
}
