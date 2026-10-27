# Rüther GO v13: Moshe spielbar, echte Videos, Zusammen spielen über Internet

Stand 2026-10-27. Baut auf v12 (`2026-10-27-ruether-go-v12-moshe-hillel-design.md`) und v11 (`2026-10-17-ruether-go-multiplayer-design.md`) auf. Entscheidungen von Sebi: feste Fähigkeiten „Der Investment-Code“ und „Sein neues Video“; Pool „12 Personen bestellen gerade“, „Der Zinseszins“, „Premium-Geschenk: Immobilien“; Videos aus `moshehillelvids.zip` (9 Clips) statt der gezeichneten Szene, Überspringen erst nach 20 s; Koop auch über Entfernung.

## §0 Grundsätze

- Wie v12 §0: Der Witz geht auf den Abzock-Shop und das Genre der KI-Werbevideos, nie auf Juden. Das Wort „jüdisch“ kommt in Code, Texten und Tests nicht vor (der Wortfilter-Test aus v12 läuft weiter). Keine religiösen Symbole. Moshes Bild würdevoll. Die Shop-Seite redet von Talmud und „jüdischem Investment-Code“; das übernehmen wir nicht, wir nehmen nur die Shop-Mechanik (Garantie, „12 Personen schließen gerade ihre Bestellung ab“, Geschenke, Zinseszins als „achtes Weltwunder“, Reihenhaus-Prospekt).
- Die Videos sind echte Clips aus Moshes Anzeige. Sie werden nur gekürzt und verkleinert, nicht verfremdet, nicht untertitelt, nicht kommentiert. Sie liegen gekürzt in `vids/` im Repo (Sebi weiß, dass das Repo öffentlich ist). `moshehillelvids.zip` kommt in `.gitignore`.
- Lazy, aber korrekt: bestehende Primitive der Quest-Engine wiederverwenden, keine neuen Abstraktionen, kurze Diffs, Muster der Nachbarn (v10-Fähigkeiten, Raubkopie, Kurs-Alarm, VP-Auftritt, Kieser-Szene).

## §1 Moshe als Quest-Charakter

**Freischaltung.** `questLog.rabino.wins >= 3` (progress.js zählt `wins` schon bei jedem `result === 'success'`, Solo, Koop-Host, Koop-Gast und Rennen). Kein neues Spielstand-Feld, keine Migration:

```js
// js/progress.js neben questsUnlocked
export const MOSHE_WINS = 3;
export const mosheUnlocked = save => nat(save.questLog?.rabino?.wins) >= MOSHE_WINS;
export const mosheInst = save => { const w = nat(save.questLog?.rabino?.wins); return { uid: 'moshe', id: 'moshe', rarity: w >= 15 ? 'legendaer' : w >= 10 ? 'episch' : w >= 6 ? 'selten' : 'normal', level: Math.min(20, Math.max(1, w)) }; };
```

Moshe wird mit jedem Raubzug stärker (Level = Siege, Seltenheit ab 6/10/15 Siegen), ohne eigenes Feld.

**Definition.** `js/data.js`: `export const QUEST_UNITS = { moshe: { id: 'moshe', name: 'Moshe Hillel', title: 'Rabino Empire', btc: 100, attacks: [] } }`. NICHT in `RUETHERS` (sonst Dex, Spawns, Onboarding, `all_five`, `cleanBox`). `makeFighter(QUEST_UNITS.moshe, mosheInst(save))` liefert alles, was `createQuest` braucht (`js/battle.js:9–15` braucht nur id/name/btc, uid/rarity/level).

**Porträt.** Ein gemeinsamer Helfer `portraitOf(id)` in `js/data.js` (oder `js/ui.js`): `RUETHER_BY_ID[id] ? sprites/<id>.png : QUEST_UNITS[id] ? sprites/moshe.png : null`. Ersetzt die drei gleichen Gates `face` (view.js:42), `spriteOf` (screens.js:25), `sprite` (lobby.js:44). `sprites/moshe.png` 256×256 wie die Rüther-Sprites, aus `art/boss-moshe.png` abgeleitet (§5). Überall, wo `RUETHER_BY_ID[x.id]` für Name/Def nachgeschlagen wird, gilt `RUETHER_BY_ID[id] || QUEST_UNITS[id]`: view.js start (2040–2044), screens.js Team-Wahl (581), Ergebnis-Screen (645), app.js launchQuest (960), questFighters (1033).

**Team-Wahl** (screens.js createQuestTeamScreen): wenn `mosheUnlocked(save)`, hängt die Liste `mosheInst(save)` hinter die Box-Exemplare (Zeile „Moshe Hillel · Rabino Empire“, Level/Seltenheit aus der Instanz, Porträt, seine 3 Fähigkeiten über `powers('moshe')`). Auswahl wie jedes Exemplar innerhalb `CONST.TEAM_SIZE`. `save.team` darf die uid `'moshe'` enthalten; alle anderen Leser von `save.team` (Arena `teamInstances`, Profil-Leader, Online-Leader, `upgradeToV3`-Filter gegen die Box) müssen `'moshe'` stillschweigend überspringen (prüfen: app.js 121–137, 583–586; screens.js 751; progress.js 397). Einfacher: Moshe wird NICHT in `save.team` gespeichert, sondern in `save.questTeam` … nein: keine neuen Felder. Lösung: die Team-Wahl speichert Moshe in `save.team` wie jede uid, und `instById` liefert für `'moshe'` die Pseudo-Instanz nur dort, wo Quests gemeint sind (`launchQuest`, `questFighters`); `teamInstances` für die Arena filtert `'moshe'` raus (eine Zeile), Profil-/Online-Leader nehmen den ersten echten Rüther. Solo-Missionen (`solo: 'viktor'` usw.) bleiben ohne ihn.

**Start.** app.js launchQuest: uid `'moshe'` → `mosheInst(save)` statt `instById`; Kämpfer `makeFighter(QUEST_UNITS.moshe, inst)` + `loadoutFor(save, 'moshe')`. Ergebnis-Screen zeigt ihn mit Porträt und Namen.

**Fähigkeiten kaufen/aufwerten.** Sammlung (screens.js createCollectionScreen): nach den Rüther-Karten eine Moshe-Karte, nur wenn `mosheUnlocked`, mit Porträt, „Lv. N · Seltenheit“, „Siege in Rabino Empire HQ: N“ und `abilityBox('moshe')` (rid-generisch, wie bei den Rüthern). `buyAbility`/`upgradeAbility` (progress.js 196/206): `if (rid === 'moshe' && !mosheUnlocked(save)) return { ok: false, reason: 'gesperrt' }`, Toast-Text in app.js abilityPaid: „Moshe arbeitet noch nicht für dich. Räume Rabino Empire HQ dreimal aus.“ `cleanQuestAbilities` legt `questAbilities.moshe` automatisch an, sobald `abilities.js` Einträge mit `unit: 'moshe'` hat.

**Rabino Empire HQ mit Moshe im Team.** Erlaubt. Der Gegner-Moshe erwischt den Spieler-Moshe genauso; in der Videoszene schaut dann Moshe sein eigenes Video (das ist der Witz, kein Sonderfall im Code).

**Koop und Rennen** (lobby.js gehört in dieser Runde dem Online-Baustein, siehe §8; der Moshe-Baustein liefert die Patchliste): `refreshPicks` `has(uid)` und das Raster kennen die Pseudo-Instanz, wenn `mosheUnlocked` und `mode !== 'duel'`; `pickOf` funktioniert unverändert (uid/id/rarity/level/loadout); `cleanPicks(list, max, questMode)` lässt `id === 'moshe'` nur bei `questMode` durch (Aufrufe bei `'pick'` und in `cleanStart` geben den Modus mit); app.js `questFighters`: Pick mit `id === 'moshe'` → `makeFighter(QUEST_UNITS.moshe, pick)` statt `duelFighters`; `duel.js duelFighters` verwirft ihn weiter (Arena-Duell ohne Moshe). Beide Geräte brauchen v13 (unbekannte Fähigkeits-ids filtert `createQuest` stumm, dann hätte Moshe beim Partner keine Fähigkeiten, das ist hinnehmbar und wird im Hinweis der Lobby nicht extra erwähnt).

