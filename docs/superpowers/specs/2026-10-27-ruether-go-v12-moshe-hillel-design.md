# Rüther GO v12: Moshe Hillel – Anzeige, Boss, Investment-Code, Quest „Rabino Empire HQ“

Stand 2026-10-27. Entwurf mit Sebi abgestimmt. Vorlage ist die Abzock-Anzeige „Der Investment-Code“ (Rabino Empire): Countdown „Angebot endet in“, „Letzte Exemplare“, 40 % Rabatt, „4,9/5 von über 1.000 Millionären“, zwei Geschenke (Premium-Geschenk zu Immobilien, Truhe mit Skripten und Vorlagen), „Anwendbar in ganz Deutschland“, 100 Seiten inklusive. Dazu seine KI-Erklärvideos: alter Mann mit schwarzem Hut mit breiter Krempe, weißer Vollbart, Nadelstreifenanzug, rote Krawatte, Hände reden mit, roter Sportwagen.

## §0 Grundsätze

- Der Witz geht auf den Abzock-Shop und das Genre der KI-Finanzvideos: Fake-Countdown, Fake-Bewertungen, Fake-Geschenke, dubiose Immobilien, schlechte Lippensynchronität, sechs Finger. Nie auf Juden. Keine Klischees über Juden, keine Sätze wie „das wollen die Juden nicht, dass du es weißt“, keine echten jüdischen Personen (kein Goldknopf, kein Teichtal), keine religiösen Symbole. Das Wort „jüdisch“ kommt nirgends vor.
- Moshes Bild: Pixel-Porträt nah an den Fotos (Hut, Bart, Anzug, Krawatte), würdevoll, ohne verzerrte Züge. Der Witz liegt im Shop und in den Videos, nicht im Gesicht.
- Wie überall: Deutsch, Pixel-Kneipen-Stil, keine Emojis in Bedienelementen, echte Gesichter der Rüthers nie verdeckt oder eingefärbt, alles läuft offline (auch Anzeige und Countdown, lokale Uhr).
- Bestehende Spieler verlieren nichts: Quest-Freischaltung (alle Arenen gemeistert) und Erfolge über „alle Arenen“ zählen die Anzeige-Arena nicht mit.

## §1 Die Anzeige auf der Karte

**Zeitplan** (lokale Uhr, in `save.ad`):
- `save.ad = { until, next, extended }`. Fehlt `save.ad` (Update oder Neuling nach dem Onboarding), startet das erste Fenster sofort beim nächsten Kartenbesuch.
- Fenster: `AD_MS` = 10 min. Läuft `until` ab und `extended` ist false: `extended = true`, `until += AD_EXTEND_MS` (5 min), Kopfzeile wird für 2 s „VERLÄNGERT! NUR FÜR DICH.“ Läuft es danach ab: Kopfzeile „LEIDER VERGRIFFEN“ für 3 s, dann weg. `next = now + AD_GAP_MIN + rand × (AD_GAP_MAX − AD_GAP_MIN)` mit 2 h / 3 h.
- Ist `now ≥ next`, öffnet das nächste Fenster (`until = now + AD_MS`, `extended = false`).
- Reine Funktion `adState(ad, now) → { phase: 'closed' | 'open' | 'extended' | 'gone', remaining }` in js/stops.js? Nein: eigene Datei `js/ad.js` (ohne DOM), damit sie testbar ist. app.js tickt sie im Sekundentakt mit `updateBanners`.
- Debug-Panel: Knopf `#dbg-ad` „Anzeige jetzt“ öffnet sofort ein Fenster.

