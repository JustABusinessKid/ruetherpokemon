// Quest-Fähigkeiten v10 (Spec §2/§3): je Rüther 2 feste und ein Pool von 3, Stufen 1–3. Rein, ohne Imports.
// stages[k] enthält nur, was sich ab Stufe k+1 ändert; params(id, level) führt bis zur Stufe zusammen.
// Reichweiten (range, r) in Kacheln, Zeiten (ms, cd) in ms. target je Stufe (Gas und Horde wechseln auf Stufe 3):
// 'door' | 'point' | 'enemy' | 'self' | 'vaultOrDrone' | 'enemyThenPoint' | 'pointThenPoint' | 'pointDir' | 'teammatePoint'.
// special < 1: Spezialgegner (Stefan, Goebbels, Himmler, Ranger, Moshe, Berater (v13)) nur so lange. Weicher Trennstrich (u00AD) = Trennstelle im Kreismenü.
const A = (id, unit, kind, name, icon, stages, texts) => ({ id, unit, kind, name, icon: `art/${icon}.png`, target: stages[0].target, stages, texts });

export const ABILITIES = Object.fromEntries([
  // ---------- Christian ----------
  A('plus70', 'christian', 'fixed', 'Plus 70 Prozent', 'fx-chart-up', [
    { target: 'door', range: 1.5, cd: 8000, noise: 4 }, { cd: 5000, noise: 0 }, { range: 3, quickSteal: true },
  ], [
    'Öffnet eine verschlossene Tür direkt daneben. Knarzt hörbar. Abklingzeit 8 s.',
    'Die Tür steigt jetzt lautlos um 70 Prozent. Abklingzeit 5 s.',
    'Öffnet aus 3 Kacheln. Danach geht der nächste Klau am Tresor sofort, der Kurs ist ja schon oben.',
  ]),
  A('beer', 'christian', 'fixed', 'Werfen mit Dosenbier', 'fx-beer-can', [
    { target: 'point', range: 6, r: 5, cd: 12_000 }, { range: 8, cd: 8000 }, { puddle: 30_000, slip: 6000 },
  ], [
    'Wurf bis 6 Kacheln. Das Scheppern lockt Gegner in 5 Kacheln, sie suchen 6 s. Abklingzeit 12 s.',
    'Wurf bis 8 Kacheln, Abklingzeit 8 s. Christian trainiert heimlich.',
    'Bierpfütze: Die erste Wache, die reinlatscht, legt sich 6 s hin. Ganz leise.',
  ]),
  A('vp', 'christian', 'pool', 'Vice-President-Auftritt', 'ab-vp', [
    { target: 'self', ms: 12_000, cd: 35_000, himmler: 0.5 }, { ms: 18_000 }, { send: 10_000, sendR: 1.5 },
  ], [
    '12 s im Anzug: Wachen werden nicht misstrauisch. Klauen, Sabotieren oder Prügeln fliegt auf, Himmler zählt halb so schnell mit. Abklingzeit 35 s.',
    'Der Auftritt dauert 18 s. Mehr Anzug geht nicht.',
    '„Gehen Sie mal zum Tor!“ Die erste Wache, an der er dicht vorbeigeht, verlässt 10 s ihren Posten.',
  ]),
  A('kursalarm', 'christian', 'pool', 'Kurs-Alarm', 'ab-kursalarm', [
    { target: 'point', range: 5, r: 6, ms: 10_000, cd: 30_000 }, { ms: 15_000 }, { reset: true, alarmDrop: 0.3 },
  ], [
    'Handy mit Chart an einen Punkt bis 5 Kacheln. Wachen in 6 Kacheln laufen hin und starren 10 s drauf. Abklingzeit 30 s.',
    '15 s Starren. Der Kurs macht gerade richtig was.',
    'Danach sind alle tiefenentspannt: Misstrauen weg, Alarm minus 30 Prozent.',
  ]),
  A('wlan', 'christian', 'pool', 'WLAN-Störung', 'ab-wlan', [
    { target: 'point', range: 6, size: 5, ms: 12_000, sight: 0.5, cd: 30_000 }, { size: 7, ms: 16_000 }, { funkloch: true },
  ], [
    'Störung 5×5 an einem Punkt bis 6 Kacheln, 12 s: Wachen darin sehen halb so weit, Drohnen fallen aus. Abklingzeit 30 s.',
    '7×7 Kacheln, 16 s. Der Router blinkt nur noch orange.',
    'Funkloch: Wer in der Zone Alarm schlägt, ruft ins Leere. Kein Rufen, kein Megafon, keine Pfeife, kein Bellen.',
  ]),
  // ---------- Hildegard ----------
  A('family', 'hildegard', 'fixed', 'Familientreffen', 'fx-family', [
    { target: 'self', range: 5, n: 2, cd: 60_000, noise: 5 }, { cd: 45_000, range: 6 }, { n: 3, noise: 0 },
  ], [
    'Die echten Christian und Micha stürmen rein und fesseln die 2 nächsten Gegner in 5 Kacheln für immer. Laut. Nur wenn einer da ist. Abklingzeit 60 s.',
    'Reichweite 6 Kacheln, Abklingzeit 45 s. Wenn Mutti ruft, sind die Jungs schneller da.',
    '3 Gegner, und keiner hört was. Familie regelt das unter sich.',
  ]),
  A('junge', 'hildegard', 'fixed', '„Junge, komm mal her!“', 'ab-junge', [
    { target: 'enemy', range: 8, ms: 10_000, cd: 18_000, special: 0.5 }, { ms: 15_000, range: 10 }, { calm: 30_000 },
  ], [
    'Eine Wache bis 8 Kacheln kommt zu ihr und kriegt 10 s den Kopf gewaschen, Blick auf die Schuhe. Spezialgegner halb so lang. Abklingzeit 18 s.',
    '15 s Standpauke, sie ruft bis 10 Kacheln weit.',
    'Danach trottet er still zurück auf seine Runde und bleibt 30 s die Ruhe selbst.',
  ]),
  A('mittag', 'hildegard', 'pool', 'Mittagsruhe', 'ab-mittag', [
    { target: 'self', r: 6, ms: 15_000, wakeR: 6, grumpy: 20_000, cd: 40_000 }, { ms: 20_000, r: 7 }, { wakeR: 2 },
  ], [
    'Wachen in 6 Kacheln dösen 15 s. Ein Geräusch in 6 Kacheln weckt sie, dann sind sie 20 s doppelt so misstrauisch. Abklingzeit 40 s.',
    '20 s Nickerchen im Umkreis von 7 Kacheln.',
    'Tiefschlaf: Nur Geräusche in 2 Kacheln wecken sie noch.',
  ]),
  A('tratsch', 'hildegard', 'pool', 'Tratsch', 'ab-tratsch', [
    { target: 'self', r: 8, ms: 12_000, cd: 30_000, special: 0.5 }, { ms: 18_000 }, { swap: true },
  ], [
    'Die 2 nächsten Wachen in 8 Kacheln laufen zueinander und streiten 12 s, sie sehen nur noch sich. Spezialgegner halb so lang. Abklingzeit 30 s.',
    '18 s Streit. Es geht um die Grillzange von 2019.',
    'Danach sind sie so beleidigt, dass sie ihre Runden tauschen.',
  ]),
  A('mutter', 'hildegard', 'pool', '„Ich ruf deine Mutter an!“', 'ab-mutter', [
    { target: 'enemy', range: 6, ms: 20_000, cd: 35_000, special: 0.5 }, { ms: 30_000 }, { teary: 15_000 },
  ], [
    'Eine Wache bis 6 Kacheln muss ans Telefon, verzieht sich Richtung Tor und kommt nach 20 s zurück. Spezialgegner halb so lang. Abklingzeit 35 s.',
    'Das Telefonat dauert 30 s. Mutti hat viel zu erzählen.',
    'Sie kommt verheult zurück und sieht 15 s nur halb so weit.',
  ]),
  // ---------- Viktor ----------
  A('gas', 'viktor', 'fixed', 'Giftgas-Wand', 'fx-gas', [
    { target: 'point', range: 5, w: 3, h: 3, ms: 10_000, cd: 20_000 }, { ms: 14_000, cd: 15_000 }, { target: 'pointDir', h: 5 },
  ], [
    '3×3-Wolke an einem Punkt bis 5 Kacheln, 10 s. Blockiert die Sicht, wer drin steht, hustet. Abklingzeit 20 s.',
    'Die Wolke hält 14 s, Abklingzeit 15 s.',
    'Jetzt eine echte Wand: 3×5 Kacheln, quer oder längs.',
  ]),
  A('argue', 'viktor', 'fixed', 'Ungeschlagene Argumentations­logik', 'fx-speech', [
    { target: 'enemy', range: 3, los: true, ms: 8000, cd: 15_000 }, { ms: 12_000, range: 4 }, { second: 3 },
  ], [
    'Ein Gegner bis 3 Kacheln mit Sichtlinie steht 8 s sprachlos da. Abklingzeit 15 s.',
    '12 s sprachlos, wirkt bis 4 Kacheln.',
    'Eine zweite Wache in 3 Kacheln hört zu und ist auch sprachlos.',
  ]),
  A('crash', 'viktor', 'pool', 'Crash-Gerücht', 'ab-crash', [
    { target: 'self', r: 6, ms: 10_000, cd: 30_000, special: 0.5 }, { ms: 14_000 }, { panic: 6000 },
  ], [
    'Wachen in 6 Kacheln checken 10 s ihr Depot und sehen nur noch Rot. Spezialgegner halb so lang. Abklingzeit 30 s.',
    '14 s Depot-Panik.',
    'Panikverkauf: Danach rennen sie 6 s Richtung Tor.',
  ]),
  A('insider', 'viktor', 'pool', 'Insider-Tipp', 'ab-insider', [
    { target: 'enemyThenPoint', range: 3, range2: 12, ms: 8000, cd: 25_000, special: 0.5 }, { range2: 18, ms: 12_000 }, { second: 4 },
  ], [
    'Viktor flüstert einer Wache bis 3 Kacheln einen Tipp. Sie läuft zu einem Punkt bis 12 Kacheln und wartet dort 8 s. Spezialgegner halb so lang. Abklingzeit 25 s.',
    'Punkt bis 18 Kacheln, sie wartet 12 s. Der Tipp ist heiß.',
    'Sie erzählt es weiter: Eine zweite Wache in 4 Kacheln kommt mit.',
  ]),
  A('deo', 'viktor', 'pool', 'Deobombe', 'ab-deo', [
    { target: 'point', range: 4, size: 5, ms: 20_000, cd: 35_000 }, { ms: 30_000 }, { mute: true },
  ], [
    'Rosa Nebel 5×5 an einem Punkt bis 4 Kacheln, 20 s. Keiner sieht rein, raus oder durch. Kein Husten, nur Duft. Abklingzeit 35 s.',
    'Der Nebel hält 30 s. Ganze Dose.',
    'Dämpft auch Geräusche: Klauen, Sabotieren und Abdrehen im Nebel hört keiner. Wer drin steht, ist in Deckung.',
  ]),
  // ---------- Micha ----------
  A('wallet', 'micha', 'fixed', 'Hardware-Wallet-Umbau', 'fx-wallet', [
    { target: 'vaultOrDrone', range: 5, vaultRange: 1.5, ms: 10_000, cd: 25_000 }, { cd: 18_000, ms: 15_000 }, { share: 2 },
  ], [
    'Am Tresor direkt daneben sofort volle Taschen. Oder eine Drohne bis 5 Kacheln ist 10 s aus. Abklingzeit 25 s.',
    'Abklingzeit 18 s, die Drohne ist 15 s aus.',
    'Teamkameraden in 2 Kacheln kriegen am selben Tresor auch volle Taschen, solange Münzen da sind.',
  ]),
  A('controller', 'micha', 'fixed', 'Controllerwurf', 'fx-controller', [
    { target: 'enemy', range: 6, los: true, ms: 10_000, cd: 12_000 }, { ms: 14_000, range: 7 }, { bounce: 3 },
  ], [
    'Fernkampf-KO für 10 s bis 6 Kacheln, braucht Sichtlinie. Abklingzeit 12 s.',
    '14 s KO, wirft bis 7 Kacheln.',
    'Abpraller: trifft noch eine zweite Wache in 3 Kacheln.',
  ]),
  A('firewall', 'micha', 'pool', 'Firewall', 'ab-firewall', [
    { target: 'pointDir', range: 5, len: 5, ms: 15_000, cd: 30_000 }, { ms: 22_000, len: 7 }, { opaque: true },
  ], [
    'Wand aus 5 Kacheln an einem Punkt bis 5 Kacheln, quer oder längs, 15 s. Nur Rüther kommen durch, Gegner nicht, durchsehen geht. Abklingzeit 30 s.',
    '22 s, 7 Kacheln lang.',
    'Jetzt auch blickdicht für Gegner.',
  ]),
  A('raubkopie', 'micha', 'pool', 'Raubkopie', 'ab-raubkopie', [
    { target: 'teammatePoint', range: 6, ms: 10_000, cd: 30_000 }, { ms: 15_000 }, { confuse: 6000 },
  ], [
    'Ein geglitchter Fake-Rüther startet an einem Punkt bis 6 Kacheln und läuft 10 s zu einem zweiten Punkt. Wachen, die ihn sehen, jagen ihn. Abklingzeit 30 s.',
    'Die Kopie hält 15 s.',
    'Wer ihn erreicht, ist 6 s verwirrt: „Lizenz ungültig“.',
  ]),
  A('vibra', 'micha', 'pool', 'Vibrations­alarm', 'ab-vibra', [
    { target: 'enemy', range: 8, ms: 4000, cd: 8000 }, { ms: 6000, cd: 6000 }, { second: 6 },
  ], [
    'Eine Wache bis 8 Kacheln bleibt 4 s stehen und schaut aufs Handy. Abklingzeit 8 s.',
    '6 s Handy, Abklingzeit 6 s.',
    'Gruppen-Chat: Die nächste Wache in 6 Kacheln schaut auch.',
  ]),
  // ---------- Ramona ----------
  A('mms', 'ramona', 'fixed', 'Abgelaufene M&Ms', 'fx-mms', [
    { target: 'point', range: 4, r: 6, ms: 20_000, portions: 1, cd: 18_000 }, { ms: 30_000, range: 6 }, { portions: 2 },
  ], [
    'Köder an einen Punkt bis 4 Kacheln. Der nächste Wachgänger in 6 Kacheln isst und ist 20 s KO. Abklingzeit 18 s.',
    '30 s KO, Wurf bis 6 Kacheln.',
    'Familienpackung: reicht für 2 Wachen.',
  ]),
  A('credits', 'ramona', 'fixed', 'Unlimited Credits', 'fx-bags', [
    { target: 'enemy', range: 1.2, ms: 25_000, cd: 30_000 }, { ms: 40_000, cd: 22_000 }, { spy: 25_000, spyR: 5 },
  ], [
    'Bestechung: Eine Wache direkt neben dir ist 25 s untätig. Abklingzeit 30 s.',
    '40 s untätig, Abklingzeit 22 s.',
    'Spitzel: Die bestochene Wache verrät 25 s alle Gegner in 5 Kacheln um sich, auch hinter Wänden.',
  ]),
  A('horde', 'ramona', 'pool', 'Trollkids-Horde', 'ab-horde', [
    { target: 'point', range: 6, size: 5, ms: 10_000, cd: 35_000 }, { ms: 15_000 }, { target: 'pointThenPoint', range2: 10 },
  ], [
    'Kinderhorde 10 s in 5×5 an einem Punkt bis 6 Kacheln. Alle Wachen darin stehen fest und sehen nichts. Abklingzeit 35 s.',
    '15 s Chaos.',
    'Die Horde zieht einen Weg entlang zu einem zweiten Punkt bis 10 Kacheln weiter.',
  ]),
  A('sale', 'ramona', 'pool', 'Sale-Schild', 'ab-sale', [
    { target: 'point', range: 3, r: 2, ms: 60_000, stop: 4000, every: 15_000, max: 1, cd: 30_000 }, { ms: 120_000, stop: 6000 }, { max: 2 },
  ], [
    'Schild an einen Punkt bis 3 Kacheln, 60 s. Jede Wache, die in 2 Kacheln vorbeikommt, bleibt 4 s davor stehen, jede höchstens alle 15 s. Abklingzeit 30 s.',
    'Das Schild steht 120 s, Wachen staunen 6 s.',
    '2 Schilder gleichzeitig. Alles muss raus.',
  ]),
  A('feierabend', 'ramona', 'pool', '„Feierabend!“', 'ab-feierabend', [
    { target: 'enemy', range: 1.2, charges: 1, cd: 0 }, { charges: 2 }, { buddy: 4 },
  ], [
    'Eine normale Wache direkt neben dir kündigt, packt ihren Karton und ist für die Mission weg. Nicht bei Stefan, Goebbels, Himmler, Rangern und Drohnen. 1× pro Mission.',
    '2× pro Mission.',
    'Sie nimmt einen normalen Kollegen in 4 Kacheln gleich mit.',
  ]),
  // ---------- v13: Moshe Hillel (Spec v13 §2), Quest-Charakter ohne Rüther-Eintrag. Ids kollidieren nicht mit Event-Typen
  // ('video' ist der Fangszenen-Event, daher neuesvideo). special 0.5: Stefan, Goebbels, Himmler, Ranger, Moshe, Berater halb so lang ----------
  A('buch', 'moshe', 'fixed', 'Der Investment-Code', 'ab-buch', [
    { target: 'enemy', range: 2, ms: 8000, cd: 20_000, special: 0.5 }, { ms: 12_000 }, { spread: 2 },
  ], [
    'Drückt einer Wache bis 2 Kacheln das Buch in die Hand. Sie liest 8 s und sieht nichts. Abklingzeit 20 s.',
    'Sie liest 12 s. Kapitel 2: „Wie ein Kredit wirklich funktioniert.“',
    'Sie empfiehlt es weiter: Die nächste Wache in 2 Kacheln liest mit.',
  ]),
  A('neuesvideo', 'moshe', 'fixed', 'Sein neues Video', 'ab-neuesvideo', [
    { target: 'self', r: 6, ms: 10_000, cd: 30_000, special: 0.5 }, { ms: 14_000, r: 7 }, { finger: 5000 },
  ], [
    'Moshe hält das Handy hoch: Alle Wachen in 6 Kacheln schauen 10 s sein neues Video. Spezialgegner halb so lang. Abklingzeit 30 s.',
    '14 s und 7 Kacheln. Der Algorithmus liebt ihn.',
    'Sechs Finger: Nach dem Video sind sie 5 s verwirrt und sehen nichts.',
  ]),
  A('schlange', 'moshe', 'pool', '12 Personen bestellen gerade', 'ab-schlange', [
    { target: 'point', range: 6, r: 6, ms: 10_000, cd: 30_000, special: 0.5 }, { ms: 14_000 }, { block: 8000 },
  ], [
    'Stellt an einem Punkt bis 6 Kacheln eine Schlange aus Käufern auf. Ruhige Wachen in 6 Kacheln regeln 10 s den Andrang. Abklingzeit 30 s.',
    '14 s. „Noch 12 Personen vor Ihnen.“',
    'Die Schlange steht im Gang: 8 s lang kommt keine Wache durch.',
  ]),
  A('zinseszins', 'moshe', 'pool', 'Der Zinseszins', 'ab-zinseszins', [
    { target: 'self', ms: 20_000, times: 1, cd: 40_000 }, { ms: 15_000 }, { times: 2 },
  ], [
    'Das achte Weltwunder: Beute, die Moshe 20 s lang trägt, verdoppelt sich einmal. Länger tragen, mehr Risiko. Abklingzeit 40 s.',
    'Schon nach 15 s. Der Markt läuft.',
    'Verdoppelt sich zweimal: nach weiteren 15 s noch einmal.',
  ]),
  A('geschenk', 'moshe', 'pool', 'Premium-Geschenk: Immobilien', 'ab-geschenk', [
    { target: 'enemy', range: 6, ms: 20_000, cd: 30_000, special: 0.5 }, { ms: 30_000 }, { family: 3 },
  ], [
    'Eine Wache bis 6 Kacheln gewinnt ein Reihenhaus in Limassol (0,00 € statt 4,95 €). Sie läuft zum Tor und schaut es 20 s an. Abklingzeit 30 s.',
    '30 s. Mit Blick aufs Meer, sagt der Prospekt.',
    'Sie bringt die Familie mit: Die nächste Wache in 3 Kacheln kommt mit zur Besichtigung.',
  ]),
].map(a => [a.id, a]));

const byUnit = kind => {
  const out = {};
  for (const a of Object.values(ABILITIES)) if (a.kind === kind) (out[a.unit] ||= []).push(a.id);
  return out;
};
export const FIXED = byUnit('fixed'), POOLS = byUnit('pool');

// Werte bis einschließlich Stufe level (1–3, außerhalb geklemmt); null für unbekannte id
export function params(id, level = 1) {
  const a = ABILITIES[id];
  if (!a) return null;
  const n = Math.min(3, Math.max(1, Math.floor(level) || 1));
  return Object.assign({}, ...a.stages.slice(0, n));
}
