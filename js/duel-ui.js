import { CONST, LINES, RUETHER_BY_ID } from './data.js';
import { DUEL, createDuel, tickDuel, endDuel, duelSnapshot, fromDuelSnapshot, duelOutcome, duelReward, duelFighters, hostile } from './duel.js';
import { sfx, haptic } from './audio.js';
import { propFx, playSheet, confetti, floatText, btcRain, banner } from './fx.js';
import { hashrateText } from './format.js';
import { popup, esc } from './ui.js';
import { TIMING } from './net/link.js';

// v11 Arena-Duell 3 gegen 3 (Spec §3.2/§3.3): Darstellung, Eingaben und Netz-Kleber über die Link-API (js/net/link.js).
// createDuelScreen({ el, onResult, onEnd, onEvent }) -> { start({ link, role, teams: { host, guest }, names: { host, guest } }), stop() }
//   teams: Picks aus der Lobby { uid, id, rarity, level }; die Kampfwerte rechnet duelFighters auf beiden Geräten selbst.
//   names: { name, avatar } je Rolle. Eigene Seite = role === 'host' ? 'a' : 'b', gezeichnet wird aus eigener Sicht.
//   onResult / onEnd je genau einmal { won, draw, reason, timeMs }: onResult sobald entschieden (App verbucht, duelReward),
//   onEnd danach über „Weiter“ im Overlay (nur noch Navigation). onEvent: eigene special, dodge, { type: 'combo', value }.
// Host-autoritativ: Der Host tickt in festen 50-ms-Schritten (rAF mit Aufholen) und schickt alle SEND_MS
// { t: 'ds', s, ev, p }; der Gast tickt nie, schickt Eingaben als { t: 'di', … } und zeichnet die Schnappschüsse.
// Zusatzfeld (abwärtskompatibel, unbekannte Felder ignoriert jede Seite): di.echo / ds.echo misst die Umlaufzeit für die Abwehr (LEAD).
// Start: Gast meldet { t: 'dready' } (wiederholt, bis der erste ds da ist); die Uhr des Hosts läuft erst nach Intro und dready.
// Pause { t: 'dp', on } von beiden; der Host hält an und schickt p = null | { by, why } (why 'net': Verbindung/away des Partners).
// Gesichter werden nie eingefärbt, ausgegraut oder verdeckt (Spec §0): K.o. = Etikett „pleite“, Banner über der Leiste des Handelnden,
// Pause- und Warte-Karten über den Knöpfen, Warnung als roter Rand ohne Fläche.

const sprite = id => `sprites/${RUETHER_BY_ID[id] ? id : 'unknown'}.png`;
const fmt = n => n.toLocaleString('de-DE');
const nat = v => Math.max(0, Math.round(Number(v)) || 0); // Zahl aus Events des Hosts (Daten von außen)
const other = k => (k === 'a' ? 'b' : 'a');
const freshIn = () => ({ taps: 0, dodge: false, special: null, switchTo: null });
const TAP_BUF = 4; // höchstens so viele offene Tipps je Seite
const MAX_CATCHUP = 1500;
const READY_MS = 1000; // dready wiederholen, bis der erste Schnappschuss kommt
const COUNTDOWN = ['3', '2', '1', 'Kampf!'], COUNT_STEP = 500, INTRO_LEAD = CONST.INTRO_MS - COUNTDOWN.length * COUNT_STEP;
const BANNER_MS = 700, PROP_MS = 800, ARC_HIT = 0.86; // Wurfbahnen (css/theme.css) schlagen bei 86 % ein
// Gast: so lange ohne ds (Verbindung steht, Partner in der App) heißt „Host ist weg“. Länger als TIMEOUT_MS: kommt gar nichts
// mehr, meldet der Link vorher 'lost' (dann wartet der Gast), nur bei Herzschlag ohne ds greift der Wächter
const SILENT_MS = TIMING.TIMEOUT_MS + 2000;
// Abwehr: Das Requisit einer feindlichen Spezial fliegt schon während der Ankündigung (DUEL.WARN) und schlägt ein, bevor die
// Engine sie feuert. Wischen, solange es fliegt, zählt also immer (vorher flog es erst nach dem Treffer los, wer beim Anflug
// wischte, kam zu spät). Wischen löst schon in der Bewegung aus, nicht erst beim Loslassen, in jede Richtung.
const SWIPE = 40;
// Vorlaufzeit eingehender Würfe (lead): beim Host ein Schritt, beim Gast die gemessene Umlaufzeit + ein Schritt. Der Gast sieht
// die Ladung einen Funkweg zu spät, und sein Wischen braucht noch einen bis zum Host. Messung: Gast schickt alle ECHO_MS
// { t: 'di', echo: seine Uhr }, der Host gibt im nächsten ds echo: [Stempel, wie lange er ihn gehalten hat] zurück.
const ECHO_MS = 1000, LEAD = { MIN: 100, MAX: 450, START: 150 };
const KNOWN = new Set(['fast', 'stunnedTap', 'charge', 'cancel', 'dodge', 'special', 'specialDenied', 'poisoned', 'poison', 'stun', 'weaken', 'heal', 'summoned', 'summon', 'switch', 'faint', 'end']);
const okEvent = e => e && typeof e === 'object' && KNOWN.has(e.type) && (e.side === undefined || e.side === 'a' || e.side === 'b');
const AT = { me: { x: 'var(--fx-me-x)', y: 'var(--fx-me-y)' }, foe: { x: 'var(--fx-enemy-x)', y: 'var(--fx-enemy-y)' } };
// Treffer, Gift und Heilung neben dem echten Gesicht (Spec §0, wie im Wildkampf): beim Gegner links daneben, bei mir rechts daneben,
// Abstand halbes Gesicht + halbes Sheet + 10 px (Rahmen und Wackeln), damit nichts auf dem Gesicht liegt
const beside = (at, size) => ({ x: `calc(${AT[at].x} ${at === 'foe' ? '-' : '+'} (var(--face) / 2 + ${Math.round(size / 2) + 10}px))`, y: AT[at].y });
// Hinweise: Mitte mindestens 120 px vom Rand, damit „Ramona, du bist dran!“ auch auf 375 px ganz zu sehen ist
const INFO = { me: { x: 'max(var(--fx-me-x), 120px)', y: 'calc(var(--fx-me-y) - var(--face) / 2 - 14px)' }, foe: { x: 'min(var(--fx-enemy-x), calc(100% - 120px))', y: 'calc(var(--fx-enemy-y) + var(--face) / 2 + 30px)' } };
const short = id => id[0].toUpperCase() + id.slice(1); // „Ramona Rüther“ → Ramona (wie in quest/view.js)
const TXT = { me: { x: 'calc(var(--fx-me-x) + 18%)', y: 'calc(var(--fx-me-y) - 12%)' }, foe: { x: 'calc(var(--fx-enemy-x) - 18%)', y: 'calc(var(--fx-enemy-y) + 6%)' } };

