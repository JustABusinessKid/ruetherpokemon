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
