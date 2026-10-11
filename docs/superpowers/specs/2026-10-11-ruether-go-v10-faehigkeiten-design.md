# Rüther GO v10: Quest-Fähigkeiten mit Pool, Stufen und Stealth-Druck

Stand 2026-10-11. Mit Sebi Rüther für Rüther abgestimmt (Brainstorming), dann **/goal: komplett umsetzen, testen, live auf GitHub, so schnell wie möglich.**

## §0 Regeln

- Das gilt alles für den **Quest-Modus** (`js/quest/*`). Die Arena-Kämpfe und ihre Attacken in `data.js` `RUETHERS[].attacks` bleiben unverändert.
- Echte Gesichter (`sprites/<id>.png`) und Humor sind der Kern. Pixel-Kneipe-Stil, keine Emojis in Bedienelementen, keine NS-Symbole.
- `js/data.js` ändern nur die Hauptsession, schon drin: `CONST.ABILITY_BUY 1000`, `CONST.ABILITY_UP {2:2000, 3:3000}`.
- **Stefan** (Kaffee-NPC) heißt überall sichtbar „Stefan“. Er redet nur übers Breit-Sein nach Kieser und über Bulletproof Coffee.
- Lokal offline, nie ins echte ntfy-Topic schreiben, Fotos nie committen. Mobil zuerst: 390×844 und 375×667.

## §1 Grundsystem

- **Jeder Rüther hat 3 Quest-Fähigkeiten:**
  - **2 feste** (immer dabei),
  - **1 wechselbarer dritter Slot** aus seinem **eigenen Pool von 3**.
- **Besitz und Stufen gehören dem Rüther an sich**, nicht dem einzelnen Exemplar. Jeder gefangene Christian hat dieselben Fähigkeiten. Fusion und Verkauf ändern daran nichts.
- **Stufen 1–3:**
  - Stufe 1 ist der Grundeffekt.
  - **Stufe 2** verstärkt: Dauer, Reichweite, Abklingzeit oder Wirkung.
  - **Stufe 3** bringt einen **neuen Zusatzeffekt**.
- **Kosten:**
  - Pool-Fähigkeit kaufen kostet `ABILITY_BUY` (1000) und ergibt Stufe 1.
  - Upgrade auf Stufe 2 kostet `ABILITY_UP[2]` (2000), auf Stufe 3 `ABILITY_UP[3]` (3000).
  - Bei den festen Fähigkeiten ist Stufe 1 gratis, die Upgrades kosten gleich viel.
  - Pro Rüther kostet alles 28.000, für alle fünf 140.000.
- **Ausrüsten:** Für den dritten Slot geht nur eine gekaufte Pool-Fähigkeit. Wechseln ist kostenlos, in der Sammlung und in der Team-Wahl vor der Quest. Die erste gekaufte Pool-Fähigkeit wird automatisch ausgerüstet. Ohne gekaufte Pool-Fähigkeit bleibt der Slot leer (zeigt „Kaufen“).
- **Spielstand:**
  - `save.questAbilities = { [ruetherId]: { levels: { [abilityId]: 1|2|3 }, slot: abilityId|null } }`
  - Feste Fähigkeiten haben implizit Stufe 1.
  - Die Migration füllt alte Spielstände leer auf.

## §2 Fähigkeiten (alle 25)

IDs in Klammern. Reichweiten in Kacheln, Zeiten in Sekunden, CD = Abklingzeit. Wo nichts angegeben ist, gelten die Werte der Vorstufe.

