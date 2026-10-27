import { CONST, RUETHERS, RUETHER_BY_ID, QUEST_UNITS, portraitOf, RARITIES, RARITY_BY_ID, SHOP, QUESTS, ACHIEVEMENTS, ARENAS } from './data.js';
import { fighterStats, levelCost, DEX_TOTAL, dexCount, arenaReward, canFuse, nextRarity, levelProgress, pickFood, sell, sellDuplicates,
  summonCost, haunebuActive, questsUnlocked, QUEST_SATS, abilityLevel, buyAbility, upgradeAbility, loadoutFor, MOSHE_WINS, mosheUnlocked, mosheInst } from './progress.js';
import { esc, popup, ico, kitName } from './ui.js';
import { hashrateText, countText } from './format.js';
import { playSheet, btcRain } from './fx.js';
import { MISSIONS } from './quest/missions.js';
import { abilitiesFor, ENEMY_TYPES, ABILITIES, FIXED, POOLS } from './quest/engine.js';
import { hms, dealLeft } from './ad.js';

const fmt = n => n.toLocaleString('de-DE');
// Restzeit „7:41"
export const clock = ms => { ms = Math.max(0, ms); return `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`; };
// Läuft jede Sekunde, solange el sichtbar ist: Countdown-Texte (.hb-left) nachziehen; Fenster zu → neu zeichnen
function haunebuTicker(el, getSave, render) {
  setInterval(() => {
    const save = getSave(), spans = el.querySelectorAll('.hb-left');
    if (!save || !spans.length || !el.classList.contains('active')) return;
    const left = (save.haunebuUntil || 0) - Date.now();
    if (left <= 0) return render();
    spans.forEach(s => { s.textContent = clock(left); });
  }, 1000);
}
const rarityRank = id => RARITIES.findIndex(r => r.id === id);
const spriteOf = id => portraitOf(id) || 'sprites/unknown.png'; // v13: Rüther und Moshe (QUEST_UNITS)
const defOf = id => RUETHER_BY_ID[id] || QUEST_UNITS[id];
// v13 §1: Team-Wahl und Koop-Raster: Box-Exemplare (Team zuerst, dann Seltenheit, Level), dahinter Moshe, sobald er frei ist
export const questTeamList = save => {
  const order = uid => { const i = save.team.indexOf(uid); return i < 0 ? 9 : i; };
  const list = [...save.box].sort((a, b) => order(a.uid) - order(b.uid) || rarityRank(b.rarity) - rarityRank(a.rarity) || b.level - a.level);
  if (mosheUnlocked(save)) list.push(mosheInst(save));
  return list;
};
// v13 §6: Zeile unter Rabino Empire HQ in der Missionsliste
export const mosheLine = save => (mosheUnlocked(save) ? 'Moshe spielbar' : `Siege ${Math.max(0, Math.floor(Number(save.questLog?.rabino?.wins)) || 0)}/${MOSHE_WINS} · dann arbeitet Moshe für dich`);
// v10: Fähigkeits-Icon (Familientreffen: die echten Gesichter von Christian und Micha, §0) und Stufen-Punkte ●●○ als Pixel-Quadrate
const abIcon = a => a.id === 'family' ? `<span class="q-fam"><img src="${spriteOf('christian')}" alt=""><img src="${spriteOf('micha')}" alt=""></span>` : `<img src="${a.icon}" alt="">`;
const abDots = lv => `<span class="ab-dots" role="img" aria-label="Stufe ${lv} von 3">${[1, 2, 3].map(k => `<i${k <= lv ? ' class="on"' : ''}></i>`).join('')}</span>`;
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
// Versionsanzeige im Profil; bei jedem Release mitziehen
export const VERSION = 'v13';
// Jeder Knopf-Tipp baut die Liste neu auf: ein schneller zweiter Tipp träfe das nachgerückte Exemplar (falsches verkauft oder
// gefüttert, zwei Super-Münzen gekauft). Darum schluckt node 300 ms nach einem Knopf-Tipp alle weiteren Klicks.
function tapGuard(node, ms = 300) {
  let last = -Infinity;
  node.addEventListener('click', e => {
    if (e.timeStamp - last < ms) { e.stopPropagation(); e.preventDefault(); return; }
    if (e.target.closest('button')) last = e.timeStamp;
  }, true);
}

