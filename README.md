# Rüther GO

Pokémon GO, aber man fängt Rüthers. Handy-Web-App (PWA) ohne Build. Der
Spielstand liegt im Browser, Rangliste, Arena-Besitzer und Feed laufen über
GitHub (signierte ntfy-Nachrichten plus GitHub Action). Ein eigenes Backend
gibt es nicht mehr, Higgsfield ist abgeschaltet.

## Starten

    python tools/serve.py 8000

Dann `http://localhost:8000` öffnen (`tools/serve.py` schickt `no-store`,
damit der Browser geänderte Module neu lädt). Auf dem Handy braucht die
Ortung HTTPS. Live unter `https://justabusinesskid.github.io/ruetherpokemon/`
(GitHub Pages).

## Steuerung

- Beim ersten Start: kurze Einführung, dann Spielername (2 bis 16 Zeichen) und Avatar wählen. Dafür gibt es 100 Sats und eine Super-Münze.
- Tab-Leiste unten: Karte, Sammlung, Quests, Rangliste, Profil. Die Sats-Pille oben rechts öffnet den Shop.
- Karte folgt dir. Karte verschoben? Den Karten-Knopf unten rechts tippen.
- Rüthers gibt es in vier Seltenheiten (Normal, Selten, Episch, Legendär), erkennbar an Rand und Aura auf der Karte. Seltenere sind stärker und schwerer zu fangen.
- Fangen: Münze nach oben schnippen, kleiner Ring = bessere Chance. Super-Münze (Shop) gibt +20 %. Drei Ausbrüche, dann ist der Rüther weg. Oder im Wildkampf weichhauen.
- Sammlung: bis zu drei ins Team, Power-Up hebt das Level (kostet Sats), Füttern mit Duplikaten gibt +2 Level. Fusion: drei gleiche Rüthers derselben Seltenheit werden zu einem der nächsten Seltenheit. Rütherdex zeigt alle 20 Kombinationen.
- Shop:
  - **Lockmodul** (5 Minuten): alle 20 Sekunden eine Welle mit 4 bis 8 komplett neuen Rüthers direkt bei dir (12 bis 90 m, also in Fangreichweite). Die erste Welle kommt sofort beim Kauf, ein Ring-Puls auf der Karte zeigt jede Welle, das Banner zählt bis zur nächsten.
  - **Super-Münzen.**
  - **Haunebu-Reichsflugscheibe:** Die Beschwörung kostet 5.000 Sats, jede weitere 1.000 mehr, höchstens 8.000. Adolf Hitler steigt aus und will sie behalten. Wer ihn besiegt, hat die Haunebu **10 Minuten**: freie Flüge zu jeder Arena, so oft man will, auch nach Neuschwabenland. Bei 1:00 und am Ende kommt ein Hinweis, dann fliegt sie zurück zu Hitler. Wer gerade gebeamt ist, wird vorher nach Hause gebracht.
