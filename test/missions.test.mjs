import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findPath, lineOfSight } from '../js/quest/path.js';
import { MISSIONS, MISSION_BY_ID, pickSetup, buildSetup, pickVariant } from '../js/quest/missions.js';

// Missionsdaten v9 (Spec §2, §3, §4): jedes Layout × jede Variante × gespiegelt/ungespiegelt muss lösbar und fair sein.
const rngOf = s => () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
const GOAL = { steal: 'C', sabotage: 'S', fetch: 'X', unplug: 'K', valve: 'V', ignite: 'B' };
const WALK = '.DPX~', OPAQUE = '#LCSK~BT'; // V und W lassen hier Sicht durch: strenger für die Plattform-Prüfung
// Sichtweite und halber Kegel je Typ (Bernd koffeiniert: Sicht ×1,3, Kegel ×1,2)
const SIGHT = { pinguin: 5, drohne: 7, goebbels: 5, himmler: 4, detektiv: 6, bernd: 8, camper: 5, dackel: 3, platzwart: 6, ranger: 8, berater: 6, moshe: 8 };
const HALF = { pinguin: 45, drohne: 30, goebbels: 50, himmler: 70, detektiv: 40, bernd: 60, camper: 45, dackel: 60, platzwart: 35, ranger: 25, berater: 35, moshe: 42 };
const angle = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
const turn = (a, b) => ((b - a) % 360 + 540) % 360 - 180; // kürzester Bogen von a nach b in Grad

// Alle Lagen einer Wache auf Dauer, wie die Engine sie läuft: [Kachel, Blick von, Blick bis] (Drehen überstreicht den Bogen)
function watchPoses(g, e, tag) {
  const out = [];
  let pos = e.at, dir = e.dir ?? 0;
  const walkTo = to => {
    const path = findPath(g.w, g.h, g.closed, ...pos, to[0], to[1]);
    assert.ok(path, `${tag}: kommt nicht zu ${to}`);
    for (const t of path) { const p = [t.x, t.y]; dir = angle(pos, p); out.push([pos, dir, dir], [p, dir, dir]); pos = p; }
  };
  out.push([pos, dir, dir]);
  const pat = e.patrol || [];
  if (pat.length > 1) {
    for (let k = 0; k <= pat.length; k++) {
      const wp = pat[k % pat.length];
      walkTo(wp);
      if (wp[2] && wp[3] != null) { out.push([pos, dir, wp[3]]); dir = wp[3]; }
    }
  } else {
    if (pat.length) walkTo(pat[0]);
    const dirs = e.look?.length ? e.look : [pat[0]?.[3] ?? e.dir ?? 0];
    out.push([pos, dir, dirs[1 % dirs.length]]);
    dirs.forEach((d, i) => out.push([pos, d, dirs[(i + 1) % dirs.length]]));
  }
  return out;
}
// Sieht die Wache in dieser Lage eine Plattformkachel? (10° Rand, halbe Kachel mehr Sicht)
function seesPad(g, pads, type, [p, a0, a1]) {
  const span = turn(a0, a1), half = HALF[type] + 10, lo = Math.min(0, span) - half, hi = Math.max(0, span) + half;
  return pads.find(q => {
    if (Math.hypot(q[0] - p[0], q[1] - p[1]) > SIGHT[type] + 0.5) return false;
    const t = turn(a0, angle(p, q));
    if (Math.abs(span) < 179 && ![t, t - 360, t + 360].some(x => x >= lo && x <= hi)) return false;
    return lineOfSight(g.blk, p[0] + 0.5, p[1] + 0.5, q[0] + 0.5, q[1] + 0.5);
  });
}

const all = () => MISSIONS.flatMap(m => m.layouts.flatMap(l => l.variants.flatMap(v => [false, true].map(mirror => ({ m, l, v, mirror })))));
const grid = s => {
  const h = s.map.length, w = s.map[0].length, at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? '#' : s.map[y][x]);
  const tiles = ch => s.map.flatMap((r, y) => [...r].flatMap((c, x) => (c === ch ? [[x, y]] : [])));
  return { w, h, at, tiles, closed: (x, y) => WALK.includes(at(x, y)), open: (x, y) => (WALK + 'L').includes(at(x, y)), blk: (x, y) => OPAQUE.includes(at(x, y)) };
};
const center = pads => pads.reduce(([sx, sy], [x, y]) => [sx + x / pads.length, sy + y / pads.length], [0, 0]).map(Math.round);

