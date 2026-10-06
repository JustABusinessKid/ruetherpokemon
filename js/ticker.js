// Bitcoin-Kurs in der Kartenkopfzeile (Spec §5): CoinGecko alle 60 s, Timeout 6 s, Fehler → ausgeblendet.
// refresh() zeichnet sofort neu (Team-Anführer kann gewechselt haben) und lädt nach, wenn der Kurs älter als 60 s ist.
const API = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=eur&include_24hr_change=true';
const EVERY = 60_000, TIMEOUT = 6000;
const de = (n, digits) => n.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits });

export function createTicker({ el, getLeaderId }) {
  let btc = null, at = 0, busy = false;

  function render() {
    el.classList.toggle('hidden', !btc);
    if (!btc) return;
    const ch = btc.eur_24h_change;
    el.innerHTML = `<span class="t-price"><img class="ico ico-sm" src="art/icon-btc.png" alt="₿">${de(btc.eur, 0)} €</span>`
      + (Number.isFinite(ch) ? `<span class="t-change ${ch >= 0 ? 'up' : 'down'}">${ch >= 0 ? '+' : '−'}${de(Math.abs(ch), 1)} %</span>` : '')
      + (getLeaderId() === 'christian' ? '<span class="t-christian" title="Christian-Effekt">+70 % <small>Christian-Effekt</small></span>' : '');
  }
  async function load() {
    if (busy) return;
    busy = true;
    try {
      const res = await fetch(API, { signal: AbortSignal.timeout(TIMEOUT) });
      const b = res.ok ? (await res.json())?.bitcoin : null;
      btc = Number.isFinite(b?.eur) ? b : null;
    } catch { btc = null; }
    at = Date.now(); busy = false;
    render();
  }
  setInterval(() => { if (!document.hidden) load(); }, EVERY);

  return {
    refresh() { render(); if (Date.now() - at >= EVERY) load(); },
  };
}
