// Arranque de la app: base de datos, estado, router y Service Worker.
import { openDB } from './db.js';
import { loadState, getState, setAmbito, subscribe } from './state.js';
import { errorBox } from './dom.js';
import { toast, toastError } from './toast.js';
import { registerSW } from './sw-client.js';
import { requestPersist, storageUsage, espacioBajo } from './storage.js';
import { destroyCharts } from './charts.js';
import { resumenPresupuestos } from './repo.js';
import { currentMonth } from './dates.js';
import * as movimientos from './views/movimientos.js';
import * as resumen from './views/resumen.js';
import * as presupuestos from './views/presupuestos.js';
import * as ajustes from './views/ajustes.js';
import * as categorias from './views/categorias.js';
import * as plan from './views/plan.js';
import * as ahorros from './views/ahorros.js';
import { openMovimientoForm } from './views/form.js';
import { openAhorroForm } from './views/ahorro-forms.js';
import { avisarSiSeRestauro } from './views/datos.js';
import { avisarSiSeBorro } from './views/config.js';
import { alertasFijos } from './fijos.js';
import { cargarPrefs, aplicarPrefs } from './prefs.js';

const ROUTES = { movimientos, plan, presupuestos, ahorros, resumen, ajustes, categorias };
const DEFAULT_ROUTE = 'movimientos';
// Pantallas internas: qué pestaña de abajo queda marcada.
const TAB_OF = { categorias: 'ajustes', presupuestos: 'plan' };

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
  // En Ahorros, el "+" carga un aporte; en el resto, un movimiento.
  document.getElementById('fab').setAttribute('aria-label', route === 'ahorros' ? 'Aportar a mis ahorros' : 'Cargar movimiento');
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

/**
 * Globito en la pestaña Plan: presupuestos en alerta/excedidos y gastos fijos
 * del mes sin pagar que están vencidos o vencen en 3 días o menos.
 */
let badgeToken = 0;
async function actualizarAvisoPresupuestos() {
  const tab = document.querySelector('.tabbar a[data-route="plan"]');
  const token = ++badgeToken;
  try {
    const { ambito } = getState();
    const [filas, fijos] = await Promise.all([resumenPresupuestos(ambito, currentMonth()), alertasFijos(ambito, currentMonth())]);
    if (token !== badgeToken) return; // llegó tarde: ya hay un cálculo más nuevo
    const presAlerta = filas.filter((f) => f.nivel !== 'ok').length;
    const grave = filas.some((f) => f.nivel === 'excedido') || fijos.some((it) => it.estado.nivel === 'vencido');
    const total = presAlerta + fijos.length;
    let badge = tab.querySelector('.tab-badge');
    if (!total) {
      badge?.remove();
      tab.removeAttribute('aria-label');
      return;
    }
    badge ??= tab.appendChild(document.createElement('span'));
    badge.className = `tab-badge ${grave ? 'level-excedido' : 'level-alerta'}`;
    badge.setAttribute('aria-hidden', 'true');
    badge.textContent = String(total);
    const partes = [
      fijos.length && `${fijos.length} ${fijos.length === 1 ? 'vencimiento' : 'vencimientos'}`,
      presAlerta && `${presAlerta} ${presAlerta === 1 ? 'presupuesto' : 'presupuestos'}`,
    ].filter(Boolean);
    tab.setAttribute('aria-label', `Plan: ${partes.join(' y ')} para revisar`);
  } catch (err) {
    console.warn('No se pudo calcular el aviso del plan', err);
  }
}

function paintAmbito({ ambito }) {
  document.body.dataset.ambito = ambito;
  aplicarPrefs(undefined, ambito); // el color de acento depende del ámbito
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
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    aplicarPrefs(); // en "Automático" sigue al celular
    render();
  });

  const fab = document.getElementById('fab');
  fab.hidden = false;
  fab.addEventListener('click', () => (currentRoute() === 'ahorros' ? openAhorroForm() : openMovimientoForm()));
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
    await cargarPrefs();
  } catch (err) {
    console.error(err);
    $view.replaceChildren(errorBox(err, () => location.reload()));
    return;
  }

  bindUI();
  paintAmbito(getState());
  await render();
  avisarSiSeRestauro();
  avisarSiSeBorro();

  // No bloquea el arranque; el resultado se ve en Ajustes.
  requestPersist();
  // Si el teléfono está casi lleno, avisarlo al abrir (antes de que falle un guardado).
  storageUsage().then((e) => {
    if (espacioBajo(e)) {
      toast('⚠️ Queda poco espacio en el teléfono. Hacé un backup y liberá lugar.', {
        kind: 'warn', duration: 0, action: 'Ver', onAction: () => { location.hash = '#/ajustes'; },
      });
    }
  });
}

start();