// ---------- Sammlung ----------
// Eine Karte pro Rüther (Spec §3): echtes Gesicht des besten Exemplars groß, Zähler je Seltenheit, Fusions-Fortschritt,
// Knöpfe Fusion / Duplikate verkaufen (n) / Alle n anzeigen; ausgeklappt die Exemplare mit Team, Power-Up, Füttern, Verkaufen.
// onTeamChange(teamUids); onPowerUp(uid) -> { ok, reason, level }; onFuse(id, rarityId) -> { ok, inst, used, newDex };
// onFeed(targetUid) -> { ok, reason, level, foodUid }; onSell(uid) -> { ok, reason, sats };
// onSellDuplicates(id) -> { count, sats } (Bestätigung hier per popup vor dem Aufruf); onDex(); onBack()
// v10: onBuyAbility / onUpgradeAbility / onEquipAbility (rid, aid) -> { ok, reason } (Toast, Sats und Speichern macht der App-Code)
export function createCollectionScreen({ el, onTeamChange, onPowerUp, onFuse, onFeed, onSell, onSellDuplicates, onDex, onBack, onBuyAbility, onUpgradeAbility, onEquipAbility }) {
  const box = el.querySelector('.box');
  tapGuard(box);
  el.querySelector('.back')?.addEventListener('click', () => onBack?.());
  el.querySelector('.dex-btn').addEventListener('click', onDex);
  let save = null;
  const open = new Set(), abOpen = new Set(); // ausgeklappte Rüther-ids (Exemplare bzw. Quest-Fähigkeiten)
  // Regeln aus progress.js probeweise, ohne den Spielstand zu ändern. Flache Kopie statt structuredClone(save): der Klon des ganzen
  // Spielstands je Zeile machte jeden Tipp ab etwa 200 Exemplaren träge. Die Proben (sell, sellDuplicates, buy-/upgradeAbility)
  // ersetzen box, ändern sats und questAbilities, aber keine Exemplare (test/map.test.mjs prüft das an eingefrorenen Exemplaren).
  const dry = (fn, ...a) => fn({ ...save, box: [...save.box], team: [...save.team], questAbilities: structuredClone(save.questAbilities || {}) }, ...a);
  const statLine = inst => {
    const st = fighterStats(defOf(inst.id), inst);
    return `${fmt(st.btc)} BTC · ${ico('hashrate', 'ico-in')}${hashrateText(st.power)}`;
  };
  // v13 §1: Moshe-Karte hinter den Rüthern, nur freigeschaltet: kein Exemplar, Level und Seltenheit aus den Siegen (mosheInst)
  function mosheCard() {
    const inst = mosheInst(save), def = QUEST_UNITS.moshe, r = RARITY_BY_ID[inst.rarity];
    const div = document.createElement('div');
    div.className = `rcard panel thin moshe r-${inst.rarity}`;
    div.dataset.id = 'moshe';
    div.innerHTML = `
      <div class="rhead">
        <div class="frame big r-${inst.rarity}"><img src="${spriteOf('moshe')}" alt="${esc(def.name)}"><span class="shine"></span></div>
        <div class="meta">
          <div class="cname">${esc(def.name)} <span class="badge-pixel">Lv. ${inst.level}</span></div>
          <div class="counts"><span class="cnt r-${inst.rarity}">${r.name}</span><span class="cnt">${esc(def.title)}</span></div>
          <div class="sub">${statLine(inst)}</div>
          <div class="sub m-wins">Siege in Rabino Empire HQ: ${fmt(Math.max(0, Math.floor(Number(save.questLog?.rabino?.wins)) || 0))} · jeder Sieg macht ihn stärker</div>
        </div>
      </div>`;
    div.appendChild(abilityBox('moshe'));
    return div;
  }

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
    const qab = abilityBox(def.id);
    if (qab) div.querySelector('.ractions').after(qab);
    return div;
  }

  // v10 §3: „Quest-Fähigkeiten“ – 2 feste und 3 Pool mit Stufen, Texte bis zur aktuellen und die nächste Stufe (die Texte
  // bauen aufeinander auf), Kaufen/Upgrade/Ausrüsten.
  // Gehören dem Rüther an sich (alle Exemplare gleich). Zugeklappt zeigt die Zeile die 3 ausgerüsteten.
  function abilityBox(rid) {
    if (!FIXED[rid]) return null;
    const lo = loadoutFor(save, rid), slot = lo[2]?.id;
    const row = aid => {
      const a = ABILITIES[aid], lv = abilityLevel(save, rid, aid), pool = a.kind === 'pool', on = pool && aid === slot, up = CONST.ABILITY_UP[lv + 1];
      const main = !lv ? `<button class="primary" data-act="buy" ${dry(buyAbility, rid, aid).ok ? '' : 'disabled'}>Kaufen ${fmt(CONST.ABILITY_BUY)}${ico('coin')}</button>`
        : up ? `<button data-act="up" ${dry(upgradeAbility, rid, aid).ok ? '' : 'disabled'}>Upgrade ${fmt(up)}${ico('coin')}</button>`
        : '<button disabled>Max. Stufe</button>';
      return `<div class="qab-row${on ? ' on' : ''}${lv ? '' : ' locked'}" data-aid="${aid}">
        <div class="qab-ico">${abIcon(a)}</div>
        <div class="qab-meta">
          <div class="qab-name">${esc(a.name)} ${abDots(lv)}${pool ? on ? '<span class="qab-tag on">Ausgerüstet</span>' : '' : '<span class="qab-tag">Fest</span>'}</div>
          ${a.texts.slice(0, lv).map((t, k) => `<p class="qab-text"><b>Stufe ${k + 1}:</b> ${esc(t)}</p>`).join('')}
          ${lv < 3 ? `<p class="qab-text next"><b>${lv ? 'Nächste' : 'Stufe 1'}:</b> ${esc(a.texts[lv])}</p>` : ''}
        </div>
        <div class="qab-btns">${main}${pool && lv && !on ? '<button data-act="equip">Ausrüsten</button>' : ''}</div>
      </div>`;
    };
    const det = document.createElement('details');
    det.className = 'qab';
    det.open = abOpen.has(rid);
    det.innerHTML = `
      <summary><span class="qab-title">Quest-Fähigkeiten</span><span class="qab-load">${lo.map(x => x ? abIcon(ABILITIES[x.id]) : '<span class="qab-empty"></span>').join('')}</span></summary>
      <div class="qab-list">
        <p class="sub qab-hint">Fähigkeiten gehören dem Rüther, nicht dem Exemplar. 2 feste, der 3. Slot nimmt eine gekaufte aus dem Pool.</p>
        ${FIXED[rid].map(row).join('')}
        <div class="qab-pool">Pool für den 3. Slot</div>
        ${POOLS[rid].map(row).join('')}
      </div>`;
    det.addEventListener('toggle', () => { if (det.open) abOpen.add(rid); else abOpen.delete(rid); });
    det.addEventListener('click', e => {
      const b = e.target.closest('button[data-act]');
      if (!b) return;
      const aid = b.closest('.qab-row').dataset.aid;
      const res = { buy: onBuyAbility, up: onUpgradeAbility, equip: onEquipAbility }[b.dataset.act]?.(rid, aid);
      if (res?.ok) render();
    });
    return det;
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
    if (mosheUnlocked(save)) box.appendChild(mosheCard());
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
// onBuy(itemId | 'haunebu-extend') -> { ok, reason }
// v12 §3: „Der Investment-Code" einmalig; Streichpreis, Rabatt-Countdown (rein optisch, 3 h von vorn), gekauft = „Lesen" (Popup mit
// Seiten, der erste Knopf ist immer der harmlose „Zu") und „Verkaufen" für item.sell nach Rückfrage: onSell('investmentcode') -> { ok }
const BOOK_PAGES = [
  { page: 'Seite 1', html: '<p class="big">Trick 1: Verkaufe ein Buch.</p>' },
  { page: 'Seiten 2 bis 99', html: '<p class="book-note">Platz für deine Notizen.</p>' },
  { page: 'Seite 100 · Impressum', html: '<p>Rabino Empire Ltd., Limassol, Zypern. Keine Anlageberatung. Rückgabe ausgeschlossen.</p><p class="book-hint">Das ist die Adresse. Die Mission „Rabino Empire HQ“ ist freigeschaltet.</p>' },
  { page: 'Beilage: 2 Geschenke', html: '<ul><li>Premium-Geschenk zu Immobilien: Flyer „Eigentumswohnung Duisburg-Marxloh, 3. OG, Boden optional“</li><li>Truhe mit Skripten und Vorlagen: Mahnung.docx</li></ul>' },
];
export async function readBook() {
  for (let i = 0; i >= 0 && i < BOOK_PAGES.length;) {
    const p = BOOK_PAGES[i], last = i === BOOK_PAGES.length - 1;
    const buttons = [{ label: 'Zu' }, ...(i ? [{ label: 'Zurück' }] : []), ...(last ? [] : [{ label: 'Weiter', primary: true }])];
    const r = await popup({ title: 'Der Investment-Code', icon: 'quest', html: `<div class="book"><p class="book-page">${esc(p.page)}</p>${p.html}</div>`, buttons });
    i = r === 0 ? -1 : buttons[r].label === 'Zurück' ? i - 1 : i + 1;
  }
}
export function createShopScreen({ el, onBuy, onSell, onBack }) {
  el.querySelector('.back').addEventListener('click', onBack);
  const list = el.querySelector('.shop-items');
  tapGuard(list);
  let save = null;
  function bookButtons(item) {
    if (save.items?.investmentcode) {
      return `<div class="price"><button class="buy primary" data-id="read">Lesen</button><button class="buy sellbook" data-id="sellbook">Verkaufen ${fmt(item.sell)}${ico('coin')}</button></div>`;
    }
    return `<div class="price"><button class="buy primary" ${save.sats < item.cost ? 'disabled' : ''}>${fmt(item.cost)}${ico('coin')}</button><div class="sub was">statt <s>${fmt(item.was)}</s></div></div>`;
  }
  async function sellBook() {
    const i = await popup({ title: 'Buch verkaufen?', icon: 'quest', html: `<p>Gebraucht, ohne Lesespuren: ${fmt(SHOP.find(x => x.id === 'investmentcode').sell)} Sats.</p><p class="sub">Danach ist die Adresse aus dem Impressum weg, die Mission „Rabino Empire HQ“ ist wieder gesperrt.</p>`, buttons: [{ label: 'Behalten' }, { label: 'Verkaufen', primary: true }] });
    if (i === 1 && onSell?.('investmentcode')?.ok) render();
  }
  // v8 §1: Haunebu-Preis steigt pro Beschwörung; im 10-Minuten-Fenster „Im Einsatz · noch 7:41"
  // v9 §1: dazu der Knopf „+10 Min · 5.000" (onBuy('haunebu-extend'): verlängert nur, beschwört nie, auch wenn das Fenster
  // zwischen Anzeige und Tipp abläuft)
  function haunebuButton() {
    const now = Date.now(), cost = summonCost(save);
    if (haunebuActive(save, now)) {
      return `<div class="price"><div class="sub hb-on">Im Einsatz · noch <span class="hb-left">${clock(save.haunebuUntil - now)}</span></div>`
        + `<button class="buy summon primary" data-id="haunebu-extend" ${save.sats < CONST.HAUNEBU_EXTEND_COST ? 'disabled' : ''}><span>+${CONST.HAUNEBU_EXTEND_MS / 60000} Min</span><span>${fmt(CONST.HAUNEBU_EXTEND_COST)}${ico('coin')}</span></button>`
        + `<div class="sub next">Danach: ${fmt(cost)}</div></div>`;
    }
    const next = summonCost({ stats: { haunebuSummons: (save.stats.haunebuSummons || 0) + 1 } });
    return `<div class="price"><button class="buy summon primary" ${save.sats < cost ? 'disabled' : ''}><span>Beschwören</span><span>${fmt(cost)}${ico('coin')}</span></button>`
      + `<div class="sub next">Nächste: ${fmt(next)}</div></div>`;
  }
  function render() {
    el.querySelector('.shop-sats').innerHTML = `${ico('coin')}${fmt(save.sats)}`;
    list.innerHTML = '';
    for (const item of SHOP) {
      const owned = item.id === 'supercoin' ? `Im Besitz: ${save.items.supercoin || 0}`
        : item.id === 'haunebu' ? ''
        : item.id === 'investmentcode' ? (save.items.investmentcode ? 'Gekauft' : '')
        : (save.lureUntil > Date.now() ? 'Gerade aktiv (Kauf verlängert)' : '');
      const deal = item.id === 'investmentcode' && !save.items.investmentcode ? `<div class="sub ad-deal">40 % Rabatt · Angebot endet in <span class="ad-left">${hms(dealLeft(Date.now()))}</span></div>` : '';
      const div = document.createElement('div');
      div.className = 'shop-item panel thin';
      div.innerHTML = `
        ${ico(kitName(item.icon) || 'shop', 'icon')}
        <div class="meta"><div class="iname">${item.name}</div><div class="sub">${item.desc}</div>${deal}<div class="sub owned">${owned}</div></div>
        ${item.id === 'haunebu' ? haunebuButton() : item.id === 'investmentcode' ? bookButtons(item) : `<button class="buy primary" ${save.sats < item.cost ? 'disabled' : ''}>${fmt(item.cost)}${ico('coin')}</button>`}`;
      div.querySelectorAll('.buy').forEach(b => b.addEventListener('click', e => {
        const id = e.currentTarget.dataset.id || item.id;
        if (id === 'read') return readBook();
        if (id === 'sellbook') return sellBook();
        const res = onBuy(id);
        render();
        if (res.ok) { const d = list.querySelector(`.shop-item:nth-child(${SHOP.indexOf(item) + 1})`); d?.classList.add('bought'); setTimeout(() => d?.classList.remove('bought'), 600); }
      }));
      list.appendChild(div);
    }
  }
  haunebuTicker(el, () => save, render);
  setInterval(() => { if (el.classList.contains('active')) el.querySelectorAll('.ad-left').forEach(n => { n.textContent = hms(dealLeft(Date.now())); }); }, 1000);
  return { show(s) { save = s; render(); } };
}

// ---------- Arena-Info ----------
// globalOwner: { owner, leader: { id, rarity, level } | null, since, mine } | null
// v7: außer Reichweite mit Flugscheibe zusätzlich „Mit der Haunebu hinfliegen" → onBeam(arena)
// v8: Flüge im Haunebu-Fenster sind frei; haunebuOnly (Neuschwabenland) erklärt sich selbst, Kulisse per data-arena
export function createArenaScreen({ el, bosses, onFight, onBeam, onBack }) {
  el.querySelector('.back').addEventListener('click', onBack);
  const fight = el.querySelector('.fight'), beam = el.querySelector('.beam'), sprite = el.querySelector('.sprite');
  let arena = null;
  fight.addEventListener('click', () => onFight(arena));
  beam.addEventListener('click', () => onBeam?.(arena));
  beam.innerHTML = `${ico('haunebu')}Mit der Haunebu hinfliegen`;
  sprite.addEventListener('error', () => { if (!sprite.src.endsWith('/unknown.png')) sprite.src = 'sprites/unknown.png'; }); // Boss-Grafik fehlt noch
  return {
    show(a, { distanceM, teamSize, level, mastered, ownerName, bossBtc, globalOwner = null, flugscheibe = false }) {
      arena = a;
      el.dataset.arena = a.id;
      const boss = bosses[a.boss];
      el.querySelector('.arena-name').textContent = a.name;
      el.querySelector('.arena-poster').style.backgroundImage = `url(art/bg-${a.id}.png)`;
      sprite.src = `art/boss-${boss.id}.png`;
      el.querySelector('.boss-name').textContent = `Boss: ${boss.name} · ${bossBtc} BTC`;
      el.querySelector('.level').innerHTML = mastered ? `${ico('trophy')}Arena gemeistert (Lv. 5)` : `${ico('star')}Arena Lv. ${level} von ${CONST.ARENA_LEVELS}`;
      el.querySelector('.address').textContent = a.haunebuOnly ? `${a.address} · Nur mit der Haunebu erreichbar` : a.address;
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
      if (!inRange && a.haunebuOnly) status = flugscheibe ? 'Flieg mit der Haunebu hin.' : 'Beschwöre die Haunebu im Shop und besiege Hitler.';
      else if (!inRange) status = distanceM == null ? `Du musst näher als ${CONST.ARENA_RANGE} m ran.` : `Zu weit weg (${distText(distanceM)}). Näher als ${CONST.ARENA_RANGE} m ran.`;
      else if (teamSize === 0) status = 'Du brauchst mindestens einen Rüther im Team.';
      el.querySelector('.status').textContent = status;
      fight.disabled = !(inRange && teamSize > 0);
      beam.classList.toggle('hidden', inRange || !flugscheibe);
    },
  };
}

// ---------- Sieg ----------
export function createVictoryScreen({ el, onBack }) {
  el.querySelector('.back').addEventListener('click', onBack);
  return {};
}

// ---------- Quests ----------
// v8 §5.1: oben „Haunebu-Quests" (gesperrt: Fortschritt + fehlende Arenen; frei: Haunebu-Status + Missionen mit Bestwert).
// onClaim(id) -> { sats, xp } | null  (Toast macht der App-Code); onQuestStart(missionId); onShop()
const THEME_BG = { neuschwabenland: 'neuschwabenland', hangar: 'neuschwabenland', pcsale: 'pcsale', keller: 'keller', mosel: 'mosel', bruch: 'ranger', zypern: 'anzeige' };
// Bestwert mit Einheit in Einzahl/Mehrzahl („1 Baum", „3 Bäume"); Missionen ohne Einheit nur die Zahl
const BEST_UNIT = { steal: ['Münze', 'Münzen'], sabotage: ['Flugscheibe', 'Flugscheiben'], fetch: ['PS3', 'PS3'], unplug: ['Stecker', 'Stecker'], valve: ['Anschluss', 'Anschlüsse'], ignite: ['Baum', 'Bäume'] };
const bestText = (m, n) => { const u = m.loot === 'q-sack' ? ['Sack', 'Säcke'] : BEST_UNIT[m.objective.type]; return u ? countText(n, u) : String(n); }; // v12: Rabino trägt Säcke statt Münzen
// v9: Strafe, wenn ein Gegner der Mission erwischen kann (Ranger: fine), sonst 0
const missionFine = m => Math.max(0, ...m.layouts.flatMap(l => l.variants.flatMap(v => v.enemies.map(e => ENEMY_TYPES[e.type]?.fine || 0))));
const variantCount = m => m.layouts.reduce((n, l) => n + l.variants.length, 0);
// Belohnungszeile (HTML, nur Zahlen): Camping „10.000–12.000 · jedes Kieser-Training −1.000", Bruch „6.500 · Erwischt: −10.000".
// Jeder Teil ein eigenes Flex-Element, damit die Zeile teilweise umbricht und die Münze vorne stehen bleibt.
const questReward = (r, fine = 0) => [
  r.kieser && `${fmt(r.min)}–${fmt(r.base)}`, r.kieser && `jedes Kieser-Training −${fmt(r.kieser)}`,
  r.coin && `${fmt(r.coin)} je ${r.video ? 'Sack' : 'Münze'}`, !r.kieser && r.base && fmt(r.base), r.done && `+${fmt(r.done)} Abschluss`, r.clean && `+${fmt(r.clean)} ohne Alarm`,
  r.video && `jedes Video −${fmt(r.video)}`,
  fine && `<span class="m-fine">Erwischt: −${fmt(fine)}</span>`,
].filter(Boolean).map((t, i, all) => `<span>${t}${i < all.length - 1 ? '&nbsp;·' : ''}</span>`).join('');
export function createQuestsScreen({ el, onClaim, onQuestStart, onShop }) {
  const streak = el.querySelector('.quest-streak'), list = el.querySelector('.quest-list'), reset = el.querySelector('.quest-reset'), hq = el.querySelector('.hq');
  let save = null;
  function renderHq() {
    if (!questsUnlocked(save)) {
      const missing = ARENAS.filter(a => !save.arenaMastered[a.id]), n = ARENAS.length - missing.length;
      hq.innerHTML = `<div class="hq-box panel thin">${ico('lock', 'ico-lg hq-ico')}<div class="hq-meta">
        <div class="big">Meistere alle Arenen: ${n}/${ARENAS.length}</div>
        <div class="bar q-bar"><div class="fill" style="width:${Math.round((n / ARENAS.length) * 100)}%"></div></div>
        <p class="sub">Dann kaperst du die Haunebu, nimmst ein 3er-Team mit und schlägst in Neuschwabenland, im PC Sale und im Keller zu.</p>
        <ul class="hq-missing">${missing.map(a => `<li><span>${esc(a.name)}</span><span class="sub">Lv. ${save.arenaLevels[a.id] || 1}/${CONST.ARENA_LEVELS}</span></li>`).join('')}</ul>
      </div></div>`;
      return;
    }
    const now = Date.now(), active = haunebuActive(save, now);
    hq.innerHTML = `<div class="hq-box panel thin${active ? ' on' : ''}">${ico('haunebu', 'ico-lg hq-ico')}<div class="hq-meta">${active
      ? `<div class="big">Haunebu bereit</div><div class="sub">noch <span class="hb-left">${clock(save.haunebuUntil - now)}</span> · nach der Quest fliegt sie euch zurück</div>`
      : '<div class="big">Kapere zuerst die Haunebu</div><div class="sub">Beschwöre sie im Shop und besiege Hitler. Danach hast du 10 Minuten für Quests und Flüge.</div>'}
      </div>${active ? '' : '<button class="hq-shop primary">Zum Shop</button>'}</div>`
      + MISSIONS.map(m => {
        const log = save.questLog?.[m.id], r = QUEST_SATS[m.id];
        // v9 §3: Solo-Mission ohne Team-Wahl, gesperrt ohne den Rüther in der Box; sein echtes Gesicht steht auf der Kachel
        const solo = m.solo && RUETHER_BY_ID[m.solo];
        // v12 §4: needsItem (Rabino Empire HQ braucht den Investment-Code aus dem Shop; verkauft = wieder gesperrt)
        const needs = m.needsItem && !(save.items?.[m.needsItem] >= 1), locked = (solo && !save.box.some(i => i.id === m.solo)) || needs;
        return `<div class="mission-card" data-id="${m.id}">
          <div class="m-art" style="background-image:url(art/bg-${THEME_BG[m.theme] || 'menu'}.png)">${solo ? `<img class="m-solo" src="${spriteOf(m.solo)}" alt="${esc(solo.name)}">` : ''}</div>
          <div class="m-meta">
            <div class="m-name">${esc(m.name)}${log?.done ? ` ${ico('trophy', 'ico-in')}` : ''}</div>
            <div class="sub">${esc(m.place)} · ${m.timeMs ? `${Math.round(m.timeMs / 60000)} Min.` : 'Keine Eile'}${solo ? ` · nur ${esc(solo.name)}` : ''}</div>
            <div class="m-goal">${esc(m.objective.label)}${m.objective.min ? ` (mind. ${m.objective.min})` : ''}</div>
            ${r ? `<div class="m-reward">${ico('coin', 'ico-in')}${questReward(r, missionFine(m))}</div>` : ''}
            <div class="sub m-maps">Karten: ${m.layouts.length} · Varianten: ${variantCount(m)}</div>
            <div class="sub m-best">${log ? `Bestwert: ${bestText(m, log.best)}${log.done ? ' · geschafft' : ''}${log.kieser ? ` · Kieser: ${log.kieser}` : ''}` : 'Noch nicht gespielt'}</div>
            ${m.id === 'rabino' ? `<div class="sub m-moshe${mosheUnlocked(save) ? ' on' : ''}">${esc(mosheLine(save))}</div>` : ''}
            ${needs ? '<div class="sub m-lock">Die Adresse steht im Impressum des Investment-Codes (Shop).</div>' : ''}
          </div>
          <button class="m-start${active && !locked ? ' primary' : ''}" ${locked ? 'disabled' : ''}>${needs ? 'Adresse fehlt' : locked ? `Fang erst ${esc(solo.name)}` : solo ? 'Solo starten' : 'Starten'}</button>
        </div>`;
      }).join('');
    hq.querySelector('.hq-shop')?.addEventListener('click', () => onShop?.());
    hq.querySelectorAll('.mission-card').forEach(c => c.querySelector('.m-start').addEventListener('click', () => onQuestStart?.(c.dataset.id)));
  }
  haunebuTicker(el, () => save, () => renderHq());
  function render() {
    renderHq();
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

// ---------- v8 §5.1: Team für die Haunebu-Quest ----------
// Box mit echten Gesichtern, 1–3 wählbar (vorausgewählt: aktuelles Team), je Rüther seine 3 Quest-Fähigkeiten mit Stufe.
// v10: Tipp auf den 3. Slot wechselt durch die gekauften Pool-Fähigkeiten. onStart(missionId, uids); onEquip(rid, aid) -> { ok }; onBack()
export function createQuestTeamScreen({ el, onStart, onEquip, onBack }) {
  let save = null, mission = null, picked = [];
  el.innerHTML = `
    <header class="topbar wood"><button class="back">‹ Quests</button><h2 class="qt-title"></h2></header>
    <div class="qt-scroll">
      <div class="qt-brief panel thin"><p class="qt-intro"></p><p class="sub qt-hint"></p></div>
      <h3 class="section-title">Team wählen <span class="qt-count"></span></h3>
      <div class="qt-list"></div>
    </div>
    <div class="qt-foot wood"><span class="qt-hb"></span><button class="qt-go primary">Abflug</button></div>`;
  const listEl = el.querySelector('.qt-list'), go = el.querySelector('.qt-go');
  el.querySelector('.back').addEventListener('click', () => onBack?.());
  go.addEventListener('click', () => { if (picked.length) onStart?.(mission.id, [...picked]); });
  const toggle = uid => {
    const i = picked.indexOf(uid);
    if (i >= 0) picked.splice(i, 1); else if (picked.length < CONST.TEAM_SIZE) picked.push(uid); else return;
    render();
  };
  listEl.addEventListener('click', e => {
    const slot = e.target.closest('.qt-slot');
    if (slot) { // nächste gekaufte Pool-Fähigkeit, gilt für alle Exemplare dieses Rüthers
      const rid = slot.dataset.rid, owned = (POOLS[rid] || []).filter(aid => abilityLevel(save, rid, aid));
      if (onEquip?.(rid, owned[(owned.indexOf(loadoutFor(save, rid)[2]?.id) + 1) % owned.length])?.ok) render();
      return;
    }
    const row = e.target.closest('.qt-row');
    if (row) toggle(row.dataset.uid);
  });
  listEl.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('qt-row')) { e.preventDefault(); toggle(e.target.dataset.uid); }
  });
  const power = a => `${abIcon(a)}<span>${esc(a.name)}</span>${abDots(a.level)}`;
  // Zeile ist kein <button>, weil der 3. Slot selbst ein Knopf ist
  function powers(rid) {
    const lo = loadoutFor(save, rid), [a, b, c] = abilitiesFor({ abilities: lo.filter(Boolean) });
    const owned = (POOLS[rid] || []).filter(aid => abilityLevel(save, rid, aid)).length;
    const slot = !lo[2] ? '<span class="qt-power qt-free">3. Slot frei · Kaufen in der Sammlung</span>'
      : owned > 1 ? `<button class="qt-power qt-slot" data-rid="${rid}" aria-label="3. Slot wechseln, jetzt ${esc(c.name)}">${power(c)}<span class="qt-swap">›</span></button>`
      : `<span class="qt-power">${power(c)}</span>`;
    return [a, b].filter(Boolean).map(x => `<span class="qt-power">${power(x)}</span>`).join('') + (FIXED[rid] ? slot : '');
  }
  // §2: Text des 3. Slots (Grundtext + erreichte Stufen) nur bei gewählten Zeilen, sonst wird die Liste zu lang
  const slotText = rid => {
    const c = loadoutFor(save, rid)[2], a = c && ABILITIES[c.id];
    return a ? `<p class="qt-desc"><b>${esc(a.name)}:</b> ${esc(a.texts.slice(0, c.level).join(' '))}</p>` : '';
  };
  function render() {
    const now = Date.now(), active = haunebuActive(save, now);
    el.querySelector('.qt-title').textContent = mission.name;
    el.querySelector('.qt-intro').textContent = mission.intro;
    el.querySelector('.qt-hint').textContent = mission.hint;
    el.querySelector('.qt-count').textContent = `${picked.length}/${CONST.TEAM_SIZE}`;
    const insts = questTeamList(save); // v13: Moshe als letzte Zeile, sobald er frei ist
    listEl.innerHTML = insts.length ? insts.map(inst => {
      const def = defOf(inst.id), n = picked.indexOf(inst.uid), st = fighterStats(def, inst);
      return `<div class="qt-row btn${n >= 0 ? ' on' : ''}" data-uid="${inst.uid}" role="button" tabindex="0" aria-pressed="${n >= 0}">
        <div class="frame r-${inst.rarity}"><img src="${spriteOf(inst.id)}" alt=""><span class="shine"></span></div>
        <div class="qt-meta">
          <div class="qt-name">${esc(def.name)}${inst.id === 'moshe' ? ` <span class="sub">${esc(def.title)}</span>` : ''} <span class="badge-pixel">Lv. ${inst.level}</span> <span class="sub">${fmt(st.btc)} BTC</span></div>
          <div class="qt-powers">${powers(inst.id)}</div>
        </div>
        <span class="qt-pick">${n >= 0 ? n + 1 : ''}</span>
        ${n >= 0 ? slotText(inst.id) : ''}
      </div>`;
    }).join('') : emptyState('bag', 'Noch keine Rüthers gefangen.');
    el.querySelector('.qt-hb').innerHTML = active ? `${ico('haunebu', 'ico-in')}noch <span class="hb-left">${clock(save.haunebuUntil - now)}</span>` : `${ico('haunebu', 'ico-in')}Haunebu weg`;
    go.disabled = !picked.length || !active;
    go.textContent = picked.length ? `Abflug (${picked.length})` : 'Abflug';
  }
  haunebuTicker(el, () => save, () => render());
  return {
    show(s, m) {
      save = s; mission = m;
      picked = save.team.filter(uid => save.box.some(i => i.uid === uid) || (uid === 'moshe' && mosheUnlocked(save))).slice(0, CONST.TEAM_SIZE);
      render();
      el.querySelector('.qt-scroll').scrollTop = 0;
    },
  };
}