**Karte** (`#ad` in index.html, Stil in css/app.css oder css/screens.css): nur auf `screen-map`, nie über Kampf, Fang, Quest, Flug oder Haunebu-Animation (gleiche `busy()`-Regel wie der Tagescheck; die Karte erscheint dann beim nächsten Kartenbesuch, der Countdown läuft trotzdem weiter).
- Schwarzer Kopfbalken: „ANGEBOT ENDET IN 00:09:58 · LETZTE EXEMPLARE · 40 % RABATT“ (Countdown tickt jede Sekunde).
- Darunter links das Buchcover (`art/ad-cover.png`), rechts klein der rote Sportwagen (`art/ad-car.png`) mit Zettel „Rückgabe bis 18 Uhr“.
- Text: „Der Investment-Code. Die finanzielle Wahrheit, die Immobilien in Reichtum verwandelt.“ und darunter „4,9/5 von über 1.000 Millionären · 2 Geschenke · Anwendbar in ganz Deutschland“.
- Knöpfe: „Jetzt sichern“ (primär) und „Kein Interesse“.
- „Kein Interesse“ klappt die Karte zu einem Badge `.ad-badge` „ANGEBOT 07:12“ unten rechts über der Tab-Leiste zusammen, solange das Fenster gilt. Tippen klappt wieder auf. Das Badge gilt pro Fenster (nicht gespeichert). Die Verlängerung („VERLÄNGERT! NUR FÜR DICH.“) und „LEIDER VERGRIFFEN“ klappen die Karte trotz „Kein Interesse“ wieder auf: die Anzeige ist aufdringlich, das ist der Witz.
- Passt bei 375×667 ohne Überlappung mit HUD, Banner und Tab-Leiste.

**„Jetzt sichern“** startet den Kampf gegen Moshe über die bestehende Arena-Maschine: `AD_ARENA = { id: 'anzeige', name: 'Rabino Empire', boss: 'moshe', virtual: true }` in js/data.js. `AD_ARENA` steht in `ARENA_BY_ID` (damit `save.arenaLevels.anzeige`, `arenaMastered.anzeige`, Online-Ereignisse und Nachschlagen funktionieren), aber **nicht** in `ARENAS` (kein Marker, kein Eintrag in Listen, kein stationierter Rüther, zählt nicht für „alle Arenen“). Level 1 bis 5 wie andere Arenen, Sieg hebt das Level, Level 5 gewonnen = gemeistert. Belohnung bei Sieg wie ein Arena-Sieg des Levels. Innerhalb eines Fensters darf man es nach einer Niederlage erneut versuchen; kein Team-Rüther wird stationiert, kein „Erobert“-Marker.
- Kampf-Hintergrund `art/bg-anzeige.png`: die Verkaufsseite (schwarzer Balken mit Countdown oben, Rabino-Empire-Schriftzug, Sterne), ohne lesbaren Text, der mit der UI kollidiert.
- Intro-Spruch beim Kampfstart: „Sie haben bestellt. Jetzt zahlen Sie.“ Wut (unter 50 %, `CONST.RAGE_AT` wie bei allen Bossen): „Das Angebot ist gleich vorbei!“

## §2 Boss Moshe Hillel (js/data.js `BOSSES.moshe`)

```js
moshe: {
  id: 'moshe', name: 'Moshe Hillel', btc: 800,
  fast: { name: 'Letzte Exemplare!', damage: 16, every: 2300, warn: 800, fx: 'books',
    flavour: ['Nur noch 3 Stück!', 'Über 1.000 Millionäre können nicht irren.', '40 % Rabatt, aber nur heute.'] },
  charged: [
    { name: 'Investment-Code', damage: 15, warn: 1200, sats: { pct: 0.1, max: 500, min: 50 }, fx: 'code' },
    { name: 'Anruf aus Zypern', damage: 10, warn: 1200, stun: 2500, fx: 'phone' },
    { name: 'Telegram-VIP-Gruppe', damage: 10, warn: 1200, poison: { perSec: 4, ms: 6000 }, fx: 'telegram' },
  ],
}
```
800 BTC liegt zwischen Hitler (600) und Tachionenbitcoin (1100). Warnzeiten wie bei den anderen Bossen seit v11 (schnell 800, Laden 1200), damit die neue Abwehr greift. Die Lade-Attacken kommen abwechselnd wie überall.

**Immobilien** (js/data.js `IMMOBILIEN`), je Treffer eine andere, Reihenfolge per rng, ohne Wiederholung bis alle durch sind:
„Eigentumswohnung Duisburg-Marxloh, 3. OG, ohne Boden“ · „Reihenhaus Gelsenkirchen, Keller unter Wasser“ · „Garage Bottrop, ohne Tor“ · „Dachgeschoss Herne, ohne Dach“ · „Parkplatz Hagen, auf dem Radweg“ · „Ferienwohnung Castrop-Rauxel, Blick auf die A42“ · „Bauland Oberhausen, unter dem Gasometer“.