## §2 Fähigkeiten (js/quest/abilities.js, unit 'moshe')

Alle fünf nach dem Muster `A(id, 'moshe', kind, name, 'ab-<id>', stages, texts)`. Preise wie v10 (`CONST.ABILITY_BUY` 1.000, Stufen 2/3 = 2.000/3.000). Pool-Slot wie bei den Rüthern (ein Pool-Platz, drei zur Wahl). Spezialgegner (Stefan, Goebbels, Himmler, Ranger, Moshe, Berater) nur halb so lang (`special: 0.5`, `dur()`). Ids sind global eindeutig und kollidieren nicht mit Event-Typen (`'video'` ist der Fangszenen-Event, daher `neuesvideo`). Zahlen sind Vorgabe, Texte dürfen im Ton nachgeschärft werden, nicht im Inhalt.

### buch · „Der Investment-Code“ · fest
- Ziel `enemy`, range 2, cd 20 s. Stufe 1: `ms 8000`. Stufe 2: `ms 12000`. Stufe 3: `spread 2` (die nächste Wache in 2 Kacheln um das Ziel liest mit, `second(st, e, 2, canTask)`).
- Wirkung: `stun(st, e, 'liest', ms, ev, say, 'bribed')` (Kegel aus, wacht als Patrouille auf, kein Alarm). STUN_TXT `liest` → „liest den Investment-Code“. Sprüche beim Treffer: „4,9 von 5 Sternen?“, „Über 1.000 Millionäre …“, „Kein Füllmaterial, steht hier.“ WAKE: „Kapitel 3 ist stark.“
- Texte: 1 „Drückt einer Wache bis 2 Kacheln das Buch in die Hand. Sie liest 8 s und sieht nichts. Abklingzeit 20 s.“ 2 „Sie liest 12 s. Kapitel 2: ‚Wie ein Kredit wirklich funktioniert.‘“ 3 „Sie empfiehlt es weiter: Die nächste Wache in 2 Kacheln liest mit.“

### neuesvideo · „Sein neues Video“ · fest
- Ziel `self`, r 6, cd 30 s. Stufe 1: `ms 10000`. Stufe 2: `ms 14000, r 7`. Stufe 3: `finger 5000`.
- Wirkung: alle Wachen in r Kacheln (`nearest(st, u, r, canTask, 99)`), die ihn sehen könnten oder nicht (Sichtlinie egal, das Handy ist laut), bekommen `setTask({ kind: 'neuesvideo', ms, cone: false, face: { x: u.x, y: u.y } })`; Kegel aus, Blick auf Moshe. `selfTargets`-Zeile wie bei `mittag`. Stufe 3: beim Task-Ende `stun(st, e, 'finger', 5000, ev, 'SECHS FINGER?!')` (endTask-Zweig). Moshe sagt: „Hallo Freunde, heute zeige ich euch …“. Wachen: „Ist das echt?“, „Warum hat er sechs Finger?“ (nur Stufe 3). view: taskFx mit `phone()` aus draw.js und kleinem Play-Dreieck, STUN_TXT `finger` → „verwirrt“.
- Texte: 1 „Moshe hält das Handy hoch: Alle Wachen in 6 Kacheln schauen 10 s sein neues Video. Spezialgegner halb so lang. Abklingzeit 30 s.“ 2 „14 s und 7 Kacheln. Der Algorithmus liebt ihn.“ 3 „Sechs Finger: Nach dem Video sind sie 5 s verwirrt und sehen nichts.“

### schlange · „12 Personen bestellen gerade“ · Pool
- Ziel `point`, range 6, r 6, cd 30 s. Stufe 1: `ms 10000`. Stufe 2: `ms 14000`. Stufe 3: `block 8000`.
- Wirkung: Wurf wie `kursalarm` (pending, Flugzeit) → am Punkt ein Effekt `{ kind: 'schlange', x, y, until }` (gezeichnet als drei Käufer-Silhouetten hintereinander, Schild „12 Personen vor Ihnen“); alle ruhigen Wachen in r laufen hin und regeln den Andrang (`setTask({ kind: 'schlange', near: {x,y}, ms, cone: false })`, Spruch „Hinten anstellen!“). Stufe 3: zusätzlich `rectEffect(st, 'wall', x, y, 3, 3, 8000)` am Punkt: 8 s kommt keine Wache durch (Einheiten schon; Firewall-Semantik `walkE`).
- Texte: 1 „Stellt an einem Punkt bis 6 Kacheln eine Schlange aus Käufern auf. Ruhige Wachen in 6 Kacheln regeln 10 s den Andrang. Abklingzeit 30 s.“ 2 „14 s. ‚Noch 12 Personen vor Ihnen.‘“ 3 „Die Schlange steht im Gang: 8 s lang kommt keine Wache durch.“

### zinseszins · „Der Zinseszins“ · Pool
- Ziel `self`, cd 40 s. Stufe 1: `ms 20000, times 1`. Stufe 2: `ms 15000`. Stufe 3: `times 2`.
- Wirkung: nur mit Beute (`u.carry > 0`, sonst FAIL „Nichts zu verzinsen.“). Setzt `u.zins = { at: st.time + ms, left: times, ms }`. Im Tick: ist `u.zins.at` erreicht und trägt Moshe noch Beute (nicht flach, nicht erwischt), dann `u.interest = (u.interest || 0) + u.carry`, Event `{ type: 'zins', unit, amount: u.carry }` (view: schwebendes „+1 Sack · Zinseszins“, sfx coin), `left--`, bei `left > 0` nächste Fälligkeit `at += ms`, sonst `u.zins = null`. Liegt Moshe flach oder wird er erwischt, verfällt der laufende Zins (`u.zins = null`); `u.interest` folgt dem, was mit `u.carry` passiert (bleibt bei Beute, die bleibt; weg, wenn die Beute weg ist). Abliefern: überall, wo `st.delivered += u.carry` läuft, kommt `u.interest` dazu und wird genullt. `delivered` darf `objective.total` übersteigen („7/6 Säcke“, mehr Sats über `score`). HUD: Zähler „Zins +N“ am Tragesymbol.
- Texte: 1 „Das achte Weltwunder: Beute, die Moshe 20 s lang trägt, verdoppelt sich einmal. Länger tragen, mehr Risiko. Abklingzeit 40 s.“ 2 „Schon nach 15 s. Der Markt läuft.“ 3 „Verdoppelt sich zweimal: nach weiteren 15 s noch einmal.“

### geschenk · „Premium-Geschenk: Immobilien“ · Pool
- Ziel `enemy`, range 6, cd 30 s. Stufe 1: `ms 20000`. Stufe 2: `ms 30000`. Stufe 3: `family 3`.
- Wirkung: Die Wache gewinnt ein Reihenhaus in Limassol: `setTask({ kind: 'geschenk', to: st.gate, ms, cone: false })` (läuft zum Tor, schaut den Prospekt an, Kegel aus, kommt danach als Patrouille zurück). Spruch: „Ein Reihenhaus! In Limassol!“, am Ende „Boden optional, steht hier.“ Stufe 3: `second(st, e, 3, canTask)` bekommt dieselbe Aufgabe („Die Familie kommt mit.“). view: taskFx mit kleinem Haus-Prospekt (art/ab-geschenk.png) über dem Kopf.
- Texte: 1 „Eine Wache bis 6 Kacheln gewinnt ein Reihenhaus in Limassol (0,00 € statt 4,95 €). Sie läuft zum Tor und schaut es 20 s an. Abklingzeit 30 s.“ 2 „30 s. Mit Blick aufs Meer, sagt der Prospekt.“ 3 „Sie bringt die Familie mit: Die nächste Wache in 3 Kacheln kommt mit zur Besichtigung.“

Für jede Fähigkeit: `NO_TARGET`/`FAIL`-Zeile, `TASK_END`-Text, `enemyOk`/`selfTargets`-Zeile, cast-Case, view-Animation (`ability()`-Switch, `taskFx`), Icon, Test Stufe 1 und Stufe 3 in `test/abilities.test.mjs`-Muster (Anzahl der Fähigkeiten dort 25 → 30, `test/v10.test.mjs` IDS um `moshe`).

