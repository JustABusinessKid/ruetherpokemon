# Rüther GO v6 – Humor zurück, Kampf-Fang, Duplikate, Reichweite, mehr Bitcoin

Stand: 2026-10-06. Sebis Feedback nach v5:
- „Reichweite nervt, viele Rüther liegen auf Privatgrundstücken."
- „Animationen und Bitcoin kommen zu kurz; bei Plus 70 Prozent sind normale Münzen; Power heißt Power."
- „Spielmechaniken nicht überdacht, Fusion klappt nicht, man hat 10 von einem Rüther und kann nichts damit machen."
- „Ich will Rüther fangen können, indem man gegen sie kämpft."
- „Die Profilbilder von Christian und Onkel Micha beim Familientreffen sind weg und durch gemalte Charaktere ersetzt; das Spiel hat seinen Humor verloren und ist auf Zwang mit Cartoongestalten poliert. Das darf nicht sein."

Alles aus v1–v5 bleibt, außer wo hier anders festgelegt.

## 0. Oberste Regel: Die echten Leute sind der Witz

1. **Wo ein Rüther vorkommt, ist sein echtes Pixel-Gesicht zu sehen** (`sprites/<id>.png`). Keine gezeichneten Ersatzfiguren für Rüther. `art/fx-family.png` (zwei gemalte Männer) wird **nicht mehr benutzt**; das Familientreffen zeigt die echten Sprites von Christian und Onkel Micha, die hereinrennen und mitkloppen (wie in v3).
2. **Gesichter in den Effekten:** Spezial-Requisiten tragen das Gesicht des Angreifers als „Reiter" (`<img class="rider" src="sprites/<id>.png">` im Requisit, 40–48 % der Requisitgröße, Pixel-Rahmen in Seltenheitsfarbe):
   - Plus 70 Prozent: Christians Gesicht sitzt auf der Bitcoin-Rakete.
   - Giftgas: Viktors Gesicht mitten in der Wolke (leicht grün getönt).
   - Controllerwurf / Hardware-Wallet: Michas Gesicht auf dem Controller bzw. hinter der Wallet.
   - Handtaschen-Hieb: Hildegards Gesicht über der Tasche.
   - Unlimited Credits / Abgelaufene M&Ms: Ramonas Gesicht zwischen den Tüten bzw. über den M&Ms.
   - Dosenbier: Christians Gesicht hinter der Dose, die er wirft (Wurfstart beim Rüther).
   - Handschlag: Christians Gesicht neben den Händen.
   - Argumentationslogik: Sprechblase hängt an Viktors großem Gesicht.
3. **Sprüche** (`LINES` in `js/data.js`, Auswahl über `pickLine(id, kind)`): beim Auftauchen im Fang-Screen (Sprechblase am Rüther), im Kampf (der Gegner sagt alle 8–12 s einen `fight`-Spruch, eigene Spezial-Attacke zeigt einen `fight`-Spruch des Angreifers im Banner), beim Fang (`caught`) und beim Abhauen (`flee`). Bosse: `appear` im VS-Intro, `fight` als Sprechblase.
4. **Onboarding und Sieg** zeigen echte Gesichter: Slide 1 Christian als Fang, Slide 2 Satoshi-Arena mit Hildegard als Herausforderin, Slide 3 alle fünf Gesichter nebeneinander. Großer Sieg-Screen: Gesicht des Team-Anführers mit Krone.
5. Generierte Grafiken sind nur **Requisiten, Kulissen, Bosse und Icons**. Bosse (Satoshi, Herr der Rütherschanze, PS3) bleiben gezeichnet, sie sind keine echten Leute.

## 1. Reichweite

| Konstante | alt | neu |
|---|---|---|
| CATCH_RANGE | 50 m | 120 m |
| STOP_RANGE | 40 m | 80 m |
| ARENA_RANGE | 100 m | 150 m |

Karte: Reichweitenkreis um den Spieler (`L.circle`, Radius CATCH_RANGE, Teal-Rand 2 px gestrichelt `6 6`, Füllung Teal 6 %). Spawn-Marker außerhalb: Klasse `far` (Deckkraft .55); innerhalb: `near` (2-Stufen-Pixel-Hop). Toast außerhalb: „Noch 34 m näher ran" (`reachText`).

## 2. Fangen: Werfen oder Kämpfen

Fang-Screen bekommt neben der Münze den Knopf **„Kämpfen"** (Pixel-Button mit Schwert). Ohne Team (noch nichts gefangen) ist er deaktiviert mit Hinweis „Fang erst einen per Münze".

