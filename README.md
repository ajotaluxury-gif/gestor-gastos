# Gestor de Gastos

PWA para registrar gastos e ingresos (Personal y Negocio) desde el celular.
Funciona 100% offline y guarda los datos solo en el dispositivo (IndexedDB).

> README en construcción: la versión completa (GitHub Pages, instalación en Android, backups) llega al final.

## Desarrollo

Requisitos: Node 18 o superior (sin dependencias, no hace falta `npm install`).

```bash
node tools/serve.mjs        # sirve en http://localhost:8080
node --test tests/unit.test.mjs
node tools/make-icons.mjs   # regenera los íconos de icons/
```

### Al cambiar archivos de la app

1. Si agregaste un archivo, sumalo a `ASSETS` en `sw.js`.
2. Subí `VERSION` en `sw.js`. Sin esto, los usuarios se quedan con la versión cacheada.

### Al cambiar el esquema de datos

Subí `DB_VERSION` en `js/migrations.js` y agregá una migración nueva. Nunca edites una migración ya publicada.

## Estructura

| Ruta | Qué es |
|---|---|
| `index.html`, `css/app.css` | App shell |
| `sw.js` | Service Worker (caché offline y actualizaciones) |
| `js/db.js`, `js/migrations.js`, `js/seed.js` | Capa de datos IndexedDB |
| `js/money.js`, `js/dates.js` | Montos en centavos y fechas `aaaa-mm-dd` |
| `js/views/` | Pantallas |
| `vendor/` | Chart.js 4.5.1 (MIT) |
| `tools/` | Servidor local y generador de íconos |