## §3 Echte Videos in der Fangszene

- Dateien: `vids/moshe-01.mp4` … `vids/moshe-09.mp4` liegen schon im Repo-Ordner (je 40 s, 480×854, H.264/AAC, faststart, 1,4–1,8 MB, zusammen 16 MB). Nicht neu encodieren.
- Service Worker (`tools/make_sw.py` → `sw.js`): `vids/*.mp4` NICHT in die Precache-Liste; stattdessen ein eigener Laufzeit-Cache `ruether-vids` (cache-first: Treffer aus dem Cache, sonst Netz und `cache.put`), damit ein Release die Videos nicht neu lädt und der erste Start nicht 16 MB zieht. Range-Anfragen: eine volle 200-Antwort aus dem Cache reicht Chrome/Android. `native/build-www.mjs`: Ordner `vids` in die Kopierliste (APK wächst um 16 MB, Videos liegen dann fest in der App). `.gitignore`: `moshehillelvids.zip`.
- `js/quest/view.js videoScene` baut statt Hände/Mund/Sechs-Finger/Untertitel ein `<video playsinline preload="auto" src="vids/moshe-NN.mp4">` in den Handy-Rahmen `.q-cut-phone` (bleibt), `pointer-events: none`. Bleiben: Stempel „Video Nr. N / −1.000 Sats“ (erscheint ab ~5 s), der zuschauende Rüther klein rechts unten mit echtem Gesicht. Entfallen: `.q-cut-hand`, `.q-cut-mouth`, `.q-cut-sub`, der 7-s-Timer. Die Auswahl- und Zeitlogik kommt in ein kleines Modul `js/quest/video.js` ohne DOM-Zwang (`pickVideo(seed, count, n)` → Index aus einer per `seededRng(seed)` gemischten Reihenfolge, `(count − 1) % n`, keine Wiederholung innerhalb einer Quest; Host und Gast sehen dasselbe, weil `st.setup.seed` auf beiden gleich ist), plus die DOM-Bauer, die view.js aufruft.
- Ablauf: Szene startet, Video läuft (Ton nach der Sound-Einstellung; lehnt `play()` den Ton ab, dann stumm starten und beim ersten Tipp Ton an). Überspringen-Knopf `.q-cut-skip` erscheint nach 20 s Wanduhr; vorher tut Tippen nichts (bzw. nur Ton an). Video-Ende (`ended`) beendet die Szene. `error`/`stalled`/404 → Szene nach 1 s beenden (nie Deadlock bei `st.paused`). Sicherheitsnetz: `later(endCut, 45000)`. Ende wie bisher: `.black`, `resume` nach 240 ms; `closeCut`/`stop()` entfernen das Element (pausiert Medien). Koop-Gast spielt sein Video lokal, der Host-Snapshot ohne `st.paused` schließt es (wie heute), der Gast kann nicht selbst überspringen.
- Vorladen: beim Quest-Start mit einem Fänger `catches: 'video'` das erste Video der Reihenfolge per `fetch` anwärmen (landet im Laufzeit-Cache).
- Abnahme im Browser: Playwright-Chromium kann kein H.264; für Video-Prüfungen `channel: 'chrome'` (installiertes Chrome) oder `msedge` nutzen. Prüfen: Tipp bei 10 s schließt nicht, Knopf ab 20 s, Tipp bei 21 s schließt, `ended` bei 40 s schließt, zweites Erwischen zeigt ein anderes Video, fehlende Datei beendet die Szene in ~1 s.

## §4 Zusammen spielen über Internet

Derselbe Lobby-Ablauf wie Nearby, zusätzlich der Weg „Über Internet“ mit Raumcode; Signalisierung über ntfy (eigener Topic-Präfix `ruether-go-rtc-<CODE>`, nie das Welt-Topic), Spielverkehr über WebRTC-DataChannel (STUN + öffentlicher TURN), läuft auch im Browser und auf dem iPhone; Duell/Koop/Rennen bleiben unverändert (nur zwei Latenz-Zahlen im Duell). Entwurf aus der Code-Landkarte (nachgeprüft gegen js/net/link.js, js/lobby.js, js/duel-ui.js, js/quest/view.js, js/online.js):

### §4.1 Transport-Schnittstelle (js/net/online.js, Einhängen in js/net/link.js)

```js
// Was createLink() (link.js:138-140) vom dritten Zweig erwartet; Signatur wie nearbyTransport/localTransport
tr = onlineTransport({ room, net }, cb)
//   room: Raumcode (6 Zeichen aus ROOM_ALPHABET), kommt als createLink-Option (Host hat ihn gewürfelt, Gast eingetippt)
//   net:  { fetch, EventSource, RTCPeerConnection, bus, ice } – alles optional, Vorgabe globalThis.* / ONLINE.bus / ICE;
//         nur für Tests injiziert (wie `plugin` bei nearby), Node hat kein WebRTC und kein EventSource
// cb (von der Hülle, link.js:137): { found(name), up(name, code), down(), data(str), error(code, message) }

tr.start(role, name, peer) → Promise<void>
  // 'host': alte Verbindung/Abo wegräumen (relaunch/finish rufen start OHNE stop, link.js:195-199, 237), neue tid würfeln,
  //         Presence {t:'host', tid, name, at} POSTen (rejectet mit code 'offline' | 'signal'), dann SSE abonnieren (since=30s)
  // 'guest': peer ignorieren (ist bei relaunch der Hostname; der Raum steckt in `room`); SSE abonnieren (since=10m), auf Presence warten
  // wirft synchron Error{code:'webrtc'}, wenn RTCPeerConnection oder EventSource fehlen; Error{code:'offline'}, wenn navigator.onLine === false
  // resolved, sobald das Abo steht; alles Weitere kommt über cb (die Hülle wartet in 'hosting'/'joining', lobby.js:392-399)

tr.send(str) → void
  // if (ch?.readyState === 'open' && ch.bufferedAmount < BUF_MAX) ch.send(str); sonst still verwerfen (Herzschlag merkt es)
  // str ≤ 8000 Zeichen (Hülle zerlegt, link.js:314-317); DataChannel ordered+reliable (Vorgabe von createDataChannel)

tr.stop() → void
  // EventSource schließen, RTCPeerConnection schließen, DataChannel-Handler lösen, Timer löschen, Chunk-Puffer leeren;
  // kein cb.down() mehr für die geschlossene pc (Generationszähler wie `cur` bei nearby, link.js:56)

tr.keepAwake(on) → void      // Browser: navigator.wakeLock.request('screen') / release; bei visibilitychange sichtbar erneut holen
tr.openSettings(to) → void   // nichts

// Pflichten gegenüber der Hülle:
//  cb.found(hostName)       Gast, sobald eine Presence des Hosts da ist → Lobby „Gefunden: X. Verbinde …“
//  cb.up(peerName, room)    genau beim 'open' des DataChannels, vor der ersten cb.data; code = Raumcode → link.code (lobby.js:406)
//  cb.data(str)             jede DataChannel-Nachricht 1:1 (nur Strings; ArrayBuffer verwerfen)
//  cb.down()                'close' des Kanals oder connectionState 'failed'|'closed' der AKTUELLEN pc, höchstens einmal je pc
//                           → Hülle: lose('native') + sofortiges relaunch (link.js:222-226)
//  cb.error(code, message)  asynchron: 'room' (keine Presence), 'connect' (keine Antwort / ICE gescheitert), 'signal' (SSE kommt nicht)
//                           Hülle dedupt 2 s je Code (link.js:290-294); 'connect' ist in der Lobby schon ein Toast (lobby.js:191)
// Wird bei einem Start-Reject von der Hülle gemacht (link.js:180-191): reset, tr.stop(), 'idle', error-Event → Lobby-Popup (lobby.js:175, 188-201)

// Hülle, drei Zeilen (js/net/link.js):
//  :128  createLink({ kind = pickKind(), plugin, channel, lag, timing, room, net } = {})
//  :138  const tr = kind === 'nearby' ? nearbyTransport(…) : kind === 'online' ? onlineTransport({ room, net }, cb) : localTransport(…)
//  :229  retryAt = … (kind !== 'local' ? T.SILENT_MS : T.RETRY_MS)   // online wartet wie nearby 30 s: Abrisse meldet der Kanal selbst (cb.down)
//  :7    PROTO = 2 (siehe lobbyChanges)
// pickKind() (link.js:41-43) bleibt nearby|local; 'online' ist Nutzerwahl, die Lobby übergibt kind explizit.
```

