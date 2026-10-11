# Rüther GO v9: Neue Missionen, mehr Abwechslung, Wirtschaft

Stand 2026-10-11. Sebi (/goal: komplett umsetzen, testen, verbessern):

1. **Mission Viktor solo:** Am Campingplatz an der Mosel die 3 Wasserverbindungen kappen, damit Viktor nicht duschen muss.
   - Sehr große Karte, **keine Zeitbegrenzung**.
   - **Besonderer NPC:** eine Wache, die immer wieder einen **Bulletproof Coffee** trinkt. Erwischt er dich, folgt eine **Cutscene**: Du musst mit ihm zum **Kieser-Training**.
   - Die anderen Gegner sind normal bösartig.
   - Belohnung 10–12k Sats, jedes Kieser-Training kostet 1k, gedeckelt bei 10k.
2. **Mission Bruch Worringen:** 3 Bäume in Brand setzen. Die Mission zahlt jedes Mal 6,5k aus. **Wirst du erwischt, kostet das 10.000 Sats Strafe.** Die Gegner sind die **Ranger vom Bruch**.
3. **Lockmodul** buffen: etwa **3 Spawns jede Minute**, mit normalen Seltenheiten.
4. **Haunebu:**
   - Nach einer Quest ist sie **nicht** weg, die 10 Minuten bleiben.
   - Besitzt du sie schon, **verlängert sie sich für 5k um weitere 10 Minuten**.
5. **Super-Münze:** Fangchance +50 %, kostet 500 Sats. **Lockmodul** kostet 1000 Sats.
6. **Mehr Wiederspielwert:** Die bestehenden Missionen bekommen **mehrere Karten-Varianten bzw. Spawn-Varianten** statt immer nur einer Karte.
7. *(Später, nicht in diesem Lauf):* Das Fähigkeiten-System wird überarbeitet und erweitert, erst wenn 1–6 komplett laufen. Darauf jetzt schon Rücksicht nehmen, also keine Sackgassen bauen, aber noch nichts daran umbauen.

**Schon in `js/data.js` eingetragen** (Agenten ändern data.js nicht): `CONST.SUPERCOIN_BONUS 0.5`, `CONST.LURE_INTERVAL 60_000`, `LURE_WAVE 3`, `LURE_MAX 15`, `HAUNEBU_EXTEND_COST 5000`, `HAUNEBU_EXTEND_MS 600_000`, `SHOP` mit den Preisen 1000/500/5000 und die neuen Texte.


> **Name (Sebi, 2026-10-11):** Der Kaffee-NPC heißt **Stefan**, nicht „Bulletproof-Bernd“. Alle sichtbaren Texte (Name im Spiel, Sprüche, Briefings, Cutscenes, Missionsliste, Erfolge, README) sagen „Stefan“. Interne IDs und Dateien (`bernd`, `q-bernd.png`, `boss-bernd.png`) dürfen so bleiben. Jedes sichtbare „Bernd“ ist ein Befund.
> **Stefans Sprüche (Sebi, 2026-10-11):** Stefan redet **nur** darüber, wie breit er nach dem Kieser-Training ist (so breit, dass er durch keine Tür mehr passt) oder dass er einen Bulletproof Coffee will bzw. trinkt. **Nichts über Viktors Geruch oder übers Duschen.** Das gilt für Engine-Lines, Cutscene-Blasen, Briefing-Zitate und Toasts. Viktors eigene Sprüche (z. B. „Ich wollte doch nur nicht duschen …“) dürfen bleiben.

## §0 Regeln (gelten weiter)

- **Echte Gesichter und Humor sind der Kern.** Wo ein Rüther auftaucht, ist sein echtes Gesicht zu sehen (`sprites/<id>.png`), auch in Cutscenes. Generiert werden nur Gegner, Kulissen, Requisiten und Icons.
- **Keine NS-Symbole**, nirgends. Pixel-Kneipe-Stil: keine Emojis in Bedienelementen, keine weichen Verläufe. Mobil zuerst: 390×844 und 375×667.
- **Fotos nie committen.** Lokal offline. Nie in das echte ntfy-Topic schreiben.
- **Marken:** „Kieser-Training“ und „Bulletproof Coffee“ kommen nur als Text vor. Logos werden nicht nachgebaut.

## §1 Wirtschaft

