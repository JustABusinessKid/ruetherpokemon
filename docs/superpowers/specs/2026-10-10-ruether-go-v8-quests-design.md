# Rüther GO v8: Haunebu-Quests (Kommando-Modus), Neuschwabenland, Lockmodul, Online über GitHub

Stand 2026-10-10. Sebis Wünsche (/goal: vollständig umsetzen, Fehler suchen, verbessern):

1. **Neue Arena** „Geheime Festung Neuschwabenland“. Spielbar nur, wenn man die Haunebu erkämpft hat. Boss ist der **Tachionenbitcoin**, mit Abstand der stärkste Gegner.
2. **Lockmodul:** alle 20 s **komplett neue** Rüther, **direkt bei dir** im Umkreis.
3. **Online-Funktionen** sollen über die GitHub-Version weiterlaufen. Higgsfield ist abgeschaltet und bleibt aus.
4. **Haunebu nach jedem Sieg über Hitler nur 10 Minuten nutzbar.** Danach muss man sie neu beschwören und Hitler wieder besiegen. Die Beschwörung kostet 5000 Sats, jede weitere 1000 mehr, höchstens 8000.
5. **Quests als komplett neue Spielart:**
   - Freigeschaltet erst, wenn alle Arenen auf Max-Level sind.
   - Erst die Haunebu kapern, dann mit dem gewählten 3er-Team zum Handlungsort fliegen und ein Ziel erfüllen. Beispiel Neuschwabenland: möglichst viele Tachionenbitcoins entführen.
   - Gespielt wird als 2D-Draufsicht wie **Commandos 2**: Rüther antippen, Wegpunkt antippen. Doppeltipp auf einen Rüther öffnet ein Menü seiner Superkräfte, die taktisch und animiert eingesetzt werden.
   - Beispiele: Viktor legt eine Gaswand, während ein anderer Rüther Tachionenbitcoins klaut (jeder Klau dauert). Christian öffnet mit Plus 70 Prozent verschlossene Türen für Abkürzungen. Hildegard schaltet mit Familientreffen im Kampf zwei Gegner aus.
   - Eine Mischung aus Stealth und normalem Kampf, mit Gegnern. Die Quests sollen variieren.

Die Daten für Punkt 1, 4 und die Online-Konfiguration stehen schon in `js/data.js`: `ARENAS.neuschwabenland` (`haunebuOnly`), `BOSSES.tachionen` mit `duration`, `LINES.tachionen`, `CONST.HAUNEBU_*`, `CONST.LURE_RING`, `CONST.QUEST_XP`, `SHOP.haunebu`, `ACHIEVEMENTS` tachionen/quest1/quest_all und `ONLINE`. **Agenten ändern data.js nicht.** Einzige Ausnahme: Der Logik-Agent darf die Zahlenwerte von `BOSSES.tachionen` nach seiner Balance-Simulation anpassen, mit Begründung.

## §0 Oberste Regeln (gelten weiter)

- **Echte Gesichter und Humor sind der Kern.** Überall, wo ein Rüther auftaucht, ist sein echtes Gesicht `sprites/<id>.png` zu sehen, auch im Quest-Modus als Spielfigur. Generiert oder gezeichnet werden nur Gegner, Kulissen, Requisiten und Icons.
- **NS-Figuren nur als lächerliche Verlierer.** **Keine NS-Symbole**: kein Hakenkreuz, keine Runen, kein Adler, kein Balkenkreuz, keine Armbinde, keine Abzeichen. Keine Parolen, kein Gruß, keine Anspielungen auf NS-Verbrechen. Das gilt für Grafiken, Kacheln, CSS und Texte. Die Festung ist ein Eis-Bunker ohne Symbole.
- **Stil Pixel-Kneipe** (`css/theme.css`, `art/README.md`): keine Emojis in Bedienelementen, keine weichen Verläufe oder Schatten. Pixelgrafik per Higgsfield-CLI mit dem Stil-Satz oder per PIL. Hitler, Goebbels und Himmler gibt es nur als PIL-Karikaturen, weil die Modelle sie ablehnen. Keine Filter umgehen.
- **Fotos nie committen.** Lokale Tests laufen offline. **Nie in das echte ntfy-Topic schreiben**, Tests nutzen eigene Test-Topics.
- **Mobil zuerst:** 390×844 und 375×667 im Hochformat, Touch-Bedienung.

