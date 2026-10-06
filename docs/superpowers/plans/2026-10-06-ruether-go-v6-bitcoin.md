# Rüther GO v6 Implementation Plan – Humor, Kampf-Fang, Duplikate, Reichweite, Bitcoin

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans.

**Spec:** `docs/superpowers/specs/2026-10-06-ruether-go-v6-bitcoin-design.md` (gilt bei Zweifel). **§0 ist die oberste Regel:** echte Pixel-Gesichter (`sprites/<id>.png`) überall, wo ein Rüther vorkommt; keine gemalten Ersatzfiguren; Sprüche aus `LINES`. v5-Designsystem (`css/theme.css`) bleibt.

**Schon erledigt (nicht ändern):** `js/data.js` hat die neuen Reichweiten, `WILD_*`, `XP_WILD_WIN`, `WIN_LEVEL_UP`, `FEED_LEVELS`, `SELL_MULT`, `CINEMATIC_MS`, `prop` an jeder Rüther-Attacke, `LINES` und `pickLine(id, kind, rng)`.

**Regeln:** UTF-8 ohne BOM, LF. Keine Commits. Nur eigene Dateien ändern. `node --test test/*.test.mjs` grün. Lokaler Test: `python tools/serve.py <port>` (A 8051, B 8052, C 8053, D –, Reviewer 8060/8061), `http://127.0.0.1:<port>/?debug=1`, Viewport mobile 375×812. Lokal ist die Online-Welt aus. rAF im eingebetteten Browser gedrosselt: Zustände per javascript_tool prüfen; Effekte notfalls direkt über `import('/js/fx.js')` auf der Bühne auslösen. Neue Grafiken aus Spec §8 entstehen parallel (Higgsfield) — fehlen sie noch, greifen die Fallbacks.

## Dateibesitz

| Agent | Dateien |
|---|---|
| A (Karte, Verdrahtung, Kurs) | `js/app.js`, `js/map.js`, `js/format.js` (neu), `js/ticker.js` (neu), `test/format.test.mjs` (neu), `index.html`, `style.css`, `css/app.css` |
| B (Kampf, Effekt-Player) | `js/fx.js`, `css/theme.css`, `js/battle-ui.js`, `css/battle.css` |
| C (Fangen, Sammlung) | `js/catch.js`, `css/catch.css`, `js/screens.js`, `css/screens.css` |
| D (Logik, Tests) | `js/wild.js` (neu), `js/progress.js`, `test/wild.test.mjs` (neu), `test/progress.test.mjs` |

## Verträge (verbindlich)

