# Rüther GO v4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aus dem Spiel eine richtige App machen: Tab-Navigation, Onboarding, Trainer-Level, Tagesquests, Erfolge, Fusion, Dosenbier-Stops aus OpenStreetMap, Sounds, Events, Online-Welt (Rangliste, globale Arena-Besitzer, Feed) über das Backend `https://ruether-go.higgsfield.app`.

**Architecture:** Neue reine Logik in `js/quests.js` und `js/stops.js`, Erweiterungen in `js/progress.js` (XP, Fusion, Spielstand v3). Neue DOM-Module: `js/ui.js` (Screens, Tabs, Toasts, Popups), `js/onboarding.js`, `js/audio.js`, `js/overpass.js`, `js/online.js`. `js/screens.js` bekommt Quests, Rangliste, Profil, Stop, Fusion. `js/app.js` verdrahtet alles (vollständiger Code in Task D).

**Spec:** `docs/superpowers/specs/2026-10-04-ruether-go-v4-design.md` (gilt bei Zweifel), darunter v3/v2/v1.

**Schon erledigt (nicht anfassen):** `index.html` (alle Screens, Tab-Leiste, Splash, Onboarding, Popup/Toast-Container, Debug-Buttons) und `js/data.js` (CONST-Erweiterungen, `API_BASE`, `OVERPASS_*`, `STOP_REWARDS`, `QUESTS`, `ACHIEVEMENTS`). Backend läuft (siehe Spec §0).

**Allgemeine Regeln:** UTF-8 ohne BOM, LF (Write-Tool erzeugt CRLF → mit Node-Skript normalisieren). Keine Commits aus Agenten. Tests: `node --test test/*.test.mjs`. Agenten ändern nur ihre Dateien. Lokaler Server: `python -m http.server 8010 --bind 127.0.0.1` (Hintergrund), `http://127.0.0.1:8010/?debug=1`.

---

## Modulverträge (für alle Agenten verbindlich)

```js
// js/ui.js (B)
export function setScreen(id)                         // .screen.active umschalten, Tab-Leiste nur bei .with-tabs, aktiven Tab markieren, kurze Blende
export function toast(text, { icon = '', kind = 'info' } = {})   // kind: info | sats | achievement | level ; stapelt in #toasts, 2,2 s
export function popup({ title, html, buttons = [{ label: 'OK', primary: true }] }) -> Promise<index>  // modal in #popup, löst mit Index des geklickten Buttons auf
export function closePopup()
export function onTab(fn)                             // fn(screenId) bei Tipp auf einen Tab
export function setTabBadge(screenId, n)              // Badge an einem Tab (0 = versteckt)

// js/onboarding.js (B)
export function createOnboarding({ el, avatars, onDone }) -> { start({ profileOnly = false, nickname = '', avatar = 'christian' }) }
// avatars = RUETHERS; onDone({ nickname, avatar }) genau einmal; Überspringen springt zu Schritt 3 (Profil ist Pflicht)

// js/screens.js (B) — bestehende Signaturen bleiben, neu/erweitert:
createCollectionScreen({ el, onTeamChange, onPowerUp, onFuse, onDex, onBack })   // onFuse(id, rarityId) -> { ok, inst, used, newDex } ; Fusion-Button je Gruppe, wenn canFuse
createArenaScreen(...).show(a, { distanceM, teamSize, level, mastered, ownerName, bossBtc, globalOwner })  // globalOwner: { owner, leader, since } | null → Zeile .global-owner
export function createQuestsScreen({ el, onClaim }) -> { show(save, dateStr) }          // onClaim(id) -> { sats, xp } | null
export function createLeaderboardScreen({ el }) -> { show({ save, state, available }) }  // state = API-Zustand oder null
export function createProfileScreen({ el, onRename, onAvatar, onSettings, onShare, onExport, onImport, onReset, onShop }) -> { show(save, { onlineId, available }) }
export function createStopScreen({ el, onSpin, onDone }) -> { show(stop) }                // onSpin(stop) -> { sats, superCoin, xp } (Belohnung vom App-Code), Rad dreht 2 s, zeigt Ergebnis, onDone() beim Schließen

// js/audio.js (C)
export const sfx = { play(name), setEnabled(bool), unlock() }   // Namen: tap hit special dodge warn win lose throw catch breakout levelup quest spin click rage coin
export function haptic(pattern)                                  // navigator.vibrate, respektiert setHapticsEnabled
export function setHapticsEnabled(bool)

// js/overpass.js (C)
export async function fetchStops(player) -> Stop[]   // Cache nach Zelle/TTL, Fehler → []

// js/online.js (C)
export function createOnline({ apiBase, getPayload, onState }) -> { syncSoon(), syncNow(), fetchState(), claimArena(arenaId, level, leader), postEvent(kind, text), get available(), get lastState() }
// getPayload() -> { token, nickname, avatar, sats, dex, trophies, mastered, level, xp, leader } ; onState(state) nach jedem erfolgreichen Abruf

// js/map.js (C) — zusätzlich:
createMap({ ..., onStopTap })  ; setStops(stops, readyFn)  ; setArena(id, { level, mastered, ownerId, globalOwner })  // globalOwner: { owner, mine } | null → Namensschild

// js/battle-ui.js (C) — zusätzlich: createBattleScreen({ el, onEnd, onEvent })  // onEvent(e) für jedes Engine-Event plus { type: 'combo', value }
// js/catch.js (C) — zusätzlich: createCatchScreen({ ..., onThrow })  // onThrow({ hit, label }) bei jedem Wurf (label: 'Super!' | 'Gut!' | '')

// js/progress.js (A) — zusätzlich:
xpForLevel(level), levelProgress(save), addXp(save, n) -> { levelUps, sats }, nextRarity(id), canFuse(save, id, rarityId), fuse(save, id, rarityId, now) -> { ok, inst, used, newDex }, emptySaveV3(), migrate(any) -> v3

// js/quests.js (A)
dayKey(date), hashStr, seededRng, dailyQuestIds(dateStr), ensureDailyQuests(save, dateStr) -> bool, trackQuest(save, kind, n) -> bool, claimQuest(save, id) -> { sats, xp } | null, claimableCount(save), applyStreak(save, dateStr) -> { streak, bonus } | null, checkAchievements(save, now) -> Achievement[], featuredRuether(dateStr), isHappyHour(date)

// js/stops.js (A)
overpassQuery(player), parseOverpass(json, player) -> Stop[], spinReward(rng) -> { sats, superCoin, xp }, stopReady(save, id, now), useStop(save, id, now), cacheCell(player), fakeStops(player, rng)
// Stop = { id, name, kind, lat, lon, dist }

// js/spawn.js (A): updateSpawns({ ..., featured = null })  // featured-Rüther dreifach im Pool
```

---

### Task A: Reine Logik (TDD) — Agent A

**Files:** Modify `js/progress.js`, `js/spawn.js`, `js/storage.js`, `test/progress.test.mjs`, `test/spawn.test.mjs`; Create `js/quests.js`, `js/stops.js`, `test/quests.test.mjs`, `test/stops.test.mjs`.

- [ ] **Step 1: `js/progress.js` ergänzen** (an die bestehende Datei anhängen bzw. `emptySaveV2`/`migrate` ersetzen)

```js
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

// ---------- Spielstand v3 ----------
export function emptySaveV3() {
  return {
    version: 3, box: [], team: [], sats: 0, dex: {}, arenaLevels: {}, arenaMastered: {}, arenaOwners: {},
    items: { lockmodul: 0, supercoin: 0 }, lureUntil: 0, victoryShown: false,
    stats: { catches: 0, arenaWins: 0, stops: 0, fusions: 0, specials: 0, dodges: 0, maxCombo: 0, superHits: 0 },
    nextUid: 1,
    profile: null, xp: 0, trainerLevel: 1,
    quests: { date: '', list: [] }, streak: { count: 0, lastDay: '' }, achievements: {}, stopCooldowns: {},
    settings: { sound: true, haptics: true }, seen: { onboarding: false, iosHint: false },
  };
}
export const emptySaveV2 = emptySaveV3; // Kompatibilität für ältere Importe
```

`migrate` so ersetzen:

```js
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
```

In `test/progress.test.mjs`: die beiden Zusicherungen `version === 2` → `3`; `migrate({ version: 2, box: [], team: [], sats: 5 })` → `version 3`, `profile null`, `settings.sound true`. Neue Tests anhängen:

