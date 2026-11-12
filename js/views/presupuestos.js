// Presupuestos del mes: cuánto se gastó de cada tope, con alertas al 80 % y 100 %.
import { h, emptyState, safeColor } from '../dom.js';
import { resumenPresupuestos, estadoPresupuesto } from '../repo.js';
import { formatARS } from '../money.js';
import { currentMonth, lastDayOfMonth, todayISO } from '../dates.js';
import { monthNav, planTabs } from '../components.js';
import { openPresupuestoForm, categoriasSinPresupuesto } from './presupuesto-form.js';

const pctFmt = new Intl.NumberFormat('es-AR', { style: 'percent', maximumFractionDigits: 0 });

/** Días que quedan en el mes contando hoy (solo para el mes en curso). */
function diasRestantes(mes) {
  if (mes !== currentMonth()) return null;
  return Number(lastDayOfMonth(mes).slice(8)) - Number(todayISO().slice(8)) + 1;
}

/** Texto de estado: siempre con ícono y palabras, no solo color. */
function estadoTexto({ nivel, pct, restante }, dias) {
  if (nivel === 'excedido') return `⛔ Te pasaste por ${formatARS(-restante)}`;
  const porDia = dias && restante > 0 ? ` · ${formatARS(Math.floor(restante / dias))} por día` : '';
  if (nivel === 'alerta') {
    return restante === 0 ? '⚠ Llegaste al tope' : `⚠ ${pctFmt.format(pct)} usado · quedan ${formatARS(restante)}${porDia}`;
  }
  return `Quedan ${formatARS(restante)}${porDia}`;
}

function barra(pct, nivel, label) {
  const ancho = Math.min(pct, 1) * 100;
  return h('span', {
    class: `budget-bar level-${nivel}`, role: 'progressbar',
    'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(pct * 100), 'aria-label': label,
  }, h('span', { class: 'budget-fill', style: `width:${ancho.toFixed(1)}%` }));
}

export async function render(state) {
  const [filas, sinPresupuesto] = await Promise.all([
    resumenPresupuestos(state.ambito, state.mes),
    categoriasSinPresupuesto(state.ambito),
  ]);
  const dias = diasRestantes(state.mes);

  const agregar = sinPresupuesto.length
    ? h('button', { class: 'btn btn-block', type: 'button', onClick: () => openPresupuestoForm() }, '＋ Agregar presupuesto')
    : h('p', { class: 'muted hint' }, 'Todas las categorías de gasto ya tienen presupuesto.');

  const section = h('section', { class: 'presupuestos' }, planTabs('presupuestos'), monthNav(state.mes));

  if (!filas.length) {
    section.append(
      emptyState('🎯', 'Todavía no hay presupuestos', 'Poné un tope mensual a las categorías que quieras controlar.'),
      agregar);
    return section;
  }

  // Total general
  const limite = filas.reduce((s, f) => s + f.presupuesto.montoCentavos, 0);
  const gastado = filas.reduce((s, f) => s + f.gastado, 0);
  const total = estadoPresupuesto(gastado, limite);
  const alertas = filas.filter((f) => f.nivel !== 'ok').length;

  section.append(
    h('div', { class: 'card budget-total' },
      h('div', { class: 'budget-head' },
        h('span', { class: 'muted' }, 'Gastado de lo presupuestado'),
        h('strong', null, `${formatARS(gastado)} de ${formatARS(limite)}`)),
      barra(total.pct, total.nivel, 'Total presupuestado usado'),
      h('p', { class: `budget-status level-${total.nivel}` }, estadoTexto(total, dias)),
      (dias || alertas > 0) && h('p', { class: 'muted hint' },
        [dias && `Quedan ${dias} ${dias === 1 ? 'día' : 'días'} del mes.`,
          alertas > 0 && `${alertas} ${alertas === 1 ? 'categoría necesita' : 'categorías necesitan'} atención.`]
          .filter(Boolean).join(' '))),

    h('ul', { class: 'rows' }, filas.map((f) => {
      const texto = estadoTexto(f, dias);
      return h('li', null, h('button', {
        type: 'button', class: 'mov-row budget-row',
        'aria-label': `${f.categoria.nombre}: ${formatARS(f.gastado)} de ${formatARS(f.presupuesto.montoCentavos)}. ${texto.replace(/^[⛔⚠] /, '')}. Editar.`,
        onClick: () => openPresupuestoForm({ id: f.presupuesto.id }),
      },
      h('span', { class: 'cat-badge', style: `--cat:${safeColor(f.categoria.color)}`, 'aria-hidden': 'true' }, f.categoria.emoji),
      h('span', { class: 'mov-main' },
        h('span', { class: 'budget-head' },
          h('span', { class: 'mov-cat' }, f.categoria.nombre),
          h('span', { class: 'budget-amount' }, `${formatARS(f.gastado)} / ${formatARS(f.presupuesto.montoCentavos)}`)),
        barra(f.pct, f.nivel, `${f.categoria.nombre}, presupuesto usado`),
        h('span', { class: `budget-status level-${f.nivel}` }, texto))));
    })),
    agregar,
    h('p', { class: 'muted hint' }, 'Los topes son mensuales: el mismo monto se aplica a todos los meses.'));
  return section;
}
