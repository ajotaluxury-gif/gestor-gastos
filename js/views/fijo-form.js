// Hoja para crear/editar un gasto fijo o un plan en cuotas.
import { h } from '../dom.js';
import { getState, notifyDataChanged } from '../state.js';
import { get } from '../db.js';
import { listCategorias, ValidationError } from '../repo.js';
import * as F from '../fijos.js';
import { parseMonto, formatNumber } from '../money.js';
import { addMonths, monthLabel } from '../dates.js';
import { toast, toastError } from '../toast.js';
import { openSheet, fieldErrors } from '../sheet.js';

let abierto = false;

export async function openFijoForm({ id } = {}) {
  if (abierto) return;
  abierto = true;
  try {
    const sheet = await abrir(id);
    if (sheet) await sheet.closed;
  } catch (err) {
    toastError(err);
  } finally {
    abierto = false;
  }
}

async function abrir(id) {
  const fijo = id ? await get('fijos', id) : null;
  if (id && !fijo) {
    toast('Ese gasto fijo ya no existe.');
    return null;
  }
  const { mes } = getState();
  const ambito = fijo?.ambito ?? getState().ambito;
  const cats = (await listCategorias(ambito)).filter((c) => c.tipo === 'gasto' && (!c.archivada || c.id === fijo?.categoriaId));
  let enCuotas = Boolean(fijo?.cuotas);

  const errs = fieldErrors(['nombre', 'categoria', 'monto', 'dia', 'inicio', 'cuotas', 'cuotaActual']);
  const nombreInput = h('input', {
    id: 'x-nombre', class: 'input', type: 'text', maxlength: F.NOMBRE_FIJO_MAX, autocomplete: 'off', enterkeyhint: 'done',
    placeholder: 'Alquiler, Internet, Préstamo, Visa…', value: fijo?.nombre || null,
  });
  const catSel = h('select', { id: 'x-cat', class: 'input' },
    h('option', { value: '' }, 'Elegí una categoría…'),
    cats.map((c) => h('option', { value: c.id }, `${c.emoji} ${c.nombre}${c.archivada ? ' (archivada)' : ''}`)));
  catSel.value = fijo?.categoriaId ?? '';
  const montoInput = h('input', {
    id: 'x-monto', class: 'input input-monto', type: 'text', inputmode: 'decimal', autocomplete: 'off',
    enterkeyhint: 'done', placeholder: '0,00', value: fijo ? formatNumber(fijo.montoCentavos) : null,
  });
  const diaInput = h('input', {
    id: 'x-dia', class: 'input', type: 'number', inputmode: 'numeric', min: 1, max: 31, step: 1,
    placeholder: 'Ej: 10', value: fijo?.dia ?? null,
  });
  const desdeInput = h('input', { id: 'x-desde', class: 'input', type: 'month', value: fijo && !fijo.cuotas ? fijo.desde : mes });
  const cuotasInput = h('input', {
    id: 'x-cuotas', class: 'input', type: 'number', inputmode: 'numeric', min: 1, max: F.CUOTAS_MAX, step: 1,
    placeholder: 'Ej: 12', value: fijo?.cuotas ?? null,
  });
  // Qué cuota cae en el mes que se está mirando (para planes ya empezados).
  const actualEnMes = fijo?.cuotas ? F.mesesEntre(fijo.inicio, mes) + 1 : 1;
  const actualInput = h('input', {
    id: 'x-actual', class: 'input', type: 'number', inputmode: 'numeric', min: 1, max: F.CUOTAS_MAX, step: 1,
    value: Math.max(1, actualEnMes),
  });
  errs.bind('nombre', nombreInput);
  errs.bind('categoria', catSel);
  errs.bind('monto', montoInput);
  errs.bind('dia', diaInput);
  errs.bind('inicio', desdeInput);
  errs.bind('cuotas', cuotasInput);
  errs.bind('cuotaActual', actualInput);
  catSel.addEventListener('change', () => errs.clear('categoria'));

  const bloqueTodos = h('div', { class: 'field' },
    h('label', { for: 'x-desde' }, '¿Desde qué mes?'), desdeInput, errs.els.inicio);
  const bloqueCuotas = h('div', { class: 'field-row' },
    h('div', { class: 'field' }, h('label', { for: 'x-cuotas' }, 'Cantidad de cuotas'), cuotasInput, errs.els.cuotas),
    h('div', { class: 'field' }, h('label', { for: 'x-actual' }, `Cuota de ${monthLabel(mes).toLowerCase()}`), actualInput, errs.els.cuotaActual));
  const pintarFrecuencia = () => {
    bloqueTodos.hidden = enCuotas;
    bloqueCuotas.hidden = !enCuotas;
  };

  const frecuencia = h('fieldset', { class: 'seg-tipo' },
    h('legend', { class: 'sr-only' }, 'Frecuencia'),
    ...[[false, 'Todos los meses'], [true, 'En cuotas']].map(([v, label]) => h('label', { class: 'seg-opt' },
      h('input', { type: 'radio', name: 'frecuencia', checked: v === enCuotas, onChange: () => { enCuotas = v; pintarFrecuencia(); } }),
      h('span', null, label))));

  let sheet;
  const saveBtn = h('button', { class: 'btn btn-primary', type: 'submit' }, fijo ? 'Guardar' : 'Crear');

  const entero = (s) => (String(s).trim() === '' ? null : Number(s));

  async function guardar() {
    const monto = parseMonto(montoInput.value);
    const dia = entero(diaInput.value);
    let inicio;
    let desde;
    let cuotas = null;
    const errors = {};
    if (enCuotas) {
      cuotas = entero(cuotasInput.value);
      const actual = entero(actualInput.value) ?? 1;
      if (!Number.isInteger(actual) || actual < 1) errors.cuotaActual = 'Tiene que ser 1 o más.';
      else if (Number.isInteger(cuotas) && actual > cuotas) errors.cuotaActual = 'No puede ser mayor a la cantidad de cuotas.';
      inicio = addMonths(mes, -((Number.isInteger(actual) ? actual : 1) - 1));
      // Las cuotas anteriores a este mes se toman como ya pagadas (salvo que ya las estuvieras siguiendo).
      desde = fijo?.cuotas && fijo.desde < mes ? (fijo.desde < inicio ? inicio : fijo.desde) : mes;
    } else {
      inicio = desdeInput.value;
      desde = desdeInput.value;
    }
    const data = {
      id: fijo?.id, ambito, nombre: nombreInput.value, categoriaId: catSel.value,
      montoCentavos: monto.ok ? monto.value : NaN, dia: Number.isNaN(dia) ? -1 : dia,
      inicio, desde, cuotas: Number.isNaN(cuotas) ? -1 : cuotas, hasta: enCuotas ? null : (fijo?.hasta ?? null),
    };
    Object.assign(errors, F.validarFijo({ ...data, nombre: data.nombre.trim() }), errors);
    if (!monto.ok) errors.monto = monto.error;
    if (errs.show(errors)) return;
    saveBtn.disabled = true;
    try {
      await F.guardarFijo(data);
      sheet.close();
      notifyDataChanged();
      toast(fijo ? 'Gasto fijo actualizado' : 'Gasto fijo creado: va a aparecer cada mes que corresponda');
    } catch (err) {
      if (err instanceof ValidationError) errs.show(err.errors);
      else errs.showGeneral(err);
    } finally {
      saveBtn.disabled = false;
    }
  }

  async function terminar() {
    try {
      const ultimo = fijo.hasta ? null : mes;
      await F.terminarFijo(fijo.id, ultimo);
      sheet.close();
      notifyDataChanged();
      toast(ultimo ? `"${fijo.nombre}" no aparece después de ${monthLabel(mes).toLowerCase()}` : `"${fijo.nombre}" sigue todos los meses`, {
        action: 'Deshacer', duration: 6000,
        onAction: () => F.terminarFijo(fijo.id, fijo.hasta).then(notifyDataChanged, toastError),
      });
    } catch (err) {
      errs.showGeneral(err);
    }
  }

  async function borrar() {
    try {
      const res = await F.borrarFijo(fijo.id);
      sheet.close();
      notifyDataChanged();
      toast(`"${fijo.nombre}" borrado (los gastos ya pagados quedan)`, {
        action: 'Deshacer', duration: 6000,
        onAction: () => F.restaurarFijo(res).then(notifyDataChanged, toastError),
      });
    } catch (err) {
      errs.showGeneral(err);
    }
  }

  pintarFrecuencia();
  sheet = openSheet({
    title: fijo ? 'Editar gasto fijo' : 'Nuevo gasto fijo o cuota',
    onSubmit: guardar,
    body: [
      h('div', { class: 'field' }, h('label', { for: 'x-nombre' }, 'Nombre'), nombreInput, errs.els.nombre),
      h('div', { class: 'field' }, h('label', { for: 'x-cat' }, 'Categoría'), catSel, errs.els.categoria),
      h('div', { class: 'field' }, h('label', { for: 'x-monto' }, enCuotas ? 'Monto de cada cuota ($)' : 'Monto por mes ($)'), montoInput, errs.els.monto),
      h('div', { class: 'field' }, h('label', { for: 'x-dia' }, 'Día de vencimiento (opcional)'), diaInput, errs.els.dia,
        h('p', { class: 'muted hint' }, 'Te avisamos cuando falten 3 días o menos. Si el mes es más corto, vence el último día.')),
      frecuencia,
      bloqueTodos,
      bloqueCuotas,
      h('p', { class: 'muted hint' }, 'Si el monto cambia (por ejemplo la tarjeta), lo ajustás al tildarlo como pagado.'),
      errs.general,
      fijo && h('div', { class: 'danger-zone' },
        !fijo.cuotas && h('button', { class: 'btn', type: 'button', onClick: terminar },
          fijo.hasta ? 'Reactivar (que siga todos los meses)' : `Terminar en ${monthLabel(mes).toLowerCase()}`),
        !fijo.cuotas && fijo.hasta && h('p', { class: 'muted' }, `Termina en ${monthLabel(fijo.hasta).toLowerCase()}.`),
        h('button', { class: 'btn btn-danger-outline', type: 'button', onClick: borrar }, 'Borrar'),
        h('p', { class: 'muted' }, 'Los gastos que ya marcaste como pagados quedan cargados.')),
    ],
    footer: [h('button', { class: 'btn', type: 'button', onClick: () => sheet.close() }, 'Cancelar'), saveBtn],
  });
  // El texto del monto cambia según la frecuencia.
  frecuencia.addEventListener('change', () => {
    sheet.form.querySelector('label[for=x-monto]').textContent = enCuotas ? 'Monto de cada cuota ($)' : 'Monto por mes ($)';
  });
  if (!fijo) nombreInput.focus();
  return sheet;
}
