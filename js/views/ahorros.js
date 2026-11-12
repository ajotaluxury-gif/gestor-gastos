// Pantalla de Ahorros: total, metas, dónde está la plata, cotizaciones y movimientos.
import { h, emptyState } from '../dom.js';
import { AMBITOS } from '../state.js';
import * as A from '../ahorros.js';
import { formatARS, formatCantidad, formatNumber } from '../money.js';
import { currentMonth, toDisplay, fechaLocal } from '../dates.js';
import {
  openCuentaForm, openMetaForm, openAhorroForm, guardarCotizacionDesdeInput,
} from './ahorro-forms.js';

const PAGINA = 30;
const pctFmt = new Intl.NumberFormat('es-AR', { style: 'percent', maximumFractionDigits: 0 });

function barra(pct, label) {
  return h('span', {
    class: `budget-bar ${pct >= 1 ? 'level-meta' : 'level-ok'}`, role: 'progressbar',
    'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(Math.min(pct, 1) * 100), 'aria-label': label,
  }, h('span', { class: 'budget-fill', style: `width:${(Math.min(Math.max(pct, 0), 1) * 100).toFixed(1)}%` }));
}

function seccion(titulo, accion, ...hijos) {
  return h('section', { class: 'ahorro-sec' },
    h('div', { class: 'sec-head' }, h('h3', null, titulo), accion),
    hijos);
}

function tarjetaMeta(m, ahorros, cotiz) {
  const p = A.progresoMeta(m, ahorros, cotiz);
  const cumplida = p.pct >= 1;
  return h('li', { class: 'card meta-card' },
    h('button', { type: 'button', class: 'meta-main', onClick: () => openMetaForm({ id: m.id }), 'aria-label': `Editar meta ${m.nombre}` },
      h('span', { class: 'meta-emoji', 'aria-hidden': 'true' }, m.emoji),
      h('span', { class: 'mov-main' },
        h('span', { class: 'mov-cat' }, m.nombre),
        h('span', { class: 'budget-amount' }, `${formatCantidad(Math.max(p.acumulado, 0), m.moneda)} de ${formatCantidad(m.objetivo, m.moneda)} · ${pctFmt.format(p.pct)}`),
        barra(p.pct, `Meta ${m.nombre}`),
        h('span', { class: `budget-status ${cumplida ? 'level-meta' : 'level-ok'}` },
          cumplida ? '🎉 ¡Meta cumplida!' : `Faltan ${formatCantidad(p.faltan, m.moneda)}`),
        p.sinCotizacion.length > 0 && h('span', { class: 'budget-status level-alerta' },
          `⚠ Sin cotización de ${p.sinCotizacion.join(', ')}: no se suma`))),
    !m.archivada && h('button', {
      type: 'button', class: 'btn btn-small', onClick: () => openAhorroForm({ metaId: m.id }),
      'aria-label': `Aportar a ${m.nombre}`,
    }, '＋ Aportar'));
}

function filaCuenta(c, saldo, cotiz) {
  const t = A.TIPOS_CUENTA[c.tipo];
  const equiv = c.moneda !== 'ARS' && saldo ? A.convertir(saldo, c.moneda, 'ARS', cotiz) : null;
  return h('li', null, h('button', {
    type: 'button', class: 'mov-row', onClick: () => openCuentaForm({ id: c.id }),
    'aria-label': `${A.etiquetaCuenta(c)}: ${formatCantidad(saldo, c.moneda)}. Editar.`,
  },
  h('span', { class: 'cat-badge', style: '--cat:#0f766e', 'aria-hidden': 'true' }, t?.emoji ?? '💰'),
  h('span', { class: 'mov-main' },
    h('span', { class: 'mov-cat' }, c.detalle || t?.label || c.tipo),
    h('span', { class: 'mov-nota' }, [t?.label, c.nota].filter(Boolean).join(' · '))),
  h('span', { class: 'amount-col' },
    h('strong', null, formatCantidad(saldo, c.moneda)),
    equiv != null && h('span', { class: 'muted' }, `≈ ${formatARS(equiv)}`))));
}

