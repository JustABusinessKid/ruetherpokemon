// Reine Daten. Lebensenergie heißt BTC.
export const CONST = {
  SPAWN_INTERVAL: 60_000,
  SPAWN_LIFETIME: 600_000,
  SPAWN_MIN: 2,
  SPAWN_MAX: 4,
  SPAWN_RING: [30, 250],
  LOCAL_ZONE: 500,
  LOCAL_SPAWN_RING: [30, 150],
  SPAWN_FORGET: 1000,
  CATCH_RANGE: 50,
  ARENA_RANGE: 100,
  THROWS: 3,
  HIT_CHANCE: 0.9,
  DUP_BONUS: 10,
  DUP_CAP: 50,
  TEAM_SIZE: 3,
  SUMMON_TURNS: 3,
};

export const ARENAS = [
  { id: 'worringen', name: 'Rütherschanze Worringen', address: 'Langeler Weg 23, 50769 Köln', lat: 51.0631420, lon: 6.8722528, boss: 'satoshi' },
  { id: 'huettenberg', name: 'Hüttenbergstraße', address: 'Hüttenbergstraße 55, 58091 Hagen', lat: 51.3440710, lon: 7.4877959, boss: 'schanze' },
  { id: 'pcsale', name: 'PC Sale', address: 'Augustastraße 1, 58089 Hagen', lat: 51.3589214, lon: 7.4631893, boss: 'ps3' },
];

// spawn: 'anywhere' oder die id der Arena, um die der Rüther auftaucht
export const RUETHERS = [
  {
    id: 'christian', name: 'Christian', title: 'Herr der Netzwerke', btc: 100, catchChance: 0.5, spawn: 'anywhere',
    desc: 'Handelt mit Bitcoin, bei ihm steigt der Kurs immer um 70 %. Ex-Vice-President der Deutschen Bank.',
    attacks: [
      { name: 'Plus 70 Prozent', damage: 30, alwaysHit: true },
      { name: 'Vice-President-Handschlag', damage: 10, weaken: 3 },
      { name: 'Werfen mit Dosenbier', damage: 20 },
    ],
  },
  {
    id: 'hildegard', name: 'Hildegard', title: 'Herrscherin der Schanze', btc: 120, catchChance: 0.35, spawn: 'huettenberg',
    desc: 'Herrscht über die Rütherschanze. Ruft die Familie zu Hilfe.',
    attacks: [
      { name: 'Familientreffen', damage: 0, once: true, summon: [{ name: 'Christian', damage: 10 }, { name: 'Onkel Micha', damage: 10 }] },
      { name: 'Handtaschen-Hieb', damage: 20 },
    ],
  },
  {
    id: 'micha', name: 'Onkel Micha', title: 'Herrscher des PC Sale', btc: 100, catchChance: 0.35, spawn: 'pcsale',
    desc: 'Hat eine PS3 und baut sie zur Hardware-Wallet um.',
    attacks: [
      { name: 'Hardware-Wallet-Umbau', damage: 20, drain: true },
      { name: 'Controllerwurf', damage: 25 },
    ],
  },
  {
    id: 'viktor', name: 'Viktor', title: 'Möchtegern-Herrscher der Börse', btc: 90, catchChance: 0.5, spawn: 'anywhere',
    desc: 'Stinkt stark. Hat vor der Börse in New York gestanden.',
    attacks: [
      { name: 'Giftgas', damage: 10, poison: { perTurn: 10, turns: 3 } },
      { name: 'Ungeschlagene Argumentationslogik', damage: 10, skip: true, flavour: 'Deutsche Bank ist kein Geringverdiener.' },
    ],
  },
  {
    id: 'ramona', name: 'Ramona Rüther', title: 'Herrscherin der Arbeitslosigkeit', btc: 90, catchChance: 0.35, spawn: 'worringen',
    desc: 'Frau von Christian. Hat seit sieben Jahren offene M&Ms.',
    attacks: [
      { name: 'Abgelaufene M&Ms', damage: 15, poison: { perTurn: 8, turns: 3 } },
      { name: 'Unlimited Credits', damage: 0, heal: 40 },
    ],
  },
];

export const BOSSES = {
  ps3: {
    id: 'ps3', name: 'Playstation 3', btc: 130,
    attacks: [
      { name: 'Blu-ray-Wurf', damage: 25 },
      { name: 'Yellow Light of Death', damage: 20, poison: { perTurn: 5, turns: 3 } },
      { name: 'Firmware-Update', damage: 0, skip: true },
    ],
  },
  schanze: {
    id: 'schanze', name: 'Herr der Rütherschanze', btc: 180,
    attacks: [
      { name: 'Kurssturz', damage: 30 },
      { name: 'Mining', damage: 0, heal: 25 },
      { name: 'Blockchain-Kette', damage: 15, poison: { perTurn: 10, turns: 3 } },
    ],
  },
  satoshi: {
    id: 'satoshi', name: 'Satoshi Nakamoto', btc: 220,
    attacks: [
      { name: 'Genesis Block', damage: 25 },
      { name: 'Halving', damage: 35, everyN: 3 },
      { name: 'Private Key verloren', damage: 0, heal: 30 },
    ],
  },
};

export const RUETHER_BY_ID = Object.fromEntries(RUETHERS.map(r => [r.id, r]));
export const ARENA_BY_ID = Object.fromEntries(ARENAS.map(a => [a.id, a]));
