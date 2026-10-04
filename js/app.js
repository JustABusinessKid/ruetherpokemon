import { CONST, RUETHERS, RUETHER_BY_ID, BOSSES, ARENAS, ARENA_BY_ID, RARITY_BY_ID } from './data.js';
import * as storage from './storage.js';
import { createLocator, distance, offsetPoint } from './geo.js';
import { updateSpawns } from './spawn.js';
import { createMap } from './map.js';
import { createCatchScreen } from './catch.js';
import { createCollectionScreen, createDexScreen, createShopScreen, createArenaScreen, createVictoryScreen } from './screens.js';
import { createBattleScreen } from './battle-ui.js';
import { makeFighter, makeBoss } from './battle.js';
import { catchReward, arenaWin, arenaReward, arenaScale, powerUp, buyItem, lureActive, dexCount, DEX_TOTAL } from './progress.js';

const $ = s => document.querySelector(s);
const fmt = n => n.toLocaleString('de-DE');
let save = storage.load();
let spawns = [];
let pos = null;
let lastSpawnPos = null;
let debugWeakBoss = false;
let debugLegendary = false;

// ---------- Screens ----------
const screens = [...document.querySelectorAll('section.screen')];
function show(id) {
  screens.forEach(s => s.classList.toggle('active', s.id === id));
  if (id === 'screen-map') map.invalidate();
}

// ---------- Banner / Toast / HUD ----------
function banner(text, kind) {
  const b = $('#banner');
  if (!text && b.dataset.kind !== kind) return;
  b.textContent = text; b.dataset.kind = kind; b.classList.toggle('hidden', !text);
}
let toastTimer = null;
function toast(text) {
  const t = $('#toast'); t.textContent = text; t.classList.remove('hidden');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), 2000);
}
function persist() {
  if (!storage.save(save)) banner('Spielstand kann nicht gespeichert werden.', 'save');
  updateHud();
}
const instById = uid => save.box.find(i => i.uid === uid);
function teamInstances() {
  save.team = save.team.filter(uid => instById(uid));
  return save.team.map(instById);
}
function updateHud() {
  $('#hud-dex').textContent = `Dex ${dexCount(save)}/${DEX_TOTAL}`;
  $('#hud-sats').textContent = `💰 ${fmt(save.sats)}`;
  const mastered = ARENAS.filter(a => save.arenaMastered[a.id]).length;
  $('#badge').classList.toggle('hidden', !(save.victoryShown || mastered === ARENAS.length)); // Krone aus v1/v2 bleibt (Spec §6)
  for (const a of ARENAS) {
    const owner = instById(save.arenaOwners[a.id]);
    map.setArena(a.id, { level: save.arenaLevels[a.id] || 1, mastered: !!save.arenaMastered[a.id], ownerId: owner ? owner.id : null });
  }
  updateLure();
}
function updateLure() {
  const b = $('#lure-banner');
  const left = (save.lureUntil || 0) - Date.now();
  b.classList.toggle('hidden', left <= 0);
  if (left > 0) {
    const m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
    b.textContent = `🧲 Lockmodul: ${m}:${String(s).padStart(2, '0')}`;
  }
}
setInterval(updateLure, 1000);

// ---------- Karte ----------
const map = createMap({
  el: $('#map'),
  arenas: ARENAS,
  onSpawnTap(s) {
    if (!pos) return toast('Keine Ortung.');
    const d = distance(pos, s);
    if (d >= CONST.CATCH_RANGE) return toast(`Zu weit weg: ${Math.round(d)} m`);
    catchScreen.start(s, RUETHER_BY_ID[s.ruetherId], { rng: Math.random, rarity: s.rarity, superCoins: save.items.supercoin || 0 });
    show('screen-catch');
  },
  onArenaTap(a) {
    const level = save.arenaLevels[a.id] || 1;
    const owner = instById(save.arenaOwners[a.id]);
    arenaScreen.show(a, {
      distanceM: pos ? distance(pos, a) : null,
      teamSize: teamInstances().length,
      level,
      mastered: !!save.arenaMastered[a.id],
      ownerName: owner ? `${RUETHER_BY_ID[owner.id].name} (${RARITY_BY_ID[owner.rarity].name}, Lv. ${owner.level})` : null,
      bossBtc: Math.floor(BOSSES[a.boss].btc * arenaScale(level)),
    });
    show('screen-arena');
  },
  onFollowChange(following) { $('#btn-locate').classList.toggle('following', following); },
});
$('#btn-locate').addEventListener('click', () => map.follow(pos));

// ---------- Spawns ----------
let spawnTimer = null;
function refreshSpawns() {
  const lure = lureActive(save, Date.now()), prev = spawns;
  spawns = updateSpawns({ spawns, player: pos, arenas: ARENAS, ruethers: RUETHERS, now: Date.now(), rng: Math.random, lure, forceRarity: debugLegendary ? 'legendaer' : null });
  // Schalter erst aus, wenn wirklich ein neuer Spawn entstanden ist (nur der erste neue wird legendär, Spec §9)
  if (debugLegendary && spawns.some(s => !prev.includes(s))) { debugLegendary = false; $('#dbg-legendary').textContent = 'Nächster Spawn legendär: aus'; }
  map.setSpawns(spawns);
  lastSpawnPos = pos;
  scheduleSpawns();
}
function scheduleSpawns() {
  clearTimeout(spawnTimer);
  spawnTimer = setTimeout(refreshSpawns, lureActive(save, Date.now()) ? CONST.LURE_INTERVAL : CONST.SPAWN_INTERVAL);
}
scheduleSpawns();

