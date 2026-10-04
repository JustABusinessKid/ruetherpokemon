# Rüther GO v5 – Look & Feel „Pixel-Kneipe"

Stand: 2026-10-04. Sebis Feedback: „sieht hardcore nach einer KI-App aus;
Animationen und Spezial-Attacken mit Higgsfield deutlich schöner." Baut auf
v4 auf (Features bleiben), ersetzt die komplette Optik.

## 1. Richtung

Ein handgemachtes 16-Bit-RPG-Menü aus der Kneipe: Holz, Papier, Messing,
Bierdeckel. Keine Dunkelgrau-Panels mit Orange, keine Emojis in der
Bedienoberfläche, keine weichen Schatten, keine Verläufe. Die pixeligen
Fotogesichter der Rüthers sind das Markenzeichen und bleiben; alles andere
wird im selben Pixel-Stil erzeugt (Grafik-Kit in `art/`, siehe
`art/manifest.json`, Stil-Satz in `art/README.md`).

## 2. Designsystem (`css/theme.css`, von allen anderen CSS-Dateien benutzt)

**Farben (CSS-Variablen in `:root`):**

| Token | Hex | Rolle |
|---|---|---|
| `--paper` | #F4E8C8 | Flächen (Karten, Panels) |
| `--paper-2` | #E8D7A8 | zweite Papierstufe, Streifen |
| `--ink` | #1E2A22 | Text, Umrandungen |
| `--ink-soft` | #4A5A4F | Nebentext |
| `--wood` | #5A3A1E | Rahmen, Tab-Leiste |
| `--wood-2` | #3D2612 | Rahmen-Schatten |
| `--green` | #2F6B4F | Hintergrund hinter Papier, Erfolg |
| `--green-2` | #1F4A36 | dunkleres Grün |
| `--red` | #B8412F | Gefahr, Niederlage, Boss-Schaden |
| `--amber` | #E0A52B | Buttons, Hervorhebung |
| `--gold` | #F2C94C | Sats, Legendär |
| `--teal` | #3FC1B0 | Signal, Energie, Selten |
| `--night` | #1B2B4B | Kampf-Hintergrund, Splash |
| `--r-normal` #9AA0A6 · `--r-selten` #3F8EF5 · `--r-episch` #A24FE0 · `--r-legendaer` #F2C94C | Seltenheit |

**Schrift:** Google Fonts `Pixelify Sans` (Titel, Zahlen, Buttons, 18–32 px)
und `Nunito` (Fließtext 15 px, Nebentext 13 px). `image-rendering: pixelated`
auf allen Grafiken aus `art/`.

**Formen:** Ecken 0 oder 4 px. Harte Versatz-Schatten (`box-shadow: 4px 4px 0
var(--wood-2)`), keine Unschärfe. Pixel-Rahmen per `border-image` aus
`art/frame-panel.png` (9-Slice, Slice 16) für Panels/Karten und
`art/frame-button.png` für Buttons; Fallback ohne Bild: 3-px-Rand in `--ink`
plus 2-px-Innenlinie in `--paper-2`.

**Buttons:** `.btn` (Papier, Ink-Rand, Pixel-Schatten, Pixelify), `.btn.primary`
(Bernstein), `.btn.danger` (Rot), gedrückt: Schatten weg + 2 px nach unten.
Mindestens 44 px hoch.

**Icons:** `.ico` ist ein `<img>` oder `<span>` mit `background-image` aus
`art/icon-*.png`, 24 px (Tab-Leiste 28 px). Keine Emojis in Kopfzeilen,
Tabs, Buttons, Listen. In Feed-Texten und Toasts sind Icons aus dem Kit
Pflicht statt Emoji (Toast-Varianten bringen ihr Icon mit).

**Balken:** `.bar` Pixel-Balken: 12 px hoch, Ink-Rand, Füllung in 8-px-Segmenten
(`repeating-linear-gradient` mit 1-px-Fuge), Farben: Leben grün → rot unter
25 %, Energie teal, XP gold.

**Papier-Textur:** `.paper` Hintergrund `--paper` mit feinem Dither
(`repeating-conic-gradient` 2 px, 4 % Ink). Holz: `--wood` mit horizontalen
1-px-Maserungslinien in `--wood-2` (12 % Deckung).

## 3. Screens

- **Splash:** `--night`, `art/coin-big.png` pulsiert (Pixel-Sprung, keine
  weiche Skalierung), Titel „Rüther GO" in Pixelify 40 px creme mit
  Ink-Versatz-Schatten, Untertitel „Lade Rüthers…".
