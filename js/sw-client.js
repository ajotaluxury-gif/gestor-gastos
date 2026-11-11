// Registro del Service Worker y aviso de actualización.
import { toast } from './toast.js';

let updateAccepted = false;
let updateToast = null;

function offerUpdate(worker) {
  if (updateToast) return;
  updateToast = toast('Hay una actualización, tocá para recargar', {
    action: 'Recargar',
    duration: 0,
    onAction: () => {
      updateAccepted = true;
      worker.postMessage({ type: 'SKIP_WAITING' });
    },
  });
}

export function registerSW() {
  if (!('serviceWorker' in navigator)) return;

  // Solo recargamos si el usuario aceptó la actualización
  // (en la primera instalación también cambia el controller y no queremos recargar).
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (updateAccepted) location.reload();
  });

  navigator.serviceWorker.register('./sw.js').then((reg) => {
    if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);

    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(worker);
      });
    });

    // Al volver a la app, buscamos si hay versión nueva.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  }).catch((err) => console.warn('No se pudo registrar el Service Worker', err));
}

/** Versión de la app según el SW que controla la página (o null). */
export function getAppVersion(timeout = 1000) {
  const controller = navigator.serviceWorker?.controller;
  if (!controller) return Promise.resolve(null);
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(null), timeout);
    channel.port1.onmessage = (e) => { clearTimeout(timer); resolve(e.data); };
    controller.postMessage({ type: 'GET_VERSION' }, [channel.port2]);
  });
}
