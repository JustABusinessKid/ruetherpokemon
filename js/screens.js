import { CONST, RUETHERS, RUETHER_BY_ID, RARITIES, RARITY_BY_ID, SHOP, QUESTS, ACHIEVEMENTS, ARENAS } from './data.js';
import { fighterStats, levelCost, DEX_TOTAL, dexCount, arenaReward, canFuse, nextRarity, levelProgress, pickFood, sell, sellDuplicates } from './progress.js';
import { esc, popup, ico, kitName } from './ui.js';
import { hashrateText } from './format.js';
import { playSheet, btcRain } from './fx.js';

const fmt = n => n.toLocaleString('de-DE');
const rarityRank = id => RARITIES.findIndex(r => r.id === id);
const spriteOf = id => `sprites/${RUETHER_BY_ID[id] ? id : 'unknown'}.png`;
const avatarGrid = active => RUETHERS.map(r =>
  `<button class="avatar-opt${r.id === active ? ' active' : ''}" data-id="${r.id}" title="${esc(r.name)}"><img src="sprites/${r.id}.png" alt="${esc(r.name)}"></button>`).join('');

// „3 Min." / „2 Std." / „4 Tagen" – der Aufrufer setzt „vor" bzw. „seit" davor
function agoText(ms) {
  const m = Math.max(1, Math.floor(ms / 60000));
  if (m < 60) return `${m} Min.`;
  const h = Math.floor(m / 60);
  if (h <= 48) return `${h} Std.`;
  return `${Math.floor(h / 24)} Tagen`;
}
// Popup mit Eingabefeld. Der Wert wird per Delegation mitgelesen, weil ui.js die Karte beim Schließen sofort ersetzt.
async function askText({ title, html, cls, initial = '', ok = 'Speichern' }) {
  let value = initial;
  const box = document.getElementById('popup');
  const onInput = e => { if (e.target.classList.contains(cls)) value = e.target.value; };
  box.addEventListener('input', onInput);
  try {
    const i = await popup({ title, html, buttons: [{ label: 'Abbrechen' }, { label: ok, primary: true }] });
    return i === 1 ? value : null;
  } finally { box.removeEventListener('input', onInput); }
}
// Entfernung für Arena-Screen und Flugscheiben-Popup: unter 1 km in m, sonst „12,3 km"
export const distText = m => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} km`);
const emptyState = (icon, text, sub = '') =>
  `<div class="empty">${ico(icon, 'ico-xl empty-ico')}<p>${esc(text)}</p>${sub ? `<p class="sub">${esc(sub)}</p>` : ''}</div>`;

// ---------- Sammlung ----------
// Eine Karte pro Rüther (Spec §3): echtes Gesicht des besten Exemplars groß, Zähler je Seltenheit, Fusions-Fortschritt,
// Knöpfe Fusion / Duplikate verkaufen (n) / Alle n anzeigen; ausgeklappt die Exemplare mit Team, Power-Up, Füttern, Verkaufen.
// onTeamChange(teamUids); onPowerUp(uid) -> { ok, reason, level }; onFuse(id, rarityId) -> { ok, inst, used, newDex };
// onFeed(targetUid) -> { ok, reason, level, foodUid }; onSell(uid) -> { ok, reason, sats };
// onSellDuplicates(id) -> { count, sats } (Bestätigung hier per popup vor dem Aufruf); onDex(); onBack()
export function createCollectionScreen({ el, onTeamChange, onPowerUp, onFuse, onFeed, onSell, onSellDuplicates, onDex, onBack }) {
  const box = el.querySelector('.box');
  el.querySelector('.back')?.addEventListener('click', () => onBack?.());
  el.querySelector('.dex-btn').addEventListener('click', onDex);
  let save = null;
  const open = new Set(); // ausgeklappte Rüther-ids
  const dry = (fn, ...a) => fn(structuredClone(save), ...a); // Regeln aus progress.js probeweise, ohne den Spielstand zu ändern
  const statLine = inst => {
    const st = fighterStats(RUETHER_BY_ID[inst.id], inst);
    return `${fmt(st.btc)} BTC · ${ico('hashrate', 'ico-in')}${hashrateText(st.power)}`;
  };

  function ruetherCard(def, mine) {
    const best = mine[0], isOpen = open.has(def.id);
    const counts = RARITIES.map(r => ({ r, n: mine.filter(i => i.rarity === r.id).length })).filter(c => c.n);
    const dupes = dry(sellDuplicates, def.id);
    const div = document.createElement('div');
    div.className = `rcard panel thin r-${best.rarity}`;
    div.dataset.id = def.id;
    div.innerHTML = `
      <div class="rhead">
        <div class="frame big r-${best.rarity}"><img src="sprites/${def.id}.png" alt="${esc(def.name)}"><span class="shine"></span></div>
        <div class="meta">
          <div class="cname">${esc(def.name)} <span class="badge-pixel">Lv. ${best.level}</span></div>
          <div class="counts">${counts.map(({ r, n }) => `<span class="cnt r-${r.id}">${r.name} ×${n}</span>`).join('')}</div>
          <div class="sub">${statLine(best)}</div>
        </div>
      </div>
      <div class="fuse-prog"></div>
      <div class="ractions">
        ${dupes.count ? `<button class="dup-btn">Duplikate verkaufen (${dupes.count})</button>` : ''}
        <button class="all-btn">${isOpen ? 'Zuklappen' : mine.length > 1 ? `Alle ${mine.length} anzeigen` : 'Anzeigen'}</button>
      </div>
      ${isOpen ? '<div class="insts"></div>' : ''}`;
    // Fusion: ab 3 gleichen ein Knopf, darunter Fortschritt „2/3 für Selten"
    const prog = div.querySelector('.fuse-prog'), actions = div.querySelector('.ractions');
    for (const { r, n } of counts) {
      const nxt = RARITY_BY_ID[nextRarity(r.id)];
      if (!nxt) continue;
      if (canFuse(save, def.id, r.id)) {
        const b = document.createElement('button');
        b.className = `fuse-btn primary r-${nxt.id}`;
        b.innerHTML = `${ico('star')}Fusion: ${CONST.FUSION_COUNT}× ${r.name} → ${nxt.name}`;
        b.addEventListener('click', () => { const res = onFuse(def.id, r.id); if (res?.ok) playFusion(res); });
        actions.prepend(b);
      } else {
        prog.insertAdjacentHTML('beforeend', `<div class="fp r-${nxt.id}"><span>${n}/${CONST.FUSION_COUNT} für ${nxt.name}</span><div class="bar"><div class="fill" style="width:${Math.round((n / CONST.FUSION_COUNT) * 100)}%"></div></div></div>`);
      }
    }
    div.querySelector('.dup-btn')?.addEventListener('click', async () => {
      const i = await popup({
        title: 'Duplikate verkaufen?',
        html: `<p>${dupes.count}× ${esc(def.name)} für <b>${fmt(dupes.sats)}</b>${ico('coin', 'ico-in')} verkaufen?</p><p class="sub">Team und das beste Exemplar je Seltenheit bleiben.</p>`,
        buttons: [{ label: 'Abbrechen' }, { label: 'Verkaufen', primary: true }],
      });
      if (i !== 1) return;
      onSellDuplicates(def.id);
      render();
    });
    div.querySelector('.all-btn').addEventListener('click', () => {
      if (isOpen) open.delete(def.id); else open.add(def.id);
      render();
    });
    if (isOpen) for (const inst of mine) div.querySelector('.insts').appendChild(instRow(inst));
    return div;
  }

  function instRow(inst) {
    const r = RARITY_BY_ID[inst.rarity], idx = save.team.indexOf(inst.uid), cost = levelCost(inst.level);
    const max = inst.level >= CONST.LEVEL_MAX, food = max ? null : pickFood(save, inst.uid), sale = dry(sell, inst.uid);
    const row = document.createElement('div');
    row.className = `inst r-${inst.rarity}` + (idx >= 0 ? ' in-team' : '');
    row.dataset.uid = inst.uid;
    row.innerHTML = `
      <div class="frame r-${inst.rarity}"><img src="sprites/${inst.id}.png" alt=""><span class="shine"></span></div>
      <div class="imeta">
        <div class="iname"><span class="ribbon r-${inst.rarity}">${r.name}</span><span class="badge-pixel">Lv. ${inst.level}</span>${idx >= 0 ? `<span class="order">Team ${idx + 1}</span>` : ''}</div>
        <div class="sub">${statLine(inst)}</div>
      </div>
      <div class="iactions">
        <button class="team-btn" ${idx < 0 && save.team.length >= CONST.TEAM_SIZE ? 'disabled' : ''}>${idx >= 0 ? 'Aus dem Team' : 'Ins Team'}</button>
        <button class="power-btn primary" ${cost == null || save.sats < cost ? 'disabled' : ''}>${cost == null ? 'Max. Level' : `${ico('lightning')}${fmt(cost)}${ico('coin')}`}</button>
        <button class="feed-btn" ${food ? '' : 'disabled'}>${food ? `Füttern +${CONST.FEED_LEVELS} Lv.` : max ? 'Max. Level' : 'Kein Futter'}</button>
        <button class="sell-btn" ${sale.ok ? '' : 'disabled'}>${sale.ok ? `Verkaufen ${fmt(sale.sats)}${ico('coin')}` : sale.reason === 'team' ? 'Im Team' : `Letztes ${r.name}`}</button>
      </div>`;
    row.querySelector('.team-btn').addEventListener('click', () => toggleTeam(inst.uid));
    row.querySelector('.power-btn').addEventListener('click', () => { const res = onPowerUp(inst.uid); if (res?.ok) levelUp(inst.uid, res.level); });
    row.querySelector('.feed-btn').addEventListener('click', () => { const res = onFeed(inst.uid); if (res?.ok) levelUp(inst.uid, res.level); });
    row.querySelector('.sell-btn').addEventListener('click', async () => {
      if (inst.rarity !== 'normal') { // Seltene nicht aus Versehen verscherbeln
        const i = await popup({ title: `${r.name}en verkaufen?`, html: `<p>${esc(RUETHER_BY_ID[inst.id].name)} Lv. ${inst.level} für <b>${fmt(sale.sats)}</b>${ico('coin', 'ico-in')} verkaufen?</p>`, buttons: [{ label: 'Abbrechen' }, { label: 'Verkaufen', danger: true }] });
        if (i !== 1) return;
      }
      if (onSell(inst.uid)?.ok) render();
    });
    return row;
  }
  // Spec §2 (v4): Rahmen leuchtet, Sterne steigen auf, Levelzahl springt; nach 1,2 s alles wieder weg
  function levelUp(uid, level) {
    render();
    const c = box.querySelector(`.inst[data-uid="${uid}"]`);
    if (!c) return;
    c.classList.add('level-up');
    c.querySelector('.iname').insertAdjacentHTML('beforeend', `<span class="lvl-pop">Lv. ${level}!</span>`);
    c.insertAdjacentHTML('beforeend', Array.from({ length: 7 }, (_, i) =>
      `<img class="lvl-star" src="art/icon-star.png" alt="" style="--x:${8 + Math.round(Math.random() * 56)}px;--d:${(i * 0.06).toFixed(2)}s">`).join(''));
    setTimeout(() => { c.classList.remove('level-up'); c.querySelectorAll('.lvl-pop, .lvl-star').forEach(n => n.remove()); }, 1200);
  }
  // Die drei echten Gesichter fliegen sofort sichtbar zusammen, kurzer Blitz beim Verschmelzen, Ergebnis im Seltenheitsrahmen mit ₿-Regen.
  // Ablauf steht in css/screens.css (Verzögerungen dort), hier nur ₿-Regen und Einschlag beim Verschmelzen.
  function playFusion({ inst, used, newDex }) {
    const r = RARITY_BY_ID[inst.rarity], from = RARITY_BY_ID[used[0]?.rarity] || RARITY_BY_ID.normal;
    const pos = [[-92, -52], [92, -52], [0, 64]];
    const ov = document.createElement('div');
    ov.className = 'fusion-anim';
    ov.innerHTML = `
      <div class="fz-head">${CONST.FUSION_COUNT}× ${esc(from.name)} → ${esc(r.name)}</div>
      <div class="fz-stage">
        ${used.map((u, i) => `<div class="fz-src frame r-${u.rarity}" style="--x:${pos[i % 3][0]}px;--y:${pos[i % 3][1]}px;--d:${i * 60}ms"><img src="${spriteOf(u.id)}" alt=""></div>`).join('')}
        <div class="fz-flash"></div>
        <div class="fz-result"><div class="frame r-${inst.rarity}"><img src="${spriteOf(inst.id)}" alt=""><span class="shine"></span></div></div>
      </div>
      <div class="fz-title fz-late r-${inst.rarity}">${esc(r.name)}!</div>
      <div class="fz-sub fz-late">${esc(RUETHER_BY_ID[inst.id].name)} · Lv. ${inst.level}${newDex ? ` · Neuer Dex-Eintrag +${fmt(CONST.DEX_BONUS)}${ico('coin', 'ico-in')}` : ''}</div>
      <button class="fz-next fz-late primary">Weiter</button>`;
    el.appendChild(ov);
    ov.querySelector('.fz-next').addEventListener('click', () => { ov.remove(); render(); });
    setTimeout(() => {
      if (!ov.isConnected) return;
      playSheet(ov.querySelector('.fz-stage'), 'btcburst', { size: 256 });
      btcRain(ov, { n: 24 });
    }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 640);
  }
  function render() {
    el.querySelector('.fusion-anim')?.remove();
    box.innerHTML = '';
    if (!save.box.length) { box.innerHTML = emptyState('bag', 'Noch keine Rüthers gefangen.', 'Raus auf die Karte – dort warten sie.'); return; }
    for (const def of RUETHERS) {
      const mine = save.box.filter(i => i.id === def.id)
        .sort((a, b) => rarityRank(b.rarity) - rarityRank(a.rarity) || b.level - a.level);
      if (mine.length) box.appendChild(ruetherCard(def, mine));
    }
  }
  function toggleTeam(uid) {
    const i = save.team.indexOf(uid);
    if (i >= 0) save.team.splice(i, 1);
    else if (save.team.length < CONST.TEAM_SIZE) save.team.push(uid);
    else return;
    onTeamChange(save.team);
    render();
  }
  return { show(s) { save = s; render(); } };
}

// ---------- Rütherdex ----------
export function createDexScreen({ el, onBack }) {
  el.querySelector('.back').addEventListener('click', onBack);
  const grid = el.querySelector('.dex-grid');
  return {
    show(save) {
      el.querySelector('.dex-count').textContent = `${dexCount(save)}/${DEX_TOTAL}`;
      grid.innerHTML = '<div class="dex-head"></div>' + RARITIES.map(r => `<div class="dex-head r-${r.id}">${r.name}</div>`).join('');
      for (const def of RUETHERS) {
        grid.insertAdjacentHTML('beforeend', `<div class="dex-name">${def.name}</div>`);
        for (const r of RARITIES) {
          const has = !!save.dex[`${def.id}:${r.id}`];
          grid.insertAdjacentHTML('beforeend', `<div class="dex-cell r-${r.id} ${has ? 'has' : 'missing'}"><img src="sprites/${has ? def.id : 'unknown'}.png" alt=""></div>`);
        }
      }
    },
  };
}

// ---------- Shop ----------
// onBuy(itemId) -> { ok, reason }
export function createShopScreen({ el, onBuy, onBack }) {
  el.querySelector('.back').addEventListener('click', onBack);
  const list = el.querySelector('.shop-items');
  let save = null;
  function render() {
    el.querySelector('.shop-sats').innerHTML = `${ico('coin')}${fmt(save.sats)}`;
    list.innerHTML = '';
    for (const item of SHOP) {
      const has = item.id === 'haunebu' && !!save.flugscheibe; // Flugscheibe gibt es nur einmal
      const owned = item.id === 'supercoin' ? `Im Besitz: ${save.items.supercoin || 0}`
        : item.id === 'haunebu' ? (has ? 'Im Besitz · Fliegen über die Karte' : '')
        : (save.lureUntil > Date.now() ? 'Gerade aktiv (Kauf verlängert)' : '');
      const div = document.createElement('div');
      div.className = 'shop-item panel thin';
      div.innerHTML = `
        ${ico(kitName(item.icon) || 'shop', 'icon')}
        <div class="meta"><div class="iname">${item.name}</div><div class="sub">${item.desc}</div><div class="sub owned">${owned}</div></div>
        <button class="buy primary" ${has || save.sats < item.cost ? 'disabled' : ''}>${fmt(item.cost)}${ico('coin')}</button>`;
      div.querySelector('.buy').addEventListener('click', () => {
        const res = onBuy(item.id);
        render();
        if (res.ok) { const d = list.querySelector(`.shop-item:nth-child(${SHOP.indexOf(item) + 1})`); d?.classList.add('bought'); setTimeout(() => d?.classList.remove('bought'), 600); }
      });
      list.appendChild(div);
    }
  }
  return { show(s) { save = s; render(); } };
}

// ---------- Arena-Info ----------
// globalOwner: { owner, leader: { id, rarity, level } | null, since, mine } | null
// v7: außer Reichweite mit Flugscheibe zusätzlich „Mit der Haunebu hinfliegen" → onBeam(arena)
export function createArenaScreen({ el, bosses, onFight, onBeam, onBack }) {
  el.querySelector('.back').addEventListener('click', onBack);
  const fight = el.querySelector('.fight'), beam = el.querySelector('.beam'), sprite = el.querySelector('.sprite');
  let arena = null;
  fight.addEventListener('click', () => onFight(arena));
  beam.addEventListener('click', () => onBeam?.(arena));
  beam.innerHTML = `${ico('haunebu')}Mit der Haunebu hinfliegen (${fmt(CONST.HAUNEBU_BEAM_COST)}&nbsp;Sats)`; // Preis nicht umbrechen
  sprite.addEventListener('error', () => { if (!sprite.src.endsWith('/unknown.png')) sprite.src = 'sprites/unknown.png'; }); // Boss-Grafik fehlt noch
  return {
    show(a, { distanceM, teamSize, level, mastered, ownerName, bossBtc, globalOwner = null, flugscheibe = false, sats = 0 }) {
      arena = a;
      const boss = bosses[a.boss];
      el.querySelector('.arena-name').textContent = a.name;
      el.querySelector('.arena-poster').style.backgroundImage = `url(art/bg-${a.id}.png)`;
      sprite.src = `art/boss-${boss.id}.png`;
      el.querySelector('.boss-name').textContent = `Boss: ${boss.name} · ${bossBtc} BTC`;
      el.querySelector('.level').innerHTML = mastered ? `${ico('trophy')}Arena gemeistert (Lv. 5)` : `${ico('star')}Arena Lv. ${level} von ${CONST.ARENA_LEVELS}`;
      el.querySelector('.address').textContent = a.address;
      el.querySelector('.distance').textContent = distanceM == null ? 'Entfernung unbekannt (keine Ortung)' : `Entfernung: ${distText(distanceM)}`;
      const go = el.querySelector('.global-owner');
      let text;
      if (!globalOwner) text = 'Noch von niemandem gehalten.';
      else {
        const since = globalOwner.since ? ` seit ${agoText(Date.now() - globalOwner.since)}` : '';
        const l = globalOwner.leader;
        const lead = l && RUETHER_BY_ID[l.id] ? ` (${RUETHER_BY_ID[l.id].name} ${RARITY_BY_ID[l.rarity]?.name || ''} Lv. ${l.level})` : '';
        text = globalOwner.mine ? `Du hältst diese Arena${since}` : `Gehalten von ${globalOwner.owner}${lead}${since}`;
      }
      go.innerHTML = `${ico('map')}<span>${esc(text)}</span>`;
      go.classList.toggle('mine', !!globalOwner?.mine);
      el.querySelector('.owner').textContent = ownerName ? `Dein Besitzer hier: ${ownerName}` : 'Du hast diese Arena noch nicht erobert.';
      el.querySelector('.reward').innerHTML = `Belohnung: ${fmt(arenaReward(level))}${ico('coin')}`;
      const inRange = distanceM != null && distanceM < CONST.ARENA_RANGE;
      let status = '';
      if (!inRange) status = distanceM == null ? `Du musst näher als ${CONST.ARENA_RANGE} m ran.` : `Zu weit weg (${distText(distanceM)}). Näher als ${CONST.ARENA_RANGE} m ran.`;
      else if (teamSize === 0) status = 'Du brauchst mindestens einen Rüther im Team.';
      el.querySelector('.status').textContent = status;
      fight.disabled = !(inRange && teamSize > 0);
      beam.classList.toggle('hidden', inRange || !flugscheibe);
      beam.disabled = sats < CONST.HAUNEBU_BEAM_COST;
    },
  };
}

// ---------- Sieg ----------
export function createVictoryScreen({ el, onBack }) {
  el.querySelector('.back').addEventListener('click', onBack);
  return {};
}

// ---------- Quests ----------
// onClaim(id) -> { sats, xp } | null  (Toast macht der App-Code)
export function createQuestsScreen({ el, onClaim }) {
  const streak = el.querySelector('.quest-streak'), list = el.querySelector('.quest-list'), reset = el.querySelector('.quest-reset');
  let save = null;
  function render() {
    const n = save.streak?.count || 0;
    const next = Math.min(CONST.STREAK_MAX, CONST.STREAK_BASE + CONST.STREAK_STEP * n);
    streak.innerHTML = `${ico('star', 'ico-xl fire')}<div class="qs-meta"><div class="big"></div><div class="sub"></div></div>`;
    streak.querySelector('.big').textContent = n ? `Tag ${n} in Folge` : 'Tagesbonus';
    streak.querySelector('.sub').innerHTML = `Nächster Bonus: ${fmt(next)}${ico('coin', 'ico-in')}· morgen wiederkommen`;
    list.innerHTML = '';
    const qs = save.quests?.list || [];
    if (!qs.length) list.innerHTML = emptyState('quest', 'Heute keine Quests.', 'Neue gibt es um Mitternacht.');
    for (const q of qs) {
      const def = QUESTS.find(d => d.id === q.id);
      if (!def) continue;
      const pct = Math.min(100, Math.round((q.progress / def.goal) * 100));
      const card = document.createElement('div');
      card.className = 'quest-card' + (q.claimed ? ' claimed' : q.done ? ' done' : '');
      card.innerHTML = `
        <div class="q-text">${esc(def.text)}</div>
        <div class="q-prog">${q.done ? 'fertig' : `${q.progress}/${def.goal}`}</div>
        <div class="bar q-bar"><div class="fill" style="width:${pct}%"></div></div>
        <div class="q-reward">${fmt(def.sats)}${ico('coin', 'ico-in')}· ${def.xp} XP</div>
        ${q.done ? `<button class="claim${q.claimed ? '' : ' primary'}" ${q.claimed ? 'disabled' : ''}>${q.claimed ? 'Erledigt' : 'Einlösen'}</button>` : ''}`;
      card.querySelector('.claim:not(:disabled)')?.addEventListener('click', () => { if (onClaim(q.id)) render(); });
      list.appendChild(card);
    }
    const now = new Date(), mid = new Date(now);
    mid.setHours(24, 0, 0, 0);
    const left = Math.max(0, mid - now), h = Math.floor(left / 3.6e6), m = Math.floor((left % 3.6e6) / 6e4);
    reset.textContent = `Neue Quests um Mitternacht (in ${h} Std. ${m} Min.)`;
  }
  return { show(s) { save = s; render(); } };
}

// ---------- Rangliste ----------
// state = { now, online, leaderboard: [{ nickname, avatar, sats, dex, trophies, mastered, level, online }], feed: [{ at, nickname, kind, text }] } | null
export function createLeaderboardScreen({ el }) {
  const count = el.querySelector('.online-count'), status = el.querySelector('.lb-status'), list = el.querySelector('.lb-list'), feed = el.querySelector('.feed');
  const ICON = { catch: 'star', achievement: 'trophy', fusion: 'star', level: 'lightning', arena: 'trophy' };
  return {
    show({ save, state, available }) {
      const live = !!(available && state);
      count.textContent = live ? `${state.online ?? 0} online` : 'offline';
      count.classList.toggle('on', live);
      status.textContent = available ? '' : state ? 'Offline, zeigt den letzten Stand.' : 'Offline. Die Rangliste ist gerade nicht erreichbar.';
      list.innerHTML = '';
      feed.innerHTML = '';
      const board = state?.leaderboard || [];
      if (!board.length) list.innerHTML = emptyState('trophy', state ? 'Noch niemand gemeldet. Spiel eine Runde!' : 'Sobald du online bist, erscheint hier die Rangliste.');
      board.forEach((p, i) => {
        const row = document.createElement('div');
        row.className = 'lb-row' + (p.nickname === save.profile?.nickname ? ' me' : '');
        row.innerHTML = `
          <div class="rank${i < 3 ? ` medal px-circle m${i + 1}` : ''}">${i + 1}</div>
          <img class="av" src="${spriteOf(p.avatar)}" alt="">
          <div class="lmeta"><div class="lname"><span class="n"></span><span class="dot${p.online ? ' on' : ''}"></span></div><div class="lsub"></div></div>
          <div class="lstats"><div class="tr">${ico('trophy', 'ico-in')}${p.trophies | 0}</div><div class="sub">Dex ${p.dex | 0}/${DEX_TOTAL}</div></div>`;
        row.querySelector('.n').textContent = p.nickname || '?';
        row.querySelector('.lsub').innerHTML = `Lv. ${Number(p.level) || 1} · ${fmt(p.sats | 0)}${ico('coin', 'ico-in')}${p.mastered ? `· ${ico('star', 'ico-in')}${p.mastered | 0}` : ''}`;
        list.appendChild(row);
      });
      const now = state?.now || Date.now();
      const items = state?.feed || [];
      if (!items.length) feed.innerHTML = '<p class="hint feed-empty">Noch nichts passiert.</p>';
      for (const f of items) {
        const d = document.createElement('div');
        d.className = 'feed-item';
        d.innerHTML = `${ico(ICON[f.kind] || 'quest', 'f-ico')}<span class="f-text"><b></b> </span><span class="f-time"></span>`;
        d.querySelector('b').textContent = f.nickname || '?';
        d.querySelector('.f-text').append(document.createTextNode(f.text || ''));
        const ms = now - (f.at || now);
        d.querySelector('.f-time').textContent = ms < 60000 ? 'gerade eben' : `vor ${agoText(ms)}`;
        feed.appendChild(d);
      }
    },
  };
}

// ---------- Profil ----------
export function createProfileScreen({ el, onRename, onAvatar, onSettings, onShare, onExport, onImport, onReset, onShop }) {
  const $ = s => el.querySelector(s);
  const pick = $('.profile-avatar-pick');
  let save = null;
  $('.go-shop').addEventListener('click', () => onShop?.());
  $('.share').addEventListener('click', () => onShare?.());
  $('.export').addEventListener('click', () => onExport?.());
  $('.edit-name').addEventListener('click', async () => {
    const cur = save.profile?.nickname || '';
    const v = await askText({ title: 'Name ändern', html: `<input class="rename" maxlength="16" value="${esc(cur)}" autocomplete="off">`, cls: 'rename', initial: cur });
    if (v != null) onRename(v);
  });
  $('.import').addEventListener('click', async () => {
    const v = await askText({ title: 'Spielstand einfügen', html: '<p class="sub">Hier den kopierten Spielstand einfügen. Der aktuelle wird ersetzt.</p><textarea class="import" rows="5" placeholder="{ … }"></textarea>', cls: 'import', ok: 'Übernehmen' });
    if (v) onImport(v);
  });
  $('.reset').addEventListener('click', async () => {
    const i = await popup({ title: 'Spielstand löschen?', html: '<p>Alle Rüthers, Sats, Erfolge und dein Profil sind dann weg. Das lässt sich nicht rückgängig machen.</p>', buttons: [{ label: 'Abbrechen', primary: true }, { label: 'Löschen', danger: true }] });
    if (i === 1) onReset();
  });
  const settingsChanged = () => onSettings({ sound: $('.set-sound').checked, haptics: $('.set-haptics').checked });
  $('.set-sound').addEventListener('change', settingsChanged);
  $('.set-haptics').addEventListener('change', settingsChanged);
  pick.addEventListener('click', e => {
    const b = e.target.closest('.avatar-opt');
    if (!b) return;
    onAvatar(b.dataset.id);
    pick.querySelectorAll('.avatar-opt').forEach(x => x.classList.toggle('active', x === b));
    $('.avatar').src = spriteOf(b.dataset.id);
  });

  function render(onlineId, available) {
    const p = save.profile || {};
    const leader = save.box.find(i => i.uid === save.team[0]);
    $('.profile-head .frame').className = `frame r-${leader?.rarity || 'normal'}`;
    $('.avatar').src = spriteOf(p.avatar);
    $('.nick').textContent = p.nickname || 'Trainer';
    const lp = levelProgress(save);
    $('.lvl').textContent = lp.level;
    $('.bar.xp .fill').style.width = `${Math.min(100, Math.round((lp.xp / lp.need) * 100))}%`;
    $('.xp-text').textContent = `${fmt(lp.xp)} / ${fmt(lp.need)} XP bis Lv. ${lp.level + 1}`;
    $('.online-id').textContent = onlineId ? `Online-ID ${onlineId} · ${available ? 'verbunden' : 'offline'}` : 'Noch nicht online';
    const st = save.stats || {};
    const mastered = Object.keys(save.arenaMastered || {}).length;
    const tiles = [
      ['coin', fmt(st.catches || 0), 'Fänge'], ['trophy', fmt(st.arenaWins || 0), 'Arenasiege'], ['beer', fmt(st.stops || 0), 'Stops'],
      ['quest', `${dexCount(save)}/${DEX_TOTAL}`, 'Dex'], ['star', `${mastered}/${ARENAS.length}`, 'Gemeistert'], ['lightning', fmt(st.fusions || 0), 'Fusionen'],
    ];
    $('.stats-grid').innerHTML = tiles.map(([i, v, k]) => `<div class="stat px-circle">${ico(i, 's-ico')}<div class="v">${v}</div><div class="k">${k}</div></div>`).join('');
    const got = save.achievements || {};
    $('.ach-count').textContent = `${ACHIEVEMENTS.filter(a => got[a.id]).length}/${ACHIEVEMENTS.length}`;
    $('.ach-grid').innerHTML = ACHIEVEMENTS.map(a =>
      `<div class="ach${got[a.id] ? '' : ' locked'}" title="${esc(a.desc)}">${ico(got[a.id] ? kitName(a.icon) || 'star' : 'lock', 'a-ico')}<div class="a-name">${esc(a.name)}</div>${got[a.id] ? '' : `<div class="a-desc">${esc(a.desc)}</div>`}</div>`).join('');
    $('.set-sound').checked = save.settings?.sound !== false;
    $('.set-haptics').checked = save.settings?.haptics !== false;
    pick.innerHTML = avatarGrid(p.avatar);
  }
  return { show(s, { onlineId = '', available = false } = {}) { save = s; render(onlineId, available); } };
}

// ---------- Dosenbier-Stop ----------
// Bierdeckel-Rad als echte Pixelgrafik: 60×60 Pixel, per CSS 4× hochskaliert (pixelated).
// Sektoren im Uhrzeigersinn ab oben, je 60°: Bernstein, Rot, Grün, Creme, Bernstein, Rot (Token-Farben).
function drawCoaster(cv) {
  const N = cv.width, R = N / 2, c = cv.getContext('2d'), img = c.createImageData(N, N);
  const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const INK = rgb('#1E2A22'), PAPER = rgb('#F4E8C8'), HUB = rgb('#F2C94C');
  const SECT = ['#E0A52B', '#B8412F', '#2F6B4F', '#F4E8C8', '#E0A52B', '#B8412F'].map(rgb);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = x + 0.5 - R, dy = y + 0.5 - R, r = Math.hypot(dx, dy);
      if (r > R) continue;
      const deg = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
      const toEdge = Math.min(deg % 60, 60 - (deg % 60)) * Math.PI / 180 * r; // Abstand zur Sektorgrenze in Pixeln
      let col;
      if (r > R - 1 || (r > R - 5 && r <= R - 4) || (r < 5 && r > 3.5)) col = INK; // Außenrand, Innenlinie, Nabe
      else if (r > R - 4) col = (x + y) % 4 ? PAPER : SECT[3].map(v => v * 0.85); // Bierdeckel-Rand mit Dither
      else if (r <= 3.5) col = HUB;
      else if (toEdge < 0.6) col = INK;
      else {
        col = SECT[Math.floor(deg / 60)];
        if (r > R - 9 && (x + y) % 2) col = col.map(v => v * 0.82); // Pixel-Dither als Schatten am Rand
      }
      img.data.set([...col, 255], (y * N + x) * 4);
    }
  }
  c.putImageData(img, 0, 0);
}
// onSpin(stop) -> { sats, superCoin, xp } (Belohnung vom App-Code); Rad dreht 2 s; onDone() beim Schließen
export function createStopScreen({ el, onSpin, onDone }) {
  const wheel = el.querySelector('.wheel'), result = el.querySelector('.stop-result'), btn = el.querySelector('.spin'), back = el.querySelector('.back');
  const SECTORS = [20, 30, 40, 60, 'coin', 20];
  const KIND = { pub: 'Kneipe', bar: 'Bar', biergarten: 'Biergarten', cafe: 'Café', fast_food: 'Imbiss', convenience: 'Kiosk', kiosk: 'Kiosk', supermarket: 'Supermarkt', alcohol: 'Spirituosenladen', beverages: 'Getränkemarkt' };
  wheel.innerHTML = '<canvas width="60" height="60"></canvas>' + SECTORS.map((s, i) => `<span style="--a:${i * 60 + 30}deg">${typeof s === 'number' ? s : ico('coin')}</span>`).join('');
  drawCoaster(wheel.querySelector('canvas'));
  let stop = null, state = 'idle', timer = null;
  back.addEventListener('click', () => { if (state === 'idle') onDone(); });
  btn.addEventListener('click', () => {
    if (state === 'done') return onDone();
    if (state !== 'idle') return;
    const r = onSpin(stop);
    state = 'spinning';
    btn.disabled = true;
    back.classList.add('hidden');
    let idx = r.superCoin ? 4 : SECTORS.indexOf(r.sats);
    if (idx <= 0) idx = Math.random() < 0.5 ? 0 : 5; // 20 Sats gibt es zweimal
    const jitter = (Math.random() - 0.5) * 40; // landet irgendwo im Sektor, nicht immer mittig
    wheel.classList.add('spinning');
    wheel.style.setProperty('--turn', `${360 * 5 - (idx * 60 + 30) + jitter}deg`);
    timer = setTimeout(() => {
      result.innerHTML = `+${r.sats | 0}${ico('coin', 'ico-in')}· +${r.xp | 0} XP${r.superCoin ? ` · ${ico('coin', 'ico-in')}Super-Münze!` : ''}`;
      result.classList.add('show');
      btn.textContent = 'Weiter';
      btn.disabled = false;
      state = 'done';
    }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 700 : 2100);
  });
  return {
    show(s) {
      stop = s;
      state = 'idle';
      clearTimeout(timer);
      el.querySelector('.stop-name').textContent = s.name;
      el.querySelector('.stop-sub').textContent = `Dosenbier-Stop · ${KIND[s.kind] || 'Laden'}`;
      result.textContent = '';
      result.classList.remove('show');
      btn.textContent = 'Drehen';
      btn.disabled = false;
      back.classList.remove('hidden');
      wheel.classList.remove('spinning');
      wheel.style.setProperty('--turn', '0deg');
      void wheel.offsetWidth; // Rücksetzen ohne Transition durchrechnen lassen
    },
  };
}
