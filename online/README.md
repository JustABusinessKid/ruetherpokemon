# Online-Welt (v8, ohne eigenes Backend)

Higgsfield ist abgeschaltet. Rangliste, Arena-Besitzer, Feed und „online“ laufen jetzt über zwei kostenlose Dienste:

| Teil | Wo | Wer schreibt |
|---|---|---|
| Live-Bus | `https://ntfy.sh/<ONLINE.topic>` (Nachrichten bleiben 12 h) | jedes Spiel, signiert |
| Dauerhafter Stand | `state.json` im Branch `online-data`, gelesen über `ONLINE.snapshotUrl` (raw.githubusercontent.com, ca. 5 min Cache) | nur die GitHub Action |

Topic, Bus und Snapshot-URL stehen in `ONLINE` in `js/data.js`.

## Ablauf

1. **Spiel (`js/online.js`)** lädt beim Start den Snapshot (Cache-Buster pro Minute), dann alle ntfy-Nachrichten seit `lastMsgTime` (30 s Überlappung). Danach pollt es, sobald app.js `fetchState()` aufruft (alle `STATE_POLL` auf Karte und Rangliste). Den Snapshot lädt es alle 15 Minuten neu.
2. **Senden:** `sync` (Spielerstand) höchstens alle 5 Minuten und nur bei Änderung. `arena` (Arena erobert) und `event` (Feed-Eintrag) gehen sofort raus. Fehler werden geschluckt, dann ist das Spiel eben offline.
3. **GitHub Action** (`.github/workflows/online-sync.yml`, alle 15 Minuten und per Hand über „Run workflow“) liest `state.json` aus `online-data`, holt die ntfy-Nachrichten seit `lastMsgTime`, prüft und merged sie mit `tools/online-sync.mjs` und commitet nur bei Änderungen als `github-actions[bot]`.
4. Spiel und Action benutzen **dasselbe Modul** `js/online-merge.js` (reine Funktionen: `validate`, `merge`, `toAppState`). Deshalb sehen alle denselben Stand.

## Nachrichten

```
{ v: 1, k: 'sync' | 'arena' | 'event', id, pub, t, d, sig }
```

- Jedes Gerät hat einen eigenen ECDSA-P-256-Schlüssel (WebCrypto) in `localStorage['ruether-go-key']`.
- `pub` ist der öffentliche Schlüssel (raw, base64url), `id = base64url(SHA-256(pub))`.
- `sig` signiert die kanonische JSON-Form von `{v,k,id,t,d}` (Schlüssel sortiert, kein Leerraum).
- Geprüft wird: Signatur, `id` passt zu `pub`, Größe ≤ 3500 Bytes, `t` höchstens 5 Minuten in der Zukunft, Schema von `d` wie bei der alten API:
  - `sync`: Nickname 2–16 Zeichen (Steuerzeichen raus), Avatar und Anführer aus den bekannten Rüthern und Seltenheiten, Anführer-Level 1–20, Zahlen werden begrenzt.
  - `arena`: bekannte Arena, Level 1–5, gültiger Anführer.
  - `event`: Art aus `catch`, `level`, `quest`, `fusion`, `achievement`, Text 3–120 Zeichen. Der Feed zeigt ihn nur als Text.
- Tokens aus dem Spielstand werden nie gesendet.

## Merge-Regeln

- `sync` legt den Spieler unter seiner `id` an oder aktualisiert ihn (ältere Nachrichten werden ignoriert).
- **Ein Nickname gehört der ersten id** (Groß-/Kleinschreibung egal). Ein zweites Gerät mit demselben Namen taucht nicht auf. Ausnahme: Altspieler aus der Higgsfield-Zeit (`legacy:<nick>`). Das erste neue Gerät mit diesem Namen übernimmt ihn samt Arenen.
- `arena`: Der Absender wird Besitzer (nur bekannte Spieler, nur neuer als der aktuelle Besitz). Im Feed steht „hat … erobert (Lv. n) und X rausgeworfen“.
- `event`: kommt in die letzten 50 Ereignisse.
- „Online“: alle mit `sync` in den letzten 10 Minuten.
- Der Merge ist idempotent: Snapshot und Bus dürfen sich überlappen.

## Startstand

`online/state.seed.json` kommt aus der alten Higgsfield-D1 und wurde nur lesend abgefragt (`higgsfield website db query 24a00b5a-fde0-4364-872f-dd4f609d5b37 --sql "SELECT nickname, avatar, … FROM players"` usw., ohne die Spalte `token`).

- Spieler bekommen die id `legacy:<nick>`. Doppelte Nicknames sind zusammengefasst, es gilt der neueste Stand.
- Dazu kommen die Arena-Besitzer und die letzten 50 Ereignisse. Der doppelte Name vorn im Text ist entfernt.

Fehlt `state.json` im Branch, startet die Action mit diesem Seed.

## Branch `online-data` anlegen (einmalig)

Über einen eigenen Worktree, damit der Arbeitsstand in `main` unberührt bleibt (Git ≥ 2.42):

```
git worktree add --orphan -b online-data ../ruether-online-data
cp online/state.seed.json ../ruether-online-data/state.json
git -C ../ruether-online-data add state.json
git -C ../ruether-online-data commit -m "Online-Stand: Startstand"
git -C ../ruether-online-data push -u origin online-data
git worktree remove ../ruether-online-data
```

Danach einmal unter Actions „Online-Sync“ → „Run workflow“ starten.

## Zurücksetzen

- **Alles leeren:** `state.json` im Branch `online-data` leer committen (0 Bytes oder `{}`). Die Action fängt dann bei null an. Nachrichten der letzten 12 h vom Bus kommen beim nächsten Lauf wieder hinein.
- **Zurück auf den Startstand:** `state.json` im Branch löschen. Der nächste Lauf nimmt wieder `online/state.seed.json`.
- **Neues Topic** (z. B. bei Spam): `ONLINE.topic` in `js/data.js` ändern. Die Action liest es von `main`.

## Testen

- Lokal (localhost, 127.0.0.1) ist das Spiel offline.
- `?online=ruether-go-test-<zufall>` an die URL hängen: eigenes ntfy-Topic, ohne Snapshot. Andere Werte werden ignoriert, damit lokale Tests nie ins echte Topic schreiben.
- Action gegen ein Test-Topic: `ONLINE_TOPIC=ruether-go-test-<zufall> node tools/online-sync.mjs /tmp/state.json`
- Unit-Tests: `node --test test/online.test.mjs` (fetch gemockt, echte WebCrypto-Signaturen).

## Grenzen

- ntfy.sh ohne Konto erlaubt **250 Nachrichten am Tag pro IP** (ein Haushalt im selben WLAN teilt sich das, `curl https://ntfy.sh/v1/account` zeigt den Verbrauch). Das Spiel sendet `sync` deshalb höchstens alle 5 Minuten (`SYNC_MIN_MS`), das sind höchstens 12 pro Stunde und Gerät; `arena` und `event` kommen dazu. Ist das Kontingent leer, gehen Nachrichten still verloren, bis ntfy wieder annimmt.
- Das Topic ist öffentlich. Wer es kennt, kann mitlesen und eigene, gültig signierte Spieler anlegen. Für ein Spiel unter Freunden reicht das.
- GitHub pausiert geplante Workflows nach 60 Tagen ohne Aktivität im Repo. Dann unter Actions wieder einschalten.
- Läuft die Action länger als 12 h nicht, gehen die Nachrichten dazwischen verloren, weil ntfy sie nur 12 h hält.