```js
import { xpForLevel, addXp, levelProgress, canFuse, fuse, nextRarity, emptySaveV3 } from '../js/progress.js';

test('v4: XP und Trainer-Level', () => {
  assert.equal(xpForLevel(1), 150);
  assert.equal(xpForLevel(4), 600);
  const s = emptySaveV3();
  assert.deepEqual(addXp(s, 100), { levelUps: [], sats: 0 });
  assert.deepEqual(levelProgress(s), { level: 1, xp: 100, need: 150 });
  const r = addXp(s, 400); // 500 gesamt: Lv1→2 (150), Lv2→3 (300), Rest 50
  assert.deepEqual(r, { levelUps: [2, 3], sats: 500 });
  assert.equal(s.trainerLevel, 3);
  assert.equal(s.xp, 50);
  assert.equal(s.sats, 500);
});

test('v4: Fusion verbraucht die drei niedrigsten, Ergebnis nächste Seltenheit mit max Level', () => {
  const s = emptySaveV3();
  s.box.push(
    { uid: 'a', id: 'christian', rarity: 'selten', level: 2, caughtAt: 0 },
    { uid: 'b', id: 'christian', rarity: 'selten', level: 5, caughtAt: 0 },
    { uid: 'c', id: 'christian', rarity: 'selten', level: 1, caughtAt: 0 },
    { uid: 'd', id: 'christian', rarity: 'selten', level: 9, caughtAt: 0 },
    { uid: 'e', id: 'viktor', rarity: 'selten', level: 1, caughtAt: 0 },
  );
  s.team = ['a', 'd', 'e'];
  assert.equal(nextRarity('selten'), 'episch');
  assert.equal(nextRarity('legendaer'), null);
  assert.equal(canFuse(s, 'christian', 'selten'), true);
  assert.equal(canFuse(s, 'viktor', 'selten'), false);
  const r = fuse(s, 'christian', 'selten', 7);
  assert.equal(r.ok, true);
  assert.deepEqual(r.used.map(i => i.uid), ['c', 'a', 'b']);
  assert.equal(r.inst.rarity, 'episch');
  assert.equal(r.inst.level, 5);
  assert.equal(r.newDex, true);
  assert.equal(s.sats, 100);
  assert.deepEqual(s.box.map(i => i.uid).sort(), ['d', 'e', r.inst.uid].sort());
  assert.deepEqual(s.team, ['d', 'e', r.inst.uid]);
  assert.equal(s.stats.fusions, 1);
  assert.equal(fuse(s, 'christian', 'selten').ok, false);
  s.box.push({ uid: 'x', id: 'micha', rarity: 'legendaer', level: 1 }, { uid: 'y', id: 'micha', rarity: 'legendaer', level: 1 }, { uid: 'z', id: 'micha', rarity: 'legendaer', level: 1 });
  assert.equal(canFuse(s, 'micha', 'legendaer'), false);
});
```

- [ ] **Step 2: `js/quests.js`**

```js
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
```

- [ ] **Step 3: `test/quests.test.mjs`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dailyQuestIds, ensureDailyQuests, trackQuest, claimQuest, claimableCount, applyStreak, checkAchievements, featuredRuether, isHappyHour, dayKey } from '../js/quests.js';
import { emptySaveV3 } from '../js/progress.js';
import { QUESTS, RUETHERS } from '../js/data.js';

test('dailyQuestIds: drei verschiedene gültige Quests, deterministisch pro Tag', () => {
  const a = dailyQuestIds('2026-10-04');
  assert.equal(a.length, 3);
  assert.equal(new Set(a).size, 3);
  assert.ok(a.every(id => QUESTS.some(q => q.id === id)));
  assert.deepEqual(dailyQuestIds('2026-10-04'), a);
  const days = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'];
  assert.ok(days.some(d => dailyQuestIds(d).join() !== a.join()));
});

test('ensureDailyQuests, trackQuest, claimQuest', () => {
  const s = emptySaveV3();
  assert.equal(ensureDailyQuests(s, '2026-10-04'), true);
  assert.equal(ensureDailyQuests(s, '2026-10-04'), false);
  assert.equal(s.quests.list.length, 3);
  // Fortschritt gezielt setzen: erste Quest manuell erfüllen
  const q = s.quests.list[0];
  const def = QUESTS.find(d => d.id === q.id);
  assert.equal(trackQuest(s, def.kind, def.goal), true);
  assert.equal(q.done, true);
  assert.equal(claimableCount(s), 1);
  const r = claimQuest(s, q.id);
  assert.deepEqual(r, { sats: def.sats, xp: def.xp });
  assert.equal(s.sats, def.sats);
  assert.equal(claimQuest(s, q.id), null);
  assert.equal(claimableCount(s), 0);
  assert.equal(trackQuest(s, 'gibtsnicht', 1), false);
  assert.equal(ensureDailyQuests(s, '2026-10-05'), true);
  assert.equal(s.quests.list.every(x => x.progress === 0 && !x.claimed), true);
});

test('applyStreak: Folgetag erhöht, Lücke setzt zurück, gleicher Tag null', () => {
  const s = emptySaveV3();
  assert.deepEqual(applyStreak(s, '2026-10-04'), { streak: 1, bonus: 50 });
  assert.equal(applyStreak(s, '2026-10-04'), null);
  assert.deepEqual(applyStreak(s, '2026-10-05'), { streak: 2, bonus: 75 });
  assert.deepEqual(applyStreak(s, '2026-10-07'), { streak: 1, bonus: 50 });
  s.streak = { count: 9, lastDay: '2026-10-09' };
  assert.deepEqual(applyStreak(s, '2026-10-10'), { streak: 10, bonus: 200 });
  assert.equal(s.sats, 50 + 75 + 50 + 200);
});

test('checkAchievements: nur einmal, mit Sats', () => {
  const s = emptySaveV3();
  assert.deepEqual(checkAchievements(s), []);
  s.stats.catches = 1;
  s.dex['christian:selten'] = true;
  const fresh = checkAchievements(s, 5);
  assert.deepEqual(fresh.map(a => a.id).sort(), ['first_catch', 'rare1']);
  assert.equal(s.sats, 100);
  assert.equal(s.achievements.first_catch, 5);
  assert.deepEqual(checkAchievements(s), []);
  for (const r of RUETHERS) s.dex[`${r.id}:normal`] = true;
  s.stats.maxCombo = 10; s.trainerLevel = 5;
  assert.deepEqual(checkAchievements(s).map(a => a.id).sort(), ['all_five', 'combo10', 'trainer5']);
});

test('Events: Rüther des Tages deterministisch, Rüther-Stunde 18-19 Uhr', () => {
  const f = featuredRuether('2026-10-04');
  assert.ok(RUETHERS.some(r => r.id === f));
  assert.equal(featuredRuether('2026-10-04'), f);
  assert.equal(isHappyHour(new Date(2026, 9, 4, 18, 30)), true);
  assert.equal(isHappyHour(new Date(2026, 9, 4, 17, 59)), false);
  assert.equal(isHappyHour(new Date(2026, 9, 4, 19, 0)), false);
  assert.equal(dayKey(new Date(2026, 0, 5)), '2026-01-05');
});
```

- [ ] **Step 4: `js/stops.js`**

```js
import { CONST, OVERPASS_AMENITIES, OVERPASS_SHOPS, STOP_REWARDS } from './data.js';
import { distance, randomPointInRing } from './geo.js';

