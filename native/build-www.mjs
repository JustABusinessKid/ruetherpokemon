// Kopiert das Web-Spiel (Repo-Root) nach native/www – daraus baut Capacitor die Android-App.
import { cpSync, rmSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '..'), out = resolve(here, 'www');
rmSync(out, { recursive: true, force: true }); mkdirSync(out);
for (const f of ['index.html', 'style.css', 'manifest.json', 'css', 'js', 'art', 'sprites', 'vendor']) cpSync(resolve(root, f), resolve(out, f), { recursive: true });
console.log('www bereit');
