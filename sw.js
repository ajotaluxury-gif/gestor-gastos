/* Service Worker del Gestor de Gastos.
 *
 * IMPORTANTE: cada vez que cambies cualquier archivo de la app, subí VERSION.
 * Así el navegador detecta un SW nuevo, precachea los archivos nuevos y la app
 * muestra el aviso "Hay una actualización, tocá para recargar".
 */
const VERSION = '0.5.0';
const CACHE_PREFIX = 'gestor-gastos-';
const CACHE = `${CACHE_PREFIX}${VERSION}`;

// App shell: todo lo necesario para funcionar 100% offline.
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/db.js',
  './js/migrations.js',
  './js/seed.js',
  './js/records.js',
  './js/state.js',
  './js/money.js',
  './js/dates.js',
  './js/dom.js',
  './js/toast.js',
  './js/storage.js',
  './js/sw-client.js',
  './js/repo.js',
  './js/sheet.js',
  './js/palette.js',
  './js/components.js',
  './js/charts.js',
  './js/views/form.js',
  './js/views/categorias.js',
  './js/views/categoria-form.js',
  './js/views/presupuesto-form.js',
  './js/views/movimientos.js',
  './js/views/resumen.js',
  './js/views/presupuestos.js',
  './js/views/ajustes.js',
  './vendor/chart.umd.min.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  // cache: 'reload' evita que el precache tome versiones viejas del caché HTTP.
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' })))
    )
  );
  // No hacemos skipWaiting acá: esperamos que el usuario acepte la actualización.
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE)
        .map((key) => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  const type = event.data && event.data.type;
  if (type === 'SKIP_WAITING') self.skipWaiting();
  if (type === 'GET_VERSION' && event.ports[0]) event.ports[0].postMessage(VERSION);
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navegaciones: siempre la app shell cacheada (es una SPA con rutas por #hash).
  if (request.mode === 'navigate') {
    const shell = new URL('./index.html', self.registration.scope).href;
    event.respondWith(
      caches.match(shell, { cacheName: CACHE }).then((cached) => cached || fetch(request))
    );
    return;
  }

  // Resto: cache-first, con red como respaldo.
  event.respondWith(
    caches.match(request, { cacheName: CACHE, ignoreSearch: true })
      .then((cached) => cached || fetch(request))
  );
});