### §4.2 Entwurf

## Dateien und Einhängen
Neu: js/net/online.js mit `onlineTransport({ room, net }, cb)`, `newRoomCode()`, `ROOM_RE`, Konstanten ICE/Timeouts (data.js bleibt unberührt, nur `import { ONLINE } from '../data.js'` für den Bus). link.js bekommt die drei Zeilen aus transportInterface. Keine Bibliothek: fetch (POST), EventSource (Empfang), RTCPeerConnection/RTCDataChannel (Spiel). Danach `python tools/make_sw.py` (sw.js:54 bekommt js/net/online.js), für die APK `node native/build-www.mjs && npx cap sync android`.

## Raumcode
`ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'` (32 Zeichen, ohne 0/O/1/I), 6 Zeichen aus `crypto.getRandomValues` (Fallback Math.random) = 30 Bit, ≈ 10⁹ Räume; `ROOM_RE = /^[A-HJ-NP-Z2-9]{6}$/`. Der Host würfelt ihn in der Lobby (go(true)), der Gast tippt ihn ein; beide geben ihn als createLink-Option `room` mit, der Transport hält ihn für seine Lebensdauer (relaunch/finish behalten den Code, der Host zeigt immer denselben). Jedes neue „Spiel eröffnen“ = neuer Code (die Lobby baut den Link neu). Der Code steht nie in einer URL (kein ?room=, nichts im Verlauf, Teilen nur als Text).

## Signalisierung über ntfy
Topic `ruether-go-rtc-<CODE>` auf ONLINE.bus (data.js:135). Eigener Präfix: kollidiert weder mit ONLINE.topic (data.js:134) noch mit TEST_TOPIC (online.js:13); onlineConfig() wird nicht befragt (sonst wären localhost und die APK tot). Senden wie online.js:97: `fetch(`${bus}/${topic}`, { method: 'POST', body })` ohne Header, 6 s AbortController; Empfang `new EventSource(`${bus}/${topic}/sse?since=…`)`, `onmessage` liefert dieselbe Zeile wie readBus (online-merge.js:103-113): `{ id, time, event:'message', message }`, nur `event === 'message'` zählt, `message` ist JSON-Text. Eigener Mini-Parser (JSON.parse, Objekt mit String-t), nicht readBus (das hängt an validate/Signatur). Dedupe über die ntfy-`id` (Set; EventSource spielt nach einem Reconnect Backlog erneut).

Nachrichten (je ≤ 3500 Byte, sonst Teile `{ t:'c', id, k, n, d }` zu 3000 Zeichen, Empfänger setzt je id zusammen; SDP ohne Audio/Video liegt bei 1,5-3 KB, das Zerlegen ist nur Sicherheitsnetz gegen die ntfy-Grenze von 4 KB):
1. `{ t:'host', tid, name, at }` – Host nach jedem start() (Presence). tid: Zufall je start().
2. `{ t:'offer', id, to: tid, name, sdp, at }` – Gast, als Antwort auf eine Presence. id: Zufall je Offer.
3. `{ t:'answer', id, name, sdp, at }` – Host auf genau ein Offer.
Drei Nachrichten je Verbindungsaufbau, keine Trickle-ICE (Offer/Answer erst nach dem Sammeln), kein Herzschlag über ntfy. Kontingent 250/Tag/IP (online.js:7): eine Runde mit drei Wiederverbindungen kostet 12, plus Welt-sync ≤ 12/h; passt.

Reihenfolge und Filter:
- Host abonniert `since=30s` (deckt den Fall, dass der Gast eine Sekunde vor dem Neustart geboten hat), nimmt nur Offers mit `to === tid` (alte Inkarnationen ignoriert) und nur, solange keine pc offen ist; jedes weitere Offer in der Zeit wird still ignoriert (zweiter Gast: kein Platz, YAGNI).
- Gast abonniert `since=10m`, sammelt Presences 300 ms lang (Backlog), nimmt die jüngste mit `at` ≤ 60 min alt → cb.found(name), Offer an deren tid. Jede später live eintreffende Presence heißt „Host neu gestartet“: laufende pc wegräumen, neues Offer. Antworten nur mit `id` des eigenen aktuellen Offers.
- Nach `open` des Kanals schließen beide die EventSource (nichts mehr nötig, Abo-Limits von ntfy.sh sind unbekannt).

Timeouts (Konstanten in online.js): GATHER_MS 4000 (ICE-Sammeln gedeckelt: nach 'complete' oder spätestens 4 s mit dem, was da ist – ein toter TURN darf den Start nicht aufhalten), ROOM_MS 5000 (Gast: keine Presence → cb.error('room'), Suche läuft weiter, eine spätere Presence löst das Offer aus), ANSWER_MS 20000 (Gast: Offer ohne Answer → cb.error('connect'), pc wegräumen, weiter auf Presence warten), OPEN_MS 20000 (nach gesetzter Answer kein 'open' → beide räumen die pc weg; Host postet erneut Presence, damit der Gast einmal neu bietet; Gast cb.error('connect')), SIGNAL_MS 8000 (kein 'open' der EventSource → cb.error('signal') einmal je start). Nachrichten mit `at` älter als 60 min oder jünger als jetzt + 5 min werden ignoriert.

## WebRTC
`ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turns:openrelay.metered.ca:443?transport=tcp'], username: 'openrelayproject', credential: 'openrelayproject' }]`. STUN und TURN von Anfang an in einer Konfiguration: ICE bevorzugt direkte Pfade (host/srflx) von selbst, Relay nur, wenn nötig; damit gibt es keinen zweiten Versuch und keine zweite Signalisierungsrunde. Gast = Offerer: `pc = new RTCPeerConnection({ iceServers })`, `ch = pc.createDataChannel('ruether')` (ordered true, reliable = Vorgabe; nie maxRetransmits/unordered, die Hülle hat keine Sequenznummern), `setLocalDescription(await createOffer())`, warten bis `iceGatheringState === 'complete'` oder GATHER_MS, dann `pc.localDescription.sdp` posten. Host = Answerer: `setRemoteDescription({ type:'offer', sdp })`, `setLocalDescription(await createAnswer())`, sammeln mit Deckel, Answer posten, `pc.ondatachannel = e => wire(e.channel)`. Beide `wire(ch)`: `onopen → cb.up(peerName, room)` (peerName aus Presence bzw. Offer, auf 40 Zeichen gekürzt), `onmessage → typeof e.data === 'string' && cb.data(e.data)`, `onclose → down()`. `pc.onconnectionstatechange`: 'failed' | 'closed' → down(); 'disconnected' ignorieren (oft kurz, erholt sich; den Rest entscheidet der Herzschlag der Hülle). down() wirkt nur für die aktuelle pc (Generationszähler) und nur einmal. send: `ch.readyState === 'open' && ch.bufferedAmount < 256 KB` – ponytail: kein Rückstau, Verwerfen ist sicher, weil ds/qs volle Schnappschüsse sind und das Ende im qs wiederholt wird (view.js:1955); wer Stau sieht, drosselt COOP.SEND_MS. Nachrichtengröße ≤ 8000 Zeichen (≈ 32 KB) liegt unter jeder DataChannel-Grenze (Chrome/WebView ≥ 256 KB, Firefox 64 KB+), PART bleibt.