export function overpassQuery(player) {
  const a = OVERPASS_AMENITIES.join('|'), s = OVERPASS_SHOPS.join('|');
  const around = `around:${CONST.STOP_RADIUS},${player.lat},${player.lon}`;
  return `[out:json][timeout:10];(node["amenity"~"^(${a})$"](${around});node["shop"~"^(${s})$"](${around}););out body;`;
}
// Overpass-Antwort → Stops (nur Nodes mit Koordinaten), nach Entfernung, max STOP_MAX
export function parseOverpass(json, player) {
  const els = Array.isArray(json?.elements) ? json.elements : [];
  return els
    .filter(e => e.type === 'node' && Number.isFinite(e.lat) && Number.isFinite(e.lon))
    .map(e => ({ id: 'osm' + e.id, name: e.tags?.name || 'Dosenbier-Stop', kind: e.tags?.amenity || e.tags?.shop || 'stop', lat: e.lat, lon: e.lon, dist: distance(player, e) }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, CONST.STOP_MAX);
}
export function spinReward(rng) {
  const total = STOP_REWARDS.reduce((s, r) => s + r.w, 0);
  let x = rng() * total;
  let sats = STOP_REWARDS[STOP_REWARDS.length - 1].sats;
  for (const r of STOP_REWARDS) { if (x < r.w) { sats = r.sats; break; } x -= r.w; }
  return { sats, superCoin: rng() < CONST.STOP_SUPERCOIN_CHANCE, xp: CONST.XP_STOP };
}
export const stopReady = (save, id, now) => !((save.stopCooldowns || {})[id] > now);
export function useStop(save, id, now) {
  save.stopCooldowns = save.stopCooldowns || {};
  for (const [k, v] of Object.entries(save.stopCooldowns)) if (v <= now) delete save.stopCooldowns[k];
  save.stopCooldowns[id] = now + CONST.STOP_COOLDOWN;
  save.stats.stops = (save.stats.stops || 0) + 1;
}
// Rasterzelle für den Cache (ca. STOP_CACHE_CELL Meter)
export const cacheCell = p => `${Math.round((p.lat * 111320) / CONST.STOP_CACHE_CELL)}:${Math.round((p.lon * 111320 * Math.cos((p.lat * Math.PI) / 180)) / CONST.STOP_CACHE_CELL)}`;
export function fakeStops(player, rng) {
  return ['Kiosk Müller', 'Zum goldenen Dosenbier', 'Trinkhalle Hagen'].map((name, i) => {
    const p = randomPointInRing(player, 30, 120, rng);
    return { id: 'fake' + i, name, kind: 'kiosk', lat: p.lat, lon: p.lon, dist: distance(player, p) };
  });
}
```

- [ ] **Step 5: `test/stops.test.mjs`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { overpassQuery, parseOverpass, spinReward, stopReady, useStop, cacheCell, fakeStops } from '../js/stops.js';
import { emptySaveV3 } from '../js/progress.js';
import { CONST } from '../js/data.js';
import { offsetPoint } from '../js/geo.js';

const seq = (...v) => { let i = 0; return () => v[Math.min(i++, v.length - 1)]; };
const P = { lat: 51.37, lon: 7.48 };

test('overpassQuery enthält Umkreis und Filter', () => {
  const q = overpassQuery(P);
  assert.ok(q.includes('around:600,51.37,7.48'));
  assert.ok(q.includes('amenity') && q.includes('pub') && q.includes('kiosk'));
});

test('parseOverpass: nur Nodes, Name-Fallback, sortiert, Limit 25', () => {
  const far = offsetPoint(P, 500, 0), near = offsetPoint(P, 50, 0);
  const json = { elements: [
    { type: 'node', id: 1, lat: far.lat, lon: far.lon, tags: { amenity: 'pub', name: 'Zum Löwen' } },
    { type: 'node', id: 2, lat: near.lat, lon: near.lon, tags: { shop: 'kiosk' } },
    { type: 'way', id: 3, tags: { amenity: 'bar', name: 'Weg' } },
    { type: 'node', id: 4, tags: { amenity: 'bar' } },
  ] };
  const stops = parseOverpass(json, P);
  assert.deepEqual(stops.map(s => s.id), ['osm2', 'osm1']);
  assert.equal(stops[0].name, 'Dosenbier-Stop');
  assert.equal(stops[0].kind, 'kiosk');
  assert.ok(stops[0].dist > 45 && stops[0].dist < 55);
  const many = { elements: Array.from({ length: 40 }, (_, i) => ({ type: 'node', id: i, lat: P.lat + i * 0.0001, lon: P.lon, tags: {} })) };
  assert.equal(parseOverpass(many, P).length, CONST.STOP_MAX);
  assert.deepEqual(parseOverpass(null, P), []);
});

test('spinReward: Gewichte und Super-Münze über rng', () => {
  assert.deepEqual(spinReward(seq(0, 0.5)), { sats: 20, superCoin: false, xp: 10 });
  assert.deepEqual(spinReward(seq(0.95, 0.1)), { sats: 60, superCoin: true, xp: 10 });
  assert.equal(spinReward(seq(0.45, 0.9)).sats, 30);
  assert.equal(spinReward(seq(0.75, 0.9)).sats, 40);
});

test('stopReady/useStop: Abkühlung und Aufräumen', () => {
  const s = emptySaveV3();
  assert.equal(stopReady(s, 'osm1', 1000), true);
  useStop(s, 'osm1', 1000);
  assert.equal(stopReady(s, 'osm1', 1000 + CONST.STOP_COOLDOWN - 1), false);
  assert.equal(stopReady(s, 'osm1', 1000 + CONST.STOP_COOLDOWN), true);
  assert.equal(s.stats.stops, 1);
  useStop(s, 'osm2', 1000 + CONST.STOP_COOLDOWN + 5);
  assert.equal('osm1' in s.stopCooldowns, false);
  assert.equal(s.stats.stops, 2);
});

test('cacheCell und fakeStops', () => {
  assert.equal(cacheCell(P), cacheCell(offsetPoint(P, 40, 0)));
  assert.notEqual(cacheCell(P), cacheCell(offsetPoint(P, 400, 0)));
  const f = fakeStops(P, seq(0.5));
  assert.equal(f.length, 3);
  assert.ok(f.every(x => x.dist >= 29 && x.dist <= 121 && x.id.startsWith('fake')));
});
```

- [ ] **Step 6: `js/spawn.js`** — `featured`-Parameter: Signatur `updateSpawns({ spawns, player, arenas, ruethers, now, rng, lure = false, forceRarity = null, featured = null })`; den Pool ersetzen durch

```js
  const pool = [...anywhere, ...local.map(x => x.r)].flatMap(r => (r.id === featured ? Array(CONST.FEATURED_WEIGHT).fill(r) : [r]));
```

Test in `test/spawn.test.mjs` ergänzen:

```js
test('v4: featured-Rüther ist dreifach im Pool', () => {
  const plain = updateSpawns({ spawns: [], player: HAGEN, arenas: ARENAS, ruethers: RUETHERS, now: 0, rng: seq(0, 0.3) });
  assert.ok(plain.every(s => s.ruetherId === 'christian'));
  const feat = updateSpawns({ spawns: [], player: HAGEN, arenas: ARENAS, ruethers: RUETHERS, now: 0, rng: seq(0, 0.3), featured: 'viktor' });
  assert.ok(feat.every(s => s.ruetherId === 'viktor'));
});
```

- [ ] **Step 7: `js/storage.js`** — `emptySave` auf `emptySaveV3` zeigen lassen (Import anpassen), `load()` unverändert über `migrate`.

- [ ] **Step 8:** `node --test test/*.test.mjs` → alle grün (progress 10, quests 5, stops 5, spawn 11, battle 18, catch 7 = 56).

---

### Task B: App-Shell, Onboarding, neue Screens — Agent B

**Files:** Create `js/ui.js`, `js/onboarding.js`, `css/app.css`; Modify `js/screens.js`, `css/screens.css`. Nur diese.

- [ ] **Step 1: `js/ui.js`** (vollständig)

```js
// Screens, Tab-Leiste, Toasts, Popups. Kein Spielzustand.
export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let tabHandler = null;
export function setScreen(id) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  for (const s of document.querySelectorAll('section.screen')) {
    const on = s.id === id;
    if (on && !s.classList.contains('active') && !reduce) { s.classList.add('enter'); setTimeout(() => s.classList.remove('enter'), 220); }
    s.classList.toggle('active', on);
  }
  const target = document.getElementById(id);
  const tabs = document.getElementById('tabbar');
  tabs.classList.toggle('hidden', !target?.classList.contains('with-tabs'));
  tabs.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.tab === id));
}
export function onTab(fn) { tabHandler = fn; }
document.getElementById('tabbar')?.addEventListener('click', e => {
  const b = e.target.closest('button[data-tab]');
  if (b && tabHandler) tabHandler(b.dataset.tab);
});
export function setTabBadge(id, n) {
  const b = document.querySelector(`#tabbar button[data-tab="${id}"] .tab-badge`);
  if (!b) return;
  b.textContent = n;
  b.classList.toggle('hidden', !(n > 0));
}

export function toast(text, { icon = '', kind = 'info' } = {}) {
  const box = document.getElementById('toasts');
  const t = document.createElement('div');
  t.className = `toast-item ${kind}`;
  t.innerHTML = `${icon ? `<span class="t-ico">${esc(icon)}</span>` : ''}<span class="t-text"></span>`;
  t.querySelector('.t-text').textContent = text;
  box.appendChild(t);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 250); }, 2200);
}

