# Rüther GO

Pokémon GO, aber man fängt Rüthers. Handy-Web-App (PWA). Spielstand liegt im
Browser, Rangliste und Arena-Besitzer kommen von einem kleinen Backend.

## Starten

    python -m http.server 8000

Dann `http://localhost:8000` öffnen. Auf dem Handy braucht die Ortung HTTPS,
also auf einen statischen Host (z.B. GitHub Pages) legen. Live unter
`https://ruether-go.higgsfield.app/play/` und
`https://justabusinesskid.github.io/ruetherpokemon/`.

## Steuerung

- Beim ersten Start: kurze Einführung, dann Spielername (2 bis 16 Zeichen) und Avatar wählen. Dafür gibt es 100 Sats und eine Super-Münze.
- Tab-Leiste unten: Karte, Sammlung, Quests, Rangliste, Profil. Die 💰-Pille oben rechts öffnet den Shop.
- Karte folgt dir. Karte verschoben? 📍 unten rechts tippen.
- Rüthers gibt es in vier Seltenheiten (Normal, Selten, Episch, Legendär), erkennbar an Rand und Aura auf der Karte. Seltenere sind stärker und schwerer zu fangen.
- Fangen: Münze nach oben schnippen, kleiner Ring = bessere Chance. Super-Münze (Shop) gibt +20 %. Drei Ausbrüche, dann ist der Rüther weg.
- Sammlung: bis zu drei ins Team, Power-Up hebt das Level (kostet Sats). Fusion: drei gleiche Rüthers derselben Seltenheit werden zu einem der nächsten Seltenheit. Rütherdex zeigt alle 20 Kombinationen.
- Shop: Lockmodul (5 Minuten doppelte Spawns), Super-Münzen. Sats gibt es für Fänge, neue Dex-Einträge, Quests, Stops und Arenasiege.
- Trainer-Level: Fänge, Stops, Fusionen und Arenasiege geben XP. Jeder Aufstieg bringt Sats.
- Quests: jeden Tag drei neue, Fortschritt zählt automatisch, „Einlösen" gibt Sats und XP. Wer täglich wiederkommt, bekommt einen wachsenden Tagesbonus (🔥 Serie).
- Dosenbier-Stops 🍺: echte Kioske, Kneipen und Supermärkte aus OpenStreetMap im Umkreis von 600 m. Näher als 80 m rangehen, Glücksrad drehen: 20 bis 60 Sats, manchmal eine Super-Münze. Danach 5 Minuten Abkühlung (grauer Marker).
- Kampf: VS-Intro, dann auf den Boss tippen. Spezial-Buttons unten, wenn die Energie reicht. Blinkt es, wischen = ausweichen. Unter 50 % wird der Boss wütend und schneller. 90 Sekunden Zeit, ✕ oben links = aufgeben.
- Arenen haben fünf Level, der Boss wird pro Level stärker und die Belohnung größer. Level 5 besiegt = gemeistert (👑). Alle drei gemeistert = Krone.
- Rangliste: Top 20 nach Trophäen, wer gerade online ist, und ein Feed mit legendären Fängen, Fusionen und gemeisterten Arenen.
- Profil: Trainer-Level und XP, Statistik, Erfolge, Sound/Haptik, Avatar, Spielstand kopieren/einfügen/löschen, Teilen.
- Events: 18 bis 19 Uhr ist Rüther-Stunde (doppelte Spawns, 50 % mehr Sats). Jeden Tag ist ein anderer Rüther dreimal so häufig.

## Online

Backend: `https://ruether-go.higgsfield.app` (`API_BASE` in `js/data.js`).
Rangliste, Aktivitäts-Feed und Arena-Besitzer gelten für alle Spieler: wer eine
Arena gewinnt, steht als Besitzer auf jeder Karte. Spieler werden über ein
zufälliges Geräte-Token erkannt, es gibt kein Konto und kein Passwort.

Ist das Backend nicht erreichbar, läuft alles lokal weiter: Fangen, Kämpfen,
Quests und Stops funktionieren ohne Netz, der Punkt unten links wird grau und
die Rangliste zeigt den letzten bekannten Stand mit Offline-Hinweis.

## Test-Modus

`?debug=1` an die URL hängen oder siebenmal auf den Titel tippen. Dann kann
man sich an die drei Arenen beamen, Fake-Stops erzeugen, Sats und XP geben.

## Tests

    node --test test/*.test.mjs

## Sprites und Icons neu erzeugen

    python tools/pixelate.py

Erzeugt alle Sprites und die PWA-Icons `sprites/icon-192.png` und
`sprites/icon-512.png`. Fotos liegen im Projektordner (nicht im Git). Ramona hat
noch kein Foto und einen Platzhalter.
