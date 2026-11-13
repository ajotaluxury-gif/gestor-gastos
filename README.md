# Finanzas (gestor de gastos)

Gestor de gastos personal como PWA, pensado para el celular Android.
Se instala desde Chrome, funciona 100 % offline y **guarda los datos solo en el teléfono**:
no hay servidor, ni cuentas, ni nada que se suba a internet.

## Qué hace

- **Movimientos:** gastos e ingresos con monto, categoría, fecha y nota. Se editan y se borran con "Deshacer".
- **Dos ámbitos separados**, *Personal* y *Negocio*, cada uno con sus categorías, presupuestos y resumen.
- **Categorías:** se crean, editan, ordenan y archivan, con emoji y color.
- **Resumen mensual:** totales, comparación con el mes anterior, gráfico por categoría y los últimos 6 meses.
- **Presupuestos** por categoría, con alerta al 80 % y al pasar el 100 %.
- **Gastos fijos y cuotas** (pestaña *Plan*): alquiler, servicios, préstamos, tarjetas. Aparecen solos en cada
  mes que corresponde, con su día de vencimiento y aviso cuando faltan 3 días o menos. Tildarlo crea el gasto.
  Muestra lo comprometido del mes y el capital que falta pagar en cuotas.
- **Ahorros:** dónde está la plata (efectivo, banco, billetera virtual, dólar, dólar MEP, cripto, con su
  detalle), metas con objetivo editable (en pesos o dólares) y aportes/retiros. Cotizaciones cargadas a mano
  para ver el total en pesos.
- **Historial** con búsqueda y filtros por tipo, categoría y fechas.
- **Exportar a CSV** para Excel o Google Sheets, y **backup y restauración** en JSON.
- **Personalizar:** tema automático, claro u oscuro; un color para cada ámbito; tamaño de letra normal, grande o muy grande.
- **Borrar todos los datos** (Ajustes → Zona de peligro): pide confirmación, ofrece un backup antes y el
  botón "Confirmar" se habilita recién a los 5 segundos.

Montos en pesos con formato argentino (1.234,56) y fechas dd/mm/aaaa.

---

## Stack y arquitectura

| Capa | Tecnología |
|---|---|
| Interfaz | HTML + CSS + **JavaScript vanilla** con módulos ES. Sin framework, sin dependencias de npm y **sin paso de build**: lo que está en el repo es exactamente lo que corre. |
| Gráficos | **Chart.js 4.5.1**, copiado en `vendor/` (no se baja de un CDN, así funciona sin internet). Se carga recién al abrir el Resumen. |
| Datos | **IndexedDB** del navegador (base `gestor-gastos`, esquema v2, 10 tablas), con una capa propia en `js/db.js` y migraciones versionadas en `js/migrations.js`. |
| App instalable y offline | **PWA**: `manifest.webmanifest` (nombre "Finanzas", íconos) y un **Service Worker** (`sw.js`) que guarda una copia de los archivos de la app para que abra sin conexión. |
| Hosting | **GitHub Pages**: solo sirve los archivos estáticos. **No hay servidor, base de datos remota ni cuentas.** |
| Tests | `node:test` (tests unitarios, sin dependencias) y ayudantes para probar en el navegador (`tests/e2e/helpers.js`). |

### Dónde se guarda cada cosa

GitHub Pages **no guarda ningún dato tuyo**: solo entrega la app. Todo lo que cargás vive **en el teléfono**:

| Qué | Dónde | Notas |
|---|---|---|
| Movimientos, categorías, presupuestos, gastos fijos y pagos, cuentas de ahorro, metas, aportes, cotizaciones, personalización | **IndexedDB** del navegador, en el teléfono | Es la base de datos real. Las operaciones son transaccionales: un guardado, una restauración o un borrado total se hacen enteros o no se hacen. |
| Archivos de la app (HTML, JS, CSS, íconos, Chart.js) | Caché del Service Worker | No contiene datos tuyos. Se reemplaza con cada versión nueva. |
| Copia de la personalización (tema, letra) | `localStorage` | Solo para aplicar el tema **antes de pintar** y que no parpadee. El dato original está en IndexedDB. |
| Marcas momentáneas ("se restauró", "se borró") | `sessionStorage` | Se borran solas al cerrar la app. |
| **Backups** | Un archivo `.json` que **vos** descargás (queda en *Descargas*) o compartís (Drive, mail, WhatsApp…) | Nunca pasa por GitHub ni por ningún servidor. Es la única copia fuera del navegador. |

