import { migrate, emptySaveV3 } from './progress.js';
export const KEY = 'ruether-go';
const BACKUP = 'ruether-go-backup';

export const emptySave = emptySaveV3;

// Rohtext, den dieser Tab zuletzt gelesen oder geschrieben hat. Weicht localStorage ab, hat ein anderer Tab gespeichert.
let known = null;
const raw = () => localStorage.getItem(KEY);

export function load() {
  try {
    known = raw();
    if (!known) return emptySaveV3();
    return migrate(JSON.parse(known));
  } catch {
    return emptySaveV3();
  }
}

// Hat ein anderer Tab (oder die App im zweiten Fenster) seit unserem letzten load/save gespeichert oder zurückgesetzt?
export function changed() {
  try { return raw() !== known; } catch { return false; }
}

// true = gespeichert, false = localStorage gesperrt/voll
export function save(data) {
  try { const s = JSON.stringify(data); localStorage.setItem(KEY, s); known = s; return true; } catch { return false; }
}

// backup: alten Stand unter BACKUP aufheben (Zurücksetzen aus dem Fehler-Splash, falls es doch nicht am Spielstand lag)
export function clear(backup = false) {
  try {
    if (backup && raw()) localStorage.setItem(BACKUP, raw());
    localStorage.removeItem(KEY);
    known = null;
  } catch { /* egal */ }
}
