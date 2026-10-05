# Rüther GO v5 Implementation Plan – Look & Feel „Pixel-Kneipe"

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die komplette Optik auf das handgemachte 16-Bit-Designsystem umstellen und alle Emoji-Effekte durch die generierten Grafiken aus `art/` ersetzen. Features und Logik aus v1–v4 bleiben unverändert.

**Architecture:** `css/theme.css` liefert Tokens, Fonts, Basisklassen (Papier, Holz, Pixel-Rahmen, Buttons, Balken, Icons). Alle anderen CSS-Dateien bauen darauf auf. `js/fx.js` spielt Sheet-Animationen und Requisiten-Pfade ab; `js/battle-ui.js` und `js/catch.js` nutzen es. Icons sind `<img>`/Hintergrundbilder aus `art/icon-*.png`.

**Spec:** `docs/superpowers/specs/2026-10-04-ruether-go-v5-look-design.md` (gilt bei Zweifel). Grafiken: `art/manifest.json`, `art/README.md`.

**Allgemeine Regeln:** UTF-8 ohne BOM, LF. Keine Commits aus Agenten. `node --test test/*.test.mjs` bleibt grün (keine Logikänderungen!). Agenten ändern nur ihre Dateien. Lokaler Server: `python -m http.server 8010 --bind 127.0.0.1`, `http://127.0.0.1:8010/?debug=1`. Hinweis: rAF ist im eingebetteten Browser oft gedrosselt; Zustände per javascript_tool prüfen, Screenshots für die Optik trotzdem machen (sie hinken nach, aber zeigen den Look).

**Verbote (werden im Review geprüft):** keine Emojis in Kopfzeilen, Tabs, Buttons, Listen, Markern, Effekten (Ausnahme: Feed-Text, der vom Server kommt); keine `box-shadow` mit Unschärfe; keine Farbverläufe außer den Pixel-Dither-Mustern; keine `border-radius` über 4 px (außer Kreise für Avatare/Marker); nicht die alte Palette (`#1b1b1f`, `#2a2a31`, `#f7931a`).

---

## Dateibesitz

| Agent | Dateien |
|---|---|
| A (Shell) | `css/theme.css` (neu), `style.css`, `css/app.css`, `css/screens.css`, `index.html`, `js/ui.js`, `js/screens.js`, `js/map.js`, `js/onboarding.js` |
| B (Kampf) | `css/battle.css`, `js/battle-ui.js` |
| C (Fangen, Effekt-Player, Icons) | `js/fx.js` (neu), `css/catch.css`, `js/catch.js`, `tools/pixelate.py` (Icons aus `art/coin-big.png`), `manifest.json` |

## Modulvertrag `js/fx.js` (C schreibt, B und C nutzen)

```js
// Sheets: 4×4-Raster, 128 px je Frame (art/manifest.json). coins loopt über die ersten 8 Frames.
export const SHEETS = {
  impact:  { file: 'art/sheet-impact.png',  frames: 16, fps: 20, loop: false },
  sparkle: { file: 'art/sheet-sparkle.png', frames: 16, fps: 14, loop: true },
  smoke:   { file: 'art/sheet-smoke.png',   frames: 16, fps: 12, loop: false },
  coins:   { file: 'art/sheet-coins.png',   frames: 8,  fps: 12, loop: true },
};
// Spielt ein Sheet in parent ab (position:absolute, Mitte bei x/y in px oder %). Entfernt sich nach einem Durchlauf, bei loop nach `ms` (Pflicht bei loop). Gibt { el, stop() } zurück.
export function playSheet(parent, name, { x = '50%', y = '50%', size = 128, ms = 0, delay = 0 } = {})
// Requisit (art/fx-<name>.png) auf einem CSS-Pfad: path ∈ 'arc-to-enemy' | 'rise-at-enemy' | 'drop-on-me' | 'morph-at-me' | 'bubble-at-me' | 'helpers' | 'bar-on-me' | 'crash-at-me' | 'swing-at-enemy' | 'pulse-at-enemy'. Entfernt sich nach `ms`. Gibt { el, stop() } zurück. opts.html erlaubt Zusatz-Inhalt (Sprechblasentext, Balken) innerhalb des Requisits.
export function propFx(parent, name, path, { ms = 900, size = 160, delay = 0, html = '' } = {})
// Pixel-Konfetti (Quadrate) in parent, n Stück, Farben-Array, Dauer ms
export function confetti(parent, n = 30, colors = ['#F2C94C', '#3FC1B0', '#B8412F', '#F4E8C8'], ms = 2000)
// Schwebende Zahl/Text in Pixelify: kind ∈ 'hurt' | 'heal' | 'info' | 'big'
export function floatText(parent, text, { x = '50%', y = '40%', kind = 'info', ms = 900 } = {})
```
Die Pfad-Keyframes und `.fx-sheet`/`.fx-prop`/`.fx-confetti`/`.fx-text` Klassen stehen in `css/theme.css` (A) — exakt diese Namen: `@keyframes sheet-4x4` (16 Stufen über `background-position`, `steps`-Timing), `@keyframes path-arc-to-enemy`, `path-rise-at-enemy`, `path-drop-on-me`, `path-morph-at-me`, `path-bubble-at-me`, `path-helpers`, `path-bar-on-me`, `path-crash-at-me`, `path-swing-at-enemy`, `path-pulse-at-enemy`, `fx-confetti-fall`, `fx-text-rise`. Agent A schreibt die Keyframes nach der Beschreibung in Spec §4; Agent C setzt in `fx.js` nur Klassen und CSS-Variablen (`--ms`, `--size`, `--x`, `--y`, `--dx`).

