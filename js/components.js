// Piezas de interfaz compartidas entre vistas.
import { h } from './dom.js';
import { setMes } from './state.js';
import { formatARS } from './money.js';
import { addMonths, currentMonth, monthLabel } from './dates.js';

/** Monto con signo menos tipográfico si es negativo. */
export const signed = (cents) => `${cents < 0 ? '−' : ''}${formatARS(Math.abs(cents))}`;

export function totalesCard({ ingresos, gastos, balance }) {
  return h('div', { class: 'totals' },
    h('div', null, h('span', { class: 'muted' }, 'Ingresos'), h('strong', { class: 'ingreso' }, `+${formatARS(ingresos)}`)),
    h('div', null, h('span', { class: 'muted' }, 'Gastos'), h('strong', { class: 'gasto' }, `−${formatARS(gastos)}`)),
    h('div', null, h('span', { class: 'muted' }, 'Balance'), h('strong', null, signed(balance))));
}

export function monthNav(mes) {
  const esActual = mes === currentMonth();
  return h('div', { class: 'month-nav' },
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Mes anterior', onClick: () => setMes(addMonths(mes, -1)) }, '‹'),
    h('div', { class: 'month-label' },
      h('h2', null, monthLabel(mes)),
      !esActual && h('button', { class: 'link-btn', type: 'button', onClick: () => setMes(currentMonth()) }, 'Ir al mes actual')),
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Mes siguiente', onClick: () => setMes(addMonths(mes, 1)) }, '›'));
}
