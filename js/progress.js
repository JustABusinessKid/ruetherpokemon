import { CONST, RARITIES, RARITY_BY_ID, RUETHERS, RUETHER_BY_ID, SHOP, ARENA_BY_ID } from './data.js';
import { ringBonus } from './catch-logic.js';

// ---------- Seltenheit ----------
export function rollRarity(rng) {
  const total = RARITIES.reduce((s, r) => s + r.weight, 0);
  let x = rng() * total;
  for (const r of RARITIES) { if (x < r.weight) return r.id; x -= r.weight; }
  return RARITIES[0].id;
}
export const rarityOf = id => RARITY_BY_ID[id] || RARITY_BY_ID.normal;

// ---------- Stats ----------
export function instanceMult(inst) {
  return rarityOf(inst?.rarity).mult * (1 + CONST.LEVEL_STEP * ((inst?.level || 1) - 1));
}
export function fighterStats(def, inst) {
  const mult = instanceMult(inst);
  return { btc: Math.round(def.btc * mult), power: mult };
}

// ---------- Power-Up ----------
export function levelCost(level) {
  return level >= CONST.LEVEL_MAX ? null : CONST.LEVEL_COST * level;
}
export function powerUp(save, uid) {
  const inst = save.box.find(i => i.uid === uid);
  if (!inst) return { ok: false, reason: 'unbekannt' };
  const cost = levelCost(inst.level);
  if (cost == null) return { ok: false, reason: 'max' };
  if (save.sats < cost) return { ok: false, reason: 'sats' };
  save.sats -= cost;
  inst.level += 1;
  return { ok: true, cost, level: inst.level };
}

// ---------- Fangen ----------
export function catchChanceV3(base, rarityId, ringScale, superCoin) {
  const c = base - rarityOf(rarityId).catchPenalty + ringBonus(ringScale).bonus + (superCoin ? CONST.SUPERCOIN_BONUS : 0);
  return Math.min(CONST.MAX_CATCH_CHANCE, Math.max(CONST.MIN_CATCH_CHANCE, Math.round(c * 100) / 100));
}
export function newUid(save) {
  save.nextUid = save.nextUid || 1;
  const uid = 'r' + save.nextUid;
  save.nextUid += 1;
  return uid;
}
// Mutiert save: neues Exemplar, Dex, Sats, Team-Auffüllung. Gibt Belohnung zurück.
export function catchReward(save, id, rarityId, now = 0) {
  const r = rarityOf(rarityId);
  const uid = newUid(save);
  save.box.push({ uid, id, rarity: r.id, level: 1, caughtAt: now });
  const key = `${id}:${r.id}`;
  const newDex = !save.dex[key];
  if (newDex) save.dex[key] = true;
  const sats = r.sats + (newDex ? CONST.DEX_BONUS : 0);
  save.sats += sats;
  save.stats.catches += 1;
  if (save.team.length < CONST.TEAM_SIZE) save.team.push(uid);
  return { sats, newDex, uid };
}
export const DEX_TOTAL = RUETHERS.length * RARITIES.length;
export const dexCount = save => Object.keys(save.dex).length;

// ---------- Arenen ----------
export const arenaScale = level => 1 + CONST.ARENA_SCALE * (level - 1);
export const arenaReward = level => CONST.ARENA_WIN_BASE * level;
export function arenaWin(save, arenaId, leaderUid) {
  const level = save.arenaLevels[arenaId] || 1;
  const sats = arenaReward(level);
  save.sats += sats;
  save.stats.arenaWins += 1;
  save.arenaOwners[arenaId] = leaderUid;
  if (level >= CONST.ARENA_LEVELS) save.arenaMastered[arenaId] = true;
  else save.arenaLevels[arenaId] = level + 1;
  return { sats, level, newLevel: save.arenaLevels[arenaId] || level, mastered: !!save.arenaMastered[arenaId] };
}

// ---------- Shop ----------
export const lureActive = (save, now) => (save.lureUntil || 0) > now;
export function buyItem(save, itemId, now = 0) {
  const item = SHOP.find(i => i.id === itemId);
  if (!item) return { ok: false, reason: 'unbekannt' };
  if (itemId === 'haunebu' && save.flugscheibe) return { ok: false, reason: 'besitz' };
  if (save.sats < item.cost) return { ok: false, reason: 'sats' };
  save.sats -= item.cost;
  if (itemId === 'haunebu') return { ok: true, summon: true }; // Beschwörung startet den Hitler-Kampf, kein Inventar
  if (itemId === 'lockmodul') save.lureUntil = Math.max(now, save.lureUntil || 0) + CONST.LURE_MS;
  else save.items[itemId] = (save.items[itemId] || 0) + 1;
  return { ok: true };
}