**Engine (js/battle.js)**, Attacken-Feld `sats`:
- `createBattle({ …, sats })` bekommt den aktuellen Kontostand (Zahl, Standard 0). `s.satsLost = 0`.
- Trifft eine Attacke mit `sats` (weder normal noch perfekt ausgewichen; normales Ausweichen lässt zwar 25 % Schaden durch, aber **kein** Geld): `amount = min(max, floor(pct × (sats − s.satsLost)))`. Ist `sats − s.satsLost < min`: `amount = 0` und `note: 'Dann eben Ratenzahlung.'`. Sonst `note` = nächste Immobilie. Event `{ type: 'satsLost', amount, note }`, `s.satsLost += amount`.
- Alles Weitere (Konto, Rückzahlung) macht app.js; die Engine bleibt ohne Spielstand. Duell (js/duel.js) ignoriert `sats` (dort gibt es keinen Moshe).

**app.js**: Bei `satsLost`: `save.sats -= amount`, persist, HUD. Am Kampfende: Sieg → `refund = satsLost + floor(satsLost × 0.1)` (Konstante `CONST.AD_RENDITE` = 0.1), `save.sats += refund`, Ergebniszeile „Immobilien verkauft: +X Sats (10 % Rendite)“. Niederlage, Zeit abgelaufen, Aufgeben → Zeile „In Immobilien verloren: X Sats. Rückgabe ausgeschlossen.“ Ohne Verlust keine Zeile.

**Darstellung (js/battle-ui.js, css/battle.css)**, alles unter echten Gesichtern, nie darüber:
- `books`: Buch (`art/fx-book.png`) fliegt im Bogen auf mich, wie die Blu-ray der PS3.
- `code`: Kaufvertrag (`art/fx-contract.png`) fliegt auf mich; bei Treffer Stempel „VERKAUFT“ und schwebender Text „−300 Sats · Eigentumswohnung Duisburg-Marxloh, 3. OG, ohne Boden“ (zwei Zeilen, nie über einem Gesicht). Beim Ausweichen „Nicht unterschrieben.“
- `phone`: Handy (`art/fx-phone.png`) klingelt und wackelt neben meinem Rüther, Sprechblase von Moshes Seite „Herzlichen Glückwunsch, Sie wurden ausgewählt!“; während der Betäubung steht am Rüther „am Telefon“.
- `telegram`: Sechs Benachrichtigungskarten stapeln sich am linken Bühnenrand (eine je Sekunde, synchron zum Gift), z. B. „Rabino Empire VIP: Willkommen!“, „Thomas: Danke Moshe!!!“, „Admin: Nur heute 40 %“, „Kevin: Lambo bestellt“, „Admin: Wer ist noch dabei?“, „Moshe: Schreib CODE“. Nach 6 s verschwinden sie.
- Chip unter dem Timer, sobald `satsLost > 0`: „Immobilien: −740 Sats“, zählt mit.

## §3 Shop: „Der Investment-Code“

- Shop-Eintrag (bestehende Shop-Struktur in js/data.js und js/screens.js): id `investmentcode`, Name „Der Investment-Code“, Preis 4.999 Sats, Streichpreis „statt 8.333“, Zeile „40 % Rabatt · Angebot endet in 02:59:59“, der Countdown tickt und läuft immer wieder von vorn (`3 h − (now mod 3 h)`, rein optisch). Beschreibung: „Die finanzielle Wahrheit, die Immobilien in Reichtum verwandelt. 100 Seiten inklusive. 2 Geschenke.“
- Kauf einmalig (`save.items.investmentcode = 1`), danach steht „Gekauft“ und ein Knopf „Lesen“. Toast nach dem Kauf: „Danke für Ihren Einkauf. Versand aus Zypern.“ Erfolg „Reingefallen“.
- **Lesen** (Popup mit Blättern, Knöpfe „Zurück“ / „Weiter“ / „Zu“):
  - Seite 1: „Trick 1: Verkaufe ein Buch.“
  - Seiten 2 bis 99 (eine Ansicht): „Platz für deine Notizen.“
  - Seite 100, Impressum: „Rabino Empire Ltd., Limassol, Zypern. Keine Anlageberatung. Rückgabe ausgeschlossen.“ Darunter: „Das ist die Adresse. Die Mission „Rabino Empire HQ“ ist freigeschaltet.“
  - Beilage „2 Geschenke“: „Premium-Geschenk zu Immobilien: Flyer „Eigentumswohnung Duisburg-Marxloh, 3. OG, Boden optional““ und „Truhe mit Skripten und Vorlagen: Mahnung.docx“.
