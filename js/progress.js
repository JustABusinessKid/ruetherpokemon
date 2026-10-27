import { CONST, RARITIES, RARITY_BY_ID, RUETHERS, RUETHER_BY_ID, SHOP, ARENAS, ARENA_BY_ID } from './data.js';
import { ringBonus } from './catch-logic.js';
import { POOLS, FIXED } from './quest/abilities.js';

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
  if (!ARENA_BY_ID[arenaId]?.virtual) save.arenaOwners[arenaId] = leaderUid; // v12: in Moshes Anzeige wird niemand stationiert (Spec v12 §1)
  if (level >= CONST.ARENA_LEVELS) save.arenaMastered[arenaId] = true;
  else save.arenaLevels[arenaId] = level + 1;
  return { sats, level, newLevel: save.arenaLevels[arenaId] || level, mastered: !!save.arenaMastered[arenaId] };
}

// ---------- Shop ----------
export const lureActive = (save, now) => (save.lureUntil || 0) > now;
export function buyItem(save, itemId, now = 0) {
  const item = SHOP.find(i => i.id === itemId);
  if (!item) return { ok: false, reason: 'unbekannt' };
  if (itemId === 'haunebu') return summonHaunebu(save, now);
  if (itemId === 'investmentcode' && save.items.investmentcode) return { ok: false, reason: 'besitz' }; // v12 §3: einmalig
  if (save.sats < item.cost) return { ok: false, reason: 'sats' };
  save.sats -= item.cost;
  if (itemId === 'lockmodul') save.lureUntil = Math.max(now, save.lureUntil || 0) + CONST.LURE_MS;
  else save.items[itemId] = (save.items[itemId] || 0) + 1;
  return { ok: true };
}

// ---------- v7/v8: Haunebu-Reichsflugscheibe ----------
// v8 §1: Jede Beschwörung (Kauf, egal ob Sieg) kostet 1000 mehr, höchstens 8000. Ein Sieg über Hitler öffnet
// ein 10-Minuten-Fenster mit freien Flügen; währenddessen ist keine neue Beschwörung möglich.
// summonPending = bezahlte Sats der Beschwörung, bis der Hitler-Kampf entschieden ist (Neuladen setzt ihn fort, app.js).
export const summonCost = save => Math.min(CONST.HAUNEBU_SUMMON_BASE + CONST.HAUNEBU_SUMMON_STEP * (save.stats.haunebuSummons || 0), CONST.HAUNEBU_SUMMON_MAX);
export const haunebuActive = (save, now) => (save.haunebuUntil || 0) > now;
function summonHaunebu(save, now) {
  if (haunebuActive(save, now)) return { ok: false, reason: 'aktiv' };
  const cost = summonCost(save);
  if (save.sats < cost) return { ok: false, reason: 'sats' };
  save.sats -= cost;
  save.stats.haunebuSummons = (save.stats.haunebuSummons || 0) + 1;
  save.summonPending = cost;
  return { ok: true, summon: true, cost }; // Beschwörung startet den Hitler-Kampf, kein Inventar
}
export function haunebuWin(save, now = Date.now()) {
  const sats = CONST.HAUNEBU_WIN_SATS;
  save.haunebuUntil = now + CONST.HAUNEBU_USE_MS;
  save.sats += sats;
  save.stats.haunebuWins = (save.stats.haunebuWins || 0) + 1;
  return { sats, until: save.haunebuUntil };
}
// v8: Quest-Start verbrauchte die Haunebu. v9 §1: Quests verbrauchen sie nicht mehr, die Funktion bleibt für alte Aufrufer.
export function consumeHaunebu(save, now) { save.haunebuUntil = Math.min(save.haunebuUntil || 0, now); }
// v9 §1: Gehört sie dir schon, kaufst du für HAUNEBU_EXTEND_COST weitere HAUNEBU_EXTEND_MS, ohne Hitler-Kampf und ohne
// dass der Beschwörungspreis steigt. Ein aktiver Beam übernimmt das neue Ende.
export function extendHaunebu(save, now) {
  if (!haunebuActive(save, now)) return { ok: false, reason: 'keine' };
  if (save.sats < CONST.HAUNEBU_EXTEND_COST) return { ok: false, reason: 'sats' };
  save.sats -= CONST.HAUNEBU_EXTEND_COST;
  save.haunebuUntil += CONST.HAUNEBU_EXTEND_MS;
  const beam = activeBeam(save, now);
  if (beam) beam.until = save.haunebuUntil;
  return { ok: true, until: save.haunebuUntil };
}
// Flüge sind im Fenster frei und beliebig oft; der Beam endet mit dem Fenster. from = Heimatort, bleibt beim Weiterspringen.
export function startBeam(save, arenaId, now, from = save.beam?.from ?? null) {
  if (!haunebuActive(save, now)) return { ok: false, reason: 'keine' };
  if (!ARENA_BY_ID[arenaId]) return { ok: false, reason: 'arena' };
  save.beam = { arenaId, until: save.haunebuUntil, from };
  return { ok: true, until: save.haunebuUntil };
}
export const activeBeam = (save, now) => (save.beam && save.beam.until > now && haunebuActive(save, now) ? save.beam : null);
export function endBeam(save) { save.beam = null; }

