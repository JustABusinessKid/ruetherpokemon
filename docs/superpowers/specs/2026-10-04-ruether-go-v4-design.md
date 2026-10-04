# Rüther GO v4 – Richtige App

Stand: 2026-10-04. Baut auf v1–v3 auf. Sebis Feedback: „Gesamterlebnis, UI
und alles weitere ist weit entfernt von einer normalen oder guten App, es
fehlen Features." Ziel: eine App, die sich wie ein echtes Spiel anfühlt, mit
Online-Welt für den Freundeskreis.

## 0. Zwei Deployments, ein Backend

- **Backend:** Cloudflare-Worker mit D1 unter `https://ruether-go.higgsfield.app`
  (Higgsfield-Plattform). API: `GET /api/state`, `POST /api/sync`,
  `POST /api/arena`, `POST /api/event`. CORS für GitHub Pages und localhost.
  Spieler identifizieren sich über ein zufälliges Geräte-Token (UUID).
- **Frontend:** identisch unter `https://ruether-go.higgsfield.app/play/` und
  `https://justabusinesskid.github.io/ruetherpokemon/`. `API_BASE` in
  `js/data.js`. Ist die API nicht erreichbar, läuft alles lokal weiter
  (Offline-Modus, kleiner Hinweis in der Rangliste).

## 1. App-Shell

- **Tab-Leiste** unten, fünf Tabs mit Icon und Label: 🗺️ Karte, 🎒 Sammlung,
  📋 Quests (Badge mit Zahl einlösbarer Quests), 🏆 Rangliste, 👤 Profil.
  Shop über den Sats-Chip im Kopf jedes Screens und aus dem Profil.
- Jeder Screen: Kopfzeile mit Titel, rechts Sats-Chip „💰 1.230". Karte
  behält Dex-Chip und Krone.
- Screen-Wechsel mit kurzer Blende (Fade/Slide 180 ms, `prefers-reduced-motion`
  respektiert). Fang und Kampf bleiben Vollbild ohne Tab-Leiste.
- **Splash** beim Laden: Münze pulsiert, „Rüther GO", „Lade Rüthers…", mind. 600 ms.
- **Toasts** mit Icon, stapelbar (max. 3), 2,2 s. Varianten: Info, Sats (+n 💰),
  Erfolg (🏅), Level (⬆).
- **Popups** (modal, zentriert, abdunkelnder Hintergrund) für Level-Up,
  Tagesbonus, Quest-Belohnung, Fusion-Ergebnis, iOS-Hinweis.

## 2. Onboarding (erster Start)

1. Drei Karten mit Wischen/„Weiter": Fangen (Münze schnippen), Arenen
   (tippen, wischen, erobern), Sammeln (Seltenheiten, Dex, Power-Ups).
2. **Profil anlegen:** Spielername (2–16 Zeichen, Pflicht) und Avatar (einer
   der fünf Rüther-Sprites). Button „Los geht's".
3. Startgeschenk: 100 Sats und 1 Super-Münze, Toast. Spielstand bekommt
   `profile { nickname, avatar, token (crypto.randomUUID()), createdAt }`.
   Ein alter Spielstand ohne Profil durchläuft nur Schritt 2.

## 3. Trainer-Level und XP

| Quelle | XP |
|---|---|
| Fang Normal / Selten / Episch / Legendär | 20 / 50 / 120 / 300 |
| Arenasieg | 100 × Arena-Level |
| Quest | laut Quest (50–150) |
| Dosenbier-Stop | 10 |
| Fusion | 60 |

- Level n → n+1 braucht `150 × n` XP (Level 1→2: 150, 2→3: 300 …), XP-Balken
  im Profil und in der Kopfzeile des Profils.
- Level-Up: Popup „Level n!" mit Belohnung `100 × n` Sats; bei Level 5, 10, 15, 20
  Feed-Eintrag.
- Reine Logik: `addXp(save, n) -> { levelUps: [n…], sats }`, `xpForLevel(n)`,
  `levelProgress(save) -> { level, xp, need }`.

## 4. Tagesquests, Tagesbonus

- Drei Quests pro Tag, deterministisch aus dem Datum gewürfelt (Hash von
  `YYYY-MM-DD`), aus diesem Pool:

| id | Text | Ziel | Sats | XP |
|---|---|---|---|---|
| catch3 | Fange 3 Rüthers | 3 | 150 | 60 |
| catchRare | Fange einen Seltenen oder besser | 1 | 200 | 80 |
| arenaWin | Gewinne einen Arenakampf | 1 | 250 | 100 |
| stops3 | Drehe 3 Dosenbier-Stops | 3 | 150 | 60 |
| combo8 | Erreiche Combo ×8 | 1 | 200 | 80 |
| specials3 | Setze 3 Spezial-Attacken ein | 3 | 150 | 60 |
| dodge3 | Weiche 3 Boss-Angriffen aus | 3 | 150 | 60 |
| powerup1 | Mache ein Power-Up | 1 | 100 | 50 |
| superHit | Triff mit „Super!"-Ring | 1 | 150 | 60 |
| fusion1 | Mache eine Fusion | 1 | 300 | 150 |

