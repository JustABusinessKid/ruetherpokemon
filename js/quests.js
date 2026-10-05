import { CONST, QUESTS, ACHIEVEMENTS, RUETHERS } from './data.js';
import { dexCount, DEX_TOTAL } from './progress.js';

export const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// FNV-1a, deterministischer Tageszufall
export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h;
}
export function seededRng(seed) {
  let x = (seed >>> 0) || 1;
  return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
}

export function dailyQuestIds(dateStr) {
  const rng = seededRng(hashStr('quests:' + dateStr));
  const pool = QUESTS.map(q => q.id);
  const out = [];
  while (out.length < 3) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return out;
}
// true, wenn neue Quests gesetzt wurden
export function ensureDailyQuests(save, dateStr) {
  if (save.quests?.date === dateStr && save.quests.list?.length) return false;
  save.quests = { date: dateStr, list: dailyQuestIds(dateStr).map(id => ({ id, progress: 0, done: false, claimed: false })) };
  return true;
}
export function trackQuest(save, kind, n = 1) {
  let changed = false;
  for (const q of save.quests?.list || []) {
    const def = QUESTS.find(d => d.id === q.id);
    if (!def || def.kind !== kind || q.done) continue;
    q.progress = Math.min(def.goal, q.progress + n);
    if (q.progress >= def.goal) q.done = true;
    changed = true;
  }
  return changed;
}
// Sats werden gutgeschrieben, XP gibt der Aufrufer per addXp weiter.
export function claimQuest(save, id) {
  const q = (save.quests?.list || []).find(x => x.id === id);
  const def = QUESTS.find(d => d.id === id);
  if (!q || !def || !q.done || q.claimed) return null;
  q.claimed = true;
  save.sats += def.sats;
  return { sats: def.sats, xp: def.xp };
}
export const claimableCount = save => (save.quests?.list || []).filter(q => q.done && !q.claimed).length;

function prevDay(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = new Date(y, m - 1, d);
  t.setDate(t.getDate() - 1);
  return dayKey(t);
}
// Tagesbonus beim ersten Öffnen am Tag; null, wenn heute schon kassiert
export function applyStreak(save, dateStr) {
  const s = save.streak || { count: 0, lastDay: '' };
  if (s.lastDay === dateStr) return null;
  s.count = s.lastDay === prevDay(dateStr) ? s.count + 1 : 1;
  s.lastDay = dateStr;
  save.streak = s;
  const bonus = Math.min(CONST.STREAK_MAX, CONST.STREAK_BASE + CONST.STREAK_STEP * (s.count - 1));
  save.sats += bonus;
  return { streak: s.count, bonus };
}

const hasDex = (s, suffix) => Object.keys(s.dex).some(k => k.endsWith(suffix));
const COND = {
  first_catch: s => s.stats.catches >= 1,
  all_five: s => RUETHERS.every(r => Object.keys(s.dex).some(k => k.startsWith(r.id + ':'))),
  rare1: s => hasDex(s, ':selten'),
  epic1: s => hasDex(s, ':episch'),
  legend1: s => hasDex(s, ':legendaer'),
  catch10: s => s.stats.catches >= 10,
  catch50: s => s.stats.catches >= 50,
  dex10: s => dexCount(s) >= 10,
  dex20: s => dexCount(s) >= DEX_TOTAL,
  arena1: s => s.stats.arenaWins >= 1,
  master1: s => Object.keys(s.arenaMastered).length >= 1,
  master3: s => Object.keys(s.arenaMastered).length >= 3,
  combo10: s => (s.stats.maxCombo || 0) >= 10,
  level10: s => s.box.some(i => i.level >= 10),
  stops10: s => (s.stats.stops || 0) >= 10,
  trainer5: s => (s.trainerLevel || 1) >= 5,
  trainer10: s => (s.trainerLevel || 1) >= 10,
  fusion1: s => (s.stats.fusions || 0) >= 1,
};
// Prüft alle Erfolge, schaltet neue frei (+Sats), gibt die neuen zurück
export function checkAchievements(save, now = 1) {
  const fresh = [];
  for (const a of ACHIEVEMENTS) {
    if (save.achievements[a.id]) continue;
    if (COND[a.id]?.(save)) { save.achievements[a.id] = now; save.sats += CONST.ACHIEVEMENT_SATS; fresh.push(a); }
  }
  return fresh;
}

// ---------- Events ----------
export function featuredRuether(dateStr) {
  const rng = seededRng(hashStr('featured:' + dateStr));
  return RUETHERS[Math.floor(rng() * RUETHERS.length)].id;
}
export function isHappyHour(d = new Date()) {
  const h = d.getHours();
  return h >= CONST.HOUR_START && h < CONST.HOUR_END;
}