// ---------- v8/v9: Haunebu-Quests (Spec v8 §5.1, §5.6; v9 §7) ----------
export const questsUnlocked = save => ARENAS.every(a => save.arenaMastered[a.id]);
// Sats je Mission: coin × score (abgelieferte Münzen) + base − kieser × Kieser-Trainings, mindestens min;
// bei Erfolg + done (Abschluss) + clean (ohne Alarm); davon − video × Moshes Videos, nie unter 0
export const QUEST_SATS = {
  tachionenraub: { coin: 300, base: 0, done: 1000 },
  rabino: { coin: 500, base: 0, done: 2000, video: 1000 },                  // v12 §4: je Sack 500, ab 3 Säcken +2000, jedes Video −1000
  hangar: { coin: 0, base: 2500, done: 0 },
  ps3: { coin: 0, base: 2500, done: 0 },
  keller: { coin: 0, base: 2000, done: 0, clean: 1000 },
  camping: { coin: 0, base: 12_000, done: 0, kieser: 1000, min: 10_000 }, // v9 §3: 12k, je Kieser-Training −1k, nie unter 10k
  bruch: { coin: 0, base: 6500, done: 0 },                                  // v9 §4: jedes Mal 6,5k, Erwischen kostet extra.fine
};
const QUEST_FAIL = 0.1;
const nat = n => (Number.isFinite(+n) ? Math.max(0, Math.floor(+n)) : 0);
// result 'success' | 'fail' | 'abort' (Aufgeben zählt wie Misserfolg: 10 % der Sats und XP, kein Abschluss). Trostgeld und
// Trost-XP nur mit Fortschritt (score > 0): seit die Quest die Haunebu nicht verbraucht, wäre „Los!“ + Aufgeben sonst gratis Geld.
// extra.kieser: Kieser-Trainings dieser Runde, extra.fine: Strafe (Ranger hat erwischt; dann kein Trostgeld), nie unter 0 Sats.
// extra.videos: Moshes Videos dieser Runde (v12 §4), jedes kostet r.video von der Gesamtsumme, nie unter 0.
// Sats werden gutgeschrieben, XP gibt der Aufrufer per gainXp weiter (wie arenaWin). null bei unbekannter Mission.
// Rückgabe fine = tatsächlich abgezogene Strafe. questLog[id] = { best, done, wins, kieser, fines, clean }.
export function questResult(save, missionId, result, score = 0, alarmFree = false, extra = {}) {
  const r = QUEST_SATS[missionId];
  if (!r) return null;
  const ok = result === 'success';
  score = nat(score);
  const kieser = nat(extra?.kieser), videos = nat(extra?.videos), fineDue = nat(extra?.fine);
  const full = Math.max(r.min || 0, r.coin * score + r.base - (r.kieser || 0) * kieser);
  const gross = ok ? full + r.done + (alarmFree ? r.clean || 0 : 0) : fineDue || !score ? 0 : Math.round(full * QUEST_FAIL);
  const sats = Math.max(0, gross - (r.video || 0) * videos);
  const xp = ok ? CONST.QUEST_XP : score ? Math.round(CONST.QUEST_XP * QUEST_FAIL) : 0;
  save.questLog = save.questLog || {};
  const prev = save.questLog[missionId] || { best: 0, done: false };
  const best = Math.max(prev.best || 0, score);
  save.questLog[missionId] = {
    best, done: !!prev.done || ok,
    wins: (prev.wins ?? (prev.done ? 1 : 0)) + (ok ? 1 : 0), // v8-Einträge kennen nur done
    kieser: (prev.kieser || 0) + kieser,
    fines: (prev.fines || 0) + (fineDue ? 1 : 0),
    clean: !!prev.clean || (ok && !!alarmFree),
  };
  save.sats += sats;
  const fine = Math.min(save.sats, fineDue);
  save.sats -= fine;
  return { sats, xp, best, newBest: score > (prev.best || 0), firstDone: ok && !prev.done, fine };
}