## §1 Haunebu: Kosten und 10-Minuten-Fenster

- `summonCost(save) = min(HAUNEBU_SUMMON_BASE + HAUNEBU_SUMMON_STEP × save.stats.haunebuSummons, HAUNEBU_SUMMON_MAX)` ergibt 5000, 6000, 7000, 8000, 8000 …
  - `stats.haunebuSummons` zählt jede Beschwörung, also jeden bezahlten Kauf, egal ob danach Sieg oder Niederlage.
- `buyItem(save,'haunebu',now)`:
  - Gibt `{ok:false, reason:'aktiv'}` zurück, solange ein Fenster läuft.
  - Gibt `{ok:false, reason:'sats'}` zurück, wenn die Sats nicht reichen.
  - Sonst zieht es `summonCost` ab, erhöht `haunebuSummons` und gibt `{ok:true, summon:true, cost}` zurück.
- `haunebuWin(save, now)` setzt `save.haunebuUntil = now + HAUNEBU_USE_MS`, erhöht `sats += HAUNEBU_WIN_SATS` und `stats.haunebuWins++`.
  - `haunebuActive(save, now)` heißt `haunebuUntil > now`.
  - `save.flugscheibe` (v7) entfällt. Die Migration setzt `haunebuUntil: 0` und `stats.haunebuSummons: 0`. Alte Besitzer müssen neu beschwören.
- **Flüge im Fenster sind frei** (`HAUNEBU_BEAM_COST = 0`), beliebig viele Sprünge.
  - `startBeam(save, arenaId, now)` braucht ein aktives Fenster und setzt `save.beam = { arenaId, until: save.haunebuUntil, from }`.
  - Endet das Fenster, fliegt die Haunebu dich zurück. Das gilt nur, wenn du gerade gebeamt bist. Dabei bleibt die vorhandene Logik: Kampf und Fang abwarten, dann `playReturn`.
- **Anzeigen:**
  - Shop:
    - während des Fensters „Im Einsatz · noch 7:41“,
    - sonst „Beschwören · 6.000 Sats“ mit dem aktuellen Preis,
    - unter dem Preis „Nächste: 7.000“.
  - Der Karten-Knopf ist nur während des Fensters sichtbar. Der Countdown-Chip zeigt die Restzeit des Fensters.
  - Ein Toast und Haptik kommen bei 1:00 Restzeit und am Ende („Die Haunebu fliegt zurück zu Hitler.“).
- Erfolg `haunebu` = `stats.haunebuWins >= 1`.

## §2 Arena Neuschwabenland und Tachionenbitcoin

- `ARENAS.neuschwabenland` liegt in der Antarktis (-72, 5) und hat `haunebuOnly: true`.
  - Im Flug-Popup steht sie ganz oben, mit dem Hinweis „Nur mit Haunebu“.
  - Ihr Arena-Screen erklärt: „Nur mit der Haunebu erreichbar“. Der Kampf-Knopf richtet sich wie immer nach der Reichweite. Nach dem Beamen steht man in Reichweite.
  - Spawns dort laufen wie überall. Overpass liefert dort keine Stops, das ist ok.
- **Kulisse** `art/bg-neuschwabenland.png`: eisiger Bunkerkomplex in einer Gletscherwand, Polarlicht, Schneetreiben, Stahltore, blaues Eis, ohne Symbole und ohne Personen.
  - Gilt für `#screen-battle[data-arena="neuschwabenland"]` und den Arena-Screen.
- **Boss** `art/boss-tachionen.png`: eine goldene Bitcoin-Münze, umhüllt von violett-türkiser Tachionen-Energie, mit Bewegungsunschärfe-Kopien (Pixel-Echos) hinter sich, Zeit-Glitch-Pixeln und bedrohlichen Augen. Im Stil der anderen Bosse.
- **Engine:** `makeBoss` übernimmt `def.duration`. Der Kampf läuft `enemy.duration || BATTLE_DURATION` (120 s).
- **`BOSS_FX`-Handler** in `battle-ui.js`, alle mit echten Animationen:
  - `tachyon` (schnell): Die Münze blitzt **vor** der Warnung schon einmal auf, ein „Echo“. Dann rasen 3 Pixel-Echos auf mich.
  - `thalving`: große Halving-Axt (`fx-halving`) in Violett, Bildschirm-Riss.
  - `causality`: Ein Uhr-Requisit zerspringt, die Bühne flackert in Negativ-Farben, die Spieler-Leiste „glitcht“. Betäubung und Gift kommen aus der Engine.
  - `timeloop`: Die Bühne spult kurz rückwärts (Streifen, „◀◀“-Pixel-Overlay), die Münze heilt.
