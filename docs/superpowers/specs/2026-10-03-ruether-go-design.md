# Rüther GO – Design-Spezifikation

Stand: 2026-10-03. Abgestimmt mit Sebi im Brainstorming.

## 1. Ziel

Pokémon-GO-Parodie als Web-App im Handy-Browser. Der Spieler fängt
**Rüthers** (fünf reale Personen als Pixel-Sprites) in der echten Welt und
besiegt **drei Arenen** an echten Adressen. Solo-Spiel: kein Server, kein
Login, Spielstand nur im Browser des Handys.

**Nicht-Ziele:** Mehrspieler, Server, Login, Leveln/Entwickeln, Offline-Modus,
App Store, wilde Kämpfe (Rüthers werden nur gefangen, nicht bekämpft).

## 2. Technik

- Reines HTML/CSS/JavaScript (ES-Module). Keine Build-Tools, kein Framework.
- Karte: Leaflet 1.9.x von unpkg, OpenStreetMap-Tiles.
- Ortung: `navigator.geolocation.watchPosition`. Braucht HTTPS oder localhost.
- Spielstand: `localStorage`, Schlüssel `ruether-go`, JSON.
- `manifest.json` für "Zum Startbildschirm hinzufügen". Kein Service Worker.
- Hosting: beliebiger statischer HTTPS-Host (z.B. GitHub Pages).
  Lokal: `python -m http.server 8000` → `http://localhost:8000`.

### Dateien

```
index.html          alle Screens als <section>, nur eins sichtbar
style.css
manifest.json
js/app.js           Start, Screen-Wechsel, verdrahtet die Module
js/data.js          Rüthers, Bosse, Arenen, Konstanten (reine Daten)
js/battle.js        Kampf-Engine, reine Logik, kein DOM
js/geo.js           Distanz (Haversine), Zufallspunkt im Ring, Ortung + Fake-Position
js/spawn.js         Spawn-Logik (welche Rüthers wo auftauchen), reine Logik
js/map.js           Leaflet-Karte, Marker für Spieler/Spawns/Arenen
js/catch.js         Fang-Screen
js/screens.js       Team-, Arena-Info-, Kampf-, Sieg-Screen (DOM)
js/storage.js       laden/speichern mit try/catch
sprites/<id>.png    256×256, pixelated
tools/pixelate.py   erzeugt sprites/ aus den Fotos und zeichnet Platzhalter/Bosse
test/battle.test.mjs
test/spawn.test.mjs
```

## 3. Daten

### Rüthers

| id | Name | Titel | BTC | Fangchance | Spawn |
|---|---|---|---|---|---|
| christian | Christian | Herr der Netzwerke | 100 | 50 % | überall |
| hildegard | Hildegard | Herrscherin der Schanze | 120 | 35 % | nur um Hüttenbergstraße 55 |
| micha | Onkel Micha | Herrscher des PC Sale | 100 | 35 % | nur um PC Sale |
| viktor | Viktor | Möchtegern-Herrscher der Börse | 90 | 50 % | überall |
| ramona | Ramona Rüther | Herrscherin der Arbeitslosigkeit | 90 | 35 % | nur um Langeler Weg 23 |

Beschreibungen (für Sammlung/Fang-Screen):
- Christian: Handelt mit Bitcoin, bei ihm steigt der Kurs immer um 70 %.
  Ex-Vice-President der Deutschen Bank.
- Hildegard: Herrscht über die Rütherschanze. Ruft die Familie zu Hilfe.
- Onkel Micha: Hat eine PS3 und baut sie zur Hardware-Wallet um.
- Viktor: Stinkt stark. Hat vor der Börse in New York gestanden.
- Ramona: Frau von Christian. Hat seit sieben Jahren offene M&Ms.

### Attacken

Alle Attacken treffen zu 90 %, außer `alwaysHit`.

| Rüther | Attacke | Schaden | Effekt |
|---|---|---|---|
| Christian | Plus 70 Prozent | 30 | trifft immer |
| Christian | Vice-President-Handschlag | 10 | Gegner geschwächt: 3 Runden ×0,75 Schaden |
| Christian | Werfen mit Dosenbier | 20 | – |
| Hildegard | Familientreffen | 0 | ruft Christian + Onkel Micha: 3 Runden je 10 Schaden; einmal pro Kampf |
| Hildegard | Handtaschen-Hieb | 20 | – |
| Onkel Micha | Hardware-Wallet-Umbau | 20 | Angreifer erhält den Schaden als BTC gut (drain) |
| Onkel Micha | Controllerwurf | 25 | – |
| Viktor | Giftgas | 10 | Gift: 3 Runden 10 BTC |
| Viktor | Ungeschlagene Argumentationslogik | 10 | Gegner setzt nächste Runde aus |
| Ramona | Abgelaufene M&Ms | 15 | Gift: 3 Runden 8 BTC |
| Ramona | Unlimited Credits | 0 | heilt sich 40 |

