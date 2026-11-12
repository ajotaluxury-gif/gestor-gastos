// Interfaz de "Tus datos": backup, compartir, exportar CSV, restaurar y recordatorio.
import { h } from '../dom.js';
import { AMBITOS, notifyDataChanged } from '../state.js';
import {
  crearBackup, marcarBackupHecho, exportarCSV, leerBackup, conteoActual, restaurarBackup,
  estadoBackup, posponerRecordatorio,
} from '../backup.js';
import { monthLabel, toDisplay, fechaLocal } from '../dates.js';
import { toast, toastError } from '../toast.js';
import { openSheet } from '../sheet.js';

const RESTORE_FLAG = 'gg-restaurado';

// ---------- Descargar / compartir ----------

function descargar({ blob, nombre }) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: nombre, hidden: true });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const archivo = ({ blob, nombre }) => new File([blob], nombre, { type: blob.type });

/** ¿El navegador puede compartir archivos (Drive, WhatsApp, mail…)? */
export function puedeCompartirArchivos() {
  try {
    return Boolean(navigator.canShare?.({ files: [new File(['{}'], 'x.json', { type: 'application/json' })] }));
  } catch {
    return false;
  }
}

export async function descargarBackup() {
  try {
    const b = await crearBackup();
    descargar(b);
    await marcarBackupHecho();
    notifyDataChanged();
    toast(`Backup descargado (${b.cantidad} ${b.cantidad === 1 ? 'movimiento' : 'movimientos'}). Guardalo fuera del teléfono.`, { duration: 6000 });
  } catch (err) {
    toastError(err);
  }
}

export async function compartirBackup() {
  try {
    const b = await crearBackup();
    await navigator.share({ files: [archivo(b)], title: 'Backup de Gestor de Gastos' });
    await marcarBackupHecho();
    notifyDataChanged();
    toast('Backup compartido');
  } catch (err) {
    if (err?.name !== 'AbortError') toastError(err);
  }
}

export async function descargarCSV({ ambito, mes }) {
  try {
    const r = await exportarCSV({ ambito, mes });
    if (!r.cantidad) {
      toast('No hay movimientos para exportar con esos filtros.');
      return;
    }
    descargar(r);
    toast(`CSV descargado (${r.cantidad} ${r.cantidad === 1 ? 'movimiento' : 'movimientos'})`);
  } catch (err) {
    toastError(err);
  }
}

// ---------- Restaurar ----------

/** Abre el selector de archivo; si el backup es válido, pide confirmación. */
export function elegirBackup() {
  const input = h('input', { type: 'file', accept: '.json,application/json', hidden: true });
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.remove();
    if (!file) return;
    try {
      const res = await leerBackup(file);
      if (!res.ok) mostrarErrores(file.name, res.errores);
      else confirmarRestauracion(file.name, res, await conteoActual());
    } catch (err) {
      toastError(err);
    }
  });
  document.body.append(input);
  input.click();
}

function mostrarErrores(nombre, errores) {
  let sheet;
  sheet = openSheet({
    title: 'No se puede restaurar',
    body: [
      h('div', { class: 'status status-error', role: 'alert' },
        h('span', { class: 'status-icon', 'aria-hidden': 'true' }, '⛔'),
        h('div', null,
          h('strong', null, nombre),
          h('p', null, errores.length === 1 ? errores[0] : `El archivo tiene ${errores.length}${errores.length >= 20 ? ' o más' : ''} problemas:`))),
      errores.length > 1 && h('ul', { class: 'error-list' }, errores.map((e) => h('li', null, e))),
      h('p', { class: 'muted' }, 'No se cambió nada en tus datos.'),
    ],
    footer: [h('button', { class: 'btn btn-primary', type: 'button', onClick: () => sheet.close() }, 'Entendido')],
  });
}

function tablaConteo(backup, actual) {
  const fila = (label, key) => h('tr', null,
    h('th', { scope: 'row' }, label),
    ...Object.keys(AMBITOS).flatMap((a) => [
      h('td', null, actual[a][key]),
      h('td', null, h('strong', null, backup[a][key])),
    ]));
  return h('table', { class: 'compare' },
    h('thead', null,
      h('tr', null, h('td'), ...Object.values(AMBITOS).map((a) => h('th', { colspan: 2, scope: 'colgroup' }, a.label))),
      h('tr', null, h('td'), ...Object.keys(AMBITOS).flatMap(() => [
        h('th', { scope: 'col', class: 'muted' }, 'Hoy'), h('th', { scope: 'col' }, 'Backup')]))),
    h('tbody', null,
      fila('Movimientos', 'movimientos'),
      fila('Categorías', 'categorias'),
      fila('Presupuestos', 'presupuestos'),
      fila('Gastos fijos', 'fijos'),
      fila('Ahorros', 'ahorros'),
      fila('Metas', 'metas')));
}

