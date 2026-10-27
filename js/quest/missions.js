// Haunebu-Quests: Missionen, Karten (Layouts) und Varianten (Spec §5.2, v9 §2). Daten plus reiner Aufbau je Start.
// Karten-Zeichen: # Wand, . Boden, D Tür offen, L verschlossene Tür (Plus 70 Prozent), P Plattform (Start/Ziel),
// C Tresor, S Sabotageziel, X Missionsobjekt, K Stecker, ~ Deckung (Eis/Kisten/Zelte/Reben/Schilf: begehbar, blockiert Sicht),
// V Wasseranschluss (Ziel, nicht begehbar, von nebenan), B Baum zum Anzünden (Ziel, blockiert Weg und Sicht),
// W Wasser (nicht begehbar, Sicht frei; Stege sind Boden, der ins Wasser ragt), T Baum/Hecke/feste Deko (blockiert Weg und Sicht).
// Mission: { …, timeMs (null = keine Zeitgrenze), solo?, layouts:[{ id, name, map, gate:[x,y], coins?, variants }] }.
// Variante: enemies [{ type, at:[x,y], dir (Grad, 0 = Osten, 90 = Süden), patrol:[[x,y,warteMs?,blickGrad?]…], look:[Grad…] }],
// patch [[x,y,Zeichen]…] verschiebt Beute/Ziele, coins {'x,y': n} überschreibt die Münzen je Tresor (Layout-Koordinaten).
import { ARENA_BY_ID } from '../data.js';