function filaAhorro(a, cuenta, meta) {
  const aporte = a.tipo === 'aporte';
  return h('li', null, h('button', {
    type: 'button', class: 'mov-row', onClick: () => openAhorroForm({ id: a.id }),
    'aria-label': `${aporte ? 'Aporte' : 'Retiro'} de ${formatCantidad(a.cantidad, a.moneda)} el ${toDisplay(a.fecha)}. Editar.`,
  },
  h('span', { class: 'cat-badge', style: `--cat:${aporte ? '#059669' : '#e11d48'}`, 'aria-hidden': 'true' }, meta?.emoji ?? (aporte ? '＋' : '−')),
  h('span', { class: 'mov-main' },
    h('span', { class: 'mov-cat' }, `${aporte ? 'Aporte' : 'Retiro'}${meta ? ` · ${meta.nombre}` : ''}`),
    h('span', { class: 'mov-nota' }, [toDisplay(a.fecha), cuenta ? A.etiquetaCuenta(cuenta) : 'Cuenta borrada', a.nota].filter(Boolean).join(' · '))),
  h('span', { class: `mov-monto ${aporte ? 'ingreso' : 'gasto'}` }, `${aporte ? '+' : '−'}${formatCantidad(a.cantidad, a.moneda)}`)));
}

function tarjetaCotizaciones(monedas, cotiz) {
  if (!monedas.length) return null;
  return seccion('Cotizaciones', null,
    h('p', { class: 'muted hint' }, 'Cargalas a mano (por ejemplo la del MEP) para ver tus ahorros en pesos. No se actualizan solas.'),
    h('ul', { class: 'rows cotiz' }, monedas.map((m) => {
      const c = cotiz.get(m);
      const input = h('input', {
        id: `cot-${m}`, class: 'input', type: 'text', inputmode: 'decimal', autocomplete: 'off', enterkeyhint: 'done',
        placeholder: 'Sin cargar', value: c ? formatNumber(c.centavos) : null,
      });
      const guardar = () => {
        const actual = c ? formatNumber(c.centavos) : '';
        if (input.value.trim() !== actual) guardarCotizacionDesdeInput(m, input.value);
      };
      input.addEventListener('change', guardar);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } });
      return h('li', { class: 'cotiz-row' },
        h('label', { for: `cot-${m}` }, `1 ${m} = $`),
        input,
        h('span', { class: 'muted cotiz-fecha' }, c ? toDisplay(fechaLocal(c.updatedAt)) : ''));
    })));
}

