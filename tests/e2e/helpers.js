// Ayudantes para pruebas manuales/exploratorias dentro del navegador.
// Uso (desde la consola o un script, con `node tools/serve.mjs` corriendo):
//   const t = await import('/tests/e2e/helpers.js');
//   await t.reset();            // borra datos y Service Worker, recarga
//   await t.mov({ monto: '1.500', categoria: 'Supermercado' });
// No forma parte de la app (no está en el precache del Service Worker).

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export async function until(fn, ms = 5000, label = 'condición') {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const v = fn();
    if (v) return v;
    await wait(30);
  }
  throw new Error(`Timeout esperando: ${label}`);
}

export const $ = (s, root = document) => root.querySelector(s);
export const $$ = (s, root = document) => [...root.querySelectorAll(s)];
export const byText = (sel, text, root = document) => $$(sel, root).find((e) => e.textContent.trim().includes(text));
// Los montos usan espacio duro ("$ 1.234,56"): se normaliza para poder comparar.
const norm = (s) => s.replace(/ /g, ' ');
export const view = () => norm($('#view').innerText.replace(/\n+/g, ' | '));
export const errores = () => $$('.field-error:not([hidden])').map((e) => norm(e.textContent.trim()));
export const toasts = () => $$('.toast').map((e) => norm(e.innerText.replace(/\n/g, ' ').trim()));
export const dialogOpen = () => $('dialog[open]');

export function clearToasts() {
  $$('.toast').forEach((t) => t.remove());
}

/** Borra la base, cachés y el SW, y recarga la app limpia. */
export async function reset() {
  for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
  for (const k of await caches.keys()) await caches.delete(k);
  await new Promise((res, rej) => {
    const req = indexedDB.deleteDatabase('gestor-gastos');
    req.onsuccess = res;
    req.onerror = () => rej(req.error);
    req.onblocked = () => setTimeout(res, 500);
  });
  try { localStorage.clear(); sessionStorage.clear(); } catch { /* */ }
  location.hash = '#/movimientos';
  location.reload();
}

/** Recarga sin Service Worker (para tomar los cambios de código), conservando los datos. */
export async function reloadFresh() {
  for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
  for (const k of await caches.keys()) await caches.delete(k);
  location.reload();
}

export async function go(hash) {
  if (location.hash === hash) {
    // Misma ruta: no hay hashchange, se fuerza un redibujo (por si se tocaron datos por API).
    (await import('/js/state.js')).notifyDataChanged();
  } else {
    location.hash = hash;
  }
  await wait(250);
  await until(() => !$('.loading'), 5000, 'render');
}

/** Carga un movimiento por la interfaz. Devuelve { errores, toasts, abierto }. */
export async function mov({ tipo = 'gasto', monto, categoria, fecha, nota, cerrarSiFalla = true } = {}) {
  clearToasts();
  await until(() => !dialogOpen() && !$('dialog'), 5000, 'sin hojas abiertas');
  $('#fab').click();
  await until(() => $('#f-monto'), 5000, 'formulario');
  return completarForm({ tipo, monto, categoria, fecha, nota, cerrarSiFalla });
}

export async function completarForm({ tipo, monto, categoria, fecha, nota, cerrarSiFalla = true }) {
  clearToasts();
  if (tipo) $(`input[name=tipo][value=${tipo}]`).click();
  if (monto !== undefined) $('#f-monto').value = monto;
  if (categoria) {
    const chip = $$('.chip').find((c) => c.querySelector('.chip-name')?.textContent === categoria);
    if (!chip) throw new Error(`No hay chip "${categoria}"`);
    chip.querySelector('input').click();
  }
  if (fecha !== undefined) $('#f-fecha').value = fecha;
  if (nota !== undefined) $('#f-nota').value = nota;
  $('.sheet-form').requestSubmit();
  await wait(400);
  const res = { errores: errores(), abierto: Boolean(dialogOpen()) };
  if (res.abierto && cerrarSiFalla) {
    dialogOpen().close();
    await until(() => !$('dialog'), 5000, 'cerrar hoja');
  }
  await wait(150);
  res.toasts = toasts();
  return res;
}

/** Lee la base directamente. */
export async function db(store) {
  const m = await import('/js/db.js');
  return m.getAll(store);
}

/** Registra errores de consola y excepciones no atrapadas. */
export function vigilarErrores() {
  window.__errores = [];
  addEventListener('error', (e) => window.__errores.push(`error: ${e.message}`));
  addEventListener('unhandledrejection', (e) => window.__errores.push(`rejection: ${e.reason?.message ?? e.reason}`));
  return () => window.__errores;
}

/** Texto "basura" visible: valores de JS que se colaron como texto. */
export function basura(root = document.body) {
  const txt = root.innerText;
  return [...txt.matchAll(/\b(null|undefined|false|true|NaN)\b|\[object \w+\]|Invalid Date|Infinity/g)].map((m) => m[0]);
}

/** ¿Hay scroll horizontal en la página? */
export const scrollHorizontal = () => document.documentElement.scrollWidth > document.documentElement.clientWidth;
