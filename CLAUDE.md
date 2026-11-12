# Gestor de Gastos — instrucciones para Claude

Hablar en español argentino.

## Publicar siempre cada cambio

La app se usa desde el celular en https://ajotaluxury-gif.github.io/gestor-gastos/ (GitHub Pages, rama `main`).
Un cambio a la app **no está terminado hasta que está publicado**. Al terminar cualquier cambio:

1. Subir `VERSION` en `sw.js`. Sin esto, los teléfonos siguen usando la versión cacheada.
2. Si se agregaron archivos de la app, sumarlos a `ASSETS` en `sw.js`.
3. `node --test tests/unit.test.mjs` (todo en verde).
4. Commit y `git push origin main`.
5. Esperar el build de Pages y confirmar que el `sw.js` publicado tiene la nueva `VERSION`.
6. Avisar el número de versión nuevo. En el celular aparece "Hay una actualización, tocá para recargar".

No publicar trabajo a medias o roto: en ese caso, avisarlo.

Los commits van con el mail privado de GitHub (`…@users.noreply.github.com`), que ya está en la configuración local del repo. Nunca usar un mail personal.

## Datos

Los datos viven solo en el teléfono (IndexedDB). Un backup generado por cualquier versión publicada tiene que poder
restaurarse en las siguientes: no endurecer `validarBackup` de forma que rechace datos que una versión anterior aceptaba.
Para cambiar el esquema: nueva migración en `js/migrations.js` (nunca editar una publicada) y actualizar `migrarBackup()`.