export async function render(state) {
  const [cuentas, metas, ahorros, cotiz] = await Promise.all([
    A.listCuentas(state.ambito), A.listMetas(state.ambito), A.listAhorros(state.ambito), A.cotizaciones(),
  ]);
  const titulo = h('h2', null, `Ahorros · ${AMBITOS[state.ambito].label}`);

  if (!cuentas.length) {
    return h('section', null, titulo,
      emptyState('🐷', 'Todavía no cargaste ahorros',
        'Empezá creando dónde tenés la plata: efectivo, banco, billetera virtual, dólares o cripto.'),
      h('button', { class: 'btn btn-primary btn-block', type: 'button', onClick: () => openCuentaForm() }, '＋ Crear cuenta de ahorro'));
  }

  const saldos = A.saldosPorCuenta(ahorros);
  const tot = A.totalesAhorro(ahorros, cotiz);
  const mes = A.ahorroDelMes(ahorros, currentMonth(), cotiz);
  const soloPesos = [...tot.porMoneda.keys()].every((m) => m === 'ARS');
  const cuentaMap = new Map(cuentas.map((c) => [c.id, c]));
  const metaMap = new Map(metas.map((m) => [m.id, m]));
  const monedasExtra = [...new Set(cuentas.map((c) => c.moneda))].filter((m) => m !== 'ARS');

  // Total
  const chips = [...tot.porMoneda].filter(([, v]) => v !== 0).map(([m, v]) => h('span', { class: 'moneda-chip' }, formatCantidad(v, m)));
  const total = h('div', { class: 'card ahorro-total' },
    h('span', { class: 'muted' }, 'Total ahorrado'),
    h('strong', { class: 'big' }, `${soloPesos ? '' : '≈ '}${formatARS(tot.totalPesos)}`),
    chips.length > 1 && h('div', { class: 'moneda-chips' }, chips),
    tot.sinCotizacion.length > 0 && h('p', { class: 'budget-status level-alerta' },
      `⚠ Falta la cotización de ${tot.sinCotizacion.join(', ')} para sumarlo al total.`),
    (mes.aportado > 0 || mes.retirado > 0 || mes.sinValuar.length > 0) && h('p', { class: 'muted hint' },
      `Este mes: aportaste ${formatARS(mes.aportado)}${mes.retirado ? ` · retiraste ${formatARS(mes.retirado)}` : ''}`
      + (mes.sinValuar.length ? ` (+${mes.sinValuar.length} en otra moneda sin cotización)` : '')),
    h('div', { class: 'reminder-actions' },
      h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openAhorroForm({ tipo: 'aporte' }) }, '＋ Aportar'),
      h('button', { class: 'btn', type: 'button', onClick: () => openAhorroForm({ tipo: 'retiro' }) }, '− Retirar')));

  // Metas
  const activas = metas.filter((m) => !m.archivada);
  const archivadasM = metas.filter((m) => m.archivada);
  const secMetas = seccion('Metas',
    h('button', { class: 'link-btn', type: 'button', onClick: () => openMetaForm() }, '＋ Nueva meta'),
    activas.length
      ? h('ul', { class: 'meta-list' }, activas.map((m) => tarjetaMeta(m, ahorros, cotiz)))
      : h('p', { class: 'muted hint' }, 'Ponele un objetivo a tu ahorro: auto, moto, TV, un viaje…'),
    archivadasM.length > 0 && h('details', { class: 'archived' },
      h('summary', null, `Archivadas (${archivadasM.length})`),
      h('ul', { class: 'meta-list' }, archivadasM.map((m) => tarjetaMeta(m, ahorros, cotiz)))));

  // Cuentas
  const activasC = cuentas.filter((c) => !c.archivada);
  const archivadasC = cuentas.filter((c) => c.archivada);
  const secCuentas = seccion('¿Dónde está la plata?',
    h('button', { class: 'link-btn', type: 'button', onClick: () => openCuentaForm() }, '＋ Nueva cuenta'),
    h('ul', { class: 'rows' }, activasC.map((c) => filaCuenta(c, saldos.get(c.id) ?? 0, cotiz))),
    archivadasC.length > 0 && h('details', { class: 'archived' },
      h('summary', null, `Archivadas (${archivadasC.length})`),
      h('ul', { class: 'rows' }, archivadasC.map((c) => filaCuenta(c, saldos.get(c.id) ?? 0, cotiz)))));

  // Movimientos (más recientes primero, de a PAGINA)
  const ordenados = [...ahorros].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.createdAt.localeCompare(a.createdAt));
  const listaSlot = h('div');
  let visibles = PAGINA;
  const pintarLista = () => {
    const resto = ordenados.length - visibles;
    listaSlot.replaceChildren(
      h('ul', { class: 'rows' }, ordenados.slice(0, visibles).map((a) => filaAhorro(a, cuentaMap.get(a.cuentaId), metaMap.get(a.metaId)))),
      ...(resto > 0 ? [h('button', {
        class: 'btn btn-block', type: 'button', onClick: () => { visibles += PAGINA; pintarLista(); },
      }, `Mostrar más (${resto} restantes)`)] : []));
  };
  pintarLista();
  const secMovs = ordenados.length
    ? seccion('Movimientos de ahorro', null, listaSlot)
    : seccion('Movimientos de ahorro', null, h('p', { class: 'muted hint' }, 'Todavía no hay aportes. Tocá "＋ Aportar".'));

  return h('section', { class: 'ahorros' },
    titulo, total, secMetas, secCuentas, tarjetaCotizaciones(monedasExtra, cotiz), secMovs);
}
