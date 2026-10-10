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
  CATCH_RANGE: 120,       // v6: großzügig, viele Spawns liegen auf Privatgrund
  ARENA_RANGE: 150,
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
  // v4: XP, Quests, Stops, Events, Online
  XP_CATCH: { normal: 20, selten: 50, episch: 120, legendaer: 300 },
  XP_ARENA: 100,           // × Arena-Level
  XP_STOP: 10,
  XP_FUSION: 60,
  LEVEL_XP_STEP: 150,      // Level n → n+1 braucht 150 × n XP
  LEVELUP_SATS: 100,       // × neues Level
  ACHIEVEMENT_SATS: 50,
  STREAK_BASE: 50,
  STREAK_STEP: 25,
  STREAK_MAX: 200,
  STARTER_SATS: 100,
  STARTER_SUPERCOINS: 1,
  FUSION_COUNT: 3,
  STOP_RADIUS: 600,
  STOP_RANGE: 80,
  STOP_COOLDOWN: 300_000,
  STOP_MAX: 25,
  STOP_CACHE_MS: 600_000,
  STOP_CACHE_CELL: 300,
  STOP_SUPERCOIN_CHANCE: 0.25,
  HOUR_START: 18,
  HOUR_END: 19,
  HOUR_SATS_MULT: 1.5,
  FEATURED_WEIGHT: 3,
  SYNC_DEBOUNCE: 3000,
  STATE_POLL: 60_000,
  API_TIMEOUT: 6000,
  SPLASH_MS: 600,
  // v6: Wildkampf, Duplikate
  WILD_DURATION: 60_000,
  WILD_HP_MULT: 1.6,       // wilde Rüther halten etwas mehr aus als im eigenen Team
  WILD_FAST_DAMAGE: 6,     // × Hashrate des wilden Rüthers
  WILD_FAST_EVERY: 2600,
  WILD_CHARGED_MULT: 0.7,  // Spezialschaden des wilden Rüthers × Hashrate × 0,7
  WILD_WIN_SATS: { normal: 30, selten: 80, episch: 200, legendaer: 500 },
  XP_WILD_WIN: 80,
  WIN_LEVEL_UP: 1,         // Sieg: beteiligte Rüther steigen um 1 Level (max LEVEL_MAX)
  FEED_LEVELS: 2,          // Füttern: ein Duplikat desselben Rüthers gibt +2 Level
  SELL_MULT: 2,            // Verkaufen: 2 × Fang-Sats der Seltenheit
  CINEMATIC_MS: 1500,      // Standard-Freeze einer Spezial-Sequenz
  // v7: Haunebu-Reichsflugscheibe
  HAUNEBU_BEAM_COST: 300,  // ein Flug zu einer Arena
  HAUNEBU_BEAM_MS: 600_000, // so lange stehst du dort (10 Minuten), dann fliegt sie dich zurück
  HAUNEBU_WIN_SATS: 500,   // Sieg gegen Hitler: Flugscheibe + 500 Sats
  XP_HAUNEBU: 500,
};

