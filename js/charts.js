// Chart.js: carga diferida (solo cuando hay un gráfico), colores del tema y ciclo de vida.
import { h } from './dom.js';

let loading = null;
let active = [];

/** Carga vendor/chart.umd.min.js una sola vez (queda en la caché del Service Worker). */
export function loadChart() {
  if (globalThis.Chart) return Promise.resolve(globalThis.Chart);
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = './vendor/chart.umd.min.js';
    s.onload = () => {
      const { Chart } = globalThis;
      Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
      resolve(Chart);
    };
    s.onerror = () => {
      loading = null;
      s.remove();
      reject(new Error('No se pudo cargar el gráfico.'));
    };
    document.head.append(s);
  });
  return loading;
}

/** Destruye los gráficos de la vista anterior (llamar antes de cambiar de pantalla). */
export function destroyCharts() {
  for (const c of active) c.destroy();
  active = [];
}

export function themeColors() {
  const s = getComputedStyle(document.body);
  const v = (name) => s.getPropertyValue(name).trim();
  return {
    text: v('--text'), muted: v('--muted'), border: v('--border'), surface: v('--surface'),
    gasto: v('--gasto'), ingreso: v('--ingreso'),
  };
}

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Crea el gráfico cuando el canvas ya está en la página.
 * @param {HTMLCanvasElement} canvas
 * @param {(Chart: any, colors: ReturnType<typeof themeColors>) => any} build
 */
export function mountChart(canvas, build) {
  setTimeout(async () => {
    if (!canvas.isConnected) return;
    try {
      const Chart = await loadChart();
      if (canvas.isConnected) active.push(build(Chart, themeColors()));
    } catch (err) {
      console.error(err);
      canvas.replaceWith(h('p', { class: 'muted' }, err.message));
    }
  });
}
