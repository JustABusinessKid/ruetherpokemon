import { CONST, RUETHERS, RUETHER_BY_ID, BOSSES, ARENAS, ARENA_BY_ID, RARITY_BY_ID, pickLine } from './data.js';
import * as storage from './storage.js';
import { createLocator, distance, offsetPoint, geoHint } from './geo.js';
import { updateSpawns, lureWave, lureTrim } from './spawn.js';
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
  haunebuActive, extendHaunebu, questsUnlocked, questResult, fighterStats, buyAbility, upgradeAbility, equipAbility, loadoutFor,
} from './progress.js';
import { playSummon, playBeam, playReturn } from './flight.js';
import { makeWild } from './wild.js';
import { reachText } from './format.js';
import { createTicker } from './ticker.js';
import { dayKey, ensureDailyQuests, trackQuest, claimQuest, claimableCount, applyStreak, checkAchievements, featuredRuether, isHappyHour, seededRng } from './quests.js';
import { spinReward, stopReady, useStop, fakeStops, generatedStops, mergeStops } from './stops.js';
import { fetchStops } from './overpass.js';
import { setScreen, toast, popup, onTab, setTabBadge, esc, ico } from './ui.js';
import { createOnboarding } from './onboarding.js';
import { sfx, haptic, setHapticsEnabled } from './audio.js';
import { createOnline, onlineConfig } from './online.js';
import { MISSIONS, MISSION_BY_ID, pickSetup } from './quest/missions.js';
import { ABILITIES, FIXED, POOLS } from './quest/abilities.js';
import { createLobby } from './lobby.js';
import { createDuelScreen } from './duel-ui.js';
import { duelReward, duelFighters } from './duel.js';
import { RACE } from './quest/race.js';

const $ = s => document.querySelector(s);
// Fehler beim Start: Hinweis im Splash und ein Ausweg, falls es am Spielstand liegt (sonst hängt jeder Start; eine Kopie bleibt)
window.addEventListener('error', () => {
  const p = document.querySelector('#splash p');
  if (!p) return;
  p.textContent = 'Fehler beim Laden. Bitte Seite neu laden.';
  const b = Object.assign(document.createElement('button'), { textContent: 'Spielstand zurücksetzen' });
  b.addEventListener('click', () => { if (confirm('Hilft Neuladen nicht, liegt es meist am Spielstand. Löschen und neu anfangen?')) { storage.clear(true); location.reload(); } });
  p.after(b);
}, { once: true });
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
  backEntry(id !== 'screen-map');
  if (id === 'screen-map') { map.invalidate(); if (save.profile) online.fetchState(); dailyCheck(); }
  if (id === 'screen-collection') { teamInstances(); collection.show(save); }
  if (id === 'screen-quests') questsScreen.show(save, today);
  if (id === 'screen-leaderboard') { leaderboard.show({ save, state: online.lastState, available: online.available }); online.fetchState().then(() => { if (current === 'screen-leaderboard') leaderboard.show({ save, state: online.lastState, available: online.available }); }); }
  if (id === 'screen-profile') showProfile();
  if (id === 'screen-shop') shop.show(save);
  if (id === 'screen-victory') showVictoryFace();
}
// onlineId: echte Online-Kennung (Hash des Geräteschlüssels), der Token geht nie raus
const showProfile = () => profile.show(save, { onlineId: online.id?.slice(0, 8) || '', available: online.available, nameTaken: online.nameTaken });
onTab(id => { sfx.play('click'); show(id); });

// ---------- System-Zurück (Android-Taste, Browser) ----------
// Außerhalb der Karte liegt genau ein eigener Verlaufseintrag ({ rg: 1 }). Zurück landet dann nicht außerhalb des Spiels,
// sondern beim Zurück-Knopf des Screens; geht die App selbst zur Karte, nimmt sie den Eintrag wieder weg.
let popOwn = false; // das nächste popstate kommt von unserem history.back()
// Neu geladen (oder vom Handy verworfen und wiederhergestellt) auf unserem Eintrag: davor liegt das alte Dokument,
// history.back() lüde die Seite neu. Der Eintrag gilt deshalb als Basis.
if (history.state?.rg) history.replaceState(null, '');
function backEntry(on) {
  if (on && !history.state?.rg) history.pushState({ rg: 1 }, '');
  else if (!on && history.state?.rg && !popOwn) { popOwn = true; history.back(); }
}
window.addEventListener('popstate', e => {
  if (e.state?.rg) return; // Vorwärts im Browser: nichts tun
  if (popOwn) popOwn = false; else onBackKey();
  if (current !== 'screen-map') backEntry(true);
});
// Popup: der erste Knopf ist immer der harmlose (Abbrechen, Später, OK). Flug, Beschwörung, Onboarding: Zurück zählt nicht.
// Kampf: kein Popup über dem laufenden Kampf, nur ein Hinweis; Quest: deren Aufgeben-Rückfrage (pausiert); Stop: Belohnung steht schon.
function onBackKey() {
  if (current === 'screen-map' || current === 'screen-onboarding' || flying || $('.flight')) return;
  if (!$('#popup').classList.contains('hidden')) return $('#popup .popup-buttons button')?.click();
  const el = $(`#${current}`);
  if (current === 'screen-battle') {
    const done = el.querySelector('.overlay:not(.hidden) .done');
    return done ? done.click() : toast('Aufgeben: × oben rechts.');
  }
  if (current === 'screen-duel') { // v11: wie im Kampf, kein Popup über dem laufenden Duell
    const done = el.querySelector('.d-overlay:not(.hidden) .d-done');
    return done ? done.click() : toast('Aufgeben: × oben links.');
  }
  if (current === 'screen-stop') return show('screen-map');
  const btn = el.querySelector(current === 'screen-quest' ? '.q-quit' : current === 'screen-questresult' ? '.qr-done' : '.back');
  if (btn) btn.click(); else show('screen-map');
}
document.querySelectorAll('.sats-chip').forEach(b => b.addEventListener('click', () => show('screen-shop')));