- **Verkaufen** für 10 Sats, „gebraucht, ohne Lesespuren“ (Bestätigung per Popup). Danach ist das Buch weg und die Quest wieder gesperrt; erneut kaufen geht.

## §4 Quest „Rabino Empire HQ“ (js/quest/missions.js, engine.js, view.js, draw.js, css/quest.css)

- `id: 'rabino'`, Name „Rabino Empire HQ“, Ort „Limassol, Zypern“, Thema `zypern` (neue Palette in draw.js: weiße Bürowände, helle Fliesen, Palmen vor den Fenstern, Meerblau draußen, Plakate „Rabino Empire“ als Deko-Kacheln ohne lesbaren Text).
- Freischaltung: wie alle Quests (alle echten Arenen gemeistert, Haunebu) **und** `needsItem: 'investmentcode'`. In der Missionsliste ohne Buch gesperrt mit Text „Die Adresse steht im Impressum des Investment-Codes (Shop).“
- Auftrag `{ type: 'steal', min: 3, label: 'Geldsäcke zurückholen' }` wie beim Tachionenraub: Im Keller stehen 6 Tresore (`q-vault`), knacken dauert 6 s, der Sack (`q-sack`, neue Grafik) wird zur Haunebu getragen. Die Deobombe lohnt sich beim Knacken.
- Belohnung in js/progress.js wie `tachionenraub`: `rabino: { coin: 500, base: 0, done: 2000 }` (je Sack 500, ab 3 Säcken 2.000 extra). Jedes Video (siehe unten) zieht 1.000 ab, nie unter 0.
- Intro: „Im Impressum stand Limassol. Da sitzt Rabino Empire und zählt eure Sats. Knackt die Tresore im Keller, schleppt die Säcke zur Haunebu, und geht Moshe aus dem Weg: Wer ihm in die Arme läuft, muss sein neues Video gucken.“
- Hinweis: „Tresor knacken dauert 6 s, die Deobombe hilft. Etwa alle 25 s dreht Moshe ein Video und sieht nichts, danach ist er 10 s schneller. Jedes Video kostet 1.000 Sats Belohnung.“
- Karten: mindestens 2 Layouts („Großraumbüro“: Schreibtischreihen als Deckung, Tresore im Keller hinten; „Nachtschicht“: weniger Berater, längere Wege) mit je mindestens 2 Varianten plus Spiegelung, wie bei den anderen Missionen. Startplattform mit 9 Feldern (Koop). Alle Tresore erreichbar, alle Wege geprüft wie in den bestehenden Missions-Tests.

**Gegner**:
- `berater` (Headset, glänzender Anzug, `art/q-berater.png`): sight 6, angle 70, speed 2.4, hp 60, dps 5. Sprüche: „Haben Sie kurz Zeit?“, „Ihr Berater ist gleich bei Ihnen.“, „Das Angebot gilt nur heute.“, Alarm: „Ein Interessent!“
- `moshe` (`art/q-moshe.png`), Spezialgegner wie Stefan: sight 6, angle 70, speed 2.2, hp 150, `catches: 'video'`, `coffee`-Mechanik wiederverwendet: alle 25 s bleibt er 5 s stehen und dreht ein Video (Kegel aus, Handy vor dem Gesicht statt Kaffeebecher), danach 10 s schneller und weiter sehend. Beschriftungen statt Depot-Kursen: crash „+1 Video“, panik „ANGEBOT!“, insider „Code?“. Nicht kündbar (Feierabend), wie Stefan.
- Engine: `catches: 'video'` läuft wie `kieser` (Pause, Zwischensequenz, `resume`), aber mit eigenem Zähler `st.videos` und Event `{ type: 'video', unit, enemy, count, x, y, say }`. `st.kieser` und der Erfolg „Stammkunde bei Kieser“ bleiben unberührt. `questResult` zieht `videos × 1000` ab wie bei Kieser. Koop: Gast bekommt die Szene über die Events wie bei `kieser`.