- **Balance:** Der Tachionenbitcoin ist mit Abstand der stärkste Gegner. Lv. 1 schafft ein Team aus drei Lv.-15-Rüthern (selten/episch) mit gutem Ausweichen. Lv. 5 schaffen drei Lv.-20-Legendäre nur mit sehr gutem Spiel. Der Logik-Agent prüft das per Simulation (Engine-Tick, realistische Tipp-Rate 4/s, Ausweichquote 70 %, Spezial-Attacken) und stellt die Zahlen ein.
- **Erfolg** `tachionen` gilt nach dem ersten Sieg dort, also wenn `(save.arenaLevels.neuschwabenland || 1) >= 2`.

## §3 Lockmodul

- Solange `lureActive` gilt, kommt alle `LURE_INTERVAL` (20 s) eine **Welle**.
  - **Alle** bisherigen Spawns verschwinden. Ausnahme ist ein Spawn, der gerade im Fang- oder Kampf-Screen offen ist.
  - Dafür kommen `LURE_SPAWN_MIN..MAX` (4–8) **neue** im Ring `LURE_RING` (12–90 m) um die aktuelle Position, also in Fangreichweite.
  - Die neue reine Funktion `lureWave({ player, ruethers, arenas, now, rng, keep, featured })` in `spawn.js` steckt dahinter. Ortsgebundene Rüther kommen nur, wenn ihre Arena in `LOCAL_ZONE` liegt.
- Der erste Spawn passiert sofort beim Kauf des Lockmoduls.
- Die Karte zeigt die Welle: ein kurzer Puls um den Spieler (`map.js`) und ein Countdown im Lockmodul-Banner bis zur nächsten Welle.

## §4 Online-Welt über GitHub

Higgsfield ist aus. Statt des alten Backends:

- **Live-Bus über ntfy.sh** (CORS ok, ohne Konto). Das Topic steht in `ONLINE.topic`. Nachrichten bleiben dort 12 h.
- **Dauerhafter Stand:** `state.json` im Branch `online-data`. Gelesen wird über `ONLINE.snapshotUrl` (raw.githubusercontent.com, CORS ok, ca. 5 min Cache).
- **GitHub Action** `.github/workflows/online-sync.yml`:
  - Läuft per `schedule` alle 15 Minuten und per `workflow_dispatch`.
  - Liest `state.json` aus `online-data` und die ntfy-Nachrichten seit `lastMsgTime` (bzw. 12 h). Sie prüft und merged mit **demselben** Modul wie der Client (`js/online-merge.js`, ohne DOM, läuft in Node 20).
  - Schreibt nur bei Änderungen und pusht nach `online-data`. Rechte: `permissions: contents: write`.
- **Nachrichten** sind signiert: ECDSA P-256 über WebCrypto, Schlüssel pro Gerät in localStorage.
  - Format: `{ v:1, k:'sync'|'arena'|'event', id, pub, t, d, sig }`.
  - `id = base64url(SHA-256(pub raw))`. Die Signatur deckt die kanonische JSON-Form von `{v,k,id,t,d}` ab.
  - Geprüft werden die Signatur, `id` passend zu `pub` und das Schema von `d`, mit denselben Regeln wie die alte API: Nickname 2–16 Zeichen und bereinigt, bekannte Rüther-, Seltenheits- und Arena-IDs, Level 1–20 bzw. 1–5, Event-Arten aus einer festen Liste, Text ≤ 120 Zeichen, nur als Text dargestellt.
  - Nachrichten bleiben ≤ 3500 Bytes.
- **Merge-Regeln:**
  - `sync` legt den Spieler an oder aktualisiert ihn. Ein Nickname gehört der ersten id; einen Altspieler mit demselben Nickname übernimmt die neue id.
  - `arena` wird neuer Besitzer der Arena.
  - `event` kommt in die letzten 50 Ereignisse.
  - „Online jetzt“ sind alle mit `sync` in den letzten 10 min.
