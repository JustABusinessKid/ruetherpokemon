// v11 §5 Quest-Rennen: beide spielen dieselbe Mission (gleiches setup, rng = seededRng(seed)) lokal parallel.
// Netz (Lobby): rs { done, total, over, result } jede Sekunde, rend { result, score, timeMs } am Ende.
export const RACE = { WIN_SATS: 1000, WIN_XP: 100, PROGRESS_MS: 1000 };

// Werte des Partners sind Daten von außen: kaputte Zahlen zählen als 0 Punkte bzw. unendlich langsam
const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

// a, b = { result, score, timeMs } → 'a' | 'b' | 'draw'
// 1. höherer score  2. result 'success' vor allem anderen  3. bei zwei Erfolgen kleinere timeMs  4. sonst 'draw'
// Die Zeit zählt nur zwischen zwei Erfolgen: bei Abbruch oder Scheitern hieße kleinere Zeit „früher hingeschmissen“ (kein Bonus-Farmen)
export function raceWinner(a, b) {
  const sa = num(a?.score, 0), sb = num(b?.score, 0);
  if (sa !== sb) return sa > sb ? 'a' : 'b';
  const wa = a?.result === 'success', wb = b?.result === 'success';
  if (wa !== wb) return wa ? 'a' : 'b';
  if (wa) {
    const ta = num(a?.timeMs, Infinity), tb = num(b?.timeMs, Infinity);
    if (ta !== tb) return ta < tb ? 'a' : 'b';
  }
  return 'draw';
}
