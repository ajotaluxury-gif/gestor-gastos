// Hoja inferior para cargar o editar un movimiento.
import { h, safeColor } from '../dom.js';
import { getState, notifyDataChanged } from '../state.js';
import { getMeta, setMeta } from '../db.js';
import {
  listCategorias, getMovimiento, guardarMovimiento, borrarMovimiento, restaurarMovimiento,
  validarMovimiento, cruceDeUmbral, ValidationError, NOTA_MAX,
} from '../repo.js';
import { parseMonto, formatNumber, formatARS } from '../money.js';
import { todayISO, toDisplay, currentMonth, lastDayOfMonth } from '../dates.js';
import { toast, toastError } from '../toast.js';
import { openSheet, fieldErrors } from '../sheet.js';

let abierto = false;
const pctFmt = new Intl.NumberFormat('es-AR', { style: 'percent', maximumFractionDigits: 0 });

/**
 * Hoy, si se está viendo el mes actual. Si se está viendo otro mes (p. ej. para cargar
 * algo olvidado), una fecha dentro de ese mes: así lo cargado aparece donde uno está mirando.
 */
function fechaPorDefecto() {
  const { mes } = getState();
  const actual = currentMonth();
  if (mes === actual) return todayISO();
  return mes < actual ? lastDayOfMonth(mes) : `${mes}-01`;
}

const ultimaKey = (ambito, tipo) => `ultimaCat:${ambito}:${tipo}`;
const safeMeta = (key) => getMeta(key).catch(() => null);

/** Abre el formulario. Sin id: alta; con id: edición. */
export async function openMovimientoForm(id) {
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
  const mov = id ? await getMovimiento(id) : null;
  if (id && !mov) {
    toast('Ese movimiento ya no existe.');
    return null;
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
  const errs = fieldErrors(['monto', 'categoria', 'fecha', 'nota']);

  const montoInput = h('input', {
    id: 'f-monto', class: 'input input-monto', type: 'text', inputmode: 'decimal',
    autocomplete: 'off', enterkeyhint: 'done', placeholder: '0,00',
    value: mov ? formatNumber(mov.montoCentavos) : null,
  });
  const fechaInput = h('input', { id: 'f-fecha', class: 'input', type: 'date', value: mov?.fecha ?? fechaPorDefecto() });
  const notaInput = h('input', {
    id: 'f-nota', class: 'input', type: 'text', maxlength: NOTA_MAX, autocomplete: 'off',
    enterkeyhint: 'done', placeholder: 'Opcional', value: mov?.nota || null,
  });
  errs.bind('monto', montoInput);
  errs.bind('fecha', fechaInput);
  errs.bind('nota', notaInput);

  const chips = h('div', { class: 'chips' });
  function pintarCategorias() {
    const lista = candidatas(tipo);
    let sel = seleccion[tipo];
    if (!lista.some((c) => c.id === sel)) sel = lista.length === 1 ? lista[0].id : null;
    seleccion[tipo] = sel;
    if (!lista.length) {
      chips.replaceChildren(h('p', { class: 'muted' },
        `No hay categorías de ${tipo} activas. Creá una en Ajustes → Categorías.`));
      return;
    }
    chips.replaceChildren(...lista.map((c) => h('label', { class: 'chip', style: `--cat:${safeColor(c.color)}` },
      h('input', {
        type: 'radio', name: 'categoria', value: c.id, checked: c.id === sel,
        onChange: () => { seleccion[tipo] = c.id; errs.clear('categoria'); },
      }),
      h('span', { class: 'chip-emoji', 'aria-hidden': 'true' }, c.emoji),
      h('span', { class: 'chip-name' }, c.nombre))));
  }

  const tipoField = h('fieldset', { class: 'seg-tipo' },
    h('legend', { class: 'sr-only' }, 'Tipo de movimiento'),
    ...['gasto', 'ingreso'].map((t) => h('label', { class: `seg-opt seg-${t}` },
      h('input', {
        type: 'radio', name: 'tipo', value: t, checked: t === tipo,
        onChange: () => { tipo = t; pintarCategorias(); errs.clear('categoria'); },
      }),
      h('span', null, t === 'gasto' ? '− Gasto' : '+ Ingreso'))));

  let sheet;
  const saveBtn = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Guardar');
  const delBtn = mov && h('button', { class: 'btn btn-danger-outline', type: 'button', onClick: borrar }, 'Borrar');

  // ---------- Acciones ----------
  async function guardar() {
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
    const focusCat = { categoria: chips.querySelector('input') };
    if (errs.show(errors, focusCat)) return;

    saveBtn.disabled = true;
    try {
      const rec = await guardarMovimiento(data);
      setMeta(ultimaKey(ambito, tipo), rec.categoriaId).catch(() => {});
      sheet.close();
      notifyDataChanged();
      const fuera = !rec.fecha.startsWith(getState().mes);
      const msg = `${tipo === 'gasto' ? 'Gasto' : 'Ingreso'} ${mov ? 'actualizado' : 'guardado'}${fuera ? ` (${toDisplay(rec.fecha)})` : ''}`;

      // Si este gasto hizo cruzar el 80 % o el 100 % del presupuesto, lo avisamos en el mismo toast.
      const cruce = await cruceDeUmbral(rec, mov).catch(() => null);
      if (cruce) {
        const nombre = categorias.find((c) => c.id === rec.categoriaId)?.nombre ?? 'La categoría';
        const aviso = cruce.nivel === 'excedido'
          ? `⛔ ${nombre}: te pasaste del presupuesto por ${formatARS(-cruce.restante)}`
          : `⚠ ${nombre}: usaste el ${pctFmt.format(cruce.pct)} del presupuesto`;
        toast(`${msg}. ${aviso}`, {
          kind: 'warn', duration: 8000, action: 'Ver',
          onAction: () => { location.hash = '#/presupuestos'; },
        });
      } else {
        toast(msg);
      }
    } catch (err) {
      if (err instanceof ValidationError) errs.show(err.errors, focusCat);
      else errs.showGeneral(err);
    } finally {
      saveBtn.disabled = false;
    }
  }

  async function borrar() {
    delBtn.disabled = true;
    try {
      const rec = await borrarMovimiento(mov.id);
      sheet.close();
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
      errs.showGeneral(err);
    }
  }

  pintarCategorias();
  sheet = openSheet({
    title: mov ? 'Editar movimiento' : 'Nuevo movimiento',
    onSubmit: guardar,
    body: [
      tipoField,
      h('div', { class: 'field' }, h('label', { for: 'f-monto' }, 'Monto ($)'), montoInput, errs.els.monto),
      h('fieldset', { class: 'field', 'aria-describedby': 'err-categoria' },
        h('legend', null, 'Categoría'), chips, errs.els.categoria),
      h('div', { class: 'field-row' },
        h('div', { class: 'field' }, h('label', { for: 'f-fecha' }, 'Fecha'), fechaInput, errs.els.fecha),
        h('div', { class: 'field' }, h('label', { for: 'f-nota' }, 'Nota'), notaInput, errs.els.nota)),
      errs.general,
    ],
    footer: [
      delBtn,
      h('button', { class: 'btn', type: 'button', onClick: () => sheet.close() }, 'Cancelar'),
      saveBtn,
    ],
  });
  montoInput.focus();
  return sheet;
}