**Zwischensequenz „Sein neues Video“** (view.js `videoScene`, 7 s, Tippen ab 0,6 s überspringt, danach Schnitt zurück wie `kieserScene`):
- Hintergrund `art/bg-video.png`: Moshe vor dem roten Sportwagen, Hochkant-Handy-Rahmen um die Szene.
- Moshe gestikuliert (zwei Hand-Frames im Wechsel), ein Mund-Overlay klappt in einem anderen Takt als der Untertitel (absichtlich asynchron).
- Einmal pro Szene blitzt für 0,4 s eine Hand mit sechs Fingern auf.
- Untertitel tippen sich unten ein, mit Tippfehlern: zuerst immer „Diese 3 Trcks verschweigen dir die Banken“, dann ein Spruch aus dem Pool, pro Szene der nächste: „Ich habe mit 3.000 Euro angefangen. Heute besitze ich 14 Wohnungen in Marxloh.“ · „Dieser Trick ist in Deutschland völlig legal, nur kennt ihn keiner.“ · „Mein Großvater sagte immer: Immobilien lügen nicht. Er hatte keine.“ · „Schreib CODE in die Kommentare.“ · „Nur noch heute. Morgen auch, aber nur noch heute.“
- Stempel: „Video Nr. N“ und „−1.000 Sats“. Der erwischte Rüther steht klein am Rand und schaut aufs Handy (echtes Gesicht, nicht verdeckt).
- Texte in `missions.js` unter `texts.video` wie `texts.kieser`, Fallback in view.js.

## §5 Grafiken (art/)

Alle im Stil der bestehenden Pixelgrafiken, PNG, transparent wo sinnvoll, ohne eingebackenen Text (Text kommt aus CSS):
- `boss-moshe.png` 256×256 (Kampf-Porträt wie `boss-satoshi.png`): Hut mit breiter Krempe, weißer Bart, Nadelstreifen, rote Krawatte, Hände offen, goldenes Buch.
- `bg-anzeige.png` 1280×720 (Kampf-Hintergrund Verkaufsseite).
- `ad-cover.png` (Buchcover, dunkelblau mit goldenem Rahmen, Skyline, Porträt klein) und `ad-car.png` (roter Sportwagen, Zettel an der Scheibe).
- `fx-book.png`, `fx-contract.png`, `fx-phone.png` (Requisiten im Kampf, Größe wie `fx-disc`/`fx-chain`).
- `q-berater.png`, `q-moshe.png` 64×64 (Quest-Sprites wie `q-bernd.png`), `q-sack.png` (Geldsack, wie `q-coin.png`).
- `bg-video.png` (Zwischensequenz, Hochformat-tauglich wie `bg-kieser.png`).
- Erzeugung: Bildmodell über die verfügbaren MCP-Werkzeuge (ToolSearch „generate_image“) mit Pixel-Art-Vorgabe, Nachbearbeitung mit PIL (Freistellen, Größe, Palette). Fallback komplett mit PIL wie `boss-hitler.py`. Keine echten Fotos ins Repo (die Vorlagen liegen nur im Scratchpad bzw. in `moshehillel.jpg` im Root, das ist per .gitignore ausgeschlossen).

## §6 Erfolge (js/data.js ACHIEVEMENTS, js/quests.js Bedingungen)

- `reingefallen` „Reingefallen“: Investment-Code gekauft.
- `nichtreingefallen` „Nicht reingefallen“: Moshe einmal besiegt (`save.stats.moshe ≥ 1`, Zähler in app.js).
- `rabino` „Rabino Empire gestürzt“: `arenaMastered.anzeige`.
Icons aus dem vorhandenen Icon-Satz.

## §7 Versionsmeldung

`VERSION = 12`, `NEWS` in js/app.js, `version.json` (v 12, apk-URL app-v12), `native/android/app/build.gradle` versionCode/versionName 12. News-Zeilen: „Moshe Hillel: Alle paar Stunden findet dich seine Anzeige. Jetzt sichern heißt kämpfen, sein Investment-Code nimmt dir echte Sats, Ausweichen rettet sie.“ · „Im Shop gibt es den Investment-Code, 100 Seiten inklusive. Im Impressum steht, wo die neue Mission „Rabino Empire HQ“ spielt.“