```js
// js/format.js (A)
export const hashrateText = power => `${power.toFixed(2).replace('.', ',')} TH/s`;
export const reachText = (dist, range) => `Noch ${Math.max(1, Math.ceil(dist - range))} m näher ran`;

// js/ticker.js (A)
export function createTicker({ el, getLeaderId }) -> { refresh() }

// js/map.js (A) zusätzlich
map.setReach(pos)   // Reichweitenkreis + Spawn-Marker near/far

// js/wild.js (D)
export function wildBossDef(def, inst) -> bossDef      // Spec §2, rein
export function makeWild(def, inst) -> enemy           // makeBoss(wildBossDef(def, inst), 1) + { wild: true, rarity: inst.rarity, level: inst.level }
// charged-Einträge tragen: name, damage, warn, poison?, stun?, heal?, fx: 'wild', prop, ownerId, flavour?
// fast: { name: 'Rempler', damage, every, warn: 600, fx: 'wild-fast', prop: null, ownerId }

// js/progress.js (D) zusätzlich
export const sellValue = rarityId => CONST.SELL_MULT * rarityOf(rarityId).sats
export function pickFood(save, targetUid) -> uid | null   // gleicher Rüther, Seltenheit ≤ Ziel, nicht im Team, nicht das Ziel; schwächstes zuerst (Seltenheit, dann Level)
export function feed(save, targetUid, foodUid) -> { ok, reason, level }   // +FEED_LEVELS, Kappe LEVEL_MAX; reason: 'unbekannt' | 'team' | 'max' | 'falsch'
export function sell(save, uid) -> { ok, reason, sats }                   // Team und letztes Exemplar einer Seltenheit geschützt (reason 'team' | 'letztes')
export function sellDuplicates(save, id) -> { count, sats }               // verkauft alles außer Team + bestem je Seltenheit
export function levelUpUids(save, uids, n = CONST.WIN_LEVEL_UP) -> [{ uid, level }]   // nur geänderte

// js/fx.js (B) zusätzlich
SHEETS.btcspin  = { file: 'art/sheet-btc-spin.png',  frames: 16, fps: 16, loop: true }
SHEETS.btcburst = { file: 'art/sheet-btc-burst.png', frames: 16, fps: 18, loop: false }
export function btcRain(parent, { n = 18, ms = 2200, size = 40 } = {}) -> { stop() }
export function banner(parent, { title, sub = '', portrait = '', rarity = 'normal', ms = 1100 } = {}) -> { stop() }   // portrait = sprites/<id>.png
export function spinCoin(parent, { x, y, size = 48 } = {}) -> { el, stop() }
export function say(parent, text, { x = '50%', y = '30%', ms = 2200, side = 'left' } = {}) -> { stop() }   // Pixel-Sprechblase (Papier, Ink-Rand, Zipfel)
// propFx(parent, name, path, { ms, size, delay, html, rider, riderRarity }) — rider = Rüther-id → <img class="rider" src="sprites/<id>.png"> im Requisit
// floatText kind 'mega'; neue Pfade 'rise-from-bottom', 'launch', 'arc-to-me'; Fallback: Sheet/Requisit-Bild lädt nicht → impact/sparkle bzw. fx-chart-up

// js/battle-ui.js (B)
createBattleScreen({ el, onEnd, onEvent }) -> { start({ team, enemy, rng, mode = 'arena', arena, arenaLevel, reward, masteredAfter, wild }), stop() }
// wild = { id, rarity, name } nur bei mode 'wild'. onEnd({ won, retry, reason, activeIndex }); im Wildmodus kein „Nochmal".

// js/catch.js (C)
createCatchScreen({ el, onDone, onCancel, onCaught, onSuperCoinUsed, onThrow, onFight }) -> { start(spawn, def, { rng, rarity, superCoins, canFight }) }
// onFight({ spawn }) wenn „Kämpfen" (nur im Ruhezustand). Kämpfen-Knopf erzeugt catch.js selbst in .catch-stage.

// js/screens.js (C)
createCollectionScreen({ el, onTeamChange, onPowerUp, onFuse, onFeed, onSell, onSellDuplicates, onDex, onBack })
// onFeed(targetUid) -> { ok, reason, level, foodUid }; onSell(uid) -> { ok, reason, sats }; onSellDuplicates(id) -> { count, sats } (Bestätigung per popup() aus ui.js VOR dem Aufruf)
```

