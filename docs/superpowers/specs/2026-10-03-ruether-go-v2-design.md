# Rüther GO v2 – Echtzeit-Kampf, Fangen, Ortung

Stand: 2026-10-03, nach dem ersten Anspielen durch Sebi. Ersetzt in der
v1-Spec (`2026-10-03-ruether-go-design.md`) die Abschnitte §3 Attacken/Bosse,
§4 Bildschirme 2 und 5, §6 Fangen, §7 Kampf-Engine, §8 Arenen, §13 Tests
(Kampf). Alles andere aus v1 gilt weiter.

Feedback, das hier umgesetzt wird:
1. Kämpfe sollen sich wie in Pokémon GO anfühlen (Echtzeit, tippen, wischen).
2. Jede Spezial-Attacke bekommt eine eigene Animation.
3. Nach dem Arenasieg muss etwas passieren (Belohnung, Besitz).
4. Der Standort folgt dem Spieler nicht automatisch.
5. Fangen braucht deutlich bessere Animationen und mehr Spiel.

## 1. Ortung und Karte

- `createLocator` beobachtet weiter per `watchPosition`. Neu: bei
  `visibilitychange` auf sichtbar wird die Beobachtung neu gestartet
  (`restart()`), bei Fehlercode TIMEOUT ebenfalls nach 2 s. So kommt die
  Position nach dem Zurückwechseln in den Browser wieder.
- **Folgen-Modus:** Die Karte folgt dem Spieler (pan bei jeder neuen Position).
  Zieht der Spieler die Karte selbst (`dragstart`), geht der Folgen-Modus aus.
  Ein runder Button „📍" unten rechts über der Karte schaltet ihn wieder ein
  und zentriert. Der Button ist hervorgehoben, solange gefolgt wird.
- **Spawns beim Laufen:** Zusätzlich zum 60-s-Intervall werden Spawns
  aufgefüllt, sobald der Spieler mehr als 50 m vom Punkt des letzten
  Auffüllens entfernt ist.
- Der Spieler-Punkt bekommt einen pulsierenden Genauigkeitsring (CSS), damit
  man sieht, dass die Ortung lebt.

## 2. Fangen v2

Ziel: anfühlen wie der Fang-Bildschirm in Pokémon GO.

### Bühne
- Der Rüther steht in der oberen Hälfte, bewegt sich dauerhaft langsam hin
  und her (CSS `roam`, ±40 px, 4 s) und hüpft alle paar Sekunden (`hop`).