Flavour-Text für "Ungeschlagene Argumentationslogik":
*"Deutsche Bank ist kein Geringverdiener."*

### Bosse

| id | Name | BTC | Attacken |
|---|---|---|---|
| ps3 | Playstation 3 | 130 | Blu-ray-Wurf (25) · Yellow Light of Death (20, Gift 3 Runden 5) · Firmware-Update (0, Gegner setzt aus) |
| schanze | Herr der Rütherschanze | 180 | Kurssturz (30) · Mining (heilt 25) · Blockchain-Kette (15, Gift 3 Runden 10) |
| satoshi | Satoshi Nakamoto | 220 | Genesis Block (25) · Halving (35, nur jede 3. Runde) · Private Key verloren (heilt 30) |

Herr der Rütherschanze hat statt eines Kopfes einen Bitcoin.

### Arenen

| id | Name | Adresse | lat | lon | Boss |
|---|---|---|---|---|---|
| worringen | Rütherschanze Worringen | Langeler Weg 23, 50769 Köln | 51.0631420 | 6.8722528 | satoshi |
| huettenberg | Hüttenbergstraße | Hüttenbergstraße 55, 58091 Hagen | 51.3440710 | 7.4877959 | schanze |
| pcsale | PC Sale | Augustastraße 1, 58089 Hagen | 51.3589214 | 7.4631893 | ps3 |

### Konstanten

| Name | Wert |
|---|---|
| SPAWN_INTERVAL | 60 s |
| SPAWN_LIFETIME | 10 min |
| SPAWN_MIN / SPAWN_MAX | 2 / 4 aktive Spawns |
| SPAWN_RING | 30–250 m um den Spieler |
| LOCAL_ZONE | 500 m: innerhalb davon spawnen ortsgebundene Rüthers |
| LOCAL_SPAWN_RING | 30–150 m um die Arena |
| SPAWN_FORGET | 1000 m: weiter entfernte Spawns verfallen |
| CATCH_RANGE | 50 m |
| ARENA_RANGE | 100 m |
| THROWS | 3 |
| HIT_CHANCE | 0,9 |
| DUP_BONUS / DUP_CAP | +10 BTC / max +50 |
| TEAM_SIZE | 3 |

## 4. Bildschirme

Alle Screens sind `<section>` in `index.html`; `app.js` zeigt genau einen.

1. **Karte** (Start). Spieler als blauer Punkt, Spawns als Sprite-Marker,
   Arenen als Marker (besiegt: goldener Haken). Unten Leiste: "Team",
   Zähler "3/5 gefangen", "2/3 Arenen". Titel oben "Rüther GO".
2. **Fangen**. Sprite oben (wackelt leicht), Name + Titel + Beschreibung,
   unten eine Bitcoin-Münze. Nach oben wischen oder tippen = Wurf.
3. **Team**. Sammlung mit fünf Slots (nicht gefangene als Silhouette "???",
   gefangene mit BTC inkl. Bonus und Fang-Anzahl). Kampf-Team: bis zu drei
   antippen, Reihenfolge = Einsatzreihenfolge.
4. **Arena-Info**. Boss-Sprite, Name, Adresse, Entfernung. Button "Kämpfen"
   nur aktiv wenn < 100 m und Team ≥ 1. Besiegt: "Bereits besiegt, nochmal?".
5. **Kampf**. Oben Gegner (Sprite, Name, BTC-Balken, Status-Icons), unten
   eigener Rüther (gleiches), darunter Attacken-Buttons + "Wechseln".
   Kampf-Log als Textzeilen der letzten Runde.
6. **Sieg**. Nach der dritten besiegten Arena einmalig:
   "Du bist der Herrscher aller Rüthers." Danach Badge auf der Karte.

## 5. Spawns (`js/spawn.js`, reine Logik)

```js
updateSpawns({ spawns, player: {lat,lon}, arenas, ruethers, now, rng }) -> Spawn[]
```
Spawn: `{ id (eindeutig), ruetherId, lat, lon, expires }`.

- Beim Start und alle 60 s: abgelaufene Spawns (`expires <= now`) und Spawns
  weiter als 1000 m vom Spieler entfernen, dann auffüllen bis Zielzahl
  (zufällig 2–4) erreicht.
- Pool: Christian und Viktor immer. Hildegard/Micha/Ramona nur, wenn der
  Spieler innerhalb 500 m der jeweiligen Arena ist; dann liegt der Spawn im
  Ring 30–150 m um die Arena, und mindestens ein aktiver Spawn ist dieser
  ortsgebundene Rüther (wird beim Auffüllen als erster erzeugt, falls noch
  keiner aktiv ist).