- **Client** (`js/online.js`): Die **öffentliche Schnittstelle von `createOnline` bleibt gleich**, also das, was app.js heute aufruft (`syncNow`, `claimArena`, `postEvent`, `lastState`, `fetchState` …). Auch die Form von `lastState` bleibt (Arenen-Besitzer, Rangliste, Ereignisse, online), damit Rangliste, Arena-Besitzer, Feed und „online“ genauso funktionieren.
  - Beim Start lädt der Client den Snapshot, mit Cache-Buster pro Minute, und dann ntfy seit `lastMsgTime`.
  - Danach pollt er alle `STATE_POLL`.
  - Er sendet `sync` höchstens alle 60 s und nur bei Änderung. `arena` und `event` gehen sofort raus.
  - Fehler werden still behandelt: Dann ist der Client eben offline.
- **Konfiguration und Tests:**
  - `apiBase`/`API_BASE` entfällt, `createOnline` bekommt `ONLINE`.
  - Lokal (localhost/127.0.0.1) bleibt es offline. `?online=<test-topic>` erlaubt Tests mit einem eigenen Topic und ohne Snapshot.
- **Startstand:** Spieler, Arenen und Ereignisse aus der alten Higgsfield-D1 holt der Online-Agent read-only über `higgsfield website db 24a00b5a-fde0-4364-872f-dd4f609d5b37 …`.
  - Er legt `online/state.seed.json` im Repo ab. Den Branch `online-data` erstellt und pusht der Hauptagent.
  - Altspieler bekommen `id: 'legacy:<nick>'`. Tokens werden nie übernommen.
- **Doku:** `online/README.md` erklärt den Ablauf, das Zurücksetzen (state.json im Branch leeren) und das Topic.

## §5 Haunebu-Quests (Kommando-Modus)

### 5.1 Freischaltung und Ablauf

- **Freischaltung:** `questsUnlocked(save) = ARENAS.every(a => save.arenaMastered[a.id])`, also alle 5 Arenen inklusive Keller und Neuschwabenland auf Max-Level.
  - Der Quests-Tab zeigt oben einen neuen Bereich **„Haunebu-Quests“**. Gesperrt steht dort der Fortschritt („Meistere alle Arenen: 3/5“) mit einer Liste der fehlenden Arenen. Darunter bleiben die Tagesquests unverändert.
- **Start einer Quest:**
  1. Die Haunebu muss **aktiv** sein (§1). Sonst erscheint der Hinweis „Kapere zuerst die Haunebu“ mit einem Knopf zum Shop.
  2. **Team wählen:** ein Screen mit der Box, bis zu 3 Rüther, mindestens 1, vorausgewählt ist das aktuelle Team. Gesichter sind echt. Zu jedem Rüther stehen seine Quest-Kräfte.
  3. „Abflug“ startet `playBeam` zum Handlungsort (`mission.lat/lon`). Die Quest **verbraucht** die Haunebu: Das Fenster endet beim Start der Quest.
  4. Dann öffnet sich der Quest-Screen.
- **Ende** (Erfolg, Misserfolg oder Aufgeben):
  1. Ergebnis-Screen mit Ziel-Erfüllung, Sats, XP, Bestwert und Gesichtern.
  2. Dann `playReturn` nach Hause.
  3. `questResult(save, missionId, result, score)` verbucht Sats und XP und `save.questLog[missionId] = { best, done }`. Daraus folgen die Erfolge `quest1` und `quest_all`.

### 5.2 Missionen (`js/quest/missions.js`)

Es gibt mindestens **4 Missionen** mit unterschiedlichen Zielarten. Jede hat **2–3 Varianten**: Wachen, Patrouillen und Beute-Plätze unterscheiden sich, und pro Start wird eine Variante zufällig gewählt. So variieren die Quests.

