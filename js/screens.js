import { CONST, RUETHERS, RUETHER_BY_ID } from './data.js';
import { playerAttack, playerSwitch } from './battle.js';

// ---------- Team ----------
// onChange(teamIds) bei jeder Änderung, onBack() beim Zurück.
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
    show(a, { distanceM, teamSize, beaten }) {
      arena = a;
      const boss = bosses[a.boss];
      el.querySelector('.arena-name').textContent = a.name;
      el.querySelector('.sprite').src = `sprites/${boss.id}.png`;
      el.querySelector('.boss-name').textContent = `Boss: ${boss.name} (${boss.btc} BTC)`;
      el.querySelector('.address').textContent = a.address;
      el.querySelector('.distance').textContent = distanceM == null ? 'Entfernung unbekannt (keine Ortung)' : `Entfernung: ${Math.round(distanceM)} m`;
      const inRange = distanceM != null && distanceM < CONST.ARENA_RANGE;
      let status = '';
      if (beaten) status = 'Bereits besiegt. Nochmal?';
      else if (!inRange) status = `Du musst näher als ${CONST.ARENA_RANGE} m ran.`;
      else if (teamSize === 0) status = 'Du brauchst mindestens einen Rüther im Team.';
      el.querySelector('.status').textContent = status;
      fight.disabled = !(inRange && teamSize > 0);
    },
  };
}

// ---------- Kampf ----------
const statusText = f => [
  f.status.poison ? '☠ Gift' : '',
  f.status.weakened > 0 ? '↓ geschwächt' : '',
  f.status.skip ? '⏸ setzt aus' : '',
].filter(Boolean).join(' · ');

// onEnd(won) wenn der Spieler nach Kampfende auf Weiter tippt.
export function createBattleScreen({ el, onEnd }) {
  const enemyEl = el.querySelector('.enemy');
  const meEl = el.querySelector('.me');
  const log = el.querySelector('.log');
  const actions = el.querySelector('.actions');
  const sw = el.querySelector('.switch');
  let state = null;

  function panel(p, f, summons) {
    p.querySelector('.sprite').src = `sprites/${f.id}.png`;
    p.querySelector('.fname').textContent = f.name;
    const pct = Math.max(0, Math.round((f.btc / f.maxBtc) * 100));
    const fill = p.querySelector('.fill');
    fill.style.width = pct + '%';
    fill.classList.toggle('low', pct <= 25);
    p.querySelector('.btc').textContent = `${f.btc} / ${f.maxBtc} BTC`;
    p.querySelector('.status').textContent = [statusText(f), summons && summons.length ? `👥 ${summons.map(s => s.name).join(', ')}` : ''].filter(Boolean).join(' · ');
  }

  function render() {
    panel(enemyEl, state.enemy, null);
    panel(meEl, state.team[state.active], state.summons);
    log.innerHTML = state.log.map(l => `<div>${l}</div>`).join('');
    log.scrollTop = log.scrollHeight;
    sw.classList.add('hidden');
    actions.innerHTML = '';
    if (state.over) {
      const b = document.createElement('button');
      b.className = 'primary';
      b.textContent = state.won ? 'Gewonnen! Weiter' : 'Verloren. Zurück';
      b.addEventListener('click', () => onEnd(state.won));
      actions.appendChild(b);
      return;
    }
    const me = state.team[state.active];
    if (me.status.skip) {
      const b = document.createElement('button');
      b.textContent = `${me.name} setzt aus...`;
      b.addEventListener('click', () => { state = playerAttack(state, 0); render(); });
      actions.appendChild(b);
    } else {
      me.attacks.forEach((a, i) => {
        const b = document.createElement('button');
        b.textContent = a.damage > 0 ? `${a.name} (${a.damage})` : a.name;
        b.addEventListener('click', () => { state = playerAttack(state, i); render(); });
        actions.appendChild(b);
      });
    }
    const others = state.team.map((f, i) => ({ f, i })).filter(x => x.i !== state.active && x.f.btc > 0);
    if (others.length) {
      const b = document.createElement('button');
      b.textContent = 'Wechseln';
      b.addEventListener('click', () => {
        sw.innerHTML = '';
        for (const { f, i } of others) {
          const o = document.createElement('button');
          o.textContent = `${f.name} (${f.btc} BTC)`;
          o.addEventListener('click', () => { state = playerSwitch(state, i); render(); });
          sw.appendChild(o);
        }
        sw.classList.remove('hidden');
      });
      actions.appendChild(b);
    }
  }

  return { start(battleState) { state = battleState; render(); } };
}

// ---------- Sieg ----------
export function createVictoryScreen({ el, onBack }) {
  el.querySelector('.back').addEventListener('click', onBack);
  return {};
}
