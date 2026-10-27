// v12: Baustein „Anzeige, Shop, Buch, Kampfanbindung" (Spec v12 §1–§3, §7): reine Helfer aus js/ad.js, Markup, Versionsstand
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CONST, SHOP } from '../js/data.js';
import { hms, dealLeft, DEAL_MS, adRefund, sellBook } from '../js/ad.js';
import { emptySaveV3, buyItem } from '../js/progress.js';
import { checkAchievements } from '../js/quests.js';

const read = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('v12: hms „00:09:58", Badge ab Minute, Shop-Countdown läuft alle 3 h von vorn', () => {
  assert.equal(hms(598_000), '00:09:58');
  assert.equal(hms(0), '00:00:00');
  assert.equal(hms(-5), '00:00:00');
  assert.equal(hms(CONST.AD_MS), '00:10:00');
  assert.equal(hms(3 * 3_600_000 - 1000), '02:59:59');
  assert.equal(hms(432_000).slice(3), '07:12');
  assert.equal(DEAL_MS, 3 * 3_600_000);
  assert.equal(dealLeft(0), DEAL_MS);
  assert.equal(dealLeft(1000), DEAL_MS - 1000);
  assert.equal(dealLeft(DEAL_MS + 1000), DEAL_MS - 1000, 'von vorn');
  assert.equal(hms(dealLeft(1000)), '02:59:59');
});

test('v12 §2: Rückzahlung bei Sieg = Verlust + 10 %, abgerundet; 0 bleibt 0', () => {
  assert.equal(adRefund(0), 0);
  assert.equal(adRefund(300), 330);
  assert.equal(adRefund(745), 745 + 74);
  assert.equal(adRefund(1), 1);
});

test('v12 §3: Buch kaufen, verkaufen (10 Sats, Item weg), erneut kaufen; Erfolg „Reingefallen" bleibt', () => {
  const s = emptySaveV3();
  s.sats = 10_000;
  assert.deepEqual(sellBook(s), { ok: false, reason: 'keins' });
  assert.equal(s.sats, 10_000);
  assert.deepEqual(buyItem(s, 'investmentcode'), { ok: true });
  assert.equal(s.sats, 5001);
  assert.deepEqual(checkAchievements(s).map(a => a.id), ['reingefallen']);
  assert.deepEqual(sellBook(s), { ok: true, sats: SHOP.find(i => i.id === 'investmentcode').sell });
  assert.equal(s.sats, 5001 + CONST.ACHIEVEMENT_SATS + 10, "Erfolg zahlt mit");
  assert.equal(s.items.investmentcode, 0);
  assert.deepEqual(checkAchievements(s), [], 'einmal reicht');
  assert.deepEqual(buyItem(s, 'investmentcode'), { ok: true }, 'erneut kaufen geht');
  assert.equal(s.items.investmentcode, 1);
});

test('v12 §1/§7: Karte, Badge und Debug-Knopf im Markup; Version 14 überall gleich', () => {
  const html = read('index.html');
  for (const sel of ['id="ad"', 'class="ad-head"', 'class="ad-timer"', 'class="ad-badge', 'class="ad-no"', 'class="ad-buy primary"', 'id="dbg-ad"', 'art/ad-cover.png', 'art/ad-car.png']) assert.ok(html.includes(sel), sel);
  assert.match(html, /Rückgabe bis 18 Uhr/);
  assert.match(html, /4,9\/5 von über 1\.000 Millionären · 2 Geschenke · Anwendbar in ganz Deutschland/);
  assert.match(read('js/app.js'), /const VERSION = 14;/);
  assert.match(read('js/screens.js'), /export const VERSION = 'v14';/);
  const v = JSON.parse(read('version.json'));
  assert.equal(v.v, 14);
  assert.match(v.apk, /app-v14\/RuetherGO\.apk$/);
  assert.equal(v.news.length, 4);
  assert.match(read('native/android/app/build.gradle'), /versionCode 14\s+versionName "14"/);
});
