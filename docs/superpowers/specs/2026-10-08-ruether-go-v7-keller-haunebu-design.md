# Rüther GO v7: Keller-Arena und Haunebu-Reichsflugscheibe

Stand 2026-10-08. Sebis Wunsch:

1. Unter der Rütherschanze in Worringen gibt es einen Keller. Das ist eine zweite Arena mit der Bitcoin-Heizung als Boss.
2. Die Haunebu-Reichsflugscheibe lässt sich über den Shop beschwören. Dann kämpft man gegen Adolf Hitler. Wer ihn besiegt, besitzt die Flugscheibe. Mit ihr beamt man sich für Sats 10 Minuten zu einer Arena, mit cooler Animation, und kämpft dort, obwohl man real nicht vor Ort ist.

Die Daten sind schon in `js/data.js` eingetragen und dürfen nicht verändert werden: `ARENAS.keller`, `BOSSES.heizung`, `BOSSES.hitler`, `SHOP.haunebu`, `CONST.HAUNEBU_*`, `CONST.XP_HAUNEBU`, `LINES.heizung`, `LINES.hitler` mit `defeat` und `ACHIEVEMENTS` keller/haunebu. Agenten ändern data.js nicht. Fehlt etwas, melden sie es als Abweichung.

## §0 Oberste Regeln

1. **Echte Gesichter und Humor bleiben Kern.** Der Spieler kämpft immer mit seinen echten Rüther-Gesichtern (`sprites/<id>.png`). Generiert werden dürfen nur Bosse, Kulissen, Requisiten und Icons. Siehe die Memory-Regel „echte Gesichter + Humor“.
2. **Hitler nur als lächerlicher Verlierer**, im Stil des „Der Untergang“-Memes, von Iron Sky und Wolfenstein:
   - Er tobt, wirft den Bleistift auf den Tisch, flüchtet in den Bunker und verliert.
   - **Keine NS-Symbole**, nirgends: kein Hakenkreuz, keine SS-Runen, kein Reichsadler, kein Balkenkreuz, keine Armbinde, keine Abzeichen. Das gilt für Grafiken, CSS-Pixelkunst und Texte.
   - Keine Parolen, kein Gruß, keine Anspielungen auf NS-Verbrechen oder Opfer.
   - Die Seite ist öffentlich (GitHub Pages, Higgsfield-Feed), §86a StGB.
   - Seine Sprüche stehen fest in `LINES.hitler`, es kommen keine neuen dazu.
   - Die Haunebu ist eine glockenförmige Metallscheibe mit Nieten, Bullaugen und leuchtender Unterseite, ganz ohne Symbole.
3. **Stil:** das bestehende Designsystem „Pixel-Kneipe“ (`css/theme.css`, `art/README.md`). Keine Emojis in Bedienelementen, keine weichen Verläufe oder Schatten. Grafiken entstehen mit dem byte-identischen Stil-Satz aus `art/README.md`.
4. Fotos werden nie committet. Lokale Tests laufen offline: `apiBase` ist null auf localhost.

## §1 Keller-Arena