## Ablauf Host
1. Lobby: Weg „Über Internet“, Tipp auf „Spiel eröffnen“ → `room = newRoomCode()`, `link = createLink({ kind:'online', room })`, `await link.host(nick)` (Hülle: 'hosting', tr.start('host')).
2. start: Checks (RTCPeerConnection/EventSource vorhanden, navigator.onLine), tid würfeln, Presence POST (Fehler → reject 'offline' bei geworfenem fetch, 'signal' bei !ok/429), EventSource öffnen (since=30s), SIGNAL_MS-Wächter, resolve.
3. Lobby zeigt den Code groß + „Code teilen“ (Wartebildschirm) – der Code ist eine Lobby-Variable, braucht keinen link.code.
4. Offer mit `to === tid` kommt → pc bauen, Answer sammeln (≤ 4 s), POST, OPEN_MS-Wächter.
5. ondatachannel → open → cb.up(gastName, room) → Hülle schickt hello, tauscht sid → 'connected' {name, code: room, again:false}. EventSource schließen.
6. Spiel wie heute. Gast weg (bye) → finish('left') → launch() → start() räumt die pc weg, neue tid, neue Presence, neues Abo: wartet auf den nächsten Gast, Code bleibt.

## Ablauf Gast
1. Lobby: Code eintippen (Feld .mp-room, Großbuchstaben, ROOM_RE), „Beitreten“ → `createLink({ kind:'online', room })`, `await link.join(nick)`.
2. start: Checks, EventSource (since=10m), Wächter ROOM_MS/SIGNAL_MS, resolve → Lobby „Suche Spiel …“.
3. Presence(s) → 300 ms sammeln → jüngste → cb.found(hostName) („Gefunden: Sebi. Verbinde …“) → pc + Kanal + Offer sammeln (≤ 4 s) → POST, ANSWER_MS-Wächter.
4. Answer mit eigener id → setRemoteDescription → ICE → ch.onopen → cb.up(hostName, room) → hello → 'connected'. EventSource schließen.
5. Keine Presence nach 5 s → 'room' (Toast „Kein Spiel mit diesem Code …“), Suche läuft weiter; keine Answer nach 20 s → 'connect' (Toast); der Spieler bricht ab und versucht es neu.

## Wiederverbinden, Herzschlag, Abbruch
Herzschlag bleibt die Hülle (ping 2 s, 6 s → 'lost', Modi pausieren wie heute). Nach 'lost' durch Stille wartet die Hülle mit link.js:229 jetzt auch für online 30 s (SILENT_MS): der Kanal lebt meist noch (Partner im Hintergrund, Tab gedrosselt), das nächste Lebenszeichen ergibt 'connected again' ohne neue Signalisierung. Echter Abriss (ICE 'failed', Kanal 'close') → cb.down() → lose('native') + sofort relaunch → start() räumt auf und signalisiert neu (Host: Presence + Abo; Gast: Abo, Offer auf die nächste Presence). Beide Seiten laufen so bis RECONNECT_MS 60 s, dann disconnected 'timeout' wie heute. Der Gast nimmt beim Wiederverbinden jede Presence im selben Raum (peer-Name ignoriert); der Hallo-Abgleich der Hülle (sid) entscheidet again:true/false. close()/pagehide → bye, stop() → Abo und pc zu. Wake Lock: keepAwake(true) in der Lobby (lobby.js:482) holt im Browser `navigator.wakeLock.request('screen')`, bei visibilitychange sichtbar erneut, keepAwake(false)/stop geben frei.

## Browser vs. App
Browser: Weg „Über Internet“ ist Vorgabe (pickKind() !== 'nearby'); Weg „In der Nähe“ zeigt weiter die APK-Karte (appOnly). App: Vorgabe „In der Nähe“ (nearby), „Über Internet“ wählbar; der Transport läuft im Android-WebView ohne weitere Berechtigung (INTERNET vorhanden, kein CSP, kein Cleartext nötig: ntfy ist https, WebRTC ist kein HTTP). iPhone/Safari: funktioniert im Browser, Hinweis in der APK-Karte („Auf dem iPhone geht es leider nicht“) wird um „… aber über Internet“ ergänzt. Flugmodus: navigator.onLine false → Start-Reject 'offline' → Popup.

## Fehlercodes und Texte (ERR in lobby.js:34-41 ergänzen)
- webrtc (Start-Reject): „Dieser Browser kann keine Direktverbindung (WebRTC). Chrome, Firefox oder die App nehmen.“
- offline (Start-Reject): „Kein Internet. WLAN oder mobile Daten einschalten, Flugmodus aus.“
- signal (Start-Reject oder einmal je Start als Event): „Der Verbindungsdienst (ntfy.sh) antwortet nicht. Kurz warten, dann nochmal.“
- room (Event, Toast, Suche läuft weiter): „Kein offenes Spiel mit diesem Code. Code richtig? Hat dein Mitspieler ‚Spiel eröffnen‘ getippt?“
- connect (Event, vorhandener Toast lobby.js:191-193): Text bleibt („… ich versuche es weiter. Beide die App offen lassen.“); Wartetext nach 40 s (lobby.js:397) nennt für online „Beide auf ‚Abbrechen‘, neuer Code. Im Mobilfunk klappt die Direktverbindung manchmal nicht.“
- Fallback lobby.js:189 ohne Bluetooth, wenn link.kind === 'online': „… Internet prüfen, dann nochmal.“

## Datenschutz
Signalisiert werden nur Nickname, SDP (öffentliche IP wie bei jedem WebRTC-Anruf; Host-Kandidaten sind in Chrome/WebView mDNS-verschleiert) und Zufalls-Kennungen; nie die Online-Kennung/der Geräteschlüssel (online.js wird nicht importiert, kein Signieren), nie Spielstand. Der Raumcode ist das Geheimnis (30 Bit, einmalig je Eröffnung, nicht in URLs); wer ihn innerhalb der 12-h-Aufbewahrung von ntfy errät, sieht Nickname und SDP und könnte als Gast beitreten – dasselbe Vertrauensmodell wie Nearby („wer in der Nähe ist“), dafür schließt der Hallo-Abgleich und das 1:1 der Hülle weitere Teilnehmer aus. Alles Eingehende bleibt Daten von außen: der Transport parst nur Objekte mit String-t, kürzt Namen, prüft `to`/`id`/`at`; Lobby/Koop säubern wie heute.

### §4.3 Änderungen an Lobby, Markup, Texten (Dateien dieses Bausteins: js/net/*, js/lobby.js, index.html, css/app.css, js/duel.js, js/duel-ui.js, README.md, test/net.test.mjs, test/lobby.test.mjs, test/duel.test.mjs; neue .mp-Stile kommen nach css/app.css, nicht nach css/screens.css; die eine Zeile in js/screens.js:721 wird als Patch an die Integration gegeben)