- Trainer-Level: Fänge, Stops, Fusionen, Arenasiege und Quests geben XP. Jeder Aufstieg bringt Sats.
- Quests: jeden Tag drei neue, Fortschritt zählt automatisch, „Einlösen" gibt Sats und XP. Wer täglich wiederkommt, bekommt einen wachsenden Tagesbonus.
- Dosenbier-Stops: echte Kioske, Kneipen und Supermärkte aus OpenStreetMap im Umkreis von 600 m. Näher als 80 m rangehen, Glücksrad drehen: 20 bis 60 Sats, manchmal eine Super-Münze. Danach 5 Minuten Abkühlung (grauer Marker).
- Kampf: VS-Intro, dann auf den Boss tippen. Spezial-Buttons unten, wenn die Energie reicht. Blinkt es, wischen = ausweichen. Unter 50 % wird der Boss wütend und schneller. ✕ oben links = aufgeben.
- Arenen haben fünf Level, der Boss wird pro Level stärker und die Belohnung größer. Level 5 besiegt = gemeistert. Fünf Arenen: Rütherschanze Worringen, Hüttenbergstraße, PC Sale, Keller der Rütherschanze und die **Geheime Festung Neuschwabenland** in der Antarktis. Die erreicht man nur mit der Haunebu, dort wartet der Tachionenbitcoin, mit Abstand der stärkste Boss (120 Sekunden Kampf).
- **Haunebu-Quests** (oben im Quests-Tab, frei, wenn alle fünf Arenen gemeistert sind): Haunebu kapern, Mission wählen, bis zu drei Rüther ins Team, „Abflug". Die Quest verbraucht die Haunebu. Gespielt wird in der Draufsicht wie Commandos 2: Rüther antippen, Wegpunkt antippen, Doppeltipp auf einen Rüther öffnet seine Superkräfte (Plus 70 Prozent öffnet Türen, Giftgas-Wand, Familientreffen, Controllerwurf, M&M-Köder und mehr). Vier Missionen mit wechselnden Varianten: Tachionenraub und Hangar-Sabotage in Neuschwabenland, Michas PS3 aus dem PC-Sale-Lager, die Bitcoin-Heizung im Keller abschalten. Danach Ergebnis mit Sats, XP und Bestwert, dann fliegt die Haunebu euch nach Hause.
- Rangliste: Top 20 nach Trophäen, wer gerade online ist, und ein Feed mit legendären Fängen, Fusionen, gemeisterten Arenen und geschafften Quests.
- Profil: Trainer-Level und XP, Statistik, Erfolge, Sound/Haptik, Avatar, Spielstand kopieren/einfügen/löschen, Teilen.
- Events: 18 bis 19 Uhr ist Rüther-Stunde (doppelte Spawns, 50 % mehr Sats). Jeden Tag ist ein anderer Rüther dreimal so häufig.

## Online

Jedes Gerät schickt signierte Nachrichten (ECDSA P-256, eigener Schlüssel pro
Gerät) an ein ntfy.sh-Topic. Eine GitHub Action
(`.github/workflows/online-sync.yml`, alle 15 Minuten) führt sie zum
dauerhaften Stand `state.json` im Branch `online-data` zusammen. Spiel und
Action benutzen dasselbe Modul `js/online-merge.js`. Konfiguration in `ONLINE`
(`js/data.js`); Ablauf, Nachrichtenformat, Zurücksetzen und Einrichtung stehen
in [online/README.md](online/README.md). Rangliste, Feed und Arena-Besitzer
gelten für alle Spieler, es gibt kein Konto und kein Passwort.

Ist ntfy oder GitHub nicht erreichbar, läuft alles lokal weiter: Fangen,
Kämpfen, Quests und Stops funktionieren ohne Netz, der Punkt unten links wird
grau und die Rangliste zeigt den letzten bekannten Stand mit Offline-Hinweis.

Lokal (localhost, 127.0.0.1) bleibt das Spiel offline, damit Testläufe nicht in
der echten Rangliste landen. Zum Testen `?online=ruether-go-test-<zufall>`
anhängen: Dann läuft es über dieses eigene Topic, ohne Snapshot. Zwei Tabs mit
verschiedenen Ports (eigener Spielstand und Schlüssel je Port) sehen sich
gegenseitig in der Rangliste.

## Test-Modus

`?debug=1` an die URL hängen oder siebenmal auf den Titel tippen. Dann kann
man sich an alle fünf Arenen beamen, Fake-Stops erzeugen, Sats und XP geben,
die Haunebu für 10 Minuten bekommen, alle Arenen meistern, das Lockmodul
einschalten und mit „Quest starten" der Reihe nach jede Mission direkt mit dem
aktuellen Team starten.

## Tests

    node --test test/*.test.mjs

## Sprites und Icons neu erzeugen

    python tools/pixelate.py

Erzeugt alle Sprites und die PWA-Icons `sprites/icon-192.png` und
`sprites/icon-512.png`. Fotos liegen im Projektordner (nicht im Git). Ramona hat
noch kein Foto und einen Platzhalter. Generierte Grafiken (Bosse, Kulissen,
Quest-Gegner) und ihre Regeln: `art/README.md`.