| id | Ort (lat/lon) | Ziel | Zeit |
|---|---|---|---|
| `tachionenraub` | Neuschwabenland, Tresor-Ebene (-72, 5) | **So viele Tachionenbitcoins wie möglich entführen.** Tresore enthalten Münzen, das Klauen dauert 3 s pro Münze, jeder Rüther trägt höchstens 2. Die Münzen zur Haunebu-Landeplattform bringen. Erfolg ab 3 abgelieferten, jede Münze gibt Sats. | 6:00 |
| `hangar` | Neuschwabenland, Hangar (-71.6, 4.2) | **4 Ersatz-Flugscheiben sabotieren** (je 4 s). Dann alle Überlebenden zur Plattform bringen. | 6:00 |
| `ps3` | PC Sale Lager, Hagen (pcsale) | **Michas PS3 befreien:** 5 s aus dem Lagerraum holen. Wer sie trägt, ist 40 % langsamer und kann keine Kräfte einsetzen. Zur Plattform bringen. | 5:00 |
| `keller` | Keller der Rütherschanze (keller) | **Die Bitcoin-Heizung abschalten** (Stecker 4 s), dann unentdeckt raus. Bonus, wenn kein Alarm ausgelöst wurde. | 5:00 |

- **Karten:**
  - ASCII-Raster, etwa 26–34 × 18–24 Kacheln.
  - Zeichen: `#` Wand, `.` Boden, `D` Tür offen, `L` verschlossene Tür, `P` Plattform (Start und Ziel), `C` Tresor, `S` Sabotageziel, `X` Missionsobjekt, `K` Stecker/Schalter, `~` Deko-Eis/Kisten, die Sicht blockieren, aber begehbar sind (Deckung).
  - Jede Mission hat Abkürzungen hinter `L`-Türen, für die man Christian braucht, und mehrere Wege.
- **Gegner pro Variante:** Typ, Start, Patrouillen-Wegpunkte und Blickrichtung.

### 5.3 Engine (`js/quest/engine.js`, `js/quest/path.js`)

Die Engine ist rein, ohne DOM, deterministisch mit `rng` und testbar.

- **Erzeugen:** `createQuest({ mission, variant, team, rng })` liefert den Zustand. `team` sind die Kampfwerte (`makeFighter`) der gewählten Rüther: `id`, `rarity`, `level`, `maxBtc`, `power`.
- **Schritt:** `tick(state, dt, cmds)` liefert Events. `dt` ist in ms (fester 50-ms-Schritt im UI). Mögliche `cmds`:
  - `{type:'move', unit, to:{x,y}}`
  - `{type:'ability', unit, ability, target}` mit `target` als `{x,y}`, `{enemy}` oder `{door}`
  - `{type:'interact', unit, obj}`: klauen, sabotieren, aufheben, abschalten, wiederbeleben (`obj` kann `{unit}` sein)
  - `{type:'stop', unit}`
  - `{type:'extract'}`
  - `{type:'abort'}`
- **Bewegung:**
  - A* auf dem Raster, 8 Richtungen, ohne Ecken zu schneiden. `L` ist unpassierbar bis offen, Wände ebenso.
  - Tempo: Grundwert 3 Kacheln/s, Viktor 2,6, mit Missionsobjekt 60 %.
  - Positionen sind Fließkommazahlen in Kacheln.
- **Sicht der Gegner:**
  - Kegel mit Reichweite und Öffnungswinkel je Typ. Wände, `~` und Gaswolken blockieren die Sicht (Raycast).
  - Ist ein Rüther im Kegel, steigt `suspicion` (schneller, je näher er ist). Ab 0,3 zeigt der Gegner „?“, er dreht sich zum Rüther und läuft zur letzten Sichtung. Bei 1 schlägt er Alarm mit „!“.
  - Ein **alarmierter Gegner** jagt und greift im Nahkampf an (`dps` je Typ). Der Rüther wehrt sich automatisch gegen angrenzende alarmierte Gegner (`8 × power` pro s). Gegner haben HP.
  - Jeder Alarm erhöht den globalen `alarm` um 0,34. **Goebbels setzt ihn sofort auf 1** (Megafon).
  - Bei Voll-Alarm kommen alle 20 s 2 Verstärkungen am Tor, und alle Kegel werden 25 % größer.
  - Ohne Sichtkontakt sinkt der Alarm langsam (−0,02/s).
