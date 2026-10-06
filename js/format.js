// Anzeige-Texte (rein, getestet in test/format.test.mjs).
export const hashrateText = power => `${power.toFixed(2).replace('.', ',')} TH/s`;
// Spruch in der dritten Person („Viktor ist zur Börse gelaufen.") ist Erzähltext, keine wörtliche Rede des Rüthers
export const isNarration = (line, name) => name.split(' ').includes(line.split(' ')[0]);
export const reachText = (dist, range) => `Noch ${Math.max(1, Math.ceil(dist - range))} m näher ran`;
