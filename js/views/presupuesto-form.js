// Hoja para crear o editar el presupuesto mensual de una categoría.
import { h } from '../dom.js';
import { getState, notifyDataChanged } from '../state.js';
import { get } from '../db.js';
import {
  listCategorias, listPresupuestos, guardarPresupuesto, borrarPresupuesto, restaurarPresupuesto,
  validarPresupuesto, ValidationError,
} from '../repo.js';
import { parseMonto, formatNumber } from '../money.js';
import { toast, toastError } from '../toast.js';
import { openSheet, fieldErrors } from '../sheet.js';

let abierto = false;

/** Categorías de gasto activas que todavía no tienen presupuesto. */
export async function categoriasSinPresupuesto(ambito) {
  const [cats, pres] = await Promise.all([listCategorias(ambito), listPresupuestos(ambito)]);
  const con = new Set(pres.map((p) => p.categoriaId));
  return cats.filter((c) => c.tipo === 'gasto' && !c.archivada && !con.has(c.id));
}

/** Sin id: alta; con id: edición. `categoriaId` preselecciona la categoría en el alta. */
export async function openPresupuestoForm({ id, categoriaId } = {}) {
  if (abierto) return;
  abierto = true;
  try {
    const sheet = await abrir({ id, categoriaId });
    if (sheet) await sheet.closed;
  } catch (err) {
    toastError(err);
  } finally {
    abierto = false;
  }
}

async function abrir({ id, categoriaId }) {
  const pres = id ? await get('presupuestos', id) : null;
  if (id && !pres) {
    toast('Ese presupuesto ya no existe.');
    return null;
  }
  const ambito = pres?.ambito ?? getState().ambito;
  const categoria = pres ? await get('categorias', pres.categoriaId) : null;
  const disponibles = pres ? [] : await categoriasSinPresupuesto(ambito);
  if (!pres && !disponibles.length) {
    toast('Todas las categorías de gasto ya tienen presupuesto.');
    return null;
  }

  const errs = fieldErrors(['categoria', 'monto']);
  const montoInput = h('input', {
    id: 'p-monto', class: 'input input-monto', type: 'text', inputmode: 'decimal',
    autocomplete: 'off', enterkeyhint: 'done', placeholder: '0,00',
    value: pres ? formatNumber(pres.montoCentavos) : null,
  });
  errs.bind('monto', montoInput);

  let catSelect = null;
  let catField;
  if (pres) {
    catField = h('p', { class: 'budget-cat' },
      h('span', { 'aria-hidden': 'true' }, categoria?.emoji ?? '❔'), ' ',
      h('strong', null, categoria?.nombre ?? 'Categoría borrada'));
  } else {
    catSelect = h('select', { id: 'p-cat', class: 'input' },
      h('option', { value: '' }, 'Elegí una categoría…'),
      disponibles.map((c) => h('option', { value: c.id }, `${c.emoji} ${c.nombre}`)));
    catSelect.value = disponibles.some((c) => c.id === categoriaId) ? categoriaId : '';
    errs.bind('categoria', catSelect);
    catSelect.addEventListener('change', () => errs.clear('categoria'));
    catField = h('div', { class: 'field' }, h('label', { for: 'p-cat' }, 'Categoría'), catSelect, errs.els.categoria);
  }

  let sheet;
  const saveBtn = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Guardar');

  async function guardar() {
    const monto = parseMonto(montoInput.value);
    const data = {
      ambito,
      categoriaId: pres?.categoriaId ?? catSelect.value,
      montoCentavos: monto.ok ? monto.value : NaN,
    };
    const errors = validarPresupuesto(data);
    if (!monto.ok) errors.monto = monto.error;
    if (errs.show(errors)) return;
    saveBtn.disabled = true;
    try {
      await guardarPresupuesto(data);
      sheet.close();
      notifyDataChanged();
      toast(pres ? 'Presupuesto actualizado' : 'Presupuesto creado');
    } catch (err) {
      if (err instanceof ValidationError) errs.show(err.errors);
      else errs.showGeneral(err);
    } finally {
      saveBtn.disabled = false;
    }
  }

  async function borrar() {
    try {
      const rec = await borrarPresupuesto(pres.id);
      sheet.close();
      notifyDataChanged();
      if (!rec) return;
      toast('Presupuesto borrado', {
        action: 'Deshacer',
        duration: 6000,
        onAction: () => restaurarPresupuesto(rec).then(notifyDataChanged, toastError),
      });
    } catch (err) {
      errs.showGeneral(err);
    }
  }

  sheet = openSheet({
    title: pres ? 'Editar presupuesto' : 'Nuevo presupuesto',
    onSubmit: guardar,
    body: [
      catField,
      h('div', { class: 'field' },
        h('label', { for: 'p-monto' }, 'Tope mensual ($)'), montoInput, errs.els.monto),
      h('p', { class: 'muted hint' },
        'Es el mismo tope para todos los meses. Te avisamos al llegar al 80 % y al pasarte del 100 %.'),
      errs.general,
    ],
    footer: [
      pres && h('button', { class: 'btn btn-danger-outline', type: 'button', onClick: borrar }, 'Borrar'),
      h('button', { class: 'btn', type: 'button', onClick: () => sheet.close() }, 'Cancelar'),
      saveBtn,
    ],
  });
  (catSelect && !catSelect.value ? catSelect : montoInput).focus();
  return sheet;
}
