// Hoja inferior para cargar o editar un movimiento.
import { h, safeColor } from '../dom.js';
import { getState, notifyDataChanged } from '../state.js';
import { getMeta, setMeta } from '../db.js';
import {
  listCategorias, getMovimiento, guardarMovimiento, borrarMovimiento, restaurarMovimiento,
  validarMovimiento, ValidationError, NOTA_MAX,
} from '../repo.js';
import { parseMonto, formatNumber } from '../money.js';
import { todayISO, toDisplay } from '../dates.js';
import { toast, toastError } from '../toast.js';

const FIELDS = ['monto', 'categoria', 'fecha', 'nota'];
let abierto = false;

const ultimaKey = (ambito, tipo) => `ultimaCat:${ambito}:${tipo}`;
const safeMeta = (key) => getMeta(key).catch(() => null);

/** Abre el formulario. Sin id: alta; con id: edición. */
export async function openMovimientoForm(id) {
  if (abierto) return;
  abierto = true;
  try {
    await abrir(id);
  } catch (err) {
    abierto = false;
    toastError(err);
  }
}

async function abrir(id) {
  const mov = id ? await getMovimiento(id) : null;
  if (id && !mov) {
    abierto = false;
    toast('Ese movimiento ya no existe.');
    return;
  }

  const ambito = mov?.ambito ?? getState().ambito;
  const [categorias, ultGasto, ultIngreso] = await Promise.all([
    listCategorias(ambito),
    safeMeta(ultimaKey(ambito, 'gasto')),
    safeMeta(ultimaKey(ambito, 'ingreso')),
  ]);

  let tipo = mov?.tipo ?? 'gasto';
  const seleccion = { gasto: ultGasto, ingreso: ultIngreso };
  if (mov) seleccion[mov.tipo] = mov.categoriaId;

  // Las archivadas no se ofrecen, salvo la que ya tiene el movimiento que se edita.
  const candidatas = (t) => categorias.filter((c) => c.tipo === t && (!c.archivada || c.id === mov?.categoriaId));

  // ---------- Campos ----------
  const errEls = Object.fromEntries(FIELDS.map((f) =>
    [f, h('p', { class: 'field-error', id: `err-${f}`, hidden: true })]));
  const formError = h('p', { class: 'field-error', role: 'alert', hidden: true });

  const montoInput = h('input', {
    id: 'f-monto', class: 'input input-monto', type: 'text', inputmode: 'decimal',
    autocomplete: 'off', enterkeyhint: 'done', placeholder: '0,00',
    value: mov ? formatNumber(mov.montoCentavos) : null, 'aria-describedby': 'err-monto',
  });
  const fechaInput = h('input', {
    id: 'f-fecha', class: 'input', type: 'date', value: mov?.fecha ?? todayISO(), 'aria-describedby': 'err-fecha',
  });
  const notaInput = h('input', {
    id: 'f-nota', class: 'input', type: 'text', maxlength: NOTA_MAX, autocomplete: 'off',
    enterkeyhint: 'done', placeholder: 'Opcional', value: mov?.nota || null, 'aria-describedby': 'err-nota',
  });
  const inputs = { monto: montoInput, fecha: fechaInput, nota: notaInput };

  const chips = h('div', { class: 'chips' });
  function pintarCategorias() {
    const lista = candidatas(tipo);
    let sel = seleccion[tipo];
    if (!lista.some((c) => c.id === sel)) sel = lista.length === 1 ? lista[0].id : null;
    seleccion[tipo] = sel;
    if (!lista.length) {
      chips.replaceChildren(h('p', { class: 'muted' },
        `No hay categorías de ${tipo} activas. Podés crearlas en Ajustes.`));
      return;
    }
    chips.replaceChildren(...lista.map((c) => h('label', { class: 'chip', style: `--cat:${safeColor(c.color)}` },
      h('input', {
        type: 'radio', name: 'categoria', value: c.id, checked: c.id === sel,
        onChange: () => { seleccion[tipo] = c.id; limpiarError('categoria'); },
      }),
      h('span', { class: 'chip-emoji', 'aria-hidden': 'true' }, c.emoji),
      h('span', { class: 'chip-name' }, c.nombre))));
  }

  const tipoField = h('fieldset', { class: 'seg-tipo' },
    h('legend', { class: 'sr-only' }, 'Tipo de movimiento'),
    ...['gasto', 'ingreso'].map((t) => h('label', { class: `seg-opt seg-${t}` },
      h('input', {
        type: 'radio', name: 'tipo', value: t, checked: t === tipo,
        onChange: () => { tipo = t; pintarCategorias(); limpiarError('categoria'); },
      }),
      h('span', null, t === 'gasto' ? '− Gasto' : '+ Ingreso'))));

  const saveBtn = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Guardar');
  const delBtn = mov && h('button', { class: 'btn btn-danger-outline', type: 'button', onClick: borrar }, 'Borrar');

  const form = h('form', { class: 'sheet-form', novalidate: true },
    h('div', { class: 'sheet-head' },
      h('h2', { id: 'f-title' }, mov ? 'Editar movimiento' : 'Nuevo movimiento'),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Cerrar', onClick: () => cerrar() }, '✕')),
    h('div', { class: 'sheet-body' },
      tipoField,
      h('div', { class: 'field' },
        h('label', { for: 'f-monto' }, 'Monto ($)'), montoInput, errEls.monto),
      h('fieldset', { class: 'field', 'aria-describedby': 'err-categoria' },
        h('legend', null, 'Categoría'), chips, errEls.categoria),
      h('div', { class: 'field-row' },
        h('div', { class: 'field' }, h('label', { for: 'f-fecha' }, 'Fecha'), fechaInput, errEls.fecha),
        h('div', { class: 'field' }, h('label', { for: 'f-nota' }, 'Nota'), notaInput, errEls.nota)),
      formError),
    h('div', { class: 'sheet-foot' },
      delBtn,
      h('button', { class: 'btn', type: 'button', onClick: () => cerrar() }, 'Cancelar'),
      saveBtn));

  const dialog = h('dialog', { class: 'sheet', 'aria-labelledby': 'f-title' }, form);

  // ---------- Errores ----------
  function limpiarError(field) {
    errEls[field].hidden = true;
    inputs[field]?.removeAttribute('aria-invalid');
  }
  function mostrarErrores(errors) {
    let first = null;
    for (const f of FIELDS) {
      if (!errors[f]) { limpiarError(f); continue; }
      errEls[f].textContent = `⚠ ${errors[f]}`;
      errEls[f].hidden = false;
      inputs[f]?.setAttribute('aria-invalid', 'true');
      first ??= inputs[f] ?? chips.querySelector('input') ?? chips;
    }
    first?.focus();
    return Boolean(first);
  }
  function mostrarErrorGeneral(err) {
    formError.textContent = `⛔ ${err?.message || 'No se pudo guardar.'}`;
    formError.hidden = false;
  }
  for (const [f, el] of Object.entries(inputs)) el.addEventListener('input', () => limpiarError(f));

  // ---------- Acciones ----------
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    formError.hidden = true;
    const monto = parseMonto(montoInput.value);
    const data = {
      id: mov?.id,
      ambito,
      tipo,
      montoCentavos: monto.ok ? monto.value : NaN,
      categoriaId: seleccion[tipo],
      fecha: fechaInput.value,
      nota: notaInput.value.trim(),
    };
    const errors = validarMovimiento(data);
    if (!monto.ok) errors.monto = monto.error;
    if (mostrarErrores(errors)) return;

    saveBtn.disabled = true;
    try {
      const rec = await guardarMovimiento(data);
      setMeta(ultimaKey(ambito, tipo), rec.categoriaId).catch(() => {});
      cerrar();
      notifyDataChanged();
      const fuera = !rec.fecha.startsWith(getState().mes);
      toast(`${tipo === 'gasto' ? 'Gasto' : 'Ingreso'} ${mov ? 'actualizado' : 'guardado'}${fuera ? ` (${toDisplay(rec.fecha)})` : ''}`);
    } catch (err) {
      if (err instanceof ValidationError) mostrarErrores(err.errors);
      else mostrarErrorGeneral(err);
    } finally {
      saveBtn.disabled = false;
    }
  });

  async function borrar() {
    delBtn.disabled = true;
    try {
      const rec = await borrarMovimiento(mov.id);
      cerrar();
      notifyDataChanged();
      if (!rec) return;
      toast('Movimiento borrado', {
        action: 'Deshacer',
        duration: 6000,
        onAction: async () => {
          try {
            await restaurarMovimiento(rec);
            notifyDataChanged();
            toast('Movimiento restaurado');
          } catch (err) {
            toastError(err);
          }
        },
      });
    } catch (err) {
      delBtn.disabled = false;
      mostrarErrorGeneral(err);
    }
  }

  // ---------- Abrir / cerrar (con soporte para el botón "atrás" de Android) ----------
  function cerrar() {
    if (dialog.open) dialog.close();
  }
  const onPopState = () => cerrar();

  dialog.addEventListener('click', (e) => { if (e.target === dialog) cerrar(); });
  dialog.addEventListener('close', () => {
    removeEventListener('popstate', onPopState);
    if (history.state?.sheet) history.back();
    dialog.remove();
    abierto = false;
  });

  pintarCategorias();
  document.body.append(dialog);
  history.pushState({ sheet: true }, '');
  addEventListener('popstate', onPopState);
  dialog.showModal();
  montoInput.focus();
}