**¿Por qué IndexedDB y no localStorage?** localStorage solo guarda texto, tiene un límite chico (~5 MB) y no tiene
transacciones ni índices. IndexedDB guarda objetos, permite índices (por eso el listado de un mes es rápido aunque haya
miles de movimientos), hace transacciones atómicas y tiene una cuota de cientos de MB a varios GB.

**Consecuencias de este diseño:**
- ✅ Funciona sin internet, es gratis y tus datos no salen del teléfono.
- ⚠️ Si borrás los datos de Chrome, desinstalás aceptando borrar los datos del sitio o perdés el teléfono, los datos se
  pierden. Por eso: almacenamiento persistente + recordatorio de backup cada 30 días. **Hacé backups.**
- ⚠️ No se sincroniza entre dispositivos: cada teléfono tiene su propia base. Para pasar los datos, backup en uno y
  restaurar en el otro. (Sincronizar requeriría agregar un backend con cuentas, por ejemplo Supabase o Firebase.)

### ¿Me puedo quedar sin espacio?

En la práctica, no. Medido en la app (noviembre de 2026):

| Dato | Valor medido |
|---|---|
| Espacio por movimiento en IndexedDB (con índices) | **~0,75 KB** |
| 20.000 movimientos | ~15 MB en la base · 6,6 MB el backup |
| App instalada sin datos (archivos en caché) | ~1 MB |

Cuánto deja usar el navegador: Chrome le da a cada sitio hasta un **60 % del disco total** del teléfono, limitado por el
espacio que realmente esté libre. En un teléfono con aunque sea 1 GB libre, eso son cientos de MB o varios GB.

| Uso | Movimientos por año | Espacio por año | 10 años |
|---|---|---|---|
| Normal (10 por día) | ~3.650 | ~2,7 MB | ~27 MB |
| Intensivo (30 por día, personal + negocio) | ~11.000 | ~8 MB | ~80 MB |

Es decir: el límite real es que **el teléfono se llene** (fotos, videos, apps), no la app. Para cubrir ese caso:
- **Ajustes → Almacenamiento** muestra el espacio usado y el disponible para la app.
- Si queda **menos del 20 %** de la cuota o **menos de 50 MB** libres, la app **avisa al abrirse** y en Ajustes, antes de
  que falle algo.
- Si aun así un guardado no entra, **no se guarda a medias**: la transacción se cancela, la hoja queda abierta con lo que
  escribiste y aparece "No hay espacio suficiente en el teléfono para guardar los datos". Liberás espacio y reintentás.
- Con el **almacenamiento persistente** otorgado (Ajustes lo muestra), Android no borra los datos para hacer lugar. Sin
  él, ante falta extrema de espacio, el navegador podría borrar datos de sitios poco usados: por eso conviene instalar la
  app y tener backups.

El rendimiento tampoco es un problema con estos volúmenes: los listados consultan solo el mes visible (por índice), las
búsquedas muestran resultados de a 200, y backup, validación y restauración de 10.000 movimientos tardan menos de medio
segundo.

---

## Publicarla en GitHub Pages

Es todo estático (HTML, CSS y JS, sin build), así que GitHub Pages la sirve tal cual y con HTTPS,
que es obligatorio para instalarla.

1. Creá un repositorio en GitHub, por ejemplo `gestor-gastos`. Puede ser público o privado:
   Pages en repos privados requiere un plan pago.
2. Subí el proyecto:
   ```bash
   git remote add origin https://github.com/TU_USUARIO/gestor-gastos.git
   git push -u origin main
   ```