- **Super-Münze:** +50 % Fangchance (`SUPERCOIN_BONUS`). Die Obergrenze `MAX_CATCH_CHANCE` bleibt. Preis 500. Alle Texte und Anzeigen, die „+20 %“ nennen, werden angepasst (Fang-Screen, Shop, Tests).
- **Lockmodul** (1000 Sats, 5 Minuten):
  - Beim Kauf kommt sofort eine Welle, danach **jede Minute eine Welle** mit **3 neuen** Rüthern im Ring `LURE_RING` (12–90 m, in Fangreichweite).
  - Die Seltenheit wird **normal gewürfelt** (`rollRarity`).
  - Die **vorhandenen Spawns bleiben** mit ihrer normalen Lebensdauer. Höchstens `LURE_MAX` (15) Spawns liegen gleichzeitig herum. Ist die Grenze erreicht, fallen die ältesten heraus, aber nie der gerade offene.
  - Die Abstands- und Zoom-Regeln aus v8 gelten weiter: Gesichter überlappen nicht, alle sind im Bild.
  - Das Banner zeigt „Lockmodul 4:12 · nächste Welle 0:42“.
  - Die reine Funktion in `spawn.js` (`lureWave`) liefert **nur die neuen** Spawns. Die App hängt sie an.
- **Haunebu:**
  - **Eine Quest verbraucht die Haunebu nicht mehr.** `consumeHaunebu` fällt beim Quest-Start weg.
  - Zum Start einer Quest muss das Fenster aktiv sein. Läuft es während einer Quest ab, läuft die Quest weiter, der Rückflug wartet (`screen-quest` steht in BEAM_WAIT).
  - **Nach einer Quest:**
    - Ist das Fenster noch aktiv, fliegt die Haunebu dich zurück an den Ort vor der Quest (Arena-Beam bzw. zu Hause), und das Fenster läuft weiter.
    - Ist es abgelaufen, geht es wie bisher nach Hause zurück.
  - **Verlängern:**
    - `extendHaunebu(save, now)` geht nur bei aktivem Fenster und ≥ `HAUNEBU_EXTEND_COST` Sats. Dann gilt `haunebuUntil += HAUNEBU_EXTEND_MS`, ohne Hitler-Kampf und ohne Preissteigerung.
    - Rückgaben: `{ok:false, reason:'keine'|'sats'}` bzw. `{ok:true, until}`. Ein aktiver Beam übernimmt das neue `until`.
  - **Shop:**
    - während des Fensters: „Im Einsatz · noch 7:41“ plus Knopf „+10 Min · 5.000“,
    - sonst „Beschwören · x Sats“.
  - Der Countdown-Chip bekommt dieselbe Verlängern-Option.

## §2 Mehr Wiederspielwert für alle Missionen

- **Neues Missionsformat:** Jede Mission hat **`layouts`**, also **mindestens 2 verschiedene, handgebaute Karten**. Jedes Layout hat eigene `map`-Zeilen, Pad, Tor und **mindestens 2 `variants`** (Gegner, Patrouillen, Beute- und Zielplätze).
  - Bei jedem Start wird gewürfelt:
    - ein Layout,
    - eine Variante,
    - **gespiegelt ja/nein** (waagerecht spiegeln: Karte, alle Koordinaten und Blickrichtungen; Texte bleiben),
    - **Patrouillen-Versatz** (jede Wache startet an einem zufälligen Punkt ihrer Route),
    - bei Beute-Missionen eine **zufällige Teilmenge der Beute-Plätze**.
  - Das ergibt pro Mission mindestens 2 × 2 × 2 Grundkombinationen und dazu Zufall.
- **API:** `pickSetup(mission, rng)` liefert `{ layoutId, variantId, mirror, seed }`. `createQuest({ mission, setup, team, rng })` baut daraus deterministisch den Zustand. `setup` gehört in `onEnd`. Alte Aufrufe mit `variant` dürfen weiter funktionieren, oder die Integration stellt sie um.
  - Die Briefing-Karte zeigt Layout- und Variantenname.
  - Die Missionsliste zeigt „Karten: n · Varianten: m“ und den Bestwert.
