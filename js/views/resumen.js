// Resumen mensual: totales, comparación con el mes anterior, gráfico por categoría y tendencia.
import { h, emptyState, safeColor, appendChildren } from '../dom.js';
import { setMes, notifyDataChanged } from '../state.js';
import {
  listCategorias, listMovimientos, totales, sumarPorCategoria, agruparResto, variacion,
} from '../repo.js';
import { formatARS } from '../money.js';
import {
  addMonths, currentMonth, lastDayOfMonth, monthLabel, monthName, monthShort, todayISO,
} from '../dates.js';
import { monthNav, totalesCard, signed } from '../components.js';
import { checklistMes, totalesChecklist } from '../fijos.js';
import { listAhorros, cotizaciones, ahorroDelMes } from '../ahorros.js';
import { mountChart, reducedMotion } from '../charts.js';
import { verMovimientos } from './movimientos.js';

const MESES_TENDENCIA = 6;
const MAX_PORCIONES = 7;
const OTRAS = { nombre: 'Otras', emoji: '…', color: '#94a3b8' };
const SIN_CAT = { nombre: 'Sin categoría', emoji: '❔', color: '#64748b' };

let tipoActivo = 'gasto';

const pctFmt = new Intl.NumberFormat('es-AR', { style: 'percent', maximumFractionDigits: 1 });
const compactFmt = new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', notation: 'compact', maximumFractionDigits: 1,
});
const pesos = (cents) => cents / 100;
const fromPesos = (p) => Math.round(p * 100);

export async function render(state) {
  const { ambito, mes } = state;
  const primerMes = addMonths(mes, -(MESES_TENDENCIA - 1));
  const [cats, movs] = await Promise.all([
    listCategorias(ambito),
    listMovimientos(ambito, `${primerMes}-01`, `${mes}-31`),
  ]);
  const catMap = new Map(cats.map((c) => [c.id, c]));

  const porMes = new Map();
  for (let i = 0; i < MESES_TENDENCIA; i++) porMes.set(addMonths(primerMes, i), []);
  for (const m of movs) porMes.get(m.fecha.slice(0, 7))?.push(m);
  const delMes = porMes.get(mes);

  const section = h('section', { class: 'resumen' }, monthNav(mes));

  if (!delMes.length) {
    section.append(emptyState('📊', `Sin movimientos en ${monthName(mes)}`,
      'Cargá movimientos con el botón + para ver el resumen.'));
  } else {
    appendChildren(section,
      totalesCard(totales(delMes)),
      comparacion(delMes, porMes.get(addMonths(mes, -1)), mes),
      await planYAhorro(ambito, mes, totales(delMes).balance),
      porCategoria(delMes, catMap, mes));
  }
  if (movs.length) section.append(tendencia(porMes, mes));
  return section;
}

// ---------- Comparación con el mes anterior ----------

function comparacion(delMes, delAnterior, mes) {
  const anterior = addMonths(mes, -1);
  // Si es el mes en curso, comparamos contra el anterior "a esta altura" (mismo día del mes).
  const enCurso = mes === currentMonth();
  const dia = todayISO().slice(8);
  const base = enCurso ? delAnterior.filter((m) => m.fecha.slice(8) <= dia) : delAnterior;
  const actual = totales(delMes);
  const previo = totales(base);
  const cuando = enCurso ? `a esta altura de ${monthName(anterior)}` : `en ${monthName(anterior)}`;

  const linea = (verbo, a, b, malo) => {
    const v = variacion(a, b);
    if (v === null) return null;
    if (Math.abs(v) < 0.005) return h('li', null, `= ${verbo} lo mismo que ${cuando}`);
    const sube = v > 0;
    const clase = sube === malo ? 'trend-bad' : 'trend-good';
    return h('li', { class: clase },
      h('span', { 'aria-hidden': 'true' }, sube ? '▲ ' : '▼ '),
      `${verbo} ${pctFmt.format(Math.abs(v))} ${sube ? 'más' : 'menos'} que ${cuando}`);
  };

  const items = [
    linea('Gastaste', actual.gastos, previo.gastos, true),
    linea('Ingresaste', actual.ingresos, previo.ingresos, false),
  ].filter(Boolean);
  return items.length ? h('ul', { class: 'trend-list' }, items) : null;
}

