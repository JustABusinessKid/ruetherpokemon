import { CONST, RARITIES, RARITY_BY_ID, RUETHERS, RUETHER_BY_ID, SHOP } from './data.js';
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
  if (save.sats < item.cost) return { ok: false, reason: 'sats' };
  save.sats -= item.cost;
  if (itemId === 'lockmodul') save.lureUntil = Math.max(now, save.lureUntil || 0) + CONST.LURE_MS;
  else save.items[itemId] = (save.items[itemId] || 0) + 1;
  return { ok: true };
}

// ---------- Spielstand ----------
export function emptySaveV2() {
  return {
    version: 2, box: [], team: [], sats: 0, dex: {}, arenaLevels: {}, arenaMastered: {}, arenaOwners: {},
    items: { lockmodul: 0, supercoin: 0 }, lureUntil: 0, victoryShown: false,
    stats: { catches: 0, arenaWins: 0 }, nextUid: 1,
  };
}
export function migrate(d) {
  const empty = emptySaveV2();
  if (!d || typeof d !== 'object') return empty;
  if (d.version === 2) return { ...empty, ...d, items: { ...empty.items, ...(d.items || {}) }, stats: { ...empty.stats, ...(d.stats || {}) } };
  if (d.version !== 1) return empty;
  const s = empty;
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
