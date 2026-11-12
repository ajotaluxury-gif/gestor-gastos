// Avisos breves abajo de la pantalla, con acción opcional ("Deshacer", "Recargar"...).
import { h } from './dom.js';

/**
 * @param {string} message
 * @param {{action?: string, onAction?: () => void, duration?: number, kind?: 'info'|'error'}} [opts]
 *   duration = 0 → queda fijo hasta que se toque.
 */
export function toast(message, { action, onAction, duration = 4000, kind = 'info' } = {}) {
  // Con una hoja abierta (modal, capa superior) el aviso va adentro; si no, quedaría tapado.
  const dialog = document.querySelector('dialog[open]');
  let region = document.getElementById('toasts');
  if (dialog) {
    region = dialog.querySelector('.toasts') ?? dialog.appendChild(h('div', { class: 'toasts toasts-dialog', 'aria-live': 'polite' }));
  }
  let timer;
  const el = h('div', { class: `toast toast-${kind}`, role: kind === 'error' ? 'alert' : null },
    h('span', null, message));

  const close = () => {
    clearTimeout(timer);
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 200);
  };

  if (action) {
    el.append(h('button', {
      class: 'toast-action',
      type: 'button',
      onClick: () => { close(); onAction?.(); },
    }, action));
  }

  region.append(el);
  if (duration) timer = setTimeout(close, duration);
  return { close };
}

export const toastError = (err) =>
  toast(err?.message || 'Ocurrió un error inesperado.', { kind: 'error', duration: 6000 });
