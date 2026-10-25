import { CONST, RUETHER_BY_ID, RARITY_BY_ID, RARITIES } from './data.js';
import { fighterStats, loadoutFor } from './progress.js';
import { MISSIONS, MISSION_BY_ID, pickSetup } from './quest/missions.js';
import { raceWinner } from './quest/race.js';
import { createLink } from './net/link.js';
import { VERSION } from './screens.js';
import { esc, ico, popup, toast } from './ui.js';

// v11 Lobby „Zusammen spielen“ (Spec Mehrspieler §2, §5, §6): verbinden (js/net/link.js), Modus, Teams, Bereit, Start.
// createLobby({ el, getSave, persist, onExit, onStart, onRace, onRaceDone }) -> { open(), back(), progress(p), raceEnd(r) }
//   open(): aus dem Profil (App zeigt danach #screen-lobby). back(): nach dem Modus wieder hier, verbunden, Picks bleiben, Bereit aus.
//   onStart(game): game = { mode, role, link, mission|null, setup|null, seed, teams: { host, guest }, names: { host, guest }, partner }
//   Rennen (§5): progress(p) schickt den Zwischenstand (rs), raceEnd({ result, score, timeMs }) das eigene Ende (rend);
//   beide tragen seed (aus start) als Runden-Kennung.
//   onRace(race) bei jeder Änderung ({ rival, mine, his, lost, done, winner }), onRaceDone({ winner: 'me'|'them'|'draw'|null, mine, his }) genau einmal.
// Alles vom Partner ist Daten von außen: Picks werden gesäubert, Kampfwerte rechnet jedes Gerät selbst (duelFighters/makeFighter).

const LIMIT = { duel: 3, coop: 2, race: 3 }; // höchstens so viele Rüther je Spieler, mindestens einer
const MODES = [
  { id: 'duel', icon: 'trophy', name: 'Arena-Duell 3 gegen 3', text: 'Wer zuerst pleite ist, zahlt die nächste Runde Dosenbier.' },
  { id: 'coop', icon: 'quest', name: 'Koop-Quest', text: 'Zusammen rein, zusammen raus. Jeder steuert bis zu 2 Rüther.' },
  { id: 'race', icon: 'lightning', name: 'Quest-Rennen', text: 'Dieselbe Mission, dieselbe Karte. Wer mehr schafft, kriegt den Bonus.' },
];
const NOTHING_MS = 30_000; // so lange sucht der Gast, bevor der Hinweis kommt (die Suche läuft weiter)
const RESULTS = new Set(['success', 'fail', 'abort']);
const HINT = {
  nearby: 'Bluetooth und Standort einschalten, das geht auch im Flugmodus. Zum Beitreten braucht Android den Standort.',
  local: 'Testmodus: das Spiel in einem zweiten Fenster öffnen (?slot=2).',
};
const ERR = {
  permission: 'Ohne ‚Geräte in der Nähe‘ und genauen Standort geht es nicht. In den Android-Einstellungen bei Rüther GO erlauben.',
  location: 'Standort einschalten (geht auch im Flugmodus). Ohne findet Android das andere Handy nicht.',
  bluetooth: 'Bluetooth einschalten (geht auch im Flugmodus).',
  unavailable: 'Auf diesem Handy fehlen die Google-Play-Dienste.',
  busy: 'Die Verbindung ist noch beschäftigt. Kurz warten und nochmal tippen.',
};

const sprite = id => `sprites/${RUETHER_BY_ID[id] ? id : 'unknown'}.png`;
const clip = (s, n = 24) => (typeof s === 'string' ? s.trim().slice(0, n) : '');
const nat = v => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0);
const rank = id => RARITIES.findIndex(r => r.id === id);
const missionsFor = mode => (mode === 'coop' ? MISSIONS.filter(m => !m.solo) : mode === 'race' ? MISSIONS : []);
const ruether = id => RUETHER_BY_ID[id]?.name || id;
// Solo-Missionen (wie soloInst in app.js): das stärkste Exemplar dieses Rüthers
const soloInst = (save, id) => save.box.filter(i => i.id === id).sort((a, b) => fighterStats(RUETHER_BY_ID[b.id], b).btc - fighterStats(RUETHER_BY_ID[a.id], a).btc)[0] || null;
const pickOf = (save, inst, quest) => ({ uid: inst.uid, id: inst.id, rarity: inst.rarity, level: inst.level, loadout: quest ? loadoutFor(save, inst.id) : null });