test('Missionen v9: 6 Stück (v12: 7 mit Rabino), alle Ziele, Layouts und Varianten mit eindeutigen ids', () => {
  assert.equal(MISSIONS.length, 7);
  assert.deepEqual(new Set(MISSIONS.map(m => m.objective.type)), new Set(Object.keys(GOAL)));
  for (const m of MISSIONS) {
    assert.ok(m.name && m.place && m.intro && m.hint && m.texts.success && m.texts.fail && m.objective.label && m.theme, m.id);
    assert.ok(Number.isFinite(m.lat) && Number.isFinite(m.lon), m.id);
    assert.ok(m.timeMs === null || m.timeMs >= 300_000, m.id);
    assert.ok(m.layouts.length >= 2, `${m.id}: mindestens 2 Karten`);
    assert.equal(new Set(m.layouts.map(l => l.id)).size, m.layouts.length);
    const vids = m.layouts.flatMap(l => l.variants.map(v => v.id));
    assert.equal(new Set(vids).size, vids.length, `${m.id}: Varianten-ids eindeutig`);
    for (const l of m.layouts) {
      assert.ok(l.name && l.variants.length >= 2, `${m.id}/${l.id}`);
      for (const v of l.variants) assert.ok(v.name && v.desc && v.enemies.length, `${m.id}/${v.id}`);
    }
    assert.equal(MISSION_BY_ID[m.id], m);
  }
  // Layout 1 der alten Missionen ist die v8-Karte mit ihren 3 Varianten
  for (const [id, lid, vs] of [['tachionenraub', 'tresor', 'schicht inventur drohnen'], ['hangar', 'halle', 'nacht leitstand werkstatt'], ['ps3', 'lager', 'ladenschluss sommer chef'], ['keller', 'flur', 'sauna wartung hausbesuch']]) {
    const l = MISSION_BY_ID[id].layouts[0];
    assert.equal(l.id, lid);
    assert.deepEqual(l.variants.map(v => v.id), vs.split(' '));
  }
  const c = MISSION_BY_ID.camping, b = MISSION_BY_ID.bruch;
  assert.equal(c.solo, 'viktor');
  assert.equal(c.timeMs, null);
  assert.equal(c.theme, 'mosel');
  assert.equal(c.objective.type, 'valve');
  assert.equal(b.timeMs, 360_000);
  assert.equal(b.theme, 'bruch');
  assert.equal(b.objective.type, 'ignite');
  assert.equal(b.solo, undefined);
});