---

### Task A: Designsystem und Shell — Agent A

- [ ] `css/theme.css` neu: Fonts (Google-Fonts-Import `Pixelify Sans` 400/700 und `Nunito` 400/700/800), Tokens aus Spec §2, Basisklassen `.paper`, `.wood`, `.panel` (border-image `art/frame-panel.png` slice 16, Fallback), `.btn/.btn.primary/.btn.danger` (border-image `art/frame-button.png` für primary, sonst Papier mit Ink-Rand; gedrückt 2 px nach unten), `.bar` mit Segmentfüllung und Varianten `.hp .energy .xp`, `.ico` (`img.ico` 24 px pixelated, Größen `.ico-lg` 28, `.ico-xl` 48), `.badge-pixel`, `.ribbon.r-<rarity>`, Pixel-Schatten-Utility, Dither-Texturen, `@keyframes` aus dem fx-Vertrag, `prefers-reduced-motion`-Block.
- [ ] `style.css`, `css/app.css`, `css/screens.css` komplett auf das Designsystem umschreiben (Spec §3 je Screen). Globale `button`-Regel → `.btn`-Optik. Leaflet: Kachel-Filter, Marker wie Spec §3 (Spawn-Rahmen, Arena-Holzschild mit Icon, Stop-Papierkreis), Spieler-Punkt teal.
- [ ] `index.html`: `theme.css` als erste eigene CSS-Datei, Font-Links, Tab-Leiste mit `<img class="ico ico-lg" src="art/icon-*.png" alt="">`, Sats-Chips mit `icon-coin`, Dex-Plakette, Kopfzeilen mit Icons, Splash mit `art/coin-big.png`, Onboarding-Slides mit `art/boss-*.png`/`coin-big` statt der alten Sprites, Stop-Screen mit `icon-beer`, Profil-Buttons mit Icons, Debug-Panel unverändert.
- [ ] `js/ui.js`: Toast-Icons als `<img class="ico">` aus `art/` (Parameter `icon` darf jetzt ein Kit-Name sein: `coin`, `star`, `trophy`, `lightning`, `quest`, `gear`, `beer`, `profile`, `bag`, `map`, `shop`, `lock`; alte Emoji-Aufrufe werden auf diese Namen gemappt), Popup-Karte als Papier mit Holzrahmen.
- [ ] `js/screens.js`, `js/onboarding.js`, `js/map.js`: alle Emoji durch Kit-Icons ersetzen (Buttons, Listen, Marker, Streak, Quests, Rangliste-Plaketten, Erfolge mit `icon-lock` für gesperrt, Shop-Icons `icon-coin`/`icon-beer`/`icon-lightning` je Artikel), Arena-Info zeigt `art/boss-<id>.png` vor `art/bg-<arena>.png`.
- [ ] Offene Punkte aus dem v4-Review, beim Umschreiben mit erledigen:
  - Toasts nicht über die Kopfzeile legen: Stapel über der Tab-Leiste (`bottom: calc(var(--tabbar-h) + 12px + env(safe-area-inset-bottom))`), auf Vollbild-Screens (Fang, Kampf) unten mit 16 px Abstand.
  - `.fusion-anim` über der Kopfzeile des Sammlungs-Screens (z-index höher als `.topbar`), `.fz-late` erst klickbar, wenn sichtbar (`pointer-events: none` bis `.show`).
  - Glücksrad-Beschriftungen aufrecht: `transform: rotate(var(--a)) translateY(-74px) rotate(calc(-1 * var(--a)))`.
  - `prefers-reduced-motion` deckt auch Fusion, Level-Up-Sterne, Kauf-Blitz und Rad ab.
  - Erfolgs-Kacheln: Name mindestens 12 px, Beschreibung mindestens 11 px.
  - `.box` (Sammlung) ohne doppelten Safe-Area-Abstand unten.
  - Debug-Panel endet über der Tab-Leiste (`max-height` berücksichtigt `--tabbar-h`).
  - Der Kopf des Stop-Screens nutzt nicht die Klasse `stop-icon` (die gehört dem Karten-Marker) → `stop-head-icon`.