// Popups laufen in einer Warteschlange: das nächste erscheint, wenn das vorige geschlossen ist.
const queue = [];
let open = false;
export function popup({ title, html = '', buttons = [{ label: 'OK', primary: true }] }) {
  return new Promise(resolve => { queue.push({ title, html, buttons, resolve }); if (!open) next(); });
}
function next() {
  const el = document.getElementById('popup');
  const item = queue.shift();
  if (!item) { open = false; el.classList.add('hidden'); return; }
  open = true;
  const card = el.querySelector('.popup-card');
  card.innerHTML = `<h2></h2><div class="popup-body">${item.html}</div><div class="popup-buttons"></div>`;
  card.querySelector('h2').textContent = item.title;
  const bb = card.querySelector('.popup-buttons');
  item.buttons.forEach((b, i) => {
    const btn = document.createElement('button');
    btn.textContent = b.label;
    if (b.primary) btn.classList.add('primary');
    btn.addEventListener('click', () => { item.resolve(i); next(); });
    bb.appendChild(btn);
  });
  el.classList.remove('hidden');
  card.classList.remove('pop'); void card.offsetWidth; card.classList.add('pop');
}
export function closePopup() { queue.length = 0; open = false; document.getElementById('popup').classList.add('hidden'); }
```

- [ ] **Step 2: `js/onboarding.js`** — Vertrag oben. Verhalten: Slides 0–2 mit Punkten (`.onb-dots`), „Weiter"/„Überspringen" (Überspringen → Schritt 3), Wischen links/rechts (Pointer-Events, > 50 px). Schritt 3: Name (trim, 2–16 Zeichen, sonst `.onb-error` „Bitte 2 bis 16 Zeichen."), Avatar-Raster (`.avatar-pick` mit fünf `button.avatar-opt` + `img`, aktiver mit Klasse `active`), Button-Text „Los geht's", Überspringen versteckt. `start({ profileOnly })` beginnt bei Schritt 3, wenn `profileOnly`. Enter im Namensfeld = Weiter.

- [ ] **Step 3: `css/app.css`** — Splash (`#splash`, Münze pulsiert, blendet mit Klasse `gone` aus), Tab-Leiste (`#tabbar`: fixed unten, 5 Spalten, Icon 22 px + Label 11 px, aktiv orange, Badge rot rund, Safe-Area), `.screen.with-tabs` bekommt unten Platz (`padding-bottom: 64px + inset`), `.screen.enter` Blende (opacity/translateY 8px, 180 ms), `.topbar .sats-chip` (Pille orange rechts), `.online-dot` (unten links über der Karte, grün/grau), `.banner.hour` (dunkelrot), `.banner.featured` (mit 24-px-Sprite), Toasts (`#toasts` oben zentriert unter Safe-Area, `.toast-item` dunkel mit Icon, `.sats` orange Rand, `.achievement` gold, `.level` blau, `.out` ausblenden), Popup (`#popup` Vollbild-Abdunklung, `.popup-card` zentriert max 340 px, `.pop` Skalierung 0,9 → 1, `.popup-body .big` große orange Zahl, Buttons nebeneinander), Onboarding (Slides zentriert, `.frame-img` 140 px pixelated, Avatar-Raster 5 × 56 px), Quests (`.quest-card` mit Text, Fortschrittsbalken, Belohnung, Button „Einlösen" orange / „Erledigt" grau; `.quest-streak` Karte mit 🔥 Tag n), Rangliste (`.lb-row` mit Platz, Avatar 36 px, Name, 🏆 n, Dex, 💰, grüner Punkt; `.me` orange Rand; `.feed-item` mit Zeit „vor n Min."), Profil (`.profile-head` mit 96-px-Rahmen, XP-Balken blau, `.stats-grid` 3 Spalten, `.ach-grid` 4 Spalten mit `.ach.locked` grau, `.switch-row`, `.danger` rot), Stop (`.wheel` 220 px Kreis mit 6 farbigen Sektoren per `conic-gradient` und Beschriftungen 20/30/40/60/🪙/20 als absolut positionierte Spans, `.wheel.spinning` dreht per Transition 2 s mit `--turn`-Variable, `.wheel-pointer` oben), `.section-title`. Alles auf 375×812 ohne horizontalen Überlauf.