- **Die 4 bestehenden Missionen** (Tachionenraub, Hangar, PS3, Keller) bekommen je **mindestens 1 neues Layout** mit **2 Varianten**. Das bisherige Layout bleibt als Layout 1 mit seinen 3 Varianten. Die neuen Karten sind wirklich anders: andere Raumaufteilung, andere Wege und L-Abkürzungen, andere Deckung.
- **Tests:** Jedes Layout × jede Variante × gespiegelt und ungespiegelt ist **lösbar**, das heißt ein Pfad von P zu allen Zielen existiert auch ohne L-Türen. Gleicher Seed ergibt gleichen Zustand. Spiegeln verändert keine Lösbarkeit.

### §2.1 Formate und Schnittstellen (verbindlich für Engine-, Missions- und UI-Agent)

**`js/quest/missions.js`** gehört dem Missions-Agenten.

- **Mission:**
  - `{ id, name, place, theme, lat, lon, timeMs, solo?, objective:{type, min?, label}, intro, hint, texts:{success, fail, …}, reinforce?, layouts:[…] }`
  - `timeMs: null` heißt keine Zeitgrenze.
  - `objective.type` ∈ `steal|sabotage|fetch|unplug|valve|ignite`.
- **Layout:**
  - `{ id, name, map: string[], gate:[x,y], coins?, variants:[…] }`. Bisher standen `map`, `gate`, `coins` und `variants` direkt an der Mission. Sie wandern ins **Layout 1**.
- **Variante:**
  - `{ id, name, desc, coins?, enemies:[{ type, at, dir, patrol?, look? }] }`, wie bisher.
- **Kacheln:**
  - bisher: `# . D L P C S X K ~`
  - **neu:**
    - `V` Wasseranschluss (Ziel, nicht begehbar, man interagiert von nebenan)
    - `B` Baum zum Anzünden (Ziel, blockiert Weg und Sicht)
    - `W` Wasser (nicht begehbar, Sicht frei)
    - `T` Baum oder feste Deko (blockiert Weg und Sicht)
- **Exporte:**
  - `MISSIONS`, `MISSION_BY_ID`
  - `pickSetup(mission, rng) → { layoutId, variantId, mirror, seed }`
  - `buildSetup(mission, setup)` liefert `{ layout, variant, map, gate, enemies, coins, mirror }`.
    - Es arbeitet rein und deterministisch mit `seed`.
    - Beim Spiegeln werden `map`-Zeilen umgedreht und alle x-Koordinaten zu `w-1-x`, Richtungen zu `180-dir`, auch in den Patrouillen.
    - Der Patrouillen-Versatz pro Wache kommt aus `seed`.
    - Bei `steal` wählt es eine zufällige Teilmenge der Tresor-Füllungen, mindestens `objective.min` + 2 Münzen insgesamt.
  - `pickVariant` darf als Kompatibilität bleiben.

**`js/quest/engine.js`** gehört dem Engine-Agenten.

- `createQuest({ mission, setup, team, rng })`:
  - Ohne `setup` würfelt es `pickSetup(m, rng)`.
  - Es baut aus `buildSetup` und kennt die neuen Kacheln und Ziele.
  - `state.setup`, `layoutId` und `mirror` stehen im Zustand, und das `end`-Event bzw. die Zusammenfassung enthält `setup`, `kieser` und `fine`.
- **Neue Gegnertypen in `ENEMY_TYPES`:**

  | Typ | Merkmal |
  |---|---|
  | `bernd` | `coffee:{ every:[20000,30000], ms:5000, boost:10000, speed:1.5, sight:1.3, angle:1.2 }`, `catches:'kieser'` |
  | `camper` | – |
  | `dackel` | `bark:true`: Geräusch mit Radius 6 bei Sichtung |
  | `platzwart` | `whistle:0.5` |
  | `ranger` | `catches:'caught', fine:10000` |

  Alle Typen haben `lines` (sus, alert, calm, wake, bei Stefan zusätzlich `coffee`) und `sprite`, also `q-<typ>`.
- **Neue Events:**
  - `coffee` mit Start und Ende samt Position
  - `caffeinated`
  - `kieser` mit `{unit, count}`. Die Engine setzt `state.paused = 'kieser'`, bis die UI `{type:'resume'}` schickt. Danach steht die Einheit an der Plattform, Stefan ist zurückgesetzt, die Gegner sind ruhig.
  - `caught` mit `{by, unit, fine}`. Darauf folgt sofort `end` mit `result:'fail'`, `reason:'caught'`, `fine`.
  - `valve`, `ignite`, `fireSpotted`
  - `bark`, `whistle`