3. En GitHub: **Settings → Pages → Build and deployment**
   - *Source:* **Deploy from a branch**
   - *Branch:* **main**, carpeta **/ (root)** → **Save**
4. En uno o dos minutos queda en `https://TU_USUARIO.github.io/gestor-gastos/`.

Funciona en un subpath sin tocar nada porque todas las rutas son relativas (`./`) y el
Service Worker tiene scope `./`. Así que sirve tanto en `/gestor-gastos/` como en un dominio propio.

> **Ojo con el origen:** todas las páginas `TU_USUARIO.github.io/*` comparten origen, y por lo tanto
> almacenamiento. La app usa nombres propios (base `gestor-gastos`, cachés `gestor-gastos-*`) para no
> chocar con otros proyectos tuyos. Pero si algún día cambiás la URL (otro nombre de repo, otro dominio),
> la app nueva arranca **vacía**: antes de mudarla, hacé un backup y restauralo en la nueva.

### Publicar una versión nueva

1. Hacé los cambios.
2. **Subí `VERSION` en `sw.js`.** Sin esto, los teléfonos siguen usando la versión cacheada.
3. Si agregaste archivos, sumalos a `ASSETS` en `sw.js`. El test `node --test tests/unit.test.mjs` avisa si falta alguno.
4. `git push`. Al abrir la app, aparece *"Hay una actualización, tocá para recargar"*.

---

## Instalarla en Android

1. Abrí la URL en **Chrome**.
2. Tocá el menú **⋮ → Instalar app** (o "Agregar a la pantalla principal").
3. Abrila desde el ícono: se ve como una app, sin barra de direcciones, y funciona sin conexión.
4. En **Ajustes** fijate que diga **"Datos protegidos"**. Chrome suele dar almacenamiento persistente
   a las apps instaladas, y así Android no borra los datos aunque falte espacio. Si dice que no,
   tocá *Pedir protección de nuevo*.

> La app instalada y la página en Chrome **comparten los mismos datos** (mismo origen).
> Al desinstalarla, Chrome puede ofrecer borrar también los datos del sitio: si aceptás, se pierden.
> Lo mismo pasa con **"Borrar datos de navegación"** o **"Borrar almacenamiento"** de Chrome.
> Para eso están los backups.

---

## Backups (importante)

Los datos viven **solo en el teléfono**. Si lo perdés, lo reseteás o se borran los datos de Chrome,
se pierden. La app te recuerda hacer un backup cuando pasaron más de 30 días.

**Hacer un backup:** *Ajustes → Tus datos*
- **💾 Descargar backup:** guarda `gestor-gastos-backup-AAAA-MM-DD.json` en *Descargas*.
- **📤 Compartir backup:** abre el menú de compartir de Android para mandarlo directo a Drive,
  al mail, a WhatsApp ("Mensajes guardados"), etc. **Es lo más recomendable**, porque el archivo queda fuera del teléfono.

**Restaurar:** *Ajustes → Tus datos → ♻️ Restaurar desde backup* y elegís el `.json`.
- Antes de tocar nada, la app **valida el archivo completo**: formato, versión, montos, fechas y que
  cada movimiento apunte a una categoría que exista. Si algo está mal, te lista los problemas y no cambia nada.
- Si está bien, te muestra cuántos movimientos, categorías y presupuestos hay hoy y cuántos trae el backup,
  y pide confirmación.
- La restauración **reemplaza todos los datos** en una sola operación: si falla a mitad de camino, no se cambia nada.
- Sirve también para **pasar los datos a otro teléfono**: backup en uno, restaurar en el otro.

**Exportar a CSV:** elegís el ámbito (el actual o ambos) y el período (el mes visible o todo).
El archivo usa `;` como separador y UTF-8 con BOM, así Excel en español lo abre bien con doble clic.
Los gastos van en negativo, así que sumar la columna *Monto* da el balance.
El CSV es para analizar los datos, **no sirve para restaurar**: para eso está el backup JSON.

