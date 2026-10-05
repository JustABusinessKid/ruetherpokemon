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
import { setScreen, toast, popup, onTab, setTabBadge, esc, ico } from './ui.js';
import { createOnboarding } from './onboarding.js';
import { sfx, haptic, setHapticsEnabled } from './audio.js';
import { createOnline } from './online.js';

const $ = s => document.querySelector(s);
window.addEventListener('error', () => { const p = document.querySelector('#splash p'); if (p) p.textContent = 'Fehler beim Laden. Bitte Seite neu laden.'; }, { once: true });
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
  if (id === 'screen-map') { map.invalidate(); if (save.profile) online.fetchState(); }
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
  b.innerHTML = text ? ico(kind === 'geo' ? 'map' : 'lock') + esc(text) : ''; b.dataset.kind = kind; b.classList.toggle('hidden', !text);
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
  fb.querySelector('span').textContent = `Heute: ${RUETHER_BY_ID[f].name} taucht deutlich häufiger auf`;
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
  // Lokal (localhost/127.0.0.1) nur mit ?online=1 gegen das echte Backend, sonst offline: Testläufe landen nicht in der Rangliste
  apiBase: /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && !new URLSearchParams(location.search).has('online') ? null : API_BASE,
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
  const lure = lureActive(save, Date.now());
  spawns = updateSpawns({ spawns, player: pos, arenas: ARENAS, ruethers: RUETHERS, now: Date.now(), rng: Math.random, lure: lure || isHappyHour(), forceRarity: debugLegendary ? 'legendaer' : null, featured: featuredRuether(today) });
  if (debugLegendary) { debugLegendary = false; $('#dbg-legendary').textContent = 'Nächster Spawn legendär: aus'; }
  map.setSpawns(spawns);
  lastSpawnPos = pos;
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
    if (hit && label === 'Super!') { save.stats.superHits = (save.stats.superHits || 0) + 1; trackQuest(save, 'superHit'); persist(); }
  },
  onCaught({ spawn }) {
    const r = catchReward(save, spawn.ruetherId, spawn.rarity, Date.now());
    let sats = r.sats;
    if (isHappyHour()) { const base = r.sats - (r.newDex ? CONST.DEX_BONUS : 0); const extra = Math.round(base * (CONST.HOUR_SATS_MULT - 1)); save.sats += extra; sats += extra; }
    gainXp(CONST.XP_CATCH[spawn.rarity] || CONST.XP_CATCH.normal);
    trackQuest(save, 'catch');
    if (spawn.rarity !== 'normal') trackQuest(save, 'catchRare');
    if (spawn.rarity === 'legendaer') online.postEvent('catch', `hat einen legendären ${RUETHER_BY_ID[spawn.ruetherId].name} gefangen!`);
    afterChange();
    return { sats, newDex: r.newDex };
  },
  onDone({ spawn }) { spawns = spawns.filter(s => s.id !== spawn.id); map.setSpawns(spawns); show('screen-map'); showLevelUps(); },
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
debug.querySelectorAll('[data-beam]').forEach(b => b.addEventListener('click', () => {
  const a = ARENA_BY_ID[b.dataset.beam];
  const p = offsetPoint(a, 40, 0);
  locator.setFake(p); map.follow(p); refreshSpawns(); refreshStops(true); toast(`Gebeamt: ${a.name}`);
}));
$('#dbg-gps').addEventListener('click', () => { locator.clearFake(); if (!locator.current) { pos = null; lastSpawnPos = null; map.setSpawns(spawns = []); } toast('GPS wieder an'); });
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
updateHud();
setTimeout(() => {
  $('#splash').classList.add('gone');
  setTimeout(() => $('#splash').remove(), 400);
  if (!save.profile) { onboarding.start({ profileOnly: save.seen.onboarding || save.box.length > 0 }); show('screen-onboarding'); }
  else { show('screen-map'); dailyCheck(); online.syncNow().then(() => online.fetchState()); }
}, CONST.SPLASH_MS);