- **Lage:** `ARENAS.keller` liegt 29 m neben `worringen`. Beide Marker sind auf der Karte getrennt sichtbar.
- **Marker:** Der Keller-Marker unterscheidet sich erkennbar. Er bekommt einen zusätzlichen Treppen-/Keller-Hinweis, zum Beispiel ein kleines Badge „K“ oder eine Treppen-Pixelgrafik im Schild (`map.js`, CSS-Klasse `arena-keller`).
- **Zugang:** Es gibt keine Sperre. Der Keller ist eine normale Arena: 5 Level, Besitzer, Online-Claim, Reichweite `ARENA_RANGE`.
- **Kulisse:** `art/bg-keller.png` als Kellerraum mit Rohren, Getränkekisten, Regalen und rot glühendem Mining-Rack. Im Kampf gilt `#screen-battle[data-arena="keller"]`, im Arena-Screen `bg-${a.id}`.
- **Boss:** `art/boss-heizung.png`. Ein gusseiserner Heizkörper mit eingebauten ASIC-Mining-Boards, Lüftern, ₿-Logo, orange glühenden Rippen und wütenden LED-Augen.
- **Boss-Attacken.** Die fx-Namen kommen aus data.js. Sebi will hier Insider-Humor mit echten Gesichtern, nicht nur Hitze und Lüfter. Jede Attacke hat einen Handler in `battle-ui.js` `BOSS_FX`. Gesichter werden als `rider` an `prop()` gegeben: `{ rider: '<rüther-id>', riderRarity: 'normal' }`.
  - **`heat` „Dosenbier-Aufguss“** (schnell): Eine Dosenbier-Dose (`fx-beer-can`) klatscht auf die Heizung. Daraus wird Dampf (`sheet-smoke`) und eine Hitzewelle (`fx-heat`) rollt auf mich.
  - **`overheat` „Plus 70 Grad“**: großes Hitzewellen-Requisit plus rot glühender Bühnen-Flash. Dazu kommt eine riesige Zahl „+70 °C“ im Stil von Christians Plus 70 Prozent (`floatText` 'big' oder `banner`-Größe). Die Verbrennung (poison) kommt aus der Engine.
  - **`fan` „Umluft mit Viktor-Aroma“**: Das Lüfter-Requisit `fx-fan` dreht sich. Es bläst eine grüne Gaswolke (`fx-gas`, Filter wie bei Viktors Giftgas) auf mich, in der **Viktors echtes Gesicht** (`rider: 'viktor'`) mitfliegt. Die Bühne „weht“, die Betäubung kommt aus der Engine.
  - **`found` „Hildegard zahlt den Strom“**: **Hildegards echtes Gesicht** reitet auf ihrer Handtasche (`fx-handbag`, `rider: 'hildegard'`) von unten zur Heizung. Dann kommt `sheet-btc-burst` an der Heizung, und die Heizung heilt.
- **Erfolg** `keller`: Er gilt, sobald `(save.arenaLevels.keller || 1) >= 2`, also nach dem ersten Sieg im Keller.
- **„Alle Arenen“:**
  - Der Erfolg `master3` heißt weiter so, prüft aber jetzt alle `ARENAS` (4).
  - Der Siegesscreen-Text lautet „Alle Arenen gemeistert.“ statt „drei“.
  - Der Debug-Bereich bekommt den Knopf „Beamen: Keller“.

## §2 Haunebu: Beschwören und Kampf gegen Hitler

- **Shop:** Der Eintrag `haunebu` kostet 1000 Sats und hat das Icon `art/icon-haunebu.png`. Der Kauf
  1. braucht mindestens einen Rüther im Team (sonst Hinweis, kein Abzug),
  2. zieht die Sats ab,
  3. startet sofort die Beschwörungs-Animation `playSummon` und danach den Kampf.

  Steht `save.flugscheibe` auf true, zeigt der Shop „Im Besitz · Fliegen über die Karte“ und der Knopf ist gesperrt.
- **Kampf:**
  - Modus `'haunebu'` mit `makeBoss(BOSSES.hitler, 1)` und Standarddauer (90 s).
  - Kulisse ist `art/bg-mondbasis.png`: geheime Basis auf der dunklen Mondseite, Hangar, Krater, Erde am Himmel, keine Symbole. Im Kampf gilt `data-arena="haunebu"`.
  - Der Intro-Titel lautet „Haunebu-Landeplatz“, die Zeile darunter „Beschwörung“.
  - Boss-Grafik `art/boss-hitler.png`: eine lächerlich kleine, tobende Karikatur mit schwarzem Seitenscheitel, Zweifingerbart und schlichter olivbrauner Jacke **ohne jedes Abzeichen**, die Fäuste im Wutanfall. Lehnt das Bildmodell ab, baut der Asset-Agent eine Pixel-Karikatur selbst in Python/PIL, im Stil der Bosse und ebenfalls ohne Symbole.
  - Hitlers Sprüche kommen aus `LINES.hitler`: `appear` im Intro, `fight` während des Kampfs, `defeat` im Sieg-Overlay.
