# Online-Welt (v8, ohne eigenes Backend)

Higgsfield ist abgeschaltet. Rangliste, Arena-Besitzer, Feed und „online“ laufen jetzt über zwei kostenlose Dienste:

| Teil | Wo | Wer schreibt |
|---|---|---|
| Live-Bus | `https://ntfy.sh/<ONLINE.topic>` (Nachrichten bleiben 12 h) | jedes Spiel, signiert |
| Dauerhafter Stand | `state.json` im Branch `online-data`, gelesen über `ONLINE.snapshotUrl` (raw.githubusercontent.com, ca. 5 min Cache) | nur die GitHub Action |

Topic, Bus und Snapshot-URL stehen in `ONLINE` in `js/data.js`.

## Ablauf

1. **Spiel (`js/online.js`)** lädt beim Start den Snapshot (Cache-Buster pro Minute), dann alle ntfy-Nachrichten seit `lastMsgTime` (30 s Überlappung). Danach pollt es, sobald app.js `fetchState()` aufruft (alle `STATE_POLL` auf Karte und Rangliste). Den Snapshot holt es alle 15 Minuten neu und übernimmt ihn nur, wenn er neuer ist als der zuletzt geladene. Hängt die Action, wirft der Client also nichts weg, was er schon gemergt hat.
2. **Senden:** `sync` (Spielerstand) höchstens alle 5 Minuten und nur bei Änderung. Ausnahmen: Umbenennen geht sofort raus (`syncNow({ force: true })`), und ein noch ausstehender `sync` wird gesendet, sobald die App in den Hintergrund geht (höchstens einmal pro Minute, `fetch` mit `keepalive`). `arena` (Arena erobert) geht nur raus, wenn sich Besitzer oder Stufe ändert; vorher pollt das Spiel einmal, damit es den aktuellen Besitz kennt. `event` (Feed-Eintrag) geht nicht raus, wenn derselbe Text vom selben Spieler in den letzten 24 h schon im Feed steht. Fehler werden geschluckt, dann ist das Spiel eben offline.
3. **GitHub Action** (`.github/workflows/online-sync.yml`) läuft als Kette: Ein Lauf (Job `sync`) liest etwa alle 5 Minuten `state.json` aus `online-data`, holt die ntfy-Nachrichten seit `lastMsgTime`, prüft und merged sie mit `tools/online-sync.mjs` und commitet nur bei Änderungen als `github-actions[bot]`. Nach knapp 6 Stunden (GitHub-Grenze pro Job) startet er sich selbst per `workflow_dispatch` neu; das darf das `GITHUB_TOKEN` (`permissions: actions: write`). Die `concurrency`-Gruppe `online-sync` sorgt dafür, dass nie zwei Läufe gleichzeitig mergen. Der stündliche Cron (Job `watch`) ist nur die Absicherung, siehe „Überwachung“.
4. Spiel und Action benutzen **dasselbe Modul** `js/online-merge.js` (reine Funktionen: `validate`, `merge`, `toAppState`). Deshalb sehen alle denselben Stand.

## Nachrichten

```
{ v: 1, k: 'sync' | 'arena' | 'event', id, pub, t, d, sig }
```

- Jedes Gerät hat einen eigenen ECDSA-P-256-Schlüssel (WebCrypto) in `localStorage['ruether-go-key']`. Er ist die Online-Kennung, siehe „Kennung und Gerätewechsel“.
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
- `arena`: Der Absender wird Besitzer (nur bekannte Spieler, nur neuer als der aktuelle Besitz). Im Feed steht „hat … erobert (Lv. n) und X rausgeworfen“. Meldet der Besitzer dieselbe Stufe noch mal (Farmen in der eigenen Arena), passiert nichts: kein Feed-Eintrag, „seit“ bleibt.
- `event`: kommt in die letzten 50 Ereignisse. Derselbe Text vom selben Spieler (gleiche Art) innerhalb von 24 h wird weggelassen, damit alte Clients den Feed nicht fluten. Arena-Einträge des Merges sind davon ausgenommen, ein Hin und Her ist eine echte Änderung.
- „Online“: alle mit `sync` in den letzten 10 Minuten.
- Der Merge ist idempotent: Snapshot und Bus dürfen sich überlappen.

## Kennung und Gerätewechsel

