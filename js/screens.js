import { CONST, RUETHERS, RUETHER_BY_ID, RARITIES, RARITY_BY_ID, SHOP } from './data.js';
import { fighterStats, levelCost, DEX_TOTAL, dexCount, arenaReward } from './progress.js';

const fmt = n => n.toLocaleString('de-DE');
const rarityRank = id => RARITIES.findIndex(r => r.id === id);

// ---------- Sammlung ----------
// onTeamChange(teamUids); onPowerUp(uid) -> { ok, reason, level }; onDex(); onBack()
export function createCollectionScreen({ el, onTeamChange, onPowerUp, onDex, onBack }) {
  const box = el.querySelector('.box');
  el.querySelector('.back').addEventListener('click', onBack);
  el.querySelector('.dex-btn').addEventListener('click', onDex);
  let save = null;

  function card(inst) {
    const def = RUETHER_BY_ID[inst.id], r = RARITY_BY_ID[inst.rarity], st = fighterStats(def, inst);
    const idx = save.team.indexOf(inst.uid), cost = levelCost(inst.level);
    const div = document.createElement('div');
    div.className = `card r-${inst.rarity}` + (idx >= 0 ? ' in-team' : '');
    div.dataset.uid = inst.uid;
    div.innerHTML = `
      ${idx >= 0 ? `<div class="order">${idx + 1}</div>` : ''}
      <div class="frame r-${inst.rarity}"><img src="sprites/${inst.id}.png" alt=""><span class="shine"></span></div>
      <div class="meta">
        <div class="cname">${def.name} <span class="rar">${r.name}</span></div>
        <div class="sub">Lv. ${inst.level} · ${st.btc} BTC · Power ×${st.power.toFixed(2)}</div>
        <div class="actions">
          <button class="team-btn" ${idx < 0 && save.team.length >= CONST.TEAM_SIZE ? 'disabled' : ''}>${idx >= 0 ? 'Aus dem Team' : 'Ins Team'}</button>
          <button class="power-btn" ${cost == null || save.sats < cost ? 'disabled' : ''}>${cost == null ? 'Max. Level' : `⬆ ${fmt(cost)} 💰`}</button>
        </div>
      </div>`;
    div.querySelector('.team-btn').addEventListener('click', () => toggleTeam(inst.uid));
    div.querySelector('.power-btn').addEventListener('click', () => {
      const res = onPowerUp(inst.uid);
      if (!res.ok) return;
      render();
      const c = box.querySelector(`[data-uid="${inst.uid}"]`);
      if (c) { // Spec §2: Sprite leuchtet, Sterne steigen auf, Levelzahl springt; nach 1,2 s alles wieder weg
        c.classList.add('level-up');
        c.querySelector('.cname').insertAdjacentHTML('beforeend', `<span class="lvl-pop">Lv. ${res.level}!</span>`);
        c.querySelector('.frame').insertAdjacentHTML('beforeend', Array.from({ length: 7 }, (_, i) =>
          `<span class="lvl-star" style="--x:${8 + Math.round(Math.random() * 50)}px;--d:${(i * 0.06).toFixed(2)}s">★</span>`).join(''));
        setTimeout(() => { c.classList.remove('level-up'); c.querySelectorAll('.lvl-pop, .lvl-star').forEach(n => n.remove()); }, 1200);
      }
    });
    return div;
  }
  function render() {
    box.innerHTML = '';
    if (!save.box.length) { box.innerHTML = '<p class="empty">Noch keine Rüthers gefangen. Raus auf die Karte!</p>'; return; }
    for (const def of RUETHERS) {
      const mine = save.box.filter(i => i.id === def.id)
        .sort((a, b) => rarityRank(b.rarity) - rarityRank(a.rarity) || b.level - a.level);
      if (!mine.length) continue;
      const h = document.createElement('h3');
      h.textContent = `${def.name} (${mine.length})`;
      box.appendChild(h);
      for (const inst of mine) box.appendChild(card(inst));
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
    el.querySelector('.shop-sats').textContent = `💰 ${fmt(save.sats)}`;
    list.innerHTML = '';
    for (const item of SHOP) {
      const owned = item.id === 'supercoin'
        ? `Im Besitz: ${save.items.supercoin || 0}`
        : (save.lureUntil > Date.now() ? '🧲 Gerade aktiv (Kauf verlängert)' : '');
      const div = document.createElement('div');
      div.className = 'shop-item';
      div.innerHTML = `
        <div class="icon">${item.icon}</div>
        <div class="meta"><div class="iname">${item.name}</div><div class="sub">${item.desc}</div><div class="sub owned">${owned}</div></div>
        <button class="buy primary" ${save.sats < item.cost ? 'disabled' : ''}>${fmt(item.cost)} 💰</button>`;
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
export function createArenaScreen({ el, bosses, onFight, onBack }) {
  el.querySelector('.back').addEventListener('click', onBack);
  const fight = el.querySelector('.fight');
  let arena = null;
  fight.addEventListener('click', () => onFight(arena));
  return {
    show(a, { distanceM, teamSize, level, mastered, ownerName, bossBtc }) {
      arena = a;
      const boss = bosses[a.boss];
      el.querySelector('.arena-name').textContent = a.name;
      el.querySelector('.sprite').src = `sprites/${boss.id}.png`;
      el.querySelector('.boss-name').textContent = `Boss: ${boss.name} (${bossBtc} BTC)`;
      el.querySelector('.level').textContent = mastered ? '👑 Arena gemeistert (Lv. 5)' : `Arena Lv. ${level} von ${CONST.ARENA_LEVELS}`;
      el.querySelector('.address').textContent = a.address;
      el.querySelector('.distance').textContent = distanceM == null ? 'Entfernung unbekannt (keine Ortung)' : `Entfernung: ${Math.round(distanceM)} m`;
      el.querySelector('.owner').textContent = ownerName ? `🏆 Besitzer: ${ownerName}` : 'Noch niemand hat diese Arena erobert.';
      el.querySelector('.reward').textContent = `Belohnung: ${fmt(arenaReward(level))} 💰`;
      const inRange = distanceM != null && distanceM < CONST.ARENA_RANGE;
      let status = '';
      if (!inRange) status = `Du musst näher als ${CONST.ARENA_RANGE} m ran.`;
      else if (teamSize === 0) status = 'Du brauchst mindestens einen Rüther im Team.';
      el.querySelector('.status').textContent = status;
      fight.disabled = !(inRange && teamSize > 0);
    },
  };
}

// ---------- Sieg ----------
export function createVictoryScreen({ el, onBack }) {
  el.querySelector('.back').addEventListener('click', onBack);
  return {};
}