- **Boss-Attacken** (`BOSS_FX`). Sebi will Hitlers eigene, lächerliche Markenzeichen ohne Rüther-Bezug:
  - **`rant` und `pencil` sind ersetzt, siehe §2b** (Krupp-Rede, Wolfsschanzen-Beschwörung).
  - `ray`: Strahl der Flugscheibe. Das Requisit `fx-haunebu.png` schwebt oben ein, darunter ein Strahl `fx-tractor-beam.png` auf mich. Die Betäubung kommt aus der Engine.
  - `bunker`: Hitler verschwindet kurz (Klasse `.hide` am Gegner-Sprite) und kommt geheilt zurück.
- **Sieg:**
  - Overlay-Titel „Reichsflugscheibe erbeutet!“, Untertitel „Die Haunebu gehört jetzt dir. Flieg damit zu jeder Arena.“
  - Bild ist `fx-haunebu.png` statt des Bosses, Hitlers Spruch aus `defeat` steht als Notiz darunter.
  - Belohnung: Der Sats-Zähler zeigt `CONST.HAUNEBU_WIN_SATS`, dazu gibt es `XP_HAUNEBU` und den Erfolg `haunebu`.
  - Online-Event: „hat Adolf Hitler besiegt und fliegt jetzt Haunebu!“ (`online.postEvent('achievement', ...)`).
- **Niederlage, Zeitablauf oder Aufgeben:**
  - Titel „Verloren“, Untertitel „Hitler ist mit der Flugscheibe abgehauen. Beschwör sie neu.“
  - Die Sats bleiben weg und es gibt kein „Nochmal“, die Beschwörung kostet neu.
  - Auch beim Aufgeben werden Stats gespeichert (`afterChange`).
- **Stats:** `save.stats.haunebuWins`.

## §2b Hitlers Markenzeichen: Krupp-Rede und Wolfsschanzen-Beschwörung (v7b)

Sebi hat Hitlers zwei Angriffe neu festgelegt. Sie ersetzen die Platzhalter `rant` und `pencil` aus §2, die Daten stehen schon in `BOSSES.hitler`. Flugscheiben-Strahl und Ab in den Bunker bleiben, wie sie sind.

- **`krupp` „Krupp-Rede“** (schneller Angriff, alle 2,3 s, 16 Schaden):
  - Ein schlichtes Holz-Rednerpult mit Mikrofon (`fx-lectern.png`, ohne Symbole) steigt vor Hitler hoch.
  - Hitler bebt kurz. Eine kleine rote Wutblase `fx-rant` („!!“) erscheint über ihm.
  - Eine Sprechblase (`fx-speech`, Pfad `bubble-at-me`, `bubbleText`) mit einem der `flavour`-Texte fliegt auf mich. `flavour` ist ein Array: „Wenn du meine Arbeit für richtig hältst …“ oder „Hart wie Kruppstahl!“, zufällig gewählt.
  - Dauer höchstens ~1,6 s, weil der Angriff oft kommt. Requisiten dürfen sich nicht stapeln, die alte Rede wird beim Start einer neuen abgebaut.
- **`wolfsschanze` „Wolfsschanzen-Beschwörung“** (Spezial, als erster Spezial nach ~10 s):
  - Holzbanner (`banner()` aus fx.js) mit dem Titel „Wolfsschanzen-Beschwörung!“, dem Untertitel „Goebbels! Himmler! Sofort zu mir!“ und Hitlers Bild (`art/boss-hitler.png`) als Porträt.
  - Danach rennen Goebbels und Himmler neben Hitler ins Bild und bleiben 10 s. Das ist das Spiegelbild zu Hildegards Familientreffen: Die Helfer stehen neben dem Gegner (oben), nicht neben mir. Bei jedem Schlag hüpft der Helfer und an mir erscheint die Schadenszahl.
