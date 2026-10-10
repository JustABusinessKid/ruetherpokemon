import { CONST, RUETHERS, RUETHER_BY_ID, BOSSES, ARENAS, ARENA_BY_ID, RARITY_BY_ID, pickLine } from './data.js';
import * as storage from './storage.js';
import { createLocator, distance, offsetPoint } from './geo.js';
import { updateSpawns, lureWave } from './spawn.js';
import { createMap } from './map.js';
import { createCatchScreen } from './catch.js';
import {
  createCollectionScreen, createDexScreen, createShopScreen, createArenaScreen, createVictoryScreen,
  createQuestsScreen, createLeaderboardScreen, createProfileScreen, createStopScreen, distText,
  createQuestTeamScreen, createQuestResultScreen, clock,
} from './screens.js';
import { createBattleScreen } from './battle-ui.js';
import { makeFighter, makeBoss } from './battle.js';
import {
  catchReward, arenaWin, arenaReward, arenaScale, powerUp, buyItem, lureActive, dexCount, DEX_TOTAL, addXp, fuse, migrate,
  pickFood, feed, sell, sellDuplicates, levelUpUids, haunebuWin, startBeam, activeBeam, endBeam,
  haunebuActive, consumeHaunebu, questsUnlocked, questResult,
} from './progress.js';
import { playSummon, playBeam, playReturn } from './flight.js';
import { makeWild } from './wild.js';
import { reachText } from './format.js';
import { createTicker } from './ticker.js';
import { dayKey, ensureDailyQuests, trackQuest, claimQuest, claimableCount, applyStreak, checkAchievements, featuredRuether, isHappyHour } from './quests.js';
import { spinReward, stopReady, useStop, fakeStops } from './stops.js';
import { fetchStops } from './overpass.js';
import { setScreen, toast, popup, onTab, setTabBadge, esc, ico } from './ui.js';
import { createOnboarding } from './onboarding.js';
import { sfx, haptic, setHapticsEnabled } from './audio.js';
import { createOnline, onlineConfig } from './online.js';
import { MISSIONS, MISSION_BY_ID, pickVariant } from './quest/missions.js';

const $ = s => document.querySelector(s);
window.addEventListener('error', () => { const p = document.querySelector('#splash p'); if (p) p.textContent = 'Fehler beim Laden. Bitte Seite neu laden.'; }, { once: true });
const fmt = n => n.toLocaleString('de-DE');
for (const el of document.querySelectorAll('[data-say]')) el.textContent = pickLine(...el.dataset.say.split(':'));
let save = storage.load();
let spawns = [], stops = [], pos = null, lastSpawnPos = null, lastStopPos = null, homePos = null, flying = false; // flying: Haunebu-Animation läuft
let openSpawn = null, questRun = null; // openSpawn: Spawn im Fang-Screen; questRun: Haunebu-Quest von „Abflug" bis zur Landung zu Hause
let debugWeakBoss = false, debugLegendary = false;
let today = dayKey();
let current = 'screen-map', prevScreen = 'screen-map';

// ---------- Screens ----------
function show(id) {
  if (id !== current) prevScreen = current;
  current = id;
  setScreen(id);
  if (id === 'screen-map') { map.invalidate(); if (save.profile) online.fetchState(); }
  if (id === 'screen-collection') { teamInstances(); collection.show(save); }
  if (id === 'screen-quests') questsScreen.show(save, today);
  if (id === 'screen-leaderboard') { leaderboard.show({ save, state: online.lastState, available: online.available }); online.fetchState().then(() => { if (current === 'screen-leaderboard') leaderboard.show({ save, state: online.lastState, available: online.available }); }); }
  if (id === 'screen-profile') profile.show(save, { onlineId: save.profile?.token?.slice(0, 8) || '', available: online.available });
  if (id === 'screen-shop') shop.show(save);
  if (id === 'screen-victory') showVictoryFace();
}
onTab(id => { sfx.play('click'); show(id); });
document.querySelectorAll('.sats-chip').forEach(b => b.addEventListener('click', () => show('screen-shop')));

