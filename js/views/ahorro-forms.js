// Hojas de Ahorros: cuenta (dónde está la plata), meta y aporte/retiro.
import { h } from '../dom.js';
import { getState, notifyDataChanged } from '../state.js';
import { get, getAll, getMeta, setMeta } from '../db.js';
import * as A from '../ahorros.js';
import { ValidationError } from '../repo.js';
import { parseCantidad, parseMonto, formatInput, formatCantidad, formatNumber } from '../money.js';
import { todayISO, currentMonth, lastDayOfMonth } from '../dates.js';
import { toast, toastError } from '../toast.js';
import { openSheet, fieldErrors } from '../sheet.js';

let abierto = false;

/** Una sola hoja a la vez; espera a que se cierre. */
async function unaVez(fn) {
  if (abierto) return;
  abierto = true;
  try {
    const sheet = await fn();
    if (sheet) await sheet.closed;
  } catch (err) {
    toastError(err);
  } finally {
    abierto = false;
  }
}

const deshacer = (mensaje, accion) => toast(mensaje, {
  action: 'Deshacer',
  duration: 6000,
  onAction: () => accion().then(notifyDataChanged, toastError),
});

function zonaPeligro(...hijos) {
  return h('div', { class: 'danger-zone' }, hijos);
}

// ======================= Cuenta =======================

export const openCuentaForm = (opts = {}) => unaVez(() => cuentaForm(opts));