### Christian
| | Stufe 1 | Stufe 2 | Stufe 3 |
|---|---|---|---|
| **Plus 70 Prozent** (`plus70`, fest) | verschlossene Tür ≤ 1,5 auf, CD 8 | CD 5, lautlos (kein Geräusch beim Öffnen) | öffnet aus ≤ 3; danach dauert am nächsten Tresor der nächste Klau 0 s |
| **Werfen mit Dosenbier** (`beer`, fest) | Wurf ≤ 6, Gegner in 5 sehen 6 s nach, CD 12 | ≤ 8, CD 8 | Bierpfütze: Die erste Wache, die hinkommt, rutscht aus und ist 6 s KO (leise) |
| **Vice-President-Auftritt** (`vp`, Pool) | 12 s Tarnung: Wachen werden nicht misstrauisch. Klauen, Sabotieren oder Angreifen bricht sie. Himmler (`clipboard`) füllt den Verdacht trotzdem mit ×0,5. CD 35 | 18 s | „Gehen Sie mal zum Tor!“: Eine Wache, an der er in ≤ 1,5 vorbeigeht, verlässt 10 s ihren Posten (läuft Richtung Tor) |
| **Kurs-Alarm** (`kursalarm`, Pool) | Handy an Punkt ≤ 5: Wachen in 6 laufen hin und starren 10 s drauf (Kegel aus), CD 30 | 15 s | Danach Misstrauen 0, globaler Alarm −0,3 |
| **WLAN-Störung** (`wlan`, Pool) | 5×5 um Punkt ≤ 6, 12 s: Sicht der Wachen darin ×0,5, Drohnen dort aus, CD 30 | 7×7, 16 s | Funkloch: Alarme von Wachen in der Zone verbreiten sich nicht (kein Rufen, kein Megafon, keine Pfeife, kein Bellen) |

### Hildegard
| | Stufe 1 | Stufe 2 | Stufe 3 |
|---|---|---|---|
| **Familientreffen** (`family`, fest) | die echten Christian und Micha schalten die 2 nächsten Gegner in 5 dauerhaft aus, nur wenn ein Gegner in Reichweite ist, CD 60 | CD 45, Reichweite 6 | 3 Gegner, und es entsteht kein Geräusch |
| **„Junge, komm mal her!“** (`junge`, fest, **ersetzt den Handtaschen-Hieb**) | Wache ≤ 8 kommt zu ihr und wird 10 s ausgeschimpft (Kegel aus), CD 18 | 15 s, ≤ 10 | Danach geht sie still auf ihre Runde zurück, ihr Misstrauen bleibt 30 s bei 0 |
| **Mittagsruhe** (`mittag`, Pool) | Wachen in 6 um sie dösen 15 s. Ein Geräusch in 6 weckt sie gereizt: Misstrauen ×2 für 20 s. CD 40 | 20 s, Radius 7 | Nur Geräusche in 2 Kacheln wecken sie |
| **Tratsch** (`tratsch`, Pool) | Die 2 nächsten Wachen in 8 laufen zueinander und streiten 12 s (Kegel aufeinander), CD 30 | 18 s | Danach tauschen sie ihre Patrouillen-Routen |
| **„Ich ruf deine Mutter an!“** (`mutter`, Pool) | Wache ≤ 6 verlässt den Posten, läuft zum Tor bzw. Rand und kommt nach 20 s zurück, CD 35 | 30 s | Sie kommt verheult zurück: 15 s halbe Sicht |

### Viktor
| | Stufe 1 | Stufe 2 | Stufe 3 |
|---|---|---|---|
| **Giftgas-Wand** (`gas`, fest) | 3×3 um Punkt ≤ 5, 10 s, blockiert Sicht, wer drin ist, hustet (betäubt), CD 20 | 14 s, CD 15 | Wand 3×5, quer oder längs (Ausrichtung wählbar) |
| **Ungeschlagene Argumentationslogik** (`argue`, fest) | Gegner ≤ 3 mit Sichtlinie steht 8 s sprachlos, CD 15 | 12 s, ≤ 4 | Eine zweite Wache in 3 hört zu und steht ebenfalls |
| **Crash-Gerücht** (`crash`, Pool) | Wachen in 6 checken 10 s ihr Depot (Kegel aus), CD 30 | 14 s | Panikverkauf: Danach laufen sie 6 s Richtung Tor |
| **Insider-Tipp** (`insider`, Pool) | Wache ≤ 3, danach Zielpunkt ≤ 12 wählen: Sie läuft hin und wartet 8 s, CD 25 | Punkt ≤ 18, 12 s | Sie erzählt es weiter: Eine zweite Wache in 4 kommt mit |
| **Deobombe** (`deo`, Pool) | Nebel 5×5 um Punkt ≤ 4, 20 s, blickdicht (Sicht hinein, heraus und hindurch blockiert), kein Husten, CD 35 | 30 s | Dämpft auch Geräusche: Klauen, Sabotieren und Abdrehen im Nebel lösen kein Misstrauen über Geräusch aus. Rüther im Nebel zählen als in Deckung |