- **Engine (`js/battle.js`)**: Gegner-Helfer sind getrennt von den Spieler-Helfern (`state.summons` bleibt unverändert).
  - `createBattle` bekommt `enemySummons: []`.
  - In `resolveEnemyAttack` gilt: Hat `atk.summon`, dann `s.enemySummons = atk.summon.map(x => ({ id, name, damage: x.damage, nextAt: s.time + SUMMON_INTERVAL, until: s.time + atk.summonMs }))` und das Event `{ type: 'enemySummoned', ids, names, ms }`. Ausweichen verhindert die Beschwörung nicht.
  - Ein neuer Schritt `enemySummonStep` läuft nur, solange der Gegner lebt, und zwar nach `enemyStep`, vor dem Gift. Er schadet dem aktiven Rüther je Helfer alle `SUMMON_INTERVAL` mit `damage` und sendet `{ type: 'enemySummon', id, name, damage }`.
  - KO und Wechsel laufen über die vorhandene Logik. Spätere Schläge treffen den nächsten aktiven Rüther.
  - Abgelaufene Helfer fliegen aus der Liste.
- **UI (`js/battle-ui.js`, `css/battle.css`, Markup im Kampf-Screen in `index.html`)**:
  - Ein Container `.enemy-helpers` neben dem Gegner-Sprite zeigt `art/boss-<id>.png` (kleiner als der Boss). Die Helfer laufen mit Pixel-Animation herein.
  - `render()` blendet den Container aus, wenn `state.enemySummons` leer ist. `stop()` setzt alles zurück.
  - Die alten Handler `rant`/`pencil` werden entfernt.
- **Grafiken:**
  - `boss-goebbels.png` und `boss-himmler.png` entstehen als **Pixel-Karikaturen direkt in PIL**, im Stil von `art/boss-hitler.png` und `art/boss-hitler.py` (64er-Raster ×4, 256×256, transparent, dunkelgrüne Kontur). Die Bildmodelle haben schon Hitler als „nsfw“ abgelehnt, also nicht versuchen und keine Filter umgehen.
    - Goebbels: hager, großer Kopf, abstehende Ohren, glatt zurückgekämmtes schwarzes Haar, brüllt in ein Megafon, schlichter grauer Mantel.
    - Himmler: kleine runde Brille, fliehendes Kinn, Bärtchen, kurzer Seitenscheitel, nervös, mit Klemmbrett, schlichter dunkelgrauer Mantel.
    - Beide lächerlich und ohne jedes Abzeichen, keine Uniform-Insignien, keine Runen, keine Mützenembleme. Keine Behinderung verspotten.
  - `fx-lectern.png` per Higgsfield (`nano_banana_2`, Stil-Satz): schlichtes Holz-Rednerpult mit Mikrofon, ohne Symbole oder Wappen.
  - `fx-pencil.png` fällt weg, mitsamt Eintrag in manifest/README.
- **Tests:** Engine-Test für Gegner-Helfer:
  - Sie schaden 10 s lang einmal pro Sekunde je Helfer.
  - Nach Ablauf schaden sie nicht mehr.
  - Bei einem KO trifft der nächste Schlag den nächsten Rüther.
  - Nach einem Sieg kommt kein Schaden mehr.
  - Die Spieler-Helfer (Familientreffen) laufen unverändert.

  Der vorhandene Hitler-Test in `test/v7.test.mjs` wird auf die neuen fx-Namen umgestellt.

## §2c Gegner-Sprüche immer lesbar (v7c)

Sebi: „der Dialog bei Hitler usw ist total verdeckt, erkennt man nicht“.

**Ursache:** Die Spruchblase (`fx.say` in `.fx`, `SAY_AT` = etwas links über dem Gegner) liegt mitten in der Effektzone. Dort laufen ständig Tipp-Schadenszahlen (`TXT.enemy` liegt fast auf derselben Höhe), Treffer-Funken, Boss-Dampf, die „!!“-Blase, Gegner-Helfer und die Holzbanner (Spezial-Freeze, oben, z 9 > Blase z 8) durch.

**Lösung:** Eine eigene Sprechblase für den Gegner **außerhalb der Bühne**. Sie hängt unter der Gegner-Leiste, wie bei Pokémon.