// ---------- v7: Haunebu-Reichsflugscheibe ----------
export function haunebuWin(save) {
  const sats = CONST.HAUNEBU_WIN_SATS;
  save.flugscheibe = true;
  save.sats += sats;
  save.stats.haunebuWins = (save.stats.haunebuWins || 0) + 1;
  return { sats };
}
// Ein neuer Flug ersetzt einen laufenden (volle Kosten, 10 Minuten neu).
export function startBeam(save, arenaId, now) {
  if (!save.flugscheibe) return { ok: false, reason: 'keine' };
  if (!ARENA_BY_ID[arenaId]) return { ok: false, reason: 'arena' };
  if (save.sats < CONST.HAUNEBU_BEAM_COST) return { ok: false, reason: 'sats' };
  save.sats -= CONST.HAUNEBU_BEAM_COST;
  const until = now + CONST.HAUNEBU_BEAM_MS;
  save.beam = { arenaId, until };
  return { ok: true, until };
}
export const activeBeam = (save, now) => (save.beam && save.beam.until > now ? save.beam : null);
export function endBeam(save) { save.beam = null; }

// ---------- XP / Trainer-Level ----------
export const xpForLevel = level => CONST.LEVEL_XP_STEP * level;
export function levelProgress(save) {
  const level = save.trainerLevel || 1;
  return { level, xp: save.xp || 0, need: xpForLevel(level) };
}
export function addXp(save, n) {
  save.xp = (save.xp || 0) + Math.max(0, Math.floor(n));
  save.trainerLevel = save.trainerLevel || 1;
  const levelUps = [];
  let sats = 0;
  while (save.xp >= xpForLevel(save.trainerLevel)) {
    save.xp -= xpForLevel(save.trainerLevel);
    save.trainerLevel += 1;
    levelUps.push(save.trainerLevel);
    sats += CONST.LEVELUP_SATS * save.trainerLevel;
  }
  save.sats += sats;
  return { levelUps, sats };
}

// ---------- Fusion ----------
export function nextRarity(id) {
  const i = RARITIES.findIndex(r => r.id === id);
  return i >= 0 && i < RARITIES.length - 1 ? RARITIES[i + 1].id : null;
}
export function canFuse(save, id, rarityId) {
  return !!nextRarity(rarityId) && save.box.filter(i => i.id === id && i.rarity === rarityId).length >= CONST.FUSION_COUNT;
}
// Verbraucht die drei niedrigsten Level; Ergebnis hat max(level) und die nächste Seltenheit.
export function fuse(save, id, rarityId, now = 0) {
  if (!canFuse(save, id, rarityId)) return { ok: false };
  const group = save.box.filter(i => i.id === id && i.rarity === rarityId).sort((a, b) => a.level - b.level);
  const used = group.slice(0, CONST.FUSION_COUNT);
  const usedUids = new Set(used.map(i => i.uid));
  save.box = save.box.filter(i => !usedUids.has(i.uid));
  save.team = save.team.filter(uid => !usedUids.has(uid));
  const rarity = nextRarity(rarityId);
  const inst = { uid: newUid(save), id, rarity, level: Math.max(...used.map(i => i.level)), caughtAt: now };
  save.box.push(inst);
  const key = `${id}:${rarity}`;
  const newDex = !save.dex[key];
  if (newDex) { save.dex[key] = true; save.sats += CONST.DEX_BONUS; }
  save.stats.fusions = (save.stats.fusions || 0) + 1;
  if (save.team.length < CONST.TEAM_SIZE) save.team.push(inst.uid);
  return { ok: true, inst, used, newDex };
}

// ---------- v6: Füttern, Verkaufen, Level-Ups ----------
const rank = id => RARITIES.findIndex(r => r.id === id);
const byUid = (save, uid) => save.box.find(i => i.uid === uid);
const dropUid = (save, uid) => { save.box = save.box.filter(i => i.uid !== uid); };

export const sellValue = rarityId => CONST.SELL_MULT * rarityOf(rarityId).sats;

// Schwächstes passendes Duplikat: gleicher Rüther, Seltenheit ≤ Ziel, nicht im Team, nicht das Ziel.
export function pickFood(save, targetUid) {
  const t = byUid(save, targetUid);
  if (!t) return null;
  const food = save.box
    .filter(i => i.uid !== t.uid && i.id === t.id && rank(i.rarity) <= rank(t.rarity) && !save.team.includes(i.uid))
    .sort((a, b) => rank(a.rarity) - rank(b.rarity) || a.level - b.level);
  return food[0]?.uid || null;
}
export function feed(save, targetUid, foodUid) {
  const t = byUid(save, targetUid), f = byUid(save, foodUid);
  if (!t || !f) return { ok: false, reason: 'unbekannt' };
  if (t === f || t.id !== f.id || rank(f.rarity) > rank(t.rarity)) return { ok: false, reason: 'falsch' };
  if (save.team.includes(f.uid)) return { ok: false, reason: 'team' };
  if (t.level >= CONST.LEVEL_MAX) return { ok: false, reason: 'max' };
  t.level = Math.min(CONST.LEVEL_MAX, t.level + CONST.FEED_LEVELS);
  dropUid(save, f.uid);
  return { ok: true, level: t.level };
}