async function cuentaForm({ id }) {
  const cuenta = id ? await get('cuentas', id) : null;
  if (id && !cuenta) {
    toast('Esa cuenta ya no existe.');
    return null;
  }
  const ambito = cuenta?.ambito ?? getState().ambito;
  const usos = cuenta ? (await getAll('ahorros', 'cuentaId', cuenta.id)).length : 0;
  let tipo = cuenta?.tipo ?? 'banco';

  const errs = fieldErrors(['tipo', 'detalle', 'nota']);
  const detalleLabel = h('label', { for: 'k-detalle' });
  // Sugerencias como botones visibles (no <datalist>: en Chrome de Android su flechita no despliega nada).
  const sugerencias = h('div', { class: 'sugerencias', role: 'group', 'aria-label': 'Sugerencias' });
  const detalleInput = h('input', {
    id: 'k-detalle', class: 'input', type: 'text', maxlength: 40,
    autocomplete: 'off', enterkeyhint: 'done', value: cuenta?.detalle || null,
    disabled: cuenta?.tipo === 'cripto',
  });
  const marcarSugerencia = () => {
    const v = detalleInput.value.trim().toLowerCase();
    for (const b of sugerencias.children) b.setAttribute('aria-pressed', String(b.dataset.valor.toLowerCase() === v));
  };
  detalleInput.addEventListener('input', marcarSugerencia);
  const notaInput = h('input', {
    id: 'k-nota', class: 'input', type: 'text', maxlength: 60, autocomplete: 'off', enterkeyhint: 'done',
    placeholder: 'Ej: caja de ahorro, plazo fijo, en Binance', value: cuenta?.nota || null,
  });
  errs.bind('detalle', detalleInput);
  errs.bind('nota', notaInput);
  const monedaHint = h('p', { class: 'muted hint' });

  function pintarTipo() {
    const t = A.TIPOS_CUENTA[tipo];
    detalleLabel.textContent = t.detalleLabel;
    sugerencias.replaceChildren(...t.sugerencias.map((s) => h('button', {
      type: 'button', class: 'sugerencia', 'data-valor': s,
      onClick: () => { detalleInput.value = s; errs.clear('detalle'); marcarSugerencia(); },
    }, s)));
    // Editando una cripto, la sigla no se puede cambiar: no tiene sentido ofrecer otras.
    sugerencias.hidden = detalleInput.disabled;
    marcarSugerencia();
    detalleInput.placeholder = t.detalleRequerido ? `Elegí una de abajo o escribila` : `Ej: ${t.sugerencias[0]}`;
    detalleInput.classList.toggle('upper', tipo === 'cripto');
    monedaHint.textContent = t.moneda
      ? `Se guarda en ${t.moneda === 'ARS' ? 'pesos' : 'dólares'}.`
      : 'Se guarda en la cripto que pongas (por ejemplo 0,05 BTC).';
  }

  const tipoField = cuenta
    ? h('p', { class: 'muted' },
      `${A.TIPOS_CUENTA[tipo].emoji} ${A.TIPOS_CUENTA[tipo].label}. El tipo no se puede cambiar una vez creada.`)
    : h('fieldset', { class: 'field' },
      h('legend', null, '¿Dónde está la plata?'),
      h('div', { class: 'chips chips-tipo' }, Object.entries(A.TIPOS_CUENTA).map(([k, t]) =>
        h('label', { class: 'chip', style: '--cat:#0f766e' },
          h('input', {
            type: 'radio', name: 'tipo-cuenta', value: k, checked: k === tipo,
            onChange: () => { tipo = k; pintarTipo(); errs.clear('detalle'); },
          }),
          h('span', { class: 'chip-emoji', 'aria-hidden': 'true' }, t.emoji),
          h('span', { class: 'chip-name' }, t.label)))));

  let sheet;
  const saveBtn = h('button', { class: 'btn btn-primary', type: 'submit' }, cuenta ? 'Guardar' : 'Crear');

  async function guardar() {
    const data = { id: cuenta?.id, ambito, tipo, detalle: detalleInput.value, nota: notaInput.value };
    if (errs.show(A.validarCuenta({ ...data, detalle: data.detalle.trim(), nota: data.nota.trim() }))) return;
    saveBtn.disabled = true;
    try {
      const rec = await A.guardarCuenta(data);
      sheet.close();
      notifyDataChanged();
      toast(cuenta ? 'Cuenta actualizada' : `Listo: ${A.etiquetaCuenta(rec)}`);
    } catch (err) {
      if (err instanceof ValidationError) errs.show(err.errors);
      else errs.showGeneral(err);
    } finally {
      saveBtn.disabled = false;
    }
  }

  async function archivar() {
    try {
      const archivar = !cuenta.archivada;
      await A.archivarCuenta(cuenta.id, archivar);
      sheet.close();
      notifyDataChanged();
      deshacer(archivar ? 'Cuenta archivada' : 'Cuenta activa otra vez', () => A.archivarCuenta(cuenta.id, !archivar));
    } catch (err) {
      errs.showGeneral(err);
    }
  }

  async function borrar() {
    try {
      const rec = await A.borrarCuenta(cuenta.id);
      sheet.close();
      notifyDataChanged();
      deshacer('Cuenta borrada', () => A.restaurarCuenta(rec));
    } catch (err) {
      errs.showGeneral(err);
    }
  }

  pintarTipo();
  sheet = openSheet({
    title: cuenta ? 'Editar cuenta' : 'Nueva cuenta de ahorro',
    onSubmit: guardar,
    body: [
      tipoField,
      h('div', { class: 'field' }, detalleLabel, detalleInput, sugerencias, errs.els.detalle, monedaHint),
      h('div', { class: 'field' }, h('label', { for: 'k-nota' }, 'Aclaración (opcional)'), notaInput, errs.els.nota),
      errs.general,
      cuenta && zonaPeligro(
        h('button', { class: 'btn', type: 'button', onClick: archivar }, cuenta.archivada ? 'Desarchivar' : 'Archivar'),
        h('p', { class: 'muted' }, 'Las archivadas no se ofrecen al cargar aportes, pero su saldo se sigue contando.'),
        usos === 0 && h('button', { class: 'btn btn-danger-outline', type: 'button', onClick: borrar }, 'Borrar cuenta'),
        usos > 0 && h('p', { class: 'muted' }, `Tiene ${usos} ${usos === 1 ? 'movimiento' : 'movimientos'}, por eso solo se puede archivar.`)),
    ],
    footer: [h('button', { class: 'btn', type: 'button', onClick: () => sheet.close() }, 'Cancelar'), saveBtn],
  });
  if (!cuenta) detalleInput.focus();
  return sheet;
}