test('Karten: Rechteck, Rand aus Wand, nur erlaubte Kacheln, Plattform, Tor, Ziele zählen', () => {
  for (const m of MISSIONS) for (const l of m.layouts) for (const v of l.variants) {
    const tag = `${m.id}/${l.id}/${v.id}`, s = buildSetup(m, { layoutId: l.id, variantId: v.id }), g = grid(s);
    for (const [y, row] of s.map.entries()) {
      assert.equal(row.length, g.w, `${tag} Zeile ${y}`);
      assert.match(row, /^[#.DLPCSXK~VBWT]+$/, `${tag} Zeile ${y}`);
      if (y === 0 || y === g.h - 1) assert.match(row, /^#+$/, `${tag} Rand`);
      else assert.ok(row[0] === '#' && row[g.w - 1] === '#', `${tag} Rand ${y}`);
    }
    if (m.id === 'camping') assert.ok(g.w >= 64 && g.h >= 48, `${tag}: ${g.w}×${g.h}`);
    else assert.ok(g.w >= 26 && g.h >= 18, tag);
    assert.ok(g.tiles('P').length >= 9, `${tag}: Plattform 3×3`);
    assert.ok(g.closed(...s.gate) && g.at(...s.gate) !== 'P', `${tag}: Tor begehbar`);
    const goals = g.tiles(GOAL[m.objective.type]);
    const want = { sabotage: 4, fetch: 1, unplug: 1, valve: 3, ignite: 3 }[m.objective.type];
    if (want) assert.equal(goals.length, want, `${tag}: Anzahl Ziele`);
    // Andere Zielkacheln gehören nicht in diese Mission
    for (const [t, ch] of Object.entries(GOAL)) if (t !== m.objective.type) assert.equal(g.tiles(ch).length, 0, `${tag}: fremdes Ziel ${ch}`);
    const far = { valve: 20, ignite: 10 }[m.objective.type];
    if (far) for (const a of goals) for (const b of goals) if (a !== b) assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) >= far, `${tag}: Ziele zu nah ${a} ${b}`);
    if (m.objective.type === 'steal') {
      assert.ok(goals.length >= 6, tag);
      for (const [x, y] of goals) assert.ok(Number.isInteger(s.coins[`${x},${y}`]), `${tag}: Münzen ${x},${y}`);
      assert.ok(Object.values(s.coins).reduce((a, n) => a + n, 0) >= m.objective.min + 2, tag);
    }
    // Solo-Viktor kann keine L-Türen öffnen
    if (m.solo) assert.equal(g.tiles('L').length, 0, tag);
    else assert.ok(g.tiles('L').length >= 1, `${tag}: L-Türen`);
  }
});

test('jedes Layout × jede Variante × Spiegelung lösbar ohne L, Gegner auf Wegen, Plattform außer Sicht', () => {
  for (const { m, l, v, mirror } of all()) for (const seed of [1, 7, 99]) {
    const tag = `${m.id}/${l.id}/${v.id}${mirror ? '/gespiegelt' : ''}/${seed}`;
    const s = buildSetup(m, { layoutId: l.id, variantId: v.id, mirror, seed }), g = grid(s);
    const pads = g.tiles('P'), [px, py] = center(pads);
    assert.equal(g.at(px, py), 'P', tag);
    for (const [x, y] of g.tiles(GOAL[m.objective.type])) {
      assert.ok(findPath(g.w, g.h, g.closed, px, py, x, y, 1.5), `${tag}: Ziel ${x},${y} ohne L unerreichbar`);
    }
    assert.ok(findPath(g.w, g.h, g.closed, px, py, ...s.gate), `${tag}: Tor`);
    assert.ok(Math.hypot(s.gate[0] - px, s.gate[1] - py) >= 8, `${tag}: Tor zu nah an der Plattform`);
    for (const [i, e] of s.enemies.entries()) {
      assert.ok(SIGHT[e.type], `${tag}: Typ ${e.type}`);
      assert.ok(g.closed(...e.at) && g.at(...e.at) !== 'P', `${tag}: Gegner ${i} in der Wand oder auf P`);
      for (const pose of watchPoses(g, e, `${tag}: Gegner ${i}`)) {
        const q = seesPad(g, pads, e.type, pose);
        assert.ok(!q, `${tag}: Gegner ${i} (${e.type}) sieht von ${pose[0]} (Blick ${Math.round(pose[1])}→${Math.round(pose[2])}) die Plattform ${q}`);
      }
    }
  }
});

test('L-Türen sind Abkürzungen (jedes Layout mit Team, in mindestens einer Variante)', () => {
  for (const m of MISSIONS) for (const l of m.layouts) {
    if (m.solo) continue;
    const gain = l.variants.some(v => {
      const s = buildSetup(m, { layoutId: l.id, variantId: v.id }), g = grid(s), [px, py] = center(g.tiles('P'));
      return g.tiles(GOAL[m.objective.type]).some(([x, y]) => {
        const a = findPath(g.w, g.h, g.closed, px, py, x, y, 1.5), b = findPath(g.w, g.h, g.open, px, py, x, y, 1.5);
        return b.length < a.length;
      });
    });
    assert.ok(gain, `${m.id}/${l.id}: keine L-Tür kürzt ab`);
  }
});

test('Camping: Bernd einmal auf langer Runde, sonst Camper/Dackel/Platzwart; Bruch: Ranger', () => {
  for (const l of MISSION_BY_ID.camping.layouts) for (const v of l.variants) {
    const types = v.enemies.map(e => e.type), bernd = v.enemies.find(e => e.type === 'bernd');
    assert.equal(types.filter(t => t === 'bernd').length, 1, v.id);
    assert.ok(types.every(t => ['bernd', 'camper', 'dackel', 'platzwart'].includes(t)), v.id);
    assert.ok(bernd.patrol.length >= 6, `${v.id}: Bernds Runde`);
  }
  for (const l of MISSION_BY_ID.bruch.layouts) for (const v of l.variants) assert.ok(v.enemies.every(e => e.type === 'ranger'), v.id);
  assert.equal(MISSION_BY_ID.bruch.reinforce, 'ranger');
});

test('Spiegeln: Karte, Tor, Gegner, Wegpunkte, Blickrichtungen und Münzen waagerecht gespiegelt', () => {
  for (const m of MISSIONS) for (const l of m.layouts) for (const v of l.variants) {
    const a = buildSetup(m, { layoutId: l.id, variantId: v.id, mirror: false, seed: 5 });
    const b = buildSetup(m, { layoutId: l.id, variantId: v.id, mirror: true, seed: 5 });
    const w = a.map[0].length, X = x => w - 1 - x, D = d => (d + 360) % 360, tag = `${m.id}/${v.id}`;
    assert.equal(a.mirror, false); assert.equal(b.mirror, true);
    assert.deepEqual(b.map, a.map.map(r => [...r].reverse().join('')), tag);
    assert.deepEqual(b.gate, [X(a.gate[0]), a.gate[1]], tag);
    assert.equal(b.enemies.length, a.enemies.length);
    for (const [i, e] of a.enemies.entries()) {
      const f = b.enemies[i];
      assert.deepEqual(f.at, [X(e.at[0]), e.at[1]], tag);
      assert.equal(D(f.dir + e.dir), 180, `${tag}: Richtung ${e.dir} → ${f.dir}`);
      assert.equal(f.type, e.type);
      for (const [k, p] of (e.patrol || []).entries()) {
        const q = f.patrol[k];
        assert.deepEqual([q[0], q[1], q[2]], [X(p[0]), p[1], p[2]], tag);
        if (p[3] != null) assert.equal(D(q[3] + p[3]), 180, tag);
      }
      for (const [k, d] of (e.look || []).entries()) assert.equal(D(f.look[k] + d), 180, tag);
    }
    assert.deepEqual(b.coins, Object.fromEntries(Object.entries(a.coins).map(([k, n]) => { const [x, y] = k.split(',').map(Number); return [`${X(x)},${y}`, n]; })), tag);
  }
  // Osten ↔ Westen, Norden und Süden bleiben
  const mini = {
    objective: { type: 'fetch' },
    layouts: [{ id: 'a', gate: [3, 1], map: ['######', '#P..X#', '######'], variants: [{ id: 'v', enemies: [{ type: 'camper', at: [1, 1], dir: 0, patrol: [[2, 1, 500, 270]], look: [0, 90] }] }] }],
  };
  const s = buildSetup(mini, { mirror: true, seed: 3 });
  assert.deepEqual(s.map, ['######', '#X..P#', '######']);
  assert.deepEqual(s.gate, [2, 1]);
  assert.deepEqual(s.enemies, [{ type: 'camper', at: [4, 1], dir: 180, patrol: [[3, 1, 500, 270]], look: [180, 90] }]);
  assert.deepEqual(mini.layouts[0].variants[0].enemies[0].at, [1, 1], 'Daten bleiben unverändert');
});

test('Setup: deterministisch, würfelt alle Layouts, Varianten und Spiegelungen, wirft bei Unbekanntem', () => {
  for (const m of MISSIONS) {
    assert.deepEqual(pickSetup(m, rngOf(42)), pickSetup(m, rngOf(42)));
    const setups = Array.from({ length: 300 }, (_, i) => pickSetup(m, rngOf(i * 977 + 1)));
    assert.deepEqual(new Set(setups.map(s => s.layoutId)), new Set(m.layouts.map(l => l.id)), m.id);
    assert.equal(new Set(setups.map(s => s.variantId)).size, m.layouts.reduce((n, l) => n + l.variants.length, 0), m.id);
    assert.deepEqual(new Set(setups.map(s => s.mirror)), new Set([false, true]));
    for (const s of setups.slice(0, 20)) {
      assert.ok(Number.isInteger(s.seed) && s.seed >= 0 && s.seed < 2 ** 32);
      assert.deepEqual(buildSetup(m, s), buildSetup(m, { ...s }), m.id);
      assert.equal(buildSetup(m, s).layout.id, s.layoutId);
      assert.equal(buildSetup(m, s).variant.id, s.variantId);
    }
  }
  const m = MISSION_BY_ID.hangar, v2 = m.layouts[1].variants[1];
  assert.equal(buildSetup(m, { variantId: v2.id }).layout, m.layouts[1]); // Variante allein findet ihr Layout
  assert.equal(buildSetup(m).layout, m.layouts[0]);
  assert.throws(() => buildSetup(m, { layoutId: 'gibtsnicht' }));
  assert.throws(() => buildSetup(m, { layoutId: m.layouts[0].id, variantId: v2.id }));
  assert.throws(() => buildSetup(m, { variantId: 'gibtsnicht' }));
  assert.ok(m.layouts[0].variants.includes(pickVariant(m, rngOf(3))));
});

test('Patrouillen-Versatz: Wachen starten an Punkten ihrer Runde, je nach Seed verschieden', () => {
  for (const m of MISSIONS) for (const l of m.layouts) for (const v of l.variants) {
    const starts = v.enemies.map(() => new Set());
    for (let seed = 1; seed <= 40; seed++) {
      const s = buildSetup(m, { layoutId: l.id, variantId: v.id, seed });
      for (const [i, e] of s.enemies.entries()) {
        const raw = v.enemies[i], key = e.at.join(',');
        starts[i].add(key);
        const ok = [raw.at, ...(raw.patrol || [])].some(p => `${p[0]},${p[1]}` === key);
        assert.ok(ok, `${m.id}/${v.id}: Gegner ${i} startet neben seiner Runde`);
        if (raw.patrol) assert.deepEqual(new Set(e.patrol.map(p => p.join())), new Set(raw.patrol.map(p => p.join())), 'Runde bleibt dieselbe');
        if (raw.look && !raw.patrol?.length) { assert.deepEqual(new Set(e.look), new Set(raw.look)); assert.ok(e.dir === (raw.dir ?? 0) || e.dir === e.look[0]); }
      }
    }
    v.enemies.forEach((e, i) => { if (e.patrol?.length > 1) assert.ok(starts[i].size >= 2, `${m.id}/${v.id}: Gegner ${i} startet immer gleich`); });
  }
});

test('Beute: zufällige Teilmenge der Tresore, immer mindestens min + 2 Münzen', () => {
  const m = MISSION_BY_ID.tachionenraub;
  for (const l of m.layouts) for (const v of l.variants) {
    const totals = new Set(), base = buildSetup(m, { layoutId: l.id, variantId: v.id, seed: 0 });
    let emptied = false;
    for (let seed = 1; seed <= 40; seed++) {
      const s = buildSetup(m, { layoutId: l.id, variantId: v.id, seed });
      const total = Object.values(s.coins).reduce((a, n) => a + n, 0);
      assert.ok(total >= m.objective.min + 2, `${v.id}/${seed}: ${total}`);
      totals.add(total);
      assert.deepEqual(Object.keys(s.coins).sort(), Object.keys(base.coins).sort());
      for (const [k, n] of Object.entries(s.coins)) {
        const full = v.coins?.[k] ?? l.coins ?? 2;
        assert.ok(n === 0 || n === full, `${v.id}: ${k}`);
        if (full && !n) emptied = true;
      }
    }
    assert.ok(totals.size >= 2 && emptied, `${l.id}/${v.id}: Beute ändert sich nie`);
  }
  // andere Ziele: Münzen ohne Teilmenge
  const k = buildSetup(MISSION_BY_ID.keller, { seed: 3 });
  assert.deepEqual(k.coins, {});
});