// ---------- Banner / HUD / Persist ----------
function banner(text, kind) {
  const b = $('#banner');
  if (!text && b.dataset.kind !== kind) return;
  b.innerHTML = text ? ico(kind === 'geo' ? 'map' : 'lock') + esc(text) : ''; b.dataset.kind = kind; b.classList.toggle('hidden', !text);
}
const instById = uid => save.box.find(i => i.uid === uid);
function teamInstances() {
  save.team = save.team.filter(uid => instById(uid));
  return save.team.map(instById);
}
const ticker = createTicker({ el: $('#btc-ticker'), getLeaderId: () => instById(save.team[0])?.id });
// Level-Ups nach Siegen (levelUpUids-Ergebnis): ein Toast für alle, nach den Erfolgs-Toasts (sonst verdrängt, max. 3 sichtbar)
function levelUpToast(ups) {
  if (!ups.length) return;
  toast(ups.map(({ uid, level }) => `${RUETHER_BY_ID[instById(uid).id].name} Lv. ${level}!`).join(' '), { kind: 'level' });
  sfx.play('levelup');
}
function leaderInfo() {
  const l = instById(save.team[0]);
  return l ? { id: l.id, rarity: l.rarity, level: l.level } : null;
}
function persist() {
  if (!storage.save(save)) banner('Spielstand kann nicht gespeichert werden.', 'save');
  updateHud();
  ticker.refresh(); // Anführer kann gewechselt haben (Christian-Effekt)
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
  const wave = nextWaveAt - Date.now();
  if (left > 0) lure.textContent = `🧲 Lockmodul: ${clock(left)}${wave > 0 ? ` · neue Welle in ${Math.ceil(wave / 1000)} s` : ''}`;
  $('#hour-banner').classList.toggle('hidden', !isHappyHour());
  $('#hour-banner').textContent = `⏰ Rüther-Stunde bis ${CONST.HOUR_END}:00 · doppelte Spawns, 50 % mehr Sats`;
  const f = featuredRuether(today);
  const fb = $('#featured-banner');
  fb.classList.remove('hidden');
  fb.querySelector('img').src = `sprites/${f}.png`;
  fb.querySelector('span').textContent = `Heute: ${RUETHER_BY_ID[f].name} taucht deutlich häufiger auf`;
  beamTick();
}
setInterval(updateBanners, 1000);

// XP, Erfolge, Quests nach jedem Ereignis. Level-up-Popups warten, bis die Fangsequenz vorbei ist.
const pendingLevelUps = [];
function gainXp(n) {
  const r = addXp(save, n);
  for (const lv of r.levelUps) {
    pendingLevelUps.push(lv);
    if (lv % 5 === 0 && lv <= 20) online.postEvent('level', `ist Trainer Lv. ${lv} geworden!`);
  }
  if (current !== 'screen-catch') showLevelUps();
}
function showLevelUps() {
  for (const lv of pendingLevelUps.splice(0)) {
    sfx.play('levelup'); haptic([40, 60, 80]);
    popup({ title: `Trainer Lv. ${lv}!`, html: `<p>Du bist aufgestiegen.</p><p class="big">+${fmt(CONST.LEVELUP_SATS * lv)}${ico('coin', 'ico-in')}</p>` });
  }
}
function afterChange() {
  for (const a of checkAchievements(save, Date.now())) {
    sfx.play('quest');
    toast(`Erfolg: ${a.name} (+${CONST.ACHIEVEMENT_SATS} 💰)`, { icon: a.icon, kind: 'achievement' });
  }
  persist();
}

// ---------- Tageswechsel ----------
function dailyCheck() {
  today = dayKey();
  ensureDailyQuests(save, today);
  const st = applyStreak(save, today);
  if (st) {
    sfx.play('coin');
    popup({ title: `🔥 Tag ${st.streak} in Folge`, html: `<p>${st.streak === 1 ? 'Dein Tagesbonus. Komm morgen wieder, dann gibt es mehr.' : 'Danke fürs Wiederkommen.'}</p><p class="big">+${fmt(st.bonus)}${ico('coin', 'ico-in')}</p>` });
  }
  persist();
}
setInterval(() => { if (dayKey() !== today) dailyCheck(); }, 60_000);

// ---------- Online ----------
const online = createOnline({
  // v8: ntfy + GitHub (ONLINE). Lokal offline, ?online=ruether-go-test-… = eigenes Test-Topic (nie das echte)
  config: onlineConfig(location),
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
    if (d >= CONST.CATCH_RANGE) return toast(reachText(d, CONST.CATCH_RANGE), { icon: 'map' });
    sfx.play('click');
    openSpawn = s;
    catchScreen.start(s, RUETHER_BY_ID[s.ruetherId], { rng: Math.random, rarity: s.rarity, superCoins: save.items.supercoin || 0, canFight: teamInstances().length > 0,
      fightHint: save.box.length ? 'Stell erst ein Team auf' : 'Fang erst einen per Münze' });
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
      flugscheibe: haunebuActive(save, Date.now()),
    });
    show('screen-arena');
  },
  onStopTap(s) {
    if (!pos) return toast('Keine Ortung.');
    const d = distance(pos, s);
    if (d >= CONST.STOP_RANGE) return toast(reachText(d, CONST.STOP_RANGE), { icon: 'map' });
    if (!stopReady(save, s.id, Date.now())) return toast('Dieser Stop kühlt noch ab.');
    sfx.play('click');
    stopScreen.show(s);
    show('screen-stop');
  },
  onFollowChange(following) { $('#btn-locate').classList.toggle('following', following); },
});
$('#btn-locate').addEventListener('click', () => map.follow(pos));

