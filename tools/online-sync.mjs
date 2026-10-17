// GitHub Action (online-sync.yml): ntfy-Nachrichten seit lastMsgTime in state.json (Branch online-data) mergen.
// Gleiches Modul wie der Client. Aufruf: node tools/online-sync.mjs <pfad/state.json> [--check]
// --check: nichts schreiben, nur prüfen, ob Nachrichten schon zu lange ungemergt auf dem Bus liegen (Exit 1 = Mail).
// Env zum Testen: ONLINE_TOPIC=ruether-go-test-… ONLINE_BUS=https://ntfy.sh
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ONLINE } from '../js/data.js';
import { loadState, merge, readBus, busUrl } from '../js/online-merge.js';

const SEED = new URL('../online/state.seed.json', import.meta.url);
// ntfy hält Nachrichten 12 h. Liegt die älteste ungemergte länger als 10 h dort, steht die Kette (bald gehen Nachrichten verloren).
export const STALE_MS = 10 * 3600_000;

// changed = state.json geschrieben; lagMs = Alter der ältesten Bus-Nachricht, die der Stand noch nicht kannte (0 = keine)
export async function runSync({ statePath, seedPath = SEED, bus = ONLINE.bus, topic = ONLINE.topic, now = Date.now(), write = true }) {
  let raw = await readFile(statePath, 'utf8').catch(() => null);
  if (raw == null) raw = await readFile(seedPath, 'utf8'); // erster Lauf: Startstand aus der alten Higgsfield-Welt
  let state;
  try { state = loadState(JSON.parse(raw || '{}')); } catch { state = loadState(null); } // leere Datei = Zurücksetzen
  const res = await fetch(busUrl({ bus, topic }, state.lastMsgTime));
  if (!res.ok) throw new Error(`ntfy antwortet ${res.status}`);
  const items = await readBus(await res.text(), now);
  const fresh = items.map(i => i.time).filter(t => t > state.lastMsgTime); // Überlappung (BUS_OVERLAP_S) zählt nicht
  const lagMs = fresh.length ? Math.max(0, now - Math.min(...fresh) * 1000) : 0;
  const out = JSON.stringify(merge(state, items), null, 1) + '\n';
  const changed = write && out.trim() !== raw.trim();
  if (changed) await writeFile(statePath, out);
  return { changed, lagMs };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const statePath = process.argv[2] || 'state.json', check = process.argv.includes('--check');
  try {
    const { changed, lagMs } = await runSync({ statePath, write: !check, bus: process.env.ONLINE_BUS || ONLINE.bus, topic: process.env.ONLINE_TOPIC || ONLINE.topic });
    const h = (lagMs / 3600_000).toFixed(1);
    console.log(check ? `älteste ungemergte Nachricht: ${h} h` : changed ? `${statePath} aktualisiert` : 'keine Änderung');
    if (lagMs > STALE_MS) { console.log(`::error::Online-Stand hängt ${h} h hinter dem Bus (ntfy hält 12 h). Läuft die Sync-Kette?`); process.exitCode = 1; }
  } catch (e) {
    // ntfy-Schluckauf soll keine roten Läufe erzeugen; die nächste Runde holt es nach (12 h Puffer)
    console.log(`::warning::Online-Sync übersprungen: ${e.message}`);
  }
}