- [ ] **Step 4: `js/screens.js` erweitern** — bestehende Screens bleiben; neu:
  - **Sammlung:** `onFuse(id, rarityId)`; pro Rüther-Gruppe für jede Seltenheit mit ≥ 3 Exemplaren (außer Legendär) ein Button „⚗️ Fusion: 3× Selten → Episch". Klick → `onFuse` → bei `ok` Popup-ähnliche Animation IM Screen: Overlay `.fusion-anim` mit den drei Sprites, die zur Mitte fliegen (600 ms), weißer Blitz, dann das neue Exemplar mit Seltenheitsrahmen und 20 Konfetti, Text „Episch!" bzw. „Legendär!", Button „Weiter" → Overlay weg, `render()`.
  - **Arena-Info:** `globalOwner` → `.global-owner`: „🌍 Gehalten von Sebi (Christian Legendär Lv. 5) seit 3 Std." (Zeitformat: < 60 Min „n Min.", sonst „n Std.", > 48 h „n Tagen"); `null` → „🌍 Noch von niemandem gehalten." Wenn `globalOwner.mine` → „🌍 Du hältst diese Arena".
  - **Quests:** `createQuestsScreen({ el, onClaim })` → `show(save, dateStr)`: `.quest-streak` „🔥 Tag n in Folge · nächster Bonus m 💰", Liste aus `QUESTS` für `save.quests.list` mit Fortschritt „2/3", Balken, Belohnung „150 💰 · 60 XP", Button „Einlösen" (nur `done && !claimed`), nach Klick `onClaim(id)` → Toast macht der App-Code; `.quest-reset` „Neue Quests um Mitternacht".
  - **Rangliste:** `createLeaderboardScreen({ el })` → `show({ save, state, available })`: `.online-count` „n online" (oder „offline"), `.lb-status` bei `!available` „Offline, zeigt den letzten Stand" (leer wenn verfügbar), `.lb-list` Zeilen Top 20 (eigene Zeile per `nickname === save.profile?.nickname` markieren), leere Liste → „Noch niemand gemeldet. Spiel eine Runde!", `.feed` Einträge mit relativer Zeit.
  - **Profil:** `createProfileScreen({ el, onRename, onAvatar, onSettings, onShare, onExport, onImport, onReset, onShop })` → `show(save, { onlineId, available })`: Avatar-Rahmen (Seltenheit des Team-Anführers), Name mit ✏️ (Prompt per `popup` mit Eingabefeld: `html` enthält `<input class="rename" maxlength="16">`; Buttons Abbrechen/Speichern; Wert lesen vor dem Schließen), Trainer-Level + XP-Balken + „120 / 150 XP", Online-ID, Statistik-Kacheln (Fänge, Arenasiege, Stops, Dex, Trophäen, Fusionen), Buttons Shop/Teilen, Erfolge-Raster (`ACHIEVEMENTS`, freigeschaltet mit Icon farbig, sonst `.locked` mit Bedingung als `title` und Text), Einstellungen (Schalter aus `save.settings`, `change` → `onSettings({ sound, haptics })`), Avatar-Auswahl (fünf Sprites → `onAvatar(id)`), Export (`onExport()` → Text in Zwischenablage, Toast macht die App), Import (Popup mit `<textarea class="import">`, dann `onImport(text)`), Löschen (Popup mit Bestätigung, dann `onReset()`).
  - **Stop:** `createStopScreen({ el, onSpin, onDone })` → `show(stop)`: Name, Rad zurücksetzen, Button „Drehen" → `onSpin(stop)` liefert die Belohnung → Rad dreht 2 s so, dass der passende Sektor oben landet (Sektoren: 20, 30, 40, 60, 🪙, 20; bei `superCoin` der 🪙-Sektor, sonst der Sats-Sektor), danach `.stop-result` „+40 💰 · +10 XP" (+ „🪙 Super-Münze!") und Button-Text „Weiter" → `onDone()`. ✕ nur vor dem Drehen.

**Prüfen (B):** `node --check` für ui.js, onboarding.js, screens.js; alle Selektoren gegen index.html; keine horizontalen Überläufe bei 375 px (Browser auf Port 8010, Screens über die Tab-Leiste durchklicken, sobald app.js von Agent D da ist; vorher mit einem Scratch-HTML, das nur ui.js/screens.js lädt).

---

### Task C: Audio, Overpass, Online, Karte, Hooks — Agent C

**Files:** Create `js/audio.js`, `js/overpass.js`, `js/online.js`; Modify `js/map.js`, `js/battle-ui.js`, `js/catch.js`, `style.css` (nur Marker-Regeln anhängen). Nur diese.

- [ ] **Step 1: `js/audio.js`** — Web-Audio-Synth ohne Dateien. Gerüst:

```js
let ctx = null, enabled = true, hapticsOn = true;
function ac() {
  if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; ctx = new AC(); }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}
function tone({ f = 440, f2 = null, type = 'square', t = 0.08, g = 0.25, delay = 0 }) {
  const c = ac(); if (!c || !enabled) return;
  const o = c.createOscillator(), v = c.createGain(), t0 = c.currentTime + delay;
  o.type = type; o.frequency.setValueAtTime(f, t0);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + t);
  v.gain.setValueAtTime(g, t0); v.gain.exponentialRampToValueAtTime(0.001, t0 + t);
  o.connect(v).connect(c.destination); o.start(t0); o.stop(t0 + t + 0.02);
}
```
Namen (alle Pflicht, je eigener Klang): `tap` (kurzer Klick), `hit` (dumpf abfallend), `special` (aufsteigender Dreiklang), `dodge` (Wusch, Rauschen via Oszillator mit schnellem Sweep), `warn` (zwei kurze Piepser), `win` (Fanfare 4 Töne), `lose` (abfallend 3 Töne), `throw` (Sweep hoch), `catch` (Glöckchen-Arpeggio), `breakout` (Plopp tief), `levelup` (Arpeggio hoch + Schluss), `quest` (Ding-Dong), `spin` (Ticken, 8 kurze Klicks über 2 s), `click` (sehr kurz), `rage` (tiefer Brummton), `coin` (hell, kurz). `sfx = { play(name), setEnabled(b), unlock() }`; `unlock()` einmalig bei `pointerdown`/`keydown` (Listener in der Datei registrieren). `haptic(pattern)` → `navigator.vibrate?.(pattern)` wenn `hapticsOn`; `setHapticsEnabled(b)`.

- [ ] **Step 2: `js/overpass.js`**

```js
import { CONST, OVERPASS_URL } from './data.js';
import { overpassQuery, parseOverpass, cacheCell } from './stops.js';

const cache = new Map();
// Stops im Umkreis; Cache pro Rasterzelle 10 Minuten; jeder Fehler → []
export async function fetchStops(player) {
  const key = cacheCell(player);
  const hit = cache.get(key);
  if (hit && hit.at > Date.now() - CONST.STOP_CACHE_MS) return hit.stops;
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(overpassQuery(player)),
      signal: ctrl.signal,
    });
    if (!res.ok) return [];
    const stops = parseOverpass(await res.json(), player);
    cache.set(key, { at: Date.now(), stops });
    return stops;
  } catch {
    return [];
  } finally {
    clearTimeout(to);
  }
}
```

- [ ] **Step 3: `js/online.js`**

```js
import { CONST } from './data.js';

// Backend-Client. Alles best effort: Timeout, Fehler schlucken, available-Flag.
export function createOnline({ apiBase, getPayload, onState }) {
  let available = false, lastState = null, timer = null, inflight = false;
  async function call(path, body) {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), CONST.API_TIMEOUT);
    try {
      const res = await fetch(apiBase + path, {
        method: body ? 'POST' : 'GET',
        headers: body ? { 'content-type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
      const data = await res.json().catch(() => null);
      available = res.ok;
      if (data?.ok && Array.isArray(data.leaderboard)) { lastState = data; onState?.(data); }
      return res.ok ? data : null;
    } catch {
      available = false;
      return null;
    } finally {
      clearTimeout(to);
    }
  }
  const api = {
    syncSoon() { clearTimeout(timer); timer = setTimeout(() => api.syncNow(), CONST.SYNC_DEBOUNCE); },
    async syncNow() {
      const p = getPayload();
      if (!p || inflight) return null;
      inflight = true;
      try { return await call('/api/sync', p); } finally { inflight = false; }
    },
    fetchState() { return call('/api/state'); },
    claimArena(arenaId, level, leader) {
      const p = getPayload();
      if (!p || !leader) return Promise.resolve(null);
      return call('/api/arena', { token: p.token, arenaId, level, leader });
    },
    postEvent(kind, text) {
      const p = getPayload();
      if (!p) return Promise.resolve(null);
      return call('/api/event', { token: p.token, kind, text });
    },
    get available() { return available; },
    get lastState() { return lastState; },
  };
  return api;
}
```

- [ ] **Step 4: `js/map.js`** — `createMap({ ..., onStopTap })`, neu `setStops(stops, readyFn)` (Layer-Gruppe; Marker `L.divIcon({ className: 'stop-icon' + (ready ? '' : ' cooling'), html: '🍺', iconSize: [34, 34], iconAnchor: [17, 17] })`, `zIndexOffset: 500`), `setArena(id, { level, mastered, ownerId, globalOwner })`: bei `globalOwner` zusätzlich `<span class="owner-label${globalOwner.mine ? ' mine' : ''}"></span>` mit `textContent`-sicherem Namen (escapen!) unter dem Icon. In `style.css` anhängen: `.stop-icon` (gelber Kreis, Emoji 18 px, Rand weiß; `.cooling` grau, Opazität .6), `.arena-icon .owner-label` (absolut unter dem Icon, dunkle Pille, weiß, 10 px, `.mine` orange).

- [ ] **Step 5: Hooks in `js/battle-ui.js`** — `createBattleScreen({ el, onEnd, onEvent })`: jedes Engine-Event an `onEvent` weiterreichen, zusätzlich `{ type: 'combo', value: n }` bei jeder Combo-Erhöhung. Sounds: `tap` bei Tipp, `hit` bei `enemyAttack` mit Schaden, `special`, `dodge`, `warn`, `rage`, `win`, `lose`, `click` bei Buttons; Haptik `haptic(20)` bei Treffer auf den Spieler, `haptic([30,30,30])` bei Sieg. Import `{ sfx, haptic } from './audio.js'`.

- [ ] **Step 6: Hooks in `js/catch.js`** — `createCatchScreen({ ..., onThrow })`: nach jeder Trefferprüfung `onThrow({ hit, label })` (`label` aus `ringBonus(scale).label`, bei Fehlwurf `''`). Sounds: `throw` beim Abwurf, `coin` beim Treffer, `breakout`, `catch`; `haptic([20, 30, 60])` bei „Gefangen!".

**Prüfen (C):** `node --check` für alle geänderten JS-Dateien; `node --test test/*.test.mjs` (battle/catch/spawn bleiben grün); Overpass einmal gegen Hagen testen (`node -e` mit `fetch`, Node 22 hat fetch): mindestens ein Stop zurück; Backend einmal mit `curl https://ruether-go.higgsfield.app/api/state` (liefert JSON mit `leaderboard`, ggf. 401 falls die Seite noch nicht gelistet ist — dann nur melden).

---

### Task D: Verdrahtung, Manifest, Icons, README — Agent D

**Files:** Modify `js/app.js` (komplett ersetzen), `manifest.json`, `tools/pixelate.py` (Icons), `README.md`.

- [ ] **Step 1: `tools/pixelate.py`** — am Ende `draw_icons()` ergänzen: lädt `sprites/coin.png`, legt es auf einen dunklen Hintergrund (`#1b1b1f`) mit 12 % Rand und speichert `sprites/icon-192.png` und `sprites/icon-512.png` (NEAREST). Ausführen: `python tools/pixelate.py` (erzeugt alle Sprites neu, Fotos liegen im Ordner).

- [ ] **Step 2: `manifest.json`**

```json
{
  "name": "Rüther GO",
  "short_name": "Rüther GO",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "background_color": "#1b1b1f",
  "theme_color": "#f7931a",
  "icons": [
    { "src": "sprites/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "sprites/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

- [ ] **Step 3: `js/app.js`** komplett ersetzen

```js
import { CONST, API_BASE, RUETHERS, RUETHER_BY_ID, BOSSES, ARENAS, ARENA_BY_ID, RARITY_BY_ID } from './data.js';
import * as storage from './storage.js';
import { createLocator, distance, offsetPoint } from './geo.js';
import { updateSpawns } from './spawn.js';
import { createMap } from './map.js';
import { createCatchScreen } from './catch.js';
import {
  createCollectionScreen, createDexScreen, createShopScreen, createArenaScreen, createVictoryScreen,
  createQuestsScreen, createLeaderboardScreen, createProfileScreen, createStopScreen,
} from './screens.js';
import { createBattleScreen } from './battle-ui.js';
import { makeFighter, makeBoss } from './battle.js';
import { catchReward, arenaWin, arenaReward, arenaScale, powerUp, buyItem, lureActive, dexCount, DEX_TOTAL, addXp, fuse, migrate } from './progress.js';
import { dayKey, ensureDailyQuests, trackQuest, claimQuest, claimableCount, applyStreak, checkAchievements, featuredRuether, isHappyHour } from './quests.js';
import { spinReward, stopReady, useStop, fakeStops } from './stops.js';
import { fetchStops } from './overpass.js';
import { setScreen, toast, popup, onTab, setTabBadge, esc } from './ui.js';
import { createOnboarding } from './onboarding.js';
import { sfx, haptic, setHapticsEnabled } from './audio.js';
import { createOnline } from './online.js';

const $ = s => document.querySelector(s);
const fmt = n => n.toLocaleString('de-DE');
let save = storage.load();
let spawns = [], stops = [], pos = null, lastSpawnPos = null, lastStopPos = null;
let debugWeakBoss = false, debugLegendary = false;
let today = dayKey();
let current = 'screen-map', prevScreen = 'screen-map';

// ---------- Screens ----------
function show(id) {
  if (id !== current) prevScreen = current;
  current = id;
  setScreen(id);
  if (id === 'screen-map') map.invalidate();
  if (id === 'screen-collection') { teamInstances(); collection.show(save); }
  if (id === 'screen-quests') questsScreen.show(save, today);
  if (id === 'screen-leaderboard') { leaderboard.show({ save, state: online.lastState, available: online.available }); online.fetchState().then(() => { if (current === 'screen-leaderboard') leaderboard.show({ save, state: online.lastState, available: online.available }); }); }
  if (id === 'screen-profile') profile.show(save, { onlineId: save.profile?.token?.slice(0, 8) || '', available: online.available });
  if (id === 'screen-shop') shop.show(save);
}
onTab(id => { sfx.play('click'); show(id); });
document.querySelectorAll('.sats-chip').forEach(b => b.addEventListener('click', () => show('screen-shop')));

// ---------- Banner / HUD / Persist ----------
function banner(text, kind) {
  const b = $('#banner');
  if (!text && b.dataset.kind !== kind) return;
  b.textContent = text; b.dataset.kind = kind; b.classList.toggle('hidden', !text);
}
const instById = uid => save.box.find(i => i.uid === uid);
function teamInstances() {
  save.team = save.team.filter(uid => instById(uid));
  return save.team.map(instById);
}
function leaderInfo() {
  const l = instById(save.team[0]);
  return l ? { id: l.id, rarity: l.rarity, level: l.level } : null;
}
function persist() {
  if (!storage.save(save)) banner('Spielstand kann nicht gespeichert werden.', 'save');
  updateHud();
  online.syncSoon();
}
function updateHud() {
  document.querySelectorAll('.sats-chip').forEach(b => { b.textContent = `💰 ${fmt(save.sats)}`; });
  $('#hud-dex').textContent = `Dex ${dexCount(save)}/${DEX_TOTAL}`;
  const mastered = ARENAS.filter(a => save.arenaMastered[a.id]).length;
  $('#badge').classList.toggle('hidden', !(save.victoryShown || mastered === ARENAS.length));
  setTabBadge('screen-quests', claimableCount(save));
  const st = online.lastState;
  for (const a of ARENAS) {
    const owner = instById(save.arenaOwners[a.id]);
    const g = st?.arenas?.[a.id];
    map.setArena(a.id, {
      level: save.arenaLevels[a.id] || 1,
      mastered: !!save.arenaMastered[a.id],
      ownerId: owner ? owner.id : null,
      globalOwner: g ? { owner: g.owner, mine: g.owner === save.profile?.nickname } : null,
    });
  }
  updateBanners();
}
function updateBanners() {
  const lure = $('#lure-banner');
  const left = (save.lureUntil || 0) - Date.now();
  lure.classList.toggle('hidden', left <= 0);
  if (left > 0) lure.textContent = `🧲 Lockmodul: ${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}`;
  $('#hour-banner').classList.toggle('hidden', !isHappyHour());
  $('#hour-banner').textContent = `⏰ Rüther-Stunde bis ${CONST.HOUR_END}:00 · doppelte Spawns, 50 % mehr Sats`;
  const f = featuredRuether(today);
  const fb = $('#featured-banner');
  fb.classList.remove('hidden');
  fb.querySelector('img').src = `sprites/${f}.png`;
  fb.querySelector('span').textContent = `Heute: ${RUETHER_BY_ID[f].name} dreimal so oft`;
}
setInterval(updateBanners, 1000);

// XP, Erfolge, Quests nach jedem Ereignis
function gainXp(n) {
  const r = addXp(save, n);
  for (const lv of r.levelUps) {
    sfx.play('levelup'); haptic([40, 60, 80]);
    popup({ title: `Trainer Lv. ${lv}!`, html: `<p>Du bist aufgestiegen.</p><p class="big">+${fmt(CONST.LEVELUP_SATS * lv)} 💰</p>` });
    if (lv % 5 === 0) online.postEvent('level', `ist Trainer Lv. ${lv} geworden!`);
  }
}
function afterChange() {
  for (const a of checkAchievements(save, Date.now())) {
    sfx.play('quest');
    toast(`Erfolg: ${a.name} (+${CONST.ACHIEVEMENT_SATS} 💰)`, { icon: a.icon, kind: 'achievement' });
    online.postEvent('achievement', `hat den Erfolg „${a.name}" freigeschaltet.`);
  }
  persist();
}

// ---------- Tageswechsel ----------
function dailyCheck() {
  const day = dayKey();
  if (day !== today || !save.quests.list.length) { today = day; ensureDailyQuests(save, today); }
  const st = applyStreak(save, today);
  if (st) {
    sfx.play('coin');
    popup({ title: `🔥 Tag ${st.streak} in Folge`, html: `<p>Danke fürs Wiederkommen.</p><p class="big">+${fmt(st.bonus)} 💰</p>` });
  }
  persist();
}
setInterval(() => { if (dayKey() !== today) dailyCheck(); }, 60_000);

// ---------- Online ----------
const online = createOnline({
  apiBase: API_BASE,
  getPayload() {
    if (!save.profile) return null;
    return {
      token: save.profile.token, nickname: save.profile.nickname, avatar: save.profile.avatar,
      sats: save.sats, dex: dexCount(save), trophies: save.stats.arenaWins,
      mastered: Object.keys(save.arenaMastered).length, level: save.trainerLevel, xp: save.xp, leader: leaderInfo(),
    };
  },
  onState() { $('#online-dot').className = 'online-dot online'; $('#online-dot').title = 'Online'; updateHud(); },
});
setInterval(() => { if (current === 'screen-map' || current === 'screen-leaderboard') online.fetchState().then(ok => { if (!ok) { $('#online-dot').className = 'online-dot offline'; $('#online-dot').title = 'Offline'; } }); }, CONST.STATE_POLL);

// ---------- Karte ----------
const map = createMap({
  el: $('#map'),
  arenas: ARENAS,
  onSpawnTap(s) {
    if (!pos) return toast('Keine Ortung.');
    const d = distance(pos, s);
    if (d >= CONST.CATCH_RANGE) return toast(`Zu weit weg: ${Math.round(d)} m`);
    sfx.play('click');
    catchScreen.start(s, RUETHER_BY_ID[s.ruetherId], { rng: Math.random, rarity: s.rarity, superCoins: save.items.supercoin || 0 });
    show('screen-catch');
  },
  onArenaTap(a) {
    const level = save.arenaLevels[a.id] || 1;
    const owner = instById(save.arenaOwners[a.id]);
    const g = online.lastState?.arenas?.[a.id];
    arenaScreen.show(a, {
      distanceM: pos ? distance(pos, a) : null,
      teamSize: teamInstances().length,
      level,
      mastered: !!save.arenaMastered[a.id],
      ownerName: owner ? `${RUETHER_BY_ID[owner.id].name} (${RARITY_BY_ID[owner.rarity].name}, Lv. ${owner.level})` : null,
      bossBtc: Math.floor(BOSSES[a.boss].btc * arenaScale(level)),
      globalOwner: g ? { ...g, mine: g.owner === save.profile?.nickname } : null,
    });
    show('screen-arena');
  },
  onStopTap(s) {
    if (!pos) return toast('Keine Ortung.');
    const d = distance(pos, s);
    if (d >= CONST.STOP_RANGE) return toast(`Zu weit weg: ${Math.round(d)} m`);
    if (!stopReady(save, s.id, Date.now())) return toast('Dieser Stop kühlt noch ab.');
    sfx.play('click');
    stopScreen.show(s);
    show('screen-stop');
  },
  onFollowChange(following) { $('#btn-locate').classList.toggle('following', following); },
});
$('#btn-locate').addEventListener('click', () => map.follow(pos));

// ---------- Spawns ----------
let spawnTimer = null;
function refreshSpawns() {
  const lure = lureActive(save, Date.now()) || isHappyHour();
  spawns = updateSpawns({ spawns, player: pos, arenas: ARENAS, ruethers: RUETHERS, now: Date.now(), rng: Math.random, lure, forceRarity: debugLegendary ? 'legendaer' : null, featured: featuredRuether(today) });
  if (debugLegendary) { debugLegendary = false; $('#dbg-legendary').textContent = 'Nächster Spawn legendär: aus'; }
  map.setSpawns(spawns);
  lastSpawnPos = pos;
  clearTimeout(spawnTimer);
  spawnTimer = setTimeout(refreshSpawns, lure ? CONST.LURE_INTERVAL : CONST.SPAWN_INTERVAL);
}
spawnTimer = setTimeout(refreshSpawns, CONST.SPAWN_INTERVAL);

// ---------- Stops ----------
function renderStops() { map.setStops(stops, s => stopReady(save, s.id, Date.now())); }
async function refreshStops(force = false) {
  if (!pos) return;
  if (!force && lastStopPos && distance(lastStopPos, pos) < CONST.STOP_CACHE_CELL) return;
  lastStopPos = pos;
  const list = await fetchStops(pos);
  if (list.length || force) { stops = list; renderStops(); }
}
setInterval(renderStops, 30_000);

// ---------- Ortung ----------
const locator = createLocator({
  onPosition(p) {
    pos = p;
    map.setPlayer(p);
    banner('', 'geo');
    if (!lastSpawnPos || distance(lastSpawnPos, p) > CONST.SPAWN_WALK) refreshSpawns();
    refreshStops();
  },
  onError() { banner('Ortung aus. Erlaube sie in den Browser-Einstellungen oder nutze den Test-Modus.', 'geo'); },
});

// ---------- Fangen ----------
const catchScreen = createCatchScreen({
  el: $('#screen-catch'),
  onSuperCoinUsed() { save.items.supercoin = Math.max(0, (save.items.supercoin || 0) - 1); persist(); return save.items.supercoin; },
  onThrow({ hit, label }) {
    if (hit && label === 'Super!') { save.stats.superHits = (save.stats.superHits || 0) + 1; trackQuest(save, 'superHit'); }
  },
  onCaught({ spawn }) {
    const r = catchReward(save, spawn.ruetherId, spawn.rarity, Date.now());
    let sats = r.sats;
    if (isHappyHour()) { const extra = Math.round(r.sats * (CONST.HOUR_SATS_MULT - 1)); save.sats += extra; sats += extra; }
    gainXp(CONST.XP_CATCH[spawn.rarity] || CONST.XP_CATCH.normal);
    trackQuest(save, 'catch');
    if (spawn.rarity !== 'normal') trackQuest(save, 'catchRare');
    if (spawn.rarity === 'legendaer') online.postEvent('catch', `hat einen legendären ${RUETHER_BY_ID[spawn.ruetherId].name} gefangen!`);
    afterChange();
    return { sats, newDex: r.newDex };
  },
  onDone({ spawn }) { spawns = spawns.filter(s => s.id !== spawn.id); map.setSpawns(spawns); show('screen-map'); },
  onCancel() { show('screen-map'); },
});

// ---------- Sammlung / Dex / Shop ----------
const collection = createCollectionScreen({
  el: $('#screen-collection'),
  onTeamChange(team) { save.team = team; persist(); },
  onPowerUp(uid) {
    const res = powerUp(save, uid);
    if (res.ok) { sfx.play('levelup'); toast(`Level ${res.level}! −${fmt(res.cost)} 💰`, { icon: '⬆️', kind: 'level' }); trackQuest(save, 'powerup'); afterChange(); }
    else if (res.reason === 'sats') toast('Nicht genug Sats.');
    return res;
  },
  onFuse(id, rarityId) {
    const res = fuse(save, id, rarityId, Date.now());
    if (!res.ok) return res;
    sfx.play('levelup'); haptic([30, 40, 60]);
    gainXp(CONST.XP_FUSION);
    trackQuest(save, 'fusion');
    if (res.inst.rarity === 'episch' || res.inst.rarity === 'legendaer') online.postEvent('fusion', `hat per Fusion einen ${RARITY_BY_ID[res.inst.rarity].name.toLowerCase()}en ${RUETHER_BY_ID[id].name} erschaffen!`);
    afterChange();
    return res;
  },
  onDex() { dex.show(save); show('screen-dex'); },
  onBack() { show('screen-map'); },
});
const dex = createDexScreen({ el: $('#screen-dex'), onBack() { show('screen-collection'); } });
const shop = createShopScreen({
  el: $('#screen-shop'),
  onBuy(id) {
    const res = buyItem(save, id, Date.now());
    if (res.ok) { sfx.play('coin'); persist(); toast(id === 'lockmodul' ? '🧲 Lockmodul aktiv!' : '🪙 Super-Münze gekauft'); if (id === 'lockmodul') refreshSpawns(); }
    else toast('Nicht genug Sats.');
    return res;
  },
  onBack() { show(prevScreen === 'screen-shop' ? 'screen-map' : prevScreen); },
});

// ---------- Quests / Rangliste / Profil ----------
const questsScreen = createQuestsScreen({
  el: $('#screen-quests'),
  onClaim(id) {
    const r = claimQuest(save, id);
    if (!r) return null;
    sfx.play('quest'); haptic(30);
    toast(`Quest erledigt: +${fmt(r.sats)} 💰, +${r.xp} XP`, { icon: '📋', kind: 'sats' });
    gainXp(r.xp);
    afterChange();
    return r;
  },
});
const leaderboard = createLeaderboardScreen({ el: $('#screen-leaderboard') });
const profile = createProfileScreen({
  el: $('#screen-profile'),
  onRename(nick) {
    const n = String(nick || '').trim().slice(0, 16);
    if (n.length < 2) return toast('Name zu kurz.');
    save.profile.nickname = n; persist(); online.syncNow(); profile.show(save, { onlineId: save.profile.token.slice(0, 8), available: online.available });
  },
  onAvatar(id) { if (RUETHER_BY_ID[id]) { save.profile.avatar = id; persist(); } },
  onSettings({ sound, haptics }) { save.settings = { sound: !!sound, haptics: !!haptics }; sfx.setEnabled(save.settings.sound); setHapticsEnabled(save.settings.haptics); persist(); },
  async onShare() {
    const text = `Ich bin Trainer Lv. ${save.trainerLevel} bei Rüther GO: ${dexCount(save)}/${DEX_TOTAL} im Dex, ${save.stats.arenaWins} Arenasiege. ${location.origin}${location.pathname}`;
    try { if (navigator.share) await navigator.share({ title: 'Rüther GO', text }); else { await navigator.clipboard.writeText(text); toast('In die Zwischenablage kopiert.'); } } catch { /* abgebrochen */ }
  },
  async onExport() {
    const json = JSON.stringify(save);
    try { await navigator.clipboard.writeText(json); toast('Spielstand kopiert.'); } catch { popup({ title: 'Spielstand', html: `<textarea readonly class="export">${esc(json)}</textarea>` }); }
    return json;
  },
  onImport(text) {
    try {
      const data = JSON.parse(text);
      if (!data || typeof data !== 'object' || !Array.isArray(data.box)) throw new Error('bad');
      save = migrate(data);
      persist(); toast('Spielstand übernommen.'); show('screen-map');
      return true;
    } catch { toast('Das war kein gültiger Spielstand.'); return false; }
  },
  onReset() { storage.clear(); location.reload(); },
  onShop() { show('screen-shop'); },
});

// ---------- Stop ----------
const stopScreen = createStopScreen({
  el: $('#screen-stop'),
  onSpin(stop) {
    const r = spinReward(Math.random);
    useStop(save, stop.id, Date.now());
    save.sats += r.sats;
    if (r.superCoin) save.items.supercoin = (save.items.supercoin || 0) + 1;
    sfx.play('spin');
    gainXp(r.xp);
    trackQuest(save, 'stop');
    afterChange();
    renderStops();
    return r;
  },
  onDone() { show('screen-map'); },
});

// ---------- Arena + Kampf ----------
let currentArena = null;
function startBattle(a) {
  currentArena = a;
  const team = teamInstances().map(inst => makeFighter(RUETHER_BY_ID[inst.id], inst));
  const level = save.arenaLevels[a.id] || 1;
  const enemy = makeBoss(BOSSES[a.boss], level);
  if (debugWeakBoss) enemy.btc = 20;
  show('screen-battle');
  battleScreen.start({ team, enemy, rng: Math.random, arena: a, arenaLevel: level, reward: arenaReward(level), masteredAfter: level >= CONST.ARENA_LEVELS });
}
const arenaScreen = createArenaScreen({ el: $('#screen-arena'), bosses: BOSSES, onBack() { show('screen-map'); }, onFight: startBattle });
const battleScreen = createBattleScreen({
  el: $('#screen-battle'),
  onEvent(e) {
    if (e.type === 'special') { save.stats.specials = (save.stats.specials || 0) + 1; trackQuest(save, 'special'); }
    if (e.type === 'dodge') { save.stats.dodges = (save.stats.dodges || 0) + 1; trackQuest(save, 'dodge'); }
    if (e.type === 'combo') { if (e.value > (save.stats.maxCombo || 0)) save.stats.maxCombo = e.value; if (e.value >= 8) trackQuest(save, 'combo8'); }
  },
  onEnd({ won, retry }) {
    if (retry) return startBattle(currentArena);
    if (won) {
      const w = arenaWin(save, currentArena.id, save.team[0]);
      gainXp(CONST.XP_ARENA * w.level);
      trackQuest(save, 'arenaWin');
      const leader = leaderInfo();
      online.syncNow().then(() => online.claimArena(currentArena.id, w.level, leader)).then(() => updateHud());
      if (w.mastered) online.postEvent('achievement', `hat ${currentArena.name} gemeistert!`);
      afterChange();
      if (ARENAS.every(a => save.arenaMastered[a.id]) && !save.victoryShown) { save.victoryShown = true; persist(); return show('screen-victory'); }
    } else {
      afterChange();
    }
    show('screen-map');
  },
});
createVictoryScreen({ el: $('#screen-victory'), onBack() { show('screen-map'); } });

// ---------- Onboarding ----------
const onboarding = createOnboarding({
  el: $('#screen-onboarding'),
  avatars: RUETHERS,
  onDone({ nickname, avatar }) {
    const first = !save.profile && !save.seen.onboarding;
    save.profile = { nickname, avatar, token: crypto.randomUUID(), createdAt: Date.now() };
    if (first) {
      save.sats += CONST.STARTER_SATS;
      save.items.supercoin = (save.items.supercoin || 0) + CONST.STARTER_SUPERCOINS;
      toast(`Willkommen, ${nickname}! +${CONST.STARTER_SATS} 💰 und eine Super-Münze.`, { icon: '🎁', kind: 'sats' });
    }
    save.seen.onboarding = true;
    persist();
    online.syncNow();
    show('screen-map');
    dailyCheck();
    iosHint();
  },
});
function iosHint() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !navigator.standalone;
  if (!ios || save.seen.iosHint) return;
  save.seen.iosHint = true; persist();
  popup({ title: 'Zum Startbildschirm', html: '<p>Teilen-Symbol in Safari antippen, dann „Zum Home-Bildschirm". Dann läuft Rüther GO wie eine App.</p>' });
}