- js/net/link.js:7 — PROTO 1 → 2: v12-Apps (Nearby) bekommen beim Hallo sauber das Versions-Popup (lobby.js:203-210) statt eines hängenden Starts, weil cleanPicks (lobby.js:62-73) jetzt Moshe-Picks durchlässt, die eine alte App verwirft; NEWS sagt ohnehin „Beide brauchen die neue Version“. test/net.test.mjs:39 auf 2 ziehen.
- js/net/link.js:128 — createLink nimmt `room` und `net` entgegen; :138-140 dritter Zweig `kind === 'online' ? onlineTransport({ room, net }, cb)`; :229 `kind !== 'local' ? T.SILENT_MS : T.RETRY_MS`; Kopfkommentar :1-4 um 'online' ergänzen; `import { onlineTransport } from './online.js'`.
- js/lobby.js:5 — `import { createLink, PROTO, pickKind } from './net/link.js'` und `import { newRoomCode, ROOM_RE } from './net/online.js'`.
- js/lobby.js:28 — `appOnly = (kind, search = '') => kind !== 'nearby' && kind !== 'online' && !new URLSearchParams(search).has('slot')`; test/lobby.test.mjs:104-110 ergänzt `assert.equal(appOnly('online', ''), false)`.
- js/lobby.js:30-33 — HINT.online: „Beide brauchen Internet. Wer eröffnet, bekommt einen Raumcode und sagt ihn dem Mitspieler (oder tippt auf ‚Code teilen‘).“; :34-41 ERR um webrtc, offline, signal, room (Texte siehe design); :42 FIX unverändert (nur nearby).
- js/lobby.js:94-130 (HTML) — in .mp-start vor .mp-host ein Segment `<div class="mp-way"><button class="mp-way-btn" data-way="nearby">In der Nähe</button><button class="mp-way-btn" data-way="online">Über Internet</button></div>`, dazu `<input class="mp-room" maxlength="6" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="Raumcode">` (nur Weg online); Hero-Text :100 je Weg („Zwei Handys, kein Internet …“ / „Über Internet, auch weit weg: Einer eröffnet und nennt den Raumcode, der andere tippt ihn ein.“); .mp-app-Text :103-105 um „Über Internet geht es auch hier im Browser und auf dem iPhone.“; :111 .mp-wait um `<p class="mp-wait-code hidden"></p><button class="mp-share hidden">Code teilen</button>`.
- js/lobby.js:138 — `let way = pickKind() === 'nearby' ? 'nearby' : 'online', room = null;` (App: Nearby-Vorgabe, Browser: Internet; nicht gespeichert, YAGNI).
- js/lobby.js:150-162 — ensureLink → `makeLink(roomCode = null)`: `const kind = way === 'online' ? 'online' : pickKind(); if (link && (link.kind !== kind || roomCode) && (link.state === 'idle' || link.state === 'closed')) { link.close(); link = null; } if (link) return link; link = createLink({ kind, lag, room: roomCode }); … Hörer wie heute`; open() (:478) ruft makeLink() ohne Raum.
- js/lobby.js:159 — error-Hörer: quiet auch für 'room' (`… || !ERR[e?.code] || e?.code === 'room'`), damit „Kein Spiel mit diesem Code“ ein Toast bleibt und die Suche weiterläuft.
- js/lobby.js:165-179 go(): vor dem Start im Weg online: `if (globalThis.navigator?.onLine === false) return showError('offline');` Host: `room = newRoomCode()`; Gast: `room = $('.mp-room').value.toUpperCase().replace(/[^A-Z0-9]/g, '')`, bei `!ROOM_RE.test(room)` → `toast('Raumcode: 6 Zeichen, steht beim Gastgeber auf dem Bildschirm.')`; dann `makeLink(room)`; der Rest (link.host/join(nick), showError, armHints) bleibt; :168 nearby-Popup bleibt richtig, weil link.kind dann 'nearby' ist.
- js/lobby.js:189 — Fallback-Text je kind: `link?.kind === 'online' ? 'Internet prüfen, dann nochmal.' : 'Bluetooth aus und wieder an, dann nochmal.'`.
- js/lobby.js:383-399 render(): Segment-Knöpfe `.on` nach way; `.mp-room`, `.mp-wait-code`, `.mp-share` nur bei way === 'online' (Code nur beim Host im Schritt wait); `el.classList.toggle('mp-web', way === 'nearby' && appOnly(link.kind, location.search))` hierher statt nur in open() (:479), damit der Wegwechsel sofort wirkt; wait-Titel Gast online: `Suche Raum ${room} …`; slow-Texte :397-398 je kind (online: „Noch nichts gefunden. Code richtig? Hat dein Mitspieler Internet und ‚Spiel eröffnen‘ getippt?“ / „Verbinden dauert zu lange. Beide auf ‚Abbrechen‘, neuer Code. Im Mobilfunk klappt die Direktverbindung manchmal nicht.“); :396 HINT[link.kind] passt automatisch.
- js/lobby.js:406 — `link.kind === 'online' ? `Raum ${link.code}` : `Code ${link.code}, steht bei euch beiden dasselbe?``.
- js/lobby.js:450-470 Klicks — `mp-way-btn`: `way = t.dataset.way; makeLink(); render();` (nur außerhalb eines Raums); `mp-share`: `const text = `Rüther GO, Zusammen spielen über Internet. Raumcode: ${room}`; navigator.share ? share({ title:'Rüther GO', text }) : clipboard.writeText(text) + toast` (Muster app.js:522, ohne URL).
- js/lobby.js:218-223 exit() — unverändert; closeLink (:211-217) reicht, der nächste go() baut den Link bei Bedarf neu.
- css/screens.css:191-196 — bleibt (.mp-web nur noch im Weg nearby gesetzt); neu `.mp-way { display:flex; gap:8px } .mp-way-btn { flex:1; min-height:48px } .mp-way-btn.on { background: var(--paper-2); box-shadow: 0 0 0 3px var(--amber), var(--shadow-sm) }` (wie .mp-mode.on :220), `.mp-room { width:100%; min-height:56px; text-align:center; text-transform:uppercase; letter-spacing:.2em; font: 700 24px/1 var(--font-pixel); color: var(--ink); background: var(--paper); border: 3px solid var(--ink) }`, `.mp-wait-code { margin:0; font: 700 34px/1.2 var(--font-pixel); letter-spacing:.25em }`, `.mp-share { min-height:48px }`.
- index.html:248 — Untertitel: „Über Bluetooth ohne Internet (nur App) oder über Internet mit Raumcode.“
- js/screens.js:721 — Browser-Untertitel: „Über Internet mit Raumcode. Ohne Netz nur in der Android-App.“ (statt „Nur in der Android-App“).
- js/app.js — keine Änderung: onTogether (:550-556), createLobby (:1008-1020) und startTogether (:1034-1049) sind transportunabhängig; die Spec-Notiz „Einstieg im Browser statt appOnly“ (v13-Spec :80) ist mit appOnly/screens.js:721 erledigt.
- test/lobby.test.mjs:17 — `globalThis.location ??= { search: '?slot=1' }`, sonst wählt die Lobby in Node (pickKind 'local') den Weg online und der Ablauf-Test :53-102 baut keinen local-Link mehr; dazu neuer Test: Weg online + Fake-net (Presence/Offer/Answer über Fake-Bus) → .mp-wait-code zeigt den Code, falscher Code → Toast, Host und Gast sehen „Raum XXXXXX“.
- README.md:47-75 — Abschnitt „Zusammen spielen ohne Netz“ um „… oder über Internet“ (Raumcode-Ablauf, Browser/iPhone ok, Mobilfunk-Hinweis) und den Browser-Test mit zwei Fenstern + Raumcode ergänzen; tools/make_sw.py laufen lassen (sw.js) und native/build-www.mjs (APK).

### §4.4 Spielprotokolle

- js/duel.js:12 LAG_MAX 400 → 800 und js/duel-ui.js:43 LEAD.MAX 450 → 800: die Funkzeit-Gutschrift (duel-ui.js:483) und der Vorlauf des Gasts (duel-ui.js:131) decken sonst nur RTT ≤ ~350 ms; Mobilfunk-Spitzen liegen darüber, dann hat der Gast ein kürzeres Ausweichfenster. Zwei Zahlen, beide lokal (kein PROTO-Thema); test/duel.test.mjs prüft gegen DUEL.LAG_MAX und bleibt grün.
- Sonst keine. Begründung: der DataChannel ist geordnet und zuverlässig (wie Nearby/BroadcastChannel), also brauchen ds/qs keinen Zeitvergleich (duel-ui.js:494-496, view.js:1994-1996); die RTT-Messung des Duells (duel-ui.js:490-493, 558) läuft schon; Koop bleibt bei 200 ms und vollen Schnappschüssen (≈ 50 KB/s Host-Upstream, 4G/5G reicht), Stau fängt der Transport durch Verwerfen bei bufferedAmount > 256 KB ab (ponytail: Delta-Schnappschüsse oder COOP.SEND_MS 300 erst, wenn der Playtest über Mobilfunk ruckelt); Rennen ist 75 B/s. Event-Whitelist für qs und Host-Timeouts auf dready/qr sind Vertrauens-/Robustheitsthemen, die Nearby genauso hat, nicht Teil des Online-Bausteins.

### §4.5 Tests