- **Gegner-Typen** (Werte als Richtwert):

  | Typ | Sicht | Winkel | Tempo | HP | Besonderheit |
  |---|---|---|---|---|---|
  | `pinguin` (Wachpinguin) | 5 | 90° | 2,2 | 60 | watschelt |
  | `drohne` (Tachionen-Drohne) | 7 | 60° | 3,4 | 40 | fliegt, Gaswolken stoppen sie nicht |
  | `goebbels` | 5 | 100° | 2,4 | 80 | Megafon: sofortiger Voll-Alarm |
  | `himmler` | 4 | 140° | 1,8 | 70 | Klemmbrett: füllt die suspicion doppelt so schnell |
  | `detektiv` (Ladendetektiv, PC Sale) | 6 | 80° | 2,8 | 70 | – |

  Zustände: `patrol`, `suspicious`, `investigate`, `alert`, `stunned`, `ko` (dauerhaft), `distracted`, `bribed`, `eating`.
- **Rüther:**
  - HP = `maxBtc` des Kampfwerts. Bei 0 HP ist der Rüther `down`.
  - Ein Teammitglied, das 3 s daneben steht, holt ihn zurück (`interact {unit}`) mit 40 % HP.
  - Sind alle `down`, ist die Mission gescheitert. Läuft die Zeit ab, ebenfalls. Ausnahme Raub-Missionen: Dort gilt dann die Wertung, wenn das Ziel erreicht ist.
- **`interact`:** Klauen, Sabotage, Aufheben und Abschalten dauern (Fortschrittsbalken). Sie brechen ab, wenn der Rüther gesehen und alarmiert wird.
- **Abliefern:** Ein Rüther mit Beute läuft auf die Plattform und liefert dort ab.
- **`extract`:** Geht, wenn das Missionsziel (min) erreicht ist und alle nicht-`down` Rüther auf `P` stehen. Liegengelassene `down` Rüther kosten Wertung.

### 5.4 Kräfte (`abilitiesFor(unitId)`)

Jeder Rüther hat **2 Kräfte** mit Abklingzeit. Dazu kommen für alle: laufen, interagieren, wiederbeleben, Nahkampf. Die Reichweite ist in Kacheln angegeben.

| Rüther | Kraft | Wirkung | Ziel/Reichweite | CD |
|---|---|---|---|---|
| Christian | **Plus 70 Prozent** | öffnet eine verschlossene Tür (`L` → offen). Ein Chart-Pfeil schießt hoch, Münzen regnen, die Tür gleitet auf. | Tür ≤ 1,5 | 8 s |
| Christian | **Werfen mit Dosenbier** | Wurf im Bogen. Das Scheppern ist ein Geräusch: Gegner in 5 Kacheln gehen 6 s nachsehen. | Punkt ≤ 6 | 12 s |
| Hildegard | **Familientreffen** | Die echten Christian und Micha rennen vom Rand heran und schalten die **2 nächsten Gegner in 5 Kacheln dauerhaft aus** (KO, gefesselt). Nur nutzbar, wenn ein Gegner in Reichweite ist („im Kampf“). | selbst | 60 s |
| Hildegard | **Handtaschen-Hieb** | Nahkampf-KO für 15 s, leise, wenn der Gegner sie nicht sieht. | Gegner ≤ 1,2 | 6 s |
| Viktor | **Giftgas-Wand** | 3×3-Gaswolke für 10 s. Sie blockiert die Sicht, und Gegner darin husten (betäubt, solange sie drin sind). | Punkt ≤ 5 | 20 s |
| Viktor | **Ungeschlagene Argumentationslogik** | Der Gegner bleibt 8 s stehen, Kegel aus, Sprechblase „Deutsche Bank ist kein Geringverdiener“. | Gegner ≤ 3 | 15 s |
| Micha | **Controllerwurf** | Fernkampf-KO für 10 s, braucht Sichtlinie. | Gegner ≤ 6 | 12 s |
| Micha | **Hardware-Wallet-Umbau** | Am angrenzenden Tresor sofort so viele Münzen klauen, wie er tragen kann. An einer Drohne in 5 Kacheln: 10 s deaktiviert. | Tresor ≤ 1,2 / Drohne ≤ 5 | 25 s |
| Ramona | **Abgelaufene M&Ms** | Köder. Der nächste patrouillierende Gegner in 6 Kacheln geht hin, isst und ist 20 s KO („schlecht“). | Punkt ≤ 4 | 18 s |
| Ramona | **Unlimited Credits** | Ein angrenzender Gegner wird bestochen und ist 25 s untätig. | Gegner ≤ 1,2 | 30 s |

### 5.5 Darstellung und Bedienung (`js/quest/view.js`, `css/quest.css`)