**Wildkampf:**
- Gegner = der wilde Rüther mit **seinem echten Gesicht** als großer Gegner-Sprite (Seltenheitsrahmen), Kulisse `art/bg-catch.png`, VS-Intro „Wilder Rüther · <Seltenheit>" mit seinem `appear`-Spruch.
- Werte (`js/wild.js`, rein): `wildBossDef(def, inst)` →
  `btc = round(fighterStats(def, inst).btc × WILD_HP_MULT)`;
  schneller Angriff „Rempler" `damage = round(WILD_FAST_DAMAGE × power)`, `every = WILD_FAST_EVERY`, `warn 600`, `fx 'wild-fast'`;
  Lade-Attacken = seine eigenen Attacken: `damage = floor(a.damage × WILD_CHARGED_MULT × power)` (Familientreffen als Lade-Attacke mit `damage = floor(18 × power)`), `poison` mit 75 % Dauer, `stun` max 2000 ms, `heal = round(a.heal × power × 0,6)`, `warn 1200`, `fx 'wild'`, `prop` aus der Attacke, `ownerId` = Rüther-id. Danach `makeBoss(wildDef, 1)`; Engine unverändert. Dauer `WILD_DURATION` (60 s).
- **Sieg = gefangen:** `catchReward` (Seltenheit des Spawns), zusätzlich `WILD_WIN_SATS[rarity]` Sats und `XP_WILD_WIN` XP, Quest `catch` (+`catchRare`), Spawn verschwindet. Overlay „Gefangen! <Name> gehört dir." mit Gesicht und `caught`-Spruch, ₿-Regen.
- **Niederlage / Zeit um:** Rüther haut ab (Spawn weg), Overlay mit `flee`-Spruch. Kein „Nochmal".
- **Aufgeben:** zurück zur Karte, Spawn bleibt.
- Darstellung der Lade-Attacken des wilden Rüthers: Requisit `art/fx-<prop>.png` mit seinem Gesicht als Reiter auf Pfad `drop-on-me` bzw. `arc-to-me` (neu: vom Gegner zum Spieler), dazu sein Spruch als Sprechblase. Familientreffen gegen dich: die echten Sprites von Christian und Micha rennen von rechts herein.

## 3. Fortschritt durch Kämpfe, Duplikate mit Zweck

- **Kampf-Erfahrung:** Sieg im Wildkampf → der zuletzt aktive Rüther +1 Level; Arenasieg → alle Team-Mitglieder +1 Level (max LEVEL_MAX). Toast „Christian Lv. 4!".
- **Füttern:** Ein Duplikat desselben Rüthers (gleiche oder niedrigere Seltenheit) gibt einem Exemplar +FEED_LEVELS Level; das Duplikat ist weg. Teammitglieder können nicht verfüttert werden.
- **Verkaufen:** Exemplar → `SELL_MULT × Fang-Sats` der Seltenheit (Normal 20, Selten 60, Episch 160, Legendär 400). Teammitglieder und das letzte Exemplar einer Seltenheit (Dex-Schutz) nicht verkaufbar.
- **Duplikate aufräumen:** pro Rüther „Duplikate verkaufen (n)" verkauft alles außer: Teammitglieder und dem jeweils besten (höchstes Level) Exemplar jeder Seltenheit. Bestätigungs-Popup mit Summe.
- **Fusion** bleibt (3 gleiche Seltenheit → nächste, Level = max), wird prominent: Fortschrittsanzeige „2/3 für Selten" auf der Rüther-Karte, Knopf erscheint, sobald möglich. Animation ohne lange Leerfläche: die drei echten Gesichter fliegen sichtbar zusammen (Start sofort, kein vorgeschalteter Blitz über 150 ms), Ergebnis mit Seltenheitsrahmen und ₿-Regen.
- Reine Logik (`js/progress.js`): `feed(save, targetUid, foodUid) -> {ok, reason, level}`, `sell(save, uid) -> {ok, reason, sats}`, `sellDuplicates(save, id) -> {count, sats}`, `levelUpUids(save, uids, n) -> [{uid, level}]`.

