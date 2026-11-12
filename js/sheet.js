// Hoja inferior modal reutilizable (<dialog>), con soporte para el botón "atrás" de Android.
import { h } from './dom.js';

let seq = 0;
const USA_CLOSE_WATCHER = 'CloseWatcher' in globalThis;
// history.back() es asincrónico: si se abre otra hoja antes de que termine,
// el "atrás" pendiente la cerraría. Guardamos esa espera acá.
let backPending = null;

function goBack() {
  backPending = new Promise((resolve) => {
    addEventListener('popstate', () => { backPending = null; resolve(); }, { once: true });
  });
  history.back();
}

/**
 * @param {{title: string, body: Node[], footer?: Node[], onSubmit?: () => void}} opts
 * @returns {{dialog: HTMLDialogElement, form: HTMLFormElement, close: () => void, closed: Promise<void>}}
 */
export function openSheet({ title, body, footer = [], onSubmit }) {
  const id = ++seq;
  const titleId = `sheet-title-${id}`;
  let dialog;
  const close = () => { if (dialog.open) dialog.close(); };

  const form = h('form', { class: 'sheet-form', novalidate: true },
    h('div', { class: 'sheet-head' },
      h('h2', { id: titleId }, title),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Cerrar', onClick: close }, '✕')),
    h('div', { class: 'sheet-body' }, body),
    h('div', { class: 'sheet-foot' }, footer));
  // Un solo envío a la vez: Enter repetido o doble toque no guardan dos veces.
  let enviando = false;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (enviando) return;
    enviando = true;
    try {
      await onSubmit?.();
    } finally {
      enviando = false;
    }
  });

  dialog = h('dialog', { class: 'sheet', 'aria-labelledby': titleId }, form);

  // Abrir la hoja agrega una entrada al historial: "atrás" la cierra en vez de salir de la app.
  const onPopState = () => close();
  let pushed = false;
  const closed = new Promise((resolve) => {
    dialog.addEventListener('close', () => {
      removeEventListener('popstate', onPopState);
      if (pushed && history.state?.sheet === id) goBack();
      // Los avisos que se mostraron dentro de la hoja (p. ej. "Hay una actualización") no se pierden.
      const pendientes = dialog.querySelectorAll('.toasts-dialog .toast:not(.leaving)');
      if (pendientes.length) document.getElementById('toasts').append(...pendientes);
      dialog.remove();
      resolve();
    }, { once: true });
  });
  dialog.addEventListener('click', (e) => { if (e.target === dialog) close(); });

  const pushEntry = () => {
    if (!dialog.open) return; // se cerró antes de que terminara el "atrás" anterior
    history.pushState({ sheet: id }, '');
    pushed = true;
    addEventListener('popstate', onPopState);
  };

  document.body.append(dialog);
  dialog.showModal();
  // Chrome 120+ (CloseWatcher) ya cierra un <dialog> modal con el "atrás" de Android, sin tocar el
  // historial. Ahí no agregamos entradas: el history.back() asincrónico podía deshacer una pestaña
  // tocada justo después de cerrar la hoja. El truco del historial queda para navegadores viejos.
  if (!USA_CLOSE_WATCHER) {
    if (backPending) backPending.then(pushEntry);
    else pushEntry();
  }
  return { dialog, form, close, closed };
}

/** Maneja errores por campo dentro de una hoja. */
export function fieldErrors(fields) {
  const els = Object.fromEntries(fields.map((f) =>
    [f, h('p', { class: 'field-error', id: `err-${f}`, hidden: true })]));
  const general = h('p', { class: 'field-error', role: 'alert', hidden: true });
  const inputs = {};

  const clear = (f) => {
    els[f].hidden = true;
    inputs[f]?.removeAttribute('aria-invalid');
  };
  return {
    els,
    general,
    /** Asocia un input a un campo: se marca inválido y se limpia al escribir. */
    bind(f, input) {
      inputs[f] = input;
      input.setAttribute('aria-describedby', `err-${f}`);
      input.addEventListener('input', () => clear(f));
    },
    clear,
    /** Muestra errores; enfoca el primero. Devuelve true si hubo alguno. */
    show(errors, fallbackFocus = {}) {
      general.hidden = true;
      let first = null;
      for (const f of fields) {
        if (!errors[f]) { clear(f); continue; }
        els[f].textContent = `⚠ ${errors[f]}`;
        els[f].hidden = false;
        inputs[f]?.setAttribute('aria-invalid', 'true');
        first ??= inputs[f] ?? fallbackFocus[f];
      }
      const otros = Object.keys(errors).filter((k) => !fields.includes(k));
      if (otros.length) this.showGeneral({ message: errors[otros[0]] });
      first?.focus();
      return Object.keys(errors).length > 0;
    },
    showGeneral(err) {
      general.textContent = `⛔ ${err?.message || 'No se pudo guardar.'}`;
      general.hidden = false;
    },
  };
}