export const API_BASE = null; // Higgsfield-Backend abgeschaltet (2026-10-10)
// Online-Welt über GitHub: Live-Nachrichten über ntfy.sh (signiert), dauerhafter Stand im Branch online-data (GitHub Action)
export const ONLINE = {
  topic: 'ruether-go-8b419c181681af1d',
  bus: 'https://ntfy.sh',
  snapshotUrl: 'https://raw.githubusercontent.com/JustABusinessKid/ruetherpokemon/online-data/state.json',
};
export const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
// Ausweich-Server, der Reihe nach; die öffentlichen Instanzen sind oft überlastet (504)
export const OVERPASS_URLS = [OVERPASS_URL, 'https://z.overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
export const OVERPASS_AMENITIES = ['pub', 'bar', 'biergarten', 'cafe', 'fast_food'];
export const OVERPASS_SHOPS = ['convenience', 'kiosk', 'supermarket', 'alcohol', 'beverages'];
export const STOP_REWARDS = [
  { sats: 20, w: 40 },
  { sats: 30, w: 30 },
  { sats: 40, w: 20 },
  { sats: 60, w: 10 },
];

// kind = Ereignis, das den Fortschritt erhöht (trackQuest(save, kind, n))
export const QUESTS = [
  { id: 'catch3', text: 'Fange 3 Rüthers', kind: 'catch', goal: 3, sats: 150, xp: 60 },
  { id: 'catchRare', text: 'Fange einen Seltenen oder besser', kind: 'catchRare', goal: 1, sats: 200, xp: 80 },
  { id: 'arenaWin', text: 'Gewinne einen Arenakampf', kind: 'arenaWin', goal: 1, sats: 250, xp: 100 },
  { id: 'stops3', text: 'Drehe 3 Dosenbier-Stops', kind: 'stop', goal: 3, sats: 150, xp: 60 },
  { id: 'combo8', text: 'Erreiche Combo ×8', kind: 'combo8', goal: 1, sats: 200, xp: 80 },
  { id: 'specials3', text: 'Setze 3 Spezial-Attacken ein', kind: 'special', goal: 3, sats: 150, xp: 60 },
  { id: 'dodge3', text: 'Weiche 3 Boss-Angriffen aus', kind: 'dodge', goal: 3, sats: 150, xp: 60 },
  { id: 'powerup1', text: 'Mache ein Power-Up', kind: 'powerup', goal: 1, sats: 100, xp: 50 },
  { id: 'superHit', text: 'Triff mit „Super!"-Ring', kind: 'superHit', goal: 1, sats: 150, xp: 60 },
  { id: 'fusion1', text: 'Mache eine Fusion', kind: 'fusion', goal: 1, sats: 300, xp: 150 },
];

export const ACHIEVEMENTS = [
  { id: 'first_catch', name: 'Erster Fang', desc: 'Fange deinen ersten Rüther', icon: '🎯' },
  { id: 'all_five', name: 'Familienalbum', desc: 'Fange alle fünf Rüthers', icon: '👨‍👩‍👧‍👦' },
  { id: 'rare1', name: 'Glücksgriff', desc: 'Fange einen Seltenen', icon: '🔵' },
  { id: 'epic1', name: 'Episch!', desc: 'Fange einen Epischen', icon: '🟣' },
  { id: 'legend1', name: 'Legende', desc: 'Fange einen Legendären', icon: '🟡' },
  { id: 'catch10', name: 'Sammler', desc: '10 Fänge', icon: '🧺' },
  { id: 'catch50', name: 'Großwildjäger', desc: '50 Fänge', icon: '🏹' },
  { id: 'dex10', name: 'Halber Dex', desc: '10 Dex-Einträge', icon: '📗' },
  { id: 'dex20', name: 'Kompletter Dex', desc: 'Alle 20 Dex-Einträge', icon: '📕' },
  { id: 'arena1', name: 'Eroberer', desc: 'Gewinne einen Arenakampf', icon: '⚔️' },
  { id: 'master1', name: 'Arenameister', desc: 'Meistere eine Arena', icon: '🏆' },
  { id: 'master3', name: 'Herrscher', desc: 'Meistere alle Arenen', icon: '👑' },
  { id: 'combo10', name: 'Combo-König', desc: 'Erreiche Combo ×10', icon: '💥' },
  { id: 'level10', name: 'Aufgeleveled', desc: 'Ein Rüther auf Level 10', icon: '⬆️' },
  { id: 'stops10', name: 'Stammgast', desc: 'Drehe 10 Dosenbier-Stops', icon: '🍺' },
  { id: 'trainer5', name: 'Trainer Lv. 5', desc: 'Erreiche Trainer-Level 5', icon: '⭐' },
  { id: 'trainer10', name: 'Trainer Lv. 10', desc: 'Erreiche Trainer-Level 10', icon: '🌟' },
  { id: 'fusion1', name: 'Alchemist', desc: 'Mache deine erste Fusion', icon: '⚗️' },
  { id: 'keller', name: 'Kellerkind', desc: 'Besiege die Bitcoin-Heizung im Keller', icon: '🔥' },
  { id: 'haunebu', name: 'Reichsflugscheibe', desc: 'Besiege Adolf Hitler und erbeute die Haunebu', icon: '🛸' },
];

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
  // v7: Kauf startet sofort den Kampf gegen Hitler (kein Inventar). Sieg = save.flugscheibe, danach nicht mehr kaufbar.
  { id: 'haunebu', name: 'Haunebu-Reichsflugscheibe', icon: '🛸', cost: 1000, desc: 'Beschwört die Flugscheibe. Adolf Hitler steigt aus und will sie behalten. Besieg ihn, dann fliegt sie dich für 300 Sats 10 Minuten zu jeder Arena.' },
];

