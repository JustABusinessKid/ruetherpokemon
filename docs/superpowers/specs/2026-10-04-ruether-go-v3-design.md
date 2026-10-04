# Rüther GO v3 – Seltenheit, Power-Ups, Arenen-Ausbau

Stand: 2026-10-04. Baut auf v1 und v2 auf; was hier nicht erwähnt wird, bleibt.

Sebis Feedback: nach drei Minuten und einer Arena ist die Luft raus. Ziele:
1. **Langzeit-Motivation:** Sammeln (Seltenheitsstufen, Rütherdex), Aufleveln
   (Power-Ups, Sats), Arenen mit steigenden Leveln.
2. **Arenen und Animationen deutlich aufwendiger.**

## 1. Seltenheit

| id | Name | Gewicht | Stat-Faktor | Fang-Abzug | Sats | Farbe |
|---|---|---|---|---|---|---|
| normal | Normal | 70 | 1,00 | 0 | 10 | #9aa0a6 |
| selten | Selten | 20 | 1,15 | 0,10 | 30 | #2a7fff |
| episch | Episch | 8 | 1,35 | 0,20 | 80 | #b36bff |
| legendaer | Legendär | 2 | 1,60 | 0,30 | 200 | #f7c948 |

- Jeder **Spawn** würfelt beim Entstehen seine Seltenheit (`rollRarity(rng)`,
  gewichtet). Der Karten-Marker zeigt sie: farbiger Rand plus pulsierende Aura
  ab Selten (`.spawn-icon.r-<id>`), Legendär zusätzlich mit ✨.
- Jeder **Fang** erzeugt ein **Exemplar** `{ uid, id, rarity, level: 1, caughtAt }`
  in der Box. Es gibt keine Duplikat-Boni mehr; stattdessen Sats und Dex.
- **Stats eines Exemplars:** `mult = Stat-Faktor × (1 + 0,04 × (level − 1))`,
  BTC = `round(basis × mult)`, Schaden (schnell und Spezial) = `floor(basis × mult)`.
  Level 20 Legendär: 1,6 × 1,76 = 2,82.
- **Fangchance:** `base − Abzug + Ringbonus + (Super-Münze ? 0,20 : 0)`,
  begrenzt auf 0,05 … 0,95.
- **Rütherdex:** 5 Rüthers × 4 Seltenheiten = 20 Felder. Erster Fang einer
  Kombination gibt `DEX_BONUS` 100 Sats und „Neu im Rütherdex!".

## 2. Sats und Power-Ups

- Währung **Sats** (💰). Quellen: Fang (Tabelle), Dex-Bonus 100, Arenasieg
  `150 × Arena-Level`. Anzeige in der unteren Leiste der Karte, Toast „+30 💰"
  bei jedem Zugang.
- **Power-Up:** ein Exemplar um ein Level heben. Kosten `50 × aktuelles Level`
  (Level 1→2: 50, 19→20: 950), maximal Level 20. Animation: Sprite leuchtet,
  Sterne steigen auf, Levelzahl springt.
- **Shop** (eigener Screen):
  | id | Name | Kosten | Wirkung |
  |---|---|---|---|
  | lockmodul | Lockmodul 🧲 | 300 | 5 Minuten: Zielzahl der Spawns 4–8 statt 2–4, Auffüllen alle 20 s statt 60 s. Karte zeigt Restzeit. |
  | supercoin | Super-Münze 🪙 | 40 | Verbrauchsgegenstand. Im Fang-Screen Schalter „Super-Münze (n)": +0,20 Fangchance, verbraucht beim Wurf, der den Rüther trifft. |
- **Sammlung** (ersetzt den Team-Screen): Liste aller Exemplare, gruppiert
  nach Rüther, jedes mit Seltenheitsrahmen, Level, BTC, Buttons „Ins Team" /
  „Aus dem Team" (max. 3, Reihenfolge = Antippreihenfolge) und „Power-Up (n 💰)".
  Oben Button „Rütherdex". Leere Box: Hinweis.
- **Rütherdex-Screen:** Raster 5 Zeilen (Rüther) × 4 Spalten (Seltenheit).
  Gefangen: Sprite mit Farbrahmen; nicht: Silhouette. Kopf „7/20".