// ---------- v8 §5.1: Ergebnis der Haunebu-Quest ----------
// show({ mission, setup, summary (onEnd der Quest, mit text der Engine), reward (questResult), team (Exemplare) }); onDone() = Heimflug
// v9: Karte und Variante aus setup, Kieser-Trainings (camping) und Strafe (Ranger hat erwischt: reward.fine)
// v11 (Spec Mehrspieler §4/§5): together = { mode: 'coop'|'race', me, partner } ({ name, avatar }) zeigt „Koop mit <Name>“ bzw. das
// Rennen mit beiden echten Gesichtern; setRace(r) zieht den Rennstand nach (r = { rival, mine, his, done, winner, lost, bonus }).
export function createQuestResultScreen({ el, onDone }) {
  el.innerHTML = '<div class="qr-body"></div>';
  const body = el.querySelector('.qr-body');
  let tg = null;
  body.addEventListener('click', e => { if (e.target.closest('.qr-done')) onDone?.(); });
  const player = (p, line) => `<div class="qr-p"><div class="frame r-normal"><img src="${spriteOf(p?.avatar)}" alt=""></div><b>${esc(p?.name || '')}</b>${line == null ? '' : `<span class="qr-p-n">${line}</span>`}</div>`;
  // Rennen: warten (Live-Stand des Partners), Sieger mit beiden Scores, oder ohne Wertung
  function setRace(r) {
    const box = body.querySelector('.qr-race');
    if (!box || !tg || !r) return;
    const them = tg.partner, rv = r.rival || {};
    const live = rv.lost ? 'Verbindung weg' : rv.over ? (rv.result === 'success' ? 'fertig' : 'gescheitert') : `${rv.done | 0}/${rv.total | 0}`;
    let head, mine = r.mine ? String(r.mine.score) : '…', his = r.his ? String(r.his.score) : live;
    if (r.done && !r.his) head = 'Rennen ohne Wertung (Verbindung weg).';
    else if (r.done) head = r.winner === 'draw' ? 'Unentschieden!' : `${esc((r.winner === 'me' ? tg.me : them).name)} hat das Rennen gewonnen!`;
    else head = `Warte auf ${esc(them.name)} …`;
    box.classList.toggle('won', r.done && r.winner === 'me');
    box.innerHTML = `<p class="qr-race-head">${head}</p><div class="qr-race-row">${player(tg.me, mine)}<span class="qr-vs">VS</span>${player(them, his)}</div>`
      + (r.done && r.winner === 'me' && r.bonus ? `<div class="qr-gain"><span class="big">+${fmt(r.bonus.sats)}${ico('coin', 'ico-in')}</span><span class="big xp">+${fmt(r.bonus.xp)} XP</span></div>` : '');
  }
  return {
    setRace,
    show({ mission, setup, summary, reward, team, together = null }) {
      tg = together;
      const ok = summary.result === 'success', o = summary.objective || { done: 0, total: 0 };
      const layout = mission.layouts?.find(l => l.id === setup?.layoutId), variant = layout?.variants.find(v => v.id === setup?.variantId);
      const r = QUEST_SATS[mission.id] || {}, kieser = summary.kieser || 0, videos = summary.videos || 0, fine = reward?.fine || 0, caught = summary.reason === 'caught';
      const gross = ok ? r.coin * (summary.score || 0) + r.base + r.done + (summary.alarmFree ? r.clean || 0 : 0) : 0; // Summe vor Moshes Videos (questResult): der Abzug greift nur bei Erfolg und nie unter 0
      const left = summary.leftBehind || 0; // K.o. neben der Plattform liegengelassen: je Kopf −1 Wertung (engine questSummary)
      el.style.backgroundImage = `url(art/bg-${THEME_BG[mission.theme] || 'menu'}.png)`;
      el.classList.toggle('won', ok);
      const clean = summary.alarmFree ? `nie ausgelöst${ok && QUEST_SATS[mission.id]?.clean ? ` · +${fmt(QUEST_SATS[mission.id].clean)} Bonus` : ''}` : 'ausgelöst';
      body.innerHTML = `
        <div class="qr-faces">${team.map((inst, i) => `<div class="frame r-${RARITY_BY_ID[inst.rarity] ? inst.rarity : 'normal'}" style="--d:${i * 120}ms"><img src="${spriteOf(inst.id)}" alt="${esc(defOf(inst.id)?.name || '')}"><span class="shine"></span></div>`).join('')}</div>
        <h2 class="qr-title">${ok ? 'Mission erfüllt!' : caught ? 'Erwischt!' : summary.result === 'abort' ? 'Abgebrochen' : 'Mission gescheitert'}</h2>
        <p class="qr-mission">${esc(mission.name)}${layout ? ` · ${esc(layout.name)}` : ''}${variant ? ` · ${esc(variant.name)}` : ''}${setup?.mirror ? ' · gespiegelt' : ''}</p>
        ${tg?.mode === 'coop' ? `<div class="qr-together">${player(tg.me)}<span class="qr-vs">Koop mit ${esc(tg.partner.name)}</span>${player(tg.partner)}</div>` : ''}
        ${tg?.mode === 'race' ? '<div class="qr-race panel"></div>' : ''}
        <div class="qr-card panel">
          <div class="qr-row"><span>${esc(mission.objective.label)}</span><b>${o.done}/${o.total}</b></div>
          <div class="qr-row"><span>Zeit</span><b>${clock(summary.timeMs || 0)}</b></div>
          <div class="qr-row"><span>Alarm</span><b>${clean}</b></div>
          ${r.kieser ? `<div class="qr-row"><span>Kieser-Training</span><b>${kieser ? `${kieser}×${ok ? ` · −${fmt(Math.min(kieser * r.kieser, r.base - r.min))}` : ''}` : 'keins'}</b></div>` : ''}
          ${r.video ? `<div class="qr-row${videos && ok ? ' fine' : ''}"><span>Moshes Videos</span><b>${videos ? `${videos}×${ok ? ` · −${fmt(Math.min(videos * r.video, gross))}` : ''}` : 'keine'}</b></div>` : ''}
          ${left ? `<div class="qr-row fine"><span>Liegengelassen</span><b>${left} · −${left} Wertung${ok && r.coin ? ` · −${fmt(left * r.coin)}` : ''}</b></div>` : ''}
          ${caught || fine ? `<div class="qr-row fine"><span>Strafe</span><b>−${fmt(fine)}${fine < (summary.fine || 0) ? ' (mehr war nicht da)' : ''}</b></div>` : ''}
          <div class="qr-row"><span>Bestwert</span><b>${reward ? `${bestText(mission, reward.best)}${reward.newBest ? ' · neu!' : ''}` : '–'}</b></div>
          <div class="qr-gain"><span class="big">+${fmt(reward?.sats || 0)}${ico('coin', 'ico-in')}</span>${fine ? `<span class="big fine">−${fmt(fine)}${ico('coin', 'ico-in')}</span>` : ''}<span class="big xp">+${fmt(reward?.xp || 0)} XP</span></div>
        </div>
        <p class="qr-text">${esc(summary.text || (ok ? mission.texts.success : mission.texts.fail))}</p>
        <button class="qr-done primary">${tg ? 'Zur Lobby' : 'Rückflug'}</button>`;
      if (tg?.race) setRace(tg.race);
    },
  };
}

