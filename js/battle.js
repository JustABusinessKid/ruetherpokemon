import { CONST } from './data.js';

// Echtzeit-Engine. tick() mutiert den State und liefert Events für die Animationen.

const freshStatus = () => ({ poison: null, stunUntil: 0, weakenedUntil: 0 });

export function makeFighter(def, bonusBtc = 0) {
  const max = def.btc + bonusBtc;
  return { id: def.id, name: def.name, btc: max, maxBtc: max, attacks: def.attacks, energy: 0, used: {}, status: freshStatus() };
}

export function makeBoss(def) {
  return {
    id: def.id, name: def.name, btc: def.btc, maxBtc: def.btc,
    fast: def.fast, charged: def.charged, chargedIndex: 0,
    nextFastAt: def.fast.every, nextChargedAt: CONST.CHARGED_EVERY, warning: null,
    status: freshStatus(),
  };
}

export function createBattle({ team, enemy, rng = Math.random, duration = CONST.BATTLE_DURATION }) {
  return {
    team: structuredClone(team), active: 0, enemy: structuredClone(enemy),
    time: 0, duration, summons: [], tapCooldown: 0, over: false, won: null, reason: null, rng,
  };
}

const alive = f => f.btc > 0;
const stunned = (f, t) => f.status.stunUntil > t;

function heal(f, n) { const h = Math.max(0, Math.min(n, f.maxBtc - f.btc)); f.btc += h; return h; }
function hurt(f, n) { const d = Math.max(0, Math.min(Math.floor(n), f.btc)); f.btc -= d; return d; }
function poison(f, p, t) { f.status.poison = { perSec: p.perSec, until: t + p.ms, acc: 0 }; }

function stunEnemy(s, ms, ev) {
  const e = s.enemy;
  e.status.stunUntil = s.time + ms;
  e.warning = null;
  e.nextFastAt = Math.max(e.nextFastAt, e.status.stunUntil + CONST.STUN_GRACE);
  e.nextChargedAt = Math.max(e.nextChargedAt, e.status.stunUntil + CONST.STUN_GRACE);
  ev.push({ type: 'stun', target: 'enemy', ms });
}

function applySpecial(s, me, atk, ev) {
  const e = s.enemy;
  const dealt = atk.damage > 0 ? hurt(e, atk.damage) : 0;
  ev.push({ type: 'special', attack: atk, damage: dealt });
  if (atk.poison) { poison(e, atk.poison, s.time); ev.push({ type: 'poisoned', target: 'enemy', ms: atk.poison.ms }); }
  if (atk.stun) stunEnemy(s, atk.stun, ev);
  if (atk.weaken) { e.status.weakenedUntil = s.time + atk.weaken; ev.push({ type: 'weaken', ms: atk.weaken }); }
  if (atk.drain && dealt > 0) ev.push({ type: 'heal', target: 'me', amount: heal(me, dealt) });
  if (atk.heal) ev.push({ type: 'heal', target: 'me', amount: heal(me, atk.heal) });
  if (atk.summon) {
    s.summons = atk.summon.map(x => ({ id: x.id, name: x.name, damage: x.damage, nextAt: s.time + CONST.SUMMON_INTERVAL, until: s.time + atk.summonMs }));
    ev.push({ type: 'summoned', names: atk.summon.map(x => x.name), ids: atk.summon.map(x => x.id), ms: atk.summonMs });
  }
}

function resolveEnemyAttack(s, me, ev) {
  const e = s.enemy, w = e.warning, atk = w.attack;
  let factor = 1;
  if (e.status.weakenedUntil > s.time) factor *= CONST.WEAKEN_FACTOR;
  if (w.dodged) factor *= CONST.DODGE_FACTOR;
  const dealt = atk.damage > 0 ? hurt(me, atk.damage * factor) : 0;
  ev.push({ type: 'enemyAttack', kind: w.kind, attack: atk, damage: dealt, dodged: w.dodged });
  if (!w.dodged) {
    if (atk.poison) { poison(me, atk.poison, s.time); ev.push({ type: 'poisoned', target: 'me', ms: atk.poison.ms }); }
    if (atk.stun) { me.status.stunUntil = s.time + atk.stun; ev.push({ type: 'stun', target: 'me', ms: atk.stun }); }
  }
  if (atk.heal) ev.push({ type: 'heal', target: 'enemy', amount: heal(e, atk.heal) });
  e.warning = null;
  if (w.kind === 'fast') {
    e.nextFastAt = s.time + e.fast.every;
  } else {
    e.nextChargedAt = s.time + CONST.CHARGED_EVERY;
    e.chargedIndex = (e.chargedIndex + 1) % e.charged.length;
    e.nextFastAt = Math.max(e.nextFastAt, s.time + 1000);
  }
}