- **Onboarding:** `art/bg-menu.png` abgedunkelt, Slides als Papierkarten mit
  Holzrahmen, Punkte als Pixel-Quadrate, Avatar-Auswahl in Pixel-Rahmen.
- **Karte:** Kopfzeile ist ein Holzbalken mit dem Titel in Pixelify, rechts
  Dex-Plakette (Papier) und Sats-Plakette (gold, `icon-coin`). Banner als
  Papierstreifen mit Icon. Die OSM-Kacheln bekommen einen Papier-Filter
  (`filter: sepia(.35) saturate(.75) contrast(1.05)`), damit die Karte zum
  Spiel passt. Ortungs-Button als Pixel-Button mit `icon-map`.
  Marker: Spawn = Pixel-Rahmen in Seltenheitsfarbe um das Gesicht, Legendär
  mit `icon-star`-Funkeln; Arena = Holzschild mit `icon-trophy` (eigener
  Besitz) oder Schwert-Pixelgrafik (frei), Level-Plakette; Stop = `icon-beer`
  auf Papierkreis, abgekühlt grau.
- **Tab-Leiste:** Holzplanke mit fünf Pixel-Icons (`icon-map`, `icon-bag`,
  `icon-quest`, `icon-trophy`, `icon-profile`), aktiv mit Papier-Reiter und
  Bernstein-Unterstrich, Badge rot-rund mit Ink-Rand.
- **Sammlung:** Karten als Papier mit Holzrahmen, links das Gesicht im
  Seltenheitsrahmen, Seltenheit als farbiges Pixel-Band oben links, Level
  als Plakette, Buttons Papier/Bernstein. Fusion-Button mit `icon-star`.
- **Rütherdex:** Papierbogen mit Raster, leere Felder als gestrichelte
  Ink-Rahmen mit „?"-Pixelgrafik (aus `unknown.png`).
- **Shop:** Regal-Optik: `art/bg-menu.png` oben als Band, Artikel als Papier-
  Preisschilder mit `icon-shop`/`icon-coin`, Preis in Pixelify.
- **Quests:** Schriftrolle: Papierstreifen je Quest, Fortschrittsbalken gold,
  Button „Einlösen" Bernstein; Streak-Karte mit `icon-star`.
- **Rangliste:** Holzbrett mit Papierzeilen, Platz 1–3 mit Messing-Plakette
  (gold/silber/bronze als Pixel-Kreise), Online-Punkt teal.
- **Profil:** Trainerkarte (Papier, Holzrahmen, Foto-Rahmen in Seltenheit
  des Anführers), XP-Balken gold, Statistik als Bierdeckel-Kacheln (runde
  Papierkreise), Erfolge als Pixel-Abzeichen (gesperrt: `icon-lock`,
  grau), Einstellungen als Papierliste mit Pixel-Schaltern.
- **Arena-Info:** Plakat: Boss-Sprite aus `art/boss-*.png` groß auf
  `art/bg-<arena>.png`, darunter Papierzettel mit Level, Besitzer, Belohnung.
- **Kampf:** Bühne zeigt `art/bg-<arena>.png` (statt CSS-Verläufen), Boss aus
  `art/boss-*.png` (256 px, Atmen = 2-Frame-Pixelwackeln), eigener Rüther im
  Pixel-Rahmen, Balken wie oben, Spezial-Buttons als Pixel-Buttons mit
  `icon-lightning` und Kosten in Pixelify, Timer als Pixel-Anzeige, Combo in
  Pixelify gold. Intro: Holz-Banner mit „VS" in Pixelify 48 px.
  Wut: roter Pixel-Rahmen (4 px, blinkend), Boss-Sprite rot getönt.
  Sieg-Overlay: Papierurkunde mit Holzrahmen, `icon-trophy` groß, Konfetti
  als Pixel-Quadrate, Sats-Zähler gold; Niederlage: Papier mit Rotstempel
  „VERLOREN".
- **Fangen:** `art/bg-catch.png` als Bühne, Rüther in Seltenheitsrahmen mit
  Aura als Pixel-Ring (gestufte Deckung), Ring schrumpft in 8 Stufen (Pixel),
  Münze `art/coin-big.png`, Super-Münze mit `sheet-sparkle`-Funkeln,
  Fang-Burst `sheet-impact` + `sheet-coins`, Legendär zusätzlich
  Gold-Konfetti aus Pixel-Quadraten, Belohnung als Papierzettel.
- **Stop:** Bierdeckel-Glücksrad (Pixel-Sektoren in Bernstein/Rot/Grün/Creme),
  `icon-beer` groß, Ergebnis als Papierzettel.