// ---------- Banner / HUD / Persist ----------
// Ein Banner für Speichern, Online-Name und Ortung (in dieser Rangfolge), jede Art räumt nur ihren eigenen Text weg
const bannerText = { save: '', name: '', geo: '' }, BANNER_ICON = { save: 'lock', name: 'profile', geo: 'map' };
function banner(text, kind) {
  if (bannerText[kind] === text) return;
  bannerText[kind] = text;
  const k = Object.keys(bannerText).find(x => bannerText[x]) || 'geo', t = bannerText[k], b = $('#banner');
  b.innerHTML = t ? ico(BANNER_ICON[k]) + esc(t) : ''; b.dataset.kind = k; b.classList.toggle('hidden', !t);
}
$('#banner').addEventListener('click', () => { if ($('#banner').dataset.kind === 'name') show('screen-profile'); });
const instById = uid => save.box.find(i => i.uid === uid);
function teamInstances() {
  save.team = save.team.filter(uid => instById(uid));
  return save.team.map(instById);
}
const ticker = createTicker({ el: $('#btc-ticker'), getLeaderId: () => instById(save.team[0])?.id });
// Level-Ups nach Siegen (levelUpUids-Ergebnis): ein Toast für alle, nach den Erfolgs-Toasts (sonst verdrängt, max. 3 sichtbar)
function levelUpToast(ups) {
  ups = ups.filter(u => instById(u.uid));
  if (!ups.length) return;
  toast(ups.map(({ uid, level }) => `${RUETHER_BY_ID[instById(uid).id].name} Lv. ${level}!`).join(' '), { kind: 'level' });
  sfx.play('levelup');
}
function leaderInfo() {
  const l = instById(save.team[0]);
  return l ? { id: l.id, rarity: l.rarity, level: l.level } : null;
}
function persist() {
  if (storage.changed()) return adoptStored(); // anderer Tab war schneller: nie dessen neueren Stand überschreiben
  banner(storage.save(save) ? '' : 'Spielstand kann nicht gespeichert werden.', 'save');
  updateHud();
  ticker.refresh(); // Anführer kann gewechselt haben (Christian-Effekt)
  online.syncSoon();
}
// Zwei Tabs oder App + Browser-Tab teilen sich den Spielstand: speichert der andere, übernimmt dieser dessen Stand, statt ihn
// später mit dem alten zu überschreiben. Ein laufender Kampf oder eine Quest bucht ihr Ergebnis dann auf den neuen Stand.
function adoptStored() {
  save = storage.load();
  if (!save.profile) return location.reload(); // dort zurückgesetzt: Onboarding
  sfx.setEnabled(save.settings.sound !== false);
  setHapticsEnabled(save.settings.haptics !== false);
  updateHud();
  ticker.refresh();
  renderStops();
  show(current); // offenen Screen (Sammlung, Shop, Profil …) mit dem neuen Stand neu zeichnen
  toast('Spielstand aus einem anderen Tab übernommen.');
}
const syncStored = () => { if (storage.changed()) adoptStored(); };
window.addEventListener('storage', e => { if (e.key === storage.KEY || e.key === null) syncStored(); });
window.addEventListener('pageshow', e => { if (e.persisted) syncStored(); }); // aus dem Back-Forward-Cache: Events verpasst
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncStored(); });
function updateHud() {
  document.querySelectorAll('.sats-chip').forEach(b => { b.lastChild.textContent = fmt(save.sats); }); // Münz-Icon steht im HTML davor
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
      globalOwner: g ? { owner: g.owner, mine: !!g.mine } : null,
    });
  }
  updateBanners();
}
function updateBanners() {
  const lure = $('#lure-banner');
  const left = (save.lureUntil || 0) - Date.now();
  lure.classList.toggle('hidden', left <= 0);
  const wave = nextWaveAt - Date.now();
  if (left > 0) lure.lastChild.textContent = `Lockmodul ${clock(left)}${wave > 0 && nextWaveAt < save.lureUntil ? ` · nächste Welle ${clock(wave)}` : ''}`;
  $('#hour-banner').classList.toggle('hidden', !isHappyHour());
  $('#hour-banner').lastChild.textContent = `Rüther-Stunde bis ${CONST.HOUR_END}:00 · doppelte Spawns, 50 % mehr Sats`;
  const f = featuredRuether(today);
  const fb = $('#featured-banner');
  fb.classList.remove('hidden');
  fb.querySelector('img').src = `sprites/${f}.png`;
  fb.querySelector('span').textContent = `Heute: ${RUETHER_BY_ID[f].name} taucht deutlich häufiger auf`;
  beamTick();
}

// XP, Erfolge, Quests nach jedem Ereignis. Level-up-Popups warten, bis Fangsequenz bzw. Kampf vorbei sind.
const pendingLevelUps = [];
function gainXp(n) {
  const r = addXp(save, n);
  for (const lv of r.levelUps) {
    pendingLevelUps.push(lv);
    if (lv % 5 === 0 && lv <= 20) online.postEvent('level', `ist Trainer Lv. ${lv} geworden!`);
  }
  if (current !== 'screen-catch' && current !== 'screen-battle' && current !== 'screen-duel') showLevelUps();
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
    toast(`Erfolg: ${a.name} (+${CONST.ACHIEVEMENT_SATS} Sats)`, { icon: a.icon, kind: 'achievement' });
  }
  persist();
}

// ---------- Tageswechsel ----------
// Einmal pro Tag (Intervall, jede Rückkehr zur Karte), aber nie über Kampf, Fang, Quest oder Flug: das Popup blockiert
// sonst den laufenden Kampf. Er wartet dann bis zur nächsten Gelegenheit.
let checkedDay = '';
const busy = () => BEAM_WAIT.includes(current) || flying || !!$('.flight');
function dailyCheck() {
  if (!save.profile || checkedDay === dayKey() || busy()) return;
  today = checkedDay = dayKey();
  ensureDailyQuests(save, today);
  const st = applyStreak(save, today);
  if (st) {
    sfx.play('coin');
    popup({ title: `Tag ${st.streak} in Folge`, icon: 'star', html: `<p>${st.streak === 1 ? 'Dein Tagesbonus. Komm morgen wieder, dann gibt es mehr.' : 'Danke fürs Wiederkommen.'}</p><p class="big">+${fmt(st.bonus)}${ico('coin', 'ico-in')}</p>` });
  }
  persist();
}

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
  onState(st) {
    $('#online-dot').className = 'online-dot online'; $('#online-dot').title = 'Online';
    // Name gehört online einer anderen Kennung: der Merge verwirft dann sync, Arenen und Feed. Banner bis zum Umbenennen
    banner(st.nameTaken ? `Der Name „${save.profile?.nickname}“ ist online schon vergeben. Hier tippen und im Profil umbenennen.` : '', 'name');
    updateHud();
    if (current === 'screen-profile') showProfile();
  },
});

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
      globalOwner: g ? { ...g, mine: !!g.mine } : null,
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
// wave: Kauf/Debug erzwingt eine Lockmodul-Welle. Sonst kommt sie, wenn sie fällig ist (Timer, erste Ortung) oder wenn im
// Umkreis SPAWN_FORGET nichts mehr liegt (Flug, Landen, Beamen); Gehen startet während des Lockmoduls keine Extra-Welle.
function refreshSpawns(wave = false) {
  const now = Date.now(), lure = lureActive(save, now);
  const live = s => s.expires > now && (!pos || distance(pos, s) <= CONST.SPAWN_FORGET); // nicht abgelaufen, nicht vergessen
  const waveNow = lure && (wave || now >= nextWaveAt || (!!pos && !spawns.some(live)));
  if (waveNow) {
    // v9 §1: Die Welle kommt dazu, die alten bleiben. Höchstens LURE_MAX, die ältesten fallen raus, nie der gerade offene
    // Spawn (Fang-Screen, Wildkampf)
    const keep = current === 'screen-catch' ? openSpawn : fight?.spawn || null;
    // Gesichter nicht aufeinander, nicht auf Arena-Schilder (Besitzer-Foto) und nicht unter Haunebu- oder Folge-Knopf
    const room = map.lureRoom(pos, [$('#btn-haunebu'), $('#btn-locate')]);
    const old = lureTrim({ spawns, player: pos, now, keep });
    const fresh = lureWave({ player: pos, ruethers: RUETHERS, arenas: ARENAS, now, rng: Math.random, spawns: old, featured: featuredRuether(today), ...room });
    if (debugLegendary && fresh.length) fresh.at(-1).rarity = 'legendaer';
    spawns = [...old, ...fresh];
    nextWaveAt = pos ? now + CONST.LURE_INTERVAL : 0; // ohne Ortung kommt die Welle beim ersten Fix
    if (fresh.length) { map.wave(); if (current === 'screen-map') sfx.play('wave'); }
  } else if (!lure) {
    spawns = updateSpawns({ spawns, player: pos, arenas: ARENAS, ruethers: RUETHERS, now, rng: Math.random, lure: isHappyHour(), forceRarity: debugLegendary ? 'legendaer' : null, featured: featuredRuether(today) });
    nextWaveAt = 0;
  } else spawns = spawns.filter(live);
  // Lock-Zoom bleibt, solange noch Wellen-Gesichter liegen (leben länger als das Lockmodul, bei Zoom 16 decken sie sich)
  map.setLure(lure || spawns.filter(s => s.lure).length > 1);
  if (debugLegendary && (waveNow || !lure)) { debugLegendary = false; $('#dbg-legendary').textContent = 'Nächster Spawn legendär: aus'; }
  map.setSpawns(spawns);
  lastSpawnPos = pos;
  clearTimeout(spawnTimer);
  // Lockmodul: nächste Welle bzw. sein Ende (dann wieder normale Spawns); +50 ms, damit der Timer nicht knapp davor feuert
  const due = lure ? Math.min(nextWaveAt || now + CONST.LURE_INTERVAL, save.lureUntil) - now + 50 : CONST.SPAWN_INTERVAL;
  spawnTimer = setTimeout(refreshSpawns, due);
}
spawnTimer = setTimeout(refreshSpawns, CONST.SPAWN_INTERVAL);

