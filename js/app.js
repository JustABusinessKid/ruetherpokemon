import { CONST, RUETHERS, RUETHER_BY_ID, BOSSES, ARENAS, ARENA_BY_ID } from './data.js';
import * as storage from './storage.js';
import { createLocator, distance, offsetPoint } from './geo.js';
import { updateSpawns } from './spawn.js';
import { createMap } from './map.js';
import { createCatchScreen } from './catch.js';
import { createTeamScreen, createArenaScreen, createVictoryScreen } from './screens.js';
import { createBattleScreen } from './battle-ui.js';
import { makeFighter, makeBoss } from './battle.js';

const $ = s => document.querySelector(s);
let save = storage.load();
let spawns = [];
let pos = null;
let lastSpawnPos = null;
let debugWeakBoss = false;

// ---------- Screens ----------
const screens = [...document.querySelectorAll('section.screen')];
function show(id) {
  screens.forEach(s => s.classList.toggle('active', s.id === id));
  if (id === 'screen-map') map.invalidate();
}

// ---------- Banner / Toast / HUD ----------
// kind: 'geo' | 'save'. Leeren ('') wirkt nur, wenn der sichtbare Banner von derselben Quelle stammt.
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
function updateHud() {
  $('#hud-caught').textContent = `${Object.keys(save.caught).length}/${RUETHERS.length} gefangen`;
  $('#hud-arenas').textContent = `${save.arenasBeaten.length}/${ARENAS.length} Trophäen`;
  $('#badge').classList.toggle('hidden', save.arenasBeaten.length < ARENAS.length);
  for (const a of ARENAS) map.setArenaOwner(a.id, save.arenaOwners[a.id] || null);
}

// ---------- Karte ----------
const map = createMap({
  el: $('#map'),
  arenas: ARENAS,
  onSpawnTap(s) {
    if (!pos) return toast('Keine Ortung.');
    const d = distance(pos, s);
    if (d >= CONST.CATCH_RANGE) return toast(`Zu weit weg: ${Math.round(d)} m`);
    catchScreen.start(s, RUETHER_BY_ID[s.ruetherId]);
    show('screen-catch');
  },
  onArenaTap(a) {
    const owner = save.arenaOwners[a.id];
    arenaScreen.show(a, {
      distanceM: pos ? distance(pos, a) : null,
      teamSize: save.team.length,
      beaten: save.arenasBeaten.includes(a.id),
      ownerName: owner ? RUETHER_BY_ID[owner].name : null,
    });
    show('screen-arena');
  },
  onFollowChange(following) { $('#btn-locate').classList.toggle('following', following); },
});
$('#btn-locate').addEventListener('click', () => map.follow(pos));

// ---------- Spawns ----------
function refreshSpawns() {
  spawns = updateSpawns({ spawns, player: pos, arenas: ARENAS, ruethers: RUETHERS, now: Date.now(), rng: Math.random });
  map.setSpawns(spawns);
  lastSpawnPos = pos;
}
setInterval(refreshSpawns, CONST.SPAWN_INTERVAL);

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
  onDone({ spawn, caught }) {
    spawns = spawns.filter(s => s.id !== spawn.id);
    map.setSpawns(spawns);
    if (caught) {
      const c = save.caught[spawn.ruetherId];
      if (c) { c.count += 1; c.bonusBtc = Math.min(CONST.DUP_CAP, c.bonusBtc + CONST.DUP_BONUS); }
      else {
        save.caught[spawn.ruetherId] = { count: 1, bonusBtc: 0 };
        if (save.team.length < CONST.TEAM_SIZE) save.team.push(spawn.ruetherId);
      }
      persist();
    }
    show('screen-map');
  },
  onCancel() { show('screen-map'); },
});

// ---------- Team ----------
const teamScreen = createTeamScreen({
  el: $('#screen-team'),
  onChange(team) { save.team = team; persist(); },
  onBack() { show('screen-map'); },
});
$('#btn-team').addEventListener('click', () => { teamScreen.show(save); show('screen-team'); });

// ---------- Arena + Kampf ----------
let currentArena = null;
function startBattle(a) {
  currentArena = a;
  const team = save.team.map(id => makeFighter(RUETHER_BY_ID[id], save.caught[id]?.bonusBtc ?? 0));
  const enemy = makeBoss(BOSSES[a.boss]);
  if (debugWeakBoss) enemy.btc = 20;
  show('screen-battle');
  battleScreen.start({ team, enemy, rng: Math.random });
}
const arenaScreen = createArenaScreen({
  el: $('#screen-arena'),
  bosses: BOSSES,
  onBack() { show('screen-map'); },
  onFight: startBattle,
});
const battleScreen = createBattleScreen({
  el: $('#screen-battle'),
  onEnd({ won, retry }) {
    if (retry) return startBattle(currentArena);
    if (won) {
      if (!save.arenasBeaten.includes(currentArena.id)) save.arenasBeaten.push(currentArena.id);
      save.arenaOwners[currentArena.id] = save.team[0];
      persist();
      if (save.arenasBeaten.length === ARENAS.length && !save.victoryShown) {
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
  for (const r of RUETHERS) save.caught[r.id] ??= { count: 1, bonusBtc: 0 };
  for (const r of RUETHERS) if (save.team.length < CONST.TEAM_SIZE && !save.team.includes(r.id)) save.team.push(r.id);
  persist(); toast('Alle gefangen');
});
$('#dbg-weakboss').addEventListener('click', e => {
  debugWeakBoss = !debugWeakBoss;
  e.target.textContent = `Boss fast tot: ${debugWeakBoss ? 'an' : 'aus'}`;
});
$('#dbg-reset').addEventListener('click', () => { storage.clear(); save = storage.emptySave(); persist(); toast('Spielstand gelöscht'); });
$('#dbg-close').addEventListener('click', () => debug.classList.add('hidden'));

// ---------- Start ----------
updateHud();
