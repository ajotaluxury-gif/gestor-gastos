// Plan → Fijos y cuotas: checklist del mes con vencimientos, totales y capital comprometido.
import { h, emptyState, safeColor } from '../dom.js';
import { notifyDataChanged } from '../state.js';
import * as F from '../fijos.js';
import { formatARS, formatNumber, parseMonto } from '../money.js';
import { currentMonth, lastDayOfMonth, monthName, toDisplay, todayISO } from '../dates.js';
import { monthNav, planTabs } from '../components.js';
import { toast, toastError } from '../toast.js';
import { openSheet, fieldErrors } from '../sheet.js';
import { validarMovimiento, ValidationError } from '../repo.js';
import { openFijoForm } from './fijo-form.js';

const ddmm = (iso) => toDisplay(iso).slice(0, 5);

/** Texto del estado: siempre con ícono y palabras, no solo color. */
function estadoTexto(it) {
  const { nivel, dias } = it.estado;
  const v = it.cuota.vence;
  switch (nivel) {
    case 'pagado': return `✓ Pagado el ${toDisplay(it.pago.fecha)}`;
    case 'vencido': return `⛔ Vencido hace ${-dias} ${dias === -1 ? 'día' : 'días'} (${ddmm(v)})`;
    case 'hoy': return '⚠ Vence hoy';
    case 'pronto': return `⚠ Vence ${dias === 1 ? 'mañana' : `en ${dias} días`} (${ddmm(v)})`;
    case 'ok': return `Vence el ${ddmm(v)}`;
    default: return 'Sin fecha de vencimiento';
  }
}

let ocupado = false;

/** Hoja para confirmar el pago (permite ajustar monto y fecha). */
async function abrirPagar(it, ym) {
  if (ocupado) return;
  ocupado = true;
  try {
    const errs = fieldErrors(['monto', 'fecha']);
    const montoInput = h('input', {
      id: 'p-monto', class: 'input input-monto', type: 'text', inputmode: 'decimal', autocomplete: 'off',
      enterkeyhint: 'done', value: formatNumber(it.fijo.montoCentavos),
    });
    const hoy = todayISO();
    const fechaDefault = ym === currentMonth() || ym > currentMonth() ? hoy : (it.cuota.vence ?? lastDayOfMonth(ym));
    const fechaInput = h('input', { id: 'p-fecha', class: 'input', type: 'date', value: fechaDefault });
    errs.bind('monto', montoInput);
    errs.bind('fecha', fechaInput);
    const cuotaTxt = it.cuota.total ? ` · cuota ${it.cuota.numero} de ${it.cuota.total}` : '';
    let sheet;
    const okBtn = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Marcar como pagado');
    sheet = openSheet({
      title: `Pagar ${it.fijo.nombre}`,
      onSubmit: async () => {
        const monto = parseMonto(montoInput.value);
        const errors = validarMovimiento({
          ambito: it.fijo.ambito, tipo: 'gasto', montoCentavos: monto.ok ? monto.value : NaN,
          categoriaId: it.fijo.categoriaId, fecha: fechaInput.value, nota: '',
        });
        delete errors.categoria;
        if (!monto.ok) errors.monto = monto.error;
        if (errs.show(errors)) return;
        okBtn.disabled = true;
        try {
          const res = await F.pagarFijo(it.fijo.id, ym, { montoCentavos: monto.value, fecha: fechaInput.value });
          sheet.close();
          notifyDataChanged();
          toast(`✓ ${it.fijo.nombre} pagado: se cargó el gasto`, {
            action: 'Deshacer', duration: 6000,
            onAction: () => F.desmarcarPago(res.pago.id).then(notifyDataChanged, toastError),
          });
        } catch (err) {
          if (err instanceof ValidationError) errs.show(err.errors);
          else errs.showGeneral(err);
        } finally {
          okBtn.disabled = false;
        }
      },
      body: [
        h('p', { class: 'muted' }, `${monthName(ym)}${cuotaTxt}${it.cuota.vence ? ` · vence el ${toDisplay(it.cuota.vence)}` : ''}`),
        h('div', { class: 'field' }, h('label', { for: 'p-monto' }, 'Monto pagado ($)'), montoInput, errs.els.monto),
        h('div', { class: 'field' }, h('label', { for: 'p-fecha' }, 'Fecha de pago'), fechaInput, errs.els.fecha),
        h('p', { class: 'muted hint' }, 'Se carga como gasto en Movimientos. Si lo destildás, se borra.'),
        errs.general,
      ],
      footer: [h('button', { class: 'btn', type: 'button', onClick: () => sheet.close() }, 'Cancelar'), okBtn],
    });
    montoInput.focus();
    await sheet.closed;
  } catch (err) {
    toastError(err);
  } finally {
    ocupado = false;
  }
}