### Micha
| | Stufe 1 | Stufe 2 | Stufe 3 |
|---|---|---|---|
| **Hardware-Wallet-Umbau** (`wallet`, fest) | Tresor ≤ 1,5 sofort volle Taschen bzw. Drohne ≤ 5 für 10 s aus, CD 25 | CD 18, Drohne 15 s | Auch Teamkameraden in 2 bekommen volle Taschen (am selben Tresor, sofern Münzen da sind) |
| **Controllerwurf** (`controller`, fest) | Fern-KO 10 s, ≤ 6, Sichtlinie, CD 12 | 14 s, ≤ 7 | Abpraller: trifft zusätzlich eine zweite Wache in 3 |
| **Firewall** (`firewall`, Pool) | Wand aus 5 Kacheln an Punkt ≤ 5 (Ausrichtung wählbar), 15 s. Nur Rüther kommen durch, Gegner nicht. Sicht frei. CD 30 | 22 s, 7 Kacheln | Blockiert zusätzlich die Sicht der Gegner |
| **Raubkopie** (`raubkopie`, Pool) | Fake-Rüther (Gesicht des gewählten Teammitglieds, halbtransparent geglitcht) startet an Punkt ≤ 6 und läuft 10 s einen Weg zu einem zweiten Punkt. Wachen, die ihn sehen, jagen ihn. Danach verpufft er. CD 30 | 15 s | Wer ihn erreicht, ist 6 s verwirrt („Lizenz ungültig“, gilt wie betäubt) |
| **Vibrationsalarm** (`vibra`, Pool) | Wache ≤ 8 bleibt 4 s stehen und schaut aufs Handy (Kegel aus), CD 8 | 6 s, CD 6 | Gruppen-Chat: zwei Wachen (die gewählte und die nächste in 6) |

### Ramona
| | Stufe 1 | Stufe 2 | Stufe 3 |
|---|---|---|---|
| **Abgelaufene M&Ms** (`mms`, fest) | Köder an Punkt ≤ 4, der nächste Wachgänger in 6 isst und ist 20 s KO, CD 18 | 30 s, Punkt ≤ 6 | Familienpackung: reicht für 2 Wachen |
| **Unlimited Credits** (`credits`, fest) | angrenzende Wache 25 s bestochen (untätig), CD 30 | 40 s, CD 22 | Spitzel: Die bestochene Wache deckt 25 s alle Gegner in 5 um sich auf (auch hinter Wänden sichtbar) |
| **Trollkids-Horde** (`horde`, Pool) | Kinderhorde 10 s in 5×5 um Punkt ≤ 6. Alle Wachen darin sind beschäftigt (bleiben stehen, Kegel aus). CD 35 | 15 s | Die Horde zieht einen gewählten Weg entlang (zweiter Punkt ≤ 10) |
| **Sale-Schild** (`sale`, Pool) | Schild an Punkt ≤ 3, bleibt 60 s. Jede Wache, die in 2 vorbeikommt, bleibt 4 s davor stehen (pro Wache einmal alle 15 s). CD 30 | 120 s, 6 s | 2 Schilder gleichzeitig |
| **„Feierabend!“** (`feierabend`, Pool) | angrenzende **normale** Wache (nicht Stefan, Goebbels, Himmler, Ranger) kündigt, geht zum Tor und verschwindet für die Mission. 1× pro Mission (Ladung statt CD) | 2× pro Mission | nimmt einen Kollegen in 4 mit (ebenfalls normal) |

Normale Gegner sind `pinguin`, `drohne` (nur „Feierabend!“ ausgenommen: Drohnen kündigen nicht), `detektiv`, `camper`, `dackel` und `platzwart`. Spezialgegner sind Stefan, Goebbels, Himmler und Ranger. Für sie kann es abgeschwächte Wirkungen geben, etwa halbe Dauer. Wo das so ist, steht es in der Beschreibung.