### Task A
1. `js/format.js` + `test/format.test.mjs` (hashrateText(1.04) → "1,04 TH/s", hashrateText(2.816) → "2,82 TH/s", reachText(154, 120) → "Noch 34 m näher ran", reachText(120.2, 120) → "Noch 1 m näher ran").
2. `js/ticker.js` laut Spec §5; `index.html`: `<div id="btc-ticker" class="ticker hidden"></div>` in der Karten-Kopfzeile; Stil in `css/app.css` (Papier-Plakette, grün/rot, `+70 %`-Plakette grün; Kopfzeile darf auf 375 px nicht überlaufen — Titel ggf. kleiner).
3. `js/map.js`: `setReach(pos)` (Spec §1), Marker merken Koordinaten, `setSpawns` klassifiziert sofort; CSS in `style.css`.
4. `index.html` Onboarding-Slides mit echten Gesichtern (Spec §0.4), Sieg-Screen mit `<img class="victory-face">` (Gesicht des Anführers, setzt app.js), `art/fx-family.png` nirgends mehr referenziert.
5. `js/app.js`:
   - Reichweite: `map.setReach(p)` in `onPosition` und nach `refreshSpawns`/`setSpawns`; Toasts mit `reachText` (Spawn, Stop).
   - Ticker erzeugen, `refresh()` bei Start und nach Team-Änderung.
   - Fang-Screen: `canFight: teamInstances().length > 0`, `onFight({ spawn })` → Wildkampf: `enemy = makeWild(RUETHER_BY_ID[spawn.ruetherId], { rarity: spawn.rarity, level: wildLevel })` mit `wildLevel = clamp(1 + floor(rng × trainerLevel), 1, 20)`, Team wie bei Arenen, `battleScreen.start({ ..., mode: 'wild', wild: { id, rarity, name }, reward: CONST.WILD_WIN_SATS[rarity] })`. `onEnd`: Sieg → `catchReward` + `WILD_WIN_SATS` + `gainXp(XP_WILD_WIN)` + Quests `catch`/`catchRare` + `levelUpUids(save, [team[activeIndex]])` (Toast je Level-Up) + Spawn weg + legendär → Feed; Niederlage/Zeit → Spawn weg; Aufgeben (`reason === 'quit'`) → Spawn bleibt. Danach Karte.
   - Arenasieg: zusätzlich `levelUpUids(save, save.team)` mit Toasts.
   - Sammlung: `onFeed` (pickFood + feed, Quest `powerup` zählt mit), `onSell`, `onSellDuplicates` (Toast „7 Duplikate für 140 Sats verkauft"), Ticker/Banner aktualisieren.
   - Sieg-Screen: Gesicht des Anführers setzen.
6. Prüfen im Browser: Kreis + near/far, Toast-Text, Ticker (Netz) oder versteckt, Wildkampf von einem Spawn aus starten und mit „Boss fast tot: an" gewinnen → Exemplar neu in der Box, Level-Up-Toast; Aufgeben lässt Spawn stehen.

### Task B
1. `js/fx.js` + `css/theme.css` nach Vertrag (Keyframes `fx-btc-fall`, `fx-banner`, `path-rise-from-bottom`, `path-launch`, `path-arc-to-me`, `.fx-text.mega`, `.fx-banner`, `.fx-prop .rider`, `.fx-say`; reduced-motion-Fallbacks).
2. `js/battle-ui.js`:
   - Freeze (`pauseUntil`): in `loop()` während der Pause `lastTs = ts`, Eingaben verwerfen, nur `render()`; nach einem `special`-Event die while-Schleife verlassen. Aufgeben während der Pause funktioniert.
   - FX-Tabelle laut Spec §6 mit Reitern (echte Gesichter), Banner mit Angreifer-Gesicht + `pickLine(id, 'fight')`, `btcburst` als Spezial-Einschlag, `btcRain`, Plus-70-Sequenz mit `art/bg-moon.png` (`<img class="moon">` in `.fx`), Boss-Requisiten ×1,4.
   - **Familientreffen:** `fx-family.png` raus; die Helfer sind `sprites/christian.png` und `sprites/micha.png` (wie v3), rennen herein, hüpfen bei `summon`-Events.
   - **Wildmodus:** Gegner-Sprite `sprites/<id>.png` im Seltenheitsrahmen, Kulisse `art/bg-catch.png`, Intro „Wilder Rüther · <Seltenheit>" + `pickLine(id, 'appear')`; Lade-Attacken mit `fx 'wild'` → Requisit `art/fx-<prop>.png` mit Reiter `ownerId` auf `arc-to-me` + `say()` mit seinem `fight`-Spruch; bei prop `family` rennen die echten Sprites von Christian und Micha von rechts herein; `wild-fast` → kurzer Rempler (Gegner-Sprite springt nach vorn, Einschlag beim Spieler). Gegner sagt alle 8–12 s (Spielzeit) einen `fight`-Spruch. Arena-Bosse: `appear` im Intro, `fight` alle 8–12 s.
   - Overlay Wildmodus: Sieg „Gefangen! <Name> gehört dir." mit Gesicht + `caught`-Spruch + ₿-Regen + Sats-Zähler (`reward`); Niederlage „<Name> ist abgehauen." + `flee`-Spruch, nur „Weiter". `onEnd({ won, retry, reason, activeIndex })`, Aufgeben → `reason: 'quit'`.
   - „Energie" → „Mining" (`art/icon-mining.png`), BTC mit `art/icon-btc.png`, Hashrate des aktiven Rüthers im HUD (`hashrateText` aus `js/format.js`, Vertrag oben, falls A noch nicht fertig).
   - Sieg-Overlays mit `btcRain` statt `coins`.
3. Prüfen: Kampf (Arena) mit Plus 70 Prozent → Freeze (state.time zweimal lesen), Banner mit Christians Gesicht, Mond, Kerzen, Rakete mit Gesicht, „+70 %", ₿-Regen; Familientreffen mit echten Gesichtern; Wildkampf über `makeWild` (Harness oder App, sobald A fertig) mit Sprüchen; Screenshots.

### Task C
1. `js/catch.js` / `css/catch.css`: Kämpfen-Knopf (Pixel-Button, Schwert als kleines Inline-SVG wie in `js/map.js`), deaktiviert mit Hinweis ohne Team; `appear`-Spruch als Sprechblase am Rüther beim Start (`say` aus fx.js), `flee`-Spruch beim Abhauen, `caught`-Spruch in der Belohnung; Münze dreht im Flug (`spinCoin` folgt der Münzposition), Treffer `btcburst`, Fang `btcRain` 20 + `spinCoin` in der Belohnung.
2. `js/screens.js` / `css/screens.css`: Sammlung neu (Spec §3): eine Karte pro Rüther mit bestem Exemplar groß, Zähler je Seltenheit, Fusions-Fortschritt „2/3 für Selten", Knöpfe Fusion / Duplikate verkaufen (n) / Alle n anzeigen; ausgeklappt: Exemplare mit Team, Power-Up, Füttern, Verkaufen; „Hashrate" statt „Power" (`hashrateText`, `art/icon-hashrate.png`). Fusions-Animation ohne lange Leerfläche (Spec §3), Ergebnis mit ₿-Regen.
3. Prüfen: Fang mit synthetischen Pointer-Events bis „Gefangen!" (Sprüche sichtbar), Sammlung mit gesäten Duplikaten (10× Christian normal) → Fusion, Füttern, Verkaufen, Duplikate verkaufen, Screenshots.

### Task D
1. `js/wild.js` + `test/wild.test.mjs` (Spec §2, §9).
2. `js/progress.js`: `sellValue`, `pickFood`, `feed`, `sell`, `sellDuplicates`, `levelUpUids` + Tests in `test/progress.test.mjs` (Schutzregeln, Kappe, sellDuplicates-Summe).
3. `node --test test/*.test.mjs` grün.

## Review-Lesarten
1. **humor-faces:** Spec §0 Punkt für Punkt im laufenden Spiel und im Code: echte Gesichter überall (grep `fx-family` muss leer sein), Reiter in den Effekten, Sprüche sichtbar (Fang, Kampf, Banner, Overlay), nichts Generisches ersetzt einen Rüther. Screenshots.
2. **mechanics:** Wildkampf Ende-zu-Ende (Sieg fängt, Niederlage lässt abhauen, Aufgeben behält Spawn), Level-Ups nach Siegen, Füttern/Verkaufen/Duplikate/Fusion inkl. Schutzregeln, Balance-Plausibilität (Wildkampf gegen gleichstarken Rüther in 60 s gewinnbar?).
3. **wiring/regression:** Verträge beidseitig, Freeze bricht nichts, keine hängenden Timer, Fallbacks, alle `art/`-Referenzen existieren, Reichweite konsistent.
4. **smoke:** kompletter Durchlauf inkl. Ticker, Reichweite, Plus 70 Prozent, Wildkampf, Sammlung; Konsole ohne Fehler; kaputte Bilder prüfen.