- **`solo`:** Das Team besteht nur aus der einen Einheit. Ist `solo` gesetzt und die Einheit down, folgt `fail`.

**`js/quest/view.js` und `draw.js`** gehören dem UI-Agenten.

- `start({ mission, setup, team, fighters, rng, tutorial })`.
- `onEnd` bekommt zusätzlich `setup`, `kieser` und `fine`.

## §3 Neue Mission „Nie wieder duschen“ (Viktor solo)

- **Grunddaten:** `id: 'camping'`, Ort „Campingplatz an der Mosel“ (lat 50.1447, lon 7.1667), Theme `mosel`.
- **Solo:** `solo: 'viktor'`. Es spielt nur Viktor, die Team-Wahl entfällt. Genommen wird sein stärkstes Exemplar. Ohne Viktor in der Box ist die Mission gesperrt: „Fang erst Viktor“.
- **Ziel:** **3 Wasseranschlüsse abdrehen** (Kachel `V`, 4 s je Anschluss, Animation: Wasser spritzt, versiegt, Ventil zu). Danach zurück zur Haunebu-Plattform und abheben.
- **Keine Zeitbegrenzung** (`timeMs: null`). Das HUD zeigt statt der Zeit „Keine Eile“.
- **Sehr große Karte:** **mindestens 64×48 Kacheln**, 2 Layouts.
  - Zeltwiese mit Zelten als Deckung `~`, Wohnwagen-Reihen (Wände), Hecken, Kieswege, ein Sanitärgebäude mit Duschen (ein Anschluss steckt dort), Rezeption, Spielplatz, Grillplatz, Weinberg-Hang mit Rebzeilen als Deckung und **die Mosel** als Wasserkante (`W` = nicht begehbar, blockiert keine Sicht) mit Steg.
  - Mehrere Wege und Schleichrouten. Die 3 Anschlüsse liegen weit auseinander.
  - Neue Kacheln dürfen dazukommen (`W` Wasser, `T` Baum oder Wand-Deko …). Engine und Zeichnen müssen sie kennen.
- **Stefan** (`type: 'bernd'` intern; überall angezeigt als „Stefan“), der Sonder-NPC:
  - Er läuft eine lange Wach-Runde über den Platz.
  - **Alle ~25 s** (zufällig 20–30 s) bleibt er stehen und trinkt seinen **Bulletproof Coffee**, 5 s lang: Becher, Dampf, „*schlürf*“. In der Zeit ist **der Kegel aus**, ein Zeitfenster zum Vorbeischleichen.
  - Danach ist er **10 s koffeiniert**: Tempo ×1,5, Sicht ×1,3, Kegel ×1,2, Zittern und Aura.
  - **Erwischt er Viktor** (alarmiert und berührt ihn, oder Misstrauen voll, wenn er direkt neben ihm steht), kommt das Event `{ type:'kieser', unit, count }`:
    - Die Engine pausiert.
    - Die UI zeigt die **Kieser-Cutscene**.
    - Danach steht Viktor mit voller HP **wieder an der Plattform**, Stefan geht zurück auf seine Runde, und alle Gegner beruhigen sich.
    - **Bereits abgedrehte Anschlüsse bleiben zu.** `state.kieser` zählt mit.
  - Stefans Sprüche (Auswahl, Engine-Lines):
    - sus: „Riech ich da Unrasiertes?“, „Wann warst du zuletzt duschen?“
    - alert: „HALT! Erst Kieser, dann Kaffee!“, „Zehn Wiederholungen, ganz langsam!“
    - Kaffee: „*schlürf* … mit Butter.“, „Bulletproof. Wie mein Rücken.“
- **Andere Gegner** sind normal bösartig, mit Alarm und Kampf wie bisher:
  - `camper`: Dauercamper mit Socken in Sandalen und Grillzange, Sicht 5 / 90°, Tempo 2,2
  - `dackel`: schnell, kleiner Kegel (Sicht 3 / 120°, Tempo 3,6), bellt bei Sichtung (Geräusch lockt andere an)
  - `platzwart`: Sicht 6 / 70°, Tempo 2,4, Trillerpfeife = Alarm +0,5

  Wird Viktor (solo) besiegt, ist die Mission gescheitert.