// ======================= Meta =======================

export const EMOJIS_META = ['🚗', '🏍️', '🚲', '📺', '💻', '📱', '🏠', '🛋️', '✈️', '🏖️', '🎓', '💍',
  '👶', '🐶', '🎸', '🎮', '⌚', '📷', '🧳', '🏥', '🛟', '🎁', '💰', '🎯'];

export const openMetaForm = (opts = {}) => unaVez(() => metaForm(opts));

async function metaForm({ id }) {
  const meta = id ? await get('metas', id) : null;
  if (id && !meta) {
    toast('Esa meta ya no existe.');
    return null;
  }
  const ambito = meta?.ambito ?? getState().ambito;
  let moneda = meta?.moneda ?? 'ARS';
  const errs = fieldErrors(['nombre', 'emoji', 'objetivo']);
  const nombreInput = h('input', {
    id: 'g-nombre', class: 'input', type: 'text', maxlength: 40, autocomplete: 'off', enterkeyhint: 'done',
    placeholder: 'Auto, moto, TV, viaje…', value: meta?.nombre || null,
  });
  const emojiInput = h('input', { id: 'g-emoji', class: 'input input-emoji', type: 'text', autocomplete: 'off', value: meta?.emoji ?? '🎯' });
  const objetivoInput = h('input', {
    id: 'g-objetivo', class: 'input input-monto', type: 'text', inputmode: 'decimal', autocomplete: 'off',
    enterkeyhint: 'done', placeholder: '0,00', value: meta ? formatNumber(meta.objetivo) : null,
  });
  errs.bind('nombre', nombreInput);
  errs.bind('emoji', emojiInput);
  errs.bind('objetivo', objetivoInput);

  const grid = h('div', { class: 'emoji-grid' }, EMOJIS_META.map((e) => h('button', {
    type: 'button', class: 'emoji-btn', 'data-emoji': e, 'aria-label': `Usar ${e}`,
    onClick: () => { emojiInput.value = e; errs.clear('emoji'); marcar(); },
  }, e)));
  const marcar = () => { for (const b of grid.children) b.setAttribute('aria-pressed', String(b.dataset.emoji === emojiInput.value.trim())); };
  emojiInput.addEventListener('input', marcar);

  const monedaField = h('fieldset', { class: 'seg-tipo' },
    h('legend', { class: 'sr-only' }, 'Moneda del objetivo'),
    ...A.MONEDAS_META.map((m) => h('label', { class: 'seg-opt' },
      h('input', { type: 'radio', name: 'moneda-meta', value: m, checked: m === moneda, onChange: () => { moneda = m; } }),
      h('span', null, m === 'ARS' ? 'En pesos' : 'En dólares'))));

  let sheet;
  const saveBtn = h('button', { class: 'btn btn-primary', type: 'submit' }, meta ? 'Guardar' : 'Crear meta');

  async function guardar() {
    const monto = parseCantidad(objetivoInput.value, moneda);
    const data = { id: meta?.id, ambito, nombre: nombreInput.value, emoji: emojiInput.value, moneda, objetivo: monto.ok ? monto.value : NaN };
    const errors = A.validarMeta({ ...data, nombre: data.nombre.trim(), emoji: data.emoji.trim() });
    if (!monto.ok) errors.objetivo = monto.error;
    if (errs.show(errors)) return;
    saveBtn.disabled = true;
    try {
      await A.guardarMeta(data);
      sheet.close();
      notifyDataChanged();
      toast(meta ? 'Meta actualizada' : 'Meta creada');
    } catch (err) {
      if (err instanceof ValidationError) errs.show(err.errors);
      else errs.showGeneral(err);
    } finally {
      saveBtn.disabled = false;
    }
  }

  async function archivar() {
    try {
      const archivar = !meta.archivada;
      await A.archivarMeta(meta.id, archivar);
      sheet.close();
      notifyDataChanged();
      deshacer(archivar ? 'Meta archivada' : 'Meta activa otra vez', () => A.archivarMeta(meta.id, !archivar));
    } catch (err) {
      errs.showGeneral(err);
    }
  }

  async function borrar() {
    try {
      const res = await A.borrarMeta(meta.id);
      sheet.close();
      notifyDataChanged();
      deshacer('Meta borrada', () => A.restaurarMeta(res));
    } catch (err) {
      errs.showGeneral(err);
    }
  }

  marcar();
  sheet = openSheet({
    title: meta ? 'Editar meta' : 'Nueva meta',
    onSubmit: guardar,
    body: [
      h('div', { class: 'field' }, h('label', { for: 'g-nombre' }, '¿Para qué ahorrás?'), nombreInput, errs.els.nombre),
      h('div', { class: 'field' }, h('label', { for: 'g-emoji' }, 'Emoji'), emojiInput, grid, errs.els.emoji),
      h('div', { class: 'field' }, h('label', { for: 'g-objetivo' }, '¿Cuánto querés juntar?'), monedaField, objetivoInput, errs.els.objetivo),
      h('p', { class: 'muted hint' }, 'Podés cambiar el objetivo cuando quieras. Los aportes en otra moneda se suman con la cotización que cargues.'),
      errs.general,
      meta && zonaPeligro(
        h('button', { class: 'btn', type: 'button', onClick: archivar }, meta.archivada ? 'Desarchivar' : 'Archivar'),
        h('button', { class: 'btn btn-danger-outline', type: 'button', onClick: borrar }, 'Borrar meta'),
        h('p', { class: 'muted' }, 'Al borrarla, sus aportes quedan como ahorro sin meta (la plata no se pierde).')),
    ],
    footer: [h('button', { class: 'btn', type: 'button', onClick: () => sheet.close() }, 'Cancelar'), saveBtn],
  });
  if (!meta) nombreInput.focus();
  return sheet;
}