function confirmarRestauracion(nombre, res, actual) {
  const { resumen } = res;
  const fecha = resumen.exportedAt
    ? `Backup del ${toDisplay(fechaLocal(resumen.exportedAt))}`
    : 'Backup sin fecha de exportación';
  const check = h('input', { type: 'checkbox', id: 'r-ok' });
  const restoreBtn = h('button', { class: 'btn btn-danger', type: 'submit', disabled: true }, 'Reemplazar mis datos');
  check.addEventListener('change', () => { restoreBtn.disabled = !check.checked; });
  const general = h('p', { class: 'field-error', role: 'alert', hidden: true });

  let sheet;
  sheet = openSheet({
    title: 'Restaurar backup',
    onSubmit: async () => {
      if (!check.checked) return;
      restoreBtn.disabled = true;
      try {
        await restaurarBackup(res);
        try { sessionStorage.setItem(RESTORE_FLAG, '1'); } catch { /* sin sessionStorage */ }
        location.reload();
      } catch (err) {
        general.textContent = `⛔ ${err.message} No se cambió nada.`;
        general.hidden = false;
        restoreBtn.disabled = false;
      }
    },
    body: [
      h('p', null, h('strong', null, nombre), h('br'), h('span', { class: 'muted' }, fecha)),
      tablaConteo(resumen.porAmbito, actual),
      resumen.avisos?.length > 0 && h('div', { class: 'status status-warn' },
        h('span', { class: 'status-icon', 'aria-hidden': 'true' }, 'ℹ️'),
        h('div', null,
          h('strong', null, 'Ajustes al restaurar'),
          h('ul', { class: 'error-list' }, resumen.avisos.map((a) => h('li', null, a))))),
      h('div', { class: 'status status-warn' },
        h('span', { class: 'status-icon', 'aria-hidden': 'true' }, '⚠️'),
        h('div', null,
          h('strong', null, 'Esto reemplaza TODOS tus datos actuales'),
          h('p', null, 'Lo que cargaste después de este backup se pierde. Si no estás seguro, descargá antes un backup de lo que tenés hoy.'))),
      h('button', { class: 'btn btn-block', type: 'button', onClick: descargarBackup }, '💾 Descargar backup de mis datos actuales'),
      h('label', { class: 'check', for: 'r-ok' }, check, ' Entiendo que se reemplazan mis datos actuales'),
      general,
    ],
    footer: [
      h('button', { class: 'btn', type: 'button', onClick: () => sheet.close() }, 'Cancelar'),
      restoreBtn,
    ],
  });
}

/** Si la página se recargó después de restaurar, lo avisamos. */
export function avisarSiSeRestauro() {
  try {
    if (sessionStorage.getItem(RESTORE_FLAG)) {
      sessionStorage.removeItem(RESTORE_FLAG);
      toast('Backup restaurado', { duration: 5000 });
    }
  } catch { /* sin sessionStorage */ }
}

// ---------- Tarjeta para Ajustes ----------

function textoUltimo({ last, diasDesdeUltimo }) {
  if (!last) return 'Nunca';
  const fecha = toDisplay(fechaLocal(last));
  if (diasDesdeUltimo === 0) return `Hoy (${fecha})`;
  if (diasDesdeUltimo === 1) return `Ayer (${fecha})`;
  return `Hace ${diasDesdeUltimo} días (${fecha})`;
}

export async function tarjetaDatos(state) {
  const estado = await estadoBackup();
  const viejo = !estado.last || estado.recordar;

  const ambitoSel = h('select', { id: 'csv-ambito', class: 'input' },
    h('option', { value: state.ambito }, `Solo ${AMBITOS[state.ambito].label}`),
    h('option', { value: '' }, 'Ambos ámbitos'));
  const periodoSel = h('select', { id: 'csv-periodo', class: 'input' },
    h('option', { value: state.mes }, monthLabel(state.mes)),
    h('option', { value: '' }, 'Todo el historial'));

  return h('div', { class: 'card datos' },
    h('h3', null, 'Tus datos'),
    h('p', { class: 'muted hint' },
      'Todo se guarda solo en este teléfono. Si se borran los datos de Chrome o perdés el teléfono, se pierden: hacé backups y guardalos en otro lado (Drive, mail, la compu).'),
    h('dl', { class: 'kv' },
      h('dt', null, 'Último backup'),
      h('dd', { class: viejo ? 'level-alerta-text' : null }, `${viejo ? '⚠ ' : ''}${textoUltimo(estado)}`)),

    h('div', { class: 'actions' },
      h('button', { class: 'btn btn-primary', type: 'button', onClick: descargarBackup }, '💾 Descargar backup'),
      puedeCompartirArchivos() &&
        h('button', { class: 'btn', type: 'button', onClick: compartirBackup }, '📤 Compartir backup'),
      h('button', { class: 'btn', type: 'button', onClick: elegirBackup }, '♻️ Restaurar desde backup')),

    h('h4', null, 'Exportar a CSV (Excel, Google Sheets)'),
    h('div', { class: 'field-row' },
      h('div', { class: 'field' }, h('label', { for: 'csv-ambito' }, 'Ámbito'), ambitoSel),
      h('div', { class: 'field' }, h('label', { for: 'csv-periodo' }, 'Período'), periodoSel)),
    h('button', {
      class: 'btn btn-block', type: 'button',
      onClick: () => descargarCSV({ ambito: ambitoSel.value || null, mes: periodoSel.value || null }),
    }, '📄 Descargar CSV'));
}

// ---------- Recordatorio (arriba de Movimientos) ----------

export async function recordatorioBackup(onChange) {
  let estado;
  try {
    estado = await estadoBackup();
  } catch {
    return null;
  }
  if (!estado.recordar) return null;
  const texto = estado.last
    ? `Hace ${estado.diasDesdeUltimo} días que no hacés un backup.`
    : 'Todavía no hiciste ningún backup.';
  return h('div', { class: 'status status-warn backup-reminder', role: 'status' },
    h('span', { class: 'status-icon', 'aria-hidden': 'true' }, '💾'),
    h('div', null,
      h('strong', null, texto),
      h('p', null, 'Tus datos están solo en este teléfono.'),
      h('div', { class: 'reminder-actions' },
        h('button', { class: 'btn btn-primary btn-small', type: 'button', onClick: descargarBackup }, 'Hacer backup'),
        h('button', { class: 'btn btn-small', type: 'button', onClick: async () => { await posponerRecordatorio(); onChange(); } }, 'Más tarde'))));
}