// ---------- Debug ----------
const debug = $('#debug');
let taps = 0, tapTimer = null;
$('#title').addEventListener('click', () => {
  taps += 1; clearTimeout(tapTimer); tapTimer = setTimeout(() => { taps = 0; }, 2000);
  if (taps >= 7) { taps = 0; debug.classList.remove('hidden'); }
});
if (new URLSearchParams(location.search).get('debug') === '1') debug.classList.remove('hidden');
debug.querySelectorAll('[data-beam]').forEach(b => b.addEventListener('click', () => {
  const a = ARENA_BY_ID[b.dataset.beam];
  const p = offsetPoint(a, 40, 0);
  locator.setFake(p); map.follow(p); refreshSpawns(); refreshStops(true); toast(`Gebeamt: ${a.name}`);
}));
$('#dbg-gps').addEventListener('click', () => { locator.clearFake(); if (!locator.current) { pos = null; lastSpawnPos = null; map.setSpawns(spawns = []); } toast('GPS wieder an'); });
$('#dbg-respawn').addEventListener('click', () => { spawns = []; refreshSpawns(); toast('Spawns neu'); });
$('#dbg-stops').addEventListener('click', () => { if (!pos) return toast('Keine Ortung.'); stops = fakeStops(pos, Math.random); renderStops(); toast('3 Fake-Stops'); });
$('#dbg-catchall').addEventListener('click', () => { for (const r of RUETHERS) if (!save.box.some(i => i.id === r.id)) catchReward(save, r.id, 'normal', Date.now()); afterChange(); toast('Alle gefangen'); });
$('#dbg-sats').addEventListener('click', () => { save.sats += 1000; persist(); toast('+1000 💰'); });
$('#dbg-xp').addEventListener('click', () => { gainXp(500); afterChange(); toast('+500 XP'); });
$('#dbg-legendary').addEventListener('click', e => { debugLegendary = !debugLegendary; e.target.textContent = `Nächster Spawn legendär: ${debugLegendary ? 'an' : 'aus'}`; });
$('#dbg-weakboss').addEventListener('click', e => { debugWeakBoss = !debugWeakBoss; e.target.textContent = `Boss fast tot: ${debugWeakBoss ? 'an' : 'aus'}`; });
$('#dbg-reset').addEventListener('click', () => { storage.clear(); location.reload(); });
$('#dbg-close').addEventListener('click', () => debug.classList.add('hidden'));