**Fähigkeitstexte:** Kurzbeschreibung pro Stufe in Deutsch, witzig und genau. Sie stehen in den Daten (§3) und werden in Sammlung, Team-Wahl und Kreismenü angezeigt.

## §3 Technik

- **Neues Modul `js/quest/abilities.js`**, rein und ohne Imports von App-Code:
  - `ABILITIES[id] = { id, unit, kind: 'fixed'|'pool', name, icon, target, stages: [ {…Stufe 1}, {…2}, {…3} ], texts: ['…','…','…'] }`
  - `POOLS[unit] = [poolIds]`, `FIXED[unit] = [fixedIds]`
  - `params(id, level)` liefert die zusammengeführten Werte bis zur Stufe.
  - **target-Typen:**
    - `door`
    - `point`
    - `enemy`
    - `self`
    - `vaultOrDrone`
    - `enemyThenPoint` (Insider-Tipp)
    - `pointThenPoint` (Raubkopie: Start und Ziel, Horde Stufe 3)
    - `pointDir` (Firewall, Gas Stufe 3: Punkt und Ausrichtung)
    - `teammatePoint` (Raubkopie: wessen Gesicht, Standard ist der Ausführende)
- **`js/progress.js`:**
  - `abilityLevel(save, rid, aid)`
  - `buyAbility(save, rid, aid)` gibt `{ok, reason?: 'sats'|'pool'|'besitz'}` zurück.
  - `upgradeAbility(save, rid, aid)` gibt `{ok, reason?: 'sats'|'max'|'fehlt'}` zurück.
  - `equipAbility(save, rid, aid|null)`
  - `loadoutFor(save, rid)` liefert `[{id, level}, {id, level}, {id, level}|null]`.
  - Kosten aus `CONST`. Migration.
- **Engine:**
  - `createQuest` bekommt pro Team-Einheit `loadout` (aus `loadoutFor`).
  - Einheiten haben nur ihre 3 Fähigkeiten mit Stufe. `abilitiesFor(unit)` gilt pro Einheit.
  - Alle 25 Wirkungen sind umgesetzt: neue Gegnerzustände, platzierbare Objekte (Handy, Schild, Firewall, Nebel, WLAN-Zone, Raubkopie, Horde, Pfütze, Webcam-artige Aufdeckung) und Verhalten (herkommen, ausschimpfen, dösen mit Aufwachen, streiten mit Routentausch, Posten verlassen und zurückkehren, Depot checken, zu einem Punkt gehen und warten, kündigen, aufs Handy schauen).
  - Abklingzeiten bzw. Ladungen.
  - Events für jede Wirkung mit allen Daten für Animationen.
  - Alte `handbag`-Quest-Fähigkeit entfernen.
  - Die Missionstexte und Tutorial-Hinweise, die Handtaschen-Hieb oder alte Kräfte nennen, werden angepasst.
- **UI:**
  - **Sammlung:** Auf der Rüther-Karte gibt es den Bereich **„Quest-Fähigkeiten“**.
    - Er zeigt die 2 festen und die 3 Pool-Fähigkeiten mit Icon, Name, Stufen-Punkten (●●○) und dem Text der aktuellen sowie der nächsten Stufe.
    - Dazu gibt es die Knöpfe „Kaufen 1.000“, „Upgrade 2.000/3.000“ und „Ausrüsten“. Die ausgerüstete ist markiert.
    - Bei zu wenig Sats ist der Knopf gesperrt.
  - **Team-Wahl:** Pro Rüther sind die 3 Fähigkeiten zu sehen. Ein Tipp auf den dritten Slot wechselt durch die gekauften Pool-Fähigkeiten.
  - **Quest:** Das Kreismenü bzw. die Leiste zeigt die 3 ausgerüsteten mit Stufen-Punkten, Abklingzeit und Ladungen. Neue Zielmodi (zwei Punkte, Punkt mit Ausrichtung, Wache und dann Punkt) bekommen klare Hinweise („Ziel wählen“, „Richtung tippen“).
  - **Animationen für alle 25:**
    - Handy mit Chart
    - WLAN-Wellen und dunkle Zone
    - Anzug-Glitzer bei der Tarnung
    - Schimpf-Blase
    - Zzz
    - Streit-Blitze
    - Telefon-Klingeln
    - Depot-Handys
    - Wegweiser-Pfeil
    - rosa Deo-Nebel
    - Firewall aus Flammen-Pixeln in Blau-Teal mit Schild
    - Raubkopie mit Glitch-Streifen
    - Vibrations-Wellen
    - Kinderhorde
    - SALE-Schild
    - Kündigung mit Karton unterm Arm
    - Pfütze
    - Spitzel-Auge