- **Canvas, 2D-Draufsicht** im Pixel-Stil mit 32-px-Kacheln, `image-rendering: pixelated`.
  - Die Kacheln werden prozedural gezeichnet und gecacht: Eis/Schnee, Beton, Stahltüren, Kisten, Tresore mit Münzglanz, Landeplattform mit Haunebu-Grafik (`fx-haunebu`). Für jeden Handlungsort gibt es eine eigene Palette: Neuschwabenland, Hangar, PC-Sale-Lager, Keller.
  - Die Kamera folgt dem Gewählten. Ziehen auf freier Fläche verschiebt sie, dazu gibt es Zoom-Knöpfe ±.
- **Figuren:**
  - Rüther sind ihr **echtes Gesicht** im Seltenheitsrahmen (rund oder eckig, 28 px) mit kleinem Schatten. Ein Lauf-Wackeln zeigt Bewegung. Der gewählte Rüther ist hervorgehoben.
  - Gegner sind kleine Sprites (`art/q-*.png` bzw. die Boss-PNGs von Goebbels und Himmler verkleinert).
- **Sichtkegel:**
  - Der Kegel aller Gegner ist schwach sichtbar.
  - Tippen auf einen Gegner zeigt seinen Kegel deutlich und blendet seinen Namen ein.
  - Die Farbe zeigt den Zustand: grün Patrouille, gelb misstrauisch, rot alarmiert.
- **Bedienung:**
  - Antippen eines Rüthers (Figur oder Porträt unten) wählt ihn aus. „Alle“ wählt das ganze Team.
  - Antippen von Boden bedeutet Laufen, mit Wegpunkt-Marker und gestrichelter Pfadlinie.
  - Antippen eines Objekts bedeutet hinlaufen und interagieren. Antippen eines Gegners mit Hildegard bedeutet anschleichen und Handtaschen-Hieb, sonst nur Kegel zeigen.
  - **Doppeltipp auf einen Rüther** öffnet ein **Kreismenü** um ihn mit seinen Kräften: Icon, Name, Abklingzeit. Dasselbe Menü öffnet auch der Knopf „Kräfte“ in der Leiste.
  - Nach der Wahl kommt der **Zielmodus**: Reichweitenkreis, gültige Ziele leuchten, Antippen führt die Kraft aus, „Abbrechen“ beendet den Modus. Ist das Ziel zu weit, läuft der Rüther erst hin und setzt die Kraft dann ein.
- **HUD (DOM über dem Canvas):**
  - oben: Missionsziel mit Zähler, Zeit, Alarm-Leiste,
  - unten: 3 Porträts mit HP und Trage-Symbol, Kräfte des Gewählten mit Abklingzeit, Knöpfe „Pause“ (taktische Pause, Befehle bleiben möglich), „Abheben“ (aktiv, wenn `extract` möglich ist) und „Aufgeben“.
- **Animationen (2D, alle sichtbar und witzig):**
  - Gaswolke aus gedithertem Grün, quillt auf und wabert. Hustende Gegner zeigen „*hust*“.
  - Plus 70 Prozent: Chart-Pfeil und Münzregen, die Tür fährt auf.
  - Familientreffen: Banner wie im Kampf, die echten Gesichter rennen herein. Sterne und Fesseln, daneben „KO“.
  - Würfe im Bogen: Dose bzw. Controller dreht sich, Scheppern als Ring.
  - M&Ms verteilen sich bunt, der Gegner wird grün und hat „🤢“-freie Pixel-Übelkeit, also keine Emojis.
  - Bestechung: Münzen fliegen zum Gegner, er dreht sich weg.
  - Argument: Viktors Sprechblase, der Gegner bekommt „…“.
  - Klau-Fortschrittsbalken, getragene Münzen hüpfen über dem Kopf.
  - „?“ und „!“ über Gegnern, Alarm als roter Rand-Puls, KO-Sterne, Wiederbeleben mit Herz-Pixeln.
- **Sound:** über `sfx` (vorhandene plus neue Synth-Töne: Schritt, Alarm, Klau, Gas).
- **Tutorial-Hinweise** beim ersten Start: 3 kurze Sprechblasen (auswählen, Wegpunkt, Doppeltipp für Kräfte).
- **Schnittstelle:**
  - `createQuestScreen({ el, onEnd })` gibt `{ start({ mission, variant, team, fighters, rng }), stop() }` zurück.
  - `onEnd({ result:'success'|'fail'|'abort', missionId, score, objective:{done,total}, timeMs, alarmFree })`.
  - Die Schleife ist eine feste 50-ms-Logik mit rAF-Zeichnen und Catch-up wie im Kampf (gedrosseltes rAF beachten).