- Spawn-Position sonst zufällig im Ring 30–250 m um den Spieler.
- Spawn antippen: < 50 m → Fang-Screen. Sonst Hinweis "Zu weit weg: 230 m".
- Spawns werden nicht gespeichert (kurzlebig). Ohne Spielerposition entstehen
  keine Spawns.

## 6. Fangen

- Jeder Wurf: `rng() < catchChance` → gefangen. Sonst "ausgewichen".
- Nach drei Fehlwürfen flieht der Rüther, Spawn verschwindet.
- Gefangen: in Sammlung. Duplikat: `bonusBtc += 10`, Kappe 50. Spawn weg.
  Wird beim ersten Fang automatisch ins Team gelegt, wenn Platz ist.
- Wurf-Animation ca. 600 ms, dann Ergebnis-Text, dann weiter.

## 7. Kampf-Engine (`js/battle.js`)

Reine Logik, kein DOM, deterministisch über injizierten Zufall
`rng: () => number in [0,1)`.

```js
createBattle({ team: Fighter[], enemy: Fighter, rng }) -> BattleState
playerAttack(state, attackIndex) -> BattleState   // führt eine ganze Runde aus
playerSwitch(state, teamIndex) -> BattleState     // Wechsel kostet die Runde
makeFighter(def, bonusBtc = 0) -> Fighter          // aus data.js-Definition
```

Fighter: `{ id, name, btc, maxBtc, attacks, status: { poison: null|{perTurn,turns}, skip: false, weakened: 0 }, used: {} }`.
BattleState: `{ team, active, enemy, turn (1-basiert), summons: [{name,damage,turns}], log: string[], over: false, won: null, rng }`.
Jede Funktion gibt ein neues State-Objekt zurück (Input wird nicht mutiert),
`log` enthält nur die Zeilen der letzten Runde.

Attacken-Format in `data.js`:
`{ name, damage, alwaysHit?, weaken?: 3, poison?: {perTurn, turns}, skip?: true, drain?: true, heal?: n, summon?: [{name,damage}], once?: true, everyN?: 3, flavour? }`

### Rundenablauf

1. Spieler-Aktion. Attacke: Trefferwurf `rng() < 0.9` nur, wenn `damage > 0`
   und nicht `alwaysHit`; Attacken mit `damage 0` (Heilung, Summon,
   Firmware-Update) treffen immer. Bei Treffer: Schaden =
   `floor(damage × (angreifer.weakened > 0 ? 0.75 : 1))` auf Gegner. Dann
   Effekte: weaken setzt `ziel.weakened = 3`; poison setzt `ziel.poison`
   (überschreibt, stapelt nicht); skip setzt `ziel.skip = true`; drain heilt
   Angreifer um verursachten Schaden (max maxBtc); heal heilt Angreifer (max
   maxBtc); summon setzt `summons` mit `turns: 3` (nur wenn
   `used[attack.name]` nicht gesetzt, danach gesetzt; zweiter Versuch =
   Log "Die Familie ist schon da." und die Runde ist trotzdem verbraucht).
   Bei Fehlschlag: keine Effekte. Wechsel: aktiver Rüther wird getauscht,
   keine Attacke. Hat der aktive Rüther selbst `skip` (durch eine
   Boss-Attacke wie Firmware-Update), setzt er aus: Log "X setzt aus.",
   `skip = false`, keine Attacke, die Runde läuft trotzdem weiter.
2. Summons greifen an: je `damage` auf Gegner, kein Trefferwurf, `turns -= 1`,
   bei 0 entfernt.
3. Gegner `btc <= 0` → `over = true, won = true`, Rest der Runde entfällt.
4. Gegner-Aktion. `enemy.skip` → Log "X setzt aus.", `skip = false`. Sonst
   Boss-KI: Kandidaten = alle Attacken, minus `everyN`-Attacken wenn
   `turn % everyN !== 0`, minus `heal`-Attacken wenn
   `enemy.btc >= 0.5 × maxBtc`, minus `skip`-Attacken, wenn der Spieler in
   dieser Runde selbst ausgesetzt hat (verhindert Aussetz-Dauerschleifen). Zufällig eine wählen
   (`floor(rng() × n)`). Auflösen wie Spieler-Attacke, Ziel = aktiver Rüther.
5. Gift am Rundenende auf beiden Seiten: `btc -= perTurn`, `turns -= 1`,
   bei 0 entfernt. Danach `weakened -= 1` (min 0) bei beiden.
