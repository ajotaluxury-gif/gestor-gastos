// Mini helper para crear DOM sin innerHTML (evita inyectar texto del usuario como HTML).

/**
 * h('button', { class: 'btn', onClick: fn }, 'Texto', otroNodo)
 * - class → className
 * - onXxx (función) → addEventListener('xxx')
 * - true → atributo vacío; false/null/undefined → se omite
 */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else el.setAttribute(key, value === true ? '' : String(value));
  }
  el.append(...children.flat(Infinity)
    .filter((c) => c != null && c !== false)
    .map((c) => (c instanceof Node ? c : String(c))));
  return el;
}

/** Color de categoría seguro para usar en estilos (#rrggbb o gris por defecto). */
export const safeColor = (c) => (/^#[0-9a-f]{6}$/i.test(c ?? '') ? c : '#64748b');

/** Bloque de estado vacío o de "próximamente". */
export function emptyState(icon, title, text) {
  return h('div', { class: 'empty' },
    h('span', { class: 'empty-icon', 'aria-hidden': 'true' }, icon),
    h('p', null, h('strong', null, title)),
    text && h('p', null, text));
}

/** Tarjeta de error que no rompe la pantalla. */
export function errorBox(err, onRetry) {
  return h('div', { class: 'card' },
    h('div', { class: 'status status-error', role: 'alert' },
      h('span', { class: 'status-icon', 'aria-hidden': 'true' }, '⛔'),
      h('div', null,
        h('strong', null, 'Algo salió mal'),
        h('p', null, err?.message || 'Error inesperado.'))),
    onRetry && h('button', { class: 'btn', type: 'button', onClick: onRetry }, 'Reintentar'));
}