- **Toasts:** Papierstreifen mit Ink-Rand und Pixel-Schatten, Icon aus dem Kit
  (`icon-coin`, `icon-star`, `icon-trophy`, `icon-lightning`).
- **Popups:** Papierkarte mit Holzrahmen, Titel Pixelify, Buttons unten.

## 4. Effekte im Kampf (`js/battle-ui.js`, `css/battle.css`)

Alle Emoji-Effekte werden durch Grafiken aus `art/` ersetzt. Zwei Bausteine:

1. **Requisiten-Animation:** `<img class="fx-prop">` mit `art/fx-<name>.png`,
   bewegt per CSS-Keyframes auf einem Pfad. Pfade:
   - `arc-to-enemy` (von unten links im Bogen zum Boss, 700 ms, Drehung 360°): beer-can, controller, handbag (ohne Drehung, mit Schwung), bags (drei Instanzen versetzt).
   - `rise-at-enemy` (erscheint über dem Boss, wächst, verblasst, 1,2 s): chart-up (plus `sheet-coins` darüber), handshake (Puls), gas (`sheet-smoke` darunter), mms (Partikel: 12 kleine Kopien in Seltenheitsfarben, die auseinanderfliegen), yellow-light, pickaxe (Schwung), key (steigt auf und verblasst).
   - `drop-on-me` (fällt von oben auf den eigenen Rüther, 500 ms, Einschlag `sheet-impact`): disc, block, halving, chain (rasselt: 3 × 6 px Zittern).
   - `morph-at-me` (beim eigenen Rüther: controller → wallet mit Klapp-Drehung, dann `sheet-coins` vom Boss zum Rüther): wallet.
   - `bubble-at-me` (Sprechblase `fx-speech` mit Text „Deutsche Bank ist kein Geringverdiener." in Pixelify 13 px darin, 2 s): speech.
   - `helpers` (`fx-family` rutscht neben den eigenen Rüther, hüpft bei jedem Schlag, 10 s): family.
   - `bar-on-me` (`fx-firmware` über dem eigenen Rüther mit laufendem Pixel-Balken): firmware.
   - `crash-at-me` (`fx-crash` fällt diagonal über den eigenen Rüther): crash.
2. **Sheet-Animationen:** `<div class="fx-sheet" data-sheet="impact">` mit
   `background-image: url(art/sheet-impact.png)`, `background-size: 1600%
   400%` … Frame-Raster laut `manifest.json` (cols/rows), `animation:
   sheet-play 0.6s steps(<frames-1>) forwards` über `background-position`.
   Verwendung: `impact` bei jedem Treffer auf den Boss und bei Boss-Treffern
   auf den Spieler (skaliert nach Schaden), `sparkle` bei Spezial-Einsatz und
   Heilung, `smoke` bei Gift, `coins` bei chart-up, drain, Sieg.
   Fehlt ein Sheet im Manifest (Note), fällt der Effekt auf `impact` zurück.
3. **Treffer-Feedback:** Boss-Sprite blitzt weiß (2 Frames), Bühne bebt in
   ganzen Pixeln (translate 2/4/6 px), Schadenszahlen in Pixelify mit
   Ink-Versatz, groß ab 25.
4. Timing: Requisit fliegt 700 ms, Einschlag-Sheet startet bei 600 ms, Zahl
   bei 650 ms; Engine-Events werden wie in v3 mit `batchDelay` verzögert.

## 5. Karten-Kacheln und Leaflet-Chrome

Zoom-Steuerung bleibt aus; Attribution unten rechts in 10 px Ink auf Papier.
Spieler-Punkt: 16-px-Pixel-Kreis in `--teal` mit Ink-Rand, Puls als
3-stufiger Pixel-Ring.

## 6. Reduzierte Bewegung, Kontrast

`prefers-reduced-motion`: keine Loops (Atmen, Puls, Funkeln), Effekte
erscheinen statisch. Textkontrast mindestens 4,5:1 (Ink auf Papier, Creme
auf Holz/Grün/Nacht).

## 7. Dateien

`css/theme.css` (neu, Tokens, Basisklassen, Fonts), `style.css`, `css/app.css`,
`css/screens.css`, `css/catch.css`, `css/battle.css` (alle umgeschrieben auf
das Designsystem), `js/battle-ui.js` (Effekte), `js/catch.js` (Bühne, Burst),
`js/map.js` (Marker), `js/screens.js` (Icons statt Emoji), `js/ui.js`
(Toast-Icons), `index.html` (Font-Links, Icon-`img`s in Tab-Leiste und
Kopfzeilen). Grafiken: `art/*.png`, `art/manifest.json`.
