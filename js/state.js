// Estado global mínimo: ámbito actual y mes visible.
import { getMeta, setMeta } from './db.js';
import { currentMonth } from './dates.js';

export const AMBITOS = {
  personal: { id: 'personal', label: 'Personal' },
  negocio: { id: 'negocio', label: 'Negocio' },
};

const state = {
  ambito: 'personal',
  mes: currentMonth(),
};

const subscribers = new Set();

export const getState = () => ({ ...state });

export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

function emit() {
  const snapshot = getState();
  for (const fn of subscribers) fn(snapshot);
}

export async function loadState() {
  const ambito = await getMeta('ambitoActual', 'personal');
  if (AMBITOS[ambito]) state.ambito = ambito;
}

export async function setAmbito(ambito) {
  if (!AMBITOS[ambito] || ambito === state.ambito) return;
  state.ambito = ambito;
  emit();
  try {
    await setMeta('ambitoActual', ambito);
  } catch (e) {
    // No es grave: solo no se recuerda para la próxima vez.
    console.warn('No se pudo guardar el ámbito', e);
  }
}

export function setMes(mes) {
  if (mes === state.mes) return;
  state.mes = mes;
  emit();
}
