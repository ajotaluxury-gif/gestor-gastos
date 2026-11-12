// Selector de emojis con buscador y grupos por tema (categorías y metas).
import { h } from './dom.js';
import { GRUPOS, buscarEmojis, crearGrupo } from './emojis.js';

/**
 * @param {{input: HTMLInputElement, onPick?: () => void, idBase: string,
 *          destacados?: {nombre: string, texto: string}}} opts
 *   input: el campo de texto del emoji (se completa al tocar uno; también se puede escribir a mano).
 *   destacados: un grupo extra que se muestra primero (y entra en la búsqueda).
 * @returns {{el: HTMLElement, marcar: () => void}}
 */
export function emojiPicker({ input, onPick, idBase, destacados }) {
  const grupos = destacados ? [crearGrupo(destacados.nombre, destacados.texto), ...GRUPOS] : GRUPOS;
  const buscar = h('input', {
    id: `${idBase}-buscar`, class: 'input', type: 'search', autocomplete: 'off', enterkeyhint: 'search',
    placeholder: 'Buscar: moto, bici, seguro, perro, colegio…', 'aria-label': 'Buscar emoji',
  });
  const lista = h('div', { class: 'emoji-picker', 'aria-live': 'polite' });

  const boton = (it) => h('button', {
    type: 'button', class: 'emoji-btn', 'data-emoji': it.emoji, title: it.palabras.split(' ')[0],
    'aria-label': `${it.palabras.split(' ').slice(0, 3).join(', ')} (${it.emoji})`,
    onClick: () => {
      input.value = it.emoji;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      onPick?.();
    },
  }, it.emoji);

  function pintar() {
    const q = buscar.value.trim();
    if (q) {
      const res = buscarEmojis(q, grupos);
      lista.replaceChildren(res.length
        ? h('div', { class: 'emoji-grid' }, res.map(boton))
        : h('p', { class: 'muted hint' },
          'No encontramos ese. Probá con otra palabra o escribilo en el campo de arriba con el teclado de emojis.'));
    } else {
      lista.replaceChildren(...grupos.map((gr) => h('div', { class: 'emoji-grupo' },
        h('p', { class: 'emoji-grupo-titulo' }, gr.nombre),
        h('div', { class: 'emoji-grid' }, gr.items.map(boton)))));
    }
    marcar();
  }

  function marcar() {
    const actual = input.value.trim();
    for (const b of lista.querySelectorAll('.emoji-btn')) b.setAttribute('aria-pressed', String(b.dataset.emoji === actual));
  }

  buscar.addEventListener('input', pintar);
  // Enter en el buscador no envía el formulario: elige el primer resultado.
  buscar.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    lista.querySelector('.emoji-btn')?.click();
  });
  input.addEventListener('input', marcar);
  pintar();

  return {
    el: h('div', { class: 'emoji-selector' }, buscar, lista,
      h('p', { class: 'muted hint' }, '¿No está el que buscás? Escribilo en el campo de arriba con el teclado de emojis del celular.')),
    marcar,
  };
}