## Ohne Server (node --test test/*.test.mjs, Muster test/net.test.mjs:12/156-169)
Zwei Fakes in test/net.test.mjs, injiziert über `createLink({ kind: 'online', room, net: { fetch, EventSource, RTCPeerConnection, bus: 'https://bus.test' } })`:
- `fakeBus()`: ein In-Memory-ntfy. `fetch(url, { method:'POST', body })` zählt (`posts: [{ topic, body }]`), liefert `{ ok: true, text: async () => '' }` (oder `ok:false,status:429` bzw. wirft TypeError für die Fehlertests) und stellt `{ id, time, event:'message', topic, message: body }` als `onmessage({ data })` an alle EventSource-Instanzen desselben Topics zu (setTimeout 0); `class EventSource { constructor(url) → url, onopen (sofort), onmessage, onerror, close() }` mit `since`-Backlog aus dem Verlauf des Topics; `subs` zählt offene Abos.
- `fakeRtc()`: `class RTCPeerConnection { constructor(cfg) → iceServers merken; createOffer/createAnswer → { type, sdp: 'fake-' + n }; setLocalDescription (iceGatheringState = 'complete', onicegatheringstatechange); setRemoteDescription paart über eine Registry Offer-sdp ↔ Answer-sdp und ruft beim Antworter `ondatachannel({ channel })`, dann bei beiden `channel.onopen`; connectionState 'connected'; close() → connectionState 'closed', onconnectionstatechange, Kanäle onclose; createDataChannel(label) → { label, readyState, bufferedAmount: 0, send(str) → Gegenstück onmessage({ data: str }) per setTimeout 0, close() } }`. `fail()` auf einer Instanz spielt ICE 'failed'.
Testfälle: (1) host/join über denselben Fake-Bus → beide connected { name, code: room, again:false }, link.code === room, genau 3 POSTs (host, offer, answer), jedes Topic `ruether-go-rtc-<room>` und niemals ONLINE.topic, jeder Body ≤ 3500 Byte, Offer trägt `to` = tid der Presence, Answer die Offer-id; peerFound beim Gast mit Hostnamen; nach connected keine offenen Abos (subs === 0). (2) cb.up vor cb.data: hello geht erst nach 'open' raus und wird nicht verworfen. (3) Nachrichten hin und zurück + 100-KB-Zerlegung (wie net.test.mjs:… über den Fake-Kanal). (4) Kanal close/ICE failed → lost {reason:'native'} → start() erneut (alte pc geschlossen, kein doppeltes cb.up/cb.down, Generationszähler) → neue Presence + neues Offer → connected again:true; Gast nimmt die neue Presence auch mit anderem Hostnamen (peer ignoriert). (5) Start-Reject: ohne RTCPeerConnection → reject .code 'webrtc', state idle, genau ein error-Event; fetch wirft → 'offline'; fetch ok:false → 'signal'. (6) Gast ohne Presence → nach ROOM_MS (per timing/Fake-Timer, mock.timers wie test/online.test.mjs:254) error 'room', Suche läuft weiter: spätere Presence → Offer → connected. (7) Offer ohne Answer → nach ANSWER_MS error 'connect' einmal. (8) Fremdes/Altes ignorieren: Offer mit anderem `to` bekommt keine Answer, Answer mit fremder id wird nicht gesetzt, Presence mit `at` 2 h alt löst kein Offer aus, doppelte ntfy-id einmal. (9) Host nach disconnected 'left' postet neue Presence mit neuer tid und demselben Raum; Gast-stop() schließt Abo und pc. (10) Zerlegen: ein Body > 3500 Byte kommt als `t:'c'`-Teile und wird zusammengesetzt. (11) send bei readyState ≠ 'open' oder bufferedAmount ≥ 256 KB verwirft still. (12) link.js: SILENT_MS gilt für online (Test „SILENT_MS nur bei nearby“ → „nicht bei local“), pickKind bleibt nearby|local, PROTO === 2. Lobby-Tests siehe lobbyChanges (Weg online mit Fake-net, Code-Anzeige, appOnly('online')).