- **Markup:** `<div class="enemy-say hidden"><img class="say-face" alt=""><p class="say-text"></p></div>` als direktes Kind von `#screen-battle`, nach `.battle-top`. Nicht in `.battle-top` packen, sonst bildet dieser einen Stapelkontext und der Aufgeben-Knopf rutscht unter das Intro.
- **Lage:** `position:absolute`, `left: 12px`, `right: 12px`, `top` = Unterkante von `.battle-top` minus 4 px. Den Wert setzt `battle-ui.js` beim Zeigen über `offsetHeight`. Die Blase hat einen Pixel-Zipfel, der nach oben-links zur Gegner-Leiste zeigt.
- **Ebene:** `z-index: 7`, also über `.stage` mit allen Effekten (`.flash` 5) und über `.switch` (6), unter Intro 8, Aufgeben 9 und Overlay 10.
- **Aussehen:** Pixel-Kneipe: Papier `var(--paper)`, 3 px Tinte-Rand, harter Pixel-Schatten, kein weicher Schatten. Links das Porträt, 36 px:
  - beim Boss `art/boss-<id>.png`,
  - beim wilden Rüther **das echte Gesicht** `sprites/<id>.png` im Seltenheitsrahmen.

  Rechts der Text in Nunito 800, 14 px, höchstens 3 Zeilen. Auftritt als kurzes steps-Pop, bei `prefers-reduced-motion` ohne Animation.
- **Was hineinkommt:**
  1. Alle Gegner-Sprüche aus `speak()` (Boss und wild).
  2. Der Ausruf des wilden Rüthers bei seiner Lade-Attacke.
  3. Neu: Bei jeder **Spezial-Attacke eines Bosses** steht beim `warn`-Event „`<Attackenname>`!“ in der Blase, in der Klasse `shout` (roter Text). So sieht man, was kommt, zum Beispiel „Wolfsschanzen-Beschwörung!“, „Flugscheiben-Strahl!“ oder „Plus 70 Grad!“. Schnelle Attacken bekommen keinen Ausruf, das wäre zu oft.
- **Dauer:** 3000 ms, ein neuer Text ersetzt den alten sofort. `stop()` und das Ergebnis-Overlay blenden die Blase aus. Timer laufen über die vorhandenen `later()`-Helfer, damit `stop()` sie abräumt.
- **Combo:** Solange die Blase sichtbar ist, rutscht die Combo-Anzeige unter sie (Klasse am Screen, z. B. `.talking`), damit nichts überdeckt ist.
- **Aufräumen:** Die bisherigen `say(fx, …)`-Aufrufe für Gegner fallen weg. Wird `say()`/`.fx-say` danach nirgends mehr genutzt, kommen Funktion und CSS weg.
- **Krupp-Rede und Viktors Sprechblasen-Requisit** (`path-bubble-at-me`) liegen in `.fx` über Schadenszahlen und Funken (`z-index` ≥ 8 innerhalb von `.fx`), damit auch deren Text lesbar ist.
- **Muss passen auf 375×667 und 390×844:** Die Gegner-HP-Leiste bleibt frei, und die Blase verdeckt nie die Spezial-Knöpfe.

## §3 Flugscheibe: zu einer Arena beamen

- **Knopf auf der Karte:** Er erscheint nur, wenn `save.flugscheibe` gesetzt ist. Er sitzt unten rechts über dem Folge-Knopf, zeigt `art/icon-haunebu.png` im Pixelrahmen und hat das aria-label „Flugscheibe“.
- **Popup „Wohin fliegen?“:** Es listet alle `ARENAS` mit Name, Ort (Köln/Hagen) und Entfernung zur echten Position (`reachText`/km). Jeder Eintrag hat einen Knopf „300 Sats“, der gesperrt ist, wenn die Sats nicht reichen. Darunter steht ein Hinweis zu den 10 Minuten.
- **Ablauf beim Fliegen:**
  1. `startBeam(save, arenaId, now)` zieht die Sats ab und setzt `save.beam = { arenaId, until }`.
  2. Die App persistiert den Stand.
  3. `await playBeam(...)` läuft (siehe §4).
  4. Danach folgt `locator.setFake(offsetPoint(arena, 40, 0))`, wie beim Debug-Beamen. Dann `map.follow`, `refreshSpawns()`, `refreshStops(true)` und der Toast „Gelandet: <Arena> · 10:00“.
