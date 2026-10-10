import { CONST } from './data.js';
import { fighterStats, arenaScale } from './progress.js';

// Echtzeit-Engine. tick() mutiert den State und liefert Events für die Animationen.

const freshStatus = () => ({ poison: null, stunUntil: 0, weakenedUntil: 0 });

// inst: Exemplar { uid, rarity, level } oder undefined (Normal, Level 1)
export function makeFighter(def, inst) {
  const { btc, power } = fighterStats(def, inst);
  return {
    id: def.id, uid: inst?.uid || null, name: def.name, rarity: inst?.rarity || 'normal', level: inst?.level || 1,
    btc, maxBtc: btc, power, attacks: def.attacks, energy: 0, used: {}, status: freshStatus(),
  };
}

export function makeBoss(def, arenaLevel = 1) {
  const scale = arenaScale(arenaLevel);
  const dmg = n => Math.floor(n * scale);
  const btc = Math.floor(def.btc * scale);
  return {
    id: def.id, name: def.name, btc, maxBtc: btc, arenaLevel, rage: false,
    fast: { ...def.fast, damage: dmg(def.fast.damage) },
    charged: def.charged.map(c => ({ ...c, damage: dmg(c.damage) })),
    chargedIndex: 0, fastEvery: def.fast.every, chargedEvery: CONST.CHARGED_EVERY,
    nextFastAt: def.fast.every, nextChargedAt: CONST.CHARGED_EVERY, warning: null,
    status: freshStatus(),
  };
}

export function createBattle({ team, enemy, rng = Math.random, duration = CONST.BATTLE_DURATION }) {
  return {
    team: structuredClone(team), active: 0, enemy: structuredClone(enemy),
    time: 0, duration, summons: [], enemySummons: [], tapCooldown: 0, over: false, won: null, reason: null, rng,
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
  const dealt = atk.damage > 0 ? hurt(e, atk.damage * me.power) : 0;
  ev.push({ type: 'special', attack: atk, damage: dealt, fighter: me });
  if (atk.poison) { poison(e, atk.poison, s.time); ev.push({ type: 'poisoned', target: 'enemy', ms: atk.poison.ms }); }
  if (atk.stun) stunEnemy(s, atk.stun, ev);
  if (atk.weaken) { e.status.weakenedUntil = s.time + atk.weaken; ev.push({ type: 'weaken', ms: atk.weaken }); }
  if (atk.drain && dealt > 0) ev.push({ type: 'heal', target: 'me', amount: heal(me, dealt) });
  if (atk.heal) ev.push({ type: 'heal', target: 'me', amount: heal(me, atk.heal) });
  if (atk.summon) {
    s.summons = atk.summon.map(x => ({ id: x.id, name: x.name, damage: x.damage, power: me.power, nextAt: s.time + CONST.SUMMON_INTERVAL, until: s.time + atk.summonMs }));
    ev.push({ type: 'summoned', names: atk.summon.map(x => x.name), ids: atk.summon.map(x => x.id), ms: atk.summonMs });
  }
}

function resolveEnemyAttack(s, me, ev) {
  const e = s.enemy, w = e.warning, atk = w.attack;
  let factor = 1;
  if (e.status.weakenedUntil > s.time) factor *= CONST.WEAKEN_FACTOR;
  if (w.dodged) factor *= CONST.DODGE_FACTOR;
  const dealt = atk.damage > 0 ? hurt(me, atk.damage * factor) : 0;
  ev.push({ type: 'enemyAttack', kind: w.kind, attack: atk, damage: dealt, dodged: w.dodged, fighter: me }); // fighter: KO-Wechsel im selben Schritt steht schon in s.active
  if (!w.dodged) {
    if (atk.poison) { poison(me, atk.poison, s.time); ev.push({ type: 'poisoned', target: 'me', ms: atk.poison.ms }); }
    if (atk.stun) { me.status.stunUntil = s.time + atk.stun; ev.push({ type: 'stun', target: 'me', ms: atk.stun }); }
  }
  if (atk.heal) ev.push({ type: 'heal', target: 'enemy', amount: heal(e, atk.heal) });
  if (atk.summon) { // Gegner-Helfer, Ausweichen hilft nicht
    s.enemySummons = atk.summon.map(x => ({ id: x.id, name: x.name, damage: x.damage, nextAt: s.time + CONST.SUMMON_INTERVAL, until: s.time + atk.summonMs }));
    ev.push({ type: 'enemySummoned', ids: atk.summon.map(x => x.id), names: atk.summon.map(x => x.name), ms: atk.summonMs });
  }
  e.warning = null;
  if (w.kind === 'fast') {
    e.nextFastAt = s.time + e.fastEvery;
  } else {
    e.nextChargedAt = s.time + e.chargedEvery;
    e.chargedIndex = (e.chargedIndex + 1) % e.charged.length;
    e.nextFastAt = Math.max(e.nextFastAt, s.time + 1000);
  }
}

function rageStep(s, ev) {
  const e = s.enemy;
  if (e.rage || !alive(e) || e.btc > CONST.RAGE_AT * e.maxBtc) return;
  e.rage = true;
  e.fastEvery = CONST.RAGE_FAST_EVERY;
  e.chargedEvery = CONST.RAGE_CHARGED_EVERY;
  e.nextFastAt = s.time + e.fastEvery;
  e.nextChargedAt = Math.min(e.nextChargedAt, s.time + e.chargedEvery);
  ev.push({ type: 'rage' });
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

// Spielzeit bis zur Warnung vor der nächsten Lade-Attacke, mindestens (0, solange sie läuft). Die UI lässt einen
// Gegner-Spruch nur kommen, wenn er bis dahin ausreden kann; sonst ersetzt ihn der Ausruf sofort (Spec v7 §2c).
export function msToChargedWarn(s) {
  const e = s.enemy;
  if (e.warning?.kind === 'charged') return 0;
  return Math.max(0, e.nextChargedAt - e.charged[e.chargedIndex].warn - s.time);
}

// Helfer schlagen alle SUMMON_INTERVAL auf target, abgelaufene fliegen raus
function helperStep(s, list, target, type, ev) {
  for (const su of list) {
    while (su.nextAt <= s.time && su.nextAt <= su.until) {
      ev.push({ type, id: su.id, name: su.name, damage: hurt(target, su.damage * (su.power || 1)) });
      su.nextAt += CONST.SUMMON_INTERVAL;
    }
  }
  return list.filter(su => su.nextAt <= su.until);
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

  const sw = input.switchTo;
  if (sw != null && sw !== s.active && s.team[sw] && alive(s.team[sw])) {
    s.active = sw; me = s.team[sw];
    ev.push({ type: 'switch', to: sw, fighter: me });
  }
  const meStunned = stunned(me, s.time);
  for (let i = 0; i < (input.taps || 0); i++) {
    if (meStunned) { ev.push({ type: 'stunnedTap' }); break; }
    if (s.tapCooldown > 0) break;
    const d = hurt(s.enemy, CONST.FAST_DAMAGE * me.power);
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

  s.summons = helperStep(s, s.summons, s.enemy, 'summon', ev);
  rageStep(s, ev);
  if (alive(s.enemy)) {
    enemyStep(s, me, ev);
    s.enemySummons = helperStep(s, s.enemySummons, me, 'enemySummon', ev); // enemySummonStep
  }
  poisonStep(s, me, 'me', ev, dt);
  poisonStep(s, s.enemy, 'enemy', ev, dt);

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