// ---------- v10: Quest-Fähigkeiten (Spec v10 §1, §3) ----------
// Gehören dem Rüther an sich, nicht dem Exemplar: save.questAbilities[rid] = { levels: { aid: 1|2|3 }, slot: aid|null }.
// Feste haben ohne Eintrag Stufe 1, Pool-Fähigkeiten erst nach dem Kauf. Der dritte Slot nimmt nur gekaufte Pool-Fähigkeiten.
const isFixed = (rid, aid) => !!FIXED[rid]?.includes(aid);
const isPool = (rid, aid) => !!POOLS[rid]?.includes(aid);
const abEntry = (save, rid) => ((save.questAbilities ||= {})[rid] ||= { levels: {}, slot: null });
export function abilityLevel(save, rid, aid) {
  const lv = save.questAbilities?.[rid]?.levels?.[aid] || 0;
  return isFixed(rid, aid) ? Math.max(1, lv) : isPool(rid, aid) ? lv : 0;
}
export function buyAbility(save, rid, aid) {
  if (!isPool(rid, aid)) return { ok: false, reason: 'pool' };
  if (abilityLevel(save, rid, aid)) return { ok: false, reason: 'besitz' };
  if (save.sats < CONST.ABILITY_BUY) return { ok: false, reason: 'sats' };
  save.sats -= CONST.ABILITY_BUY;
  const e = abEntry(save, rid);
  e.levels[aid] = 1;
  if (!e.slot) e.slot = aid; // die erste gekaufte wird ausgerüstet
  return { ok: true, cost: CONST.ABILITY_BUY, level: 1 };
}
export function upgradeAbility(save, rid, aid) {
  const lv = abilityLevel(save, rid, aid);
  if (!lv) return { ok: false, reason: 'fehlt' };
  const cost = CONST.ABILITY_UP[lv + 1];
  if (cost == null) return { ok: false, reason: 'max' };
  if (save.sats < cost) return { ok: false, reason: 'sats' };
  save.sats -= cost;
  abEntry(save, rid).levels[aid] = lv + 1;
  return { ok: true, cost, level: lv + 1 };
}
// Kostenlos; null leert den Slot
export function equipAbility(save, rid, aid) {
  if (aid != null && !isPool(rid, aid)) return { ok: false, reason: 'pool' };
  if (aid != null && !abilityLevel(save, rid, aid)) return { ok: false, reason: 'fehlt' };
  abEntry(save, rid).slot = aid ?? null;
  return { ok: true };
}
// [fest, fest, Slot|null] mit Stufen, so bekommt createQuest sie pro Einheit
export function loadoutFor(save, rid) {
  const slot = save.questAbilities?.[rid]?.slot;
  const one = aid => ({ id: aid, level: abilityLevel(save, rid, aid) });
  return [...(FIXED[rid] || []).map(one), isPool(rid, slot) && abilityLevel(save, rid, slot) ? one(slot) : null];
}
// Migration: jeder Rüther bekommt einen Eintrag, nur bekannte IDs mit Stufe 1–3, Slot nur mit gekaufter Pool-Fähigkeit
function cleanQuestAbilities(qa) {
  const out = {};
  for (const rid of Object.keys(FIXED)) {
    const old = qa?.[rid], levels = {};
    for (const aid of [...FIXED[rid], ...POOLS[rid]]) if ([1, 2, 3].includes(old?.levels?.[aid])) levels[aid] = old.levels[aid];
    out[rid] = { levels, slot: isPool(rid, old?.slot) && levels[old.slot] ? old.slot : null };
  }
  return out;
}

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
    items: { lockmodul: 0, supercoin: 0, investmentcode: 0 }, lureUntil: 0, victoryShown: false, haunebuUntil: 0, summonPending: 0, beam: null, questLog: {}, questAbilities: cleanQuestAbilities(),
    ad: null, // v12: Moshes Anzeige { until, next, extended } (js/ad.js); null = erstes Fenster beim nächsten Kartenbesuch
    stats: { catches: 0, arenaWins: 0, stops: 0, fusions: 0, specials: 0, dodges: 0, maxCombo: 0, superHits: 0, haunebuWins: 0, haunebuSummons: 0, moshe: 0 },
    nextUid: 1,
    profile: null, xp: 0, trainerLevel: 1,
    quests: { date: '', list: [] }, streak: { count: 0, lastDay: '' }, achievements: {}, stopCooldowns: {},
    settings: { sound: true, haptics: true }, seen: { onboarding: false, iosHint: false },
  };
}
export const emptySaveV2 = emptySaveV3; // Kompatibilität für ältere Importe