## §4 Gegner schwerer, Stealth lohnt sich

Sebi: „Denk dran, die Gegner automatisch schwerer zu machen, vor allem im direkten Nahkampf, dadurch sollen Leute mehr Stealth spielen.“

- **Nahkampf ist gefährlich:**
  - Alarmierte Gegner machen deutlich mehr Schaden (Grundwert-`dps` ×2,5) und halten mehr aus (HP ×1,6).
  - Die Rüther wehren sich schwächer (`DEFEND` 8 → 5 × power).
  - Ziel (als Test mit Simulation): Ein Rüther im Nahkampf gegen **eine** alarmierte Wache verliert ≥ 50 % seiner HP. Gegen **zwei** gleichzeitig geht er bei Lv. 20 legendär innerhalb von ≤ 12 s zu Boden.
- **Automatisch mitwachsend:**
  - Der vorhandene Faktor nach Teamstärke (`DMG_REF`) bleibt.
  - Dazu kommt pro Fähigkeits-Stufe über 1 im Team: +3 % Gegner-`dps` und +2 % Gegner-HP. Mit voll ausgebauten Fähigkeiten werden direkte Kämpfe also noch teurer.
- **Alarm hat mehr Folgen:**
  - Alarmierte Gegner rufen Kollegen in 8 Kacheln (statt 6).
  - Die Verstärkung bei Voll-Alarm kommt alle 15 s (statt 20).
- **Stealth bleibt fair:**
  - Sichtkegel und Misstrauens-Tempo bleiben unverändert, im Nahkampf wird es dagegen härter.
  - Leise Lösungen (Fähigkeiten, Umgehen, Ablenken) sind klar der bessere Weg.
  - Jede Mission bleibt ohne Kampf lösbar.
- **Anzeige:**
  - Der Briefing-Hinweis lautet „Nahkampf ist gefährlich – schleich dich durch!“.
  - Ein alarmierter Gegner im Nahkampf zeigt einen roten Schadens-Indikator.

## §5 Tests

- **Logik:** Kaufen, Upgraden und Ausrüsten mit allen Fehlerfällen und Kosten. Migration. `loadoutFor`.
- **Engine:**
  - jede der 25 Fähigkeiten auf Stufe 1 und mit ihrem Stufe-3-Effekt
  - Ladungen bei „Feierabend!“, Spezialgegner-Ausnahmen
  - Firewall lässt nur Rüther durch, Deobombe blockt Sicht, Funkloch stoppt Alarmweitergabe, Tratsch tauscht Routen
  - Nahkampf-Simulation aus §4
  - alle Missionen bleiben lösbar
- **Leistung:** 1000 Ticks auf der Camping-Karte < 400 ms mit allen Effekten aktiv.

## §6 Zuständigkeiten

| Bereich | Dateien |
|---|---|
| Logik | `js/progress.js`, `test/v10.test.mjs` (+ Anpassungen) |
| Engine | `js/quest/abilities.js` (neu), `js/quest/engine.js`, `js/quest/path.js`, `js/quest/missions.js` (nur Texte, Hinweise, Handtaschen-Reste), `test/quest.test.mjs`, `test/abilities.test.mjs` (neu) |
| Grafik | `art/*`: 16 neue Fähigkeits-Icons `art/ab-<id>.png` (64×64), kleine Requisiten `art/q-phone.png`, `q-sign.png`, `q-kids.png`, `q-box.png` (Kündigungskarton) |
| Quest-UI | `js/quest/view.js`, `js/quest/draw.js`, `css/quest.css` |
| App | `js/app.js`, `js/screens.js`, `index.html`, `js/ui.js`, `css/screens.css`, `css/app.css`, `README.md` |
