// Reine Daten. Lebensenergie heißt BTC, Währung heißt Sats. Zeiten in Millisekunden.
export const CONST = {
  SPAWN_INTERVAL: 60_000,
  SPAWN_LIFETIME: 600_000,
  SPAWN_MIN: 2,
  SPAWN_MAX: 4,
  SPAWN_RING: [30, 250],
  LOCAL_ZONE: 500,
  LOCAL_SPAWN_RING: [30, 150],
  SPAWN_FORGET: 1000,
  SPAWN_WALK: 50,          // so viele Meter gelaufen → Spawns auffüllen
  CATCH_RANGE: 50,
  ARENA_RANGE: 100,
  BREAKOUTS: 3,            // Ausbrüche, bis der Rüther abhaut
  MAX_CATCH_CHANCE: 0.95,
  MIN_CATCH_CHANCE: 0.05,
  SUPERCOIN_BONUS: 0.2,
  TEAM_SIZE: 3,
  // Lockmodul
  LURE_MS: 300_000,
  LURE_SPAWN_MIN: 4,
  LURE_SPAWN_MAX: 8,
  LURE_INTERVAL: 20_000,
  // Power-Ups
  LEVEL_MAX: 20,
  LEVEL_STEP: 0.04,        // +4 % Stats pro Level über 1
  LEVEL_COST: 50,          // × aktuelles Level
  DEX_BONUS: 100,
  // Arenen
  ARENA_LEVELS: 5,
  ARENA_SCALE: 0.25,       // +25 % Boss-Stats pro Level über 1
  ARENA_WIN_BASE: 150,     // × Arena-Level
  RAGE_AT: 0.5,
  RAGE_FAST_EVERY: 1800,
  RAGE_CHARGED_EVERY: 7000,
  // Kampf (Echtzeit)
  BATTLE_DURATION: 90_000,
  FAST_DAMAGE: 3,
  FAST_ENERGY: 10,
  FAST_COOLDOWN: 250,
  MAX_ENERGY: 100,
  DODGE_FACTOR: 0.25,
  WEAKEN_FACTOR: 0.75,
  SUMMON_INTERVAL: 1000,
  CHARGED_EVERY: 10_000,
  STUN_GRACE: 500,
  COMBO_WINDOW: 800,
  INTRO_MS: 2600,
};

export const RARITIES = [
  { id: 'normal', name: 'Normal', weight: 70, mult: 1.0, catchPenalty: 0, sats: 10, color: '#9aa0a6' },
  { id: 'selten', name: 'Selten', weight: 20, mult: 1.15, catchPenalty: 0.1, sats: 30, color: '#2a7fff' },
  { id: 'episch', name: 'Episch', weight: 8, mult: 1.35, catchPenalty: 0.2, sats: 80, color: '#b36bff' },
  { id: 'legendaer', name: 'Legendär', weight: 2, mult: 1.6, catchPenalty: 0.3, sats: 200, color: '#f7c948' },
];
export const RARITY_BY_ID = Object.fromEntries(RARITIES.map(r => [r.id, r]));

export const SHOP = [
  { id: 'lockmodul', name: 'Lockmodul', icon: '🧲', cost: 300, desc: '5 Minuten lang doppelt so viele Rüthers, alle 20 Sekunden neue.' },
  { id: 'supercoin', name: 'Super-Münze', icon: '🪙', cost: 40, desc: 'Ein Wurf mit +20 % Fangchance. Wird beim Treffer verbraucht.' },
];

export const ARENAS = [
  { id: 'worringen', name: 'Rütherschanze Worringen', address: 'Langeler Weg 23, 50769 Köln', lat: 51.0631420, lon: 6.8722528, boss: 'satoshi' },
  { id: 'huettenberg', name: 'Hüttenbergstraße', address: 'Hüttenbergstraße 55, 58091 Hagen', lat: 51.3440710, lon: 7.4877959, boss: 'schanze' },
  { id: 'pcsale', name: 'PC Sale', address: 'Augustastraße 1, 58089 Hagen', lat: 51.3589214, lon: 7.4631893, boss: 'ps3' },
];