// ---------- Fijos y ahorro ----------

/**
 * Lo que queda disponible: balance − ahorro neto del mes − fijos que faltan pagar.
 * (Los fijos ya pagados ya están dentro de los gastos.)
 */
async function planYAhorro(ambito, mes, balance) {
  const [items, ahorros, cotiz] = await Promise.all([checklistMes(ambito, mes), listAhorros(ambito), cotizaciones()]);
  const fijos = totalesChecklist(items);
  const ahorro = ahorroDelMes(ahorros, mes, cotiz);
  if (!items.length && !ahorro.aportado && !ahorro.retirado) return null;
  const disponible = balance - ahorro.neto - fijos.falta;
  const linea = (label, valor, clase) => h('div', null, h('span', { class: 'muted' }, label), h('strong', { class: clase }, valor));
  return h('div', { class: 'card plan-resumen' },
    h('h3', null, 'Fijos y ahorro'),
    items.length > 0 && linea('Gastos fijos pagados', `${formatARS(fijos.pagado)} de ${formatARS(fijos.comprometido)}`),
    fijos.falta > 0 && linea('Fijos que faltan pagar', `−${formatARS(fijos.falta)}`, 'gasto'),
    (ahorro.aportado > 0 || ahorro.retirado > 0) && linea('Ahorraste este mes', signed(ahorro.neto)),
    ahorro.sinValuar.length > 0 && h('p', { class: 'muted hint' },
      `${ahorro.sinValuar.length} movimiento(s) de ahorro en otra moneda sin cotización no se cuentan.`),
    h('div', { class: 'plan-disponible' },
      h('span', null, 'Te queda disponible'),
      h('strong', { class: disponible < 0 ? 'gasto' : null }, signed(disponible))),
    h('p', { class: 'muted hint' }, 'Balance del mes, menos lo que ahorraste y los fijos que todavía no pagaste.'));
}

// ---------- Por categoría ----------