## Echt
1. Zwei Fenster desselben oder verschiedener Browser: `http://localhost:8000/?slot=1` (Host) und `?slot=2` (Gast). Räume laufen auf ihrem eigenen Präfix, `?online=ruether-go-test-…` ist dafür nicht nötig (schadet aber nicht); es wird nie ins Welt-Topic geschrieben. Code vom Host-Fenster ins Gast-Fenster tippen → Duell, Koop (10 min, Datenverbrauch im DevTools-Netzwerk/chrome://webrtc-internals ablesen), Rennen komplett; Tab in den Hintergrund (lost → again ohne neue ntfy-Nachrichten, in ntfy-Topic-Ansicht `https://ntfy.sh/ruether-go-rtc-<CODE>/json?poll=1` nachzählen: 3 je Aufbau), Fenster schließen → Partner nach 60 s disconnected, Host wartet mit demselben Code, Gast mit falschem Code → Toast nach 5 s.
2. Browser ↔ APK: APK bauen (README „Android-App bauen“), Handy erst im selben WLAN (host-Kandidaten), dann auf mobile Daten (Relay-Pfad): in chrome://webrtc-internals bzw. `chrome://inspect` am WebView das gewählte Kandidatenpaar prüfen (relay = TURN greift). Flugmodus kurz an/aus → ICE failed → relaunch → again. Bildschirm sperren im Browser → Wake Lock hält die Lobby wach; in der App wie bisher.
3. Zwei Emulatoren/zwei Handys mit der APK, Weg „Über Internet“, dieselben Fälle; Prüfen bei 390×844 und 375×667 (Codefeld, Segment, Teilen-Knopf, Wartebildschirm).

Echte ntfy-Räume (`ruether-go-rtc-…`) dürfen in Browser-Abnahmen benutzt werden, sparsam (höchstens etwa zehn Raumaufbauten je Prüflauf, das Tageskontingent je IP ist mit der Online-Welt geteilt); das Welt-Topic `ONLINE.topic` bleibt tabu.

### §4.6 Risiken (bewusst akzeptiert)

- TURN: Open Relay (openrelay.metered.ca, feste Zugangsdaten im Quelltext) ist ungeprüft und kann gedrosselt oder tot sein. Ohne funktionierendes TURN scheitert Handy ↔ Handy im Mobilfunk (CGNAT) oft: Bild wäre „Gefunden: X. Verbinde …“, nach 20 s der connect-Toast. Der Gathering-Deckel (4 s) hält einen toten TURN wenigstens aus dem Startweg; ein eigenes Metered-/Cloudflare-TURN bräuchte Schlüssel im Pages-Repo.
- ntfy-Nachrichtengrenze (4 KB, nicht im Code belegt) und Abo-/Rate-Limits je IP auf ntfy.sh sind nur aus Erinnerung bekannt; Chunking und das Schließen der EventSource nach dem Connect sind die Absicherung. 429 → 'signal'-Popup, dann hilft nur Warten.
- Kontingent 250/Tag/IP ist mit der Online-Welt und dem WLAN geteilt; 3 Nachrichten je Aufbau sind billig, aber ein flatternder Mobilfunk-Kanal (failed alle 30 s) könnte in einer Stunde ~100 Nachrichten kosten, bis RECONNECT_MS greift. Beobachten; notfalls Relaunch-Deckel im Transport.
- Browser im Hintergrund/iOS Safari: JS friert ein → nach 6 s lost beim Partner; pagehide → close() (link.js:206-209) trennt bei Navigation hart; Wake Lock hält nur den Bildschirm, nicht einen Tabwechsel. Nearby in der App läuft hier weiter, der Browser nicht – README muss das sagen.
- Koop-Bandbreite ≈ 50 KB/s Host-Upstream, ≈ 30 MB je 10-Minuten-Quest über Mobilfunk des Hosts; über TURN zusätzlich Relay-Volumen (Open Relay deckelt). Verwerfen bei bufferedAmount > 256 KB hält die Latenz, kostet dann Animationen/Zwischen-Events (das Ende wird wiederholt).
- Vertrauen: Host ist autoritativ, der Gast meldet seine RTT selbst (bis 800 ms Vorteil nach der Anhebung), das Rennen vertraut beiden Scores; mit Raumcode über Internet sind das Freunde wie bei Nearby, aber ein erratener Code (30 Bit, 12 h ntfy-Aufbewahrung) ließe einen Fremden beitreten.
- Lobby liest link.kind an fünf Stellen und baut den Link jetzt je Weg neu: vergisst man eine (z. B. :396 oder die mp-web-Klasse), stehen Bluetooth-Texte oder die APK-Karte im Online-Weg; der Lobby-Test mit Fake-net deckt das ab.
- PROTO 2 trennt alle v12-Nearby-Verbindungen (gewollt, Versions-Popup); wer das nicht will, lässt PROTO 1 und nimmt hängende Starts mit Moshe-Picks in Kauf.
- Zwei Gäste auf einem Code: der zweite wird still ignoriert und läuft in den 20-s-'connect'-Toast; bei 10⁹ Räumen nur durch Weitergabe an Dritte erreichbar.
- Android-WebView: RTCPeerConnection und EventSource sind seit Jahren vorhanden, aber in der APK nicht erprobt; der 'webrtc'-Fehler fängt den Ausfall ab, ein Fallback-Transport existiert nicht (ntfy als Spielkanal sprengt das Kontingent).

## §5 Grafiken

- `sprites/moshe.png` 256×256, Porträt wie die Rüther-Sprites (Kopf groß, transparenter Hintergrund), aus `art/boss-moshe.png` per PIL abgeleitet (Ausschnitt, Skalierung mit NEAREST, Palette wie das Original). Würdevoll, keine Verzerrung.
- `art/ab-buch.png`, `art/ab-neuesvideo.png`, `art/ab-schlange.png`, `art/ab-zinseszins.png`, `art/ab-geschenk.png`: Größe und Stil wie `art/ab-vp.png`/`ab-kursalarm.png` (Buch mit Cover-Rahmen; Handy mit Play-Dreieck; drei Silhouetten in Reihe; Münzstapel mit Pfeil nach oben; Reihenhaus mit Schleife). Kein Text in den Bildern, keine religiösen Symbole. Erzeugung per PIL-Skript `art/v13.py` (wie `art/moshe.py`), Bildmodell nur, wenn es schneller sauber wird.

## §6 Erfolg, Missionsliste, Versionsmeldung

- `ACHIEVEMENTS` (data.js): `{ id: 'moshe_spielbar', name: 'Mitarbeiter des Monats', desc: 'Räume Rabino Empire HQ dreimal aus, dann arbeitet Moshe für dich.', icon: 'star' }`; `COND.moshe_spielbar = s => mosheUnlocked(s)` (quests.js). Toast wie alle Erfolge (+50 Sats) über `afterChange`; wer schon ≥ 3 Siege hat, bekommt ihn beim ersten `afterChange` nach dem Update.
- Missionsliste (screens.js), Zeile Rabino Empire HQ: vor der Freischaltung „Siege N/3 · dann arbeitet Moshe für dich“, danach „Moshe spielbar“.
- Versionsmeldung: `VERSION = 13` und `NEWS` in js/app.js, `screens.js` `VERSION = 'v13'`, `version.json` `{ v: 13, apk: …/app-v13/RuetherGO.apk, news }`, `native/android/app/build.gradle` versionCode 13 / versionName "13". NEWS (wortgleich in version.json), drei Zeilen:
  1. „Moshe Hillel arbeitet für dich: Räume Rabino Empire HQ dreimal aus, dann steht er im Quest-Team. Fünf Fähigkeiten im Ton seiner Anzeige, Stufen wie bei den Rüthern.“
  2. „Erwischt dich Moshe, läuft jetzt eins seiner echten Videos. Überspringen geht nach 20 Sekunden.“
  3. „Zusammen spielen geht jetzt auch über Internet und im Browser: Raumcode teilen, fertig. Beide brauchen die neue Version.“
  `test/anzeige.test.mjs` prüft Version 13 und `news.length === 3`.

## §7 Tests und Abnahme

- Neuer `test/v13.test.mjs` (Muster `test/moshe.test.mjs`): `mosheUnlocked` false/true nach 2/3 Siegen, fail/abort zählen nicht, Unsinn in `questLog` wirft nicht; `mosheInst` Level/Seltenheit (1/normal, 6/selten, 10/episch, 15/legendaer, 20 gedeckelt); `checkAchievements` liefert `moshe_spielbar` genau einmal; `buyAbility(s, 'moshe', …)` vor der Freischaltung `reason 'gesperrt'`, danach ok; `loadoutFor(s, 'moshe')` = [buch, neuesvideo, slot]; `migrate` idempotent mit `questAbilities.moshe`; `createQuest` mit einem Team aus `makeFighter(QUEST_UNITS.moshe, …)` → Einheit `id 'moshe'` mit 3 Fähigkeiten; Engine-Tests je Fähigkeit Stufe 1 und 3 (buch stunt und weckt als Patrouille; neuesvideo setzt Tasks und Stufe 3 stunt danach; schlange zieht Wachen und Stufe 3 setzt Wand; zinseszins verzinst nur mit Beute, Fälligkeit, Abliefern addiert `interest`, Flachliegen bricht ab; geschenk schickt zum Tor, Stufe 3 zwei Wachen); `pickVideo` ohne Wiederholung und deterministisch; Wortfilter §0 läuft über alle neuen Texte; `cleanPicks` lässt moshe im Quest-Modus durch, im Duell nicht (lobby.test.mjs, gehört zum Online-Baustein bzw. zur Integration).
- Bestehende Tests nachziehen: `test/v10.test.mjs` IDS, `test/abilities.test.mjs` Anzahl 30, `test/quest.test.mjs` „alle Missionen lösbar“ auch mit Moshe im Team, `test/anzeige.test.mjs` Version 13.
- Abnahme headless (Playwright, Chrome-Kanal für Video): Spielstand mit `questLog.rabino.wins 3` → Erfolg-Toast, Sammlung zeigt Moshe-Karte, Kauf/Upgrade, Team-Wahl mit Moshe, Quest-Start (z. B. Tachionenraub) mit Moshe im Team, jede Fähigkeit einmal einsetzen (Screenshots), Rabino HQ mit Moshe → erwischt → echtes Video (Screenshots 1 s, 19 s, 21 s), Überspringen-Regel, zweites Video anders. Ohne Siege: keine Moshe-Karte, keine Team-Zeile, Kauf gesperrt. Arena-Duell und Arena-Kampf ohne Moshe. `node --test test/*.test.mjs` grün, `node --check` auf allen js, `python tools/make_sw.py` gelaufen, `vids/*.mp4` nicht in der Precache-Liste, aber über den Laufzeit-Cache erreichbar, `native/build-www.mjs` kopiert `vids`.

## §8 Dateien und Zuständigkeit (Moshe-Workflow)

- Fundament (zuerst, allein): `js/data.js` (QUEST_UNITS, portraitOf, Erfolg), `js/progress.js` (MOSHE_WINS, mosheUnlocked, mosheInst, Kaufsperre), `js/quests.js` (COND), `js/quest/abilities.js` (5 Einträge mit Zahlen und Texten aus §2), `test/v13.test.mjs` (Daten-/Fortschrittsteil), Versionsstand §6 (app.js VERSION/NEWS, screens.js, version.json, build.gradle, anzeige.test).
- Baustein A „Wirkungen“: `js/quest/engine.js`, `js/quest/view.js` (nur Fähigkeits-Animationen, nicht videoScene), `js/quest/draw.js`, `css/quest.css` (nur Fähigkeits-Stile), Engine-Tests in `test/v13.test.mjs` ergänzen, `test/abilities.test.mjs`, `test/v10.test.mjs`, `test/quest.test.mjs`.
- Baustein B „Team, Start, Sammlung, Koop-Kämpfer“: `js/screens.js`, `js/app.js`, `js/duel.js` (nur, falls nötig), `js/quest/coop.js` (nur, falls nötig), `css/screens.css`; Patchliste für `js/lobby.js` (§1 Koop) in `deviations`.
- Baustein C „Videos“: `js/quest/video.js` (neu), `vids/` (vorhanden), `tools/make_sw.py` + `python tools/make_sw.py`, `native/build-www.mjs`, `.gitignore`, `css/quest.css` (nur Video-Stile), Test für `pickVideo`; der Einbau in `view.js videoScene` als fertiger, getesteter Patch (Funktionen in video.js, in view.js nur ein Aufruf), den die Integration setzt, falls Baustein A die Datei noch hält; sonst selbst einbauen.
- Baustein D „Grafik“: `sprites/moshe.png`, `art/ab-*.png`, `art/v13.py`.
- Tabu für den Moshe-Workflow (gehört dem Online-Baustein): `js/net/`, `js/lobby.js`, `index.html`, `css/app.css`, `test/net.test.mjs`, `test/lobby.test.mjs`, `native/` außer der Versionszeile in `build.gradle` und `build-www.mjs`.
