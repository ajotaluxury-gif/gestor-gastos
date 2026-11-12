// Ajustes: Personalizar la app y Borrar todos los datos.
import { h } from '../dom.js';
import { AMBITOS, notifyDataChanged } from '../state.js';
import { ACENTOS, LETRAS, DEFAULT, getPrefs, guardarPrefs } from '../prefs.js';
import { borrarTodo, conteoActual } from '../backup.js';
import { toast, toastError } from '../toast.js';
import { openSheet } from '../sheet.js';
import { descargarBackup } from './datos.js';

const BORRADO_FLAG = 'gg-borrado';
const cant = (n, singular, plural) => `${n} ${n === 1 ? singular : plural}`;
export const SEGUNDOS_BLOQUEO = 5;

// ======================= Personalizar =======================

function opcionesSeg(nombre, opciones, actual, onChange) {
  return h('fieldset', { class: 'seg-tipo seg-3' },
    h('legend', { class: 'sr-only' }, nombre),
    ...Object.entries(opciones).map(([valor, label]) => h('label', { class: 'seg-opt' },
      h('input', { type: 'radio', name: nombre, value: valor, checked: valor === actual, onChange: () => onChange(valor) }),
      h('span', null, label))));
}

function selectorAcento(nombre, actual, onChange) {
  return h('div', { class: 'swatches' }, Object.entries(ACENTOS).map(([clave, a]) =>
    h('label', { class: 'swatch', style: `--cat:${a.light[0]}`, title: a.nombre },
      h('input', {
        type: 'radio', name: nombre, value: clave, checked: clave === actual, 'aria-label': a.nombre,
        onChange: () => onChange(clave),
      }))));
}

let abiertoPers = false;

export async function openPersonalizar() {
  if (abiertoPers) return;
  abiertoPers = true;
  try {
    const p = getPrefs();
    // Cada cambio se aplica y se guarda al instante (se ve en vivo detrás de la hoja).
    const cambiar = (campo) => (valor) => guardarPrefs({ [campo]: valor }).catch(toastError);
    let sheet;
    sheet = openSheet({
      title: 'Personalizar',
      body: [
        h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Tema'),
          opcionesSeg('tema', { auto: 'Automático', light: 'Claro', dark: 'Oscuro' }, p.tema, cambiar('tema')),
          h('p', { class: 'muted hint' }, '"Automático" cambia solo, igual que el celular.')),
        h('div', { class: 'field' }, h('span', { class: 'field-label' }, `Color de ${AMBITOS.personal.label}`),
          selectorAcento('acento-personal', p.acentoPersonal, cambiar('acentoPersonal'))),
        h('div', { class: 'field' }, h('span', { class: 'field-label' }, `Color de ${AMBITOS.negocio.label}`),
          selectorAcento('acento-negocio', p.acentoNegocio, cambiar('acentoNegocio')),
          h('p', { class: 'muted hint' }, 'Usar un color distinto para cada ámbito ayuda a no cargar algo en el equivocado.')),
        h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Tamaño de letra'),
          opcionesSeg('letra', Object.fromEntries(Object.entries(LETRAS).map(([k, [label]]) => [k, label])), p.letra, cambiar('letra'))),
        h('button', {
          class: 'btn btn-block', type: 'button',
          onClick: async () => {
            await guardarPrefs(DEFAULT);
            sheet.close();
            notifyDataChanged();
            toast('Volviste a la apariencia original');
          },
        }, 'Volver a la apariencia original'),
      ],
      footer: [h('button', { class: 'btn btn-primary', type: 'button', onClick: () => sheet.close() }, 'Listo')],
    });
    await sheet.closed;
    notifyDataChanged(); // los gráficos toman los colores nuevos
  } catch (err) {
    toastError(err);
  } finally {
    abiertoPers = false;
  }
}