async function desmarcar(it) {
  try {
    const res = await F.desmarcarPago(it.pago.id);
    notifyDataChanged();
    if (res) {
      toast(`${it.fijo.nombre}: desmarcado y borrado el gasto`, {
        action: 'Deshacer', duration: 6000,
        onAction: () => F.restaurarPago(res).then(notifyDataChanged, toastError),
      });
    }
  } catch (err) {
    toastError(err);
  }
}

function fila(it, ym) {
  const pagado = Boolean(it.pago);
  const cat = it.categoria;
  const cuotaTxt = it.cuota.total ? `Cuota ${it.cuota.numero} de ${it.cuota.total}` : null;
  return h('li', { class: `fijo-item nivel-${it.estado.nivel}` },
    h('button', {
      type: 'button', class: `check${pagado ? ' is-checked' : ''}`, role: 'checkbox', 'aria-checked': String(pagado),
      'aria-label': `${pagado ? 'Desmarcar' : 'Marcar como pagado'}: ${it.fijo.nombre}`,
      onClick: () => (pagado ? desmarcar(it) : abrirPagar(it, ym)),
    }, pagado ? '✓' : ''),
    h('button', {
      type: 'button', class: 'mov-row', onClick: () => openFijoForm({ id: it.fijo.id }),
      'aria-label': `${it.fijo.nombre}${cuotaTxt ? `, ${cuotaTxt}` : ''}, ${formatARS(pagado ? it.montoPagado : it.fijo.montoCentavos)}. ${estadoTexto(it).replace(/^[⛔⚠✓] /, '')}. Editar.`,
    },
    h('span', { class: 'cat-badge', style: `--cat:${safeColor(cat?.color)}`, 'aria-hidden': 'true' }, cat?.emoji ?? '❔'),
    h('span', { class: 'mov-main' },
      h('span', { class: 'mov-cat' }, it.fijo.nombre),
      cuotaTxt && h('span', { class: 'mov-nota' }, cuotaTxt),
      h('span', { class: `fijo-estado estado-${it.estado.nivel}` }, estadoTexto(it))),
    h('span', { class: `mov-monto${pagado ? ' pagado' : ''}` }, formatARS(pagado ? it.montoPagado : it.fijo.montoCentavos))));
}

export async function render(state) {
  const [items, fijos, pagos] = await Promise.all([
    F.checklistMes(state.ambito, state.mes), F.listFijos(state.ambito), F.listPagos(state.ambito),
  ]);
  const section = h('section', { class: 'plan' }, planTabs('plan'), monthNav(state.mes));
  const agregar = h('button', { class: 'btn btn-block', type: 'button', onClick: () => openFijoForm() }, '＋ Agregar gasto fijo o cuota');

  if (!fijos.length) {
    section.append(
      emptyState('🗓️', 'Todavía no hay gastos fijos',
        'Cargá alquiler, servicios, cuotas de préstamos o de la tarjeta: aparecen solos cada mes para tildarlos cuando los pagás.'),
      agregar);
    return section;
  }

  const tot = F.totalesChecklist(items);
  const pagados = new Set(pagos.map((p) => `${p.fijoId}|${p.mes}`));
  const cap = F.capitalComprometido(fijos, pagados, state.mes);
  const pct = tot.comprometido ? tot.pagado / tot.comprometido : 0;
  const alertas = items.filter((it) => ['vencido', 'hoy', 'pronto'].includes(it.estado.nivel)).length;

  section.append(h('div', { class: 'card budget-total' },
    h('div', { class: 'budget-head' },
      h('span', { class: 'muted' }, `Comprometido en ${monthName(state.mes)}`),
      h('strong', null, formatARS(tot.comprometido))),
    h('span', {
      class: 'budget-bar level-ok', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100,
      'aria-valuenow': Math.round(pct * 100), 'aria-label': 'Pagado del mes',
    }, h('span', { class: 'budget-fill', style: `width:${(pct * 100).toFixed(1)}%` })),
    h('p', { class: 'budget-status level-ok' }, `Pagado ${formatARS(tot.pagado)} · Falta ${formatARS(tot.falta)}`),
    alertas > 0 && h('p', { class: 'budget-status level-alerta' },
      `⚠ ${alertas} ${alertas === 1 ? 'vencimiento necesita' : 'vencimientos necesitan'} atención`),
    cap.cuotas > 0 && h('p', { class: 'muted hint' },
      `Capital comprometido en cuotas desde ${monthName(state.mes)}: ${formatARS(cap.monto)} (${cap.cuotas} ${cap.cuotas === 1 ? 'cuota' : 'cuotas'} de ${cap.planes} ${cap.planes === 1 ? 'plan' : 'planes'}).`)));

  section.append(
    items.length
      ? h('ul', { class: 'rows checklist' }, items.map((it) => fila(it, state.mes)))
      : h('p', { class: 'muted hint' }, `No hay gastos fijos para ${monthName(state.mes)}.`),
    agregar,
    h('p', { class: 'muted hint' }, 'Tocá el cuadradito para marcarlo como pagado (se carga el gasto). Tocá el nombre para editarlo.'));
  return section;
}