- Fortschritt über `trackQuest(save, kind, n = 1)` aus den Spielereignissen.
  Erfüllt → im Quest-Tab Button „Einlösen" (Sats + XP, Toast), Tab-Badge zeigt
  die Zahl einlösbarer Quests. Nächster Tag → neue Quests, nicht eingelöste
  verfallen.
- **Tagesbonus** beim ersten Öffnen am Tag: Popup „Tag n in Folge" mit
  `50 + 25 × (streak − 1)` Sats (max 200). Streak bricht bei einem Tag Pause.

## 5. Erfolge (Badges)

| id | Name | Bedingung |
|---|---|---|
| first_catch | Erster Fang | 1 Fang |
| all_five | Familienalbum | alle 5 Rüthers gefangen |
| rare1 | Glücksgriff | erster Seltener |
| epic1 | Episch! | erster Epischer |
| legend1 | Legende | erster Legendärer |
| catch10 | Sammler | 10 Fänge |
| catch50 | Großwildjäger | 50 Fänge |
| dex10 | Halber Dex | Dex 10 |
| dex20 | Kompletter Dex | Dex 20 |
| arena1 | Eroberer | erster Arenasieg |
| master1 | Arenameister | eine Arena gemeistert |
| master3 | Herrscher | alle Arenen gemeistert |
| combo10 | Combo-König | Combo ×10 |
| level10 | Aufgeleveled | ein Rüther auf Level 10 |
| stops10 | Stammgast | 10 Stops gedreht |
| trainer5 | Trainer Lv. 5 | Trainer-Level 5 |
| trainer10 | Trainer Lv. 10 | Trainer-Level 10 |
| fusion1 | Alchemist | erste Fusion |

- Prüfung nach jedem relevanten Ereignis (`checkAchievements(save) -> neu[]`),
  Toast „🏅 Erfolg: Name" + 50 Sats je Erfolg. Profil zeigt das Raster
  (freigeschaltet farbig, sonst grau mit Bedingung).

## 6. Fusion

- Sammlung: hat ein Rüther ≥ 3 Exemplare derselben Seltenheit (unter
  Legendär), erscheint bei der Gruppe „Fusion (3× Selten → Episch)".
- Fusion verbraucht die drei niedrigsten Level dieser Seltenheit (aus dem
  Team entfernt, falls drin) und erzeugt ein Exemplar der nächsten Seltenheit
  mit `level = max(level der drei)`. +60 XP, Dex-Eintrag und Dex-Bonus wie beim
  Fang (ohne Seltenheits-Sats). Episch/Legendär als Ergebnis → Feed-Eintrag.
- Animation: Popup, drei Sprites fliegen zur Mitte, weißer Blitz, neues Exemplar
  mit Seltenheitsrahmen und Konfetti. Logik: `canFuse(save, id, rarity)`,
  `fuse(save, id, rarity) -> { inst, newDex }`.

## 7. Dosenbier-Stops

- Quelle: Overpass-API (`https://overpass-api.de/api/interpreter`), Umkreis
  600 m um den Spieler: `amenity` ∈ pub, bar, biergarten, cafe, fast_food;
  `shop` ∈ convenience, kiosk, supermarket, alcohol, beverages. Max. 25
  Stops, sortiert nach Entfernung. Cache nach 300-m-Raster, 10 Minuten; Fehler
  → keine Stops, keine Fehlermeldung.
- Karte: Marker 🍺 (gelb aktiv, grau in Abkühlung). Antippen < 40 m → Stop-Screen:
  Name, Glücksrad mit 6 Feldern dreht 2 s, Ergebnis: 20/30/40/60 Sats
  (Gewichte 40/30/20/10), bei 25 % zusätzlich 1 Super-Münze, +10 XP. Weiter weg →
  Toast mit Entfernung.
- Abkühlung 5 Minuten pro Stop (`stopCooldowns[osmId] = bis`), Zähler
  `stats.stops`. Logik: `parseOverpass(json, player) -> Stop[]`,
  `spinReward(rng) -> { sats, superCoin }`, `stopReady(save, id, now)`.
- Debug: „Fake-Stops" erzeugt 3 Stops im Umkreis von 30–120 m.

## 8. Sounds und Haptik