// ---------- Stops ----------
function renderStops() { map.setStops(stops, s => stopReady(save, s.id, Date.now())); }
let stopSeq = 0;
async function refreshStops(force = false) {
  if (!pos) return;
  if (!force && lastStopPos && distance(lastStopPos, pos) < CONST.STOP_CACHE_CELL) return;
  lastStopPos = pos;
  const seq = ++stopSeq;
  stops = generatedStops(pos); renderStops(); // sofort und auch ohne Netz; echte Läden aus OSM kommen obendrauf
  const list = await fetchStops(pos);
  if (seq !== stopSeq || !list.length) return; // inzwischen neuere Anfrage oder Fake-Stops; Overpass-Fehler: nächste Rasterzelle erneut
  stops = mergeStops(list, stops); renderStops();
}

// ---------- Ortung ----------
// Position auf Karte, Reichweite, Spawns und Stops anwenden (GPS, Fake, nach der Quest)
function applyPos(p) {
  map.setPlayer(p);
  map.setReach(p);
  banner('', 'geo');
  if (!lastSpawnPos || distance(lastSpawnPos, p) > CONST.SPAWN_WALK) refreshSpawns();
  refreshStops();
}
const locator = createLocator({
  onPosition(p) {
    pos = p;
    if (!save.beam) homePos = p; // Startpunkt für den Rückflug der Haunebu
    if (flying || questRun) return; // echtes GPS mitten im Flug oder in der Quest: Marker bleibt bei der Scheibe
    applyPos(p);
  },
  onError(e) { if (!save.settings.flight) banner(geoHint(e) + ' Kein GPS (z. B. im Flugzeug)? Profil → Flugmodus.', 'geo'); },
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
    if (res.ok) { sfx.play('levelup'); toast(`Level ${res.level}! −${fmt(res.cost)} Sats`, { kind: 'level' }); trackQuest(save, 'powerup'); afterChange(); }
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
  onBuyAbility: (rid, aid) => abilityPaid(buyAbility(save, rid, aid), aid, () => 'gekauft'),
  onUpgradeAbility: (rid, aid) => abilityPaid(upgradeAbility(save, rid, aid), aid, r => `Stufe ${r.level}`),
  onEquipAbility: equipQuestAbility,
});
// v10 §1: Quest-Fähigkeiten gehören dem Rüther; Kaufen/Upgrade ziehen Sats ab, Ausrüsten ist gratis. persist speichert und synct.
const abName = aid => ABILITIES[aid].name.replace(/\u00AD/g, ''); // ohne Trennstellen des Kreismenüs
function abilityPaid(res, aid, what) {
  if (res.ok) { sfx.play('levelup'); haptic(30); toast(`${abName(aid)} ${what(res)}! −${fmt(res.cost)} Sats`, { kind: 'level' }); persist(); }
  else toast(res.reason === 'sats' ? 'Nicht genug Sats.' : res.reason === 'max' ? 'Schon auf Stufe 3.' : 'Das geht nicht.');
  return res;
}
function equipQuestAbility(rid, aid) {
  const res = equipAbility(save, rid, aid);
  if (res.ok) { sfx.play('click'); toast(`${abName(aid)} ausgerüstet`); persist(); }
  else toast('Erst kaufen, dann ausrüsten.');
  return res;
}
const dex = createDexScreen({ el: $('#screen-dex'), onBack() { show('screen-collection'); } });
const shop = createShopScreen({
  el: $('#screen-shop'),
  onBuy(id) {
    if (id === 'haunebu-extend') return extendFlight(); // Fenster inzwischen zu: Hinweis, keine Beschwörung
    if (id === 'haunebu') return buyHaunebu();
    const res = buyItem(save, id, Date.now());
    if (res.ok) { sfx.play('coin'); persist(); toast(id === 'lockmodul' ? `Lockmodul aktiv! Jede Minute ${CONST.LURE_WAVE} neue Rüther direkt bei dir.` : 'Super-Münze gekauft', { icon: id === 'lockmodul' ? 'beer' : 'coin' }); if (id === 'lockmodul') refreshSpawns(true); }
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
    toast(`Quest erledigt: +${fmt(r.sats)} Sats, +${r.xp} XP`, { icon: 'quest', kind: 'sats' });
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
    save.profile.nickname = n; persist(); online.syncNow({ force: true }); showProfile(); // Umbenennen sofort, ohne 5-Minuten-Sperre
  },
  onAvatar(id) { if (save.profile && RUETHER_BY_ID[id]) { save.profile.avatar = id; persist(); } },
  onSettings({ sound, haptics, flight }) {
    const was = !!save.settings.flight;
    save.settings = { ...save.settings, sound: !!sound, haptics: !!haptics, flight: !!flight };
    sfx.setEnabled(save.settings.sound); setHapticsEnabled(save.settings.haptics);
    if (!!flight !== was) setFlightMode(!!flight);
    persist();
  },
  async onShare() {
    const text = `Ich bin Trainer Lv. ${save.trainerLevel} bei Rüther GO: ${dexCount(save)}/${DEX_TOTAL} im Dex, ${save.stats.arenaWins} Arenasiege. ${location.origin}${location.pathname}`;
    try { if (navigator.share) await navigator.share({ title: 'Rüther GO', text }); else { await navigator.clipboard.writeText(text); toast('In die Zwischenablage kopiert.'); } } catch { /* abgebrochen */ }
  },
  // _key: Online-Geräteschlüssel, damit das neue Gerät online derselbe Spieler bleibt (privat wie der Spielstand selbst)
  async onExport() {
    const json = JSON.stringify({ ...save, _key: online.exportKey?.() || undefined });
    const note = 'Nur an dich selbst schicken, er enthält deinen Online-Schlüssel.';
    try { await navigator.clipboard.writeText(json); toast(`Spielstand kopiert. ${note}`); } catch { popup({ title: 'Spielstand', html: `<p class="sub">${note}</p><textarea readonly class="export">${esc(json)}</textarea>` }); }
    return json;
  },
  // Nur bekannte Versionen; v2/v3 brauchen box (sonst überschriebe ein leerer Stand den alten). Erfolg erst nach dem Speichern.
  onImport(text) {
    let data = null;
    try { data = JSON.parse(text); } catch { /* kein JSON */ }
    const v = data && typeof data === 'object' ? data.version : null;
    if (!(v === 1 || ((v === 2 || v === 3) && Array.isArray(data.box)))) {
      toast(Number.isFinite(v) && v > 3 ? 'Der Spielstand ist aus einer neueren Version. Lade erst die Seite neu.' : 'Das war kein gültiger Spielstand.');
      return false;
    }
    const { _key, ...rest } = data, next = migrate(rest);
    if (!storage.save(next)) { toast('Speichern fehlgeschlagen: Speicher voll oder gesperrt.'); return false; }
    save = next;
    if (typeof _key === 'string') online.importKey?.(_key);
    toast('Spielstand übernommen.');
    setTimeout(() => location.reload(), 600);
    return true;
  },
  onReset() { storage.clear(); location.reload(); },
  onShop() { show('screen-shop'); },
  onTogether() { // v11: braucht nur das Profil; nicht mitten im Haunebu-Flug oder in der Quest
    if (!save.profile) return;
    if (flying || questRun || $('.flight')) return toast('Erst landen.', { icon: 'haunebu' });
    sfx.play('click');
    lobby.open();
    show('screen-lobby');
  },
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
// fight = { arena }, { spawn } (Wildkampf) oder { haunebu } (Hitler); uids = Team beim Kampfstart (activeIndex zeigt hier hinein);
// booked = was beim Kampfende (onResult) schon verbucht und gespeichert ist, onEnd zeigt es nur noch an und navigiert
let fight = null;
// Haunebu-Fenster während eines Arena-Flugs zu: kein „Nochmal", zurück zur Karte, dann Rückflug
const beamOver = () => !!save.beam && !activeBeam(save, Date.now());
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
  battleScreen.start({ team, enemy, rng: Math.random, mode: 'arena', arena: a, arenaLevel: level, reward: arenaReward(level), masteredAfter: level >= CONST.ARENA_LEVELS, canRetry: () => !beamOver() });
}
// Wildkampf (Spec §2): Sieg fängt, Niederlage/Zeit lässt ihn abhauen, Aufgeben behält den Spawn
// Was bookWild am Ende wirklich gutschreibt: Siegbonus + Fang-Sats (+ Happy Hour) + Dex-Bonus
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
function bookWild({ spawn, uids }, { won, reason, activeIndex = 0 }) {
  if (!won && reason === 'quit') { afterChange(); return {}; } // Spezial-/Ausweich-/Combo-Fortschritt sichern
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
  return { ups, msg };
}
function bookArena(arena, uids, won) {
  if (!won) { afterChange(); return {}; }
  const wasUnlocked = questsUnlocked(save), first = !save.arenaMastered[arena.id];
  const w = arenaWin(save, arena.id, save.team[0]);
  gainXp(CONST.XP_ARENA * w.level);
  trackQuest(save, 'arenaWin');
  const ups = levelUpUids(save, uids);
  // claimArena pollt selbst und sendet nur, wenn sich Besitzer oder Stufe dort ändern (lastState ist nach dem Kampf veraltet);
  // „gemeistert" nur beim ersten Mal: Farmen einer gehaltenen Arena flutete sonst Feed und ntfy-Tageslimit
  const leader = leaderInfo();
  online.syncNow().then(() => online.claimArena(arena.id, w.level, leader)).then(() => updateHud());
  if (w.mastered && first) online.postEvent('achievement', `hat ${arena.name} gemeistert!`);
  afterChange();
  return { ups, unlocked: !wasUnlocked && questsUnlocked(save) };
}
const arenaScreen = createArenaScreen({ el: $('#screen-arena'), bosses: BOSSES, onBack() { show('screen-map'); }, onFight: startBattle, onBeam: beamTo });
// Statistik und Tagesquests aus Kampf und Duell (special, gelungenes dodge, combo); gespeichert wird mit dem Ergebnis
function fightEvent(e) {
  if (e.type === 'special') { save.stats.specials = (save.stats.specials || 0) + 1; trackQuest(save, 'special'); }
  if (e.type === 'dodge') { save.stats.dodges = (save.stats.dodges || 0) + 1; trackQuest(save, 'dodge'); }
  if (e.type === 'combo') { if (e.value > (save.stats.maxCombo || 0)) save.stats.maxCombo = e.value; if (e.value >= 8) trackQuest(save, 'combo8'); }
}
const battleScreen = createBattleScreen({
  el: $('#screen-battle'),
  onEvent: fightEvent,
  // Sofort beim Kampfende verbuchen und speichern, nicht erst mit „Weiter": Neuladen oder App-Kill davor verliert sonst Sieg und Fang
  onResult(res) {
    const f = fight;
    if (!f || f.booked) return;
    f.booked = f.spawn ? bookWild(f, res) : f.haunebu ? bookHaunebu(res.won) : bookArena(f.arena, f.uids, res.won);
  },
  onEnd(res) {
    const f = fight, b = f.booked || {};
    fight = null;
    if (f.spawn) { if (b.msg) toast(b.msg, { kind: 'sats' }); levelUpToast(b.ups || []); }
    else if (f.haunebu) { if (res.won) toast(`Haunebu erbeutet: +${fmt(CONST.HAUNEBU_WIN_SATS)} Sats. ${CONST.HAUNEBU_USE_MS / 60000} Minuten freie Flüge, Knopf unten rechts auf der Karte.`, { icon: 'haunebu', kind: 'sats' }); }
    else {
      if (res.retry && !beamOver()) return startBattle(f.arena);
      levelUpToast(b.ups || []);
      if (b.unlocked) toast('Haunebu-Quests freigeschaltet! Schau in den Quests-Tab.', { icon: 'haunebu', kind: 'achievement' });
      if (res.won && ARENAS.every(a => save.arenaMastered[a.id]) && !save.victoryShown) { save.victoryShown = true; persist(); show('screen-victory'); return showLevelUps(); }
    }
    show('screen-map');
    showLevelUps();
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
  const res = buyItem(save, 'haunebu', Date.now()); // merkt die bezahlte Beschwörung (summonPending), bis der Kampf entschieden ist
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
function bookHaunebu(won) {
  save.summonPending = 0; // entschieden: Neuladen setzt nichts mehr fort
  if (won) {
    haunebuWin(save, Date.now());
    gainXp(CONST.XP_HAUNEBU);
    online.postEvent('achievement', 'hat die Haunebu erbeutet und fliegt 10 Minuten lang frei zu jeder Arena!');
  }
  afterChange();
  return {};
}
// Bezahlt, aber nie entschieden (Neuladen oder App-Kill während Beschwörung oder Kampf): Hitler wartet noch, der Kampf
// beginnt beim Start neu. Ohne Team (nur per Import möglich) gibt es die Sats zurück. true = Kampf läuft
function resumeSummon() {
  if (!save.summonPending) return false;
  if (!teamInstances().length) {
    save.sats += save.summonPending;
    save.stats.haunebuSummons = Math.max(0, save.stats.haunebuSummons - 1);
    save.summonPending = 0;
    persist();
    toast('Beschwörung abgebrochen, die Sats sind zurück.', { icon: 'haunebu', kind: 'sats' });
    return false;
  }
  toast('Hitler wartet noch auf dich.', { icon: 'haunebu' });
  startHaunebu();
  return true;
}
// v9 §1: Gehört sie dir schon, verlängert der Shop- bzw. Chip-Knopf um 10 Minuten für 5.000 Sats, ohne Hitler-Kampf
const extendLabel = `+${CONST.HAUNEBU_EXTEND_MS / 60000} Min · ${fmt(CONST.HAUNEBU_EXTEND_COST)}`;
function extendFlight() {
  const res = extendHaunebu(save, Date.now());
  if (!res.ok) { toast(res.reason === 'sats' ? `Nicht genug Sats. Verlängern kostet ${fmt(CONST.HAUNEBU_EXTEND_COST)}.` : 'Die Haunebu ist nicht im Einsatz.'); return res; }
  sfx.play('coin');
  persist(); // zieht Countdown-Chip und Beam-Zeit nach (beamTick)
  toast(`Haunebu verlängert: noch ${clock(res.until - Date.now())}`, { icon: 'haunebu' });
  return res;
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
    buttons: [{ label: 'Abbrechen' }, { label: extendLabel }],
  });
  if (id === 1) extendFlight();
  else if (ARENA_BY_ID[id]) beamTo(ARENA_BY_ID[id]);
}
// Hinfliegen: speichern (Heimatort bleibt beim Weiterspringen), Animation, dann Fake-Position wie beim Debug-Beamen
async function beamTo(a) {
  if (flying || questRun) return toast('Die Haunebu ist gerade unterwegs.', { icon: 'haunebu' }); // Popup lag über dem Flug: kein zweiter Flug
  const res = startBeam(save, a.id, Date.now(), homePos || save.beam?.from || null);
  if (!res.ok) return toast(res.reason === 'keine' ? 'Die Haunebu ist nicht im Einsatz. Beschwöre sie im Shop.' : 'Unbekanntes Ziel.');
  persist();
  if (current !== 'screen-map') show('screen-map');
  flying = true;
  await playBeam(document.body, { map, to: landPoint(a), label: a.name }).catch(() => {});
  flying = false; // vor land(): setFake ruft onPosition sofort
  if (!activeBeam(save, Date.now())) return returnHome(); // Fenster lief im Flug ab: gleich zurück statt „noch 0:00"
  land(a);
  toast(`Gelandet: ${a.name} · noch ${clock(save.haunebuUntil - Date.now())}`, { icon: 'haunebu' });
}
// Landeplatz 40 m nördlich der Arena (nicht auf ihrem Schild). Die Haunebu fliegt gleich dorthin, sonst setzte der Punkt erst auf
// dem Schild auf und spränge nach dem Absetzen samt Kamera weiter
function landPoint(a) { return offsetPoint(a, 40, 0); }
// onPosition (setFake) holt Spawns und Stops für den neuen Ort genau einmal; erst folgen: die Lockmodul-Welle meidet dann die Knöpfe
function land(a) {
  const p = landPoint(a);
  lastSpawnPos = lastStopPos = null; stopRetryAt = 0;
  map.follow(p); locator.setFake(p);
}
// Flugmodus: Position einfrieren (letzte bekannte, sonst Worringen). Fangen, Kämpfen, Quests laufen ohne GPS und ohne Netz weiter.
function setFlightMode(on) {
  if (on) {
    const p = save.beam ? (homePos || save.beam.from) : (homePos || pos || locator.current);
    const at = p ? { lat: p.lat, lon: p.lon } : offsetPoint(ARENA_BY_ID.worringen, 40, 0);
    save.settings.flightPos = at;
    if (!save.beam) { lastSpawnPos = lastStopPos = null; locator.setFake(at); map.follow(at); }
    toast('Flugmodus an: Dein Standort ist eingefroren. Rüther tauchen trotzdem auf.', { icon: 'map' });
  } else {
    save.settings.flightPos = null;
    if (!save.beam) gpsBack();
    toast('Flugmodus aus: Es gilt wieder dein echtes GPS.', { icon: 'map' });
  }
}
// Zurück zur echten Ortung (im Flugmodus zur eingefrorenen Position); ohne GPS ist der Spieler danach nirgends, auch kein Punkt mehr auf der Karte
function gpsBack() {
  if (save.settings.flight && save.settings.flightPos) { lastSpawnPos = lastStopPos = null; locator.setFake(save.settings.flightPos); return; }
  locator.clearFake();
  if (!locator.current) { pos = homePos = null; lastSpawnPos = null; map.setSpawns(spawns = []); map.setReach(null); map.setPlayer(null); }
}
// Ohne GPS gibt es kein Zuhause (pos ist dann die Fake-Position an der Arena): kein Flug „Kurs: Zuhause" an dieselbe Stelle
async function returnHome() {
  if (!save.beam || flying) return;
  const to = homePos || save.beam.from || null;
  endBeam(save);
  persist();
  // offenes Flug-Popup („Haunebu-Flug", „Wohin fliegen?") über den harmlosen ersten Knopf schließen: es läge sonst über dem
  // Rückflug und stünde danach veraltet da (Noch 0:00)
  if ($('#popup:not(.hidden) .hb-left')) $('#popup .popup-buttons button')?.click();
  if (current !== 'screen-map') show('screen-map');
  flying = true;
  if (to) await playReturn(document.body, { map, to }).catch(() => {});
  flying = false; // vor gpsBack(): clearFake ruft onPosition sofort
  gpsBack();
  map.follow(locator.current);
  toast('Die Haunebu hat dich zurückgebracht.', { icon: 'haunebu' });
}
// Jede Sekunde (updateBanners): Knopf und Countdown-Chip nur im Fenster, Toast + Haptik bei 1:00 und am Ende (nicht während
// einer Quest, die läuft weiter); Fenster zu → Rückflug, aber nicht mitten im Kampf, Fang, Stop, Siegesscreen, Team-Wahl oder Quest
const BEAM_WAIT = ['screen-battle', 'screen-catch', 'screen-stop', 'screen-victory', 'screen-questteam', 'screen-quest', 'screen-questresult', 'screen-lobby', 'screen-duel'];
let haunebuWasActive = haunebuActive(save, Date.now()), haunebuWarned = 0;
function beamTick() {
  const now = Date.now(), active = haunebuActive(save, now), left = (save.haunebuUntil || 0) - now, chip = $('#beam-chip');
  $('#btn-haunebu').classList.toggle('hidden', !active);
  chip.classList.toggle('hidden', !active);
  if (active) chip.querySelector('.beam-left').textContent = clock(left);
  document.querySelectorAll('#popup .hb-left[data-until]').forEach(n => { n.textContent = clock(n.dataset.until - now); }); // offene Flug-Popups zählen mit
  if (active && left <= 60_000 && haunebuWarned !== save.haunebuUntil && !questRun) {
    haunebuWarned = save.haunebuUntil;
    toast('Noch 1 Minute mit der Haunebu.', { icon: 'haunebu' }); haptic([40, 60, 40]);
  }
  if (haunebuWasActive && !active && !questRun) { toast('Die Haunebu fliegt zurück zu Hitler.', { icon: 'haunebu' }); haptic([80, 40, 80, 40, 80]); }
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
    buttons: [{ label: 'Bleiben' }, { label: extendLabel }, { label: 'Nach Hause', primary: true }],
  });
  if (i === 1) extendFlight();
  if (i === 2) returnHome();
});