const HTML = `
<div class="d-flash"></div>
<div class="d-top">
  <button class="d-quit" title="Aufgeben" aria-label="Aufgeben">×</button>
  <div class="d-bar foe">
    <div class="d-name"><span class="d-player"></span><b class="nm"></b><span class="lv"></span></div>
    <div class="bar hp"><div class="fill"></div></div>
    <div class="d-line"><span class="d-btc"></span><span class="d-status"></span></div>
    <div class="d-mining"><img class="ico ico-sm" src="art/icon-mining.png" alt=""><span>Mining</span><div class="bar energy"><div class="fill"></div></div><b></b></div>
  </div>
  <div class="d-say hidden"><img class="d-say-face" alt=""><div><p class="d-say-text"></p><p class="d-say-hint">Wischen zum Ausweichen!</p></div></div>
  <div class="d-clock"><b class="d-timer">90</b><button class="d-pause" title="Pause" aria-label="Pause">II</button></div>
</div>
<div class="d-stage">
  <div class="bg"></div>
  <div class="d-team foe"></div>
  <div class="d-fighter foe"><img class="d-face" alt=""></div>
  <div class="d-fighter me"><img class="d-face" alt=""></div>
  <div class="d-team me"></div>
  <div class="d-helpers foe hidden"></div>
  <div class="d-helpers me hidden"></div>
  <div class="d-combo hidden"></div>
  <div class="fx"></div>
  <p class="d-hint">Tippen = Angriff · Wischen = Ausweichen</p>
</div>
<div class="d-bar me">
  <div class="d-name"><b class="nm"></b><span class="lv"></span><span class="d-status"></span></div>
  <div class="bar hp"><div class="fill"></div></div>
  <div class="d-line"><span class="d-btc"></span><span class="d-hash"></span></div>
  <div class="d-mining"><img class="ico ico-sm" src="art/icon-mining.png" alt=""><span>Mining</span><div class="bar energy"><div class="fill"></div></div><b></b></div>
</div>
<div class="d-specials"></div>
<div class="d-switch hidden"></div>
<div class="d-wait hidden"><p class="d-wait-text"></p><button class="d-resume primary">Weiter</button></div>
<div class="d-intro hidden">
  <div class="d-intro-head"><b>Arena-Duell</b><span>3 gegen 3 · ${DUEL.DURATION / 1000} s</span></div>
  <div class="d-intro-row"><div class="d-intro-p me"><img class="d-face" alt=""><b></b><div class="d-team"></div></div><div class="d-vs">VS</div><div class="d-intro-p foe"><img class="d-face" alt=""><b></b><div class="d-team"></div></div></div>
  <p class="d-intro-line">Wer zuerst pleite ist, zahlt die nächste Runde Dosenbier.</p>
  <div class="d-countdown"></div>
</div>
<div class="d-overlay hidden">
  <div class="d-card">
    <div class="confetti"></div>
    <div class="d-end-faces"><div class="d-end-p me"><img class="d-face" alt=""><b></b></div><div class="d-end-p foe"><img class="d-face" alt=""><b></b></div></div>
    <h2 class="title"></h2>
    <p class="sub"></p>
    <p class="sats-gain hidden">+0 Sats</p>
    <p class="note"></p>
    <button class="d-done primary">Weiter</button>
  </div>
</div>`;