**Sammlung neu:** eine Karte pro gefangenem Rüther (nicht pro Exemplar): großes Gesicht des besten Exemplars im Seltenheitsrahmen, Name, Zähler je Seltenheit („Normal ×7 · Selten ×1"), Fusions-Fortschritt, Knöpfe „Fusion", „Duplikate verkaufen (n)", „Alle n anzeigen". Ausgeklappt: Liste der Exemplare mit Team, Power-Up, Füttern (nimmt automatisch das schwächste passende Duplikat), Verkaufen.

## 4. Begriffe

- „Power ×1,04" → **„Hashrate 1,04 TH/s"** (`hashrateText(power)`), Icon `art/icon-hashrate.png`.
- „Energie" → **„Mining"** im Kampf (Label, `art/icon-mining.png`, Spezialkosten mit Mining-Icon).
- Lebensenergie bleibt **BTC** mit `art/icon-btc.png`.

## 5. Bitcoin-Kurs

`js/ticker.js`: echter Kurs von CoinGecko (`/api/v3/simple/price?ids=bitcoin&vs_currencies=eur&include_24hr_change=true`), alle 60 s, Timeout 6 s, Fehler → ausgeblendet. Karten-Kopfzeile: Papier-Plakette `₿ 58.432 €` + `+2,1 %` grün / `−1,3 %` rot; ist Christian Team-Anführer, zusätzlich grüne Plakette `+70 %` („Christian-Effekt"). `createTicker({ el, getLeaderId }) -> { refresh() }`.

## 6. Kino-Spezialattacken

1. **Freeze:** Spielzeit steht während der Sequenz (`pauseUntil`); Tipps verfallen; Aufgeben bleibt möglich.
2. **Banner:** Holzbanner fährt ein: echtes Gesicht des Angreifers im Seltenheitsrahmen, Attackenname groß (Pixelify 22 px), darunter ein `fight`-Spruch des Angreifers. Bühne abgedunkelt.
3. **Effekt** länger als bisher, Einschlag `sheet-btc-burst` für Spezialtreffer, große Schadenszahl 1,6 s, Beben, Boss blitzt.
4. **₿-Regen** (`btcRain`, drehende Bitcoins aus `sheet-btc-spin`) ab 20 Schaden und bei Heilung.

| fx | Freeze | Ablauf |
|---|---|---|
| chart-up (Plus 70 Prozent) | 2400 ms | Banner; `art/bg-moon.png` blendet hinter dem Boss ein; `fx-candles` steigt von unten (`rise-from-bottom`, 1600 ms, 256 px); bei 500 ms startet `fx-btc-rocket` **mit Christians Gesicht als Reiter** (`launch`, 1400 ms); bei 1000 ms „+70 %" (`mega`); bei 1300 ms Einschlag `btcburst` 256 px + Schaden; `btcRain` 28 Münzen |
| handshake | 1600 ms | Banner; Hände + Gesicht pulsieren 1600 ms, `sparkle`, Einschlag 800 ms |
| can | 1500 ms | Banner; Dose mit Christians Gesicht dahinter fliegt 1100 ms, Schaum (`smoke` klein), Einschlag 900 ms |
| handbag | 1500 ms | Banner; Tasche mit Hildegards Gesicht schwingt 1100 ms, Einschlag 900 ms |
| controller | 1500 ms | wie can, Michas Gesicht, Controller rotiert |
| wallet | 2000 ms | Banner; Controller → Wallet mit Michas Gesicht, drehende ₿ wandern vom Boss zu Micha, Einschlag 1100 ms |
| gas | 1800 ms | Banner; Wolke mit Viktors grünem Gesicht 1800 ms, `smoke` 2×, Einschlag 600 ms |
| speech | 2200 ms | Banner; Viktors Gesicht groß mit Sprechblase (Text 15 px), Boss kippt grau |
| mms | 1600 ms | Banner; M&Ms mit Ramonas Gesicht, Splitter, Einschlag 700 ms |
| bags | 1400 ms | Banner; drei Tüten, Ramonas Gesicht, kleiner ₿-Regen |
| family | 1400 ms | Banner „Familientreffen!"; **echte Sprites von Christian und Micha** rennen herein und bleiben 10 s (hüpfen bei jedem Schlag) |

Boss-Requisiten ×1,4 länger, ohne Freeze. Arena-Bosse sagen `fight`-Sprüche als Sprechblase.

## 7. Mehr Bitcoin sonst

- Fangen: Münze dreht sich im Flug (`sheet-btc-spin`), Treffer `btcburst`, Fang `btcRain` 20 + drehende Münze in der Belohnung.
- Sieg-Overlays: `btcRain` statt `coins`.
- `coins`-Sheet (normale Münzen) wird nicht mehr benutzt.

## 8. Grafiken (Higgsfield)

Neu: `art/sheet-btc-spin.png`, `art/sheet-btc-burst.png`, `art/fx-btc-rocket.png`, `art/fx-candles.png`, `art/bg-moon.png`, `art/icon-hashrate.png`, `art/icon-mining.png`, `art/icon-btc.png`. Fehlt eine Datei, fallen Sheets auf `impact`/`sparkle`, Requisiten auf `fx-chart-up`, Icons auf `icon-coin` zurück.

## 9. Tests

Engine unverändert grün. Neu: `test/format.test.mjs` (`hashrateText`, `reachText`), `test/wild.test.mjs` (`wildBossDef`: Christian Normal Lv. 1 → btc 160, fast 6, Lade-Attacken mit gekürztem Schaden; Hildegard enthält Familientreffen 18; Legendär Lv. 20 skaliert), Ergänzungen in `test/progress.test.mjs` (`feed`, `sell`, `sellDuplicates` behält Team + bestes je Seltenheit, `levelUpUids` Kappe 20).