- **Was das Beamen erlaubt:** Am Zielort gilt alles: Arena kämpfen, Rüther in Reichweite fangen (auch ortsgebundene wie Hildegard und Micha) und Dosenbier-Stops drehen. Das ist der Lohn für den Sieg über Hitler.
- **Countdown in der Kopfzeile:** Ein Chip „Haunebu 9:41“ mit Icon tickt jede Sekunde. Ein Tipp darauf öffnet ein Popup mit „Jetzt zurückfliegen“. Das beendet den Flug sofort, die Sats werden nicht erstattet.
- **Ablauf:**
  - Läuft die Zeit ab, kommen `endBeam(save)`, `await playReturn(...)`, `locator.clearFake()` und der Toast „Die Haunebu hat dich zurückgebracht.“
  - Läuft gerade ein Kampf (Screen `screen-battle`) oder ist der Fang-Screen offen, wartet der Rückflug, bis der Screen verlassen wird. Danach startet er sofort.
- **Neu laden:** Ist beim Start der App `activeBeam(save, Date.now())` noch aktiv, setzt die App die Fake-Position ohne Animation und lässt den Chip weiterlaufen. Ist der Flug abgelaufen, räumt sie mit `endBeam` auf.
- **Debug-Beamen** (Test-Modus) während eines Flugs beendet den Flug (`endBeam`), damit sich nichts überlagert. „GPS wieder an“ beendet ihn ebenfalls.
- **Nicht in Reichweite:** Der Arena-Screen zeigt „Zu weit weg (x km)“. Besitzt der Spieler die Flugscheibe, steht dort zusätzlich der Knopf „Mit der Haunebu hinfliegen (300 Sats)“. Er startet denselben Ablauf mit dieser Arena als Ziel.

## §4 Animationen (neues Modul `js/flight.js` + `css/flight.css`)

Alle drei Funktionen geben ein Promise zurück, das nach dem Ende auflöst. Sie blockieren Eingaben während der Animation (Overlay mit `pointer-events:auto`). Bei `prefers-reduced-motion` kommt eine verkürzte Fassung mit Blende (≤ 600 ms). Die Requisiten liegen als Pixelgrafik in `art/`.

- **`playSummon(host)`**, etwa 2,8 s, vor dem Hitler-Kampf, über dem Shop oder der Karte:
  1. Der Bildschirm wird dunkel, Sterne erscheinen.
  2. Die Haunebu sinkt von oben in die Mitte, wackelt und dreht ihre Unterseite (Pixel-Lichtpunkte laufen um).
  3. Der Traktorstrahl geht an (teal, Pixel-Stufen, flackernd).
  4. Ein Kamerawackeln, Rauch (`sheet-smoke`) und das Holzbanner (`banner()` aus fx.js) mit „Die Reichsflugscheibe landet …“ und darunter dem ersten `appear`-Spruch von Hitler.
- **`playBeam(host, { map, to, label })`**, etwa 4–5 s:
  1. Abholen: Die Haunebu fliegt von außerhalb über den Spieler-Marker und senkt den Strahl. Der Spieler-Marker hebt in Pixel-Stufen ab und schrumpft in die Scheibe (`map.liftPlayer(true)`). Weißer Blitz.
  2. Flug: Die Scheibe bleibt in der Bildschirmmitte und schaukelt, Geschwindigkeitsstreifen ziehen durch. `await map.flyTo(to, { duration: 2.2 })` ist Leaflets Flug mit Raus- und Reinzoomen. Ein `label`-Schild „Kurs: <Arena>“ hängt unter der Scheibe.
  3. Absetzen: Der Strahl geht runter und der Marker landet (`map.liftPlayer(false)`). Staub (`sheet-smoke`), die Scheibe zieht nach oben weg.
  4. Dazu läuft `sfx.play('ufo')`, ein wabernder Theremin-Sweep über WebAudio in `audio.js`.
- **`playReturn(host, { map, to })`** ist dieselbe Sequenz zurück, etwa 3 s.
- **Erweiterungen in `map.js`** (gehören zum Animations-Agenten):
  - `flyTo(pos, { duration })` gibt ein Promise zurück, das bei `moveend` auflöst. Spätestens nach `duration + 1 s` löst es per Timeout auf.
  - `liftPlayer(on)` setzt die Klasse `lift` am Spieler-Marker.
  - Keller-Marker mit Klasse `arena-keller` und Badge.

