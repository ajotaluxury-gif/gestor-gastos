// Arranque de la app: base de datos, estado, router y Service Worker.
import { openDB } from './db.js';
import { loadState, getState, setAmbito, subscribe } from './state.js';
import { errorBox } from './dom.js';
import { toast, toastError } from './toast.js';
import { registerSW } from './sw-client.js';
import { requestPersist } from './storage.js';
import * as movimientos from './views/movimientos.js';
import * as resumen from './views/resumen.js';
import * as presupuestos from './views/presupuestos.js';
import * as ajustes from './views/ajustes.js';

const ROUTES = { movimientos, resumen, presupuestos, ajustes };
const DEFAULT_ROUTE = 'movimientos';

const $view = document.getElementById('view');

function currentRoute() {
  const name = location.hash.replace(/^#\/?/, '').split(/[/?]/)[0];
  return ROUTES[name] ? name : DEFAULT_ROUTE;
}

let renderToken = 0;

async function render() {
  const route = currentRoute();
  for (const a of document.querySelectorAll('.tabbar a')) {
    if (a.dataset.route === route) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  const token = ++renderToken;
  try {
    const node = await ROUTES[route].render(getState());
    if (token === renderToken) $view.replaceChildren(node);
  } catch (err) {
    console.error(err);
    if (token === renderToken) $view.replaceChildren(errorBox(err, render));
  }
}

function paintAmbito({ ambito }) {
  document.body.dataset.ambito = ambito;
  for (const btn of document.querySelectorAll('.ambito-switch button')) {
    btn.setAttribute('aria-pressed', String(btn.dataset.ambito === ambito));
  }
}

function bindUI() {
  for (const btn of document.querySelectorAll('.ambito-switch button')) {
    btn.addEventListener('click', () => setAmbito(btn.dataset.ambito));
  }
  window.addEventListener('hashchange', render);
  subscribe((state) => {
    paintAmbito(state);
    render();
  });

  addEventListener('db-blocked', () =>
    toast('Cerrá las otras pestañas de la app para terminar de actualizarla.', { duration: 8000 }));
  addEventListener('db-versionchange', () =>
    toast('La app se actualizó en otra pestaña.', { action: 'Recargar', duration: 0, onAction: () => location.reload() }));
}

function bindGlobalErrors() {
  addEventListener('unhandledrejection', (e) => {
    console.error(e.reason);
    toastError(e.reason);
  });
  addEventListener('error', (e) => {
    console.error(e.error ?? e.message);
  });
}

async function start() {
  bindGlobalErrors();
  registerSW();

  try {
    await openDB();
    await loadState();
  } catch (err) {
    console.error(err);
    $view.replaceChildren(errorBox(err, () => location.reload()));
    return;
  }

  bindUI();
  paintAmbito(getState());
  await render();

  // No bloquea el arranque; el resultado se ve en Ajustes.
  requestPersist();
}

start();