// ---------- Start ----------
sfx.setEnabled(save.settings.sound !== false);
setHapticsEnabled(save.settings.haptics !== false);
updateHud();
setTimeout(() => {
  $('#splash').classList.add('gone');
  setTimeout(() => $('#splash').remove(), 400);
  if (!save.profile) { onboarding.start({ profileOnly: save.seen.onboarding || save.box.length > 0 }); show('screen-onboarding'); }
  else { show('screen-map'); dailyCheck(); online.syncNow().then(() => online.fetchState()); }
}, CONST.SPLASH_MS);
```

- [ ] **Step 4: `README.md`** — Abschnitt „Steuerung" um Quests, Stops, Rangliste, Profil ergänzen; neuer Abschnitt „Online": Backend-URL, dass die Rangliste und Arena-Besitzer für alle Spieler gelten, Offline-Verhalten.

- [ ] **Step 5:** `node --check js/*.js`; `node --test test/*.test.mjs`; `python tools/pixelate.py` erzeugt die Icons; im Browser (Port 8010, `?debug=1`): Splash → Onboarding (Name eingeben, Avatar wählen) → Karte mit Tab-Leiste; Tabs durchklicken; Debug „+500 XP" löst Level-Popup aus; „Fake-Stops" nach Beamen zeigt 🍺-Marker, Stop antippen → Rad → Belohnung; Quests-Tab zeigt drei Quests; Rangliste zeigt Zustand oder Offline-Hinweis; Profil zeigt Statistik und Erfolge; Konsole ohne Fehler.

---

### Task E: Browser-Check, Deployment (Orchestrator)

1. Lokaler Durchlauf wie Task D Step 5, zusätzlich Fang und Kampf (Quests zählen hoch, Sounds hörbar, Combo-Quest).
2. Spiel nach `D:\GPTDev\ruether-go-site\app\public\play\` kopieren, dort deployen (`higgsfield website deploy`), Cover/Metadaten, Listung; GitHub Pages pushen. Beide Live-URLs mit `curl` und im Browser prüfen (API erreichbar, Rangliste zeigt Einträge).

---

## Self-Review

**Spec-Abdeckung:** §1 Shell → B (ui.js, app.css), D (app.js show/Tabs). §2 Onboarding → B + D. §3 XP → A + D. §4 Quests/Streak → A + B (Screen) + D. §5 Erfolge → A + B (Profil) + D. §6 Fusion → A + B + D. §7 Stops → A + C (overpass, map) + B (Stop-Screen) + D. §8 Audio → C. §9 Events → A (featured, isHappyHour) + D (Banner, Spawns). §10 Online → C (online.js, map) + B (Rangliste, Arena-Info) + D. §11 Profil → B + D. §12 PWA → D. §13 Spielstand v3 → A. §14 Tests → A.

**Verträge:** Alle in „Modulverträge" definiert; app.js (Task D) benutzt genau diese Namen und Signaturen.
