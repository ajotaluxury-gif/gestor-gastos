// Listado de movimientos: por mes, o búsqueda con filtros sobre todo el historial.
import { h, emptyState, safeColor } from '../dom.js';
import {
  listCategorias, listMovimientos, listMovimientosMes, totales, ordenarMovimientos,
} from '../repo.js';
import { formatARS } from '../money.js';
import { toDisplay, todayISO } from '../dates.js';
import { monthNav, totalesCard } from '../components.js';
import { openMovimientoForm } from './form.js';

// Los filtros sobreviven a cambios de pestaña mientras la app está abierta.
const filtros = { q: '', tipo: '', categoriaId: '', desde: '', hasta: '' };
let panelAbierto = false;

/** Abre el listado ya filtrado (por ejemplo, desde el resumen). */
export function verMovimientos({ categoriaId = '', tipo = '', desde = '', hasta = '' }) {
  Object.assign(filtros, { q: '', tipo, categoriaId, desde, hasta });
  panelAbierto = true;
  location.hash = '#/movimientos';
}

const hayFiltros = () => Object.values(filtros).some(Boolean);
const normalizar = (s) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// ---------- Piezas ----------

const weekdayFmt = new Intl.DateTimeFormat('es-AR', { weekday: 'short', timeZone: 'UTC' });

function dayLabel(iso) {
  const hoy = todayISO();
  const d = new Date();
  d.setDate(d.getDate() - 1);
  if (iso === hoy) return 'Hoy';
  if (iso === todayISO(d)) return 'Ayer';
  const [y, m, dd] = iso.split('-').map(Number);
  const wd = weekdayFmt.format(new Date(Date.UTC(y, m - 1, dd))).replace('.', '');
  return `${wd.charAt(0).toUpperCase()}${wd.slice(1)} ${toDisplay(iso)}`;
}

function fila(m, cat) {
  const nombre = cat?.nombre ?? 'Sin categoría';
  const signo = m.tipo === 'gasto' ? '−' : '+';
  const monto = `${signo}${formatARS(m.montoCentavos)}`;
  return h('li', null,
    h('button', {
      type: 'button',
      class: 'mov-row',
      'aria-label': `${nombre}, ${m.tipo} de ${formatARS(m.montoCentavos)}${m.nota ? `, ${m.nota}` : ''}. Editar.`,
      onClick: () => openMovimientoForm(m.id),
    },
    h('span', { class: 'cat-badge', style: `--cat:${safeColor(cat?.color)}`, 'aria-hidden': 'true' }, cat?.emoji ?? '❔'),
    h('span', { class: 'mov-main' },
      h('span', { class: 'mov-cat' }, nombre),
      m.nota && h('span', { class: 'mov-nota' }, m.nota)),
    h('span', { class: `mov-monto ${m.tipo}` }, monto)));
}

function lista(movs, catMap) {
  const porDia = new Map();
  for (const m of movs) {
    if (!porDia.has(m.fecha)) porDia.set(m.fecha, []);
    porDia.get(m.fecha).push(m);
  }
  return h('div', null, [...porDia].map(([fecha, items]) =>
    h('section', { class: 'day' },
      h('h3', { class: 'day-head' }, dayLabel(fecha)),
      h('ul', { class: 'rows' }, items.map((m) => fila(m, catMap.get(m.categoriaId)))))));
}

function aplicarFiltros(movs, catMap) {
  const q = normalizar(filtros.q.trim());
  return movs.filter((m) => {
    if (filtros.tipo && m.tipo !== filtros.tipo) return false;
    if (filtros.categoriaId && m.categoriaId !== filtros.categoriaId) return false;
    if (q && !normalizar(m.nota).includes(q) && !normalizar(catMap.get(m.categoriaId)?.nombre).includes(q)) return false;
    return true;
  });
}