// ---------- Spawns ----------
let spawnTimer = null, nextWaveAt = 0;
function refreshSpawns() {
  const now = Date.now(), lure = lureActive(save, now);
  map.setLure(lure);
  if (lure) {
    // v8 §3: Lockmodul-Welle, alles neu direkt um dich; nur der gerade offene Spawn (Fang-Screen, Wildkampf) bleibt
    const keep = current === 'screen-catch' ? openSpawn : fight?.spawn || null;
    spawns = lureWave({ player: pos, ruethers: RUETHERS, arenas: ARENAS, now, rng: Math.random, keep, featured: featuredRuether(today) });
    if (debugLegendary && spawns.length > (keep ? 1 : 0)) spawns[spawns.length - 1].rarity = 'legendaer';
    if (pos) { map.wave(); if (current === 'screen-map') sfx.play('wave'); }
  } else {
    spawns = updateSpawns({ spawns, player: pos, arenas: ARENAS, ruethers: RUETHERS, now, rng: Math.random, lure: isHappyHour(), forceRarity: debugLegendary ? 'legendaer' : null, featured: featuredRuether(today) });
  }
  if (debugLegendary) { debugLegendary = false; $('#dbg-legendary').textContent = 'Nächster Spawn legendär: aus'; }
  map.setSpawns(spawns);
  lastSpawnPos = pos;
  nextWaveAt = lure ? now + CONST.LURE_INTERVAL : 0;
  clearTimeout(spawnTimer);
  spawnTimer = setTimeout(refreshSpawns, lure ? CONST.LURE_INTERVAL : CONST.SPAWN_INTERVAL);
}
spawnTimer = setTimeout(refreshSpawns, CONST.SPAWN_INTERVAL);

// ---------- Stops ----------
function renderStops() { map.setStops(stops, s => stopReady(save, s.id, Date.now())); }
let stopSeq = 0, stopRetryAt = 0;
async function refreshStops(force = false) {
  if (!pos) return;
  if (!force && lastStopPos && distance(lastStopPos, pos) < CONST.STOP_CACHE_CELL) return;
  if (!force && Date.now() < stopRetryAt) return;
  lastStopPos = pos;
  const seq = ++stopSeq;
  const list = await fetchStops(pos);
  if (seq !== stopSeq) return; // inzwischen neuere Anfrage oder Fake-Stops
  if (!list.length) { lastStopPos = null; stopRetryAt = Date.now() + 60_000; return; } // Overpass-Fehler: in 60 s erneut
  stops = list; renderStops();
}
setInterval(renderStops, 30_000);