// ---------- v8/v9: Haunebu-Quests (Spec v8 §5.1, v9 §1–§4) ----------
// Tab → Mission → Team-Wahl (solo: entfällt) → „Abflug" (playBeam) → Quest-Screen → Ergebnis → Rückflug.
// v9: Die Quest verbraucht die Haunebu nicht. Ein laufender Arena-Flug bleibt in save.beam stehen (BEAM_WAIT hält den
// Rückflug an, Neuladen landet wieder an der Arena) und geht danach weiter, solange das Fenster offen ist; sonst nach Hause.
// questRun = { mission, setup, insts, home, beam: { arenaId, from } | null, ended, kieser (Debug) }; solange bewegt GPS die Karte nicht.
// home: echte Position; an einer Arena ohne GPS null (pos ist dort die Fake-Position, ein Rückflug „Zuhause" ginge an die Arena)
const questTeam = createQuestTeamScreen({ el: $('#screen-questteam'), onStart: launchQuest, onEquip: equipQuestAbility, onBack() { show('screen-quests'); } });
const questResultScreen = createQuestResultScreen({ el: $('#screen-questresult'), onDone: questHome });
let questScreen = null, questView = null;
// Der Quest-Modus (js/quest/view.js) lädt erst beim ersten Abflug
const loadQuestView = () => (questView ||= import('./quest/view.js').catch(e => { questView = null; throw e; }));
// Ein Quest-Screen für Solo, Koop und Rennen; onProgress geht nur im Rennen an den Partner (lobby.progress prüft das)
async function questScreenReady() {
  const view = await loadQuestView();
  return (questScreen ||= view.createQuestScreen({ el: $('#screen-quest'), onEnd: endQuest, onProgress: p => lobby.progress(p) }));
}
// v9 §3: Solo-Missionen nehmen das stärkste Exemplar dieses Rüthers
const soloInst = id => save.box.filter(i => i.id === id).sort((a, b) => fighterStats(RUETHER_BY_ID[b.id], b).btc - fighterStats(RUETHER_BY_ID[a.id], a).btc)[0] || null;
async function openQuest(id) {
  const m = MISSION_BY_ID[id];
  if (!m || !questsUnlocked(save)) return;
  if (!haunebuActive(save, Date.now())) {
    const i = await popup({ title: 'Kapere zuerst die Haunebu', html: '<p>Ohne Flugscheibe kommt ihr nicht hin. Beschwöre sie im Shop und besiege Hitler, dann habt ihr 10 Minuten.</p>', buttons: [{ label: 'Später' }, { label: 'Zum Shop', primary: true }] });
    if (i === 1) show('screen-shop');
    return;
  }
  sfx.play('click');
  if (m.solo) return launchQuest(m.id, []); // Team-Wahl entfällt, das Briefing zeigt der Quest-Screen
  questTeam.show(save, m);
  show('screen-questteam');
}
// opts.setup: feste Karte (Debug), sonst gewürfelt; opts.kieser: Debug „Stefan ruft" direkt nach dem Start
async function launchQuest(id, uids, { setup = null, kieser = false } = {}) {
  const mission = MISSION_BY_ID[id];
  if (!mission || questRun || flying) return;
  const insts = mission.solo ? [soloInst(mission.solo)].filter(Boolean) : uids.map(instById).filter(Boolean);
  if (!haunebuActive(save, Date.now())) { toast('Die Haunebu ist weg. Beschwöre sie neu.', { icon: 'haunebu' }); return show('screen-quests'); }
  if (!insts.length) return toast(mission.solo ? `Fang erst ${RUETHER_BY_ID[mission.solo].name}.` : 'Nimm mindestens einen Rüther mit.');
  flying = true; // sperrt schon beim Laden: Doppeltipp auf „Abflug" startet sonst zwei Flüge
  try { await questScreenReady(); } catch (e) { flying = false; console.warn('Quest-Modus', e); return toast('Der Quest-Modus lädt nicht. Bitte Seite neu laden.'); }
  const b = save.beam;
  questRun = { mission, setup: setup || pickSetup(mission, Math.random), insts, home: homePos || b?.from || (b ? null : pos), beam: b ? { arenaId: b.arenaId, from: b.from } : null, kieser };
  show('screen-map');
  await playBeam(document.body, { map, to: mission, label: mission.place }).catch(() => {});
  flying = false;
  show('screen-quest');
  // v10: je Einheit die ausgerüsteten Fähigkeiten mit Stufe (auch am Kämpfer, so liest createQuest sie als team[i].loadout)
  const loadouts = insts.map(i => loadoutFor(save, i.id));
  const fighters = insts.map((i, k) => ({ ...makeFighter(RUETHER_BY_ID[i.id], i), loadout: loadouts[k] }));
  await questScreen.start({ mission, setup: questRun.setup, team: insts, fighters, loadouts, rng: Math.random });
  if (questRun?.kieser && current === 'screen-quest') { // Debug „Stefan ruft": Briefing zu, dann holt Stefan Viktor sofort
    $('#screen-quest .q-go')?.click();
    questScreen.send?.({ type: 'catch' });
  }
}
// onEnd({ result, missionId, score, objective, timeMs, alarmFree, setup, kieser, fine, … }): verbuchen, Ergebnis-Screen
function endQuest(summary) {
  if (together) return endTogetherQuest(summary);
  const run = questRun;
  if (!run || run.ended) return;
  run.ended = true;
  const reward = questResult(save, run.mission.id, summary.result, summary.score, summary.alarmFree, { kieser: summary.kieser, fine: summary.fine });
  if (reward) gainXp(reward.xp);
  if (reward?.firstDone) online.postEvent('quest', `hat die Haunebu-Quest „${run.mission.name}“ geschafft!`);
  afterChange();
  questResultScreen.show({ mission: run.mission, setup: summary.setup || run.setup, summary, reward, team: run.insts });
  show('screen-questresult');
}
async function questHome() {
  if (together) { together = null; show('screen-lobby'); lobby.back(); return showLevelUps(); } // v11: kein Flug, zurück in die Lobby
  const run = questRun;
  if (!run?.ended || flying) return;
  show('screen-map');
  const now = Date.now(), open = haunebuActive(save, now), b = activeBeam(save, now), arena = b ? ARENA_BY_ID[b.arenaId] : null;
  if (!arena && save.beam) { endBeam(save); persist(); } // Fenster zu: der Arena-Flug endet, es geht nach Hause
  flying = true;
  if (arena) await playBeam(document.body, { map, to: landPoint(arena), label: arena.name }).catch(() => {});
  else if (run.home) await playReturn(document.body, { map, to: run.home }).catch(() => {});
  flying = false;
  questRun = null;
  if (arena) land(arena);
  else {
    if (run.beam) gpsBack(); // war vorher per Haunebu an einer Arena: zurück zur echten Ortung
    else if (locator.current) applyPos(locator.current); // von zu Hause: in der Quest weitergegangen, Punkt und Kreis nachziehen
    map.follow(locator.current || run.home);
  }
  const left = clock(save.haunebuUntil - Date.now());
  toast(arena ? `Zurück: ${arena.name} · noch ${left}` : open ? `Die Haunebu hat euch nach Hause gebracht. Sie bleibt noch ${left}.`
    : 'Die Haunebu hat euch nach Hause gebracht und fliegt zurück zu Hitler.', { icon: 'haunebu' });
}

