# Rüther GO

Pokémon GO, aber man fängt Rüthers. Handy-Web-App, kein Server.

## Starten

    python -m http.server 8000

Dann `http://localhost:8000` öffnen. Auf dem Handy braucht die Ortung HTTPS,
also auf einen statischen Host (z.B. GitHub Pages) legen.

## Test-Modus

`?debug=1` an die URL hängen oder siebenmal auf den Titel tippen. Dann kann
man sich an die drei Arenen beamen.

## Tests

    node --test test/*.test.mjs

## Sprites neu erzeugen

    python tools/pixelate.py

Fotos liegen im Projektordner (nicht im Git). Ramona hat noch kein Foto und
einen Platzhalter.