function porCategoria(delMes, catMap, mes) {
  const t = totales(delMes);
  const tabs = h('div', { class: 'seg-tabs', role: 'group', 'aria-label': 'Ver por categoría' },
    ['gasto', 'ingreso'].map((tipo) => h('button', {
      type: 'button', 'aria-pressed': String(tipo === tipoActivo),
      onClick: () => { if (tipo !== tipoActivo) { tipoActivo = tipo; notifyDataChanged(); } },
    }, tipo === 'gasto' ? 'Gastos' : 'Ingresos')));

  const filas = sumarPorCategoria(delMes, tipoActivo);
  const total = tipoActivo === 'gasto' ? t.gastos : t.ingresos;
  const card = h('div', { class: 'card' }, h('h3', null, 'Por categoría'), tabs);

  if (!filas.length) {
    card.append(h('p', { class: 'muted' }, `No hay ${tipoActivo === 'gasto' ? 'gastos' : 'ingresos'} este mes.`));
    return card;
  }

  const catDe = (id) => (id === null ? OTRAS : catMap.get(id) ?? SIN_CAT);
  const porciones = agruparResto(filas, MAX_PORCIONES);
  const top = filas.slice(0, 3).map((f) => `${catDe(f.categoriaId).nombre} ${pctFmt.format(f.monto / total)}`).join(', ');

  const canvas = h('canvas', {
    role: 'img',
    'aria-label': `Gráfico de ${tipoActivo === 'gasto' ? 'gastos' : 'ingresos'} por categoría. Principales: ${top}. El detalle está en la lista de abajo.`,
  });
  const donut = h('div', { class: 'donut' }, canvas,
    h('div', { class: 'donut-center', 'aria-hidden': 'true' },
      h('span', { class: 'muted' }, tipoActivo === 'gasto' ? 'Gastos' : 'Ingresos'),
      h('strong', null, formatARS(total))));

  mountChart(canvas, (Chart, c) => new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: porciones.map((p) => catDe(p.categoriaId).nombre),
      datasets: [{
        data: porciones.map((p) => pesos(p.monto)),
        backgroundColor: porciones.map((p) => safeColor(catDe(p.categoriaId).color)),
        borderColor: c.surface,
        borderWidth: 2,
        hoverOffset: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '66%',
      animation: reducedMotion() ? false : undefined,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${formatARS(fromPesos(ctx.raw))} (${pctFmt.format(fromPesos(ctx.raw) / total)})`,
          },
        },
      },
    },
  }));

  const desde = `${mes}-01`;
  const hasta = lastDayOfMonth(mes);
  const lista = h('ul', { class: 'rows breakdown' }, filas.map((f) => {
    const cat = catDe(f.categoriaId);
    const pct = f.monto / total;
    return h('li', null, h('button', {
      type: 'button', class: 'mov-row',
      'aria-label': `${cat.nombre}: ${formatARS(f.monto)}, ${pctFmt.format(pct)}. Ver movimientos.`,
      onClick: () => verMovimientos({ categoriaId: f.categoriaId, desde, hasta }),
    },
    h('span', { class: 'cat-badge', style: `--cat:${safeColor(cat.color)}`, 'aria-hidden': 'true' }, cat.emoji),
    h('span', { class: 'mov-main' },
      h('span', { class: 'mov-cat' }, cat.nombre),
      h('span', { class: 'bar', 'aria-hidden': 'true' },
        h('span', { class: 'bar-fill', style: `--cat:${safeColor(cat.color)};width:${(pct * 100).toFixed(1)}%` }))),
    h('span', { class: 'amount-col' },
      h('strong', null, formatARS(f.monto)),
      h('span', { class: 'muted' }, pctFmt.format(pct)))));
  }));

  card.append(donut, lista, h('p', { class: 'muted hint' }, 'Tocá una categoría para ver sus movimientos.'));
  return card;
}

// ---------- Tendencia ----------

function tendencia(porMes, mesActual) {
  const meses = [...porMes.keys()];
  const datos = meses.map((ym) => totales(porMes.get(ym)));
  const canvas = h('canvas', {
    role: 'img',
    'aria-label': `Gráfico de barras de ingresos y gastos de los últimos ${MESES_TENDENCIA} meses. Los valores están en la tabla.`,
  });

  // Tabla equivalente para lectores de pantalla.
  // (Envuelta en un div: una <table> no respeta el ancho de 1px de .sr-only y desborda la página.)
  const tabla = h('div', { class: 'sr-only' }, h('table', null,
    h('caption', null, `Ingresos y gastos, últimos ${MESES_TENDENCIA} meses`),
    h('thead', null, h('tr', null, h('th', null, 'Mes'), h('th', null, 'Ingresos'), h('th', null, 'Gastos'))),
    h('tbody', null, meses.map((ym, i) => h('tr', null,
      h('th', null, monthLabel(ym)), h('td', null, formatARS(datos[i].ingresos)), h('td', null, formatARS(datos[i].gastos)))))));

  mountChart(canvas, (Chart, c) => new Chart(canvas, {
    type: 'bar',
    data: {
      labels: meses.map(monthShort),
      datasets: [
        { label: 'Ingresos', data: datos.map((d) => pesos(d.ingresos)), backgroundColor: c.ingreso, borderRadius: 4 },
        { label: 'Gastos', data: datos.map((d) => pesos(d.gastos)), backgroundColor: c.gasto, borderRadius: 4 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: reducedMotion() ? false : undefined,
      onClick: (_e, els) => { if (els[0]) setMes(meses[els[0].index]); },
      plugins: {
        legend: { labels: { color: c.text, boxWidth: 12, boxHeight: 12 } },
        tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${formatARS(fromPesos(ctx.raw))}` } },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: (ctx) => (meses[ctx.index] === mesActual ? c.text : c.muted),
            font: (ctx) => ({ weight: meses[ctx.index] === mesActual ? 'bold' : 'normal' }),
          },
        },
        y: {
          beginAtZero: true,
          grid: { color: c.border },
          border: { display: false },
          ticks: { color: c.muted, maxTicksLimit: 5, callback: (v) => compactFmt.format(v) },
        },
      },
    },
  }));

  return h('div', { class: 'card' },
    h('h3', null, `Últimos ${MESES_TENDENCIA} meses`),
    h('div', { class: 'trend-chart' }, canvas),
    tabla,
    h('p', { class: 'muted hint' }, 'Tocá una barra para ir a ese mes.'));
}