- **Belohnung:**
  - Erfolg: `max(10000, 12000 − 1000 × kieser)`.
  - Misserfolg oder Aufgeben: 10 % davon, wie bei den anderen Missionen, aber **nur mit Fortschritt** (mindestens 1 Anschluss zu, `score > 0`). Ohne Fortschritt gibt es 0 Sats und 0 XP, sonst wäre „Los!“ und sofort Aufgeben Gratisgeld, weil die Quest die Haunebu nicht mehr verbraucht.
  - Die Missionsliste zeigt „10.000–12.000 · jedes Kieser-Training −1.000“.
- **Kieser-Cutscene** (UI, 4 s, Tipp überspringt):
  - Bildfläche mit `art/bg-kieser.png` (Kraftraum mit Geräten, ohne Logo).
  - Stefan groß (`art/boss-bernd.png`) mit Kaffeebecher zieht **Viktors echtes Gesicht** (Rückansicht, `sprites/viktor.png`) hinter sich her.
  - Sprechblasen:
    - Stefan: „Erst Kieser, dann Kaffee!“
    - Viktor: „Ich wollte doch nur nicht duschen …“
    - Stefan: „Nach dem Training wird geduscht!“
  - Stempel „Kieser-Training #n · −1.000 Sats“. Ab dem 3. Mal lautet er „Kieser-Training #n · Belohnung bleibt bei 10.000“.
  - Danach folgt ein kurzer Schnitt zurück zur Plattform.

## §4 Neue Mission „Feuer im Bruch“ (Bruch Worringen)

- **Grunddaten:** `id: 'bruch'`, Ort „Worringer Bruch“ (lat 51.0668, lon 6.8395), Theme `bruch`: Wald, Sumpf, Schilf, Holzstege, Ranger-Hütte, Infotafeln. Normales 3er-Team, Zeit 6:00. Mindestens 2 Layouts mit je 2 Varianten (§2).
- **Ziel:**
  - **3 Bäume in Brand setzen** (Kachel `B`, 3 s anzünden). Animation: Flammen aus Pixeln, Rauchsäule, Funken.
  - Brennende Bäume bleiben brennend und zählen als erledigt.
  - Ein brennender Baum ist ein **Signal**: Ranger in 10 Kacheln bemerken ihn nach 5 s und laufen zum Löschen hin, das erzeugt Druck zum Abhauen.
  - Danach zur Plattform und abheben.
- **Gegner `ranger`** (Ranger vom Bruch): Fernglas, Sicht 8 / 50°, Tempo 2,3, Hut, Notizblock.
- **Erwischt:** Berührt ein **alarmierter** Ranger einen Rüther, kommt `{ type:'caught', by, unit }`:
  - Die Mission **endet sofort als Misserfolg mit Strafe**.
  - Die UI zeigt die **Erwischt-Cutscene**: Der Ranger zückt den Block, „Das wird teuer!“, Stempel „Erwischt! −10.000 Sats“, die echten Gesichter des Teams schauen betreten.
  - `onEnd` liefert `fine: 10000`.
  - `questResult` zieht die Strafe ab, ohne unter 0 Sats zu gehen. Die Missionsliste warnt mit „Erwischt: −10.000“.
- **Belohnung:** Bei Erfolg gibt es **jedes Mal 6.500** Sats (nicht nur beim ersten Mal). Misserfolg ohne Erwischen (Zeit um, Aufgeben, alle down) bringt 10 % von 6.500, aber nur mit Fortschritt (mindestens 1 Baum brennt, `score > 0`), sonst 0.

## §5 Darstellung

- **Neue Paletten und Kacheln** in `draw.js` für `mosel` und `bruch`: Gras, Kies, Wasser mit Wellen, Zelte, Wohnwagen, Hecken, Reben, Bäume, Schilf, Holzsteg.
  - Die großen Karten bleiben flüssig: Kachel-Cache in Offscreen-Canvas, nur Sichtbares zeichnen.
- **Minikarte:** Bei großen Karten (über 40 Kacheln breit) gibt es einen Knopf „Karte“.
  - Er öffnet eine verkleinerte Übersicht mit Rüthern, Zielen und bekannten Gegnern.
  - Antippen dort springt mit der Kamera hin.