// Loadout vom Partner: nur [{ id, level 1–3 } | null] × 3; welche Fähigkeit zu welchem Rüther passt, prüft createQuest
function cleanLoadout(lo) {
  if (!Array.isArray(lo)) return null;
  return lo.slice(0, 3).map(a => (a && typeof a === 'object' && typeof a.id === 'string' && [1, 2, 3].includes(a.level) ? { id: a.id.slice(0, 40), level: a.level } : null));
}
// Picks (Spec §2): unbekannte id verwerfen, unbekannte Seltenheit → normal, Level 1–20, höchstens max
export function cleanPicks(list, max = 3) {
  const out = [];
  for (const p of Array.isArray(list) ? list : []) {
    if (out.length >= max) break;
    if (!p || typeof p !== 'object' || !RUETHER_BY_ID[p.id]) continue;
    out.push({
      uid: typeof p.uid === 'string' ? p.uid.slice(0, 40) : null, id: p.id, rarity: RARITY_BY_ID[p.rarity] ? p.rarity : 'normal',
      level: Math.max(1, Math.min(CONST.LEVEL_MAX, Math.floor(Number(p.level)) || 1)), loadout: cleanLoadout(p.loadout),
    });
  }
  return out;
}
const cleanName = (p, fb) => ({ name: clip(p?.name) || fb, avatar: RUETHER_BY_ID[p?.avatar] ? p.avatar : 'christian' });
function cleanSetup(m, s) {
  const l = m.layouts.find(x => x.id === s?.layoutId), v = l?.variants.find(x => x.id === s?.variantId);
  return v ? { layoutId: l.id, variantId: v.id, mirror: s.mirror === true, seed: Number.isFinite(s.seed) ? s.seed >>> 0 : 0 } : null;
}
// start des Hosts (Gast-Seite): alles prüfen, sonst null (dann bleibt der Gast in der Lobby)
export function cleanStart(m) {
  if (!m || !LIMIT[m.mode]) return null;
  const mission = m.mode === 'duel' ? null : MISSION_BY_ID[m.missionId] || null;
  if (m.mode !== 'duel' && (!mission || (m.mode === 'coop' && mission.solo))) return null;
  const setup = mission && cleanSetup(mission, m.setup);
  if (mission && !setup) return null;
  const teams = { host: cleanPicks(m.teams?.host, LIMIT[m.mode]), guest: cleanPicks(m.teams?.guest, LIMIT[m.mode]) };
  if (!teams.host.length || !teams.guest.length) return null;
  return {
    mode: m.mode, mission, setup: setup || null, seed: Number.isFinite(m.seed) ? m.seed >>> 0 : 1, teams,
    names: { host: cleanName(m.names?.host, 'Gastgeber'), guest: cleanName(m.names?.guest, 'Gast') },
  };
}