- `js/audio.js`: synthetische Effekte per Web Audio (keine Dateien): `tap`,
  `hit`, `special`, `dodge`, `warn`, `win`, `lose`, `throw`, `catch`,
  `breakout`, `levelup`, `quest`, `spin`, `click`, `rage`. Freischaltung beim
  ersten Tipp, Lautstärke 0,25. Schalter in den Einstellungen (Standard an).
- Haptik (`navigator.vibrate`) bei Treffer, Fang, Sieg, Level-Up; Schalter
  (Standard an).

## 9. Events

- **Rüther-Stunde** täglich 18:00–19:00 Ortszeit: Spawn-Zielzahl wie Lockmodul,
  Fang-Sats × 1,5; Banner „⏰ Rüther-Stunde bis 19:00".
- **Rüther des Tages:** aus dem Datum gewürfelt, Gewicht × 3 im Spawn-Pool
  (`featured`-Parameter in `updateSpawns`), Banner mit Sprite „Heute: Viktor
  doppelt so oft". Karte zeigt beide Banner unter dem Lockmodul-Banner.

## 10. Online-Welt

- `js/online.js`: `sync(save)` (debounced 3 s nach jeder Änderung, sendet
  Profil, Sats, Dex, Trophäen, gemeistert, Level, XP, Team-Anführer),
  `fetchState()` (beim Öffnen von Karte und Rangliste, dann alle 60 s),
  `claimArena(arenaId, level, leader)` nach einem Sieg, `postEvent(kind, text)`
  für legendäre Fänge, gemeisterte Arenen, Fusionen zu Legendär, Level 5/10/15/20.
  Timeout 6 s, Fehler schlucken, `online.available` als Zustand.
- **Rangliste-Tab:** „n online", Liste Top 20 (Platz, Avatar, Name, 🏆, Dex,
  💰, grüner Punkt wenn online), eigener Platz hervorgehoben; darunter
  Aktivitäts-Feed (30 Einträge, „vor 5 Min."). Offline: Hinweis „Offline, zeigt
  letzten Stand".
- **Globale Arenen:** Marker zeigt unter dem Icon ein Namensschild des globalen
  Besitzers („Sebi"), eigener Besitz orange, fremder weiß. Arena-Info:
  „Gehalten von Sebi (Christian Legendär Lv. 5) seit 3 Std." und darunter die
  eigene Bilanz (Level, Belohnung). Ein Sieg übernimmt die Arena global.
- Profil zeigt „Online-ID" (die ersten 8 Zeichen des Tokens) für Support.

## 11. Profil, Einstellungen, Teilen

- Profil: Avatar, Name (editierbar), Trainer-Level mit XP-Balken, Statistik
  (Fänge, Arenasiege, Stops, Dex, Trophäen, Fusionen), Erfolge-Raster,
  Buttons „Shop", „Teilen" (Web Share API, Fallback Zwischenablage:
  „Ich bin Trainer Lv. 7 bei Rüther GO: 12/20 im Dex, 3 Arenen. <URL>"),
  Einstellungen: Sound, Haptik, Spielstand exportieren (JSON in die
  Zwischenablage), importieren (Einfügen), löschen (mit Bestätigung).

## 12. PWA

- Icons 192/512 (aus der Münze, `tools/pixelate.py` erzeugt `sprites/icon-192.png`,
  `sprites/icon-512.png`), Manifest mit beiden, `start_url: "./"`,
  `display: standalone`. iOS-Hinweis „Zum Startbildschirm hinzufügen" einmalig
  als Popup (nur Safari iOS, nicht im Standalone-Modus).

## 13. Spielstand v3

Neu gegenüber v2: `profile`, `xp`, `trainerLevel`, `quests { date, list: [{id, progress, done, claimed}] }`,
`streak { count, lastDay }`, `achievements { id: at }`, `stopCooldowns {}`,
`settings { sound, haptics }`, `seen { onboarding, iosHint }`, `stats` erweitert
um `stops, fusions, specials, dodges, maxCombo`. Migration v2 → v3 setzt
Defaults; fehlt `profile`, startet das Onboarding (Schritt 2).

## 14. Tests

`test/quests.test.mjs`: Quests deterministisch pro Datum (gleiches Datum →
gleiche drei, verschiedene Tage → verschieden), Fortschritt und Einlösen, Streak
(Folgetag +1, Lücke → 1, gleicher Tag unverändert), Erfolge (Bedingungen,
nur einmal). `test/progress.test.mjs` ergänzt: xpForLevel, addXp mit
Mehrfach-Level-Up, canFuse/fuse (verbraucht die drei niedrigsten, Level =
max, Team bereinigt, Legendär nicht fusionierbar). `test/stops.test.mjs`:
parseOverpass (Filter, Distanz, Limit 25, Name-Fallback „Dosenbier-Stop"),
spinReward-Gewichte über rng, stopReady/Cooldown. `test/spawn.test.mjs`:
featured-Gewicht. Migration v2 → v3.