- **Animationen:**
  - Stefan beim Kaffee: Becher, Dampf, „*schlürf*“. Koffeiniert: Zittern und gelbe Speed-Linien.
  - Wasseranschluss: Fontäne versiegt, Ventil zu, „Kein Wasser mehr!“.
  - Feuer: animierte Pixel-Flammen und Rauch, Ranger mit Feuerpatsche beim Löschen.
  - Dackel bellt mit „WAU!“-Ringen.
  - Kieser- und Erwischt-Cutscene als DOM-Overlay über dem Canvas.
- **HUD:**
  - „Keine Eile“ statt der Uhr, wenn `timeMs` null ist.
  - Bei `camping`: „Kieser: n“ mit dem aktuellen Belohnungsstand.
  - Bei `bruch`: Warnhinweis „Erwischt = −10.000“.

## §6 Grafiken (Higgsfield, Stil-Satz; PIL nur bei abgelehnten Motiven)

- **Quest-Sprites** (64×64, transparent, als kleine Figur auf der Karte lesbar):
  - `q-bernd.png`: drahtiger Fitness-Typ im Funktionsshirt mit großem Kaffeebecher
  - `q-camper.png`: Dauercamper mit Socken in Sandalen und Grillzange
  - `q-dackel.png`
  - `q-platzwart.png`: mit Trillerpfeife
  - `q-ranger.png`: mit Hut und Fernglas
  - `q-valve.png`: Wasseranschluss oder Standrohr mit Ventil
  - `q-tree.png`: großer Laubbaum (Draufsicht oder schräg)
- **Cutscenes:**
  - `boss-bernd.png` (256, wie Bosse): Stefan mit Bulletproof-Coffee-Becher
  - `bg-kieser.png` (1280×720): Kraftraum mit Trainingsgeräten, ohne Schrift und Logo
  - `bg-ranger.png` optional: Waldweg mit Infotafel ohne Schrift
- Alle mit dem Read-Tool prüfen: kein Text, keine Logos, keine Symbole. Einträge in `art/manifest.json` und `art/README.md` (Runde 5).

## §7 Logik (`js/progress.js`, `js/spawn.js`)

- **`questResult(save, missionId, result, score, alarmFree, extra = {})`** mit `extra.kieser` und `extra.fine`:
  - `camping`: `max(10000, 12000 − 1000 × kieser)`
  - `bruch`: `6500` je Erfolg, `fine` abziehen (dann kein Trostgeld)
  - Misserfolg und Aufgeben (alle Missionen): 10 % der Sats und XP **nur bei `score > 0`**, ohne Fortschritt 0 Sats und 0 XP.
  - `questLog` führt Bestwert, Anzahl Erfolge, Anzahl Kieser-Trainings und Strafen.
- **Erfolge** in `quests.js`: `kieser3` (≥ 3 Kieser-Trainings insgesamt laut questLog) und `bruch_clean` (Bruch erfolgreich und `alarmFree`). Die Einträge stehen schon in `ACHIEVEMENTS` in data.js. `quest_all` umfasst jetzt alle 6 Missionen.
- **`lureWave`** liefert nur neue Spawns (3), mit Seltenheiten über `rollRarity`. `extendHaunebu` wie in §1. Kein `consumeHaunebu` mehr beim Start (Funktion darf bleiben).
- **Tests:**
  - Lockmodul: additiv, Grenze, Seltenheiten über viele Seeds normal verteilt.
  - Verlängern: Fehlerfälle, Beam-`until`.
  - Quest-Belohnungen inklusive Deckel und Strafe nicht unter 0.
  - Super-Münze +50 %.

## §8 Zuständigkeiten

| Bereich | Dateien |
|---|---|
| Logik | `js/progress.js`, `js/spawn.js`, `js/quests.js`, `js/catch-logic.js` (falls Super-Münzen-Text/-Wert), `test/v9.test.mjs` (+ Anpassungen) |
| Quest-Engine | `js/quest/engine.js`, `js/quest/path.js`, `js/quest/missions.js`, `test/quest.test.mjs` |
| Grafik | `art/*` |
| Quest-UI | `js/quest/view.js`, `js/quest/draw.js`, `css/quest.css` |
| App | `js/app.js`, `index.html`, `js/screens.js`, `js/ui.js`, `js/map.js`, `js/catch.js`, `css/app.css`, `css/screens.css`, `README.md` |

**Debug-Knöpfe:**
- „Quest starten“ bekommt eine Auswahl: Mission, Layout und Spiegelung.
- „Stefan ruft“: löst die Kieser-Cutscene sofort aus.
