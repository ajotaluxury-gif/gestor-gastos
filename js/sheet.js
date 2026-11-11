// Hoja inferior modal reutilizable (<dialog>), con soporte para el botón "atrás" de Android.
import { h } from './dom.js';

let seq = 0;

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
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    onSubmit?.();
  });

  dialog = h('dialog', { class: 'sheet', 'aria-labelledby': titleId }, form);

  // Abrir la hoja agrega una entrada al historial: "atrás" la cierra en vez de salir de la app.
  const onPopState = () => close();
  const closed = new Promise((resolve) => {
    dialog.addEventListener('close', () => {
      removeEventListener('popstate', onPopState);
      if (history.state?.sheet === id) history.back();
      dialog.remove();
      resolve();
    }, { once: true });
  });
  dialog.addEventListener('click', (e) => { if (e.target === dialog) close(); });

  document.body.append(dialog);
  history.pushState({ sheet: id }, '');
  addEventListener('popstate', onPopState);
  dialog.showModal();
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