6. Aktiver Rüther `btc <= 0`? Nächster Rüther im Team mit `btc > 0` (in
   Reihenfolge) wird aktiv, Log "X ist pleite! Y, du bist dran!". Keiner mehr
   → `over = true, won = false`. Gegner `btc <= 0` → `over = true, won = true`.
7. `turn += 1`.

Status eines gewechselten Rüthers bleibt erhalten. Nach dem Kampf haben alle
Rüthers wieder volle BTC. Niederlage kostet nichts; Arena sofort wiederholbar.

Spieler-Rüther im Kampf: `btc = maxBtc = basis + bonusBtc`.

## 8. Arenen

- Marker antippen → Arena-Info. "Kämpfen" aktiv bei < 100 m und Team ≥ 1.
- Sieg → `arenasBeaten` enthält die Arena, Marker goldener Haken.
- Drei besiegt → Sieg-Screen einmalig (`victoryShown: true`), danach Badge.

## 9. Test-Modus

- Siebenmal auf den Titel "Rüther GO" tippen, oder `?debug=1` in der URL,
  öffnet ein Debug-Panel auf der Karte.
- Buttons: "Beamen: Worringen", "Beamen: Hüttenbergstraße", "Beamen: PC Sale",
  "GPS wieder an", "Spawns neu würfeln", "Spielstand löschen",
  "Alle Rüthers fangen" (für schnelle Kampf-Tests).
- Beamen setzt eine Fake-Position 40 m neben die Arena; echte GPS-Updates
  werden ignoriert bis "GPS wieder an". Fake-Position wird nicht gespeichert.

## 10. Sprites (`tools/pixelate.py`)

- Liest die Fotos aus dem Projektordner, schneidet ein pro Datei im Skript
  definiertes Rechteck, skaliert mit LANCZOS auf 32×32, quantisiert auf 16
  Farben, skaliert mit NEAREST ×8 auf 256×256, speichert `sprites/<id>.png`.
- Christian: Gesicht. Hildegard: Kopf/Oberkörper. Onkel Micha: Gesicht.
  Viktor: Rückansicht Oberkörper (gewollt, kein Frontbild).
- Ramona: kein Foto → programmatischer Platzhalter (rosa Hintergrund,
  Gesichts-Silhouette, Buchstabe "R"). Wird ersetzt, sobald ein Foto da ist.
- Bosse programmatisch gezeichnet: Satoshi (dunkle Kapuze, Fragezeichen als
  Gesicht), Rütherschanze (Anzug, orangener Bitcoin als Kopf mit ₿),
  PS3 (schwarze Konsole mit grüner Lichtleiste). Silhouette `unknown.png`
  ("???") für ungefangene. Bitcoin-Münze `coin.png` für den Wurf.
- Darstellung mit `image-rendering: pixelated`.

## 11. Speichern (`js/storage.js`)

```json
{ "version": 1,
  "caught": { "christian": { "count": 2, "bonusBtc": 10 } },
  "team": ["christian", "viktor"],
  "arenasBeaten": ["pcsale"],
  "victoryShown": false }
```

Speichern bei jeder Änderung. Laden mit try/catch; kaputt oder leer →
Neustart mit leerem Stand.

## 12. Fehlerbehandlung

- Ortung verweigert oder nicht verfügbar: Banner "Ortung aus. Erlaube sie in
  den Browser-Einstellungen oder nutze den Test-Modus." Karte zentriert auf
  Hagen (51.36, 7.47), Spawns entstehen erst mit Position.
- Kein Netz: Tiles fehlen, Spiel läuft weiter.
- localStorage gesperrt/voll: Spiel läuft ohne Speichern, Banner "Spielstand
  kann nicht gespeichert werden."

## 13. Tests

`test/battle.test.mjs` und `test/spawn.test.mjs` mit `node:test` und
`node:assert`, deterministische `rng` (Sequenz-Array). Abgedeckt:

- Treffer und Fehlschlag über rng
- alwaysHit trifft bei rng 0.99
- Gift: 3 Runden Schaden, dann weg; überschreibt statt stapelt
- Aussetzen: Gegner handelt eine Runde nicht
- Weaken: 0,75 abgerundet, 3 Runden
- Drain: heilt, aber nicht über maxBtc
- Heal: nicht über maxBtc
- Familientreffen: 3 Runden je 10+10, zweiter Einsatz tut nichts
- Halving nur in Runden 3, 6, 9
- Boss heilt nur unter 50 %
- Wechsel kostet die Runde
- Team-Wechsel bei 0 BTC, Niederlage wenn alle pleite, Sieg wenn Gegner pleite
- Input-State wird nicht mutiert
- Spawns: ortsgebundener Rüther nur in der Zone; Zielzahl 2–4; Ablauf;
  Verfall bei > 1000 m

Ausführen: `node --test test/*.test.mjs`.