/** Texto corto para la tarjeta de Ajustes. */
export function resumenPrefs() {
  const p = getPrefs();
  return [
    { auto: 'Tema automático', light: 'Tema claro', dark: 'Tema oscuro' }[p.tema],
    `${ACENTOS[p.acentoPersonal].nombre} / ${ACENTOS[p.acentoNegocio].nombre}`,
    `letra ${LETRAS[p.letra][0].toLowerCase()}`,
  ].join(' · ');
}

// ======================= Borrar todos los datos =======================

let abiertoBorrar = false;

export async function openBorrarTodo() {
  if (abiertoBorrar) return;
  abiertoBorrar = true;
  let timer = null;
  try {
    const c = await conteoActual();
    const total = (k) => Object.values(c).reduce((s, x) => s + x[k], 0);
    const confirmar = h('button', { class: 'btn btn-danger', type: 'submit', disabled: true }, '');
    let restantes = SEGUNDOS_BLOQUEO;
    const pintarBoton = () => {
      confirmar.textContent = restantes > 0 ? `Confirmar (${restantes})` : 'Confirmar';
      confirmar.disabled = restantes > 0;
    };
    pintarBoton();
    timer = setInterval(() => {
      restantes -= 1;
      pintarBoton();
      if (restantes <= 0) clearInterval(timer);
    }, 1000);
    const error = h('p', { class: 'field-error', role: 'alert', hidden: true });

    let sheet;
    sheet = openSheet({
      title: 'Borrar todos los datos',
      onSubmit: async () => {
        if (restantes > 0) return;
        confirmar.disabled = true;
        try {
          await borrarTodo();
          try {
            localStorage.removeItem('gg-prefs');
            sessionStorage.setItem(BORRADO_FLAG, '1');
          } catch { /* sin storage */ }
          location.hash = '#/movimientos';
          location.reload();
        } catch (err) {
          error.textContent = `⛔ ${err.message} No se borró nada.`;
          error.hidden = false;
          confirmar.disabled = false;
        }
      },
      body: [
        h('div', { class: 'status status-error' },
          h('span', { class: 'status-icon', 'aria-hidden': 'true' }, '⚠️'),
          h('div', null,
            h('strong', null, 'Se van a perder TODOS los datos cargados'),
            h('p', null, 'Se borran los movimientos, categorías, presupuestos, gastos fijos, ahorros, metas, cotizaciones y la personalización, de los dos ámbitos. La app queda como recién instalada.'),
            h('p', null, h('strong', null, 'No se puede deshacer.')))),
        h('ul', { class: 'error-list' },
          h('li', null, cant(total('movimientos'), 'movimiento', 'movimientos')),
          h('li', null, cant(total('fijos'), 'gasto fijo', 'gastos fijos')),
          h('li', null, `${cant(total('ahorros'), 'movimiento de ahorro', 'movimientos de ahorro')} y ${cant(total('metas'), 'meta', 'metas')}`),
          h('li', null, `${cant(total('categorias'), 'categoría', 'categorías')} y ${cant(total('presupuestos'), 'presupuesto', 'presupuestos')}`)),
        h('p', { class: 'muted' }, 'Si querés poder recuperarlos, descargá un backup antes:'),
        h('button', { class: 'btn btn-block', type: 'button', onClick: descargarBackup }, '💾 Descargar backup antes de borrar'),
        h('p', { class: 'muted hint' }, `El botón "Confirmar" se habilita en ${SEGUNDOS_BLOQUEO} segundos, para que leas la advertencia.`),
        error,
      ],
      footer: [
        h('button', { class: 'btn', type: 'button', onClick: () => sheet.close() }, 'Cancelar'),
        confirmar,
      ],
    });
    await sheet.closed;
  } catch (err) {
    toastError(err);
  } finally {
    clearInterval(timer);
    abiertoBorrar = false;
  }
}

/** Tras recargar después de borrar todo, lo avisamos. */
export function avisarSiSeBorro() {
  try {
    if (sessionStorage.getItem(BORRADO_FLAG)) {
      sessionStorage.removeItem(BORRADO_FLAG);
      toast('Se borraron todos los datos. La app quedó como nueva.', { duration: 6000 });
    }
  } catch { /* sin sessionStorage */ }
}