// Spielstand-Prüfung (Laden und Import): kaputte oder von Hand bearbeitete Felder legen die App sonst beim Start lahm
const own = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const nums = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, nat(v)]));
// nur bekannte Arenen (ARENA_BY_ID, also auch die Anzeige-Arena); f(v) == null wirft den Eintrag raus
const perArena = (o, f) => Object.fromEntries(Object.entries(obj(o)).filter(([id]) => own(ARENA_BY_ID, id)).map(([id, v]) => [id, f(v)]).filter(([, v]) => v != null));
// Exemplare: bekannter Rüther, gültige Seltenheit, Level 1..LEVEL_MAX; fehlende oder doppelte uid bekommt eine neue
// (doppelte würde sell/feed beide Exemplare entfernen lassen). nextUid liegt danach über allen rN der alten Liste, auch der
// verworfenen Einträge: Team und Arena-Besitzer, die auf diese zeigen, treffen so kein neu nummeriertes Exemplar.
function cleanBox(list, nextUid) {
  const seen = new Set(), box = [], fix = [];
  list = Array.isArray(list) ? list : [];
  let n = Math.max(1, nat(nextUid));
  for (const i of list) { const m = /^r(\d+)$/.exec(i?.uid); if (m) n = Math.max(n, +m[1] + 1); }
  for (const i of list) {
    if (!i || typeof i !== 'object' || !own(RUETHER_BY_ID, i.id)) continue;
    const inst = { ...i, rarity: own(RARITY_BY_ID, i.rarity) ? i.rarity : 'normal', level: Math.min(CONST.LEVEL_MAX, Math.max(1, nat(i.level))) };
    if ((typeof i.uid === 'string' ? i.uid : Number.isFinite(i.uid)) && !seen.has(i.uid)) seen.add(i.uid); else fix.push(inst); // Test-Stände nutzen auch Zahlen
    box.push(inst);
  }
  for (const inst of fix) inst.uid = `r${n++}`;
  return { box, nextUid: n };
}

// v8: save.flugscheibe (v7) entfällt, alte Besitzer beschwören neu (haunebuUntil 0, haunebuSummons 0)
function upgradeToV3({ flugscheibe, ...s }) {
  const empty = emptySaveV3();
  const { box, nextUid } = cleanBox(s.box, s.nextUid), uids = new Set(box.map(i => i.uid));
  const profile = obj(s.profile), quests = obj(s.quests), streak = obj(s.streak);
  return {
    ...empty, ...s, version: 3, box, nextUid,
    team: [...new Set(Array.isArray(s.team) ? s.team : [])].filter(uid => uids.has(uid)).slice(0, CONST.TEAM_SIZE),
    sats: nat(s.sats), xp: nat(s.xp), trainerLevel: Math.max(1, nat(s.trainerLevel)), summonPending: nat(s.summonPending),
    dex: Object.fromEntries(Object.keys(obj(s.dex)).filter(k => { const [id, r] = k.split(':'); return own(RUETHER_BY_ID, id) && own(RARITY_BY_ID, r); }).map(k => [k, true])),
    arenaLevels: perArena(s.arenaLevels, v => Math.min(CONST.ARENA_LEVELS, Math.max(1, nat(v)))),
    arenaMastered: perArena(s.arenaMastered, v => (v ? true : null)),
    arenaOwners: perArena(s.arenaOwners, v => (typeof v === 'string' ? v : null)),
    items: nums({ ...empty.items, ...obj(s.items) }),
    stats: nums({ ...empty.stats, ...obj(s.stats) }),
    settings: { ...empty.settings, ...obj(s.settings) },
    seen: { ...empty.seen, ...obj(s.seen) },
    quests: Array.isArray(quests.list) ? { ...quests, list: quests.list.filter(q => q && typeof q === 'object') } : empty.quests,
    streak: typeof streak.count === 'number' ? streak : empty.streak,
    achievements: obj(s.achievements),
    stopCooldowns: obj(s.stopCooldowns),
    profile: typeof profile.nickname === 'string' && profile.nickname.length >= 2 ? profile : null,
    lureUntil: Number.isFinite(s.lureUntil) ? s.lureUntil : 0,
    victoryShown: !!s.victoryShown,
    haunebuUntil: Number.isFinite(s.haunebuUntil) ? s.haunebuUntil : 0,
    questLog: obj(s.questLog),
    beam: s.beam && typeof s.beam.arenaId === 'string' && typeof s.beam.until === 'number' ? s.beam : null,
    questAbilities: cleanQuestAbilities(s.questAbilities),
    ad: s.ad && Number.isFinite(s.ad.until) ? { until: nat(s.ad.until), next: nat(s.ad.next), extended: !!s.ad.extended } : null,
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