export function createDuelScreen({ el, onResult, onEnd, onEvent }) {
  el.innerHTML = HTML;
  const $ = s => el.querySelector(s);
  const stage = $('.d-stage'), rainBox = $('.d-stage .bg'), fx = $('.fx'), flash = $('.d-flash'), combo$ = $('.d-combo');
  const bars = { me: $('.d-bar.me'), foe: $('.d-bar.foe') };
  const faces = { me: $('.d-fighter.me .d-face'), foe: $('.d-fighter.foe .d-face') };
  const rows = { me: $('.d-stage .d-team.me'), foe: $('.d-stage .d-team.foe') };
  const helpers = { me: $('.d-helpers.me'), foe: $('.d-helpers.foe') };
  const say = $('.d-say'), sayFace = say.querySelector('.d-say-face'), sayText = say.querySelector('.d-say-text'), sayHint = say.querySelector('.d-say-hint');
  const timerEl = $('.d-timer'), specials = $('.d-specials'), sw = $('.d-switch');
  const wait = $('.d-wait'), waitText = $('.d-wait-text'), resumeBtn = $('.d-resume');
  const intro = $('.d-intro'), countdown = $('.d-countdown'), overlay = $('.d-overlay');

  let link = null, role = 'host', mine = 'a', foe = 'b', names = null, s = null, offs = [];
  let running = false, raf = 0, countRaf = 0, lastTs = 0, acc = 0, lastSend = 0, sent = [];
  let introDone = false, peerReady = false, clock = false, gotSnap = false, readyTimer = 0;
  let pause = null, netDown = false, peerAway = false; // pause: Host { by, why } | Gast: zuletzt empfangenes p
  let inbox = { a: freshIn(), b: freshIn() }, guestTaps = 0;
  let outcome = null, reported = false, ended = false, down = null, dodgeDir = 'left';
  let comboN = 0, lastHit = -Infinity, stunTextAt = -Infinity, specialsKey = '';
  let foeHitAt = -Infinity, specialAt = -Infinity, snapAt = 0, leaving = false; // Einschlag bei mir; Gast: Spezial unterwegs; letzter ds; Host wartet aufs Netz
  let flying = { a: null, b: null }; // Requisit der laufenden Ladung je Seite (propFx-Griff)
  let rtt = null, lastEcho = -Infinity, echoIn = null; // Gast: geschätzte Umlaufzeit; Host: zuletzt erhaltener Stempel
  // Vorlaufzeit eingehender Würfe: Host einen Schritt (sein Wischen gilt erst im nächsten Schritt), Gast Umlaufzeit + Schritt
  const lead = () => (isHost() ? DUEL.STEP : rtt == null ? LEAD.START : Math.max(LEAD.MIN, Math.min(LEAD.MAX, rtt + DUEL.STEP)));
  const timers = new Set(), pending = new Map();

  // ---------- Timer und Einmal-Animationen (stop() räumt alles ab) ----------
  function later(fn, ms) { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); return id; }
  function anim(node, cls, ms) {
    const m = pending.get(node) || pending.set(node, {}).get(node);
    if (m[cls]) { clearTimeout(m[cls]); timers.delete(m[cls]); }
    node.classList.remove(cls);
    void node.offsetWidth; // Reflow, damit die Animation neu startet
    node.classList.add(cls);
    m[cls] = later(() => { delete m[cls]; node.classList.remove(cls); }, ms);
  }
  const setText = (n, t) => { if (n.textContent !== t) n.textContent = t; };
  const setWidth = (n, pct) => { const w = `${pct}%`; if (n.style.width !== w) n.style.width = w; };
  const view = k => (k === mine ? 'me' : 'foe');
  const active = k => s[k].team[s[k].active];
  const partner = () => names?.[role === 'host' ? 'guest' : 'host']?.name || 'Partner';
  const myName = () => names?.[role]?.name || 'Ich';
  const isHost = () => role === 'host';
  const live = () => running && introDone && !s.over && !ended;

  // ---------- Effekte (fx.js) ----------
  let numSeq = 0;
  const num = (t, at, kind = 'hurt', ms = 900) =>
    floatText(fx, t, { x: `calc(${TXT[at].x} + ${Math.round((Math.random() - 0.5) * 40)}px)`, y: `calc(${TXT[at].y} + ${(numSeq++ % 3 - 1) * 20}px)`, kind, ms });
  // Hinweise über meinem bzw. unter seinem Gesicht, je auf der eigenen Spalte: kein Text über einem Gesicht (Spec §0)
  const info = (t, at) => floatText(fx, t, { ...INFO[at], kind: 'info', ms: 1200 });
  function hit(at, n, big = false) {
    anim(faces[at], 'shake', 300);
    // höchstens so groß wie das Gesicht: auf kurzen Bühnen (375×667) reicht ein größerer Burst sonst bis ans andere Gesicht
    const size = Math.min(big ? 176 : 96, faces[at].offsetWidth || 144, (big ? 120 : 56) + n * 4);
    playSheet(fx, big ? 'btcburst' : 'impact', { ...beside(at, size), size });
    if (n > 0) num(`-${n}`, at, n >= 25 ? 'big' : 'hurt');
    if (big) { anim(stage, n >= 30 ? 'quake-l' : 'quake-m', 600); if (n >= 20) btcRain(rainBox, { n: n >= 40 ? 24 : 14 }); } // ₿-Regen hinter den Gesichtern
  }
  function comboHit() {
    const now = performance.now();
    comboN = now - lastHit < CONST.COMBO_WINDOW ? comboN + 1 : 1;
    lastHit = now;
    onEvent?.({ type: 'combo', value: comboN });
    combo$.classList.toggle('hidden', comboN < 2);
    if (comboN < 2) return;
    setText(combo$, `×${comboN}`);
    combo$.classList.toggle('hot', comboN >= 10);
    anim(combo$, 'bump', 200);
  }
  // Familientreffen: die echten Gesichter rennen neben den Rufer und bleiben, solange die Helfer schlagen (render)
  function showHelpers(at, ids) {
    const box = helpers[at];
    box.innerHTML = ids.filter(id => RUETHER_BY_ID[id]).map((id, i) => `<img src="${sprite(id)}" alt="" style="--i:${i}">`).join('');
    box.classList.remove('hidden');
  }

  // ---------- Events → Animationen (aus eigener Sicht; side = Handelnder, bei poisoned/poison/stun/weaken das Ziel) ----------
  function handle(e) {
    if (!okEvent(e)) return;
    const at = e.side ? view(e.side) : null, op = at === 'me' ? 'foe' : 'me';
    if (e.side === mine && (e.type === 'special' || e.type === 'dodge')) onEvent?.(e);
    switch (e.type) {
      case 'fast':
        hit(op, nat(e.damage));
        if (at === 'me') { comboHit(); sfx.play('hit'); }
        break;
      case 'stunnedTap':
        if (at === 'me' && performance.now() - stunTextAt > 1200) { stunTextAt = performance.now(); info('betäubt', 'me'); }
        break;
      case 'charge': { // Blinken, Blase und Fortschritt hängen am Zustand; das Requisit fliegt ab jetzt (siehe ARC_HIT)
        sfx.play('warn');
        if (at === 'foe') haptic([20, 40, 20]);
        const f = s[e.side]?.team[e.fighter], atk = f?.attacks[e.index], c = s[e.side]?.charge;
        if (!atk || !c || c.fighter !== e.fighter || c.index !== e.index) break; // schon gefeuert (später Schnappschuss): nur der Einschlag
        const left = Math.max(150, c.firesAt - s.time - (at === 'foe' ? lead() : 0));
        flying[e.side]?.stop();
        flying[e.side] = propFx(fx, atk.prop, at === 'me' ? 'arc-to-enemy' : 'arc-to-me', { ms: Math.round(left / ARC_HIT), size: 112, rider: f.id, riderRarity: f.rarity });
        flying[e.side].el.style.setProperty('--spin', '20deg');
        break;
      }
      case 'cancel': flying[e.side]?.stop(); flying[e.side] = null; break; // Wechsel oder K.o. mitten in der Ladung: Wurf verpufft
      case 'specialDenied': if (at === 'me') anim(specials, 'shake-x', 400); break;
      // Mein Ausweichen hat schon beim Wischen ausgeholt (dodgeNow); hier kommt die Bestätigung
      case 'dodge':
        if (at === 'me') { info('Ausgewichen!', 'me'); sfx.play('dodge'); haptic(15); }
        else { anim(faces.foe, 'dodge-right', 450); info('ausgewichen', 'foe'); }
        break;
      case 'special': {
        const f = s[e.side]?.team[e.fighter], atk = f?.attacks[e.index];
        if (!atk) break;
        const subs = (LINES[f.id]?.fight || []).filter(l => !l.includes(atk.name));
        // Banner kurz und nur über der Leiste des Handelnden: Timer, × und II bleiben frei, seine Ankündigungs-Blase auch
        banner(bars[at], { title: atk.summon ? 'Familientreffen!' : atk.name, sub: subs[Math.floor(Math.random() * subs.length)] || '', portrait: sprite(f.id), rarity: f.rarity, ms: BANNER_MS });
        const n = nat(e.damage);
        if (hostile(atk)) { // Einschlag jetzt: das Requisit ist schon da (fliegt seit charge und verblasst von selbst)
          flying[e.side] = null;
          if (at === 'foe') foeHitAt = performance.now(); // Wischen kurz danach heißt „zu spät“, nicht „zu früh“
          if (e.dodged) num(`-${n}`, op); else hit(op, n, true); // „Ausgewichen!“ stand schon beim dodge-Event
        } else if (!atk.summon) propFx(fx, atk.prop, at === 'me' ? 'morph-at-me' : 'pulse-at-enemy', { ms: PROP_MS + 400, size: 112, rider: f.id, riderRarity: f.rarity });
        sfx.play('special'); haptic(20);
        break;
      }
      case 'poisoned': playSheet(fx, 'smoke', { ...beside(at, 112), size: 112 }); break;
      case 'poison': num(`-${nat(e.damage)}`, at); break;
      case 'stun': if (at === 'me') info('betäubt', 'me'); else [0, 450, 900].forEach(t => later(() => num('Z', 'foe', 'info', 1400), t)); break;
      case 'weaken': info('geschwächt', at); break;
      case 'heal':
        anim(bars[at], 'glow', 900);
        playSheet(fx, 'sparkle', { ...beside(at, 112), size: 112, ms: 900 });
        if (nat(e.amount) > 0) num(`+${nat(e.amount)}`, at, 'heal');
        break;
      case 'summoned': if (Array.isArray(e.ids)) showHelpers(at, e.ids); break;
      case 'summon': anim(helpers[at], 'hop', 300); if (nat(e.damage) > 0) num(`-${nat(e.damage)}`, op); break;
      case 'switch': {
        const f = s[e.side]?.team[e.to];
        if (!f) break;
        anim(faces[at], 'slide-in', 500);
        if (at === 'me' && f.btc > 0) later(() => info(`${short(f.id)}, du bist dran!`, 'me'), 300);
        break;
      }
      case 'faint': {
        const f = s[e.side]?.team[e.fighter];
        if (f) info(`${short(f.id)} ist pleite!`, at);
        sfx.play('hit'); haptic(40);
        break;
      }
    }
  }

  // ---------- Knöpfe ----------
  function buildSpecials() {
    const me = active(mine);
    specialsKey = `${s[mine].active}`;
    specials.innerHTML = '';
    sw.classList.add('hidden');
    me.attacks.forEach((a, i) => {
      const b = document.createElement('button');
      b.className = 'btn special';
      b.innerHTML = `<span class="sname">${esc(a.name)}</span><span class="smeta"><img class="ico ico-sm" src="art/icon-mining.png" alt=""><b>${a.cost}</b>${a.damage ? ` · ${a.damage} Schaden` : ''}${a.heal ? ` · +${a.heal} BTC` : ''}</span><i class="d-prog"></i>`;
      b.addEventListener('click', () => act({ special: i }));
      specials.appendChild(b);
    });
    if (s[mine].team.length > 1) {
      const b = document.createElement('button');
      b.className = 'btn swap'; b.textContent = 'Wechseln';
      b.addEventListener('click', toggleSwitch);
      specials.appendChild(b);
    }
  }
  function toggleSwitch() {
    if (!sw.classList.contains('hidden')) return sw.classList.add('hidden');
    sw.innerHTML = '';
    s[mine].team.forEach((f, i) => {
      if (i === s[mine].active || f.btc <= 0) return;
      const b = document.createElement('button');
      b.className = 'btn';
      b.innerHTML = `<img class="d-mini-face r-${esc(f.rarity)}" src="${sprite(f.id)}" alt=""><span>${esc(f.name)}</span><span>${f.btc} BTC · Mining ${f.energy}</span>`;
      b.addEventListener('click', () => { act({ switchTo: i }); sw.classList.add('hidden'); });
      sw.appendChild(b);
    });
    const c = document.createElement('button');
    c.className = 'btn'; c.textContent = 'Abbrechen';
    c.addEventListener('click', () => sw.classList.add('hidden'));
    sw.appendChild(c);
    sw.classList.remove('hidden');
  }
  // Team-Reihe: 3 kleine echte Gesichter, K.o. als Etikett darunter (das Gesicht bleibt, wie es ist)
  function buildRow(box, team) {
    box.innerHTML = team.map(f => `<div class="d-mini"><img class="d-mini-face r-${esc(f.rarity)}" src="${sprite(f.id)}" alt="${esc(f.name)}"><span class="d-tag">Lv. ${f.level}</span></div>`).join('');
  }

  // ---------- Rendern pro Frame ----------
  function bar(at, f) {
    const p = bars[at], t = s.time;
    setText(p.querySelector('.nm'), f.name);
    setText(p.querySelector('.lv'), ` · Lv. ${f.level}`);
    const pct = Math.max(0, Math.round((100 * f.btc) / f.maxBtc));
    const fill = p.querySelector('.hp .fill');
    setWidth(fill, pct);
    fill.classList.toggle('low', pct <= 25);
    setText(p.querySelector('.d-btc'), `${f.btc} / ${f.maxBtc} BTC`);
    const st = [f.status.poison && 'Gift', f.status.stunUntil > t && 'betäubt', f.status.weakenedUntil > t && 'geschwächt'].filter(Boolean).join(' · ');
    setText(p.querySelector('.d-status'), st);
    const e = p.querySelector('.energy .fill');
    setWidth(e, (100 * f.energy) / CONST.MAX_ENERGY);
    e.classList.toggle('full', f.energy >= CONST.MAX_ENERGY);
    setText(p.querySelector('.d-mining b'), String(f.energy));
  }
  function face(at, f) {
    const img = faces[at], key = `${f.id}:${f.rarity}`;
    if (img.dataset.key !== key) { img.dataset.key = key; img.src = sprite(f.id); img.className = `d-face r-${f.rarity}`; }
  }
  function row(at, k) {
    [...rows[at].children].forEach((d, i) => {
      d.classList.toggle('active', i === s[k].active);
      const ko = s[k].team[i].btc <= 0;
      d.classList.toggle('ko', ko);
      setText(d.lastChild, ko ? 'pleite' : `Lv. ${s[k].team[i].level}`);
    });
  }
  function render() {
    if (!s) return;
    const me = active(mine), en = active(foe), t = s.time;
    bar('me', me); bar('foe', en);
    setText(bars.me.querySelector('.d-hash'), hashrateText(me.power));
    face('me', me); face('foe', en);
    row('me', mine); row('foe', foe);
    const left = Math.max(0, Math.ceil((s.duration - t) / 1000));
    setText(timerEl, String(left));
    timerEl.classList.toggle('low', left < 10 && !s.over);
    // Ladung des Gegners: mein Rand blitzt rot, seine Blase ruft den Attackennamen mit seinem echten Gesicht
    const c = !s.over && s[foe].charge, catk = c && s[foe].team[c.fighter]?.attacks[c.index];
    flash.classList.toggle('red', !!catk && !c.dodged);
    say.classList.toggle('hidden', !catk);
    if (catk) {
      const f = s[foe].team[c.fighter];
      if (sayFace.dataset.id !== f.id) { sayFace.dataset.id = f.id; sayFace.src = sprite(f.id); }
      sayFace.className = `d-say-face r-${f.rarity}`;
      setText(sayText, `${catk.name}!`);
      setText(sayHint, c.dodged ? 'Ausgewichen!' : 'Wischen zum Ausweichen!');
    }
    for (const at of ['me', 'foe']) if (!s[at === 'me' ? mine : foe].summons.length) helpers[at].classList.add('hidden');
    if (comboN && performance.now() - lastHit > 1000) { comboN = 0; combo$.className = 'd-combo hidden'; }
    // Knöpfe
    if (specialsKey !== `${s[mine].active}`) buildSpecials();
    const mc = s[mine].charge, stunnedMe = me.status.stunUntil > t, idle = !live() || !!pause || specialPending();
    specials.querySelectorAll('.special').forEach((b, i) => {
      const a = me.attacks[i], charging = mc && mc.index === i;
      const ok = !idle && !mc && !stunnedMe && me.energy >= a.cost && !(a.once && me.used[a.name]);
      if (b.disabled === ok) b.disabled = !ok;
      b.classList.toggle('ready', ok);
      b.classList.toggle('charging', !!charging);
      if (charging) b.style.setProperty('--p', Math.max(0, Math.min(1, 1 - (mc.firesAt - t) / (mc.ms || DUEL.WARN))).toFixed(2));
    });
    const swap = specials.querySelector('.swap');
    if (swap) swap.disabled = !live() || !!pause || !s[mine].team.some((f, i) => i !== s[mine].active && f.btc > 0);
    renderWait();
  }
  // Warte-/Pause-Karte über den Knöpfen (deckt keine Gesichter ab)
  function renderWait() {
    let text = '', btn = false, okBtn = false;
    if (ended || s.over) text = '';
    else if (!introDone) text = '';
    else if (isHost() && !clock) text = `Warte auf ${partner()} …`;
    else if (!isHost() && netDown) text = `Verbindung zu ${partner()} weg …`;
    else if (!isHost() && peerAway) text = `${partner()} ist nicht in der App …`;
    else if (!isHost() && !gotSnap) text = `Warte auf ${partner()} …`;
    else if (pause) {
      btn = true;
      if (pause.why === 'net') {
        const gone = isHost() && (netDown || peerAway);
        text = !isHost() ? 'Verbindung war kurz weg.' : gone ? `Verbindung zu ${partner()} weg …` : `${partner()} ist zurück.`;
        okBtn = !gone;
      } else { text = `Pause (${pause.by || ''})`; okBtn = true; }
    }
    wait.classList.toggle('hidden', !text);
    setText(waitText, text);
    resumeBtn.classList.toggle('hidden', !btn);
    resumeBtn.disabled = !okBtn;
  }

  // ---------- Eingaben ----------
  // inp: { taps } | { dodge } | { special } | { switchTo } | { quit }. Host: Puffer der Seite a; Gast: sofort an den Host
  function act(inp) {
    if (!live()) return;
    if (pause && !inp.quit) return;
    if (isHost()) return merge(inbox.a, inp);
    if (inp.taps) { guestTaps = Math.min(TAP_BUF, guestTaps + inp.taps); return; } // pro Frame gebündelt (loop)
    if (inp.special != null) { if (specialPending()) return; specialAt = performance.now(); } // Doppeltipp: der zweite käme als „abgelehnt“ zurück
    link.send({ t: 'di', ...inp });
  }
  // Gast: Spezial ist unterwegs zum Host, bis ein Schnappschuss die eigene Ladung zeigt (dann sperrt mc) oder 2 Funkwege um sind
  const specialPending = () => !isHost() && !s?.[mine].charge && performance.now() - specialAt < 2 * lead();
  function merge(box, m) {
    if (Number.isInteger(m.taps) && m.taps > 0) box.taps = Math.min(TAP_BUF, box.taps + m.taps);
    if (m.dodge === true) box.dodge = true;
    if (Number.isInteger(m.special)) box.special = m.special;
    if (Number.isInteger(m.switchTo)) box.switchTo = m.switchTo;
  }
  // Ausweichen: mein Gesicht weicht sofort aus (Rückmeldung ohne Funkweg), „Ausgewichen!“ bestätigt das dodge-Event.
  // Ohne angekündigte Attacke bewirkt es nichts (Spec §3.1), das sagt „zu früh“.
  function dodgeNow(dir) {
    if (!live() || pause) return;
    dodgeDir = dir;
    anim(faces.me, `dodge-${dir}`, 450);
    if (!s[foe].charge) info(performance.now() - foeHitAt <= CONST.DODGE_LATE ? 'zu spät' : 'zu früh', 'me');
    act({ dodge: true });
  }
  stage.addEventListener('pointerdown', e => {
    if (!live()) return;
    down = { x: e.clientX, y: e.clientY, swiped: false };
    try { stage.setPointerCapture(e.pointerId); } catch { /* egal */ }
  });
  stage.addEventListener('pointermove', e => {
    if (!down || down.swiped) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    if (Math.hypot(dx, dy) <= SWIPE) return;
    down.swiped = true; // ein Wisch = ein Ausweichen, Loslassen tippt dann nicht mehr
    dodgeNow(dx < 0 ? 'left' : 'right');
  });
  stage.addEventListener('pointerup', e => {
    if (!down) return;
    const { x, y, swiped } = down;
    down = null;
    if (swiped || !live() || pause) return;
    if (Math.hypot(e.clientX - x, e.clientY - y) > SWIPE) { dodgeNow(e.clientX < x ? 'left' : 'right'); return; } // ohne pointermove (schneller Wisch)
    act({ taps: 1 });
    sfx.play('tap');
    const r = stage.getBoundingClientRect(), ring = document.createElement('div');
    ring.className = 'd-tap';
    ring.style.left = `${e.clientX - r.left}px`; ring.style.top = `${e.clientY - r.top}px`;
    fx.appendChild(ring);
    later(() => ring.remove(), 300);
  });
  stage.addEventListener('pointercancel', () => { down = null; });
  el.addEventListener('click', e => { if (e.target.closest('button')) sfx.play('click'); });
  function onKey(e) {
    if (!live() || !e.key.startsWith('Arrow') || e.repeat) return;
    dodgeNow(e.key === 'ArrowLeft' ? 'left' : 'right');
    e.preventDefault();
  }
  $('.d-quit').addEventListener('click', async () => {
    if (!s || ended) return;
    if (s.over) return finishScreen();
    const i = await popup({ title: 'Aufgeben?', html: `<p>Dann gewinnt ${esc(partner())}, und du kriegst nichts.</p>`, buttons: [{ label: 'Weiterkämpfen', primary: true }, { label: 'Aufgeben', danger: true }] });
    if (i === 1 && running && !s.over) quit();
  });
  $('.d-pause').addEventListener('click', () => { if (running && introDone && !s.over && !pause) setPause(true); });
  resumeBtn.addEventListener('click', () => setPause(false));
  overlay.querySelector('.d-done').addEventListener('click', finishScreen);

  // Aufgeben: Host ends sofort (auch in Pause und Intro); Gast schickt quit und beendet bei sich gleich mit (gleiches Ergebnis)
  function quit() {
    if (isHost()) { for (const e of tickDuel(s, 0, { a: { quit: true } })) { sent.push(e); handle(e); } send(); }
    else { link.send({ t: 'di', quit: true }); endDuel(s, 'a', 'quit'); }
    decided();
  }
  // on = Pause an (eigener Knopf). Host setzt sie selbst, der Gast fragt per dp
  function setPause(on) {
    if (!isHost()) { link.send({ t: 'dp', on }); return; }
    if (on) pause = { by: myName(), why: null };
    else if (!netDown && !peerAway) { pause = null; lastTs = 0; acc = 0; }
    send();
    render();
  }

  // ---------- Netz ----------
  function onMessage(m) {
    if (!m || typeof m !== 'object' || typeof m.t !== 'string' || !running) return;
    if (m.t === 'away' || m.t === 'back') { peerAway = m.t === 'away'; snapAt = performance.now(); if (isHost() && peerAway) netPause(); return render(); }
    if (isHost()) {
      if (m.t === 'dready') { peerReady = true; maybeClock(); }
      else if (m.t === 'di') {
        if (Number.isFinite(m.echo)) echoIn = { at: m.echo, got: performance.now() };
        if (Number.isFinite(m.rtt) && !s.over) s.lag.b = Math.round(Math.max(0, Math.min(DUEL.LAG_MAX, m.rtt + DUEL.SEND_MS / 2))); // Funkzeit-Gutschrift (duel.js)
        if (m.quit === true) { if (!s.over) { for (const e of tickDuel(s, 0, { b: { quit: true } })) { sent.push(e); handle(e); } send(); decided(); } } else if (live()) merge(inbox.b, m);
      }
      else if (m.t === 'dp') { if (m.on === true) { if (!pause) pause = { by: partner(), why: null }; } else if (m.on === false && !netDown && !peerAway) { pause = null; lastTs = 0; acc = 0; } send(); }
      return;
    }
    if (m.t !== 'ds' || ended || s.over) return;
    if (Array.isArray(m.echo) && Number.isFinite(m.echo[0]) && Number.isFinite(m.echo[1])) {
      const r = performance.now() - m.echo[0] - m.echo[1];
      if (r >= 0 && r < 5000) rtt = rtt == null ? r : rtt * 0.7 + r * 0.3; // geglättet, ein Ausreißer kippt die Vorlaufzeit nicht
    }
    const next = fromDuelSnapshot(m.s);
    if (!next) return;
    s = next;
    gotSnap = true; snapAt = performance.now(); clearInterval(readyTimer); readyTimer = 0;
    pause = m.p && typeof m.p === 'object' ? { by: typeof m.p.by === 'string' ? m.p.by.slice(0, 40) : '', why: m.p.why === 'net' ? 'net' : null } : null;
    if (Array.isArray(m.ev)) for (const e of m.ev.slice(0, 200)) handle(e);
    if (s.over) decided();
    render();
  }
  function netPause() { if (!s.over) { pause = { by: partner(), why: 'net' }; send(); } }
  function onLost() { netDown = true; if (isHost()) netPause(); render(); }
  // Wiederverbunden: die Gegenseite meldet ihren Sichtbarkeitsstand neu (Lobby sendState: away/back), ein verpasstes back hängt nicht
  function onConnected() {
    netDown = false; peerAway = false; snapAt = performance.now();
    if (!isHost() && !gotSnap) link.send({ t: 'dready' });
    if (leaving) { send(); return finishScreen(); }
    render();
  }
  function onGone() {
    netDown = false;
    if (!s.over) { for (const e of endDuel(s, null, 'lost')) handle(e); decided(); }
    if (leaving) return finishScreen();
    render();
  }
  function send() {
    if (!isHost() || (!clock && !s.over)) return; // vor dem Start nur das Ende (Aufgeben im Intro)
    lastSend = performance.now();
    const echo = echoIn && [echoIn.at, Math.round(lastSend - echoIn.got)];
    if (link.send({ t: 'ds', s: duelSnapshot(s), ev: sent, p: pause && { by: pause.by, why: pause.why }, ...(echo && { echo }) })) { sent = []; echoIn = null; }
    else if (sent.length > 200) sent = sent.slice(-200);
  }
  function maybeClock() {
    if (clock || !introDone || !peerReady || !running) return;
    clock = true; lastTs = 0; acc = 0;
    send();
  }

  // ---------- Schleife ----------
  function step() {
    const k = { a: inbox.a, b: inbox.b }, inputs = {};
    for (const side of ['a', 'b']) inputs[side] = { taps: k[side].taps > 0 ? 1 : 0, dodge: k[side].dodge, special: k[side].special, switchTo: k[side].switchTo };
    const taps = { a: inbox.a.taps, b: inbox.b.taps };
    inbox = { a: { ...freshIn(), taps: taps.a }, b: { ...freshIn(), taps: taps.b } };
    const ev = tickDuel(s, DUEL.STEP, inputs);
    for (const e of ev) {
      if ((e.type === 'fast' || e.type === 'stunnedTap') && inbox[e.side].taps > 0) inbox[e.side].taps -= 1;
      sent.push(e);
      handle(e);
    }
    if (s.over) { send(); decided(); }
  }
  function loop(ts) {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    if (isHost()) {
      if (clock && !pause && !s.over) {
        acc += Math.min(MAX_CATCHUP, lastTs ? ts - lastTs : DUEL.STEP);
        while (acc >= DUEL.STEP && !s.over && !pause) { acc -= DUEL.STEP; step(); }
      }
      lastTs = ts;
      if ((clock || s.over) && performance.now() - lastSend >= DUEL.SEND_MS) send(); // auch in der Pause und nach dem Ende (Gast verpasst nichts)
    } else {
      if (guestTaps > 0 && live() && !pause && link.send({ t: 'di', taps: guestTaps })) guestTaps = 0;
      const now = performance.now();
      if (now - lastEcho >= ECHO_MS && !s.over) { lastEcho = now; link.send({ t: 'di', echo: Math.round(now * 10) / 10, ...(rtt != null && { rtt: Math.round(rtt) }) }); }
      // Host antwortet nicht mehr, obwohl die Verbindung steht und er in der App ist (hat in einer Funkstille beendet): ohne Wertung
      if (gotSnap && live() && !netDown && !peerAway && link.state === 'connected' && now - snapAt > SILENT_MS) { for (const e of endDuel(s, null, 'lost')) handle(e); decided(); }
    }
    render();
  }
  function onVisibility() { if (document.hidden && isHost() && clock && !s.over && !pause) setPause(true); }

  // ---------- Ende ----------
  function decided() {
    if (reported || !s.over) return;
    reported = true;
    outcome = duelOutcome(s, mine);
    onResult?.({ ...outcome });
    sfx.play(outcome.won ? 'win' : 'lose');
    later(showOverlay, 900);
  }
  function countUp(node, target) {
    cancelAnimationFrame(countRaf);
    const t0 = performance.now();
    const tickUp = now => {
      const k = Math.min(1, (now - t0) / 1000);
      setText(node, `+${fmt(Math.round(target * (1 - (1 - k) ** 3)))} Sats`);
      countRaf = k < 1 ? requestAnimationFrame(tickUp) : 0;
    };
    countRaf = requestAnimationFrame(tickUp);
  }
  function showOverlay() {
    if (ended) return;
    const o = outcome, r = duelReward(o), foeName = partner();
    const kind = o.reason === 'lost' ? 'lost' : o.won ? 'win' : o.draw ? 'draw' : 'lose';
    overlay.className = `d-overlay ${kind}`;
    const ps = { me: names[role], foe: names[role === 'host' ? 'guest' : 'host'] };
    for (const at of ['me', 'foe']) {
      const p = overlay.querySelector(`.d-end-p.${at}`);
      p.querySelector('img').src = sprite(ps[at]?.avatar);
      setText(p.querySelector('b'), ps[at]?.name || '');
    }
    const time = o.reason === 'timeout' ? 'Die Zeit ist um. ' : '';
    const T = {
      win: ['Gewonnen!', `${time}${o.reason === 'quit' ? `${foeName} hat aufgegeben. ` : ''}${foeName} zahlt die Runde!`],
      lose: [o.reason === 'quit' ? 'Aufgegeben' : 'Verloren', o.reason === 'quit' ? 'Du zahlst die Runde. Wer aufgibt, kriegt nichts.' : `${time}Du zahlst die nächste Runde Dosenbier.`],
      draw: ['Unentschieden', `${time}Unentschieden. Jeder zahlt sein Dosenbier selbst.`],
      lost: ['Abgebrochen', 'Duell abgebrochen (Verbindung weg). Keine Wertung.'],
    }[kind];
    setText(overlay.querySelector('.title'), T[0]);
    setText(overlay.querySelector('.sub'), T[1]);
    setText(overlay.querySelector('.note'), r.xp ? `+${r.xp} XP` : o.won && o.reason === 'quit' ? 'Unter 30 Sekunden gibt es dafür nichts.' : '');
    const gain = overlay.querySelector('.sats-gain');
    gain.classList.toggle('hidden', !r.sats);
    setText(gain, '+0 Sats');
    if (r.sats) later(() => countUp(gain, r.sats), 600);
    const conf = overlay.querySelector('.confetti');
    conf.innerHTML = '';
    if (kind === 'win') { confetti(conf, 36); later(() => btcRain(conf, { n: 20, ms: 2600, size: 40 }), 400); }
  }
  // Host in einer Funkstille: erst weiter, wenn die Verbindung wieder steht (dann geht das Ende sicher raus) oder endgültig weg ist;
  // sonst bekäme der Gast das Ende nie und stünde ohne Wertung da
  function finishScreen() {
    if (ended || !s?.over) return;
    if (isHost() && link.state === 'lost') {
      leaving = true;
      const btn = overlay.querySelector('.d-done');
      btn.disabled = true; setText(btn, `Warte auf ${partner()} …`);
      return;
    }
    ended = true;
    const o = { ...outcome };
    stop();
    onEnd?.(o);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf); raf = 0;
    cancelAnimationFrame(countRaf); countRaf = 0;
    clearInterval(readyTimer); readyTimer = 0;
    for (const id of timers) clearTimeout(id);
    timers.clear(); pending.clear();
    offs.forEach(off => off()); offs = [];
    window.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onVisibility);
    fx.innerHTML = ''; rainBox.innerHTML = ''; flying = { a: null, b: null }; el.querySelectorAll('.d-bar .fx-banner').forEach(b => b.remove());
    for (const at of ['me', 'foe']) { helpers[at].innerHTML = ''; helpers[at].className = `d-helpers ${at} hidden`; }
    flash.className = 'd-flash'; say.classList.add('hidden'); sw.classList.add('hidden');
    intro.classList.add('hidden'); overlay.classList.add('hidden'); wait.classList.add('hidden');
    overlay.querySelector('.confetti').innerHTML = '';
    comboN = 0; combo$.className = 'd-combo hidden';
    down = null;
  }

  function showIntro() {
    const ps = { me: names[role], foe: names[role === 'host' ? 'guest' : 'host'] };
    for (const at of ['me', 'foe']) {
      const p = intro.querySelector(`.d-intro-p.${at}`);
      p.querySelector('.d-face').src = sprite(ps[at]?.avatar);
      setText(p.querySelector('b'), ps[at]?.name || '');
      buildRow(p.querySelector('.d-team'), s[at === 'me' ? mine : foe].team);
    }
    countdown.textContent = ''; countdown.className = 'd-countdown';
    intro.classList.remove('hidden');
    COUNTDOWN.forEach((t, i) => later(() => { setText(countdown, t); countdown.classList.toggle('go', i === COUNTDOWN.length - 1); anim(countdown, 'pop', 450); }, INTRO_LEAD + i * COUNT_STEP));
    later(() => { intro.classList.add('hidden'); introDone = true; maybeClock(); render(); }, CONST.INTRO_MS);
  }

  function start(opts) {
    stop();
    ({ link, role } = opts);
    role = role === 'guest' ? 'guest' : 'host';
    mine = role === 'host' ? 'a' : 'b'; foe = other(mine);
    names = { host: opts.names?.host || {}, guest: opts.names?.guest || {} };
    const a = duelFighters(opts.teams?.host), b = duelFighters(opts.teams?.guest);
    s = createDuel({ a: a.length ? a : duelFighters([{ id: 'christian' }]), b: b.length ? b : duelFighters([{ id: 'christian' }]) });
    running = true; introDone = false; peerReady = false; clock = false; gotSnap = false;
    pause = null; netDown = link.state === 'lost'; peerAway = false; inbox = { a: freshIn(), b: freshIn() }; guestTaps = 0; sent = [];
    outcome = null; reported = false; ended = false; lastTs = 0; acc = 0; lastSend = 0; specialsKey = '';
    stunTextAt = -Infinity; lastHit = -Infinity; rtt = null; lastEcho = -Infinity; echoIn = null;
    foeHitAt = -Infinity; specialAt = -Infinity; snapAt = 0; leaving = false;
    overlay.className = 'd-overlay hidden';
    const done = overlay.querySelector('.d-done'); done.disabled = false; setText(done, 'Weiter');
    buildRow(rows.me, s[mine].team); buildRow(rows.foe, s[foe].team);
    setText(bars.foe.querySelector('.d-player'), partner());
    for (const at of ['me', 'foe']) faces[at].dataset.key = '';
    buildSpecials();
    offs = [link.on('message', onMessage), link.on('lost', onLost), link.on('connected', onConnected), link.on('disconnected', onGone)];
    window.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onVisibility);
    if (!isHost()) {
      link.send({ t: 'dready' });
      readyTimer = setInterval(() => { if (!gotSnap && running) link.send({ t: 'dready' }); }, READY_MS);
    }
    render();
    showIntro();
    raf = requestAnimationFrame(loop);
    if (!a.length || !b.length) { for (const e of endDuel(s, null, 'lost')) handle(e); decided(); } // ungültiges Team: keine Wertung
  }

  return { start, stop };
}
