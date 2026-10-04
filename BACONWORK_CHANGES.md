# Branch `BaconWork` — Änderungen gegenüber `main`

Stand: 01.10.2026 · 10 Commits · Basis: `main` bei `671e60c` (#357). `main` hat seitdem nur einen
Bench-Commit (`664c27b`) dazubekommen, der Branch lässt sich konfliktfrei mergen.

Diese Datei fasst zusammen, **was sich für Spieler, Art und Entwicklung ändert**. Die Details
stehen in den Commit-Messages (`git log main..BaconWork`).

## Auf einen Blick

| Bereich | Änderung | Spürbar im Spiel? |
|---|---|---|
| Gegner-KI | Sichtlinie: kein Reagieren/Schießen durch Felsen und Säulen | ja |
| Gegner-KI | Verfolgung mit Gedächtnis und Wegfindung um Hindernisse | ja |
| HUD | Dauerhafte Tastenanzeige (Fire, Bomb, Use, Map) unten links | ja |
| Death Screen | Zeigt, wer einen getötet hat | ja |
| Rendering | Welt wird in Bildschirmauflösung gerendert | ja (feinere Licht-/Schattenkanten) |
| Sprites | Hochauflösende Sprites über `name@2x.png` möglich | ja (Maß-Krüge) |
| Art-Workflow | `npm run sprites:replace`: Sprites per Ordner austauschen | nein (Werkzeug) |
| Doku | Game Design Document, Sprite-Übersicht mit Farbpalette | nein |

---

## 1. Gegner-KI

### Sichtlinie (`src/sim/room/geometry.ts`, `src/sim/systems/enemy.ts`)
- **Vorher:** Nur Hopfenranken (Floor 2) blockierten die Sicht, und nur beim Schießen. Gegner reagierten
  und schossen durch Felsen.
- **Jetzt:** Alle festen Hindernisse (Felsen, Säulen, Wände, Raumlücken) blockieren die Sicht.
  - Gezielte Schüsse fallen ohne Sichtlinie aus (Rundum-Ringe wie die Blaskapelle bleiben).
  - `whenPlayerWithin` feuert nur mit Sicht; ein verdeckter Spieler zählt als außer Reichweite.
- Fässer, Heuballen und Maibäume sind Objekte, keine Blöcke, und blockieren die Sicht **nicht**.

### Verfolgung mit Gedächtnis und Wegfindung (`src/sim/room/pathfind.ts` neu, `enemy.ts`)
Betrifft alle Gegner mit `walkTowardPlayer` (Kellerassel, Traktor, Schimmelfleck, Bauer und die Bosse
Große Kellerassel und Der Stier).

- **Vorher:** Luftlinie zum Spieler, keine Wegfindung, also Laufen gegen Felsen.
- **Jetzt:**
  1. In Sicht: Der Gegner läuft direkt auf den Spieler zu und merkt sich dessen Position.
  2. Sicht verloren: Er läuft per Wegfindung zur gemerkten Position, um Hindernisse herum.
  3. 45 Ticks (0,75 s) Nachlaufzeit: Der gemerkte Punkt folgt in dieser Zeit noch dem echten Spieler.
     Wer sich hinter eine Wand duckt und weiterläuft, wird nicht an der Ecke gesucht.
  4. Passt der Körper nicht an einer Ecke vorbei (obwohl die Sichtlinie frei ist), nimmt er die
     Wegfindung statt hängenzubleiben.
  5. Angekommen und nichts gesehen: Er irrt mit halber Geschwindigkeit umher.
- Sichtgesteuerte Gegner (z. B. der Bauer) brechen die Verfolgung erst nach der Suche ab.
- **Wegfindung:** BFS auf einem Raster aus halben Kacheln (8 Einheiten), Begehbarkeit über
  `RoomGeometry.isClear` mit dem Körperradius des Gegners, Wegpunkt = weitester frei erreichbarer
  Punkt auf dem Weg, Neuplanung alle 12 Ticks (verteilt), keine Allokation im Hot Path.
- `enemyMotion` wächst von 6 auf 12 Felder (Gedächtnis, Wegpunkt, Ticks ohne Sicht), wird beim
  Spawn zurückgesetzt.
- Anlauf-Attacken (Bauer, Kuh, Bierratte) bleiben absichtlich geradlinig auf einen festen Punkt.

**Hinweis für Balancing:** Auch Bosse verhalten sich so. Hinter Säulen schießen sie nicht, und sie
verfolgen um Säulen herum. Regler in `enemy.ts`: `MEMORY_GRACE_TICKS`, `UNSIGHTED_WANDER_SPEED`,
`UNSIGHTED_WANDER_TURN_TICKS`, `REPATH_TICKS`.

## 2. HUD und Death Screen

### Tastenanzeige (`src/render/controls-hud.ts` neu, `src/app/main.ts`)
- Unten links stehen dauerhaft `[Space] Fire`, `[E] Bomb`, `[Q] Use`, `[Tab] Map`.
- Folgt der Belegung (Umbelegen in den Einstellungen) und dem Gerät (Gamepad-Glyphen wie `[RT]`).
- Aktionsnamen in Deutsch, Englisch und Bairisch aus den vorhandenen Übersetzungen.
- Auf Touch ausgeblendet.

### „Getötet von …“ (`src/sim/game/attacker.ts` neu, `sim.ts`, `impact.ts`, `bombs.ts`, `game-over.ts`)
- Jede Schadensquelle merkt sich den Angreifer: Berührung und Nahkampf (der Gegner), gegnerische
  Schüsse (Projektile kennen jetzt ihren Schützen), Böller (der Werfer), das eigene Bierfassl,
  sonstige Gefahren. Mit dem Tod wird der Wert eingefroren (`GameSim.killedBy`).
- Der Death Screen zeigt unter der Zusammenfassung z. B. „Getötet von Bierratte“.
- Neue Texte: `ui.gameOver.killedBy`, `…killedByOwnBomb`, `…killedByOther` (de/en/bar). Die
  bairischen Formulierungen sollten noch jemand gegenlesen.

## 3. Rendering und hochauflösende Sprites (`docs/DECISIONS.md` #112)

### Sprites mit `@2x`
- Eine Datei `name@2x.png` (oder `@3x`/`@4x`, auch Strips) steht **genauso groß** im Raum wie
  `name.png`, mit doppelter Auflösung. Bestehende 1x-Sprites funktionieren unverändert.
- Art-Pipeline (`tools/art/scan.mjs`, `validate.mjs`, `build.mjs`): erkennt die Dichte, prüft die
  Größenregeln auf der Basisgröße, schreibt `density` ins Atlas-Manifest.
- Renderer: `Texture.density` / `displayWidth` / `displayHeight` (`src/render/gfx/texture.ts`); alle
  Stellen, die Sprite-Größen im Raum berechnen, nutzen die Anzeigegröße.
- Ein Sprite darf nur in einer Auflösung existieren (`kuh.png` neben `kuh@2x.png` bricht den Build).
- Der Pixel-Editor speichert weiterhin nur 1x-Dateien.

### Welt in Bildschirmauflösung
- **Vorher:** Die 3D-Welt wurde fest in 640×360 gerendert und hochskaliert, zusätzliche Details in
  Sprites wären verloren gegangen.
- **Jetzt:** Der Zeichenpuffer ist 640×360 × ganzzahliger Bildschirmfaktor (z. B. 1920×1080).
  Kamera, HUD und alle Koordinaten bleiben in 640×360, Größen ändern sich nicht.
- Sichtbarer Nebeneffekt: Licht, Schatten und Raumkanten sind feiner statt 640×360-grob.
- Zurückschalten: `RENDER_AT_DISPLAY_RESOLUTION = false` in `src/render/resolution.ts`.
- `GloomBlur` passt seine Puffergröße an; der Release-Smoke-Test erwartet „640×360 × n“.

### Neue Art
- `pickup-mass-full` und `pickup-mass-half` als `@2x` (48×48 Datei, 24×24 im Spiel), Farben auf die
  Palette angepasst.

## 4. Werkzeuge und Doku

| Was | Wo | Befehl |
|---|---|---|
| Sprites per Ordner austauschen, alte archivieren, alles-oder-nichts-Prüfung | `tools/art/replace-sprites*.mjs`, `sprites-changed/README.md` | `npm run sprites:replace` (`-- --dry-run`) |
| Sprite-Übersicht: alle Objekte mit Sprite, Dateiname zum Kopieren, Farbpalette mit Farbfeldern und Schattierungen | `tools/art/sprite-overview.mjs` → `SPRITE_OVERVIEW.md`, `docs/palette-swatches/` | `npm run docs:sprites` |
| Game Design Document | `Kellerbier — Game Design Document.md` | – |
| Sprite-Konvention `@2x` | `assets/sprites/README.md` | – |

`.gitignore`: `sprites-changed/*` (außer README) und `sprites-archive/` sind nur lokal.

## 5. Nicht mehr enthalten

- „Bierfassl bleibt liegen“ (`83d2178`) wurde wieder zurückgenommen (`f8e15a5`). Das Rollen beim
  Ablegen in Bewegung ist gewolltes Verhalten.

## 6. Tests

Alle 2731 Tests grün (Typecheck, Lint, Release-Smoke-Test ebenfalls). Neu:

| Datei | Prüft |
|---|---|
| `tests/unit/pathfind.test.ts` | Wegfindung: freie Sicht, um eine Wand, abgeschlossener Bereich |
| `tests/unit/beat-and-sight.test.ts` (erweitert) | Sicht durch Felsen, Reagieren, Umherirren, Suche um eine Wand, Verfolgung hinter einer Säule im echten Raum |
| `tests/unit/killed-by.test.ts` | Killer bei Schuss, Berührung, eigenem Fass; Textzeile |
| `tests/art/density.test.ts` | `@2x`-Namen, Größenprüfung, Texturgröße |
| `tests/art/replace-sprites.test.ts` | Ersetzen, Archiv, `@2x`-Wechsel, Rollback, unbekannte/doppelte Namen |
| angepasst: `scan`, `sprite-coverage`, `sprite-scale`, `resolution` | `@2x`-Bewusstsein, Render-Skalierung |

## Zum Ausprobieren

```
npm run dev              # Dev-Server
npm run build:release    # Einzeldatei-Build: release/Kellerbier.html (Doppelklick)
```

Gute Stellen zum Anschauen: ein Raum mit Säulen (Floor 1, `cellar-pillars`) für Sichtlinie und
Verfolgung; sterben für die Death-Screen-Zeile; ein Maß-Krug für die `@2x`-Grafik.
