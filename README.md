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
(GitHub Pages). Leaflet 1.9.4 liegt unter `vendor/leaflet/`, die Karte braucht
beim Start keinen fremden Server außer den OpenStreetMap-Kacheln.

## Steuerung

- Beim ersten Start: kurze Einführung, dann Spielername (2 bis 16 Zeichen) und Avatar wählen. Dafür gibt es 100 Sats und eine Super-Münze.
- Tab-Leiste unten: Karte, Sammlung, Quests, Rangliste, Profil. Die Sats-Pille oben rechts öffnet den Shop.
- Karte folgt dir. Karte verschoben? Den Karten-Knopf unten rechts tippen.
- Rüthers gibt es in vier Seltenheiten (Normal, Selten, Episch, Legendär), erkennbar an Rand und Aura auf der Karte. Seltenere sind stärker und schwerer zu fangen.
- Fangen: Münze nach oben schnippen, kleiner Ring = bessere Chance. Super-Münze (Shop) gibt +50 %. Drei Ausbrüche, dann ist der Rüther weg. Oder im Wildkampf weichhauen.
- Sammlung: bis zu drei ins Team, Power-Up hebt das Level (kostet Sats), Füttern mit Duplikaten gibt +2 Level. Fusion: drei gleiche Rüthers derselben Seltenheit werden zu einem der nächsten Seltenheit. Rütherdex zeigt alle 20 Kombinationen.
- Shop:
  - **Lockmodul** (1.000 Sats, 5 Minuten): sofort beim Kauf und dann jede Minute eine Welle mit 3 neuen Rüthers direkt bei dir (12 bis 90 m, also in Fangreichweite), mit normalen Seltenheiten. Die alten bleiben liegen, höchstens 15 gleichzeitig; ist es voll, fallen die ältesten raus, nie der gerade offene. Ein Ring-Puls auf der Karte zeigt jede Welle, das Banner zeigt „Lockmodul 4:12 · nächste Welle 0:42".
  - **Super-Münzen** (500 Sats): ein Wurf mit +50 % Fangchance.
  - **Haunebu-Reichsflugscheibe:** Die Beschwörung kostet 5.000 Sats, jede weitere 1.000 mehr, höchstens 8.000. Adolf Hitler steigt aus und will sie behalten. Wer ihn besiegt, hat die Haunebu **10 Minuten**: freie Flüge zu jeder Arena, so oft man will, auch nach Neuschwabenland. Gehört sie dir schon, verlängert „+10 Min · 5.000" im Shop oder am Countdown-Chip oben um 10 Minuten, ohne Hitler-Kampf und ohne dass die Beschwörung teurer wird. Bei 1:00 und am Ende kommt ein Hinweis, dann fliegt sie zurück zu Hitler. Wer gerade gebeamt ist, wird vorher nach Hause gebracht.