const HTML = `
<header class="topbar wood"><button class="back">‹ Profil</button><h2>Zusammen spielen</h2></header>
<div class="mp-scroll">
  <div class="mp-start">
    <div class="mp-hero panel">
      <div class="mp-hero-faces"><span class="frame r-normal"><img class="mp-me-face" alt=""></span><b>+</b><span class="frame r-normal"><img src="sprites/unknown.png" alt=""></span></div>
      <p>Zwei Handys, kein Internet: Ihr verbindet euch direkt und spielt ein Duell, eine Koop-Quest oder ein Quest-Rennen.</p>
    </div>
    <button class="mp-host primary">Spiel eröffnen</button>
    <button class="mp-join">Beitreten</button>
    <p class="hint mp-how"></p>
  </div>
  <div class="mp-wait panel hidden"><p class="mp-wait-title"></p><p class="sub mp-wait-sub"></p><button class="mp-cancel">Abbrechen</button></div>
  <div class="mp-room hidden">
    <p class="mp-banner hidden">Verbindung weg, verbinde neu …</p>
    <div class="mp-players"></div>
    <div class="mp-code panel thin"><p class="mp-code-text"></p><button class="mp-leave danger">Trennen</button></div>
    <p class="mp-version hidden"></p>
    <h3 class="section-title">Modus</h3>
    <div class="mp-modes"></div>
    <div class="mp-mission-box">
      <h3 class="section-title">Mission</h3>
      <p class="hint">Ohne Haunebu, alle Missionen offen. Ihr sitzt ja schon im Flieger.</p>
      <div class="mp-missions"></div>
    </div>
    <h3 class="section-title">Dein Team <span class="mp-count"></span></h3>
    <div class="mp-mine"></div>
    <h3 class="section-title mp-their-title"></h3>
    <div class="mp-theirs"></div>
  </div>
</div>
<div class="mp-foot wood hidden"><span class="mp-status"></span><button class="mp-ready">Bereit</button><button class="mp-go primary hidden">Start</button></div>`;

