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
- Texte: 1 „Moshe hält das Handy hoch: Alle Wachen in 6 Kacheln schauen 10 s sein neues Video. Spezialwachen nur halb so lang. Abklingzeit 30 s.“ 2 „14 s und 7 Kacheln. Der Algorithmus liebt ihn.“ 3 „Sechs Finger: Nach dem Video sind sie 5 s verwirrt und sehen nichts.“

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

Eigener Baustein mit eigenem Entwurf (folgt aus dem laufenden Entwurfs-Workflow; wird als §4 ergänzt). Grundlinie, die schon feststeht: derselbe Lobby-Ablauf wie Nearby, zusätzlich „Über Internet“ mit Raumcode; Signalisierung über ntfy (Topic je Raumcode, Test-Topics `ruether-go-test-…`), Spielverkehr über WebRTC-DataChannel (STUN, öffentlicher TURN als Fallback), läuft auch im Browser; Duell/Koop/Rennen bleiben unverändert. Dateien: `js/net/online.js` (neu), `js/net/link.js`, `js/lobby.js`, `index.html` (Lobby-Markup), `css/app.css`, `test/net.test.mjs`, `test/lobby.test.mjs`. Nötige Änderungen in `js/app.js` (Einstieg im Browser statt `appOnly`) werden als Patchliste geliefert und in der Integration eingebaut.

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
