import { CONST } from './data.js';

export function makeFighter(def, bonusBtc = 0) {
  const max = def.btc + bonusBtc;
  return {
    id: def.id,
    name: def.name,
    btc: max,
    maxBtc: max,
    attacks: def.attacks,
    status: { poison: null, skip: false, weakened: 0 },
    used: {},
  };
}

export function createBattle({ team, enemy, rng = Math.random }) {
  return {
    team: structuredClone(team),
    active: 0,
    enemy: structuredClone(enemy),
    turn: 1,
    summons: [],
    log: [],
    over: false,
    won: null,
    playerSkipped: false,
    rng,
  };
}

function cloneState(state) {
  const { rng, ...rest } = state;
  return { ...structuredClone(rest), rng, log: [] };
}

function heal(f, amount, log, verb) {
  const h = Math.max(0, Math.min(amount, f.maxBtc - f.btc));
  f.btc += h;
  log.push(`${f.name} ${verb} ${h} BTC.`);
}

function resolveAttack(s, attacker, target, attack) {
  const log = s.log;
  const needsRoll = attack.damage > 0 && !attack.alwaysHit;
  if (needsRoll && s.rng() >= CONST.HIT_CHANCE) {
    log.push(`${attacker.name} setzt ${attack.name} ein... und verfehlt!`);
    return;
  }
  if (attack.once && attacker.used[attack.name]) {
    log.push('Die Familie ist schon da.');
    return;
  }
  if (attack.once) attacker.used[attack.name] = true;

  let dealt = 0;
  if (attack.damage > 0) {
    dealt = Math.floor(attack.damage * (attacker.status.weakened > 0 ? 0.75 : 1));
    target.btc = Math.max(0, target.btc - dealt);
    log.push(`${attacker.name} setzt ${attack.name} ein! ${dealt} BTC Schaden.`);
  } else {
    log.push(`${attacker.name} setzt ${attack.name} ein!`);
  }
  if (attack.flavour) log.push(`"${attack.flavour}"`);
  if (attack.summon) {
    s.summons = attack.summon.map(x => ({ ...x, turns: CONST.SUMMON_TURNS }));
    log.push(`${attack.summon.map(x => x.name).join(' und ')} eilen herbei!`);
  }
  if (attack.weaken) { target.status.weakened = attack.weaken; log.push(`${target.name} ist geschwächt.`); }
  if (attack.poison) { target.status.poison = { ...attack.poison }; log.push(`${target.name} ist vergiftet.`); }
  if (attack.skip) { target.status.skip = true; log.push(`${target.name} muss aussetzen.`); }
  if (attack.drain && dealt > 0) heal(attacker, dealt, log, 'schreibt sich gut:');
  if (attack.heal) heal(attacker, attack.heal, log, 'heilt sich um');
}

function chooseEnemyAttack(s) {
  const e = s.enemy;
  const candidates = e.attacks.filter(a =>
    !(a.everyN && s.turn % a.everyN !== 0) &&
    !(a.heal && e.btc >= 0.5 * e.maxBtc) &&
    !(a.skip && s.playerSkipped)); // keine Aussetz-Schleife
  return candidates[Math.floor(s.rng() * candidates.length)];
}

function tickStatus(f, log) {
  if (f.status.poison) {
    f.btc = Math.max(0, f.btc - f.status.poison.perTurn);
    log.push(`${f.name} verliert ${f.status.poison.perTurn} BTC durch Gift.`);
    f.status.poison.turns -= 1;
    if (f.status.poison.turns <= 0) f.status.poison = null;
  }
  if (f.status.weakened > 0) f.status.weakened -= 1;
}

function end(s, won) {
  s.over = true;
  s.won = won;
  s.log.push(won ? `${s.enemy.name} ist pleite! Gewonnen!` : 'Alle Rüthers sind pleite. Verloren.');
  return s;
}

function finishRound(s) {
  // 2. Herbeigerufene greifen an
  for (const su of s.summons) {
    s.enemy.btc = Math.max(0, s.enemy.btc - su.damage);
    s.log.push(`${su.name} greift an! ${su.damage} BTC Schaden.`);
    su.turns -= 1;
  }
  s.summons = s.summons.filter(x => x.turns > 0);
  // 3. Gegner schon pleite?
  if (s.enemy.btc <= 0) return end(s, true);
  // 4. Gegner-Aktion
  const me = s.team[s.active];
  if (s.enemy.status.skip) {
    s.enemy.status.skip = false;
    s.log.push(`${s.enemy.name} setzt aus.`);
  } else {
    resolveAttack(s, s.enemy, me, chooseEnemyAttack(s));
  }
  // 5. Gift und Schwächung ticken
  tickStatus(me, s.log);
  tickStatus(s.enemy, s.log);
  // 6. Ausgang
  if (s.enemy.btc <= 0) return end(s, true);
  if (me.btc <= 0) {
    const next = s.team.findIndex(f => f.btc > 0);
    if (next === -1) return end(s, false);
    s.log.push(`${me.name} ist pleite! ${s.team[next].name}, du bist dran!`);
    s.active = next;
  }
  s.turn += 1;
  return s;
}

// Führt eine komplette Runde aus. Gibt neuen State zurück.
export function playerAttack(state, attackIndex) {
  if (state.over) return state;
  const s = cloneState(state);
  const me = s.team[s.active];
  s.playerSkipped = me.status.skip;
  if (me.status.skip) {
    me.status.skip = false;
    s.log.push(`${me.name} setzt aus.`);
  } else {
    resolveAttack(s, me, s.enemy, me.attacks[attackIndex]);
  }
  return finishRound(s);
}

// Wechsel des aktiven Rüthers, kostet die Runde.
export function playerSwitch(state, teamIndex) {
  if (state.over) return state;
  if (teamIndex === state.active || !state.team[teamIndex] || state.team[teamIndex].btc <= 0) {
    throw new Error('Ungültiger Wechsel');
  }
  const s = cloneState(state);
  s.playerSkipped = false;
  s.active = teamIndex;
  s.log.push(`${s.team[teamIndex].name}, du bist dran!`);
  return finishRound(s);
}