- Trainer-Level: Fänge, Stops, Fusionen, Arenasiege und Quests geben XP. Jeder Aufstieg bringt Sats.
- Quests: jeden Tag drei neue, Fortschritt zählt automatisch, „Einlösen" gibt Sats und XP. Wer täglich wiederkommt, bekommt einen wachsenden Tagesbonus.
- Dosenbier-Stops: echte Kioske, Kneipen und Supermärkte aus OpenStreetMap im Umkreis von 600 m. Näher als 80 m rangehen, Glücksrad drehen: 20 bis 60 Sats, manchmal eine Super-Münze. Danach 5 Minuten Abkühlung (grauer Marker).
- Kampf: VS-Intro, dann auf den Boss tippen. Spezial-Buttons unten, wenn die Energie reicht. Blinkt es, wischen = ausweichen. Unter 50 % wird der Boss wütend und schneller. ✕ oben links = aufgeben.
- Arenen haben fünf Level, der Boss wird pro Level stärker und die Belohnung größer. Level 5 besiegt = gemeistert. Fünf Arenen: Rütherschanze Worringen, Hüttenbergstraße, PC Sale, Keller der Rütherschanze und die **Geheime Festung Neuschwabenland** in der Antarktis. Die erreicht man nur mit der Haunebu, dort wartet der Tachionenbitcoin, mit Abstand der stärkste Boss (120 Sekunden Kampf).
- **Haunebu-Quests** (oben im Quests-Tab, frei, wenn alle fünf Arenen gemeistert sind): Haunebu kapern, Mission wählen, bis zu drei Rüther ins Team, „Abflug". Die Quest verbraucht die Haunebu nicht: Ist das Fenster danach noch offen, fliegt sie euch zurück an den Ort vor der Quest (Arena oder zu Hause) und die Zeit läuft weiter; läuft es während der Quest ab, geht es danach nach Hause. Gespielt wird in der Draufsicht wie Commandos 2: Rüther antippen, Wegpunkt antippen, Doppeltipp auf einen Rüther öffnet seine drei Quest-Fähigkeiten (siehe unten). Sechs Missionen, jede mit mindestens zwei Karten und je zwei oder drei Varianten, dazu bei jedem Start zufällig gespiegelt, Wachen an anderen Punkten ihrer Runde und anders gefüllte Tresore (die Liste zeigt „Karten: n · Varianten: m"): Tachionenraub und Hangar-Sabotage in Neuschwabenland, Michas PS3 aus dem PC-Sale-Lager, die Bitcoin-Heizung im Keller abschalten, **Nie wieder duschen** (Viktor solo am Campingplatz an der Mosel: 3 Wasseranschlüsse abdrehen, keine Zeitgrenze; erwischt ihn Stefan (mit seinem Bulletproof Coffee), muss er zum Kieser-Training, 12.000 Sats, jedes Training −1.000, nie unter 10.000; ohne Viktor in der Box gesperrt) und **Feuer im Bruch** (3 Bäume im Worringer Bruch anzünden, jedes Mal 6.500 Sats; erwischt euch ein Ranger, kostet das 10.000 Sats Strafe). Scheitern oder Aufgeben bringt 10 % der Belohnung, aber nur, wenn schon etwas geschafft ist. Danach Ergebnis mit Sats, XP, Bestwert, Kieser-Trainings und Strafe, dann der Rückflug.
- **Quest-Fähigkeiten** (Sammlung, auf jeder Rüther-Karte unter „Quest-Fähigkeiten"): Jeder Rüther hat 2 feste Fähigkeiten und einen dritten Slot aus seinem eigenen Pool von 3. Sie gehören dem Rüther an sich, nicht dem Exemplar: Jeder gefangene Christian kann dasselbe, Fusion und Verkauf ändern nichts.
  - Pool-Fähigkeit kaufen: 1.000 Sats (Stufe 1). Upgrade auf Stufe 2: 2.000, auf Stufe 3: 3.000, bei den festen genauso (deren Stufe 1 ist gratis). Alles für einen Rüther kostet 28.000, für alle fünf 140.000.
  - Stufe 2 verstärkt (Dauer, Reichweite, Abklingzeit), Stufe 3 bringt einen neuen Zusatzeffekt. Die Karte zeigt Stufen-Punkte, die Texte der erreichten Stufen und die nächste Stufe; bei zu wenig Sats ist der Knopf gesperrt.
  - Ausrüsten ist gratis. Die erste gekaufte Pool-Fähigkeit kommt automatisch in den dritten Slot. In der Team-Wahl vor der Quest wechselt ein Tipp auf den dritten Slot durch die gekauften.
  - Christian: Plus 70 Prozent, Werfen mit Dosenbier; Pool Vice-President-Auftritt, Kurs-Alarm, WLAN-Störung. Hildegard: Familientreffen, „Junge, komm mal her!"; Pool Mittagsruhe, Tratsch, „Ich ruf deine Mutter an!". Viktor: Giftgas-Wand, Ungeschlagene Argumentationslogik; Pool Crash-Gerücht, Insider-Tipp, Deobombe. Micha: Hardware-Wallet-Umbau, Controllerwurf; Pool Firewall, Raubkopie, Vibrationsalarm. Ramona: Abgelaufene M&Ms, Unlimited Credits; Pool Trollkids-Horde, Sale-Schild, „Feierabend!".
  - **Schleichen lohnt sich:** Alarmierte Wachen schlagen im Nahkampf deutlich härter zu und halten mehr aus, mit jeder Fähigkeits-Stufe im Team noch etwas mehr. Ablenken, Umgehen und leise Fähigkeiten sind der bessere Weg, jede Mission geht ohne Kampf.
- Rangliste: Top 20 nach Trophäen, wer gerade online ist, und ein Feed mit legendären Fängen, Fusionen, gemeisterten Arenen und geschafften Quests.
- Zurück-Taste (Android) bzw. Browser-Zurück: führt zum Zurück-Knopf des offenen Screens, nicht aus dem Spiel. Im Kampf kommt nur ein Hinweis (Aufgeben über ✕), in der Quest die Aufgeben-Rückfrage.
- Profil: Trainer-Level und XP, Statistik, Erfolge, Sound/Haptik, Avatar, Spielstand kopieren/einfügen/löschen, Teilen, **Zusammen spielen** (siehe unten).
- Events: 18 bis 19 Uhr ist Rüther-Stunde (doppelte Spawns, 50 % mehr Sats). Jeden Tag ist ein anderer Rüther dreimal so häufig.

## Zusammen spielen ohne Netz

Zwei Handys, kein WLAN, keine mobilen Daten (z. B. im Flugzeug): Die Android-App verbindet sich direkt über Google Nearby
Connections (Bluetooth, BLE, WLAN-Direct). Ablauf:

1. Beide: Bluetooth einschalten. Das geht auch im Flugmodus (Flugmodus an, dann Bluetooth wieder an). Ältere Handys (Android 8 bis 11) brauchen zusätzlich Standort an.
2. Beide: Profil → „Zusammen spielen“. Einer tippt „Spiel eröffnen“, der andere „Beitreten“. Beim ersten Mal fragt Android nach „Geräte in der Nähe“: erlauben.
3. Verbunden: Beide sehen sich mit Gesicht und Trainer-Level und einen 4-stelligen Code, der bei beiden gleich sein muss.
4. Wer eröffnet hat, wählt den Modus (und bei Quests die Mission). Jeder wählt sein Team aus der eigenen Sammlung, beide tippen „Bereit“, dann „Start“. Danach geht es zurück in die Lobby, „Nochmal“ heißt einfach wieder Bereit und Start.

Modi:

- **Arena-Duell 3 gegen 3:** je 1 bis 3 eigene Rüther, 90 Sekunden, doppelte BTC. Tippen = Angriff, Spezial-Knöpfe, Wischen = Ausweichen, wenn der Gegner eine Attacke ankündigt (seine Mining-Leiste steht oben). Wechseln ist frei. Sieg 300 Sats und 150 XP, Niederlage 100 und 50, Unentschieden 150 und 75. Wer aufgibt, kriegt nichts; ein Sieg durch Aufgeben zählt erst ab 30 Sekunden.
- **Koop-Quest:** dieselbe Quest gemeinsam, jeder steuert bis zu 2 eigene Rüther (unter fremden steht der Name des Partners). Alle Missionen ohne Solo. Jeder bekommt die normale Quest-Belohnung, Score und Strafe gelten gemeinsam.
- **Quest-Rennen:** dieselbe Mission auf derselben Karte, jeder spielt für sich mit dem eigenen Team (Solo-Missionen: das stärkste eigene Exemplar). Oben steht live der Stand des Partners. Jeder bekommt seine Quest-Belohnung, wer mehr schafft (bei Gleichstand: geschafft vor gescheitert, dann schneller), zusätzlich 1.000 Sats und 100 XP.

Die Quest-Modi brauchen weder die Haunebu noch freigeschaltete Quests. Bricht die Verbindung ab, pausieren Duell und Koop und die
Apps verbinden sich 60 Sekunden lang neu. Danach gilt: Duell ohne Wertung, Koop beim Gast abgebrochen (der Gastgeber kann allein
weiterspielen), Rennen ohne Bonus. Belohnungen werden sofort beim Ende gespeichert. Die Bildschirmsperre bleibt in der Lobby aus.

**Im Browser testen** (ohne Handys): Lokalen Server starten und das Spiel in **zwei Fenstern** (nicht Tabs, ein Hintergrund-Tab
bremst) desselben Browsers öffnen, `http://localhost:8000/?slot=1` und `http://localhost:8000/?slot=2`. Dann verbinden sie sich über
BroadcastChannel, jeder Slot hat einen eigenen Spielstand (`ruether-go-1`, `ruether-go-2`). `&lag=150` verzögert jede Nachricht
um 150 ms wie eine echte Funkverbindung.

**Android-App bauen:**

    cd native && node build-www.mjs && npx cap sync android
    cd android && JAVA_HOME="C:/Program Files/Android/Android Studio/jbr" ./gradlew assembleDebug

Die APK liegt dann unter `native/android/app/build/outputs/apk/debug/app-debug.apk`. Technik: `js/net/link.js` (Verbindung, Herzschlag,
Wiederverbinden), `native/android/.../NearbyLinkPlugin.java` (Nearby), `js/lobby.js`, `js/duel.js` und `js/duel-ui.js`,
`js/quest/coop.js` und `js/quest/race.js`; Spezifikation in `docs/superpowers/specs/2026-10-17-ruether-go-multiplayer-design.md`.

## Online

Jedes Gerät schickt signierte Nachrichten (ECDSA P-256, eigener Schlüssel pro
Gerät) an ein ntfy.sh-Topic. Eine GitHub Action
(`.github/workflows/online-sync.yml`) führt sie etwa alle 5 Minuten zum
dauerhaften Stand `state.json` im Branch `online-data` zusammen: Ein Lauf
merged knapp 6 Stunden lang und startet sich dann selbst neu. Ein stündlicher
Cron startet die Kette wieder, falls sie reißt, und schlägt fehl (Mail), wenn
Nachrichten über 10 Stunden ungemergt liegen. Spiel und Action benutzen dasselbe
Modul `js/online-merge.js`. Konfiguration in `ONLINE` (`js/data.js`); Ablauf,
Nachrichtenformat, Überwachung, Zurücksetzen und Einrichtung stehen in
[online/README.md](online/README.md). Rangliste, Feed und Arena-Besitzer gelten
für alle Spieler, es gibt kein Konto und kein Passwort.

Die Online-Kennung ist der Geräteschlüssel, nicht der Name. „Spielstand
kopieren“ nimmt ihn mit, damit man nach einem Gerätewechsel (oder auf dem
iPhone von Safari zur Home-Bildschirm-App) derselbe Spieler bleibt. Gehört der
Name online schon jemand anderem, zeigt das Spiel einen Hinweis zum Umbenennen.

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
einschalten, mit „Alle Fähigkeiten Stufe 3" alle Quest-Fähigkeiten gratis kaufen
und ausbauen (die erste Pool-Fähigkeit wird ausgerüstet) und mit „Quest starten" eine Mission direkt mit dem aktuellen Team
starten (Auswahl: Mission, Karte, Spiegelung; leer = Zufall). „Stefan ruft"
startet „Nie wieder duschen" und löst sofort die Kieser-Cutscene aus.

## Tests

    node --test test/*.test.mjs

## Sprites und Icons neu erzeugen

    python tools/pixelate.py

Erzeugt alle Sprites und die PWA-Icons `sprites/icon-192.png` und
`sprites/icon-512.png`. Fotos liegen im Projektordner (nicht im Git). Ramona hat
noch kein Foto und einen Platzhalter. Generierte Grafiken (Bosse, Kulissen,
Quest-Gegner) und ihre Regeln: `art/README.md`.
