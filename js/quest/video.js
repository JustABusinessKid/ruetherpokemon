// v13 §3: echte Clips aus Moshes Anzeige in der Fangszene (vids/moshe-01.mp4 … moshe-09.mp4, je 40 s).
// pickVideo braucht kein DOM: Host und Gast mischen die Reihenfolge aus demselben st.setup.seed, innerhalb einer Quest wiederholt sich kein Video.
// mountVideo baut das <video> in den Handy-Rahmen (view.js videoScene) und meldet das Ende genau einmal: ended, error (auch 404 und
// Browser ohne H.264), stalled ohne Fortschritt. later = Quest-Timer aus view.js (stop() räumt sie ab).
import { seededRng } from '../quests.js';

export const VIDEO_COUNT = 9;
export const SKIP_MS = 20000, SAFETY_MS = 45000, FAIL_MS = 1000; // Überspringen ab 20 s Wanduhr, Sicherheitsnetz 45 s, Fehler beenden nach 1 s
export const videoSrc = i => `vids/moshe-${String(i + 1).padStart(2, '0')}.mp4`;

// Index des count-ten Videos einer Quest (count ab 1): per seed gemischte Reihenfolge, nach n Videos von vorn
export function pickVideo(seed, count, n = VIDEO_COUNT) {
  const rng = seededRng(seed), order = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  return order[Math.max(0, (count | 0) - 1) % n];
}

// Vorladen beim Quest-Start: landet im Laufzeit-Cache des Service Workers (sw.js, 'ruether-vids'), sonst im Browser-Cache
export function warmVideo(src) { try { fetch(src).catch(() => {}); } catch { /* kein fetch */ } }

// Ton nach sound; lehnt der Browser play() mit Ton ab, läuft es stumm und tap() (erster Tipp) schaltet den Ton an.
// Chrome meldet stalled auch bei vollem Puffer, darum beendet stalled nur ohne Fortschritt nach FAIL_MS.
export function mountVideo(frame, src, { sound = false, later = (fn, ms) => setTimeout(fn, ms), onEnd }) {
  const v = frame.ownerDocument.createElement('video');
  v.playsInline = true; v.preload = 'auto'; v.muted = !sound; v.src = src;
  let done = false;
  const end = reason => { if (done) return; done = true; v.pause(); onEnd?.(reason); };
  const fail = () => later(() => end('error'), FAIL_MS);
  v.addEventListener('ended', () => end('ended'));
  v.addEventListener('error', fail);
  v.addEventListener('stalled', () => { const t = v.currentTime; later(() => { if (!done && v.currentTime === t) end('error'); }, FAIL_MS); });
  frame.append(v);
  v.play().catch(() => { v.muted = true; v.play().catch(fail); });
  return { el: v, tap() { if (sound && v.muted) v.muted = false; }, stop() { done = true; v.pause(); } };
}