## 3. Arenen

- **Arena-Level 1–5** pro Arena (`arenaLevels[id]`, Start 1). Boss skaliert:
  `scale = 1 + 0,25 × (level − 1)` auf BTC und alle Schadenswerte (floor).
  Sieg hebt das Level um 1 (max 5). Level 5 besiegt = **gemeistert**
  (`arenaMastered[id] = true`): Marker mit 👑, Level bleibt 5.
- Marker: ⚔ mit Level-Badge „Lv.2"; erobert: Besitzer-Sprite + 🏆 + Badge;
  gemeistert: Goldrand + 👑.
- Arena-Info zeigt Level, Boss-BTC für dieses Level, Belohnung, Besitzer.
- **Wutphase:** fällt der Boss unter 50 % BTC, einmalig Event `rage`:
  schnelle Angriffe alle 1800 ms (statt 2500), Lade-Attacken alle 7000 ms
  (statt 10 000), laufende Timer werden entsprechend neu gesetzt
  (`nextFastAt = time + 1800`, `nextChargedAt = min(nextChargedAt, time + 7000)`),
  laufende Warnung bleibt. Bühne bekommt roten pulsierenden Rand, Boss
  wackelt 1 s (`rage-shake`), großes „WUT!" fliegt rein, Boss-Name mit 🔥.
- **VS-Intro** vor jedem Kampf (Overlay `.intro`, 2,6 s): Arena-Name und
  „Arena Lv. n" oben, Boss-Sprite rutscht von rechts, erster Rüther von links,
  „VS" platzt in der Mitte, dann 3 · 2 · 1 · „Kampf!" (je 500 ms, jede Zahl
  springt). Timer und Boss starten erst danach.
- **Arena-Hintergründe** (`.stage[data-arena="…"]`, nur CSS):
  - pcsale: dunkelblau, horizontale Scanlines, ein heller Streifen wandert
    alle 4 s von oben nach unten.
  - huettenberg: ₿-Zeichen regnen in zwei Ebenen (Text in `::before`/`::after`
    mit `animation`), orange Schein unten.
  - worringen: grüne Hex-Zeichen fallen (Matrix), dunkler Hintergrund.
- **Kampf-Feedback:** Combo-Zähler (schnelle Treffer mit < 800 ms Abstand,
  Anzeige „×7" über dem Boss, wächst bei jedem Treffer, verschwindet nach
  1 s Pause; ab ×10 goldene Schrift und Funken); Boss-Sprite blitzt bei jedem
  Treffer weiß (`hit`); Schadenszahlen ≥ 25 groß und fett; Bühne bebt
  proportional zum Schaden (klein < 15, mittel < 30, groß darüber).
- **Seltenheits-Glanz:** Sprites im Kampf und in der Sammlung haben einen
  Rahmen in Seltenheitsfarbe; Episch und Legendär zusätzlich einen
  wandernden Glanzstreifen (`shine`).
- **Sieg-Overlay:** Pokal, 30 Konfetti-Partikel in Seltenheitsfarben,
  Sats-Zähler rollt von 0 auf den Gewinn hoch (1 s), Text „Arena Lv. n+1
  freigeschaltet" bzw. „Arena gemeistert!". Button „Weiter".

## 4. Fangen (Ergänzungen)

- Rarity-Aura hinter dem Rüther (Farbe), Badge mit Seltenheitsname oben.
- Schalter „Super-Münze (n)" unter der Münze, nur wenn n > 0; aktiv = Münze
  mit goldenem Glanz.
- Burst in Seltenheitsfarbe; Legendär: Gold-Konfetti plus „LEGENDÄR!".
- Nach „Gefangen!": Sats-Popup „+80 💰" und ggf. „Neu im Rütherdex!".

## 5. Karte

- Spawn-Marker mit Seltenheitsrahmen/Aura. Arena-Marker mit Level-Badge.
- Untere Leiste: „Sammlung" · „💰 1.240" · „Shop". Zähler oben rechts im
  Titel: „Dex 7/20".
- Lockmodul aktiv: Banner-Zeile „🧲 Lockmodul: 4:32".