// Team und das letzte Exemplar einer Seltenheit (Dex-Schutz) bleiben.
export function sell(save, uid) {
  const inst = byUid(save, uid);
  if (!inst) return { ok: false, reason: 'unbekannt' };
  if (save.team.includes(uid)) return { ok: false, reason: 'team' };
  if (save.box.filter(i => i.id === inst.id && i.rarity === inst.rarity).length < 2) return { ok: false, reason: 'letztes' };
  const sats = sellValue(inst.rarity);
  dropUid(save, uid);
  save.sats += sats;
  return { ok: true, sats };
}
// Verkauft alles außer Team und dem besten (höchstes Level) Exemplar je Seltenheit; bei Gleichstand gilt das Teammitglied.
export function sellDuplicates(save, id) {
  const team = new Set(save.team);
  const keep = new Set(save.team), seen = new Set();
  const mine = save.box.filter(i => i.id === id).sort((a, b) => b.level - a.level || team.has(b.uid) - team.has(a.uid));
  for (const i of mine) if (!seen.has(i.rarity)) { seen.add(i.rarity); keep.add(i.uid); }
  const sold = mine.filter(i => !keep.has(i.uid));
  const sats = sold.reduce((s, i) => s + sellValue(i.rarity), 0);
  const soldUids = new Set(sold.map(i => i.uid));
  save.box = save.box.filter(i => !soldUids.has(i.uid));
  save.sats += sats;
  return { count: sold.length, sats };
}

export function levelUpUids(save, uids, n = CONST.WIN_LEVEL_UP) {
  const out = [];
  for (const uid of new Set(uids)) {
    const inst = byUid(save, uid);
    if (!inst || inst.level >= CONST.LEVEL_MAX) continue;
    inst.level = Math.min(CONST.LEVEL_MAX, inst.level + n);
    out.push({ uid, level: inst.level });
  }
  return out;
}

// ---------- Spielstand v3 ----------
export function emptySaveV3() {
  return {
    version: 3, box: [], team: [], sats: 0, dex: {}, arenaLevels: {}, arenaMastered: {}, arenaOwners: {},
    items: { lockmodul: 0, supercoin: 0 }, lureUntil: 0, victoryShown: false, flugscheibe: false, beam: null,
    stats: { catches: 0, arenaWins: 0, stops: 0, fusions: 0, specials: 0, dodges: 0, maxCombo: 0, superHits: 0, haunebuWins: 0 },
    nextUid: 1,
    profile: null, xp: 0, trainerLevel: 1,
    quests: { date: '', list: [] }, streak: { count: 0, lastDay: '' }, achievements: {}, stopCooldowns: {},
    settings: { sound: true, haptics: true }, seen: { onboarding: false, iosHint: false },
  };
}
export const emptySaveV2 = emptySaveV3; // Kompatibilität für ältere Importe

function upgradeToV3(s) {
  const empty = emptySaveV3();
  return {
    ...empty, ...s, version: 3,
    items: { ...empty.items, ...(s.items || {}) },
    stats: { ...empty.stats, ...(s.stats || {}) },
    settings: { ...empty.settings, ...(s.settings || {}) },
    seen: { ...empty.seen, ...(s.seen || {}) },
    quests: s.quests && Array.isArray(s.quests.list) ? s.quests : empty.quests,
    streak: s.streak && typeof s.streak.count === 'number' ? s.streak : empty.streak,
    achievements: s.achievements && typeof s.achievements === 'object' ? s.achievements : {},
    stopCooldowns: s.stopCooldowns && typeof s.stopCooldowns === 'object' ? s.stopCooldowns : {},
    profile: s.profile && typeof s.profile.nickname === 'string' && s.profile.nickname.length >= 2 ? s.profile : null,
    flugscheibe: s.flugscheibe === true,
    beam: s.beam && typeof s.beam.arenaId === 'string' && typeof s.beam.until === 'number' ? s.beam : null,
  };
}
export function migrate(d) {
  if (!d || typeof d !== 'object') return emptySaveV3();
  if (d.version === 3 || d.version === 2) return upgradeToV3(d);
  if (d.version !== 1) return emptySaveV3();
  const s = emptySaveV3();
  const uidOf = {};
  let catches = 0;
  for (const [id, c] of Object.entries(d.caught || {})) {
    if (!RUETHER_BY_ID[id]) continue;
    const uid = newUid(s);
    s.box.push({ uid, id, rarity: 'normal', level: Math.min(CONST.LEVEL_MAX, 1 + Math.floor((c.bonusBtc || 0) / 10)), caughtAt: 0 });
    s.dex[`${id}:normal`] = true;
    uidOf[id] = uid;
    catches += c.count || 1;
  }
  s.team = (d.team || []).map(id => uidOf[id]).filter(Boolean);
  for (const id of d.arenasBeaten || []) s.arenaLevels[id] = 2;
  for (const [aid, rid] of Object.entries(d.arenaOwners || {})) if (uidOf[rid]) s.arenaOwners[aid] = uidOf[rid];
  s.sats = 50 * catches;
  s.stats.catches = catches;
  s.victoryShown = !!d.victoryShown;
  return s;
}
