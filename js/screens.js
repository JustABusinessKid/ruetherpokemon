import { CONST, RUETHERS } from './data.js';

// ---------- Team ----------
export function createTeamScreen({ el, onChange, onBack }) {
  const slots = el.querySelector('.slots');
  el.querySelector('.back').addEventListener('click', onBack);
  let save = null;

  function render() {
    slots.innerHTML = '';
    for (const r of RUETHERS) {
      const c = save.caught[r.id];
      const div = document.createElement('div');
      const idx = save.team.indexOf(r.id);
      div.className = 'slot' + (c ? '' : ' unknown') + (idx >= 0 ? ' in-team' : '');
      div.innerHTML = `
        ${idx >= 0 ? `<div class="order">${idx + 1}</div>` : ''}
        <img src="sprites/${c ? r.id : 'unknown'}.png" alt="">
        <div><strong>${c ? r.name : '???'}</strong></div>
        <div class="sub">${c ? r.title : 'Noch nicht gefangen'}</div>
        <div class="sub">${c ? `${r.btc + c.bonusBtc} BTC · ${c.count}× gefangen` : ''}</div>`;
      if (c) div.addEventListener('click', () => toggle(r.id));
      slots.appendChild(div);
    }
  }
  function toggle(id) {
    const i = save.team.indexOf(id);
    if (i >= 0) save.team.splice(i, 1);
    else if (save.team.length < CONST.TEAM_SIZE) save.team.push(id);
    onChange(save.team);
    render();
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
    show(a, { distanceM, teamSize, beaten, ownerName }) {
      arena = a;
      const boss = bosses[a.boss];
      el.querySelector('.arena-name').textContent = a.name;
      el.querySelector('.sprite').src = `sprites/${boss.id}.png`;
      el.querySelector('.boss-name').textContent = `Boss: ${boss.name} (${boss.btc} BTC)`;
      el.querySelector('.address').textContent = a.address;
      el.querySelector('.distance').textContent = distanceM == null ? 'Entfernung unbekannt (keine Ortung)' : `Entfernung: ${Math.round(distanceM)} m`;
      el.querySelector('.owner').textContent = ownerName ? `🏆 Besitzer: ${ownerName}` : 'Noch niemand hat diese Arena erobert.';
      const inRange = distanceM != null && distanceM < CONST.ARENA_RANGE;
      let status = '';
      if (beaten) status = 'Bereits erobert. Nochmal kämpfen?';
      else if (!inRange) status = `Du musst näher als ${CONST.ARENA_RANGE} m ran.`;
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