export const ARENAS = [
  { id: 'worringen', name: 'Rütherschanze Worringen', address: 'Langeler Weg 23, 50769 Köln', lat: 51.0631420, lon: 6.8722528, boss: 'satoshi' },
  { id: 'huettenberg', name: 'Hüttenbergstraße', address: 'Hüttenbergstraße 55, 58091 Hagen', lat: 51.3440710, lon: 7.4877959, boss: 'schanze' },
  { id: 'pcsale', name: 'PC Sale', address: 'Augustastraße 1, 58089 Hagen', lat: 51.3589214, lon: 7.4631893, boss: 'ps3' },
  // v7: Keller unter der Rütherschanze, 25 m südlich / 15 m östlich versetzt, damit die Marker nicht übereinander liegen
  { id: 'keller', name: 'Keller der Rütherschanze', address: 'Langeler Weg 23, 50769 Köln (Keller)', lat: 51.0629174, lon: 6.8724671, boss: 'heizung' },
];

// spawn: 'anywhere' oder die id der Arena, um die der Rüther auftaucht.
// attacks = Spezial-Attacken: cost = Energie, fx = Animation (siehe battle-ui.js)
export const RUETHERS = [
  {
    id: 'christian', name: 'Christian', title: 'Herr der Netzwerke', btc: 100, catchChance: 0.5, spawn: 'anywhere',
    desc: 'Handelt mit Bitcoin, bei ihm steigt der Kurs immer um 70 %. Ex-Vice-President der Deutschen Bank.',
    attacks: [
      { name: 'Plus 70 Prozent', cost: 100, damage: 40, fx: 'chart-up', prop: 'chart-up' },
      { name: 'Vice-President-Handschlag', cost: 50, damage: 10, weaken: 8000, fx: 'handshake', prop: 'handshake' },
      { name: 'Werfen mit Dosenbier', cost: 50, damage: 20, fx: 'can', prop: 'beer-can' },
    ],
  },
  {
    id: 'hildegard', name: 'Hildegard', title: 'Herrscherin der Schanze', btc: 120, catchChance: 0.35, spawn: 'huettenberg',
    desc: 'Herrscht über die Rütherschanze. Ruft die Familie zu Hilfe.',
    attacks: [
      { name: 'Familientreffen', cost: 100, damage: 0, once: true, summonMs: 10_000, summon: [{ id: 'christian', name: 'Christian', damage: 4 }, { id: 'micha', name: 'Onkel Micha', damage: 4 }], fx: 'family', prop: 'family' },
      { name: 'Handtaschen-Hieb', cost: 50, damage: 20, fx: 'handbag', prop: 'handbag' },
    ],
  },
  {
    id: 'micha', name: 'Onkel Micha', title: 'Herrscher des PC Sale', btc: 100, catchChance: 0.35, spawn: 'pcsale',
    desc: 'Hat eine PS3 und baut sie zur Hardware-Wallet um.',
    attacks: [
      { name: 'Hardware-Wallet-Umbau', cost: 100, damage: 30, drain: true, fx: 'wallet', prop: 'wallet' },
      { name: 'Controllerwurf', cost: 50, damage: 25, fx: 'controller', prop: 'controller' },
    ],
  },
  {
    id: 'viktor', name: 'Viktor', title: 'Möchtegern-Herrscher der Börse', btc: 90, catchChance: 0.5, spawn: 'anywhere',
    desc: 'Stinkt stark. Hat vor der Börse in New York gestanden.',
    attacks: [
      { name: 'Giftgas', cost: 100, damage: 10, poison: { perSec: 5, ms: 8000 }, fx: 'gas', prop: 'gas' },
      { name: 'Ungeschlagene Argumentationslogik', cost: 50, damage: 10, stun: 3000, flavour: 'Deutsche Bank ist kein Geringverdiener.', fx: 'speech', prop: 'speech' },
    ],
  },
  {
    id: 'ramona', name: 'Ramona Rüther', title: 'Herrscherin der Arbeitslosigkeit', btc: 90, catchChance: 0.35, spawn: 'worringen',
    desc: 'Frau von Christian. Hat seit sieben Jahren offene M&Ms.',
    attacks: [
      { name: 'Abgelaufene M&Ms', cost: 100, damage: 15, poison: { perSec: 4, ms: 8000 }, fx: 'mms', prop: 'mms' },
      { name: 'Unlimited Credits', cost: 50, damage: 0, heal: 40, fx: 'bags', prop: 'bags' },
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
  // v7: Arena im Keller der Rütherschanze
  heizung: {
    id: 'heizung', name: 'Bitcoin-Heizung', btc: 500,
    fast: { name: 'Dosenbier-Aufguss', damage: 14, every: 2200, warn: 600, fx: 'heat' },
    charged: [
      { name: 'Plus 70 Grad', damage: 30, warn: 1200, poison: { perSec: 4, ms: 6000 }, fx: 'overheat' },
      { name: 'Umluft mit Viktor-Aroma', damage: 10, warn: 1200, stun: 1800, fx: 'fan' },
      { name: 'Hildegard zahlt den Strom', damage: 0, warn: 1200, heal: 50, fx: 'found' },
    ],
  },
  // v7: Shop-Beschwörung der Haunebu, keine Arena (Kampf-Modus 'haunebu')
  hitler: {
    id: 'hitler', name: 'Adolf Hitler', btc: 600,
    fast: { name: 'Krupp-Rede', damage: 16, every: 2300, warn: 600, fx: 'krupp', flavour: ['Wenn du meine Arbeit für richtig hältst …', 'Hart wie Kruppstahl!'] },
    charged: [
      { name: 'Wolfsschanzen-Beschwörung', damage: 0, warn: 1200, summon: [{ id: 'goebbels', name: 'Goebbels', damage: 3 }, { id: 'himmler', name: 'Himmler', damage: 3 }], summonMs: 10_000, fx: 'wolfsschanze' }, // Gegner-Helfer (Spec v7 §2b)
      { name: 'Flugscheiben-Strahl', damage: 20, warn: 1200, stun: 1500, fx: 'ray' },
      { name: 'Ab in den Bunker', damage: 0, warn: 1200, heal: 60, fx: 'bunker' },
    ],
  },
};

export const RUETHER_BY_ID = Object.fromEntries(RUETHERS.map(r => [r.id, r]));
export const ARENA_BY_ID = Object.fromEntries(ARENAS.map(a => [a.id, a]));

// v6: Sprüche. Der Humor des Spiels hängt an den echten Leuten: Diese Zeilen erscheinen beim Auftauchen
// (Fang-Screen), im Kampf (Sprechblase des Gegners, Banner der eigenen Attacke), beim Fang und beim Abhauen.
export const LINES = {
  christian: {
    appear: ['Plus 70 Prozent. Wie immer.', 'Ich war Vice President. Ich weiß, was ich tu.', 'Der Kurs geht hoch, egal was der Markt sagt.'],
    fight: ['Bei mir geht nichts runter.', 'Das hab ich bei der Deutschen Bank gelernt.', 'Dosenbier ist auch eine Anlageklasse.'],
    caught: ['Na gut. Aber nur gegen Provision.', 'Gute Investition. 70 Prozent garantiert.'],
    flee: ['Muss los, der Kurs ruft.', 'Christian ist weiter zum nächsten Deal.'],
  },
  hildegard: {
    appear: ['Auf der Schanze bestimme ich.', 'Christian! Micha! Kommt mal her!'],
    fight: ['Familientreffen. Jetzt.', 'Ich ruf die Jungs.', 'Die Handtasche ist nicht nur zum Tragen da.'],
    caught: ['Dann eben Familientreffen bei dir.', 'Aber sonntags bin ich auf der Schanze.'],
    flee: ['Hildegard ist zurück auf die Schanze.', 'Die Familie wartet.'],
  },
  micha: {
    appear: ['Die PS3 ist eine Hardware-Wallet, wenn man weiß wie.', 'Ich hab noch drei PS3 im Laden.'],
    fight: ['Controller kommt!', 'Deine Bitcoins? Jetzt meine.', 'Firmware hab ich selbst geschrieben.'],
    caught: ['Hast du zufällig noch eine PS3?', 'Okay, aber der PC Sale bleibt meiner.'],
    flee: ['Micha muss in den Laden, PC Sale macht gleich zu.', 'Onkel Micha baut lieber noch eine Wallet.'],
  },
  viktor: {
    appear: ['Deutsche Bank ist kein Geringverdiener.', 'Riechst du das? Das ist Erfolg.'],
    fight: ['Ungeschlagene Argumentationslogik.', 'Ich steh vor der Börse, du nicht.', 'Atme ruhig tief ein.'],
    caught: ['Ungeschlagene Argumentationslogik: Du hast gewonnen.', 'Ich wollte eh zu dir.'],
    flee: ['Viktor ist weg. Der Geruch bleibt.', 'Viktor ist zur Börse gelaufen. Rückwärts.'],
  },
  ramona: {
    appear: ['Willst du ein M&M? Die sind noch gut.', 'Unlimited Credits bei Trollkids!'],
    fight: ['Sieben Jahre gereift.', 'Ich geh shoppen, du gehst k.o.', 'GAP hat gerade Sale.'],
    caught: ['Okay, aber nur mit Kundenkarte.', 'Ich bring M&Ms mit.'],
    flee: ['Ramona muss noch zu GAP.', 'Ramona ist zu Trollkids. Unlimited Credits.'],
  },
  satoshi: { appear: ['Wer ich bin? Unwichtig.', 'Ich hab Bitcoin erfunden. Und du?'], fight: ['Halving.', 'Not your keys, not your coins.'] },
  schanze: { appear: ['Die Schanze gehört mir.', 'Mein Kopf ist mehr wert als deiner.'], fight: ['Kurssturz!', 'Mining läuft.'] },
  ps3: { appear: ['*lautes Lüfterrauschen*', 'Bitte Firmware aktualisieren.'], fight: ['Yellow Light of Death!', 'Disc-Fehler.'] },
  heizung: {
    appear: ['*brummt mit 3000 Watt*', 'Im Keller hat es 38 Grad. Gemütlich.', 'Ich heize das ganze Haus. Mit Bitcoin.'],
    fight: ['Abwärme ist auch Rendite.', 'Aufguss mit Dosenbier!', 'Plus 70 Grad, wie bei Christian.', 'Die Stromrechnung geht an Hildegard.', 'Wer friert, hat zu wenig Hashrate.'],
  },
  // Untergang-Meme: Hitler als tobender Verlierer. Keine Parolen, keine Symbole (siehe Spec v7 §0).
  hitler: {
    appear: ['Alle, die keine Bitcoin haben, verlassen sofort den Raum.', 'Die Flugscheibe gehört mir!', 'Wer hat die Flugscheibe ohne mich gestartet?!'],
    fight: ['Das war ein BEFEHL!', 'Wieso steigt bei Christian alles um 70 Prozent?!', 'Wer hat den Private Key verloren?!', 'Die Flugscheibe hätte längst fliegen müssen!', 'Ich will sofort einen Kurs von 100.000!'],
    defeat: ['Nehmt die Scheibe. Ich wollte eh nie fliegen.', 'Und die Wunderwaffe springt auch nicht an.'],
  },
};
export const pickLine = (id, kind, rng = Math.random) => {
  const list = LINES[id]?.[kind];
  return list && list.length ? list[Math.floor(rng() * list.length)] : '';
};