// ---------- v11: Zusammen spielen (Spec Mehrspieler §2–§6) ----------
// Lobby (js/lobby.js) → Duell (js/duel-ui.js), Koop-Quest oder Quest-Rennen (js/quest/view.js). Kein questRun, kein Flug.
// together = { mode, role, link, mission, setup, seed, teams, names, partner, booked } solange ein Modus läuft (bis zurück in der Lobby).
// Belohnungen werden sofort beim Entscheid verbucht und gespeichert (onResult bzw. onEnd), wie bei Arena und Quest.
let together = null;
const lobby = createLobby({
  el: $('#screen-lobby'),
  getSave: () => save,
  persist,
  onExit() { together = null; show('screen-profile'); },
  onStart: startTogether,
  onRace(r) { // Rennen: Gegner-Chip im Quest-Screen, Live-Stand auf dem Ergebnis-Screen
    if (together?.mode !== 'race') return;
    if (current === 'screen-quest' && !together.booked) questScreen?.setRival(r.rival);
    if (current === 'screen-questresult' && !r.done) questResultScreen.setRace(r); // entschieden: die Endanzeige setzt bookRace (mit Bonus)
  },
  onRaceDone: bookRace,
});
const duelScreen = createDuelScreen({
  el: $('#screen-duel'),
  onEvent: fightEvent,
  onResult(o) { // genau einmal: duelReward kennt Aufgeben, Abbruch und MIN_REWARD_MS
    const r = duelReward(o);
    save.sats += r.sats;
    if (r.xp) gainXp(r.xp);
    afterChange();
  },
  onEnd() { together = null; show('screen-lobby'); lobby.back(); showLevelUps(); },
});
// Kämpfer aus Picks (die Lobby hat sie gesäubert, duelFighters rechnet die Werte neu): Quest-Modi mit Loadout, Koop mit owner
const questFighters = (picks, owner) => duelFighters(picks).map((f, i) => ({ ...f, loadout: picks[i].loadout, ...(owner && { owner }) }));
async function startTogether(g) {
  const t = together = { ...g, booked: false };
  if (g.mode === 'duel') {
    show('screen-duel');
    return duelScreen.start({ link: g.link, role: g.role, teams: g.teams, names: g.names });
  }
  let qs;
  try { qs = await questScreenReady(); } catch (e) { console.warn('Quest-Modus', e); together = null; toast('Der Quest-Modus lädt nicht. Bitte Seite neu laden.'); return lobby.back(); }
  if (together !== t) return; // inzwischen abgebrochen
  const coop = g.mode === 'coop';
  // Koop: erst die Picks des Hosts, dann die des Gasts (gleiche Reihenfolge auf beiden Geräten); Rennen: nur das eigene Team
  const fighters = coop ? [...questFighters(g.teams.host, 'host'), ...questFighters(g.teams.guest, 'guest')] : questFighters(g.teams[g.role]);
  show('screen-quest');
  await qs.start({ mission: g.mission, setup: g.setup, fighters, rng: seededRng(g.seed), tutorial: false, ...(coop && { coop: { link: g.link, role: g.role, partner: g.partner } }) });
  if (!coop && together === t && !t.booked) qs.setRival({ ...g.partner, done: 0, total: 0, over: false }); // start() räumt den Chip ab
}
// Ende von Koop oder Rennen: eigene Zusammenfassung verbuchen (Koop: die des Hosts, Score und Strafe gemeinsam), Ergebnis zeigen
function endTogetherQuest(summary) {
  const t = together;
  if (t.booked) return;
  t.booked = true;
  const reward = questResult(save, t.mission.id, summary.result, summary.score, summary.alarmFree, { kieser: summary.kieser, fine: summary.fine });
  if (reward) gainXp(reward.xp);
  afterChange();
  const race = t.mode === 'race' ? { rival: { ...t.partner, done: 0, total: 0 }, mine: { score: summary.score } } : null;
  questResultScreen.show({ mission: t.mission, setup: summary.setup || t.setup, summary, reward, team: summary.team || [], together: { mode: t.mode, me: t.names[t.role], partner: t.partner, race } });
  show('screen-questresult');
  if (race) lobby.raceEnd({ result: summary.result, score: summary.score, timeMs: summary.timeMs });
}
// Rennen entschieden (beide rend da) oder ohne Wertung (Verbindung weg): Sieger bekommt den Bonus, sofort gespeichert
function bookRace(r) {
  const bonus = r.winner === 'me' ? { sats: RACE.WIN_SATS, xp: RACE.WIN_XP } : null;
  if (bonus) { save.sats += bonus.sats; gainXp(bonus.xp); afterChange(); sfx.play('win'); }
  if (current === 'screen-questresult' && together?.mode === 'race') questResultScreen.setRace({ ...r, done: true, bonus });
  else if (bonus) toast(`Rennen gewonnen: +${fmt(bonus.sats)} Sats, +${bonus.xp} XP`, { kind: 'sats' });
  else if (!r.his) toast('Rennen ohne Wertung (Verbindung weg).');
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
      toast(`Willkommen, ${nickname}! +${CONST.STARTER_SATS} Sats und eine Super-Münze.`, { icon: 'bag', kind: 'sats' });
    }
    save.seen.onboarding = true;
    save.seen.news = VERSION; // Neulinge brauchen kein „Was ist neu“
    persist();
    online.syncNow();
    show('screen-map'); // mit Tagescheck
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
// v9 §8: Quest starten mit Auswahl Mission, Karte (Layout) und Spiegelung, sonst gewürfelt; mit aktuellem Team (solo: der Rüther
// der Mission), Haunebu notfalls geschenkt. „Stefan ruft": Camping starten und sofort die Kieser-Cutscene auslösen.
const dbgMission = $('#dbg-mission'), dbgLayout = $('#dbg-layout'), dbgMirror = $('#dbg-mirror');
dbgMission.innerHTML = MISSIONS.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('');
const dbgLayouts = () => { dbgLayout.innerHTML = '<option value="">Karte: Zufall</option>' + MISSION_BY_ID[dbgMission.value].layouts.map(l => `<option value="${l.id}">${esc(l.name)}</option>`).join(''); };
dbgMission.addEventListener('change', dbgLayouts);
dbgLayouts();
function dbgQuest(id, kieser = false) {
  const m = MISSION_BY_ID[id], uids = teamInstances().map(i => i.uid);
  if (!m.solo && !uids.length) return toast('Stell erst ein Team auf.');
  if (m.solo && !soloInst(m.solo)) return toast(`Fang erst ${RUETHER_BY_ID[m.solo].name}.`);
  if (!haunebuActive(save, Date.now())) save.haunebuUntil = Date.now() + CONST.HAUNEBU_USE_MS;
  const setup = pickSetup(m, Math.random), l = m.layouts.find(x => x.id === dbgLayout.value);
  if (l && l.id !== setup.layoutId) Object.assign(setup, { layoutId: l.id, variantId: l.variants[Math.floor(Math.random() * l.variants.length)].id });
  if (dbgMirror.value) setup.mirror = dbgMirror.value === '1';
  launchQuest(m.id, uids, { setup, kieser });
}
$('#dbg-quest').addEventListener('click', () => dbgQuest(dbgMission.value));
$('#dbg-bernd').addEventListener('click', () => dbgQuest('camping', true));
// v10: alle Quest-Fähigkeiten gratis auf Stufe 3, die erste Pool-Fähigkeit ausgerüstet
$('#dbg-abilities').addEventListener('click', () => {
  for (const rid of Object.keys(FIXED)) save.questAbilities[rid] = { levels: Object.fromEntries([...FIXED[rid], ...POOLS[rid]].map(aid => [aid, 3])), slot: POOLS[rid][0] };
  persist(); if (current === 'screen-collection') collection.show(save); toast('Alle Fähigkeiten auf Stufe 3');
});
$('#dbg-lure').addEventListener('click', () => { save.lureUntil = Date.now() + CONST.LURE_MS; persist(); refreshSpawns(true); toast('Lockmodul an'); });
$('#dbg-respawn').addEventListener('click', () => { spawns = []; refreshSpawns(true); toast('Spawns neu'); });
$('#dbg-stops').addEventListener('click', () => { if (!pos) return toast('Keine Ortung.'); stopSeq++; stops = fakeStops(pos, Math.random); renderStops(); toast('3 Fake-Stops'); });
$('#dbg-catchall').addEventListener('click', () => { for (const r of RUETHERS) if (!save.box.some(i => i.id === r.id)) catchReward(save, r.id, 'normal', Date.now()); afterChange(); toast('Alle gefangen'); });
$('#dbg-sats').addEventListener('click', () => { save.sats += 1000; persist(); toast('+1000 Sats', { kind: 'sats' }); });
$('#dbg-xp').addEventListener('click', () => { gainXp(500); afterChange(); toast('+500 XP'); });
$('#dbg-legendary').addEventListener('click', e => { debugLegendary = !debugLegendary; e.target.textContent = `Nächster Spawn legendär: ${debugLegendary ? 'an' : 'aus'}`; });
$('#dbg-weakboss').addEventListener('click', e => { debugWeakBoss = !debugWeakBoss; e.target.textContent = `Boss fast tot: ${debugWeakBoss ? 'an' : 'aus'}`; });
$('#dbg-reset').addEventListener('click', () => { storage.clear(); location.reload(); });
$('#dbg-close').addEventListener('click', () => debug.classList.add('hidden'));

