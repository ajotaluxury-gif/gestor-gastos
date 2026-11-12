// Piezas de interfaz compartidas entre vistas.
import { h } from './dom.js';
import { setMes, getState } from './state.js';
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

/** Pestañas internas de "Plan": gastos fijos/cuotas y presupuestos. */
export function planTabs(activa) {
  return h('nav', { class: 'seg-tabs', 'aria-label': 'Plan del mes' },
    h('a', { href: '#/plan', 'aria-current': activa === 'plan' ? 'page' : null }, 'Fijos y cuotas'),
    h('a', { href: '#/presupuestos', 'aria-current': activa === 'presupuestos' ? 'page' : null }, 'Presupuestos'));
}

export function monthNav(mes) {
  const esActual = mes === currentMonth();
  // Se usa el mes del estado (no el de este dibujo): toques rápidos antes de redibujar no se pierden.
  const mover = (n) => setMes(addMonths(getState().mes, n));
  return h('div', { class: 'month-nav' },
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Mes anterior', onClick: () => mover(-1) }, '‹'),
    h('div', { class: 'month-label' },
      h('h2', null, monthLabel(mes)),
      !esActual && h('button', { class: 'link-btn', type: 'button', onClick: () => setMes(currentMonth()) }, 'Ir al mes actual')),
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Mes siguiente', onClick: () => mover(1) }, '›'));
}