// ---------- Ortung ----------
const locator = createLocator({
  onPosition(p) {
    pos = p;
    if (!save.beam) homePos = p; // Startpunkt für den Rückflug der Haunebu
    if (flying || questRun) return; // echtes GPS mitten im Flug oder in der Quest: Marker bleibt bei der Scheibe
    map.setPlayer(p);
    map.setReach(p);
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
    if (hit && label === 'Super!') { save.stats.superHits = (save.stats.superHits || 0) + 1; trackQuest(save, 'superHit'); persist(); }
  },
  onCaught({ spawn }) {
    const r = registerCatch(spawn);
    gainXp(CONST.XP_CATCH[spawn.rarity] || CONST.XP_CATCH.normal);
    afterChange();
    return r;
  },
  onDone({ spawn }) { removeSpawn(spawn); show('screen-map'); showLevelUps(); },
  onCancel() { show('screen-map'); },
  onFight({ spawn }) { startWild(spawn); },
});
// Neues Exemplar + Sats (Rüther-Stunde) + Quests; XP gibt der Aufrufer
function registerCatch(spawn) {
  const r = catchReward(save, spawn.ruetherId, spawn.rarity, Date.now());
  let sats = r.sats;
  if (isHappyHour()) { const base = r.sats - (r.newDex ? CONST.DEX_BONUS : 0); const extra = Math.round(base * (CONST.HOUR_SATS_MULT - 1)); save.sats += extra; sats += extra; }
  trackQuest(save, 'catch');
  if (spawn.rarity !== 'normal') trackQuest(save, 'catchRare');
  if (spawn.rarity === 'legendaer') online.postEvent('catch', `hat einen legendären ${RUETHER_BY_ID[spawn.ruetherId].name} gefangen!`);
  return { sats, newDex: r.newDex };
}
function removeSpawn(spawn) { spawns = spawns.filter(s => s.id !== spawn.id); map.setSpawns(spawns); }

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
  onFeed(targetUid) {
    const foodUid = pickFood(save, targetUid);
    if (!foodUid) { toast('Kein passendes Duplikat zum Füttern.'); return { ok: false, reason: 'falsch', foodUid: null }; }
    const res = feed(save, targetUid, foodUid);
    if (res.ok) {
      sfx.play('levelup'); haptic(30);
      toast(`${RUETHER_BY_ID[instById(targetUid).id].name} Lv. ${res.level}!`, { kind: 'level' });
      trackQuest(save, 'powerup');
      afterChange();
    } else toast(res.reason === 'max' ? 'Schon auf Max-Level.' : 'Das geht nicht.');
    return { ...res, foodUid };
  },
  onSell(uid) {
    const res = sell(save, uid);
    if (res.ok) { sfx.play('coin'); toast(`Verkauft: +${fmt(res.sats)} Sats`, { kind: 'sats' }); afterChange(); }
    else toast(res.reason === 'team' ? 'Teammitglieder verkaufst du nicht.' : res.reason === 'letztes' ? 'Das letzte Exemplar dieser Seltenheit bleibt.' : 'Das geht nicht.');
    return res;
  },
  onSellDuplicates(id) {
    const res = sellDuplicates(save, id);
    if (res.count) { sfx.play('coin'); toast(`${res.count} ${res.count === 1 ? "Duplikat" : "Duplikate"} für ${fmt(res.sats)} Sats verkauft`, { kind: 'sats' }); afterChange(); }
    return res;
  },
  onDex() { dex.show(save); show('screen-dex'); },
  onBack() { show('screen-map'); },
});
const dex = createDexScreen({ el: $('#screen-dex'), onBack() { show('screen-collection'); } });
const shop = createShopScreen({
  el: $('#screen-shop'),
  onBuy(id) {
    if (id === 'haunebu') return buyHaunebu();
    const res = buyItem(save, id, Date.now());
    if (res.ok) { sfx.play('coin'); persist(); toast(id === 'lockmodul' ? `🧲 Lockmodul aktiv! Alle ${CONST.LURE_INTERVAL / 1000} s neue Rüther direkt bei dir.` : '🪙 Super-Münze gekauft'); if (id === 'lockmodul') refreshSpawns(); }
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
  onQuestStart: openQuest,
  onShop() { show('screen-shop'); },
});
const leaderboard = createLeaderboardScreen({ el: $('#screen-leaderboard') });
const profile = createProfileScreen({
  el: $('#screen-profile'),
  onRename(nick) {
    if (!save.profile) return;
    const n = String(nick || '').trim().slice(0, 16);
    if (n.length < 2) return toast('Name zu kurz.');
    save.profile.nickname = n; persist(); online.syncNow(); profile.show(save, { onlineId: save.profile.token.slice(0, 8), available: online.available });
  },
  onAvatar(id) { if (save.profile && RUETHER_BY_ID[id]) { save.profile.avatar = id; persist(); } },
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
      storage.save(save);
      toast('Spielstand übernommen.');
      setTimeout(() => location.reload(), 600);
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
// fight = { arena }, { spawn } (Wildkampf) oder { haunebu } (Hitler); uids = Team beim Kampfstart (activeIndex zeigt hier hinein)
let fight = null;
function teamFighters() {
  const insts = teamInstances();
  return { uids: insts.map(i => i.uid), team: insts.map(inst => makeFighter(RUETHER_BY_ID[inst.id], inst)) };
}
function startBattle(a) {
  const { uids, team } = teamFighters();
  fight = { arena: a, uids };
  const level = save.arenaLevels[a.id] || 1;
  const enemy = makeBoss(BOSSES[a.boss], level);
  if (debugWeakBoss) enemy.btc = 20;
  show('screen-battle');
  battleScreen.start({ team, enemy, rng: Math.random, mode: 'arena', arena: a, arenaLevel: level, reward: arenaReward(level), masteredAfter: level >= CONST.ARENA_LEVELS });
}
// Wildkampf (Spec §2): Sieg fängt, Niederlage/Zeit lässt ihn abhauen, Aufgeben behält den Spawn
// Was endWild am Ende wirklich gutschreibt: Siegbonus + Fang-Sats (+ Happy Hour) + Dex-Bonus
function wildReward(id, rarity) {
  const base = RARITY_BY_ID[rarity].sats;
  return CONST.WILD_WIN_SATS[rarity] + base + (isHappyHour() ? Math.round(base * (CONST.HOUR_SATS_MULT - 1)) : 0) + (save.dex[`${id}:${rarity}`] ? 0 : CONST.DEX_BONUS);
}
function startWild(spawn) {
  const def = RUETHER_BY_ID[spawn.ruetherId];
  const level = Math.min(CONST.LEVEL_MAX, Math.max(1, 1 + Math.floor(Math.random() * (save.trainerLevel || 1))));
  const enemy = makeWild(def, { rarity: spawn.rarity, level });
  if (debugWeakBoss) enemy.btc = 20;
  const { uids, team } = teamFighters();
  fight = { spawn, uids };
  show('screen-battle');
  battleScreen.start({ team, enemy, rng: Math.random, mode: 'wild', wild: { id: def.id, rarity: spawn.rarity, name: def.name }, reward: wildReward(def.id, spawn.rarity) });
}
function endWild({ spawn, uids }, { won, reason, activeIndex = 0 }) {
  if (!won && reason === 'quit') { afterChange(); return show('screen-map'); } // Spezial-/Ausweich-/Combo-Fortschritt sichern
  removeSpawn(spawn);
  let ups = [], msg = '';
  if (won) {
    const r = registerCatch(spawn);
    const bonus = CONST.WILD_WIN_SATS[spawn.rarity] || 0;
    save.sats += bonus;
    msg = `${RUETHER_BY_ID[spawn.ruetherId].name} gefangen: +${fmt(r.sats + bonus)} Sats${r.newDex ? ', neu im Dex!' : ''}`;
    gainXp(CONST.XP_WILD_WIN);
    ups = levelUpUids(save, [uids[activeIndex] ?? uids[0]]);
  }
  afterChange();
  if (msg) toast(msg, { kind: 'sats' });
  levelUpToast(ups);
  show('screen-map');
}
const arenaScreen = createArenaScreen({ el: $('#screen-arena'), bosses: BOSSES, onBack() { show('screen-map'); }, onFight: startBattle, onBeam: beamTo });
const battleScreen = createBattleScreen({
  el: $('#screen-battle'),
  onEvent(e) {
    if (e.type === 'special') { save.stats.specials = (save.stats.specials || 0) + 1; trackQuest(save, 'special'); }
    if (e.type === 'dodge') { save.stats.dodges = (save.stats.dodges || 0) + 1; trackQuest(save, 'dodge'); }
    if (e.type === 'combo') { if (e.value > (save.stats.maxCombo || 0)) save.stats.maxCombo = e.value; if (e.value >= 8) trackQuest(save, 'combo8'); }
  },
  onEnd(res) {
    const f = fight;
    fight = null;
    if (f.spawn) return endWild(f, res);
    if (f.haunebu) return endHaunebu(res);
    const { won, retry } = res, arena = f.arena;
    if (retry && !(save.beam && !activeBeam(save, Date.now()))) return startBattle(arena); // Flugzeit um: kein „Nochmal", zurück zur Karte, dann Rückflug
    if (won) {
      const wasUnlocked = questsUnlocked(save);
      const w = arenaWin(save, arena.id, save.team[0]);
      gainXp(CONST.XP_ARENA * w.level);
      trackQuest(save, 'arenaWin');
      const ups = levelUpUids(save, f.uids);
      const leader = leaderInfo();
      online.syncNow().then(() => online.claimArena(arena.id, w.level, leader)).then(() => updateHud());
      if (w.mastered) online.postEvent('achievement', `hat ${arena.name} gemeistert!`);
      afterChange();
      levelUpToast(ups);
      if (!wasUnlocked && questsUnlocked(save)) toast('Haunebu-Quests freigeschaltet! Schau in den Quests-Tab.', { icon: 'haunebu', kind: 'achievement' });
      if (ARENAS.every(a => save.arenaMastered[a.id]) && !save.victoryShown) { save.victoryShown = true; persist(); return show('screen-victory'); }
    } else {
      afterChange();
    }
    show('screen-map');
  },
});
createVictoryScreen({ el: $('#screen-victory'), onBack() { show('screen-map'); } });
// Sieg-Screen: Gesicht des Team-Anführers mit Krone und einem Spruch (Spec §0.4)
function showVictoryFace() {
  const l = instById(save.team[0]) || save.box[0];
  if (!l) return;
  const face = $('.victory-face'), name = RUETHER_BY_ID[l.id].name;
  face.src = `sprites/${l.id}.png`;
  face.alt = name;
  face.parentElement.className = `frame r-${l.rarity}`;
  $('#screen-victory .say').textContent = `${name}: „${pickLine(l.id, 'appear')}“`;
}

// ---------- Haunebu (Spec v7 §2/§3, v8 §1) ----------
// Kauf beschwört die Flugscheibe (Preis steigt je Beschwörung), Hitler steigt aus. Sieg öffnet ein 10-Minuten-Fenster mit freien Flügen.
function buyHaunebu() {
  if (!teamInstances().length) { toast('Stell erst ein Team auf. Hitler gibt die Scheibe nicht kampflos her.'); return { ok: false, reason: 'team' }; }
  const res = buyItem(save, 'haunebu', Date.now());
  if (!res.ok) { toast(res.reason === 'aktiv' ? 'Die Haunebu ist gerade im Einsatz.' : 'Nicht genug Sats.'); return res; }
  sfx.play('coin');
  persist();
  const line = pickLine('hitler', 'appear'); // steht im Banner; das Kampf-Intro nimmt dann einen anderen
  playSummon(document.body, { line }).catch(() => {}).then(() => startHaunebu(line)); // Sats sind weg: Kampf auch ohne Animation
  return res;
}
function startHaunebu(shownLine = '') {
  const { uids, team } = teamFighters();
  const enemy = makeBoss(BOSSES.hitler, 1);
  if (debugWeakBoss) enemy.btc = 20;
  fight = { haunebu: true, uids };
  show('screen-battle');
  battleScreen.start({ team, enemy, rng: Math.random, mode: 'haunebu', reward: CONST.HAUNEBU_WIN_SATS, shownLine });
}
// Niederlage, Zeit oder Aufgeben: Sats bleiben weg, kein „Nochmal" (die Beschwörung kostet neu), Stats trotzdem speichern
function endHaunebu({ won }) {
  if (won) {
    haunebuWin(save, Date.now());
    gainXp(CONST.XP_HAUNEBU);
    online.postEvent('achievement', 'hat die Haunebu erbeutet und fliegt 10 Minuten lang frei zu jeder Arena!');
  }
  afterChange();
  if (won) toast(`Haunebu erbeutet: +${fmt(CONST.HAUNEBU_WIN_SATS)} Sats. ${CONST.HAUNEBU_USE_MS / 60000} Minuten freie Flüge, Knopf unten rechts auf der Karte.`, { icon: 'haunebu', kind: 'sats' });
  show('screen-map');
}

// Flugziel wählen: Neuschwabenland zuerst (nur per Haunebu), dann alle Arenen mit Entfernung zur echten Position (homePos)
async function pickBeamTarget() {
  if (flying || questRun || !haunebuActive(save, Date.now())) return;
  sfx.play('click');
  const here = activeBeam(save, Date.now())?.arenaId;
  const rows = [...ARENAS].sort((a, b) => !!b.haunebuOnly - !!a.haunebuOnly).map(a => {
    const d = homePos ? distance(homePos, a) : null;
    const town = a.address.match(/\d{5} ([^\s,(]+)/)?.[1] || a.address.split(', ').pop();
    const where = `${town} · ${a.haunebuOnly ? 'Nur mit Haunebu' : d == null ? 'Entfernung unbekannt' : d < CONST.ARENA_RANGE ? 'in Reichweite' : distText(d)}`;
    return `<div class="beam-row${a.haunebuOnly ? ' only' : ''}"><div class="beam-meta"><b>${esc(a.name)}</b><span class="sub">${esc(where)}</span></div>`
      + `<button class="primary" data-choice="${a.id}" ${a.id === here ? 'disabled' : ''}>${a.id === here ? 'Hier' : 'Fliegen'}</button></div>`;
  }).join('');
  const id = await popup({
    title: 'Wohin fliegen?',
    html: `<div class="beam-list">${rows}</div><p class="sub">Flüge sind frei, so oft du willst. Noch <span class="hb-left" data-until="${save.haunebuUntil}">${clock(save.haunebuUntil - Date.now())}</span>, dann fliegt dich die Haunebu zurück.</p>`,
    buttons: [{ label: 'Abbrechen' }],
  });
  if (ARENA_BY_ID[id]) beamTo(ARENA_BY_ID[id]);
}
// Hinfliegen: speichern (Heimatort bleibt beim Weiterspringen), Animation, dann Fake-Position wie beim Debug-Beamen
async function beamTo(a) {
  if (flying || questRun) return; // Popup liegt über dem Flug-Overlay: kein zweiter Flug parallel
  const res = startBeam(save, a.id, Date.now(), homePos || save.beam?.from || null);
  if (!res.ok) return toast(res.reason === 'keine' ? 'Die Haunebu ist nicht im Einsatz. Beschwöre sie im Shop.' : 'Unbekanntes Ziel.');
  persist();
  if (current !== 'screen-map') show('screen-map');
  flying = true;
  await playBeam(document.body, { map, to: a, label: a.name }).catch(() => {});
  flying = false; // vor land(): setFake ruft onPosition sofort
  land(a);
  toast(`Gelandet: ${a.name} · noch ${clock(save.haunebuUntil - Date.now())}`, { icon: 'haunebu' });
}
function land(a) {
  const p = offsetPoint(a, 40, 0);
  locator.setFake(p); map.follow(p); refreshSpawns(); refreshStops(true);
}
// Zurück zur echten Ortung; ohne GPS ist der Spieler danach nirgends (wie „GPS wieder an")
function gpsBack() {
  locator.clearFake();
  if (!locator.current) { pos = homePos = null; lastSpawnPos = null; map.setSpawns(spawns = []); map.setReach(null); }
}
async function returnHome() {
  if (!save.beam || flying) return;
  const to = homePos || save.beam.from || pos;
  endBeam(save);
  persist();
  if (current !== 'screen-map') show('screen-map');
  flying = true;
  if (to) await playReturn(document.body, { map, to }).catch(() => {});
  flying = false; // vor gpsBack(): clearFake ruft onPosition sofort
  gpsBack();
  map.follow(locator.current);
  toast('Die Haunebu hat dich zurückgebracht.', { icon: 'haunebu' });
}
// Jede Sekunde (updateBanners): Knopf und Countdown-Chip nur im Fenster, Toast + Haptik bei 1:00 und am Ende;
// Fenster zu → Rückflug, aber nicht mitten im Kampf, Fang, Stop, Siegesscreen oder in der Team-Wahl
const BEAM_WAIT = ['screen-battle', 'screen-catch', 'screen-stop', 'screen-victory', 'screen-questteam'];
let haunebuWasActive = haunebuActive(save, Date.now()), haunebuWarned = 0;
function beamTick() {
  const now = Date.now(), active = haunebuActive(save, now), left = (save.haunebuUntil || 0) - now, chip = $('#beam-chip');
  $('#btn-haunebu').classList.toggle('hidden', !active);
  chip.classList.toggle('hidden', !active);
  if (active) chip.querySelector('.beam-left').textContent = clock(left);
  document.querySelectorAll('#popup .hb-left[data-until]').forEach(n => { n.textContent = clock(n.dataset.until - now); }); // offene Flug-Popups zählen mit
  if (active && left <= 60_000 && haunebuWarned !== save.haunebuUntil) {
    haunebuWarned = save.haunebuUntil;
    toast('Noch 1 Minute mit der Haunebu.', { icon: 'haunebu' }); haptic([40, 60, 40]);
  }
  if (haunebuWasActive && !active) { toast('Die Haunebu fliegt zurück zu Hitler.', { icon: 'haunebu' }); haptic([80, 40, 80, 40, 80]); }
  haunebuWasActive = active;
  if (!activeBeam(save, now) && save.beam && !BEAM_WAIT.includes(current)) returnHome();
}
$('#btn-haunebu').addEventListener('click', pickBeamTarget);
$('#beam-chip').addEventListener('click', async () => {
  const b = activeBeam(save, Date.now());
  if (!b) return pickBeamTarget();
  const i = await popup({
    title: 'Haunebu-Flug',
    html: `<p>Noch <span class="hb-left" data-until="${b.until}">${clock(b.until - Date.now())}</span> am Ziel: ${esc(ARENA_BY_ID[b.arenaId]?.name || 'Arena')}.</p><p class="sub">Bis dahin fliegst du über den Haunebu-Knopf frei weiter.</p>`,
    buttons: [{ label: 'Bleiben' }, { label: 'Nach Hause', primary: true }],
  });
  if (i === 1) returnHome();
});

// ---------- v8: Haunebu-Quests (Spec §5.1) ----------
// Tab → Mission → Team-Wahl → „Abflug" (verbraucht die Haunebu, playBeam) → Quest-Screen → Ergebnis → playReturn.
// questRun = { mission, variant, insts, home, beamed, ended }; solange bewegt GPS die Karte nicht.
const questTeam = createQuestTeamScreen({ el: $('#screen-questteam'), onStart: launchQuest, onBack() { show('screen-quests'); } });
const questResultScreen = createQuestResultScreen({ el: $('#screen-questresult'), onDone: questHome });
let questScreen = null, questView = null;
// Der Quest-Modus (js/quest/view.js) lädt erst beim ersten Abflug
const loadQuestView = () => (questView ||= import('./quest/view.js').catch(e => { questView = null; throw e; }));
async function openQuest(id) {
  const m = MISSION_BY_ID[id];
  if (!m || !questsUnlocked(save)) return;
  if (!haunebuActive(save, Date.now())) {
    const i = await popup({ title: 'Kapere zuerst die Haunebu', html: '<p>Ohne Flugscheibe kommt ihr nicht hin. Beschwöre sie im Shop und besiege Hitler, dann habt ihr 10 Minuten.</p>', buttons: [{ label: 'Später' }, { label: 'Zum Shop', primary: true }] });
    if (i === 1) show('screen-shop');
    return;
  }
  sfx.play('click');
  questTeam.show(save, m);
  show('screen-questteam');
}
async function launchQuest(id, uids) {
  const mission = MISSION_BY_ID[id], insts = uids.map(instById).filter(Boolean);
  if (!mission || questRun || flying) return;
  if (!haunebuActive(save, Date.now())) { toast('Die Haunebu ist weg. Beschwöre sie neu.', { icon: 'haunebu' }); return show('screen-quests'); }
  if (!insts.length) return toast('Nimm mindestens einen Rüther mit.');
  flying = true; // sperrt schon beim Laden: Doppeltipp auf „Abflug" startet sonst zwei Flüge
  let view;
  try { view = await loadQuestView(); } catch (e) { flying = false; console.warn('Quest-Modus', e); return toast('Der Quest-Modus lädt nicht. Bitte Seite neu laden.'); }
  questScreen ||= view.createQuestScreen({ el: $('#screen-quest'), onEnd: endQuest });
  // Ein laufender Flug endet hier (sonst holt beamTick dich aus der Quest); zurück geht es zum echten Heimatort
  questRun = { mission, variant: pickVariant(mission, Math.random), insts, home: homePos || save.beam?.from || pos, beamed: !!save.beam };
  if (save.beam) endBeam(save);
  consumeHaunebu(save, Date.now());
  haunebuWasActive = false; // die Quest hat sie verbraucht: kein „fliegt zurück zu Hitler"
  persist();
  show('screen-map');
  await playBeam(document.body, { map, to: mission, label: mission.place }).catch(() => {});
  flying = false;
  show('screen-quest');
  questScreen.start({ mission, variant: questRun.variant, team: insts, fighters: insts.map(i => makeFighter(RUETHER_BY_ID[i.id], i)), rng: Math.random });
}
// onEnd({ result, missionId, score, objective, timeMs, alarmFree }): verbuchen, Ergebnis-Screen
function endQuest(summary) {
  const run = questRun;
  if (!run || run.ended) return;
  run.ended = true;
  const reward = questResult(save, run.mission.id, summary.result, summary.score, summary.alarmFree);
  if (reward) gainXp(reward.xp);
  if (reward?.firstDone) online.postEvent('quest', `hat die Haunebu-Quest „${run.mission.name}“ geschafft!`);
  afterChange();
  questResultScreen.show({ mission: run.mission, variant: run.variant, summary, reward, team: run.insts });
  show('screen-questresult');
}
async function questHome() {
  const run = questRun;
  if (!run?.ended || flying) return;
  show('screen-map');
  flying = true;
  if (run.home) await playReturn(document.body, { map, to: run.home }).catch(() => {});
  flying = false;
  questRun = null;
  if (run.beamed) gpsBack(); // war vorher per Haunebu an einer Arena: zurück zur echten Ortung
  map.follow(locator.current || run.home);
  toast('Die Haunebu hat euch nach Hause gebracht und fliegt zurück zu Hitler.', { icon: 'haunebu' });
}

// ---------- Onboarding ----------
const onboarding = createOnboarding({
  el: $('#screen-onboarding'),
  avatars: RUETHERS,
  onDone({ nickname, avatar }) {
    const first = !save.seen.onboarding && !save.box.length;
    save.profile = { nickname, avatar, token: uuid(), createdAt: Date.now() };
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
// UUID v4; crypto.randomUUID fehlt außerhalb von https/localhost
function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
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
// Debug-Beamen und „GPS wieder an" beenden einen laufenden Haunebu-Flug, damit sich nichts überlagert
const stopBeam = () => { if (save.beam) { endBeam(save); persist(); } };
debug.querySelectorAll('[data-beam]').forEach(b => b.addEventListener('click', () => {
  const a = ARENA_BY_ID[b.dataset.beam];
  stopBeam(); land(a); toast(`Gebeamt: ${a.name}`);
}));
$('#dbg-gps').addEventListener('click', () => { stopBeam(); gpsBack(); toast('GPS wieder an'); });
$('#dbg-haunebu').addEventListener('click', () => { save.haunebuUntil = Date.now() + CONST.HAUNEBU_USE_MS; afterChange(); toast('Haunebu für 10 Minuten'); });
$('#dbg-master').addEventListener('click', () => {
  for (const a of ARENAS) { save.arenaMastered[a.id] = true; save.arenaLevels[a.id] = CONST.ARENA_LEVELS; }
  afterChange(); toast('Alle Arenen gemeistert');
});
// Quest starten: nächste Mission der Reihe nach, mit aktuellem Team, Haunebu notfalls geschenkt
let dbgQuest = 0;
const dbgQuestLabel = () => { $('#dbg-quest').textContent = `Quest starten: ${MISSIONS[dbgQuest].name}`; };
dbgQuestLabel();
$('#dbg-quest').addEventListener('click', () => {
  const m = MISSIONS[dbgQuest], uids = teamInstances().map(i => i.uid);
  if (!uids.length) return toast('Stell erst ein Team auf.');
  dbgQuest = (dbgQuest + 1) % MISSIONS.length; dbgQuestLabel();
  if (!haunebuActive(save, Date.now())) save.haunebuUntil = Date.now() + CONST.HAUNEBU_USE_MS;
  launchQuest(m.id, uids);
});
$('#dbg-lure').addEventListener('click', () => { save.lureUntil = Date.now() + CONST.LURE_MS; persist(); refreshSpawns(); toast('Lockmodul an'); });
$('#dbg-respawn').addEventListener('click', () => { spawns = []; refreshSpawns(); toast('Spawns neu'); });
$('#dbg-stops').addEventListener('click', () => { if (!pos) return toast('Keine Ortung.'); stopSeq++; stops = fakeStops(pos, Math.random); renderStops(); toast('3 Fake-Stops'); });
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
// Haunebu-Flug über Neuladen: noch aktiv → ohne Animation wieder hin, abgelaufen → aufräumen
const beamAtStart = activeBeam(save, Date.now());
if (beamAtStart && ARENA_BY_ID[beamAtStart.arenaId]) { homePos = beamAtStart.from || null; land(ARENA_BY_ID[beamAtStart.arenaId]); } // homePos: Entfernungen im Popup, Rückflugziel bei neuem Flug
else if (save.beam) endBeam(save);
updateHud();
ticker.refresh();
setTimeout(() => {
  $('#splash').classList.add('gone');
  setTimeout(() => $('#splash').remove(), 400);
  if (!save.profile) { onboarding.start({ profileOnly: save.seen.onboarding || save.box.length > 0 }); show('screen-onboarding'); }
  else { show('screen-map'); dailyCheck(); online.syncNow().then(() => online.fetchState()); }
}, CONST.SPLASH_MS);