// ---------- Rangliste ----------
// state = { now, online, leaderboard: [{ nickname, avatar, sats, dex, trophies, mastered, level, online, me }], feed: [{ at, nickname, kind, text }] } | null
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
        row.className = 'lb-row' + (p.me ? ' me' : ''); // per Online-Kennung, ein Namensvetter ist nicht ich
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
export function createProfileScreen({ el, onRename, onAvatar, onSettings, onShare, onExport, onImport, onReset, onRestore, hasBackup, onShop, onTogether }) {
  const $ = s => el.querySelector(s);
  const pick = $('.profile-avatar-pick');
  let save = null;
  $('.version').textContent = `Rüther GO ${VERSION}`;
  $('.go-shop').addEventListener('click', () => onShop?.());
  $('.go-together').addEventListener('click', () => onTogether?.()); // v11: Lobby „Zusammen spielen“
  // Im Browser findet sich niemand (js/lobby.js appOnly): nicht Bluetooth versprechen, sondern auf die App verweisen
  if (!globalThis.Capacitor?.isNativePlatform?.()) $('.go-together .sub').textContent = 'Über Internet mit Raumcode. Ohne Netz nur in der Android-App.'; // v13 §4.3
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
  $('.restore').addEventListener('click', async () => { // v13.1: Sicherung vom Zurücksetzen zurückholen
    const i = await popup({ title: 'Sicherung zurückholen?', html: '<p>Der gesicherte Spielstand von vor dem Zurücksetzen ersetzt den aktuellen.</p>', buttons: [{ label: 'Abbrechen' }, { label: 'Zurückholen', primary: true }] });
    if (i === 1) onRestore?.();
  });
  $('.reset').addEventListener('click', async () => {
    const i = await popup({ title: 'Spielstand löschen?', html: '<p>Alle Rüthers, Sats, Erfolge und dein Profil sind dann weg. Das lässt sich nicht rückgängig machen.</p>', buttons: [{ label: 'Abbrechen', primary: true }, { label: 'Löschen', danger: true }] });
    if (i === 1) onReset();
  });
  const settingsChanged = () => onSettings({ sound: $('.set-sound').checked, haptics: $('.set-haptics').checked, flight: $('.set-flight').checked });
  $('.set-sound').addEventListener('change', settingsChanged);
  $('.set-haptics').addEventListener('change', settingsChanged);
  $('.set-flight').addEventListener('change', settingsChanged);
  pick.addEventListener('click', e => {
    const b = e.target.closest('.avatar-opt');
    if (!b) return;
    onAvatar(b.dataset.id);
    pick.querySelectorAll('.avatar-opt').forEach(x => x.classList.toggle('active', x === b));
    $('.avatar').src = spriteOf(b.dataset.id);
  });

  function render(onlineId, available, nameTaken) {
    const p = save.profile || {};
    const leader = save.team.map(uid => save.box.find(i => i.uid === uid)).find(Boolean); // v13: 'moshe' im Team überspringen
    $('.profile-head .frame').className = `frame r-${leader?.rarity || 'normal'}`;
    $('.avatar').src = spriteOf(p.avatar);
    $('.nick').textContent = p.nickname || 'Trainer';
    const lp = levelProgress(save);
    $('.lvl').textContent = lp.level;
    $('.bar.xp .fill').style.width = `${Math.min(100, Math.round((lp.xp / lp.need) * 100))}%`;
    $('.xp-text').textContent = `${fmt(lp.xp)} / ${fmt(lp.need)} XP bis Lv. ${lp.level + 1}`;
    $('.online-id').textContent = onlineId ? `Online-ID ${onlineId} · ${nameTaken ? 'Name online vergeben, bitte umbenennen' : available ? 'verbunden' : 'offline'}` : 'Noch nicht online';
    const st = save.stats || {};
    const mastered = ARENAS.filter(a => save.arenaMastered?.[a.id]).length; // v12: ohne Anzeige-Arena
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
    $('.set-flight').checked = !!save.settings?.flight;
    pick.innerHTML = avatarGrid(p.avatar);
  }
  return { show(s, { onlineId = '', available = false, nameTaken = false } = {}) { save = s; render(onlineId, available, nameTaken); $('.restore').classList.toggle('hidden', !hasBackup?.()); } };
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