// ---------- Ortung ----------
const locator = createLocator({
  onPosition(p) {
    pos = p;
    map.setPlayer(p);
    banner('', 'geo');
    if (!lastSpawnPos || distance(lastSpawnPos, p) > CONST.SPAWN_WALK) refreshSpawns();
  },
  onError() {
    banner('Ortung aus. Erlaube sie in den Browser-Einstellungen oder nutze den Test-Modus.', 'geo');
  },
});

// ---------- Fangen ----------
const catchScreen = createCatchScreen({
  el: $('#screen-catch'),
  onSuperCoinUsed() {
    save.items.supercoin = Math.max(0, (save.items.supercoin || 0) - 1);
    persist();
    return save.items.supercoin;
  },
  onCaught({ spawn }) {
    const r = catchReward(save, spawn.ruetherId, spawn.rarity, Date.now());
    persist();
    return r;
  },
  onDone({ spawn }) {
    spawns = spawns.filter(s => s.id !== spawn.id);
    map.setSpawns(spawns);
    show('screen-map');
  },
  onCancel() { show('screen-map'); },
});

// ---------- Sammlung / Dex / Shop ----------
const collection = createCollectionScreen({
  el: $('#screen-collection'),
  onTeamChange(team) { save.team = team; persist(); },
  onPowerUp(uid) {
    const res = powerUp(save, uid);
    if (res.ok) { persist(); toast(`Level ${res.level}! −${fmt(res.cost)} 💰`); }
    else if (res.reason === 'sats') toast('Nicht genug Sats.');
    return res;
  },
  onDex() { dex.show(save); show('screen-dex'); },
  onBack() { show('screen-map'); },
});
const dex = createDexScreen({ el: $('#screen-dex'), onBack() { collection.show(save); show('screen-collection'); } });
const shop = createShopScreen({
  el: $('#screen-shop'),
  onBuy(id) {
    const res = buyItem(save, id, Date.now());
    if (res.ok) {
      persist();
      toast(id === 'lockmodul' ? '🧲 Lockmodul aktiv!' : '🪙 Super-Münze gekauft');
      if (id === 'lockmodul') refreshSpawns();
    } else toast('Nicht genug Sats.');
    return res;
  },
  onBack() { show('screen-map'); },
});
$('#btn-collection').addEventListener('click', () => { teamInstances(); collection.show(save); show('screen-collection'); });
$('#btn-shop').addEventListener('click', () => { shop.show(save); show('screen-shop'); });

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
  onEnd({ won, retry }) {
    if (retry) return startBattle(currentArena);
    if (won) {
      arenaWin(save, currentArena.id, save.team[0]);
      persist();
      if (ARENAS.every(a => save.arenaMastered[a.id]) && !save.victoryShown) {
        save.victoryShown = true;
        persist();
        return show('screen-victory');
      }
    }
    show('screen-map');
  },
});
createVictoryScreen({ el: $('#screen-victory'), onBack() { show('screen-map'); } });

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
  locator.setFake(p);
  map.follow(p);
  refreshSpawns();
  toast(`Gebeamt: ${a.name}`);
}));
$('#dbg-gps').addEventListener('click', () => {
  locator.clearFake();
  if (!locator.current) { pos = null; lastSpawnPos = null; map.setSpawns(spawns = []); }
  toast('GPS wieder an');
});
$('#dbg-respawn').addEventListener('click', () => { spawns = []; refreshSpawns(); toast('Spawns neu'); });
$('#dbg-catchall').addEventListener('click', () => {
  for (const r of RUETHERS) if (!save.box.some(i => i.id === r.id)) catchReward(save, r.id, 'normal', Date.now());
  persist(); toast('Alle gefangen');
});
$('#dbg-sats').addEventListener('click', () => { save.sats += 1000; persist(); toast('+1000 💰'); });
$('#dbg-legendary').addEventListener('click', e => {
  debugLegendary = !debugLegendary;
  e.target.textContent = `Nächster Spawn legendär: ${debugLegendary ? 'an' : 'aus'}`;
});
$('#dbg-weakboss').addEventListener('click', e => {
  debugWeakBoss = !debugWeakBoss;
  e.target.textContent = `Boss fast tot: ${debugWeakBoss ? 'an' : 'aus'}`;
});
$('#dbg-reset').addEventListener('click', () => { storage.clear(); save = storage.emptySave(); persist(); toast('Spielstand gelöscht'); });
$('#dbg-close').addEventListener('click', () => debug.classList.add('hidden'));

// ---------- Start ----------
updateHud();
