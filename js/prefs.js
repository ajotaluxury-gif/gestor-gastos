// Personalización: tema (auto/claro/oscuro), color de cada ámbito y tamaño de letra.
// Se guarda en la base (viaja en el backup) y se copia a localStorage para aplicarlo antes de pintar.
import { getMeta, setMeta } from './db.js';

/** Colores de acento. En claro, texto blanco sobre el acento; en oscuro, texto oscuro (contraste ≥ 4.5:1). */
export const ACENTOS = {
  turquesa: { nombre: 'Turquesa', light: ['#0f766e', '#ffffff', '#ccfbf1'], dark: ['#2dd4bf', '#04201c', '#123a36'] },
  indigo: { nombre: 'Índigo', light: ['#4f46e5', '#ffffff', '#e0e7ff'], dark: ['#a5b4fc', '#111536', '#252a52'] },
  violeta: { nombre: 'Violeta', light: ['#7c3aed', '#ffffff', '#ede9fe'], dark: ['#c4b5fd', '#1e0b4b', '#2e1f5e'] },
  rosa: { nombre: 'Rosa', light: ['#be185d', '#ffffff', '#fce7f3'], dark: ['#f9a8d4', '#3d0a24', '#4a1530'] },
  naranja: { nombre: 'Naranja', light: ['#c2410c', '#ffffff', '#ffedd5'], dark: ['#fdba74', '#3b1a05', '#43260f'] },
  verde: { nombre: 'Verde', light: ['#15803d', '#ffffff', '#dcfce7'], dark: ['#86efac', '#052e16', '#123a24'] },
  azul: { nombre: 'Azul', light: ['#1d4ed8', '#ffffff', '#dbeafe'], dark: ['#93c5fd', '#0b1d3f', '#172a4d'] },
  grafito: { nombre: 'Grafito', light: ['#334155', '#ffffff', '#e2e8f0'], dark: ['#cbd5e1', '#0f172a', '#283241'] },
};

export const TEMAS = { auto: 'Automático (como el celular)', light: 'Claro', dark: 'Oscuro' };
export const LETRAS = { normal: ['Normal', '100%'], grande: ['Grande', '112.5%'], enorme: ['Muy grande', '125%'] };

export const DEFAULT = { tema: 'auto', acentoPersonal: 'turquesa', acentoNegocio: 'indigo', letra: 'normal' };

/** Deja solo valores conocidos (lo guardado puede venir de un backup viejo o manipulado). */
export function sanear(p) {
  const r = { ...DEFAULT };
  if (p && typeof p === 'object') {
    if (p.tema in TEMAS) r.tema = p.tema;
    if (p.acentoPersonal in ACENTOS) r.acentoPersonal = p.acentoPersonal;
    if (p.acentoNegocio in ACENTOS) r.acentoNegocio = p.acentoNegocio;
    if (p.letra in LETRAS) r.letra = p.letra;
  }
  return r;
}

let actuales = { ...DEFAULT };
export const getPrefs = () => ({ ...actuales });

const esOscuro = (tema) => tema === 'dark' || (tema === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);

/** Aplica tema, letra y el color del ámbito actual. */
export function aplicarPrefs(prefs = actuales, ambito = document.body.dataset.ambito) {
  const html = document.documentElement;
  const oscuro = esOscuro(prefs.tema);
  html.dataset.theme = oscuro ? 'dark' : 'light';
  html.style.fontSize = LETRAS[prefs.letra][1];
  const acento = ACENTOS[ambito === 'negocio' ? prefs.acentoNegocio : prefs.acentoPersonal] ?? ACENTOS.turquesa;
  const [accent, contrast, soft] = oscuro ? acento.dark : acento.light;
  document.body.style.setProperty('--accent', accent);
  document.body.style.setProperty('--accent-contrast', contrast);
  document.body.style.setProperty('--accent-soft', soft);
  const meta = document.getElementById('theme-color');
  if (meta) meta.content = oscuro ? '#171b20' : '#ffffff';
}

export async function cargarPrefs() {
  actuales = sanear(await getMeta('prefs').catch(() => null));
  try { localStorage.setItem('gg-prefs', JSON.stringify(actuales)); } catch { /* sin localStorage */ }
  return getPrefs();
}

export async function guardarPrefs(cambios) {
  actuales = sanear({ ...actuales, ...cambios });
  try { localStorage.setItem('gg-prefs', JSON.stringify(actuales)); } catch { /* sin localStorage */ }
  aplicarPrefs();
  await setMeta('prefs', actuales);
  return getPrefs();
}