- Die Kennung ist `id = SHA-256(pub)` des Geräteschlüssels, nicht der Name. `online.lastState` markiert eigene Arenen (`arenas[id].mine`) und die eigene Zeile der Rangliste (`leaderboard[i].me`) über die Kennung. `online.id` ist die echte Online-ID fürs Profil.
- **Export/Import:** `online.exportKey()` liefert den Schlüssel als Text (JWK), `online.importKey(text)` schreibt ihn auf dem neuen Gerät zurück. Ohne den Schlüssel wäre man dort eine neue Kennung, und der eigene Name gehört schon der alten: `sync`, `arena` und `event` würden still verworfen. Das betrifft auch iOS, wo Safari und die Home-Bildschirm-App getrennten Speicher haben. Der Schlüssel ist privat: Wer den exportierten Spielstand hat, kann unter diesem Namen spielen.
- **Name vergeben:** Gehört der eigene Name online schon einer anderen Kennung (kein Altspieler), ist `online.nameTaken` bzw. `online.lastState.nameTaken` wahr. Das Spiel zeigt dann einen Hinweis zum Umbenennen und sendet keine `arena`- und `event`-Nachrichten mehr, die der Merge ohnehin verwerfen würde.

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

Danach einmal unter Actions „Online-Sync“ → „Run workflow“ starten. Das startet die Kette; spätestens der nächste Cron-Lauf würde sie auch starten.

## Überwachung

- Der Cron (`23 * * * *`, GitHub führt ihn oft nur alle 3–8 h aus) startet den Job `watch`. Er prüft, ob ein Ketten-Lauf läuft oder wartet, und startet sonst einen neuen (Warnung „Sync-Kette lief nicht“).
- Danach prüft er mit `node tools/online-sync.mjs state.json --check`, wie lange die älteste noch nicht gemergte Nachricht schon auf dem Bus liegt. Über 10 h endet der Lauf mit Fehler. ntfy hält Nachrichten nur 12 h, danach wären sie verloren.
- Die Fehler-Mail geht an den, der die Cron-Zeile zuletzt geändert hat (bei geplanten Läufen). Läufe der Kette startet `github-actions[bot]`, deren Fehler mailt GitHub niemandem; darum prüft der Cron-Lauf.
- Kette anhalten: Workflow unter Actions deaktivieren („Disable workflow“). Einen einzelnen Lauf abbrechen reicht nicht, der Cron startet die Kette wieder.

## Zurücksetzen

- **Alles leeren:** `state.json` im Branch `online-data` leer committen (0 Bytes oder `{}`). Die Action fängt dann bei null an. Nachrichten der letzten 12 h vom Bus kommen beim nächsten Lauf wieder hinein.
- **Zurück auf den Startstand:** `state.json` im Branch löschen. Der nächste Lauf nimmt wieder `online/state.seed.json`.
- **Neues Topic** (z. B. bei Spam): `ONLINE.topic` in `js/data.js` ändern. Die Action liest es von `main`.

## Testen

- Lokal (localhost, 127.0.0.1) ist das Spiel offline.
- `?online=ruether-go-test-<zufall>` an die URL hängen: eigenes ntfy-Topic, ohne Snapshot. Andere Werte werden ignoriert, damit lokale Tests nie ins echte Topic schreiben.
- Action gegen ein Test-Topic: `ONLINE_TOPIC=ruether-go-test-<zufall> node tools/online-sync.mjs /tmp/state.json` (mit `--check` nur prüfen, Exit 1 bei über 10 h Rückstand)
- Unit-Tests: `node --test test/online.test.mjs` (fetch gemockt, echte WebCrypto-Signaturen).

## Grenzen

- ntfy.sh ohne Konto erlaubt **250 Nachrichten am Tag pro IP** (ein Haushalt im selben WLAN teilt sich das, `curl https://ntfy.sh/v1/account` zeigt den Verbrauch). Das Spiel sendet `sync` deshalb höchstens alle 5 Minuten (`SYNC_MIN_MS`) und nur bei Änderung, das sind höchstens 12 pro Stunde und Gerät (dazu höchstens eine pro Minute beim Verlassen der App); `arena` und `event` kommen dazu, aber nur bei echter Änderung. Ist das Kontingent leer, gehen Nachrichten still verloren, bis ntfy wieder annimmt.
- „Online“ heißt: in den letzten 10 Minuten einen `sync` gesendet. Wer die App offen hat, aber nichts ändert, sendet nichts und gilt danach als offline (ein Herzschlag würde Kontingent kosten).
- Das Topic ist öffentlich. Wer es kennt, kann mitlesen und eigene, gültig signierte Spieler anlegen. Für ein Spiel unter Freunden reicht das.
- Die Kette belegt rund um die Uhr einen Runner. Das ist nur in öffentlichen Repos kostenlos; in einem privaten Repo wären die Freiminuten nach gut einem Tag weg.
- GitHub pausiert geplante Workflows nach 60 Tagen ohne Aktivität im Repo, dann steht auch die Kette. Unter Actions wieder einschalten und einmal „Run workflow“.
- Läuft gar kein Lauf länger als 12 h (GitHub-Störung, Workflow deaktiviert), gehen die Nachrichten dazwischen verloren, weil ntfy sie nur 12 h hält. Die Überwachung meldet das ab 10 h Rückstand, solange der Cron noch läuft.