## §5 Logik (`js/progress.js`, rein, mit Tests)

- `emptySaveV3()` bekommt `flugscheibe: false`, `beam: null` und `stats.haunebuWins: 0`. `migrate` behält diese Werte bzw. füllt sie bei alten Spielständen auf.
- `buyItem(save, 'haunebu', now)`:
  - Gibt `{ ok:false, reason:'besitz' }` zurück, wenn die Flugscheibe schon da ist, und `{ ok:false, reason:'sats' }`, wenn die Sats fehlen.
  - Sonst zieht es die Kosten ab und gibt `{ ok:true, summon:true }` zurück. Es zählt nichts in `items` hoch.
- `haunebuWin(save)` setzt `flugscheibe = true`, erhöht `sats += HAUNEBU_WIN_SATS` und `stats.haunebuWins++` und gibt `{ sats }` zurück.
- `startBeam(save, arenaId, now)`:
  - Fehler: `{ ok:false, reason:'keine' }` ohne Flugscheibe, `'arena'` bei unbekannter Arena, `'sats'` bei zu wenig Sats.
  - Sonst zieht es die Kosten ab, setzt `save.beam = { arenaId, until: now + HAUNEBU_BEAM_MS }` und gibt `{ ok:true, until }` zurück.
  - Ein neuer Flug während eines aktiven Flugs ersetzt das Ziel und startet die 10 Minuten neu, wieder gegen volle Kosten.
- `activeBeam(save, now)` gibt `save.beam` zurück, wenn `until > now`, sonst null.
- `endBeam(save)` setzt `save.beam = null`.
- **Erfolge in `js/quests.js`:**
  - `keller`: `(s.arenaLevels.keller || 1) >= 2`
  - `haunebu`: `!!s.flugscheibe`
  - `master3`: `ARENAS.every(a => s.arenaMastered[a.id])`
- **Tests:** buyItem haunebu (alle Fälle), haunebuWin, startBeam (alle Fälle), activeBeam an der Grenze, Migration eines v6-Spielstands. Dazu ein Engine-Test: makeBoss für heizung und hitler, je ein Tick mit stun/poison/heal läuft ohne Fehler, Hitler lässt sich besiegen.

## §6 Backend (Site-Repo, erledigt der Hauptagent)

In `app/src/lib/ruether.server.ts` gehört `keller: "Keller der Rütherschanze"` in die ARENAS-Allowlist. Danach Build und Deploy.

## §7 Grafiken (Higgsfield, ein Agent)

Alle mit Stil-Satz und Magenta-Key + `keying.py`. Modelle: `nano_banana_2` für Bosse, Requisiten und Hintergründe, `gpt_image_2` für Icons. Die Einträge kommen in `art/manifest.json` und `art/README.md` (Runde 3).

| Datei | Inhalt | Größe |
|---|---|---|
| `boss-heizung.png` | Bitcoin-Heizung (siehe §1) | wie andere Bosse |
| `bg-keller.png` | Kellerraum | 1280×720 |
| `boss-hitler.png` | Karikatur (siehe §2), Fallback PIL | wie andere Bosse |
| `bg-mondbasis.png` | Mondbasis-Hangar | 1280×720 |
| `fx-haunebu.png` | Glocken-Flugscheibe seitlich, leuchtende Unterseite | 256×256 |
| `fx-tractor-beam.png` | Traktorstrahl, teal, nach unten breiter | 256×256 |
| `fx-heat.png` | Hitzewellen / Flammenzungen | 256×256 |
| `fx-fan.png` | großer Gehäuselüfter | 256×256 |
| `fx-rant.png` | rote Wut-Sprechblase „!!“ | 256×256 |
| `fx-carpet.png` | eingerollter Perserteppich mit großem Bissloch, fliegend | 256×256 |
| `icon-haunebu.png` | Flugscheibe als Icon | wie andere Icons |

Fehlt eine Datei, fällt der Code auf vorhandene Requisiten zurück (`PROP_FALLBACK`, Boss-Grafik → `sprites/unknown.png`). So bricht nichts, auch wenn ein Bild fehlt.