- [ ] Prüfen: `node --check` für geänderte JS; grep über alle eigenen Dateien nach Emoji-Codepoints (`grep -P "[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}]"`) → nur noch Debug-Panel/Feed; Browser: alle Screens einmal ansehen (Screenshots), keine Überläufe bei 375 px.

### Task B: Kampf — Agent B

- [ ] `css/battle.css` neu auf das Designsystem (Spec §3 Kampf): Bühne mit `art/bg-<arena>.png` (`cover`, pixelated), Boss-Sprite aus `art/boss-<id>.png` 256 px mit 2-Frame-Atmen, HUD-Balken aus theme, Spezial-Buttons `.btn` mit `icon-lightning`, Timer Pixelify, Combo Pixelify gold, Intro-Banner Holz, Wut-Rahmen, Sieg-Urkunde, Niederlage-Stempel. Alle alten Emoji-Keyframes entfernen.
- [ ] `js/battle-ui.js`: Effekt-Tabelle nach `fx`-Namen aus `js/data.js` auf `propFx`/`playSheet`/`floatText`/`confetti` aus `js/fx.js` umstellen (Spec §4 legt Pfad und Sheet je Attacke fest). Boss-Sprite-Quelle `art/boss-<id>.png`; eigener Rüther weiter `sprites/<id>.png` im Pixel-Rahmen. Treffer-Blitz 2 Frames, Beben in ganzen Pixeln. Overlay: Konfetti aus `confetti()`, Sats-Zähler Pixelify. Alle `onEvent`-Hooks, Sounds, Catch-up-Schleife, Intro, Wut, Aufgeben bleiben funktional identisch.
- [ ] Prüfen: `node --check`; Browser-Kampf (Beamen, Alle fangen, Arena, Kämpfen): jede Spezial-Attacke mindestens einmal auslösen (Energie per Tippen; mit Harness wie in v3, wenn nötig), Boss-Attacken beobachten, Screenshots des Kampfes und des Sieg-Overlays.

### Task C: Effekt-Player, Fangen, Icons — Agent C

- [ ] `js/fx.js` nach Vertrag.
- [ ] `css/catch.css` neu (Spec §3 Fangen): `art/bg-catch.png` als Bühne, Pixel-Ring (8 Stufen per `steps(8)`), Aura als gestufter Ring, Münze `art/coin-big.png` 112 px, Super-Münze mit `playSheet('sparkle')`-Loop, Burst mit `impact` + `coins`, Legendär mit `confetti()` gold, Belohnung als Papierzettel, Ausbruch mit `smoke`.
- [ ] `js/catch.js`: nur Darstellung anpassen (Münz-Grafik, Bursts über `fx.js`), Logik/Verträge unverändert (Schnippen, Ring-Skala, onThrow/onCaught/onSuperCoinUsed/onDone).
- [ ] `tools/pixelate.py`: `draw_icons()` nutzt `art/coin-big.png` auf `--night`-Hintergrund für `sprites/icon-192.png` und `icon-512.png`; ausführen. `manifest.json`: `theme_color` `#2F6B4F`, `background_color` `#1B2B4B`.
- [ ] Prüfen: `node --check`; Browser-Fang wie in v3 (synthetische Pointer-Events bei 2 px/ms) bis „Gefangen!", Screenshot.

### Task D: Review-Lesarten (Workflow)

1. **ai-look:** Sieht es noch nach Standard-App aus? Emoji-Reste, alte Farben, weiche Schatten, Verläufe, runde Ecken, generische Karten? Jede Fundstelle mit Datei/Zeile.
2. **mobile/ui:** 375×812, Überlauf, Tab-Leiste, Kontrast, Touch-Größen, reduced motion, Keyframe-Kollisionen über alle CSS-Dateien.
3. **wiring:** fx.js-Vertrag beidseitig, Pfad-Klassen existieren in theme.css, alle `art/`-Dateien, die referenziert werden, existieren (grep `art/` gegen `ls art`), index.html-Selektoren gegen JS.
4. **smoke:** Spiel komplett durchklicken mit Screenshots: Splash, Onboarding, Karte, Fang, Sammlung, Dex, Shop, Quests, Rangliste, Profil, Arena, Kampf (zwei Spezial-Attacken sichtbar), Sieg-Overlay, Stop. Konsole ohne Fehler, Tests grün.

---

## Self-Review

**Spec-Abdeckung:** §2 Designsystem → A (theme.css). §3 Screens → A (alle außer Kampf/Fangen), B (Kampf), C (Fangen). §4 Effekte → C (fx.js) + B (Einsatz) + A (Keyframes). §5 Karte → A. §6 → A (reduced motion, Kontrast). §7 Dateien → Besitztabelle.

**Verträge:** `fx.js` oben; Keyframe-Namen zwischen A und C exakt gleich; Icon-Namen in `ui.js` (A) und Aufrufen in `app.js` (unverändert, Emoji-Strings werden von `ui.js` gemappt).