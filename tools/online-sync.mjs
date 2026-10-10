// GitHub Action (online-sync.yml): ntfy-Nachrichten seit lastMsgTime in state.json (Branch online-data) mergen.
// Gleiches Modul wie der Client. Aufruf: node tools/online-sync.mjs <pfad/state.json>
// Env zum Testen: ONLINE_TOPIC=ruether-go-test-… ONLINE_BUS=https://ntfy.sh
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ONLINE } from '../js/data.js';
import { loadState, merge, readBus, busUrl } from '../js/online-merge.js';

const SEED = new URL('../online/state.seed.json', import.meta.url);

// true = state.json geschrieben, false = nichts geändert
export async function runSync({ statePath, seedPath = SEED, bus = ONLINE.bus, topic = ONLINE.topic, now = Date.now() }) {
  let raw = await readFile(statePath, 'utf8').catch(() => null);
  if (raw == null) raw = await readFile(seedPath, 'utf8'); // erster Lauf: Startstand aus der alten Higgsfield-Welt
  let state;
  try { state = loadState(JSON.parse(raw || '{}')); } catch { state = loadState(null); } // leere Datei = Zurücksetzen
  const res = await fetch(busUrl({ bus, topic }, state.lastMsgTime));
  if (!res.ok) throw new Error(`ntfy antwortet ${res.status}`);
  const out = JSON.stringify(merge(state, await readBus(await res.text(), now)), null, 1) + '\n';
  if (out.trim() === raw.trim()) return false;
  await writeFile(statePath, out);
  return true;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const statePath = process.argv[2] || 'state.json';
  try {
    const changed = await runSync({ statePath, bus: process.env.ONLINE_BUS || ONLINE.bus, topic: process.env.ONLINE_TOPIC || ONLINE.topic });
    console.log(changed ? `${statePath} aktualisiert` : 'keine Änderung');
  } catch (e) {
    // ntfy-Schluckauf soll keine roten Läufe erzeugen; nächster Lauf holt es nach (12 h Puffer)
    console.log(`::warning::Online-Sync übersprungen: ${e.message}`);
  }
}