---

## Desarrollo

Requisitos: Node 18 o superior. No hay dependencias ni `npm install`.

```bash
node tools/serve.mjs              # http://localhost:8080 (con los tipos MIME correctos)
node --test tests/unit.test.mjs   # tests de montos, fechas, validaciones, CSV y backups
node tools/make-icons.mjs         # regenera los PNG de icons/
```

**Pruebas en el navegador:** con el servidor local corriendo, desde la consola de DevTools:
```js
const t = await import('/tests/e2e/helpers.js');
await t.reset();                                   // base limpia (borra todo y recarga)
await t.mov({ monto: '1.500', categoria: 'Ropa' }); // carga un gasto por la interfaz
t.basura();                                        // detecta "null", "undefined", "NaN"… visibles
```

> **Tip:** el Service Worker sirve todo desde la caché, así que mientras desarrollás activá en
> Chrome DevTools → Application → Service Workers la opción **Update on reload**. Si no, vas a
> seguir viendo la versión vieja.

**Probar en el celular sin publicar:** conectá el teléfono por USB con la depuración USB activada.
En Chrome de la PC andá a `chrome://inspect` → **Port forwarding** → `8080` → `127.0.0.1:8080`, y en el
celular abrí `http://localhost:8080`. Como es `localhost`, el Service Worker y la instalación funcionan sin HTTPS.

### Cambiar el esquema de datos

1. Subí `DB_VERSION` en `js/migrations.js` y agregá `MIGRATIONS[nuevaVersión]`.
   **Nunca edites una migración ya publicada.**
2. Actualizá `migrarBackup()` en `js/backup.js` para que los backups viejos se transformen al esquema nuevo.

### Estructura

| Ruta | Qué es |
|---|---|
| `index.html`, `css/app.css` | App shell y estilos (modo oscuro automático) |
| `manifest.webmanifest`, `icons/` | Instalación y los íconos (normal y maskable) |
| `sw.js` | Service Worker: precache versionado y aviso de actualización |
| `js/app.js` | Arranque, router por `#hash`, aviso de presupuestos |
| `js/db.js`, `js/migrations.js`, `js/seed.js` | Capa fina sobre IndexedDB, migraciones y categorías iniciales |
| `js/repo.js` | Reglas de negocio: validaciones, movimientos, categorías, presupuestos |
| `js/storage.js` | Almacenamiento persistente, espacio usado/disponible y aviso de poco espacio |
| `js/prefs.js` | Personalización (tema, colores, letra) |
| `js/fijos.js` | Gastos fijos y cuotas: qué toca cada mes, vencimientos, pagos y capital comprometido |
| `js/ahorros.js` | Cuentas de ahorro, metas, aportes/retiros, cotizaciones y conversiones |
| `js/backup.js` | CSV, backup JSON, validación y restauración |
| `js/money.js`, `js/dates.js` | Montos en centavos (es-AR) y fechas `aaaa-mm-dd` |
| `js/sheet.js`, `js/toast.js`, `js/dom.js`, `js/components.js` | Piezas de interfaz |
| `js/charts.js` | Carga diferida de Chart.js y colores del tema |
| `js/views/` | Pantallas y formularios |
| `vendor/` | Chart.js 4.5.1 (licencia MIT) |
| `tools/` | Servidor local y generador de íconos |
| `tests/` | Tests con `node:test` |

### Decisiones de diseño

- **Montos en centavos enteros** para evitar errores de punto flotante. "1.234" se lee como mil
  doscientos treinta y cuatro y "12.5" como doce con cincuenta.
- **Fechas como texto `aaaa-mm-dd`**, sin hora, para que nunca se corran un día por la zona horaria.
- **Presupuestos:** un tope fijo por mes. La alerta aparece desde el 80 % y el "excedido" al pasar el 100 %.
- **Categorías:** el tipo (gasto o ingreso) no se cambia después de crearlas. Solo se borran si no tienen movimientos;
  si tienen, se archivan.