function filtrosPanel(categorias, onChange) {
  let debounce;
  const set = (key, value, delay = 0) => {
    filtros[key] = value;
    clearTimeout(debounce);
    debounce = setTimeout(onChange, delay);
  };

  const q = h('input', {
    id: 'f-q', class: 'input', type: 'search', placeholder: 'Ej: farmacia', autocomplete: 'off', value: filtros.q || null,
    onInput: (e) => set('q', e.target.value, 200),
  });
  const tipo = h('select', { id: 'f-tipo', class: 'input', onChange: (e) => set('tipo', e.target.value) },
    h('option', { value: '' }, 'Todos'),
    h('option', { value: 'gasto' }, 'Gastos'),
    h('option', { value: 'ingreso' }, 'Ingresos'));
  const optionsDe = (t) => categorias.filter((c) => c.tipo === t).map((c) =>
    h('option', { value: c.id }, `${c.emoji} ${c.nombre}${c.archivada ? ' (archivada)' : ''}`));
  const categoria = h('select', { id: 'f-cat', class: 'input', onChange: (e) => set('categoriaId', e.target.value) },
    h('option', { value: '' }, 'Todas'),
    h('optgroup', { label: 'Gastos' }, optionsDe('gasto')),
    h('optgroup', { label: 'Ingresos' }, optionsDe('ingreso')));
  const desde = h('input', { id: 'f-desde', class: 'input', type: 'date', onChange: (e) => set('desde', e.target.value) });
  const hasta = h('input', { id: 'f-hasta', class: 'input', type: 'date', onChange: (e) => set('hasta', e.target.value) });

  tipo.value = filtros.tipo;
  categoria.value = filtros.categoriaId;
  desde.value = filtros.desde;
  hasta.value = filtros.hasta;

  const el = h('div', { id: 'filtros', class: 'card filters', hidden: !panelAbierto },
    h('div', { class: 'field' }, h('label', { for: 'f-q' }, 'Buscar en notas y categorías'), q),
    h('div', { class: 'field-row' },
      h('div', { class: 'field' }, h('label', { for: 'f-tipo' }, 'Tipo'), tipo),
      h('div', { class: 'field' }, h('label', { for: 'f-cat' }, 'Categoría'), categoria)),
    h('div', { class: 'field-row' },
      h('div', { class: 'field' }, h('label', { for: 'f-desde' }, 'Desde'), desde),
      h('div', { class: 'field' }, h('label', { for: 'f-hasta' }, 'Hasta'), hasta)));

  const reset = () => {
    Object.keys(filtros).forEach((k) => { filtros[k] = ''; });
    for (const input of [q, tipo, categoria, desde, hasta]) input.value = '';
    onChange();
  };
  return { el, reset, focus: () => q.focus() };
}

// ---------- Vista ----------

export async function render(state) {
  const categorias = await listCategorias(state.ambito);
  const catMap = new Map(categorias.map((c) => [c.id, c]));
  if (filtros.categoriaId && !catMap.has(filtros.categoriaId)) filtros.categoriaId = '';

  const top = h('div');
  const results = h('div');
  const panel = filtrosPanel(categorias, () => refresh());

  const toggle = h('button', {
    class: 'icon-btn', type: 'button', 'aria-label': 'Buscar y filtrar',
    'aria-expanded': String(panelAbierto), 'aria-controls': 'filtros',
    onClick: () => {
      panelAbierto = !panelAbierto;
      panel.el.hidden = !panelAbierto;
      toggle.setAttribute('aria-expanded', String(panelAbierto));
      if (panelAbierto) panel.focus();
    },
  }, '🔍');

  let token = 0;
  async function refresh() {
    const t = ++token;
    const conFiltros = hayFiltros();
    toggle.classList.toggle('is-active', conFiltros);

    if (conFiltros && filtros.desde && filtros.hasta && filtros.desde > filtros.hasta) {
      top.replaceChildren(filtrosHeader(null));
      results.replaceChildren(emptyState('📅', 'Revisá las fechas', 'La fecha "desde" es posterior a "hasta".'));
      return;
    }

    const movs = conFiltros
      ? aplicarFiltros(await listMovimientos(state.ambito, filtros.desde || undefined, filtros.hasta || undefined), catMap)
      : await listMovimientosMes(state.ambito, state.mes);
    if (t !== token) return;
    ordenarMovimientos(movs);

    top.replaceChildren(conFiltros ? filtrosHeader(movs.length) : monthNav(state.mes));
    if (!movs.length) {
      results.replaceChildren(conFiltros
        ? emptyState('🔍', 'No hay resultados', 'Probá con otros filtros.')
        : emptyState('📋', 'No hay movimientos en este mes', 'Tocá + para cargar el primero.'));
      return;
    }
    results.replaceChildren(totalesCard(totales(movs)), lista(movs, catMap));
  }

  function filtrosHeader(cantidad) {
    return h('div', { class: 'filter-head' },
      h('h2', null, cantidad == null ? 'Búsqueda' : `${cantidad} ${cantidad === 1 ? 'resultado' : 'resultados'}`),
      h('button', { class: 'link-btn', type: 'button', onClick: panel.reset }, 'Limpiar filtros'));
  }

  await refresh();
  return h('section', null,
    h('div', { class: 'toolbar' }, top, toggle),
    panel.el,
    results);
}
