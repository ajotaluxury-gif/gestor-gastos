// Colores de categoría (con nombre, para lectores de pantalla) y emojis sugeridos.

export const COLORS = [
  { hex: '#e11d48', nombre: 'Rojo' },
  { hex: '#ea580c', nombre: 'Naranja' },
  { hex: '#d97706', nombre: 'Ámbar' },
  { hex: '#65a30d', nombre: 'Lima' },
  { hex: '#059669', nombre: 'Esmeralda' },
  { hex: '#0891b2', nombre: 'Cian' },
  { hex: '#2563eb', nombre: 'Azul' },
  { hex: '#7c3aed', nombre: 'Violeta' },
  { hex: '#c026d3', nombre: 'Fucsia' },
  { hex: '#db2777', nombre: 'Rosa' },
  { hex: '#0d9488', nombre: 'Verde azulado' },
  { hex: '#64748b', nombre: 'Gris' },
];

export const PALETTE = COLORS.map((c) => c.hex);

export const EMOJIS = [
  '🛒', '🍔', '🍕', '☕', '🍷', '🏠', '💡', '💧', '🔥', '📱', '💻', '🌐',
  '🚌', '🚗', '⛽', '🚕', '✈️', '🏥', '💊', '🦷', '🎓', '📚', '🎉', '🎬',
  '🎮', '🏋️', '⚽', '👕', '👟', '💇', '🐶', '👶', '🎁', '🧹', '🧴', '🌱',
  '💳', '🏦', '🧾', '📦', '🧰', '🛠️', '🖥️', '📣', '🚚', '👥', '🏢', '💼',
  '💰', '💸', '📈', '🪙', '📎', '❓',
];