- Alle 5–9 s (zufällig) **wehrt er sich** 1,2 s lang: Sprite wackelt rot
  (`angry`). Eine Münze, die in dieser Zeit trifft, prallt ab („Abgewehrt!"),
  zählt nicht als Fehlversuch.
- Auf dem Rüther liegt ein **schrumpfender Ring** (CSS, von Skalierung 1,0 auf
  0,3 in 2,4 s, dann wieder von vorn). Je kleiner der Ring beim Treffer, desto
  höher die Chance:
  - Skalierung < 0,5: „Super!", +0,25
  - Skalierung < 0,75: „Gut!", +0,12
  - sonst: kein Bonus
  Chance = Grundchance des Rüthers + Bonus, maximal 0,95.
- Unten liegt die Bitcoin-Münze.

### Wurf
- Pointer-Events (Finger oder Maus). Die Münze lässt sich ziehen; beim
  Loslassen wird die Geschwindigkeit aus den letzten ~100 ms berechnet.
- Geht die Bewegung nach oben mit mindestens 0,6 px/ms, fliegt die Münze.
  Zielpunkt: Startpunkt plus Geschwindigkeit × 450 ms (x und y). Zu schwach =
  Münze fällt vor dem Rüther runter, zu schräg = daneben. Flug 700 ms,
  JS-animiert (Parabel: zusätzlicher Bogen von 120 px, Drehung, Verkleinerung
  auf 50 %).
- Treffer, wenn der Zielpunkt im um 20 px vergrößerten Rechteck des Sprites
  liegt. Daneben: „Daneben!", Münze fällt aus dem Bild, nach 500 ms wieder
  bereit. Daneben kostet nichts.
- Münzen sind unbegrenzt.

### Treffer
1. Rüther wird in die Münze gesaugt (Sprite skaliert auf 0 zur Münze hin,
   400 ms), Münze fällt auf den Boden (200 ms).
2. Ergebnis wird einmal gewürfelt: `rng() < Chance` → gefangen.
3. Münze wackelt (je 600 ms, ±20°). Gefangen: drei Wackler, dann **Burst**
   (acht Sterne fliegen auseinander, Münze leuchtet, „Gefangen!"), nach 1 s
   `onDone({ caught: true })`.
   Nicht gefangen: nach 1–3 Wacklern (zufällig) platzt die Münze, der Rüther
   springt wieder raus (`pop`), „Rausgehauen!". Ein Fehlversuch weniger.
4. Nach dem **dritten Ausbruch** haut er ab: Sprite rennt seitlich raus,
   „… ist abgehauen.", nach 1 s `onDone({ caught: false })`.
- Anzeige unten: Name, Titel, Beschreibung, „Ausbrüche übrig: 3".
- Ring-Bewertung („Super!"/„Gut!") erscheint beim Treffer als Text über dem
  Rüther.

Fang-Logik ohne DOM, testbar (`js/catch-logic.js`):
```js
ringBonus(scale) -> { label: 'Super!'|'Gut!'|'', bonus }
catchChance(base, scale) -> number  (max 0.95)
landing(start, vx, vy) -> { x, y }  // 450 ms Flug
isHit(point, rect, pad = 20) -> boolean
rollCatch(chance, rng) -> { caught, wobbles }  // caught: 3 Wackler, sonst 1–3
```

## 3. Kampf v2 (Echtzeit)

### Grundidee
Ein Kampf dauert maximal **90 s**. Es gibt keine Runden mehr. Der Spieler
tippt auf den Boss für schnelle Angriffe, lädt damit Energie, setzt
Spezial-Attacken ein und weicht Boss-Angriffen durch Wischen aus.

### Zahlen

| Name | Wert |
|---|---|
| BATTLE_DURATION | 90 000 ms |
| FAST_DAMAGE | 3 BTC pro Tipp |
| FAST_ENERGY | +10 Energie pro Tipp |
| FAST_COOLDOWN | 250 ms (max. 4 Tipps/s) |
| MAX_ENERGY | 100 |
| DODGE_FACTOR | 0,25 (ausgewichen = 25 % Schaden) |
| WEAKEN_FACTOR | 0,75 |
| SUMMON_INTERVAL | 1000 ms |
| CHARGED_EVERY | 10 000 ms (Abstand Boss-Lade-Attacken) |
| STUN_GRACE | 500 ms Pause nach einer Betäubung |

### Spezial-Attacken der Rüthers (`cost` = Energie, `fx` = Animation)

| Rüther | Attacke | cost | Schaden | Effekt | fx |
|---|---|---|---|---|---|
| Christian | Plus 70 Prozent | 100 | 40 | – | chart-up |
| Christian | Vice-President-Handschlag | 50 | 10 | Boss 8 s geschwächt | handshake |
| Christian | Werfen mit Dosenbier | 50 | 20 | – | can |
| Hildegard | Familientreffen | 100 | 0 | Christian + Onkel Micha schlagen 10 s lang jede Sekunde je 4; einmal pro Kampf | family |
| Hildegard | Handtaschen-Hieb | 50 | 20 | – | handbag |
| Onkel Micha | Hardware-Wallet-Umbau | 100 | 30 | Schaden wird ihm gutgeschrieben | wallet |
| Onkel Micha | Controllerwurf | 50 | 25 | – | controller |
| Viktor | Giftgas | 100 | 10 | Boss 8 s vergiftet, 5 BTC/s | gas |
| Viktor | Ungeschlagene Argumentationslogik | 50 | 10 | Boss 3 s betäubt | speech |
| Ramona | Abgelaufene M&Ms | 100 | 15 | Boss 8 s vergiftet, 4 BTC/s | mms |
| Ramona | Unlimited Credits | 50 | 0 | heilt sich 40 | bags |

Spezial-Attacken treffen immer. Energie gehört zum Rüther und bleibt beim
Wechsel erhalten.

### Bosse

Jeder Boss hat einen **schnellen Angriff** (alle 2,5 s, Warnung 600 ms) und
**Lade-Attacken** (alle 10 s, Warnung 1200 ms, abwechselnd in Listenreihenfolge).
Nach einer Lade-Attacke kommt der nächste schnelle Angriff frühestens 1 s später.

| Boss | BTC | Schnell | Lade-Attacken | fx |
|---|---|---|---|---|
| Playstation 3 | 260 | Blu-ray-Wurf 12 | Yellow Light of Death 25 + Gift 3/s 6 s · Firmware-Update 0, Spieler 2 s betäubt (Tippen geht nicht) | disc · yellow · firmware |
| Herr der Rütherschanze | 360 | Kurssturz 15 | Blockchain-Kette 25 + Gift 5/s 6 s · Mining heilt 40 | crash · chain · mining |
| Satoshi Nakamoto | 440 | Genesis Block 18 | Halving 45 · Private Key verloren heilt 40 | block · half · key |

### Ausweichen
Während der Warnung blinkt der Bildschirm (gelb = schnell, rot = Lade-Attacke)
und der Boss holt aus. Wischen nach links oder rechts in diesem Fenster =
ausgewichen: Schaden × 0,25 (abgerundet), Gift und Betäubung wirken nicht.
Heilung des Bosses passiert immer. Wischen außerhalb der Warnung tut nichts.

### Status
- Gift: pro Sekunde `perSec` BTC, bis `until`. Neues Gift überschreibt.
- Betäubt (Boss): keine Angriffe, laufende Warnung abgebrochen, Timer auf
  `stunUntil + 500 ms` verschoben.
- Betäubt (Spieler): Tipps und Spezial-Attacken werden ignoriert.
- Geschwächt (Boss): Schaden × 0,75.
- Herbeigerufene: schlagen jede Sekunde, ohne Trefferwurf.

### Engine (`js/battle.js`), reine Logik, kein DOM

```js
makeFighter(def, bonusBtc = 0) -> Fighter
makeBoss(def) -> Boss
createBattle({ team, enemy, rng, duration }) -> State
tick(state, dt, input) -> Event[]   // mutiert state, dt in ms
```
`input = { taps?: n, dodge?: bool, special?: index, switchTo?: index }`

Fighter: `{ id, name, btc, maxBtc, attacks, energy: 0, used: {}, status: { poison: null|{perSec, until, acc}, stunUntil: 0, weakenedUntil: 0 } }`
Boss: wie Fighter plus `{ fast, charged, chargedIndex: 0, nextFastAt, nextChargedAt, warning: null|{ kind, attack, firesAt, dodged } }`
State: `{ team, active, enemy, time, duration, summons: [{name, damage, nextAt, until}], tapCooldown, over, won, reason: null|'ko'|'wiped'|'timeout', rng }`

Reihenfolge in `tick`:
1. `time += dt`, `tapCooldown -= dt`.
2. Eingabe: Wechsel (nur auf lebenden, anderen Rüther) → Tipps (pro Tipp:
   wenn nicht betäubt und `tapCooldown <= 0`: FAST_DAMAGE auf Boss, Energie
   +FAST_ENERGY bis MAX, Cooldown setzen; weitere Tipps im selben Tick
   verfallen) → Ausweichen (nur wenn Warnung aktiv und noch nicht
   ausgewichen) → Spezial (Energie reicht, nicht betäubt, nicht verbraucht;
   sonst Event `specialDenied`).
3. Herbeigerufene schlagen zu, wenn `nextAt <= time`, bis `until`.
4. Boss: wenn nicht betäubt: ohne Warnung prüfen, ob die nächste fällige
   Attacke (Lade-Attacke hat Vorrang bei Gleichstand) ihre Warnzeit erreicht
   hat → Warnung starten (`firesAt = max(fällig, time + warn)`). Mit Warnung
   und `time >= firesAt` → auflösen.
5. Gift tickt auf beiden Seiten (Akkumulator, jede volle Sekunde).
6. Boss `btc <= 0` → `over, won = true, reason 'ko'`, Event `win`.
   Aktiver Rüther `btc <= 0` → Event `faint`; nächster lebender wird aktiv
   (Event `switch`), sonst `lose` mit `wiped`.
   `time >= duration` → `lose` mit `timeout`.

Events (für die Animationen): `fast{damage}`, `special{attack, damage}`,
`specialDenied{index}`, `stunnedTap`, `warn{kind, attack, ms}`, `dodge`,
`enemyAttack{kind, attack, damage, dodged}`, `poisoned{target, ms}`,
`poison{target, damage}`, `stun{target, ms}`, `weaken{ms}`,
`heal{target, amount}`, `summoned{names, ms}`, `summon{name, damage}`,
`faint{fighter}`, `switch{to, fighter}`, `win`, `lose{reason}`.
`target` ist `'me'` oder `'enemy'`.

### Kampf-Bildschirm (`js/battle-ui.js`, `css/battle.css`)

Aufbau von oben nach unten:
1. Kopf: Boss-Name, BTC-Balken, Status-Icons, Timer (Sekunden, unter 10 s rot).
2. **Bühne** (`.stage`, nimmt den meisten Platz): großer Boss-Sprite in der
   Mitte, darüber die Effekt-Ebene (`.fx`). Tippen auf die Bühne = schneller
   Angriff, horizontales Wischen (> 40 px) = Ausweichen. Pointer-Events,
   `touch-action: none`. Pfeiltasten links/rechts zählen am Desktop als
   Ausweichen.
3. Eigener Rüther: Sprite, Name, BTC-Balken, **Energieleiste** (orange),
   Status.
4. Spezial-Buttons (eine Zeile pro Rüther, bis zu drei Buttons plus
   „Wechseln"): Name, Kosten (⚡), Schaden. Deaktiviert, solange die Energie
   nicht reicht, der Rüther betäubt ist oder die Attacke verbraucht ist.
   Reicht die Energie, pulsiert der Button.
5. Overlay am Ende (siehe §4).

Schleife: `requestAnimationFrame`, `dt` auf 100 ms begrenzt, Eingaben werden
zwischen zwei Frames gesammelt und als ein `input` an `tick` übergeben.

### Animationen (Pflicht, jede eigenständig erkennbar)

Allgemein: Treffer auf den Boss = Sprite wackelt + schwebende Schadenszahl;
Warnung = Bildschirm blinkt gelb/rot und Boss-Sprite holt aus (`windup`);
Lade-Attacke trifft = Bühne bebt; ausgewichen = eigener Sprite rutscht zur
Seite, „Ausgewichen!"; vergiftet = Sprite grün getönt; betäubt = Boss
grau und schief mit 💤 / Spieler mit Firmware-Fortschrittsbalken; geschwächt
= ↓-Pfeil; Heilung = grünes Leuchten + „+n"; Pleite = Sprite kippt um.

Spezial-Attacken (`fx`):

| fx | Animation |
|---|---|
| chart-up | Grüne Kurslinie zieht über den Boss nach oben rechts, „+70 %" groß, Bitcoin-Münzen regnen |
| handshake | 🤝 pulsiert vor dem Boss, Boss wird für die Dauer blass (geschwächt) |
| can | 🍺 fliegt im Bogen von unten zum Boss, dreht sich, Boss wackelt beim Einschlag |
| family | Christian- und Micha-Sprites rutschen neben den eigenen Rüther, bleiben 10 s, hüpfen bei jedem Schlag |
| handbag | 👜 schwingt von der Seite in den Boss |
| wallet | 🎮 erscheint beim eigenen Rüther und klappt zu ₿ um, danach fliegen Münzen vom Boss zum Rüther (Drain) |
| controller | 🎮 fliegt rotierend zum Boss |
| gas | Grüne Wolke breitet sich über dem Boss aus und verblasst, Boss bleibt grün, solange Gift wirkt |
| speech | Sprechblase „Deutsche Bank ist kein Geringverdiener." beim Rüther, Boss kippt grau zur Seite mit 💤 |
| mms | Bunte Punkte prasseln auf den Boss, danach grüne Tönung |
| bags | 🛍️🛍️🛍️ hüpfen beim Rüther, Lebensbalken leuchtet, „+40" |

Boss-Attacken (`fx`): disc 💿 fliegt runter · yellow gelbes Leuchten ·
firmware Fortschrittsbalken „Firmware-Update" über dem Spieler · crash rote
fallende Kurslinie · chain ⛓️ rasselt · mining ⛏️ schwingt + Heil-Leuchten ·
block 🧱 fällt auf den Spieler · half riesiges „½" · key 🔑 steigt auf +
Heil-Leuchten.

Emoji sind erlaubt; alle Bewegungen per CSS-Keyframes, nur der Münzflug im
Fangen und der Kampf-Tick laufen in JS.

## 4. Arenen und Belohnung

- Sieg: Overlay im Kampf-Bildschirm: Boss-Sprite kippt um und verblasst,
  🏆 springt groß rein, „Arena erobert!", Text „<Boss> ist pleite. Die Arena
  gehört jetzt <Rüther 1 des Teams>." Button „Weiter".
- Niederlage: Overlay „Verloren", Grund („Die Zeit ist um." oder „Alle Rüthers
  sind pleite."), Buttons „Nochmal" (startet denselben Kampf frisch) und
  „Karte".
- Spielstand: `arenasBeaten` (ids) bleibt, neu `arenaOwners: { [arenaId]: ruetherId }`
  = erster Rüther des Teams beim Sieg (wird bei erneutem Sieg überschrieben).
- Karte: eroberte Arena zeigt statt ⚔ den Sprite des Besitzers mit goldenem
  Rand und kleinem 🏆.
- HUD: „n/3 Trophäen". Drei Trophäen → Krone wie in v1.
- Test-Modus: neuer Button „Boss fast tot" (Boss startet mit 20 BTC) zum
  schnellen Testen des Sieg-Overlays.

## 5. Tests

`test/battle.test.mjs` (neu, `node:test`, `dt` 50 ms):
- Tipp macht 3 Schaden und +10 Energie; zweiter Tipp innerhalb 250 ms verfällt.
- Spezial ohne Energie → `specialDenied`; mit 100 Energie → Schaden, Energie 0.
- Warnung startet 600 ms vor dem schnellen Angriff; Ausweichen im Fenster → 25 % Schaden; außerhalb → nichts.
- Gift auf dem Boss tickt 8× je 5 und endet.
- Betäubung: Boss greift 3 s nicht an, Warnung abgebrochen, danach wieder.
- Betäubter Spieler: Tipps ignoriert (`stunnedTap`).
- Familientreffen: 20 Schläge je 4 in 10 s, zweiter Einsatz verweigert.
- Schwächung: 12 → 9.
- Drain heilt um den Schaden, Heilung nicht über maxBtc.
- Pleite → Wechsel; alle pleite → `lose wiped`.
- Zeit abgelaufen → `lose timeout`.
- Boss pleite → `win`, keine weiteren Events.
- Lade-Attacken wechseln (Blockchain-Kette, dann Mining heilt 40).

`test/catch.test.mjs`: ringBonus-Stufen, catchChance-Kappe, landing,
isHit mit Rand, rollCatch (gefangen = 3 Wackler, sonst 1–3).

`test/spawn.test.mjs` unverändert.