### 5.6 Belohnungen

- `questResult(save, missionId, result, score)`:
  - Sats: Raub 300 je Münze plus 1000 Abschluss; Sabotage 2500; PS3 2500; Keller 2000, mit +1000 ohne Alarm.
  - XP: `QUEST_XP`.
  - Misserfolg: nur 10 % der Sats, kein Abschluss.
  - `questLog` mit Bestwert.

## §6 Grafiken (Higgsfield, Stil-Satz; PIL bei abgelehnten Motiven)

- **Arena:**
  - `boss-tachionen.png`
  - `bg-neuschwabenland.png`
- **Quest-Gegner** als Draufsicht bzw. leichte Schrägsicht, 64×64, transparent:
  - `q-pinguin.png`: Wachpinguin mit Taschenlampe und Mütze, ohne Abzeichen
  - `q-drohne.png`: Drohne mit violettem Tachionen-Auge
  - `q-detektiv.png`: Ladendetektiv mit Trenchcoat und Lupe
- **Quest-Objekte:**
  - `q-coin.png`: Tachionen-Münze, klein
  - `q-vault.png`: Tresor
  - `q-saucer.png`: Ersatz-Flugscheibe von oben
  - `q-ps3.png`: Michas PS3
  - `q-plug.png`: Stecker
  - `q-pad.png`: Landeplattform, optional
- **Requisiten für die Tachionen-Attacken:** `fx-clock.png` (zerspringende Uhr), `fx-echo.png` optional.
- Kacheln dürfen prozedural im Canvas entstehen.
- Alle Grafiken ohne Symbole, alle ansehen und prüfen, Einträge in `art/manifest.json` und `art/README.md` (Runde 4).

## §7 Module und Zuständigkeiten

| Bereich | Dateien |
|---|---|
| Online | `js/online.js`, `js/online-merge.js`, `tools/online-sync.mjs`, `.github/workflows/online-sync.yml`, `online/README.md`, `online/state.seed.json`, `test/online.test.mjs` |
| Logik | `js/progress.js`, `js/spawn.js`, `js/quests.js`, `js/battle.js`, `test/v8.test.mjs` (+ Anpassungen bestehender Tests), Zahlen in `BOSSES.tachionen` |
| Quest-Engine | `js/quest/engine.js`, `js/quest/path.js`, `js/quest/missions.js`, `test/quest.test.mjs` |
| Grafik | `art/*` |
| Kampf-FX | `js/battle-ui.js`, `css/battle.css` |
| Quest-UI | `js/quest/view.js` (+ ggf. `js/quest/draw.js`), `css/quest.css` |
| App | `js/app.js`, `index.html`, `js/screens.js`, `js/ui.js`, `js/map.js`, `js/flight.js`, `js/audio.js`, `css/app.css`, `css/screens.css`, `style.css`, `README.md` |

**Debug-Knöpfe** (App):
- „Haunebu 10 Min“
- „Alle Arenen meistern“
- „Quest starten“ (wählt eine Mission und startet direkt)
- „Lockmodul an“

## §8 Tests

- **Logik:** summonCost-Reihe, buyItem, Fenster und Grenzen, startBeam ohne bzw. mit Fenster, Migration v7 → v8, lureWave (alle neu, alle im Ring, keep), questsUnlocked, questResult, Erfolge, Tachionen-Balance-Simulation.
- **Quest-Engine:**
  - A* mit Türen und Ecken
  - Sicht hinter Wänden und Gas
  - suspicion bis Alarm, Goebbels Voll-Alarm, jede Kraft
  - Klau mit Abbruch, Abliefern, extract-Bedingungen, down/revive, Zeitablauf, Varianten deterministisch mit `rng`
  - jede Mission ist lösbar: Ein Pfad von P zu jedem Ziel existiert, auch ohne L-Türen.
- **Online:** Signatur gültig/ungültig, Schema-Ablehnung, Merge-Regeln, Nickname-Übernahme, Snapshot+Bus-Zusammenführung, Rate-Limit beim Senden (fetch gemockt).