// ======================= Aporte / retiro =======================

function fechaPorDefecto() {
  const { mes } = getState();
  const actual = currentMonth();
  if (mes === actual) return todayISO();
  return mes < actual ? lastDayOfMonth(mes) : `${mes}-01`;
}

/** Abre el aporte/retiro. Si no hay cuentas, primero ofrece crear una. */
export async function openAhorroForm({ id, tipo = 'aporte', metaId = null } = {}) {
  if (abierto) return;
  if (!id) {
    const cuentas = (await A.listCuentas(getState().ambito)).filter((c) => !c.archivada);
    if (!cuentas.length) {
      toast('Primero creá dónde guardás la plata (banco, efectivo, dólares…).');
      await openCuentaForm();
      return;
    }
  }
  await unaVez(() => ahorroForm({ id, tipo, metaId }));
}

async function ahorroForm({ id, tipo, metaId }) {
  const ah = id ? await A.getAhorro(id) : null;
  if (id && !ah) {
    toast('Ese movimiento ya no existe.');
    return null;
  }
  const ambito = ah?.ambito ?? getState().ambito;
  const [cuentas, metas, todos, cotiz, ultima] = await Promise.all([
    A.listCuentas(ambito), A.listMetas(ambito), A.listAhorros(ambito), A.cotizaciones(),
    getMeta(`ultimaCuenta:${ambito}`).catch(() => null),
  ]);
  const saldos = A.saldosPorCuenta(todos);
  const cuentasOk = cuentas.filter((c) => !c.archivada || c.id === ah?.cuentaId);
  const metasOk = metas.filter((m) => !m.archivada || m.id === ah?.metaId);
  let t = ah?.tipo ?? tipo;

  const errs = fieldErrors(['cuenta', 'monto', 'meta', 'fecha', 'nota', 'pesos']);
  const tipoField = h('fieldset', { class: 'seg-tipo' },
    h('legend', { class: 'sr-only' }, 'Tipo'),
    ...[['aporte', 'seg-ingreso', '＋ Aporte'], ['retiro', 'seg-gasto', '− Retiro']].map(([v, cls, label]) =>
      h('label', { class: `seg-opt ${cls}` },
        h('input', { type: 'radio', name: 'tipo-ahorro', value: v, checked: v === t, onChange: () => { t = v; pintarCuenta(); } }),
        h('span', null, label))));

  const cuentaSel = h('select', { id: 'a-cuenta', class: 'input' }, cuentasOk.map((c) =>
    h('option', { value: c.id }, `${A.TIPOS_CUENTA[c.tipo]?.emoji ?? '💰'} ${A.etiquetaCuenta(c)} · ${formatCantidad(saldos.get(c.id) ?? 0, c.moneda)}`)));
  cuentaSel.value = ah?.cuentaId ?? (cuentasOk.some((c) => c.id === ultima) ? ultima : cuentasOk[0]?.id ?? '');

  const montoLabel = h('label', { for: 'a-monto' });
  const montoInput = h('input', {
    id: 'a-monto', class: 'input input-monto', type: 'text', inputmode: 'decimal', autocomplete: 'off',
    enterkeyhint: 'done', value: ah ? formatInput(ah.cantidad, ah.moneda) : null,
  });
  const metaSel = h('select', { id: 'a-meta', class: 'input' },
    h('option', { value: '' }, 'Sin meta'),
    metasOk.map((m) => h('option', { value: m.id }, `${m.emoji} ${m.nombre}${m.archivada ? ' (archivada)' : ''}`)));
  metaSel.value = ah?.metaId ?? (metasOk.some((m) => m.id === metaId) ? metaId : '');
  const fechaInput = h('input', { id: 'a-fecha', class: 'input', type: 'date', value: ah?.fecha ?? fechaPorDefecto() });
  const notaInput = h('input', {
    id: 'a-nota', class: 'input', type: 'text', maxlength: 200, autocomplete: 'off', enterkeyhint: 'done',
    placeholder: 'Opcional', value: ah?.nota || null,
  });
  const pesosLabel = h('label', { for: 'a-pesos' });
  const pesosInput = h('input', {
    id: 'a-pesos', class: 'input', type: 'text', inputmode: 'decimal', autocomplete: 'off', enterkeyhint: 'done',
    placeholder: 'Opcional', value: ah?.pesos ? formatNumber(ah.pesos) : null,
  });
  const pesosField = h('div', { class: 'field' }, pesosLabel, pesosInput, errs.els.pesos,
    h('p', { class: 'muted hint' }, 'Sirve para saber cuántos pesos ahorraste este mes. Si lo dejás vacío se usa la cotización que cargues.'));
  for (const [f, el] of [['cuenta', cuentaSel], ['monto', montoInput], ['meta', metaSel], ['fecha', fechaInput], ['nota', notaInput], ['pesos', pesosInput]]) {
    errs.bind(f, el);
  }

  const cuentaActual = () => cuentasOk.find((c) => c.id === cuentaSel.value);
  function pintarCuenta() {
    const c = cuentaActual();
    const m = c?.moneda ?? 'ARS';
    montoLabel.textContent = `Monto (${m === 'ARS' ? 'pesos' : m === 'USD' ? 'dólares' : m})`;
    montoInput.placeholder = m === 'ARS' || m === 'USD' ? '0,00' : '0,0005';
    pesosField.hidden = m === 'ARS';
    pesosLabel.textContent = t === 'aporte' ? 'Pesos que usaste (opcional)' : 'Pesos que recibiste (opcional)';
  }
  cuentaSel.addEventListener('change', pintarCuenta);

  let sheet;
  const saveBtn = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Guardar');

  async function guardar() {
    const c = cuentaActual();
    const moneda = c?.moneda ?? 'ARS';
    const monto = parseCantidad(montoInput.value, moneda);
    const pesosTxt = pesosInput.value.trim();
    const pesos = moneda !== 'ARS' && pesosTxt ? parseMonto(pesosTxt) : null;
    const data = {
      id: ah?.id, ambito, tipo: t, cuentaId: c?.id ?? '', moneda,
      cantidad: monto.ok ? monto.value : NaN, metaId: metaSel.value || null,
      fecha: fechaInput.value, nota: notaInput.value.trim(), pesos: pesos?.ok ? pesos.value : null,
    };
    const errors = A.validarAhorro(data);
    if (!monto.ok) errors.monto = monto.error;
    if (pesos && !pesos.ok) errors.pesos = pesos.error;
    if (errs.show(errors)) return;

    const metaAntes = data.metaId ? metas.find((m) => m.id === data.metaId) : null;
    const pctAntes = metaAntes ? A.progresoMeta(metaAntes, todos, cotiz).pct : 0;
    saveBtn.disabled = true;
    try {
      const rec = await A.guardarAhorro(data);
      setMeta(`ultimaCuenta:${ambito}`, rec.cuentaId).catch(() => {});
      sheet.close();
      notifyDataChanged();
      let msg = `${t === 'aporte' ? 'Aporte' : 'Retiro'} ${ah ? 'actualizado' : 'guardado'}`;
      if (metaAntes && pctAntes < 1) {
        const despues = A.progresoMeta(metaAntes, [...todos.filter((x) => x.id !== rec.id), rec], cotiz);
        if (despues.pct >= 1) msg = `🎉 ¡Llegaste a la meta "${metaAntes.nombre}"!`;
      }
      toast(msg, { duration: 5000 });
    } catch (err) {
      if (err instanceof ValidationError) errs.show(err.errors);
      else errs.showGeneral(err);
    } finally {
      saveBtn.disabled = false;
    }
  }

  async function borrar() {
    try {
      const rec = await A.borrarAhorro(ah.id);
      sheet.close();
      notifyDataChanged();
      if (rec) deshacer(`${rec.tipo === 'aporte' ? 'Aporte' : 'Retiro'} borrado`, () => A.restaurarAhorro(rec));
    } catch (err) {
      errs.showGeneral(err);
    }
  }

  pintarCuenta();
  sheet = openSheet({
    title: ah ? 'Editar movimiento de ahorro' : (t === 'aporte' ? 'Aportar a mis ahorros' : 'Retirar de mis ahorros'),
    onSubmit: guardar,
    body: [
      tipoField,
      h('div', { class: 'field' }, h('label', { for: 'a-cuenta' }, '¿Dónde?'), cuentaSel, errs.els.cuenta),
      h('div', { class: 'field' }, montoLabel, montoInput, errs.els.monto),
      h('div', { class: 'field' }, h('label', { for: 'a-meta' }, 'Meta'), metaSel, errs.els.meta),
      pesosField,
      h('div', { class: 'field-row' },
        h('div', { class: 'field' }, h('label', { for: 'a-fecha' }, 'Fecha'), fechaInput, errs.els.fecha),
        h('div', { class: 'field' }, h('label', { for: 'a-nota' }, 'Nota'), notaInput, errs.els.nota)),
      errs.general,
    ],
    footer: [
      ah && h('button', { class: 'btn btn-danger-outline', type: 'button', onClick: borrar }, 'Borrar'),
      h('button', { class: 'btn', type: 'button', onClick: () => sheet.close() }, 'Cancelar'),
      saveBtn,
    ],
  });
  montoInput.focus();
  return sheet;
}

// ======================= Cotización =======================

/** Guarda la cotización escrita en un input ("1 USD = $ …"). Vacío = borrarla. */
export async function guardarCotizacionDesdeInput(moneda, texto) {
  try {
    if (!texto.trim()) {
      await A.borrarCotizacion(moneda);
    } else {
      const r = parseMonto(texto);
      if (!r.ok) {
        toast(`Cotización de ${moneda}: ${r.error}`, { kind: 'error' });
        return false;
      }
      await A.guardarCotizacion(moneda, r.value);
    }
    notifyDataChanged();
    toast(`Cotización de ${moneda} guardada`);
    return true;
  } catch (err) {
    toastError(err);
    return false;
  }
}
