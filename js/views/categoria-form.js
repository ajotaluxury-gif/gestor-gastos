// Hoja para crear o editar una categoría.
import { h, safeColor } from '../dom.js';
import { notifyDataChanged } from '../state.js';
import {
  getCategoria, listCategorias, guardarCategoria, archivarCategoria, borrarCategoria,
  restaurarCategoria, validarCategoria, contarUsos, ValidationError, NOMBRE_MAX,
} from '../repo.js';
import { COLORS, EMOJIS } from '../palette.js';
import { getAll } from '../db.js';
import { toast, toastError } from '../toast.js';
import { openSheet, fieldErrors } from '../sheet.js';

let abierto = false;

/** Sin id: alta (de `tipo` en `ambito`); con id: edición. */
export async function openCategoriaForm({ id, ambito, tipo = 'gasto' }) {
  if (abierto) return;
  abierto = true;
  try {
    const sheet = await abrir({ id, ambito, tipo });
    if (sheet) await sheet.closed;
  } catch (err) {
    toastError(err);
  } finally {
    abierto = false;
  }
}

const TIPO_LABEL = { gasto: 'gasto', ingreso: 'ingreso' };

async function abrir({ id, ambito, tipo }) {
  const cat = id ? await getCategoria(id) : null;
  if (id && !cat) {
    toast('Esa categoría ya no existe.');
    return null;
  }
  ambito = cat?.ambito ?? ambito;
  tipo = cat?.tipo ?? tipo;
  const usos = cat ? await contarUsos(cat.id) : 0;
  const usosFijos = cat ? (await getAll('fijos', 'categoriaId', cat.id)).length : 0;

  // Color: el de la categoría, o el primero de la paleta que no esté en uso.
  let color = cat?.color;
  if (!color) {
    const usados = new Set((await listCategorias(ambito))
      .filter((c) => c.tipo === tipo && !c.archivada).map((c) => c.color));
    color = (COLORS.find((c) => !usados.has(c.hex)) ?? COLORS[0]).hex;
  }

  // ---------- Campos ----------
  const errs = fieldErrors(['nombre', 'emoji', 'color']);
  const nombreInput = h('input', {
    id: 'c-nombre', class: 'input', type: 'text', maxlength: NOMBRE_MAX, autocomplete: 'off',
    enterkeyhint: 'done', placeholder: 'Ej: Mascotas', value: cat?.nombre ?? null,
  });
  const emojiInput = h('input', {
    id: 'c-emoji', class: 'input input-emoji', type: 'text', autocomplete: 'off',
    enterkeyhint: 'done', value: cat?.emoji ?? '📦',
  });
  errs.bind('nombre', nombreInput);
  errs.bind('emoji', emojiInput);

  const pvEmoji = h('span', { class: 'chip-emoji' });
  const pvName = h('span', { class: 'chip-name' });
  const preview = h('div', { class: 'chip chip-preview', 'aria-hidden': 'true' }, pvEmoji, pvName);
  function pintarPreview() {
    preview.style.setProperty('--cat', safeColor(color));
    pvEmoji.textContent = emojiInput.value.trim() || '❔';
    pvName.textContent = nombreInput.value.trim() || 'Nombre';
    for (const b of emojiGrid.children) b.setAttribute('aria-pressed', String(b.dataset.emoji === emojiInput.value.trim()));
  }

  const emojiGrid = h('div', { class: 'emoji-grid' }, EMOJIS.map((e) => h('button', {
    type: 'button', class: 'emoji-btn', 'data-emoji': e, 'aria-label': `Usar ${e}`,
    onClick: () => { emojiInput.value = e; errs.clear('emoji'); pintarPreview(); },
  }, e)));

  const swatches = h('div', { class: 'swatches' }, COLORS.map((c) => h('label', { class: 'swatch', style: `--cat:${c.hex}`, title: c.nombre },
    h('input', {
      type: 'radio', name: 'color', value: c.hex, checked: c.hex === color, 'aria-label': c.nombre,
      onChange: () => { color = c.hex; errs.clear('color'); pintarPreview(); },
    }))));

  nombreInput.addEventListener('input', pintarPreview);
  emojiInput.addEventListener('input', pintarPreview);

  const tipoField = cat
    ? h('p', { class: 'muted' }, `Categoría de ${TIPO_LABEL[tipo]}. El tipo no se puede cambiar una vez creada.`)
    : h('fieldset', { class: 'seg-tipo' },
      h('legend', { class: 'sr-only' }, 'Tipo de categoría'),
      ...['gasto', 'ingreso'].map((t) => h('label', { class: `seg-opt seg-${t}` },
        h('input', { type: 'radio', name: 'tipo-cat', value: t, checked: t === tipo, onChange: () => { tipo = t; } }),
        h('span', null, t === 'gasto' ? 'De gasto' : 'De ingreso'))));

  // ---------- Acciones ----------
  let sheet;
  const saveBtn = h('button', { class: 'btn btn-primary', type: 'submit' }, cat ? 'Guardar' : 'Crear');

  async function guardar() {
    const data = { id: cat?.id, ambito, tipo, nombre: nombreInput.value, emoji: emojiInput.value, color };
    if (errs.show(validarCategoria(data))) return;
    saveBtn.disabled = true;
    try {
      const rec = await guardarCategoria(data);
      sheet.close();
      notifyDataChanged();
      toast(cat ? 'Categoría actualizada' : `Categoría "${rec.nombre}" creada`);
    } catch (err) {
      if (err instanceof ValidationError) errs.show(err.errors);
      else errs.showGeneral(err);
    } finally {
      saveBtn.disabled = false;
    }
  }

  async function alternarArchivo() {
    const archivar = !cat.archivada;
    try {
      await archivarCategoria(cat.id, archivar);
      sheet.close();
      notifyDataChanged();
      toast(archivar ? `"${cat.nombre}" archivada` : `"${cat.nombre}" está activa otra vez`, {
        action: 'Deshacer',
        duration: 6000,
        onAction: () => archivarCategoria(cat.id, !archivar).then(notifyDataChanged, toastError),
      });
    } catch (err) {
      errs.showGeneral(err);
    }
  }

  async function borrar() {
    try {
      const borrado = await borrarCategoria(cat.id);
      sheet.close();
      notifyDataChanged();
      toast(`"${cat.nombre}" borrada`, {
        action: 'Deshacer',
        duration: 6000,
        onAction: () => restaurarCategoria(borrado).then(notifyDataChanged, toastError),
      });
    } catch (err) {
      errs.showGeneral(err);
    }
  }

  const acciones = cat && h('div', { class: 'danger-zone' },
    h('button', { class: 'btn', type: 'button', onClick: alternarArchivo }, cat.archivada ? 'Desarchivar' : 'Archivar'),
    h('p', { class: 'muted' }, cat.archivada
      ? 'Al desarchivarla vuelve a aparecer al cargar movimientos.'
      : 'Las archivadas no aparecen al cargar movimientos, pero siguen en el historial y en los resúmenes.'),
    usos === 0 && usosFijos === 0 && h('button', { class: 'btn btn-danger-outline', type: 'button', onClick: borrar }, 'Borrar categoría'),
    h('p', { class: 'muted' }, usos > 0
      ? `Tiene ${usos} ${usos === 1 ? 'movimiento' : 'movimientos'}, por eso solo se puede archivar.`
      : usosFijos > 0
        ? `La usa${usosFijos === 1 ? ' un gasto fijo' : `n ${usosFijos} gastos fijos`}, por eso solo se puede archivar.`
        : 'Se puede borrar porque no tiene movimientos.'));

  pintarPreview();
  sheet = openSheet({
    title: cat ? 'Editar categoría' : 'Nueva categoría',
    onSubmit: guardar,
    body: [
      preview,
      tipoField,
      h('div', { class: 'field' }, h('label', { for: 'c-nombre' }, 'Nombre'), nombreInput, errs.els.nombre),
      h('div', { class: 'field' },
        h('label', { for: 'c-emoji' }, 'Emoji'),
        h('p', { class: 'muted hint' }, 'Elegí uno de la lista o escribí cualquiera con el teclado.'),
        emojiInput, emojiGrid, errs.els.emoji),
      h('fieldset', { class: 'field', 'aria-describedby': 'err-color' },
        h('legend', null, 'Color'), swatches, errs.els.color),
      errs.general,
      acciones,
    ],
    footer: [
      h('button', { class: 'btn', type: 'button', onClick: () => sheet.close() }, 'Cancelar'),
      saveBtn,
    ],
  });
  if (!cat) nombreInput.focus();
  return sheet;
}