// ---------- v11: Was ist neu / App-Update ----------
// Einmal pro Version „Was ist neu“ (Web und App). Die App (APK) fragt dazu version.json im Repo ab und bietet eine
// neuere APK zum Herunterladen an (der Link geht über Capacitor in den Browser, der lädt die Datei).
const VERSION = 11;
const NEWS = [
  'Zusammen spielen ohne Netz (nur in der App): Arena-Duell 3 gegen 3, Koop-Quest und Quest-Rennen über Bluetooth und WLAN-Direct. Profil → Zusammen spielen.',
  'Abwehr im Kampf neu: Ausweichen zählt sofort beim Wischen (jede Richtung) oder per Ausweichen-Knopf. Kurz vor dem Einschlag gibt es „Perfekt!“: kein Schaden und Bonus-Mining.',
  'Der Ausweichen-Knopf zeigt mit einem Zeitbalken, wann es einschlägt, und sagt dir, ob du zu früh oder zu spät warst. Auch beim Tachionenbitcoin.',
];
const VERSION_URL = 'https://raw.githubusercontent.com/JustABusinessKid/ruetherpokemon/main/version.json';
const newsHtml = list => `<ul class="news">${list.map(n => `<li>${esc(n)}</li>`).join('')}</ul>`;
function newsCheck() {
  if (!save.profile || current !== 'screen-map') return; // nie über Kampf, Fang oder Quest; dann beim nächsten Start
  if ((save.seen.news || 0) < VERSION) {
    save.seen.news = VERSION; persist();
    popup({ title: 'Neu in Rüther GO', icon: 'star', html: newsHtml(NEWS) });
  }
  if (!globalThis.Capacitor?.isNativePlatform?.()) return; // im Browser aktualisiert der Service Worker von selbst
  fetch(`${VERSION_URL}?t=${Date.now()}`, { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(async v => {
    if (!v || !(v.v > VERSION) || !/^https:\/\/github\.com\//.test(v.apk || '')) return;
    const i = await popup({ title: 'Neue App-Version', icon: 'star', html: `<p>Version ${esc(String(v.v))} ist da. Herunterladen, öffnen und installieren, dein Spielstand bleibt.</p>${newsHtml(v.news || [])}`, buttons: [{ label: 'Später' }, { label: 'Herunterladen', primary: true }] });
    if (i === 1) location.href = v.apk;
  }).catch(() => {}); // offline: nächstes Mal
}

// ---------- Start ----------
// Intervalle erst hier: bricht der Start oben ab (Leaflet oder ein Modul fehlt), liefen sie sonst ins Leere und
// würfen jede Sekunde Fehler (Variablen weiter unten noch nicht angelegt)
setInterval(updateBanners, 1000);
setInterval(dailyCheck, 60_000);
setInterval(() => { if (current === 'screen-map' || current === 'screen-leaderboard') online.fetchState().then(ok => { if (!ok) { $('#online-dot').className = 'online-dot offline'; $('#online-dot').title = 'Offline'; } }); }, CONST.STATE_POLL);
setInterval(renderStops, 30_000);
sfx.setEnabled(save.settings.sound !== false);
setHapticsEnabled(save.settings.haptics !== false);
// Haunebu-Flug über Neuladen: noch aktiv → ohne Animation wieder hin, abgelaufen → aufräumen
const beamAtStart = activeBeam(save, Date.now());
if (beamAtStart && ARENA_BY_ID[beamAtStart.arenaId]) { homePos = beamAtStart.from || null; land(ARENA_BY_ID[beamAtStart.arenaId]); } // homePos: Entfernungen im Popup, Rückflugziel bei neuem Flug
else if (save.beam) endBeam(save);
if (!save.beam && save.settings.flight && save.settings.flightPos) locator.setFake(save.settings.flightPos); // Flugmodus über Neustart
updateHud();
ticker.refresh();
// Offline-Start und App-Installation: Service Worker (sw.js, erzeugt von tools/make_sw.py)
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
setTimeout(() => {
  $('#splash').classList.add('gone');
  setTimeout(() => $('#splash').remove(), 400);
  if (!save.profile) { onboarding.start({ profileOnly: save.seen.onboarding || save.box.length > 0 }); show('screen-onboarding'); }
  else { if (!resumeSummon()) show('screen-map'); online.syncNow().then(() => online.fetchState()); newsCheck(); } // Karte mit Tagescheck
}, CONST.SPLASH_MS);