## 6. Spielstand v2 und Migration

```json
{ "version": 2, "box": [{ "uid": "c1", "id": "christian", "rarity": "selten", "level": 3, "caughtAt": 0 }],
  "team": ["c1"], "sats": 120, "dex": { "christian:selten": true },
  "arenaLevels": { "pcsale": 2 }, "arenaMastered": {}, "arenaOwners": { "pcsale": "c1" },
  "items": { "lockmodul": 0, "supercoin": 0 }, "lureUntil": 0, "victoryShown": false,
  "stats": { "catches": 0, "arenaWins": 0 } }
```
Migration von v1 (`migrate(v1)`): jedes `caught[id]` → ein Exemplar normal
mit `level = 1 + floor(bonusBtc / 10)`, Dex-Eintrag `id:normal`;
`team` (ids) → uids; `arenasBeaten` → `arenaLevels[id] = 2`;
`arenaOwners[id]` (Rüther-id) → uid des Exemplars; `sats = 50 × Summe count`.
Krone (`victoryShown`) bleibt. Siegbedingung v3: alle drei Arenen gemeistert.

## 7. Reine Logik (`js/progress.js`), testbar

```js
rollRarity(rng) -> rarityId                      // gewichtet
rarityOf(id) -> RARITY
instanceMult(inst) -> number                     // Stat-Faktor × Level
fighterStats(def, inst) -> { btc, power }         // btc gerundet, power = mult
levelCost(level) -> number                       // 50 × level; null bei 20
powerUp(save, uid) -> { ok, reason }             // zieht Sats ab, hebt Level
catchChanceV3(base, rarityId, ringScale, superCoin) -> number
catchReward(save, id, rarityId) -> { sats, newDex }   // mutiert save (box, dex, sats, stats)
arenaScale(level) -> number
arenaReward(level) -> number
arenaWin(save, arenaId, leaderUid) -> { sats, newLevel, mastered }
buyItem(save, itemId) -> { ok, reason }
migrate(anySave) -> saveV2
```

## 8. Engine-Änderungen (`js/battle.js`)

- `makeFighter(def, inst)` nimmt ein Exemplar (oder `{ rarity: 'normal', level: 1 }`),
  setzt `btc/maxBtc` aus `fighterStats`, `power`, `rarity`, `level`, `uid`.
- `makeBoss(def, arenaLevel = 1)` skaliert BTC und Schaden; `rage: false`.
- `tick`: schneller Angriff `floor(FAST_DAMAGE × me.power)`, Spezial
  `floor(atk.damage × me.power)`, Herbeigerufene `floor(damage × power)`.
  Wutphase wie §3 (Event `rage`, vor dem Boss-Schritt geprüft).
- Events neu: `rage`.

## 9. Test-Modus (Ergänzungen)

Buttons: „+1000 Sats", „Nächster Spawn legendär" (Schalter; der nächste
erzeugte Spawn wird Legendär), bestehende bleiben.

## 10. Tests (`test/progress.test.mjs`, Engine-Tests ergänzt)

- rollRarity: 0,0 → normal, 0,71 → selten, 0,91 → episch, 0,985 → legendaer.
- fighterStats: Christian Legendär Level 20 → btc 282, power 2,816.
- levelCost 1 → 50, 19 → 950, 20 → null; powerUp ohne Sats → `{ok:false}`.
- catchChanceV3: 0,5 legendär Ring 0,9 ohne Münze → 0,2; mit Münze → 0,4; Kappe 0,95; Boden 0,05.
- catchReward: erster Selten-Christian → 130 Sats, newDex true; zweiter → 30.
- arenaScale 1 → 1, 3 → 1,5; arenaReward 2 → 300; arenaWin Level 5 → mastered.
- buyItem ohne Sats → ok false; mit → Sats reduziert, items +1.
- migrate: v1 mit christian count 3 bonus 20 → Exemplar Level 3, dex, sats 150.
- Engine: Legendär Level 1 Christian Tipp → 4 Schaden (floor 3 × 1,6); Boss Lv.3 PS3 → 390 BTC, Blu-ray 18; Wut bei < 50 %: Event `rage`, nächster schneller Angriff nach 1800 ms.
