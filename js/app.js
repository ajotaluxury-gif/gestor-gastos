// Arranque de la app: base de datos, estado, router y Service Worker.
import { openDB } from './db.js';
import { loadState, getState, setAmbito, subscribe } from './state.js';
import { errorBox } from './dom.js';
import { toast, toastError } from './toast.js';
import { registerSW } from './sw-client.js';
import { requestPersist } from './storage.js';
import { destroyCharts } from './charts.js';
import { resumenPresupuestos } from './repo.js';
import { currentMonth } from './dates.js';
import * as movimientos from './views/movimientos.js';
import * as resumen from './views/resumen.js';
import * as presupuestos from './views/presupuestos.js';
import * as ajustes from './views/ajustes.js';
import * as categorias from './views/categorias.js';
import { openMovimientoForm } from './views/form.js';
import { avisarSiSeRestauro } from './views/datos.js';

const ROUTES = { movimientos, resumen, presupuestos, ajustes, categorias };
const DEFAULT_ROUTE = 'movimientos';
// Pantallas internas: qué pestaña de abajo queda marcada.
const TAB_OF = { categorias: 'ajustes' };

const $view = document.getElementById('view');

function currentRoute() {
  const name = location.hash.replace(/^#\/?/, '').split(/[/?]/)[0];
  return ROUTES[name] ? name : DEFAULT_ROUTE;
}

let renderToken = 0;

async function render() {
  const route = currentRoute();
  const tab = TAB_OF[route] ?? route;
  for (const a of document.querySelectorAll('.tabbar a')) {
    if (a.dataset.route === tab) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  const token = ++renderToken;
  try {
    const node = await ROUTES[route].render(getState());
    if (token === renderToken) {
      destroyCharts();
      $view.replaceChildren(node);
    }
    actualizarAvisoPresupuestos();
  } catch (err) {
    console.error(err);
    if (token === renderToken) $view.replaceChildren(errorBox(err, render));
  }
}

/** Globito en la pestaña Presupuestos con cuántos están en alerta este mes. */
let badgeToken = 0;
async function actualizarAvisoPresupuestos() {
  const tab = document.querySelector('.tabbar a[data-route="presupuestos"]');
  const token = ++badgeToken;
  try {
    const filas = await resumenPresupuestos(getState().ambito, currentMonth());
    if (token !== badgeToken) return; // llegó tarde: ya hay un cálculo más nuevo
    const excedidos = filas.filter((f) => f.nivel === 'excedido').length;
    const alertas = filas.filter((f) => f.nivel !== 'ok').length;
    let badge = tab.querySelector('.tab-badge');
    if (!alertas) {
      badge?.remove();
      tab.removeAttribute('aria-label');
      return;
    }
    badge ??= tab.appendChild(document.createElement('span'));
    badge.className = `tab-badge ${excedidos ? 'level-excedido' : 'level-alerta'}`;
    badge.setAttribute('aria-hidden', 'true');
    badge.textContent = String(alertas);
    tab.setAttribute('aria-label',
      `Presupuestos: ${alertas} ${alertas === 1 ? 'categoría necesita' : 'categorías necesitan'} atención`);
  } catch (err) {
    console.warn('No se pudo calcular el aviso de presupuestos', err);
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
  addEventListener('data-changed', render);
  // Los gráficos toman los colores del tema: si cambia claro/oscuro, se vuelven a pintar.
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', render);

  const fab = document.getElementById('fab');
  fab.hidden = false;
  fab.addEventListener('click', () => openMovimientoForm());
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
  avisarSiSeRestauro();

  // No bloquea el arranque; el resultado se ve en Ajustes.
  requestPersist();
}

start();
