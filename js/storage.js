import { migrate, emptySaveV3 } from './progress.js';
const KEY = 'ruether-go';

export const emptySave = emptySaveV3;

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptySaveV3();
    return migrate(JSON.parse(raw));
  } catch {
    return emptySaveV3();
  }
}

// true = gespeichert, false = localStorage gesperrt/voll
export function save(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); return true; } catch { return false; }
}

export function clear() {
  try { localStorage.removeItem(KEY); } catch { /* egal */ }
}