## §8 Tests und Abnahme

- `test/moshe.test.mjs`: Engine `sats`: Treffer → `satsLost` mit `min(max, floor(pct × Konto))`, normales und perfektes Ausweichen → kein Verlust, Konto unter `min` → 0 mit Hinweis, Immobilien ohne Wiederholung; Rückzahlung bei Sieg +10 %; `adState` deterministisch (geschlossen → offen → verlängert → vergriffen → nächstes Fenster); Shop kaufen/lesen/verkaufen setzt und löscht das Item und die Quest-Freischaltung; `needsItem` sperrt und entsperrt; `questResult` zieht je Video 1.000 ab, nie unter 0; Erfolge; Spielstand-Migration behält `arenaLevels.anzeige`, und „alle Arenen gemeistert“ ignoriert `anzeige`.
- Missions-Tests wie für die bestehenden Missionen (Layouts parsen, Startplattform 9 Felder, Tresore erreichbar, Spiegelung).
- Bestehende Tests bleiben grün (`node --test test/*.test.mjs`), `node --check` auf allen js, danach `python tools/make_sw.py`.
- Bewusste Ausnahme: test/dodge.test.mjs prüft Wischen im Takt (700/1000/1300 ms) gegen 0,55 statt 0,5. Moshes `fast.every` 2300 resoniert mit dem 1300-ms-Takt (Moshe allein 0,91, Schnitt über alle Gegner 0,51; mit every 2400 wären es 0,46, die Resonanz läge dann nur bei 1350–1400 ms statt auf einem der drei Probe-Takte). Der Test ist ein grober Rauchtest über alle Gegner, kein Schutz je Boss und Takt; `every` bleibt 2300 (§2).
- Abnahme im Browser (headless Playwright, 390×844 und 375×667, Requests nach außen blockiert, Service Worker blockiert, `?debug=1`): `#dbg-ad` → Karte erscheint → „Kein Interesse“ → Badge → Badge → Karte → „Jetzt sichern“ → Kampf: Treffer des Investment-Codes senkt `save.sats`, Ausweichen nicht; Sieg (Debug „Boss fast tot“) → Rückzahlung in der Ergebnisanzeige; Level steigt. Countdown-Ablauf (Zeit vorstellen) → „Verlängert“ → „Vergriffen“. Shop → kaufen → lesen (alle Seiten) → Quest in der Liste frei → Quest per Debug starten → von Moshe erwischen lassen → Videoszene (Screenshots bei 1, 3, 5, 6,5 s) → Mission beenden → Abzug sichtbar. Verkaufen → Quest wieder gesperrt. Keine Konsolenfehler, keine Gesichter verdeckt, keine Überlappungen.

## §9 Dateien und Zuständigkeit (für die Umsetzung in parallelen Bausteinen)

- **Fundament** (zuerst, allein): js/data.js (`BOSSES.moshe`, `IMMOBILIEN`, `AD_ARENA` in `ARENA_BY_ID`, `CONST.AD_*`, `CONST.AD_RENDITE`, Shop-Eintrag, Erfolge), js/progress.js (`rabino`-Belohnung, Item), js/quests.js (Erfolgs-Bedingungen), js/ad.js (`adState`), Migration für `save.ad`.
- **Boss & Kampf**: js/battle.js, js/battle-ui.js, css/battle.css, test/moshe.test.mjs (Engine-Teil).
- **Anzeige, Shop, Buch, Kampfanbindung**: js/app.js, js/screens.js, index.html, css/app.css, css/screens.css, Tests (Anzeige, Shop).
- **Quest**: js/quest/missions.js, js/quest/engine.js, js/quest/view.js, js/quest/draw.js, css/quest.css, Missions-Tests.
- **Grafiken**: art/ (siehe §5), Erzeugungsskripte unter tools/ oder art/*.py.
- Tabu für alle (parallel laufender Multiplayer-Workflow): js/net/, js/lobby.js, js/duel.js, js/duel-ui.js, css/duel.css, js/quest/coop.js, js/quest/race.js, native/, test/net|lobby|duel|coop.test.mjs.