export function createLobby({ el, getSave, persist, onExit, onStart, onRace, onRaceDone }) {
  el.innerHTML = HTML;
  const $ = s => el.querySelector(s);
  const lag = Math.max(0, Math.min(2000, Number(new URLSearchParams(location.search).get('lag')) || 0)); // Playtest ?lag=150
  let link = null, isOpen = false, starting = false, closing = false, lostBanner = false;
  let searchAt = 0, nothingTimer = 0, foundName = '';
  let mode = 'duel', missionId = null;
  // mine.chosen: eigene Wahl (uids), mine.picks: was gerade gilt (Solo-Mission: das stärkste Exemplar)
  const mine = { chosen: [], picks: [], ready: false, missing: null };
  let them = null; // { info: { name, avatar, level, version } | null, picks, ready, missing, left }
  let game = null, race = null;
  const fresh = () => ({ info: null, picks: [], ready: false, missing: null, left: false });
  const isHost = () => link?.role === 'host';
  const inRoom = () => link?.state === 'connected' || link?.state === 'lost';
  const partnerName = () => them?.info?.name || 'Dein Gegenüber';
  const questMission = () => (mode === 'duel' ? null : MISSION_BY_ID[missionId] || null);
  const setHtml = (n, h) => { if (n._h !== h) { n._h = h; n.innerHTML = h; } };

  function ensureLink() {
    if (link) return link;
    link = createLink({ lag });
    link.on('state', render);
    link.on('peerFound', e => { foundName = e?.name || ''; render(); });
    link.on('connected', onConnected);
    link.on('lost', onLost);
    link.on('disconnected', onGone);
    link.on('error', e => { if (!starting) showError(e?.code, inRoom() || !!game); }); // beim Wiederverbinden/im Spiel nur ein Toast
    link.on('message', onMessage);
    return link;
  }

  // ---------- Verbinden ----------
  async function go(asHost) {
    const save = getSave();
    if (!save.profile || starting || inRoom()) return;
    if (link.kind === 'nearby' && !save.seen?.nearby) { // vor der ersten Android-Abfrage
      await popup({ title: 'Geräte in der Nähe', icon: 'profile', html: '<p>Android fragt gleich nach ‚Geräte in der Nähe‘. Damit findet ihr euch ohne Internet.</p>', buttons: [{ label: 'Weiter', primary: true }] });
      save.seen = { ...save.seen, nearby: true };
      persist();
    }
    starting = true; foundName = ''; searchAt = performance.now();
    render();
    try { await (asHost ? link.host(save.profile.nickname) : link.join(save.profile.nickname)); } catch (e) { starting = false; showError(e?.code); }
    starting = false;
    clearTimeout(nothingTimer);
    if (!asHost) nothingTimer = setTimeout(render, NOTHING_MS + 50);
    render();
  }
  function showError(code, quiet = false) {
    const text = ERR[code];
    if (text && quiet) toast(text);
    else if (text) popup({ title: 'Das klappt so nicht', html: `<p>${esc(text)}</p>` });
    else if (code === 'connect') toast('Verbinden hat nicht geklappt, ich versuche es weiter.');
    else toast(`Verbindung: ${clip(String(code || 'Fehler'), 60)}`);
    render();
  }
  async function closeLink() {
    clearTimeout(nothingTimer);
    if (!link) return;
    if (link.state === 'connected') link.send({ t: 'leave' });
    closing = true;
    try { await link.close(); } finally { closing = false; }
  }
  async function exit() {
    await closeLink();
    link?.keepAwake(false);
    isOpen = false; them = null; game = null; race = null; lostBanner = false;
    onExit?.();
  }

  // ---------- Link-Ereignisse ----------
  function onConnected(e) {
    lostBanner = false;
    if (!e?.again || !them) { them = fresh(); mine.ready = false; }
    sendState(); // §6: nach dem Wiederverbinden alles neu (me, mode, pick)
    if (race) {
      race.rival.lost = false;
      if (race.mine) link.send({ t: 'rend', seed: race.seed, ...race.mine }); // könnte in der Funkstille verloren gegangen sein
      emitRace();
    }
    render();
  }
  function onLost() {
    lostBanner = true;
    if (race) { race.rival.lost = true; emitRace(); }
    render();
  }
  function onGone({ reason } = {}) {
    lostBanner = false;
    const n = partnerName(), left = them?.left, had = !!them;
    them = null; mine.ready = false;
    if (race && !race.done) { race.lost = true; race.rival.lost = true; settleRace(); }
    if (!closing && had) {
      if (reason === 'version') popup({ title: 'Andere Version', html: '<p>Unterschiedliche Spielversionen. Beide die neueste App installieren.</p>' });
      else if (reason === 'left' || left) toast(`${n} hat die Lobby verlassen.`);
      else if (reason === 'timeout') toast(`Verbindung zu ${n} weg.`);
      else toast(`${n} ist raus (App neu gestartet?).`);
    } else if (!closing && reason === 'version') popup({ title: 'Andere Version', html: '<p>Unterschiedliche Spielversionen. Beide die neueste App installieren.</p>' });
    render();
  }
  function sendState() {
    const save = getSave(), p = save.profile || {};
    link.send({ t: 'me', name: p.nickname || 'Trainer', avatar: p.avatar, level: save.trainerLevel || 1, version: VERSION });
    if (isHost()) link.send({ t: 'mode', mode, missionId });
    sendPick();
    if (isOpen) link.send({ t: globalThis.document?.hidden ? 'away' : 'back' }); // ein in der Funkstille verpasstes back kommt so nach
  }
  const sendPick = () => link?.send({ t: 'pick', team: mine.picks, ready: mine.ready, ...(mine.missing && { missing: mine.missing }) });

  function onMessage(m) {
    if (!them) them = fresh();
    switch (m.t) {
      case 'me':
        them.info = { name: clip(m.name) || 'Partner', avatar: RUETHER_BY_ID[m.avatar] ? m.avatar : 'christian', level: Math.max(1, Math.min(999, Math.floor(Number(m.level)) || 1)), version: clip(m.version, 12) };
        break;
      case 'mode': if (isHost() || !setMode(m.mode, m.missionId)) return; sendPick(); break;
      case 'pick':
        them.picks = cleanPicks(m.team); // Anzahl prüft valid() gegen den Modus
        them.ready = m.ready === true;
        them.missing = RUETHER_BY_ID[m.missing] ? m.missing : null;
        break;
      case 'start': { if (isHost() || game) return; const g = cleanStart(m); if (g) begin(g); return; }
      case 'leave': them.left = true; return;
      // Rennen: nur Nachrichten dieser Runde (seed aus start); ein nachgeschicktes rend der alten Runde wertet die neue nicht
      case 'rs':
        if (!race || race.his || m.seed !== race.seed) return;
        Object.assign(race.rival, { done: nat(m.done), total: nat(m.total), over: m.over === true, result: RESULTS.has(m.result) ? m.result : null });
        return emitRace();
      case 'rend':
        if (!race || race.his || race.done || m.seed !== race.seed) return;
        race.his = { result: RESULTS.has(m.result) ? m.result : 'fail', score: nat(m.score), timeMs: Number.isFinite(m.timeMs) && m.timeMs >= 0 ? m.timeMs : Infinity };
        Object.assign(race.rival, { over: true, result: race.his.result });
        return settleRace();
      default: return; // unbekannt (oder Modus-Nachricht): still verwerfen
    }
    render();
  }

  // ---------- Modus, Team, Bereit ----------
  // Modus/Mission setzen (Host: eigene Wahl, Gast: mode-Nachricht). Jede Änderung setzt „Bereit“ zurück.
  function setMode(md, mid) {
    if (!LIMIT[md]) return false;
    const list = missionsFor(md);
    mode = md;
    missionId = md === 'duel' ? null : (list.find(x => x.id === mid) || list[0]).id;
    mine.ready = false;
    if (them) them.ready = false;
    refreshPicks();
    return true;
  }
  function refreshPicks() {
    const save = getSave(), m = questMission(), has = uid => save.box.find(i => i.uid === uid);
    mine.missing = null;
    mine.chosen = mine.chosen.filter(has); // die Wahl bleibt beim Moduswechsel ganz, gekürzt wird nur, was gerade gilt
    if (mode === 'race' && m?.solo) {
      const inst = soloInst(save, m.solo);
      mine.picks = inst ? [pickOf(save, inst, true)] : [];
      if (!inst) mine.missing = m.solo;
    } else mine.picks = mine.chosen.slice(0, LIMIT[mode]).map(uid => pickOf(save, has(uid), mode !== 'duel'));
  }
  function chooseMode(md, mid) {
    if (!isHost() || game || (md === mode && (mid ?? missionId) === missionId)) return;
    if (!setMode(md, mid)) return;
    link.send({ t: 'mode', mode, missionId });
    sendPick();
    render();
  }
  function toggle(uid) {
    if (game || (mode === 'race' && questMission()?.solo)) return;
    mine.chosen = mine.chosen.slice(0, LIMIT[mode]); // wer hier wählt, nimmt die gekürzte Wahl dieses Modus
    const i = mine.chosen.indexOf(uid);
    if (i >= 0) mine.chosen.splice(i, 1); else if (mine.chosen.length < LIMIT[mode]) mine.chosen.push(uid); else return toast(`Höchstens ${LIMIT[mode]} Rüther.`);
    mine.ready = false;
    refreshPicks(); sendPick(); render();
  }
  function valid(picks, missing) {
    const m = questMission();
    if (missing || !picks.length || picks.length > LIMIT[mode]) return false;
    return !(mode === 'race' && m?.solo) || picks.every(p => p.id === m.solo);
  }
  const canStart = () => isHost() && link.state === 'connected' && !game && !!them?.info && mine.ready && them.ready
    && valid(mine.picks, mine.missing) && valid(them.picks, them.missing) && (mode === 'duel' || !!questMission());
  function toggleReady() {
    if (game || link.state !== 'connected' || !valid(mine.picks, mine.missing)) return;
    mine.ready = !mine.ready;
    sendPick(); render();
  }
  // Host würfelt Karte und Seed (§2.6) und schickt start; beide wechseln in den Modus
  function hostStart() {
    if (!canStart()) return;
    const save = getSave(), m = questMission();
    const msg = {
      t: 'start', mode, missionId: m?.id || null, setup: m ? pickSetup(m, Math.random) : null, seed: Math.floor(Math.random() * 4294967296) >>> 0,
      teams: { host: mine.picks, guest: them.picks },
      names: { host: { name: save.profile.nickname, avatar: save.profile.avatar }, guest: { name: them.info.name, avatar: them.info.avatar } },
    };
    const g = cleanStart(msg); // dieselbe Prüfung wie beim Gast: beide starten mit identischen Daten
    if (!g) return;
    if (!link.send(msg)) return toast('Verbindung weg.');
    begin(g);
  }
  function begin(g) {
    const role = link.role;
    game = { ...g, role, link, partner: g.names[role === 'host' ? 'guest' : 'host'] };
    mine.ready = false;
    if (them) them.ready = false;
    race = g.mode === 'race' ? { seed: g.seed, mine: null, his: null, lost: false, done: false, winner: null, rival: { name: game.partner.name, avatar: game.partner.avatar, done: 0, total: 0, over: false, result: null, lost: false } } : null;
    render();
    onStart?.(game);
  }

  // ---------- Rennen (§5) ----------
  const emitRace = () => { if (race) onRace?.({ ...race, rival: { ...race.rival } }); };
  // Entschieden, sobald beide rend da sind; Verbindung endgültig weg vor dem rend des Partners: ohne Wertung
  function settleRace() {
    emitRace();
    if (!race || race.done || !race.mine || !(race.his || race.lost)) return;
    race.done = true;
    const w = race.his ? raceWinner(race.mine, race.his) : null;
    race.winner = { a: 'me', b: 'them', draw: 'draw' }[w] || null; // bleibt: spätere onRace (lost, again) tragen den Sieger mit
    onRaceDone?.({ winner: race.winner, mine: race.mine, his: race.his, rival: { ...race.rival } });
  }

  // ---------- Zeichnen ----------
  const face = (id, rarity = 'normal') => `<span class="frame r-${RARITY_BY_ID[rarity] ? rarity : 'normal'}"><img src="${sprite(id)}" alt=""></span>`;
  const player = (p, ready) => `<div class="mp-p${ready ? ' ready' : ''}">${face(p.avatar)}<b>${esc(p.name)}</b><span class="sub">Trainer Lv. ${p.level}</span><span class="mp-tag">${ready ? 'bereit' : '&nbsp;'}</span></div>`;
  const teamRow = picks => `<div class="mp-row">${picks.map(p => `<div class="mp-mini">${face(p.id, p.rarity)}<span class="mp-lv">Lv. ${p.level}</span></div>`).join('')}</div>`;
  function render() {
    const save = getSave(), st = link?.state || 'idle', host = isHost();
    const step = inRoom() ? 'room' : st === 'hosting' || st === 'joining' || starting ? 'wait' : 'start';
    $('.mp-start').classList.toggle('hidden', step !== 'start');
    $('.mp-wait').classList.toggle('hidden', step !== 'wait');
    $('.mp-room').classList.toggle('hidden', step !== 'room');
    $('.mp-foot').classList.toggle('hidden', step !== 'room');
    $('.mp-how').textContent = HINT[link?.kind || 'local'];
    if (save.profile) $('.mp-me-face').src = sprite(save.profile.avatar);
    if (step === 'wait') {
      const joining = st === 'joining' || (!host && starting);
      $('.mp-wait-title').textContent = starting ? 'Einen Moment …' : joining ? (foundName ? `Gefunden: ${foundName}. Verbinde …` : 'Suche Spiel …') : 'Warte auf Mitspieler …';
      $('.mp-wait-sub').textContent = joining && !foundName && performance.now() - searchAt > NOTHING_MS
        ? 'Nichts gefunden. Hat dein Gegenüber auf ‚Spiel eröffnen‘ getippt? Bluetooth an?'
        : joining ? 'Dein Gegenüber tippt auf ‚Spiel eröffnen‘.' : `Dein Gegenüber tippt auf ‚Beitreten‘. ${HINT[link.kind]}`;
    }
    if (step !== 'room') return;
    const p = save.profile || {}, info = them?.info, n = partnerName();
    $('.mp-banner').classList.toggle('hidden', !lostBanner);
    const meCard = { name: p.nickname || 'Ich', avatar: p.avatar, level: save.trainerLevel || 1 };
    setHtml($('.mp-players'), player(meCard, mine.ready) + '<span class="mp-and">&amp;</span>'
      + (info ? player(info, them.ready) : '<div class="mp-p"><span class="frame r-normal"><img src="sprites/unknown.png" alt=""></span><b>…</b><span class="sub">verbindet</span><span class="mp-tag">&nbsp;</span></div>'));
    $('.mp-code-text').textContent = link.code ? `Code ${link.code}, steht bei euch beiden dasselbe?` : 'Verbunden.';
    const vOther = info?.version && info.version !== VERSION;
    $('.mp-version').classList.toggle('hidden', !vOther);
    if (vOther) $('.mp-version').textContent = `Ihr habt verschiedene Versionen (${VERSION} / ${info.version}). Lieber beide aktualisieren.`;
    // Modus: nur der Host wählt, der Gast sieht die Wahl live
    const tag = host && !game ? 'button' : 'div';
    setHtml($('.mp-modes'), MODES.map(x => `<${tag} class="mp-mode${x.id === mode ? ' on' : ''}" data-mode="${x.id}"${tag === 'button' ? ` aria-pressed="${x.id === mode}"` : ''}>${ico(x.icon)}<span><b>${esc(x.name)}</b><span class="sub">${esc(x.text)}</span></span></${tag}>`).join('')
      + (host ? '' : `<p class="hint">${esc(n)} wählt den Modus.</p>`));
    const list = missionsFor(mode);
    $('.mp-mission-box').classList.toggle('hidden', !list.length);
    setHtml($('.mp-missions'), list.map(m => `<${tag} class="mp-mission${m.id === missionId ? ' on' : ''}" data-id="${m.id}"><b>${esc(m.name)}</b><span class="sub">${esc(m.place)} · ${esc(m.objective.label)}${m.solo ? ` · Solo: ${esc(ruether(m.solo))}` : ''}</span></${tag}>`).join(''));
    // Eigenes Team: echte Gesichter mit Seltenheitsrahmen und Level, Reihenfolge als Etikett darunter (nichts liegt auf dem Gesicht)
    const solo = mode === 'race' && questMission()?.solo;
    $('.mp-count').textContent = solo ? 'Solo' : `${mine.picks.length}/${LIMIT[mode]}`;
    let mineHtml;
    if (solo && mine.missing) mineHtml = `<p class="mp-missing">Du hast noch keinen ${esc(ruether(mine.missing))}.</p>`;
    else if (solo) mineHtml = `${teamRow(mine.picks)}<p class="hint">Solo-Mission: ${esc(ruether(solo))} geht allein, dein stärkstes Exemplar.</p>`;
    else if (!save.box.length) mineHtml = '<p class="mp-missing">Fang erst einen Rüther.</p>';
    else {
      const order = uid => { const i = save.team.indexOf(uid); return i < 0 ? 9 : i; };
      const insts = [...save.box].sort((a, b) => order(a.uid) - order(b.uid) || rank(b.rarity) - rank(a.rarity) || b.level - a.level);
      mineHtml = `<div class="mp-grid">${insts.map(i => {
        const k = mine.chosen.slice(0, LIMIT[mode]).indexOf(i.uid);
        return `<button class="mp-pick${k >= 0 ? ' on' : ''}" data-uid="${esc(i.uid)}" aria-pressed="${k >= 0}" aria-label="${esc(ruether(i.id))} Lv. ${i.level}">${face(i.id, i.rarity)}<span class="mp-lv">${k >= 0 ? `${k + 1} · ` : ''}Lv. ${i.level}</span></button>`;
      }).join('')}</div>`;
    }
    setHtml($('.mp-mine'), mineHtml);
    $('.mp-their-title').textContent = `Team von ${n}`;
    setHtml($('.mp-theirs'), them?.missing ? `<p class="mp-missing">${esc(n)} hat noch keinen ${esc(ruether(them.missing))}.</p>`
      : them?.picks.length ? teamRow(them.picks) : `<p class="hint">${esc(n)} wählt noch …</p>`);
    // Fuß: Bereit (beide), Start (nur Host, wenn beide bereit und beide Teams gültig)
    const ok = valid(mine.picks, mine.missing), ready = $('.mp-ready'), goBtn = $('.mp-go');
    ready.disabled = !!game || st !== 'connected' || !ok;
    ready.classList.toggle('on', mine.ready);
    ready.textContent = mine.ready ? 'Bereit!' : 'Bereit';
    goBtn.classList.toggle('hidden', !host);
    goBtn.disabled = !canStart();
    $('.mp-status').textContent = st === 'lost' ? 'Verbindung weg …' : !info ? 'Verbinde …' : game ? 'Runde läuft …'
      : !ok ? (mine.missing ? 'Dir fehlt der Rüther.' : 'Wähl dein Team.')
      : host ? (canStart() ? 'Beide bereit. Los!' : !them.ready ? `Warte auf ${n} …` : !mine.ready ? `${n} ist bereit.` : `${n}s Team passt nicht.`)
      : mine.ready ? `${n} startet gleich.` : them.ready ? `${n} ist bereit.` : 'Tipp auf Bereit, wenn dein Team steht.';
  }

  // ---------- Eingaben ----------
  el.addEventListener('click', async e => {
    const t = e.target.closest('button');
    if (!t || t.disabled) return;
    if (t.classList.contains('back')) {
      if (inRoom()) {
        const i = await popup({ title: 'Trennen?', html: `<p>Die Verbindung zu ${esc(partnerName())} wird getrennt.</p>`, buttons: [{ label: 'Bleiben' }, { label: 'Trennen', danger: true }] });
        if (i !== 1) return;
      }
      return exit();
    }
    if (t.classList.contains('mp-host')) return go(true);
    if (t.classList.contains('mp-join')) return go(false);
    if (t.classList.contains('mp-cancel')) { await closeLink(); return render(); }
    if (t.classList.contains('mp-leave')) return exit();
    if (t.classList.contains('mp-mode')) return chooseMode(t.dataset.mode, null);
    if (t.classList.contains('mp-mission')) return chooseMode(mode, t.dataset.id);
    if (t.classList.contains('mp-pick')) return toggle(t.dataset.uid);
    if (t.classList.contains('mp-ready')) return toggleReady();
    if (t.classList.contains('mp-go')) return hostStart();
  });
  // §2/§6: App im Hintergrund bzw. zurück (Duell und Koop pausieren beim Host)
  document.addEventListener('visibilitychange', () => {
    if (isOpen && link?.state === 'connected') link.send({ t: document.hidden ? 'away' : 'back' });
  });

  return {
    open() {
      ensureLink();
      isOpen = true;
      link.keepAwake(true);
      if (!inRoom()) { them = null; game = null; mine.ready = false; mine.chosen = getSave().team.slice(0, LIMIT[mode]); refreshPicks(); }
      el.querySelector('.mp-scroll').scrollTop = 0;
      render();
    },
    back() {
      game = null; mine.ready = false;
      refreshPicks(); // Level können gestiegen sein
      if (link?.state === 'connected') sendPick();
      render();
    },
    progress(p) {
      if (game?.mode === 'race' && race && p && link.state === 'connected') link.send({ t: 'rs', seed: race.seed, done: p.done, total: p.total, over: !!p.over, result: p.result || null });
    },
    raceEnd(r) {
      if (!race || race.mine) return;
      race.mine = { result: RESULTS.has(r?.result) ? r.result : 'fail', score: nat(r?.score), timeMs: nat(r?.timeMs) };
      link.send({ t: 'rend', seed: race.seed, ...race.mine });
      settleRace();
    },
  };
}