// spawn: 'anywhere' oder die id der Arena, um die der Rüther auftaucht.
// attacks = Spezial-Attacken: cost = Energie, fx = Animation (siehe battle-ui.js)
export const RUETHERS = [
  {
    id: 'christian', name: 'Christian', title: 'Herr der Netzwerke', btc: 100, catchChance: 0.5, spawn: 'anywhere',
    desc: 'Handelt mit Bitcoin, bei ihm steigt der Kurs immer um 70 %. Ex-Vice-President der Deutschen Bank.',
    attacks: [
      { name: 'Plus 70 Prozent', cost: 100, damage: 40, fx: 'chart-up' },
      { name: 'Vice-President-Handschlag', cost: 50, damage: 10, weaken: 8000, fx: 'handshake' },
      { name: 'Werfen mit Dosenbier', cost: 50, damage: 20, fx: 'can' },
    ],
  },
  {
    id: 'hildegard', name: 'Hildegard', title: 'Herrscherin der Schanze', btc: 120, catchChance: 0.35, spawn: 'huettenberg',
    desc: 'Herrscht über die Rütherschanze. Ruft die Familie zu Hilfe.',
    attacks: [
      { name: 'Familientreffen', cost: 100, damage: 0, once: true, summonMs: 10_000, summon: [{ id: 'christian', name: 'Christian', damage: 4 }, { id: 'micha', name: 'Onkel Micha', damage: 4 }], fx: 'family' },
      { name: 'Handtaschen-Hieb', cost: 50, damage: 20, fx: 'handbag' },
    ],
  },
  {
    id: 'micha', name: 'Onkel Micha', title: 'Herrscher des PC Sale', btc: 100, catchChance: 0.35, spawn: 'pcsale',
    desc: 'Hat eine PS3 und baut sie zur Hardware-Wallet um.',
    attacks: [
      { name: 'Hardware-Wallet-Umbau', cost: 100, damage: 30, drain: true, fx: 'wallet' },
      { name: 'Controllerwurf', cost: 50, damage: 25, fx: 'controller' },
    ],
  },
  {
    id: 'viktor', name: 'Viktor', title: 'Möchtegern-Herrscher der Börse', btc: 90, catchChance: 0.5, spawn: 'anywhere',
    desc: 'Stinkt stark. Hat vor der Börse in New York gestanden.',
    attacks: [
      { name: 'Giftgas', cost: 100, damage: 10, poison: { perSec: 5, ms: 8000 }, fx: 'gas' },
      { name: 'Ungeschlagene Argumentationslogik', cost: 50, damage: 10, stun: 3000, flavour: 'Deutsche Bank ist kein Geringverdiener.', fx: 'speech' },
    ],
  },
  {
    id: 'ramona', name: 'Ramona Rüther', title: 'Herrscherin der Arbeitslosigkeit', btc: 90, catchChance: 0.35, spawn: 'worringen',
    desc: 'Frau von Christian. Hat seit sieben Jahren offene M&Ms.',
    attacks: [
      { name: 'Abgelaufene M&Ms', cost: 100, damage: 15, poison: { perSec: 4, ms: 8000 }, fx: 'mms' },
      { name: 'Unlimited Credits', cost: 50, damage: 0, heal: 40, fx: 'bags' },
    ],
  },
];

// fast: schneller Angriff (every = Abstand, warn = Warnzeit). charged: Lade-Attacken, abwechselnd.
export const BOSSES = {
  ps3: {
    id: 'ps3', name: 'Playstation 3', btc: 260,
    fast: { name: 'Blu-ray-Wurf', damage: 12, every: 2500, warn: 600, fx: 'disc' },
    charged: [
      { name: 'Yellow Light of Death', damage: 25, warn: 1200, poison: { perSec: 3, ms: 6000 }, fx: 'yellow' },
      { name: 'Firmware-Update', damage: 0, warn: 1200, stun: 2000, fx: 'firmware' },
    ],
  },
  schanze: {
    id: 'schanze', name: 'Herr der Rütherschanze', btc: 360,
    fast: { name: 'Kurssturz', damage: 15, every: 2500, warn: 600, fx: 'crash' },
    charged: [
      { name: 'Blockchain-Kette', damage: 25, warn: 1200, poison: { perSec: 5, ms: 6000 }, fx: 'chain' },
      { name: 'Mining', damage: 0, warn: 1200, heal: 40, fx: 'mining' },
    ],
  },
  satoshi: {
    id: 'satoshi', name: 'Satoshi Nakamoto', btc: 440,
    fast: { name: 'Genesis Block', damage: 18, every: 2500, warn: 600, fx: 'block' },
    charged: [
      { name: 'Halving', damage: 45, warn: 1200, fx: 'half' },
      { name: 'Private Key verloren', damage: 0, warn: 1200, heal: 40, fx: 'key' },
    ],
  },
};

export const RUETHER_BY_ID = Object.fromEntries(RUETHERS.map(r => [r.id, r]));
export const ARENA_BY_ID = Object.fromEntries(ARENAS.map(a => [a.id, a]));
