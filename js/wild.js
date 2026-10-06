import { CONST } from './data.js';
import { fighterStats } from './progress.js';
import { makeBoss } from './battle.js';

// Wildkampf (Spec §2): der wilde Rüther wird als Boss mit seinen eigenen Attacken gebaut. Rein.
export function wildBossDef(def, inst) {
  const { btc, power } = fighterStats(def, inst);
  const ownerId = def.id;
  return {
    id: def.id, name: def.name,
    btc: Math.round(btc * CONST.WILD_HP_MULT),
    fast: { name: 'Rempler', damage: Math.round(CONST.WILD_FAST_DAMAGE * power), every: CONST.WILD_FAST_EVERY, warn: 600, fx: 'wild-fast', prop: null, ownerId },
    charged: def.attacks.map(a => {
      const c = {
        name: a.name, warn: 1200, fx: 'wild', prop: a.prop, ownerId,
        damage: a.summon ? Math.floor(18 * power) : Math.floor(a.damage * CONST.WILD_CHARGED_MULT * power),
      };
      if (a.poison) c.poison = { perSec: a.poison.perSec, ms: Math.round(a.poison.ms * 0.75) };
      if (a.stun) c.stun = Math.min(a.stun, 2000);
      if (a.heal) c.heal = Math.round(a.heal * power * 0.6);
      if (a.flavour) c.flavour = a.flavour;
      return c;
    }),
  };
}

export function makeWild(def, inst) {
  return { ...makeBoss(wildBossDef(def, inst), 1), wild: true, rarity: inst?.rarity || 'normal', level: inst?.level || 1 };
}