function enemyStep(s, me, ev) {
  const e = s.enemy;
  if (stunned(e, s.time)) return;
  if (!e.warning) {
    const chargedFirst = e.nextChargedAt <= e.nextFastAt;
    const kind = chargedFirst ? 'charged' : 'fast';
    const attack = chargedFirst ? e.charged[e.chargedIndex] : e.fast;
    const dueAt = chargedFirst ? e.nextChargedAt : e.nextFastAt;
    if (s.time >= dueAt - attack.warn) {
      e.warning = { kind, attack, firesAt: Math.max(dueAt, s.time + attack.warn), dodged: false };
      ev.push({ type: 'warn', kind, attack, ms: e.warning.firesAt - s.time });
    }
  }
  if (e.warning && s.time >= e.warning.firesAt) resolveEnemyAttack(s, me, ev);
}

function summonStep(s, ev) {
  for (const su of s.summons) {
    while (su.nextAt <= s.time && su.nextAt <= su.until) {
      ev.push({ type: 'summon', id: su.id, name: su.name, damage: hurt(s.enemy, su.damage) });
      su.nextAt += CONST.SUMMON_INTERVAL;
    }
  }
  s.summons = s.summons.filter(su => su.nextAt <= su.until);
}

function poisonStep(s, f, who, ev, dt) {
  const p = f.status.poison;
  if (!p) return;
  p.acc += dt;
  while (p.acc >= 1000 && alive(f)) {
    p.acc -= 1000;
    ev.push({ type: 'poison', target: who, damage: hurt(f, p.perSec) });
  }
  if (s.time >= p.until) f.status.poison = null;
}

function finish(s, won, reason, ev) {
  s.over = true; s.won = won; s.reason = reason;
  ev.push(won ? { type: 'win' } : { type: 'lose', reason });
  return ev;
}

// input: { taps?: n, dodge?: bool, special?: index, switchTo?: index }
export function tick(s, dt, input = {}) {
  const ev = [];
  if (s.over) return ev;
  s.time += dt;
  s.tapCooldown = Math.max(0, s.tapCooldown - dt);
  let me = s.team[s.active];

  // 2. Eingabe
  const sw = input.switchTo;
  if (sw != null && sw !== s.active && s.team[sw] && alive(s.team[sw])) {
    s.active = sw; me = s.team[sw];
    ev.push({ type: 'switch', to: sw, fighter: me });
  }
  const meStunned = stunned(me, s.time);
  for (let i = 0; i < (input.taps || 0); i++) {
    if (meStunned) { ev.push({ type: 'stunnedTap' }); break; }
    if (s.tapCooldown > 0) break;
    const d = hurt(s.enemy, CONST.FAST_DAMAGE);
    me.energy = Math.min(CONST.MAX_ENERGY, me.energy + CONST.FAST_ENERGY);
    s.tapCooldown = CONST.FAST_COOLDOWN;
    ev.push({ type: 'fast', damage: d });
  }
  if (input.dodge && s.enemy.warning && !s.enemy.warning.dodged) {
    s.enemy.warning.dodged = true;
    ev.push({ type: 'dodge' });
  }
  if (input.special != null) {
    const atk = me.attacks[input.special];
    if (atk && !meStunned && me.energy >= atk.cost && !(atk.once && me.used[atk.name])) {
      me.energy -= atk.cost;
      if (atk.once) me.used[atk.name] = true;
      applySpecial(s, me, atk, ev);
    } else {
      ev.push({ type: 'specialDenied', index: input.special });
    }
  }

  // 3.–5.
  summonStep(s, ev);
  if (alive(s.enemy)) enemyStep(s, me, ev);
  poisonStep(s, me, 'me', ev, dt);
  poisonStep(s, s.enemy, 'enemy', ev, dt);

  // 6. Ausgang
  if (!alive(s.enemy)) return finish(s, true, 'ko', ev);
  if (!alive(me)) {
    ev.push({ type: 'faint', fighter: me });
    const next = s.team.findIndex(alive);
    if (next === -1) return finish(s, false, 'wiped', ev);
    s.active = next;
    ev.push({ type: 'switch', to: next, fighter: s.team[next] });
  }
  if (s.time >= s.duration) return finish(s, false, 'timeout', ev);
  return ev;
}