export const MISSIONS = [
  {
    id: 'tachionenraub', name: 'Der Tachionenraub', place: 'Neuschwabenland, unter dem Eis', theme: 'neuschwabenland',
    lat: -72.0, lon: 5.0, timeMs: 360_000, reinforce: 'pinguin',
    objective: { type: 'steal', min: 3, label: 'Tachionenbitcoins entführen' },
    intro: 'Unter dem Eis horten Hitlers Restposten die Tachionenbitcoins. Die Münzen sind schneller als das Licht, aber nicht schneller als Christian beim Kaufen. Klaut so viele wie möglich und bringt sie zur Haunebu.',
    hint: 'Klauen dauert 3 s pro Münze, jeder trägt höchstens 2. Ab 3 abgelieferten Münzen dürft ihr abheben.',
    texts: {
      success: 'Die Haunebu hebt ab, schwer beladen. Der Kurs steigt um 70 Prozent, bevor ihr überhaupt landet.',
      fail: 'Die Münzen bleiben im Eis. Christian kauft sie später teurer.',
    },
    layouts: [
      {
        id: 'tresor', name: 'Tresor-Ebene', gate: [19, 6], coins: 2,
        map: [
          '################################',
          '#~~....#.C......C.#..C......C.~#',
          '#~.....L..........#............#',
          '#......#....~~....#....~~......#',
          '#......#..........#............#',
          '#......#########D######D####L###',
          '#~.....#................#......#',
          '#......#..~~........~~..#....C.#',
          '#......#...#........#...#......#',
          '#..PPP.#.......~~.......#..~~..#',
          '#..PPP.D.......~~.......D......#',
          '#..PPP.#.......~~.......#..~~..#',
          '#......#...#........#...#......#',
          '#......#..~~........~~..#....C.#',
          '#~.....#................#......#',
          '#......########D###########L####',
          '#......#...........#...........#',
          '#......#..~~.......#..C.....~~.#',
          '#......D...........D...........#',
          '#~.....#.......~~..#.....~~..C.#',
          '#~~....#...........#...........#',
          '################################',
        ],
        variants: [
          {
            id: 'schicht', name: 'Schichtwechsel', desc: 'Die Pinguine wechseln die Schicht. Himmler zählt im Südgang Schritte.',
            coins: { '29,13': 0, '22,17': 3 },
            enemies: [
              { type: 'pinguin', at: [9, 6], dir: 0, patrol: [[9, 6, 1000], [22, 6], [22, 14, 1000], [9, 14]] },
              { type: 'pinguin', at: [20, 3], dir: 0, patrol: [[20, 3, 1500, 0], [29, 3, 1500, 180]] },
              { type: 'pinguin', at: [12, 2], dir: 90, look: [90, 0, 180] },
              { type: 'drohne', at: [26, 7], dir: 90, patrol: [[26, 7, 800], [26, 13, 800]] },
              { type: 'himmler', at: [13, 18], dir: 0, look: [0, 180] },
              { type: 'pinguin', at: [21, 19], dir: 0, patrol: [[21, 19, 1200], [27, 17, 1200]] },
            ],
          },
          {
            id: 'inventur', name: 'Inventur', desc: 'Himmler macht mitten in der Halle Inventur, Goebbels übt im Südgang mit dem Megafon.',
            coins: { '9,1': 3, '16,1': 3, '21,1': 0, '22,17': 3, '29,19': 0 },
            enemies: [
              { type: 'himmler', at: [13, 10], dir: 0, look: [0, 90, 180, 270] },
              { type: 'goebbels', at: [9, 18], dir: 0, patrol: [[9, 18, 1500, 0], [18, 18, 1500, 180]] },
              { type: 'drohne', at: [9, 7], dir: 0, patrol: [[9, 7], [22, 7], [22, 13], [9, 13]] },
              { type: 'pinguin', at: [26, 8], dir: 0, patrol: [[26, 8, 2000, 0], [29, 10], [26, 12, 2000, 0]] },
              { type: 'pinguin', at: [24, 2], dir: 90, look: [90, 180, 0] },
              { type: 'pinguin', at: [25, 19], dir: 180, patrol: [[25, 19, 1000], [21, 16, 1000]] },
            ],
          },
          {
            id: 'drohnen', name: 'Drohnenschwarm', desc: 'Die Tachionen-Drohnen schieben Überstunden. In den Tresoren am Ende der Halle liegt der Jackpot.',
            coins: { '9,1': 1, '16,1': 1, '21,1': 1, '28,1': 1, '29,7': 4, '29,13': 4, '22,17': 1, '29,19': 1 },
            enemies: [
              { type: 'drohne', at: [10, 6], dir: 0, patrol: [[10, 6, 500], [21, 6, 500]] },
              { type: 'drohne', at: [21, 14], dir: 180, patrol: [[21, 14, 500], [10, 14, 500]] },
              { type: 'drohne', at: [27, 10], dir: 180, patrol: [[27, 10, 1500, 180], [29, 10, 1500, 0]] },
              { type: 'pinguin', at: [10, 3], dir: 0, patrol: [[10, 3, 1000], [16, 3, 1000]] },
              { type: 'pinguin', at: [26, 3], dir: 180, look: [180, 90] },
              { type: 'pinguin', at: [9, 17], dir: 0, patrol: [[9, 17], [17, 17], [17, 19], [9, 19]] },
            ],
          },
        ],
      },
      {
        id: 'eisdom', name: 'Eisdom', gate: [29, 12], coins: 2,
        map: [
          '################################',
          '#C.......#..C...#.....C.#....C.#',
          '#........D.....~D..~....D......#',
          '#........#......#.......#.~~...#',
          '#.~~.....##########L#######D####',
          '#........#...........#.........#',
          '#....~~..#.~~......~.#..~~.....#',
          '#........#.....##....#.........#',
          '#........D....C##....#........C#',
          '#.~......#.....##C...D.........#',
          '#........#.....##....#.....~~..#',
          '#.....~..#.~~........#.........#',
          '#.~~.....#........~~.#..~......#',
          '#........#...........#.........#',
          '####D########L#####D######D#####',
          '#......~.#.....................#',
          '#.PPP....#..............~~.....#',
          '#.PPP....D..~~.................#',
          '#.PPP....#..........C..........#',
          '#........#.....~~..........~...#',
          '#~.......#....................C#',
          '################################',
        ],
        variants: [
          {
            id: 'kaeltewelle', name: 'Kältewelle', desc: 'Die Heizung im Eisdom ist ausgefallen. Die Pinguine laufen Runden, damit ihnen warm bleibt. Himmler zählt in der Südhalle Eiszapfen.',
            enemies: [
              { type: 'pinguin', at: [11, 5], dir: 0, patrol: [[11, 5], [20, 5], [20, 12], [11, 12]] },
              { type: 'pinguin', at: [12, 16], dir: 0, patrol: [[12, 16, 1500, 0], [28, 16, 1500, 180]] },
              { type: 'drohne', at: [23, 6], dir: 0, patrol: [[23, 6, 800], [29, 6], [29, 12, 800], [23, 12]] },
              { type: 'pinguin', at: [10, 2], dir: 0, patrol: [[10, 2, 1500, 0], [30, 2, 1500, 180]] },
              { type: 'himmler', at: [23, 19], dir: 180, look: [180, 270, 0] },
              { type: 'pinguin', at: [5, 3], dir: 90, look: [90, 180, 0] },
            ],
          },
          {
            id: 'goldrausch', name: 'Goldrausch', desc: 'An der Tresorsäule im Dom liegt der Jackpot. Goebbels hält ihr eine Rede, zwei Drohnen kreisen.',
            coins: { '14,8': 4, '17,9': 4, '1,1': 1, '30,20': 1 },
            enemies: [
              { type: 'goebbels', at: [12, 9], dir: 0, look: [0, 90, 270] },
              { type: 'drohne', at: [10, 5], dir: 0, patrol: [[10, 5], [20, 5], [20, 13], [10, 13]] },
              { type: 'drohne', at: [29, 20], dir: 180, patrol: [[10, 15], [29, 15], [29, 20], [10, 20]] },
              { type: 'pinguin', at: [30, 2], dir: 180, patrol: [[30, 2, 1000, 180], [10, 2, 1000, 0]] },
              { type: 'pinguin', at: [26, 8], dir: 180, look: [180, 0, 90] },
              { type: 'pinguin', at: [2, 2], dir: 90, patrol: [[2, 2, 1200], [7, 11, 1200]] },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'hangar', name: 'Hangar-Sabotage', place: 'Neuschwabenland, Hangar', theme: 'hangar',
    lat: -71.6, lon: 4.2, timeMs: 360_000, reinforce: 'pinguin',
    objective: { type: 'sabotage', label: 'Ersatz-Flugscheiben sabotieren' },
    intro: 'Im Hangar stehen vier Ersatz-Flugscheiben. Ohne die kann Hitler dir die Haunebu nie wieder streitig machen. Micha sagt: Kondensator raus, Dosenbier in den Tank, fertig.',
    hint: 'Sabotage dauert 4 s je Flugscheibe. Danach alle, die noch stehen, auf die Plattform und abheben.',
    texts: {
      success: 'Vier Flugscheiben mit Dosenbier im Tank. Die heben nie wieder ab.',
      fail: 'Die Ersatz-Flugscheiben glänzen weiter. Hitler poliert schon.',
    },
    layouts: [
      {
        id: 'halle', name: 'Haupthalle', gate: [29, 20],
        map: [
          '################################',
          '#.....#.........~~.........#...#',
          '#.PPP.#....................L...#',
          '#.PPP.#...S............S...#.~.#',
          '#.PPP.#....................#...#',
          '#.....#..~~...######...~~..##D##',
          '#~....#.......######.......#...#',
          '#~~...#.......######.......#...#',
          '#.....D..~~...######...~~..#...#',
          '#.....#....................#...#',
          '#.....#...S............S...#...#',
          '#.....#....................#...#',
          '#.....###########L#####D####...#',
          '#.....#....................#...#',
          '#.....#..##....~~....##....#...#',
          '#~....#..##..........##....#...#',
          '#~~...#....................D...#',
          '#.....D....~~......~~......#...#',
          '#.....#..##..........##....#...#',
          '#.....#..##....~~....##....#...#',
          '#.....#....................#...#',
          '################################',
        ],
        variants: [
          {
            id: 'nacht', name: 'Nachtschicht', desc: 'Zwei Pinguine in der Halle, eine Drohne in der Werkstatt, Goebbels bewacht den Werkstatt-Ausgang.',
            enemies: [
              { type: 'pinguin', at: [8, 1], dir: 0, patrol: [[8, 1, 1000], [25, 1, 1000]] },
              { type: 'pinguin', at: [12, 9], dir: 0, patrol: [[12, 9, 1500], [21, 9, 1500]] },
              { type: 'drohne', at: [10, 16], dir: 0, patrol: [[9, 16, 600], [25, 16, 600]] },
              { type: 'goebbels', at: [24, 14], dir: 180, look: [180, 90] },
              { type: 'pinguin', at: [29, 8], dir: 90, patrol: [[29, 8, 1500], [29, 18, 1500]] },
            ],
          },
          {
            id: 'leitstand', name: 'Leitstand-Prototyp', desc: 'Eine Flugscheibe steht im Leitstand. Himmler passt auf sie auf, mit Klemmbrett.',
            patch: [[23, 3, '.'], [29, 2, 'S']],
            enemies: [
              { type: 'himmler', at: [28, 1], dir: 90, look: [90, 0] },
              { type: 'pinguin', at: [10, 6], dir: 90, patrol: [[10, 6, 1000], [10, 11, 1000]] },
              { type: 'pinguin', at: [21, 1], dir: 90, patrol: [[21, 1, 800], [21, 11, 800]] },
              { type: 'drohne', at: [29, 7], dir: 90, patrol: [[29, 7, 1000], [29, 19, 1000]] },
              { type: 'pinguin', at: [8, 17], dir: 0, patrol: [[8, 17, 1000], [25, 17, 1000]] },
              { type: 'goebbels', at: [16, 10], dir: 90, look: [90, 0, 180] },
            ],
          },
          {
            id: 'werkstatt', name: 'Werkstatt-Chaos', desc: 'Eine Flugscheibe steht zur Reparatur mitten in der Werkstatt. Eine Drohne kreist drumherum.',
            patch: [[10, 10, '.'], [17, 16, 'S']],
            enemies: [
              { type: 'pinguin', at: [9, 2], dir: 0, patrol: [[9, 2, 1000], [24, 2, 1000]] },
              { type: 'pinguin', at: [25, 9], dir: 180, look: [180, 270] },
              { type: 'drohne', at: [12, 14], dir: 0, patrol: [[12, 14], [20, 14], [20, 19], [12, 19]] },
              { type: 'himmler', at: [17, 18], dir: 270, look: [270, 0, 180] },
              { type: 'pinguin', at: [29, 12], dir: 90, look: [90, 270] },
            ],
          },
        ],
      },
      {
        id: 'startbahn', name: 'Startbahn', gate: [2, 10],
        map: [
          '################################',
          '#~~.......#.~~.......#.~.......#',
          '#.........#..........#.........#',
          '#...S.....#..........D.....S...#',
          '#.........#.....S....#.........#',
          '#.........L..........#.........#',
          '#......~..#.......~~.#.......~.#',
          '#.........#..........#.........#',
          '#####D#########D###L######D#####',
          '#..............................#',
          '#.......~~...........~~........#',
          '#.............~............~...#',
          '#..............................#',
          '####D#############D########L####',
          '#............#.........#.......#',
          '#........~...#.~.~.....D.......#',
          '#............#......~..#.......#',
          '#.....S......L.........#...PPP.#',
          '#............#.~.~.....#...PPP.#',
          '#.~~......~..#.........#...PPP.#',
          '#............D.........#.......#',
          '################################',
        ],
        variants: [
          {
            id: 'rollfeld', name: 'Rollfeld-Kontrolle', desc: 'Eine Drohne fliegt die Startbahn ab, Pinguine schieben Wache in den Boxen. Goebbels probt im Tanklager die Durchsage.',
            enemies: [
              { type: 'drohne', at: [2, 10], dir: 0, patrol: [[2, 10, 800], [29, 10, 800]] },
              { type: 'pinguin', at: [7, 3], dir: 180, look: [180, 90] },
              { type: 'pinguin', at: [12, 3], dir: 0, patrol: [[12, 3, 1200], [28, 4, 1200]] },
              { type: 'goebbels', at: [18, 17], dir: 90, look: [90, 180, 0] },
              { type: 'pinguin', at: [2, 15], dir: 0, patrol: [[2, 15, 1500], [11, 15, 1500], [11, 19], [2, 19]] },
              { type: 'pinguin', at: [3, 12], dir: 90, patrol: [[3, 12, 2000, 90], [25, 12, 2000, 90]] },
            ],
          },
          {
            id: 'startfreigabe', name: 'Startfreigabe', desc: 'Eine Flugscheibe steht schon auf der Startbahn, eine wird im Tanklager betankt. Himmler hakt die Startliste ab.',
            patch: [[16, 4, '.'], [16, 10, 'S'], [6, 17, '.'], [19, 17, 'S']],
            enemies: [
              { type: 'himmler', at: [17, 12], dir: 270, look: [270, 0, 180] },
              { type: 'drohne', at: [1, 9], dir: 0, patrol: [[1, 9], [30, 9], [30, 12], [1, 12]] },
              { type: 'pinguin', at: [14, 14], dir: 0, patrol: [[14, 14, 1000], [22, 19, 1000]] },
              { type: 'pinguin', at: [13, 6], dir: 0, look: [0, 90] },
              { type: 'pinguin', at: [22, 2], dir: 0, patrol: [[22, 2, 1000], [30, 7, 1000]] },
              { type: 'pinguin', at: [3, 15], dir: 0, look: [0, 90] },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'ps3', name: 'Michas PS3', place: 'PC Sale in Hagen', theme: 'pcsale',
    lat: ARENA_BY_ID.pcsale.lat, lon: ARENA_BY_ID.pcsale.lon, timeMs: 300_000, reinforce: 'detektiv',
    fetchMs: 5000, pickupNoise: 7,
    objective: { type: 'fetch', label: 'Michas PS3 befreien' },
    intro: 'Der Ladendetektiv hat Michas PS3 im Lager eingeschlossen. Angeblich „Fundsache“. Holt sie raus und bringt sie zur Haunebu auf dem Parkplatz.',
    hint: 'Aufheben dauert 5 s, die Warensicherung piept dabei. Wer die PS3 trägt, ist 40 % langsamer und kann keine Fähigkeiten einsetzen.',
    texts: {
      success: 'Die PS3 ist frei. Micha baut sie noch im Flug zur Hardware-Wallet um.',
      fail: 'Die PS3 bleibt im Regal. Neues Preisschild: plus 70 Prozent.',
    },
    layouts: [
      {
        id: 'lager', name: 'Hinterlager', gate: [28, 17],
        map: [
          '##############################',
          '#~......................#....#',
          '#..####..####..####..~..#..X.#',
          '#.......................#.~..#',
          '#..####..####..####..~..#....#',
          '#~......................D..~.#',
          '#.........~~............#....#',
          '######D###################L###',
          '#.................#..........#',
          '#.#####...#####...#.##....~~.#',
          '#.................#..........#',
          '#.#####...#####...L....##....#',
          '#.................#..........#',
          '#...##.......~~...#.~~....##.#',
          '#.................#..........#',
          '#~...............~#..........#',
          '######D######D##########D#####',
          '#............................#',
          '#..PPP.....~~......~~........#',
          '#..PPP.....~~......~~........#',
          '#..PPP.......................#',
          '##############################',
        ],
        variants: [
          {
            id: 'ladenschluss', name: 'Ladenschluss', desc: 'Vier Detektive drehen ihre letzte Runde. Die PS3 liegt in der Gitterbox.',
            enemies: [
              { type: 'detektiv', at: [1, 10], dir: 0, patrol: [[1, 10, 1000], [17, 10, 1000]] },
              { type: 'detektiv', at: [1, 3], dir: 0, patrol: [[1, 3, 1500], [23, 3, 1500]] },
              { type: 'detektiv', at: [26, 12], dir: 180, look: [180, 270, 90] },
              { type: 'detektiv', at: [17, 14], dir: 180, patrol: [[17, 14, 1200], [1, 14, 1200]] },
            ],
          },
          {
            id: 'sommer', name: 'Sommerschlussverkauf', desc: 'Die PS3 liegt mitten im Lager. Himmler sitzt an der Kasse und zählt Wechselgeld.',
            patch: [[27, 2, '.'], [22, 6, 'X']],
            enemies: [
              { type: 'himmler', at: [4, 14], dir: 270, look: [270, 0] },
              { type: 'detektiv', at: [8, 8], dir: 0, patrol: [[1, 8, 800], [17, 8, 800], [17, 12, 800], [1, 12, 800]] },
              { type: 'detektiv', at: [12, 1], dir: 0, patrol: [[1, 1, 1000], [23, 1, 1000]] },
              { type: 'detektiv', at: [16, 5], dir: 180, patrol: [[23, 5, 1500], [8, 5, 1500]] },
              { type: 'detektiv', at: [24, 14], dir: 270, look: [270, 180] },
            ],
          },
          {
            id: 'chef', name: 'Chef im Büro', desc: 'Der Chef-Detektiv bewacht die Gitterbox persönlich. Im Büro wird Kaffee getrunken.',
            patch: [[27, 2, '.'], [25, 6, 'X']],
            enemies: [
              { type: 'detektiv', at: [27, 4], dir: 180, look: [180, 90, 270] },
              { type: 'detektiv', at: [20, 8], dir: 0, patrol: [[20, 8, 1500], [28, 8, 800], [28, 15, 1500], [20, 15, 800]] },
              { type: 'detektiv', at: [23, 12], dir: 180, look: [180, 0] },
              { type: 'detektiv', at: [2, 6], dir: 0, patrol: [[2, 6, 1000], [20, 6, 1000]] },
              { type: 'detektiv', at: [8, 12], dir: 0, patrol: [[8, 12, 800], [17, 12, 800]] },
            ],
          },
        ],
      },
      {
        id: 'laden', name: 'Verkaufsraum', gate: [27, 19],
        map: [
          '################################',
          '#.......#~~..........~.#.......#',
          '#.~~....#..............#.~~....#',
          '#.......#..#..#..#..#..L....X..#',
          '#.......D..#..#..#..#..#.......#',
          '#.~~....#..#..#..#..#..#.......#',
          '#.......#..#..#..#..#..#.~~.~~.#',
          '#.....~.#..#..#..#..#..#.......#',
          '#.......#..#..#..#..#..#.......#',
          '#..PPP..#.........~....#.....~.#',
          '#..PPP..#...~..........#.~.....#',
          '#..PPP..#..............D.......#',
          '#.......#..#..#..#..#..#.......#',
          '#.......#..#..#..#..#..####L####',
          '#....~~.#..#..#..#..#..#.......#',
          '#.......#..#..#..#..#..#.~~....#',
          '#.......D..#..#..#..#..#.....~.#',
          '#.......#..#..#..#..#..D.......#',
          '#.~~....#..#..#..#..#..#.......#',
          '#.......#..............#.~.....#',
          '#.......#......~~......#.......#',
          '################################',
        ],
        variants: [
          {
            id: 'kassensturz', name: 'Kassensturz', desc: 'Kurz vor Ladenschluss laufen drei Detektive Streife durch die Regalgänge. Der vierte zählt im Lager die Konsolen, zweimal.',
            enemies: [
              { type: 'detektiv', at: [12, 1], dir: 90, patrol: [[12, 1, 1000], [12, 20, 1000]] },
              { type: 'detektiv', at: [9, 10], dir: 0, patrol: [[9, 10, 1500, 0], [22, 10, 1500, 180]] },
              { type: 'detektiv', at: [19, 20], dir: 270, patrol: [[19, 20, 1000], [19, 1, 1000]] },
              { type: 'detektiv', at: [26, 4], dir: 0, look: [0, 90, 180] },
              { type: 'detektiv', at: [24, 14], dir: 45, patrol: [[24, 14, 1500], [30, 20, 1500]] },
            ],
          },
          {
            id: 'asservaten', name: 'Asservatenkammer', desc: 'Die PS3 liegt als „Beweisstück“ im Büro. Der Chef-Detektiv bewacht sie mit einem Mettbrötchen, Himmler hilft an der Kasse aus.',
            patch: [[28, 3, '.'], [29, 19, 'X']],
            enemies: [
              { type: 'detektiv', at: [26, 18], dir: 0, look: [0, 270, 90] },
              { type: 'himmler', at: [10, 2], dir: 0, look: [0, 90] },
              { type: 'detektiv', at: [9, 9], dir: 0, patrol: [[9, 9], [22, 9], [22, 11], [9, 11]] },
              { type: 'detektiv', at: [24, 1], dir: 45, patrol: [[24, 1, 1000], [30, 12, 1000]] },
              { type: 'detektiv', at: [15, 19], dir: 270, patrol: [[15, 19, 800], [15, 1, 800], [21, 1, 800], [21, 20, 800]] },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'keller', name: 'Kalter Keller', place: 'Keller der Rütherschanze', theme: 'keller',
    lat: ARENA_BY_ID.keller.lat, lon: ARENA_BY_ID.keller.lon, timeMs: 300_000, reinforce: 'pinguin',
    objective: { type: 'unplug', label: 'Bitcoin-Heizung abschalten' },
    intro: 'Die Bitcoin-Heizung läuft heiß. Im Keller hat es 38 Grad, die Wachpinguine schwitzen. Zieht den Stecker und verschwindet unentdeckt, sonst zahlt Hildegard wieder die Stromrechnung.',
    hint: 'Den Stecker ziehen dauert 4 s. Danach alle zurück in den Garten auf die Plattform. Ohne Alarm gibt es einen Bonus.',
    texts: {
      success: 'Stecker raus, Ruhe im Keller. Die Pinguine bedanken sich mit einem Fisch.',
      fail: 'Die Heizung brummt weiter. 3000 Watt, auf Hildegards Rechnung.',
    },
    layouts: [
      {
        id: 'flur', name: 'Heizungsflur', gate: [27, 2],
        map: [
          '##############################',
          '#.PPP......~~........~~......#',
          '#.PPP........................#',
          '#.PPP......~~........~~......#',
          '######D#######################',
          '#............................#',
          '#...~~..............~~.......#',
          '#............................#',
          '####D########D#########L######',
          '#........#........#..........#',
          '#.~~..~~.#.##..##.#.~~.......#',
          '#........L........L..........#',
          '#.~~..~~.#.~~.....#...####..K#',
          '#........#........#...####...#',
          '#.~~..~~.#.##..##.#.~~.......#',
          '#........####D#####..........#',
          '#........#........#####D######',
          '#........#.#.#.#..#..........#',
          '#........D........D.~~.~~.~~.#',
          '#.~~..~~.#.#.#.#..#..........#',
          '#........#........#.~~.~~.~~.#',
          '##############################',
        ],
        variants: [
          {
            id: 'sauna', name: 'Sauna-Betrieb', desc: 'Die Pinguine schwitzen. Einer bewacht die Heizung, eine Drohne kühlt die Mining-Rigs.',
            enemies: [
              { type: 'pinguin', at: [14, 6], dir: 0, patrol: [[27, 6, 1000], [2, 6, 1000]] },
              { type: 'pinguin', at: [26, 14], dir: 270, look: [270, 180] },
              { type: 'drohne', at: [19, 17], dir: 0, patrol: [[19, 17, 1000], [28, 17, 1000]] },
              { type: 'pinguin', at: [11, 9], dir: 0, patrol: [[11, 9, 800], [17, 9, 800]] },
            ],
          },
          {
            id: 'wartung', name: 'Drohnen-Wartung', desc: 'Zwei Drohnen kreisen durch Flur und Heizungsraum. Ein Pinguin steht direkt am Stecker.',
            enemies: [
              { type: 'drohne', at: [20, 5], dir: 0, patrol: [[2, 5], [27, 5], [27, 7], [2, 7]] },
              { type: 'drohne', at: [24, 9], dir: 0, patrol: [[19, 9, 800], [28, 9, 800]] },
              { type: 'pinguin', at: [27, 13], dir: 180, look: [180, 270] },
              { type: 'pinguin', at: [10, 16], dir: 0, patrol: [[10, 16], [17, 16], [17, 20], [10, 20]] },
            ],
          },
          {
            id: 'hausbesuch', name: 'Hausbesuch', desc: 'Goebbels und Himmler wärmen sich an der Bitcoin-Heizung die Füße.',
            enemies: [
              { type: 'goebbels', at: [20, 13], dir: 0, look: [0, 90, 270] },
              { type: 'himmler', at: [26, 10], dir: 90, look: [90, 180] },
              { type: 'pinguin', at: [14, 7], dir: 0, patrol: [[28, 7, 1500], [1, 7, 1500]] },
              { type: 'pinguin', at: [2, 9], dir: 90, patrol: [[2, 9], [7, 9], [7, 20], [2, 20]] },
              { type: 'drohne', at: [11, 9], dir: 0, patrol: [[11, 9], [16, 9], [16, 13], [11, 13]] },
              { type: 'pinguin', at: [19, 19], dir: 0, patrol: [[19, 19, 1000], [28, 19, 1000]] },
            ],
          },
        ],
      },
      {
        id: 'gewoelbe', name: 'Gewölbekeller', gate: [26, 11],
        map: [
          '################################',
          '#.........#~..........#........#',
          '#.~~..~~..#...........#.~~.....#',
          '#.........#..###D###..#......K.#',
          '#.........D..#.....#..#........#',
          '#...~.....#..#~.~.~#..#........#',
          '#.........#..#.....L..#.~......#',
          '#.........#..#.....#..#.....~~.#',
          '#.~.......#..D.~.~.#..#........#',
          '#.........#..#.....#..#........#',
          '#......~~.#..#######..L........#',
          '#.........#.~.......~.#........#',
          '#.........#...........#........#',
          '######D#########D#########D#####',
          '#.........#..........#.........#',
          '#.......~.#.~~.......#.~.~.~.~.#',
          '#..PPP....#......~~..#.........#',
          '#..PPP....L..........D.........#',
          '#..PPP....#..........#.~.~.~.~.#',
          '#.........#..~.....~.#.........#',
          '#~........#..........#.........#',
          '################################',
        ],
        variants: [
          {
            id: 'kohle', name: 'Kohlenschicht', desc: 'Die Pinguine schippen Kohle für die Bitcoin-Heizung, eine Drohne kühlt die Rigs. Im Heizungsraum schwitzt ein Pinguin mit Stirnband.',
            enemies: [
              { type: 'pinguin', at: [11, 14], dir: 0, patrol: [[11, 14, 1000], [20, 14, 1000]] },
              { type: 'drohne', at: [22, 14], dir: 0, patrol: [[22, 14], [30, 14], [30, 20], [22, 20]] },
              { type: 'pinguin', at: [27, 5], dir: 0, look: [0, 180, 270] },
              { type: 'pinguin', at: [11, 1], dir: 0, patrol: [[11, 1], [21, 1], [21, 12], [11, 12]] },
              { type: 'pinguin', at: [2, 1], dir: 0, patrol: [[2, 1, 1500], [8, 1, 1500]] },
            ],
          },
          {
            id: 'weinprobe', name: 'Weinprobe', desc: 'Goebbels und Himmler probieren im Weinkeller den Hauswein. Die Heizung hängt heute im Mining-Raum, die Pinguine sind beschwipst, die Drohne nicht.',
            patch: [[29, 3, '.'], [29, 19, 'K']],
            enemies: [
              { type: 'goebbels', at: [16, 6], dir: 90, look: [90, 0, 180] },
              { type: 'himmler', at: [15, 9], dir: 270, look: [270, 0] },
              { type: 'drohne', at: [21, 12], dir: 180, patrol: [[11, 1], [21, 1], [21, 12], [11, 12]] },
              { type: 'pinguin', at: [22, 16], dir: 0, patrol: [[22, 16, 1200, 0], [30, 16, 1200, 180]] },
              { type: 'pinguin', at: [18, 18], dir: 180, look: [180, 270] },
              { type: 'pinguin', at: [23, 1], dir: 45, patrol: [[23, 1, 1000], [30, 12, 1000]] },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'camping', name: 'Nie wieder duschen', place: 'Campingplatz an der Mosel', theme: 'mosel',
    lat: 50.1447, lon: 7.1667, timeMs: null, solo: 'viktor', reinforce: 'camper',
    objective: { type: 'valve', label: 'Wasseranschlüsse abdrehen' },
    intro: 'Viktor ist mit auf dem Campingplatz an der Mosel, und hier wird jeden Tag geduscht. Viktors Plan ist ungeschlagen logisch: Ohne Wasser keine Dusche. Dreh die 3 Wasseranschlüsse zu und flieg ab. Pass auf Stefan auf, der schleppt jeden zum Kieser-Training.',
    hint: 'Zudrehen dauert 4 s je Anschluss, danach zurück zur Haunebu. Keine Eile. Etwa alle 25 s bleibt Stefan stehen und trinkt seinen Bulletproof Coffee. Dann schaut er nicht hin, danach ist er 10 s schneller und sieht weiter. Jedes Kieser-Training kostet 1.000 Sats Belohnung.',
    texts: {
      success: 'Kein Tropfen mehr auf dem ganzen Platz. Viktor riecht nach Freiheit, der Rest vom Campingplatz auch, nur anders.',
      fail: 'Die Duschen laufen weiter. Viktor muss heute Abend unter die Brause.',
      valve: 'Kein Wasser mehr!',
      kieser: [['bernd', 'Erst Kieser, dann Kaffee!'], ['viktor', 'Ich wollte doch nur nicht duschen …'], ['bernd', 'Danach bin ich so breit, ich pass durch keine Tür mehr!']],
    },
    layouts: [
      {
        id: 'zeltwiese', name: 'Zeltwiese am Steg', gate: [61, 27],
        map: [
          '################################################################',
          '#...........................................#####..............#',
          '#.~~~~~~~.~~~~~~~~~~.~~~~~~~~~~.~~~~~~~~~~.~#...#~~~~.~~....V..#',
          '#...........................................#...#..............#',
          '#.~~~~~.~~~~~~~~~~.~~~~~~~~~~.~~~~~~~~~~.~~~##D##~~.~~~~~~~~~~.#',
          '#..............................................................#',
          '#.~~~~~~~.~~~~~~~~~~.~~~~~~~~~~.~~~~~~~~~~.~~~~~~~~~~.~~~~~~~~.#',
          '#..............................................................#',
          '#.~~~~~.~~~~~~~~~~.~~~~~~~~~~.~~~~~~~~~~.~~~~~~~~~~.~~~~~~~~~~.#',
          '#..............................................................#',
          '#TTTTTTTTTTTTTTT.TTTTTTTTTTTTT..TTTTTTTTTTTTTTTTTTTT.TTTTTTTTTT#',
          '#..........T...................................................#',
          '#.......T..T...............................TT.........##########',
          '#..PPP.....T..####..####..####.............TT.........#.......##',
          '#..PPP.....T..####..####..####........................#.~.....##',
          '#..PPP.....T..~~....~~....~~.....................TT...D.......##',
          '#.......~..T..............................~~..T.......#.....~.##',
          '#..........T..........................................#.......##',
          '#.~~..........~~..####....###D####D###................####D#####',
          '#..........T......####~...#~~~.#~~~..#..T......................#',
          '#..........T......####....#....#.....#..T...###..~...T.........#',
          '#TTTTT.TTTTT.....~........#~...#...~.#..T...###......T.........#',
          '#.........................D....#.....D..T......................#',
          '#............TTTT.TTTTT...#....#.....#..T.......###..T.........#',
          '#......................~~.#..........#..T.......###..T.........#',
          '#.............~~...~~..~~.#.........V#...............T.........#',
          '#.............~~...~~.....#####D######.....~~~~................#',
          '#..............................................................#',
          '#..........T...................................................#',
          '#.~~.......T..~~......~~......~~..........##...##...##...##....#',
          '#.......~..T..~~......~~......~~..........##~..##~..##~..##~...#',
          '#...TT............~~......................##...##...##...##....#',
          '#...TT.....T......~~......~~...................................#',
          '#..........T..............~~.............TTTT.TTTTTTTTT.TTTT.T.#',
          '#......~~..T..~~.................~~.......##...##...##...##....#',
          '#..T..........~~....~~...........~~.......##~..##~..##~..##~...#',
          '#..........T........~~..~~................##...##...##...##....#',
          '#..........T............~~.....................................#',
          '#..............................................................#',
          '#..T..~~...T.....~~....T..........T...~~....T.......~~...T.....#',
          '#..............................................................#',
          '#WWWWWWWWWWWWWWWWWWW..WWWWWWWWWWWWWWWWWWWWWWWWWW..WWWWWWWWWWWWW#',
          '#WWWWWWWWWWWWWWWWWWW..WWWWWWWWWWWWWWWWWWWWWWWWWW..WWWWWWWWWWWWW#',
          '#WWWWWWWWWWWWWWWWWWW..WWWWWWWWWWWWWWWWWWWWWWWWWW..WWWWWWWWWWWWW#',
          '#WWWWWWWWWWWWWWWWWWW..WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW#',
          '#WWWWWWWWWWWWWWWWWWWVWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW#',
          '#WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW#',
          '################################################################',
        ],
        variants: [
          {
            id: 'hauptsaison', name: 'Hauptsaison', desc: 'Der Platz ist voll. Stefan dreht seine große Runde, die Dauercamper grillen, und der Dackel von Parzelle 12 hat den Steg im Blick.',
            enemies: [
              { type: 'bernd', at: [56, 24], dir: 270, patrol: [[56, 24, 2000, 180], [52, 11], [13, 11, 1500, 90], [12, 27], [8, 38, 2000, 0], [36, 38], [39, 28], [52, 27]] },
              { type: 'camper', at: [6, 30], dir: 0, look: [0, 90, 180] },
              { type: 'camper', at: [41, 28], dir: 0, patrol: [[41, 28, 2000, 90], [61, 28, 2000, 90]] },
              { type: 'dackel', at: [13, 28], dir: 0, patrol: [[13, 28], [34, 28], [34, 37], [13, 37]] },
              { type: 'platzwart', at: [27, 24], dir: 0, patrol: [[27, 24, 2000, 270], [36, 24, 2000, 270]] },
              { type: 'camper', at: [20, 5], dir: 0, patrol: [[20, 5, 1500], [58, 5, 1500]] },
              { type: 'dackel', at: [24, 40], dir: 180, look: [180, 270, 0] },
            ],
          },
          {
            id: 'nebensaison', name: 'Nebensaison', desc: 'Ruhiger Platz, aber Stefan läuft andersrum. Die Anschlüsse sind am Damenklo, am Wasserspielplatz und am Bootssteg, der Platzwart hat eine neue Trillerpfeife.',
            patch: [[36, 25, '.'], [20, 45, 'W'], [60, 2, '.'], [27, 25, 'V'], [47, 13, 'V'], [48, 44, 'V']],
            enemies: [
              { type: 'bernd', at: [38, 27], dir: 180, patrol: [[38, 27], [12, 27, 1500, 270], [12, 11], [52, 11, 2000, 90], [57, 20], [58, 38, 1500, 180], [38, 38]] },
              { type: 'platzwart', at: [45, 15], dir: 270, look: [270, 0, 180] },
              { type: 'camper', at: [29, 22], dir: 90, look: [90, 180, 270] },
              { type: 'camper', at: [3, 40], dir: 0, patrol: [[3, 40, 1500], [60, 40, 1500]] },
              { type: 'dackel', at: [41, 32], dir: 0, patrol: [[41, 32], [61, 32], [61, 37], [41, 37]] },
              { type: 'camper', at: [47, 22], dir: 0, look: [0, 90, 180] },
              { type: 'dackel', at: [2, 3], dir: 0, patrol: [[2, 3], [42, 3]] },
            ],
          },
        ],
      },
      {
        id: 'hang', name: 'Am Weinberg-Hang', gate: [19, 1],
        map: [
          '################################################################',
          '#WWWWWW..##########..T.........................................#',
          '#WWWWWW..#.~......#..T..######.#######.........................#',
          '#WWWWWWT.#........D..T..#~.~.~.~.~.~V#...~~......~~............#',
          '#WWWWWW..#......~.#.....#.....#......#...~~......~~......~~....#',
          '#WWWWWW..#........#..T..#.....#......#...................~~....#',
          '#WWWWWW..####D#####..T..D.....#......D.......~~................#',
          '#WWWWWWT.............T..#.....#......#.......~~......~~........#',
          '#WWWWWW.TTTTT.TTTTTT.TT.#~.........~.#...~~..........~~........#',
          '#WWWWWW.................#............#...~~.................~~.#',
          '#WV.....................###D######D###......................~~.#',
          '#WW.........................................~~....~~...........#',
          '#WWWWWW...~~................................~~....~~....~~.....#',
          '#WWWWWW~..~~.......####...####...####...................~~.....#',
          '#WWWWWW............####...####...####..........................#',
          '#WWWWWWT...........~~.....~~.....~~....TTT.TTTTTTTT.TTTTTTT.TTT#',
          '#WWWWWW.....~~.................................................#',
          '#WWWWWW.....~~................................T................#',
          '#WWWWWW.........T....####...####...####....TT..................#',
          '#WWWWWWT....~...T....####...####...####....TT..................#',
          '#WWWWWW.........T....~~.....~~.....~~..........................#',
          '#WWWWWW...TT...................................................#',
          '#WWWWWW~..TT....T...............................TT.............#',
          '#WWWWWW~........T..####...####...####.....~~...................#',
          '#WWWWWW..~~.....T..####...####...####..........................#',
          '#WWWWWW......T..T..~~.....~~.....~~............................#',
          '#WWWWWW........................................................#',
          '#WWWWWWT........T..............................................#',
          '#WWWWWW.........T....####...####...####........................#',
          '#WWWWWW...~~.........####...####...TTTTT.TTTTTTTTTTT.TTTTTTTTTT#',
          '#WWWWWW...~~.........~~.....~~.....T~..........................#',
          '#WWWWWWT...............T...........T.~.~.~.~.~.~.~.~.~.#####.~.#',
          '#WWWWWW......~~....................T.~.~.~.~.~.~.~.~.~.#...#.~.#',
          '#WW..........~~..............~~....T.~.~.~.~.~.~.~.~.~.##D##.~.#',
          '#WW................~~........~~....T...........................#',
          '#WWWWWW............~~..............T.~.~.~.~.~.~.~.~.~.~.~.~.~.#',
          '#WWWWWW~...........................T.~.~.~.~.~.~.~.~.~.~.~.~.~.#',
          '#WWWWWW.................~~...........~.~.~.~.~.~.~.~.~.~.~.~.~.#',
          '#WWWWWWTTTT.TTTT........~~.........T.~.~.~.~.~.~.~.~.~.~.~.~.~.#',
          '#WWWWWW........T..............TT...T...........................#',
          '#WWWWWW..PPP.~.T....~~........TT...T.~.~.~.~.~.~.~.~.~.~.~.~.~.#',
          '#WWWWWW..PPP........~~.....~~......T.~.~.~.~.~.~.~.~.~.~.~.~.~.#',
          '#WWWWWW..PPP...T...........~~......T.~.~.~.~.~.~.~.~.~.~.~.~.~.#',
          '#WWWWWW.~~.....T...................T.~.~.~.~.~.~.~.~.~.~.~.~.~.#',
          '#WWWWWWWWWWWWWWT.................T.............................#',
          '#WWWWWWWWWWWWWWWWWWWWWW............T.~.~.~.~.~.~.~.~.~.~.~.~.V.#',
          '#WWWWWWWWWWWWWWWWWWWWWW............T.~.~.~.~.~.~.~.~.~.~.~.~.~.#',
          '################################################################',
        ],
        variants: [
          {
            id: 'weinlese', name: 'Weinlese', desc: 'Im Weinberg wird gelesen. Stefan joggt mit dem Kaffeebecher seine Runde vom Duschhaus runter bis zu den Reben, der Dackel bewacht den Steg, als wär es seiner.',
            enemies: [
              { type: 'bernd', at: [27, 11], dir: 270, patrol: [[27, 11, 2000, 270], [51, 16], [60, 26, 1500, 180], [52, 30], [52, 39, 2000, 0], [36, 37], [26, 34], [17, 26, 1500, 270], [13, 11]] },
              { type: 'platzwart', at: [13, 7], dir: 90, look: [90, 0, 180] },
              { type: 'camper', at: [12, 23], dir: 0, look: [0, 90, 270] },
              { type: 'camper', at: [19, 16], dir: 0, patrol: [[19, 16, 1500, 0], [40, 16], [40, 26], [19, 26, 1500, 180]] },
              { type: 'dackel', at: [41, 10], dir: 0, patrol: [[41, 10], [61, 10], [61, 2], [41, 2]] },
              { type: 'dackel', at: [8, 11], dir: 180, look: [180, 90, 270] },
              { type: 'camper', at: [38, 44], dir: 0, patrol: [[38, 44, 1500, 0], [60, 44, 1500, 180]] },
            ],
          },
          {
            id: 'weinfest', name: 'Weinfest', desc: 'Weinfest am Ufer: Die Dauercamper schunkeln, der Platzwart hat die Pfeife schon im Mund. Die Anschlüsse hängen heute am Bootssteg, bei den Damenduschen und im Weinbergshäuschen.',
            patch: [[2, 10, 'W'], [2, 33, 'V'], [36, 3, '.'], [25, 3, 'V'], [61, 45, '~'], [58, 32, 'V']],
            enemies: [
              { type: 'bernd', at: [13, 9], dir: 90, patrol: [[13, 9, 1500, 90], [38, 12], [60, 17, 2000, 90], [52, 27], [52, 39], [36, 37], [25, 30], [17, 21, 1500, 180]] },
              { type: 'platzwart', at: [40, 28], dir: 90, look: [90, 180, 0] },
              { type: 'camper', at: [7, 33], dir: 180, look: [180, 270, 90] },
              { type: 'camper', at: [26, 9], dir: 270, patrol: [[26, 9, 1500, 270], [29, 4, 1500, 90]] },
              { type: 'dackel', at: [41, 17], dir: 0, patrol: [[41, 17], [50, 17], [50, 24], [41, 24]] },
              { type: 'dackel', at: [37, 39], dir: 0, patrol: [[37, 39], [61, 39]] },
              { type: 'camper', at: [9, 13], dir: 90, patrol: [[9, 13, 1500], [9, 30, 1500]] },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'bruch', name: 'Feuer im Bruch', place: 'Worringer Bruch', theme: 'bruch',
    lat: 51.0668, lon: 6.8395, timeMs: 360_000, reinforce: 'ranger',
    objective: { type: 'ignite', label: 'Bäume anzünden' },
    intro: 'Im Worringer Bruch stehen drei uralte Bäume, die beim nächsten Sturm auf Ramonas Gartenhaus fallen würden. Sagt jedenfalls Christian. Zündet sie an und verschwindet, bevor die Ranger vom Bruch euch erwischen. Die schreiben nämlich alles auf.',
    hint: 'Anzünden dauert 3 s je Baum. Ein brennender Baum brennt weiter, Ranger in der Nähe bemerken ihn nach 5 s und laufen zum Löschen hin. Berührt euch ein alarmierter Ranger, ist die Mission vorbei und kostet 10.000 Sats Strafe.',
    texts: {
      success: 'Drei Bäume brennen, die Haunebu ist weg, bevor der erste Ranger seinen Block gezückt hat. 6.500 Sats Gefahrenzulage.',
      fail: 'Die Bäume stehen noch. Die Ranger machen Fotos für die Infotafel.',
      caught: 'Das wird teuer!',
      fire: 'Es brennt!',
    },
    layouts: [
      {
        id: 'altarm', name: 'Am Altarm', gate: [41, 4],
        map: [
          '############################################',
          '#........~~........WWWWW...................#',
          '#..T....T....T....~WWWWW...########..~~....#',
          '#.........B....T..~WWWWW~..#.~...T#........#',
          '#.....T.....T.~...~WWWWW~..#......#........#',
          '#.~~.............T.WWWWW...D......#..~~....#',
          '#..........................#......#........#',
          '#..................WWWWW...####D###.....T..#',
          '#.........T.~~.....WWWWW...................#',
          '#TTT.TTT......T...~WWWWW..T......T.........#',
          '#~.....T.~........~WWWWW~....T.......T.....#',
          '#......T...T......~WWWWW~......~~.....~....#',
          '#.PPP..T......~.T.~W...W~...............T..#',
          '#.PPP..............W.B.W~~.T.......T.......#',
          '#.PPP..T..T.~~.........W~.....T..~~........#',
          '#....~.T...........W..~W~..................#',
          '#......T.....T..~.~WWWWW~......######D######',
          '#T.TTTTT..~.......~WWWWW.......#..........##',
          '#........T........~WWWWW..T....#.~........##',
          '#....~~........T..~WWWWW...~...#..WWW.....##',
          '#...T..............WWWWW.......#..WWW~....##',
          '#..............................#..WWW.....##',
          '#..........T.....T.WWWWW....T..L..........##',
          '#.T..........~~....WWWWW~......#......~~..##',
          '#.....T.........~..WWWWW~....~.#~.......B.##',
          '#..~~...~.....T....WWWWW~.T....#..........##',
          '#..................WWWWW.......#############',
          '############################################',
        ],
        variants: [
          {
            id: 'kraniche', name: 'Kranichzählung', desc: 'Die Ranger zählen Kraniche. Einer sitzt am Hochsitz, einer zählt zweimal, damit es stimmt. Die Schutzzone hat ein Gatter, aber das ist abgeschlossen.',
            enemies: [
              { type: 'ranger', at: [25, 6], dir: 180, patrol: [[25, 6, 2000, 180], [25, 12, 1500, 90]] },
              { type: 'ranger', at: [36, 12], dir: 180, look: [180, 90, 0] },
              { type: 'ranger', at: [9, 6], dir: 0, patrol: [[9, 6, 1500, 90], [16, 6], [16, 19], [9, 21, 1500, 270]] },
              { type: 'ranger', at: [12, 21], dir: 0, patrol: [[12, 21, 1500, 0], [28, 21, 1500, 180]] },
              { type: 'ranger', at: [33, 18], dir: 0, patrol: [[33, 18], [40, 18], [40, 22, 1500, 180], [33, 25]] },
            ],
          },
          {
            id: 'uebung', name: 'Löschübung', desc: 'Die Ranger üben mit der Feuerpatsche, ausgerechnet heute. Die alte Eiche ist zu nass, dafür brennen eine Buche am Südweg und die Kiefer am Parkplatz bestimmt gut.',
            patch: [[10, 3, 'T'], [14, 25, 'B'], [40, 24, '~'], [38, 9, 'B']],
            enemies: [
              { type: 'ranger', at: [13, 6], dir: 0, patrol: [[13, 6, 1500, 90], [26, 6, 1500, 90]] },
              { type: 'ranger', at: [36, 9], dir: 180, look: [180, 0] },
              { type: 'ranger', at: [10, 20], dir: 0, patrol: [[10, 20], [17, 20], [17, 24], [10, 24]] },
              { type: 'ranger', at: [25, 17], dir: 90, patrol: [[25, 17, 1500, 90], [25, 25, 1500, 270]] },
              { type: 'ranger', at: [33, 24], dir: 0, patrol: [[33, 24, 2000, 0], [40, 18, 2000, 180]] },
            ],
          },
        ],
      },
      {
        id: 'station', name: 'Rangerstation am Damm', gate: [38, 16],
        map: [
          '########################################',
          '#......T.........T.....................#',
          '#.PPP..T..T.~.........################.#',
          '#.PPP.........T..~....#.......########~#',
          '#.PPP..T.~~........T..#...B...#....T##.#',
          '#......T...T..........#.......D.....##.#',
          '#~.....T........T.....L.......#.....##.#',
          '#TTTT.TT......~~...~..#.T.....###D####.#',
          '#.....................#..............#.#',
          '#........T..........T.#.~~.......~~..#~#',
          '#..T.~.......B........#..............#.#',
          '#.........~~.....T....#######D########.#',
          '#.....T................................#',
          '#...........T.....~..T..T........T.....#',
          '#.T....~~......T............T.......T..#',
          '#.........T............................#',
          '#......................................#',
          '#~~~~~~~.~~~~~.~~~~~.~~~~~.~~~~.~~~~~.~#',
          '#WWWWWWW.WWWWWWWWWWW.WWWWWWWWWW.WWWWWWW#',
          '#WWWWWWW.W~~~WWWWWWW.WW~~WWWWWW.WWWWWWW#',
          '#WW~~WWW.WWWWWW~WWWW.WWWWWWWWWW.W~~WWWW#',
          '#WTWWWWW.WWWWWWWWWWW.WWWWWWWWWW.WWWWTWW#',
          '#W...................................WW#',
          '#WWWWWWW.WWWW.WWWWWWWWWWWW.WWWW.WWWWWWW#',
          '#WWW~WWW.WWWW.WWWWWWWWWWWW.WWWW.W~WWWWW#',
          '#WWWWWWW.WWW~~..WWWWWWWW.~...WW.WWWWWWW#',
          '#WWWWWWW.~WW....WWWWWWWW..B..WW......WW#',
          '#WWWWWWW.WWW...TWWWWWWWW....~WWWWWWWWWW#',
          '#WWWWWWW.WWWWWWWWWWWWWWWWWWWWWWWWWWWWWW#',
          '########################################',
        ],
        variants: [
          {
            id: 'nachtwanderung', name: 'Nachtwanderung', desc: 'Nachtwanderung mit Taschenlampe: Ein Ranger läuft den ganzen Damm ab und erklärt jedem Frosch das Naturschutzgesetz. Die Lieblingseiche der Ranger steht im Stationshof.',
            enemies: [
              { type: 'ranger', at: [2, 16], dir: 0, patrol: [[2, 16, 1500, 0], [37, 16, 1500, 180]] },
              { type: 'ranger', at: [24, 9], dir: 0, patrol: [[24, 9], [28, 9], [28, 4], [24, 4]] },
              { type: 'ranger', at: [9, 12], dir: 0, patrol: [[9, 12, 1500, 0], [20, 12, 1500, 180]] },
              { type: 'ranger', at: [8, 22], dir: 0, patrol: [[8, 22, 1000], [31, 22, 1000]] },
              { type: 'ranger', at: [29, 12], dir: 90, look: [90, 180, 0] },
            ],
          },
          {
            id: 'besuchertag', name: 'Tag der offenen Hütte', desc: 'Tag der offenen Hütte: Am Tor gibt es Waffeln, ein Ranger kontrolliert den Bohlenweg und einer die Waffeln. Die Hexeneiche steht heute direkt an eurer Lichtung.',
            patch: [[13, 10, '.'], [3, 10, 'B'], [26, 26, '.'], [14, 26, 'B']],
            enemies: [
              { type: 'ranger', at: [29, 13], dir: 90, look: [90, 0, 180] },
              { type: 'ranger', at: [23, 8], dir: 270, patrol: [[23, 8, 1500, 270], [29, 8, 1500, 270]] },
              { type: 'ranger', at: [3, 22], dir: 0, patrol: [[3, 22, 1500, 0], [20, 22, 1500, 180]] },
              { type: 'ranger', at: [11, 15], dir: 0, patrol: [[11, 15, 1000], [36, 15, 1000]] },
              { type: 'ranger', at: [2, 12], dir: 0, patrol: [[2, 12, 2000, 0], [9, 12, 2000, 180]] },
            ],
          },
        ],
      },
    ],
  },
  {
    // v12 §4: Abzock-Shop in Limassol. needsItem: nur mit dem Investment-Code aus dem Shop (die Adresse steht im Impressum);
    // stealMs: Tresor knacken dauert 6 s; loot: Säcke statt Münzen (Ansicht); texts.video: Untertitel der Videoszene, [0] immer zuerst, dann reihum
    id: 'rabino', name: 'Rabino Empire HQ', place: 'Limassol, Zypern', theme: 'zypern',
    lat: 34.7071, lon: 33.0226, timeMs: 360_000, reinforce: 'berater', needsItem: 'investmentcode', stealMs: 6000, loot: 'q-sack',
    objective: { type: 'steal', min: 3, label: 'Geldsäcke zurückholen' },
    intro: 'Im Impressum stand Limassol. Da sitzt Rabino Empire und zählt eure Sats. Knackt die Tresore im Keller, schleppt die Säcke zur Haunebu, und geht Moshe aus dem Weg: Wer ihm in die Arme läuft, muss sein neues Video gucken.',
    hint: 'Tresor knacken dauert 6 s, die Deobombe hilft. Etwa alle 25 s dreht Moshe ein Video und sieht nichts, danach ist er 10 s schneller. Jedes Video kostet 1.000 Sats Belohnung.',
    texts: {
      success: 'Die Säcke sind an Bord. Rabino Empire meldet Lieferverzug: Versand aus Zypern dauert.',
      fail: 'Die Säcke bleiben in Limassol. Moshe dreht ein Video darüber.',
      video: [
        'Diese 3 Trcks verschweigen dir die Banken',
        'Ich habe mit 3.000 Euro angefangen. Heute besitze ich 14 Wohnungen in Marxloh.',
        'Dieser Trick ist in Deutschland völlig legal, nur kennt ihn keiner.',
        'Mein Großvater sagte immer: Immobilien lügen nicht. Er hatte keine.',
        'Schreib CODE in die Kommentare.',
        'Nur noch heute. Morgen auch, aber nur noch heute.',
      ],
    },
    layouts: [
      {
        id: 'grossraum', name: 'Großraumbüro', gate: [30, 1], coins: 2,
        map: [
          '################################',
          '#T.....#.......................#',
          '#......#.~~~.~~~.~~~.~~~.......#',
          '#......#.......................#',
          '#......D.~~~.~~~.~~~.~~~....~~.#',
          '#......#.......................#',
          '#.....T#.~~~.~~~.~~~.~~~.......#',
          '#......#.......................#',
          '#......########D#########D######',
          '#..PPP.#..........#............#',
          '#..PPP.#..~~.~~...#..~~..~~....#',
          '#..PPP.#..........L............#',
          '#......#..~~.~~...#..~~..~~....#',
          '#......#..........#............#',
          '#T.....########D###########D####',
          '#......#.......#.......#.......#',
          '#......#..C....#..C....#..C....#',
          '#......D.......D.......L.......#',
          '#......#..~~...#..~~...#..~~...#',
          '#WWWWWW#....C..#....C..#....C..#',
          '#WWWWWW#.......#.......#.......#',
          '################################',
        ],
        variants: [
          {
            id: 'buerozeit', name: 'Bürozeit', desc: 'Die Berater telefonieren im Großraumbüro, Moshe geht in den Besprechungsräumen auf und ab. Im Keller zählt einer die Säcke nach.',
            enemies: [
              { type: 'berater', at: [9, 1], dir: 0, patrol: [[9, 1, 1000], [30, 1, 1000]] },
              { type: 'berater', at: [9, 7], dir: 0, patrol: [[9, 7, 1000], [23, 7, 1000]] },
              { type: 'berater', at: [20, 3], dir: 90, patrol: [[20, 3, 1500, 90], [20, 5, 1500, 270]] },
              { type: 'moshe', at: [13, 11], dir: 0, patrol: [[13, 11, 1000], [16, 9], [9, 13, 1000], [9, 9]] },
              { type: 'berater', at: [27, 11], dir: 0, look: [0, 90, 180] },
              { type: 'berater', at: [17, 15], dir: 0, patrol: [[17, 15, 1500, 0], [22, 20, 1500, 180]] },
            ],
          },
          {
            id: 'videotag', name: 'Videotag', desc: 'Moshe dreht heute im Keller, zwischen den Tresoren sieht die Kulisse am reichsten aus. Oben nehmen die Berater Bestellungen auf.',
            coins: { '10,16': 3, '26,16': 0, '28,19': 3 },
            enemies: [
              { type: 'moshe', at: [10, 20], dir: 0, patrol: [[10, 20, 1500, 0], [14, 15], [21, 15, 1000, 90], [22, 20], [16, 20]] },
              { type: 'berater', at: [9, 1], dir: 0, patrol: [[9, 1, 1000], [30, 1, 1000]] },
              { type: 'berater', at: [29, 3], dir: 180, look: [180, 90, 270] },
              { type: 'berater', at: [14, 7], dir: 0, patrol: [[14, 7], [23, 7], [23, 5]] },
              { type: 'berater', at: [20, 11], dir: 0, patrol: [[20, 11, 1500, 0], [29, 11, 1500, 180]] },
              { type: 'berater', at: [27, 17], dir: 180, look: [180, 270, 0] },
            ],
          },
        ],
      },
      {
        id: 'nacht', name: 'Nachtschicht', gate: [34, 9], coins: 2,
        map: [
          '####################################',
          '#T.....#........#..................#',
          '#..PPP.#.~~.~~..#..~~~.~~~.~~~.....#',
          '#..PPP.#........D..................#',
          '#..PPP.#.~~.~~..#..~~~.~~~.~~~..~~.#',
          '#......#........#..................#',
          '#......#........#..~~~.~~~.~~~.....#',
          '#......D........#..................#',
          '#......#######D#############D#######',
          '#......#...........................#',
          '#......####L##########D#######D#####',
          '#.....T#.......#...........#.......#',
          '#......#..C....#..~~..~~...#..C....#',
          '#......#.......#...........D.......#',
          '#......#.......#....C......#.......#',
          '#T.....#.......D...........#.......#',
          '#......#..~~...#..~~..~~...#..~~...#',
          '#WWWWWW#.......#...........#....C..#',
          '#WWWWWW#....C..#.......C...#.......#',
          '#WWWWWW#.......#...........#.......#',
          '#WWWWWW#.......#...........#.......#',
          '####################################',
        ],
        variants: [
          {
            id: 'spaetschicht', name: 'Spätschicht', desc: 'Nachts laufen die Berater lange Wege. Moshe probt oben im Büro seinen neuen Clip, ein Berater rennt den Flur rauf und runter.',
            enemies: [
              { type: 'berater', at: [9, 9], dir: 0, patrol: [[9, 9, 1500, 0], [33, 9, 1500, 180]] },
              { type: 'moshe', at: [24, 5], dir: 0, patrol: [[24, 5, 1000], [33, 5], [33, 1, 1000], [18, 1], [18, 7, 1000], [33, 7]] },
              { type: 'berater', at: [18, 12], dir: 90, patrol: [[18, 12, 1500, 90], [25, 17, 1500, 270]] },
              { type: 'berater', at: [31, 15], dir: 270, look: [270, 180, 90] },
              { type: 'berater', at: [11, 3], dir: 90, look: [90, 0] },
            ],
          },
          {
            id: 'nachtvideo', name: 'Nachtvideo', desc: 'Moshe dreht nachts im Keller, da ist das Licht am schmeichelhaftesten. Nur drei Berater sind noch da, einer davon im Flur.',
            coins: { '20,14': 3, '32,17': 0, '12,18': 3 },
            enemies: [
              { type: 'moshe', at: [17, 11], dir: 0, patrol: [[17, 11, 1500, 0], [26, 11], [26, 19, 1500, 180], [17, 19]] },
              { type: 'berater', at: [33, 1], dir: 180, patrol: [[33, 1, 1000], [18, 1, 1000], [18, 7], [33, 7]] },
              { type: 'berater', at: [29, 11], dir: 90, look: [90, 180, 270] },
              { type: 'berater', at: [9, 13], dir: 90, patrol: [[9, 13, 1500, 90], [9, 19, 1500, 270]] },
            ],
          },
        ],
      },
    ],
  },
];

export const MISSION_BY_ID = Object.fromEntries(MISSIONS.map(m => [m.id, m]));

// v10 §4: Hinweis im Briefing jeder Mission
export const MELEE_HINT = 'Nahkampf ist gefährlich – schleich dich durch!';

// Kompatibilität (v8): Variante aus Layout 1
export const pickVariant = (m, rng = Math.random) => { const vs = m.layouts[0].variants; return vs[Math.floor(rng() * vs.length) % vs.length]; };

// Würfelt pro Start Layout, Variante, Spiegelung und den Seed für Patrouillen-Versatz und Beute
export function pickSetup(m, rng = Math.random) {
  const layout = m.layouts[Math.floor(rng() * m.layouts.length) % m.layouts.length];
  const variant = layout.variants[Math.floor(rng() * layout.variants.length) % layout.variants.length];
  return { layoutId: layout.id, variantId: variant.id, mirror: rng() < 0.5, seed: Math.floor(rng() * 4294967296) >>> 0 };
}

// mulberry32: kleiner, fester Zufall aus dem Seed
const seeded = seed => () => {
  seed = (seed + 0x6D2B79F5) >>> 0;
  let t = Math.imul(seed ^ (seed >>> 15), seed | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const degTo = (a, b) => Math.round(Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI + 360) % 360;
const rot = (a, k) => [...a.slice(k), ...a.slice(0, k)];

// Baut aus setup { layoutId, variantId, mirror, seed } rein und deterministisch die Startlage.
// Ohne layoutId: das Layout mit dieser Variante (sonst Layout 1); ohne variantId: erste Variante. Unbekannte ids werfen.
// Liefert { layout, variant, map, gate, enemies, coins, mirror } in Spielkoordinaten (gespiegelt, falls mirror):
// map string[] mit eingespieltem patch, coins {'x,y': n} für jeden Tresor (bei steal zufällige Teilmenge geleert),
// enemies wie in der Variante, aber Wachen starten an einem zufälligen Punkt ihrer Route bzw. Blickfolge.
export function buildSetup(m, { layoutId, variantId, mirror = false, seed = 0 } = {}) {
  const layout = layoutId == null ? m.layouts.find(l => l.variants.some(v => v.id === variantId)) || m.layouts[0] : m.layouts.find(l => l.id === layoutId);
  if (!layout) throw new Error('Unbekanntes Layout');
  const variant = variantId == null ? layout.variants[0] : layout.variants.find(v => v.id === variantId);
  if (!variant) throw new Error('Unbekannte Variante');
  const rows = layout.map.map(r => r.split(''));
  for (const [x, y, ch] of variant.patch || []) rows[y][x] = ch;
  const w = rows[0].length, X = x => (mirror ? w - 1 - x : x), D = d => (mirror ? ((180 - d) % 360 + 360) % 360 : d);
  const wp = ([x, y, ...rest]) => { const p = [X(x), y, ...rest]; if (p[3] != null) p[3] = D(p[3]); return p; };
  const rng = seeded(seed >>> 0);
  const enemies = variant.enemies.map(e => {
    let at = e.at, dir = e.dir ?? 0, patrol = e.patrol, look = e.look;
    const k = patrol?.length > 1 ? Math.floor(rng() * patrol.length) : 0; // 0 = Start wie gebaut
    if (k) { patrol = rot(patrol, k); at = patrol[0]; dir = patrol[0][3] ?? degTo(patrol[0], patrol[1]); }
    const j = !patrol?.length && look?.length > 1 ? Math.floor(rng() * look.length) : 0;
    if (j) { look = rot(look, j); dir = look[0]; }
    const out = { ...e, at: [X(at[0]), at[1]], dir: D(dir) };
    if (patrol) out.patrol = patrol.map(wp);
    if (look) out.look = look.map(D);
    return out;
  });
  const vaults = [];
  rows.forEach((row, y) => row.forEach((ch, x) => { if (ch === 'C') vaults.push({ x, y, n: variant.coins?.[`${x},${y}`] ?? layout.coins ?? 2 }); }));
  if (m.objective.type === 'steal') {
    // ein Teil der Tresore ist schon leer („Bin beim Halving.“), es bleiben mindestens min + 2 und zwei Drittel der Münzen
    const full = vaults.reduce((s, v) => s + v.n, 0), need = Math.max((m.objective.min ?? 0) + 2, Math.ceil(full * 2 / 3));
    let left = full;
    for (const [, v] of vaults.filter(v => v.n).map(v => [rng(), v]).sort((a, b) => a[0] - b[0])) {
      if (rng() < 0.5 && left - v.n >= need) { left -= v.n; v.n = 0; }
    }
  }
  const coins = Object.fromEntries(vaults.map(v => [`${X(v.x)},${v.y}`, v.n]));
  return {
    layout, variant, map: rows.map(r => (mirror ? r.reverse() : r).join('')), gate: [X(layout.gate[0]), layout.gate[1]],
    enemies, coins, mirror: !!mirror,
  };
}
