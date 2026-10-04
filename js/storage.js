const KEY = 'ruether-go';

export const emptySave = () => ({ version: 1, caught: {}, team: [], arenasBeaten: [], arenaOwners: {}, victoryShown: false });

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptySave();
    const d = JSON.parse(raw);
    if (!d || d.version !== 1) return emptySave();
    return { ...emptySave(), ...d };
  } catch {
    return emptySave();
  }
}

// true = gespeichert, false = localStorage gesperrt/voll
export function save(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function clear() {
  try { localStorage.removeItem(KEY); } catch { /* egal */ }
}
