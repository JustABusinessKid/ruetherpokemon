// v12: Moshes Anzeige auf der Karte (Spec v12 §1). Reine Funktionen ohne DOM, lokale Uhr, testbar.
// save.ad = { until, next, extended }: until = Ende des Fensters, extended = schon einmal um AD_EXTEND_MS verlängert,
// next = Start des nächsten Fensters (0, solange das Fenster läuft). null = erstes Fenster beim nächsten Kartenbesuch.
// app.js, jede Sekunde mit updateBanners: save.ad = nextWindow(save.ad, now) (persistieren, wenn ein neues Objekt kommt),
// dann adState(save.ad, now) zeichnen. „VERLÄNGERT! NUR FÜR DICH." steht in den ersten AD_NOTE_MS der Phase extended
// (remaining > AD_EXTEND_MS − AD_NOTE_MS), so überlebt die Kopfzeile auch ein Neuladen.
import { CONST, SHOP } from './data.js';

export const AD_GONE_MS = 3000; // „LEIDER VERGRIFFEN" steht 3 s, dann ist die Karte weg
export const AD_NOTE_MS = 2000; // „VERLÄNGERT! NUR FÜR DICH." 2 s

export const openWindow = now => ({ until: now + CONST.AD_MS, next: 0, extended: false });

// Schaltet das Fenster weiter, bis nichts mehr fällig ist: fehlt es oder ist next erreicht → neues Fenster (Debug „Anzeige jetzt"
// ruft openWindow direkt); abgelaufen und noch nicht verlängert → until + AD_EXTEND_MS; Verlängerung abgelaufen → next würfeln
// (AD_GAP_MIN + rand × (AD_GAP_MAX − AD_GAP_MIN)). Gibt dasselbe Objekt zurück, wenn nichts fällig ist.
export function nextWindow(ad, now, rand = Math.random) {
  if (!ad || (ad.next && now >= ad.next)) return openWindow(now);
  if (now < ad.until || ad.next) return ad;
  if (!ad.extended) return nextWindow({ until: ad.until + CONST.AD_EXTEND_MS, next: 0, extended: true }, now, rand);
  return { ...ad, next: now + CONST.AD_GAP_MIN + Math.floor(rand() * (CONST.AD_GAP_MAX - CONST.AD_GAP_MIN)) };
}

// Zustand ohne Nebenwirkung. open/extended = Karte mit Countdown (remaining bis until), gone = „LEIDER VERGRIFFEN"
// (remaining bis zum Ausblenden), closed = nichts zu sehen (remaining bis next, 0 wenn unbekannt).
export function adState(ad, now) {
  if (!ad) return { phase: 'closed', remaining: 0 };
  if (now < ad.until) return { phase: ad.extended ? 'extended' : 'open', remaining: ad.until - now };
  if (now < ad.until + AD_GONE_MS) return { phase: 'gone', remaining: ad.until + AD_GONE_MS - now };
  return { phase: 'closed', remaining: Math.max(0, (ad.next || 0) - now) };
}

// ---------- Anzeige-Baustein (app.js, screens.js) ----------
// „00:09:58" für Kopfzeile, Badge (ab Minute) und Shop-Countdown
export const hms = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return [s / 3600, (s / 60) % 60, s % 60].map(n => String(Math.floor(n)).padStart(2, '0')).join(':'); };
// Shop §3: „Angebot endet in 02:59:59", läuft alle 3 h von vorn (rein optisch, lokale Uhr)
export const DEAL_MS = 10_800_000;
export const dealLeft = now => DEAL_MS - (now % DEAL_MS);
// §2: Sieg über Moshe zahlt die im Kampf verlorenen Sats plus AD_RENDITE zurück (0 bleibt 0: keine Zeile)
export const adRefund = lost => lost + Math.floor(lost * CONST.AD_RENDITE);
// §3: Rückkauf „gebraucht, ohne Lesespuren" für item.sell; danach ist das Buch weg (Quest wieder gesperrt), erneut kaufen geht
export function sellBook(save) {
  if (!(save.items?.investmentcode >= 1)) return { ok: false, reason: 'keins' };
  const sats = SHOP.find(i => i.id === 'investmentcode').sell;
  save.items.investmentcode = 0;
  save.sats += sats;
  return { ok: true, sats };
}
