# Branch `Bacon` — Änderungen gegenüber `main`

Stand: 10.10.2026 · Basis: `main` bei `5f1d11ec` (nach dem Merge von #486). Neue Grafiken
(Zapfhahn, Bierfassl), Schimmel-Mechanik, Gegner-Tab in der Sammlung, Debug-Build und kleinere
Effekte. Jede Änderung wurde im laufenden Spiel (Headless-Browser) oder per Unit-Test
gegengeprüft; wo beides fehlt, steht es dabei.

## Auf einen Blick

| Bereich | Änderung | Spürbar im Spiel? |
|---|---|---|
| Zapfhahn | Neue Grafik, dreht sich zur Schussrichtung, Hebel und Bierstrahl animiert | ja |
| Bierfassl | Einzel- und Doppelfass als 5-Liter-Metallfass mit „B“/„K“ | ja |
| Schimmel | Fleck verlangsamt Alois, zieht Leben ab (geliehen), grüner Schimmer | ja |
| Schnupftabak | Alois' Gesicht wird beim Aufbau des Niesens rot | ja |
| Bombe | Eigener Explosions-Sound für jede Explosion | ja |
| Raumdeko | Deko unter Steinen wird verschoben statt überlagert | ja |
| Sammlung | Neuer Tab „Gegner“ (Spielstand v14) | ja |
| Debug | `release/Kellerbier-debug.html` mit Spawn-Menü (F8) | nur im Debug-Build |

---

## 1. Zapfhahn (`tools/art/authoring/zapfhahn-views.mjs`, neu)
- Grafik vom Nutzer gezeichnet, auf die Keller-Palette gesetzt (rotes Knauf → Braun, da der
  Keller kein Rot hat). Seitenansicht aus dem Entwurf, Vorder- und Rückansicht abgeleitet.
  Leinwand 36×40 (Säule gegenüber dem Entwurf zweimal gekürzt), Säule mittig auf dem Collider.
- Fünf Bilder pro Ansicht: Ruhe, Hebel halb/ganz unten (`telegraph`), zwei Gieß-Bilder
  (`attack`). Der Bierstrahl kommt unter dem hellgrauen Hahn heraus.
- Neue Ausrichtung `facing: 'aim'` (`sim/enemy/definition.ts`, `registry.ts`): ein stehender
  Schütze dreht seine Ansicht zu der Achse, auf die er zielt (gesperrter Punkt im Telegraph,
  sonst der Spieler), und spielt `attack`, solange er in einem feuernden Zustand ist
  (`enemyFiring`, `render/animation/state.ts`, `render/entities.ts`).
- Im Spiel geprüft (vier Zapfhähne um Alois, alle vier Richtungen, Hebel und Strahl).

## 2. Bierfassl-Pickups (`assets/sprites/common/characters/pickup-bierfassl*@3x.png`)
- 5-Liter-Partyfass aus Metall, bauchig, durchgehende 1-Pixel-Kontur. Vorne das „B“ aus dem
  Entwurf des Nutzers, beim Doppelfass trägt das hintere Fass ein „K“.
- In Bildschirmgröße gezeichnet (13×16, als `@3x` gespeichert): feinere Linien fielen durch die
  Kamera-Verkleinerung stellenweise weg.
- Alte Grafiken und der Holzfass-Entwurf liegen in `sprites-archive/2026-10-10_15-01-01/`.
- Im Spiel geprüft (neben Alois).

## 3. Schimmel (`GameSim.stepMould`, `render/mould-miasma.ts`, `render/mould-glow-view.ts`, neu)
- Neues Gegnerfeld `mould: 'patch' | 'spore'` (Schimmelfleck / Schimmelspore).
- Solange Schimmel im Raum lebt, sinkt Alois' Tempo in 10 s auf 50 % (Stat-Quelle „Schimmel“).
- Bei 50 % und lebendem Fleck: alle 5 s ein Lebenssegment weniger, nie das letzte.
- Nur noch Sporen: kein Schaden mehr, Verlangsamung bleibt.
- Aller Schimmel tot (oder Raum verlassen): Tempo und alle abgezogenen Segmente kommen zurück.
- Grüner, leicht wabernder Schleier über dem Raum, solange ein Fleck lebt; über jedem Fleck ein
  grünes Bodenglühen mit aufsteigenden Schwaden als Orientierung in großen Räumen.
- Test: `tests/unit/mould.test.ts`. Schleier und Schimmer im Spiel geprüft; Verlangsamung und
  Schaden nur per Test (der Testbrowser lief zu langsam für 15 s Spielzeit).

## 4. Schnupftabak: roter Kopf (`render/world/billboard.ts`, `render/player-view.ts`)
- Alois' Gesicht färbt sich mit dem Niesen-Aufbau rot, voll rot beim Luftanhalten, nach dem
  Niesen sofort normal. Neue `Billboard.enableHeadTint` (Shader-Streifen nur für Alois).
- Das bisherige gelblich-weiße Pulsieren des ganzen Körpers ist entfernt
  (`SNEEZE_GLOW_TINT` gelöscht).
- Im Spiel geprüft (Aufbau-Stufen per Screenshot).

## 5. Explosions-Sound (`content/audio/sfx.ts`, `sim/events/item-cues.ts`)
- Bisher hatte keine Explosion einen eigenen Sound. Neu: `item-explosion`, ausgelöst in
  `GameSim.triggerExplosion` (Bierfassl, Böller, explodierende Gegner).
- Nur per Code geprüft, nicht angehört.

## 6. Raumdeko unter Steinen (`render/world/scenery.ts`)
- Reine Deko (Kisten, Fässer …), deren Feld einen Block, eine Leerfläche, eine Grube oder andere
  Deko überlappt, wird auf den nächsten freien Platz verschoben (Ringsuche in ganzen Kacheln,
  ohne Zufall). Frei stehende Deko bleibt, wo sie angelegt ist.
- Nicht eigens im Spiel geprüft.

## 7. Sammlung: Tab „Gegner“ (`render/collection-screen.ts`, `app/collection.ts`)
- Zwei Tabs, Items und Gegner. Wechsel über die Tab-Leiste (vom obersten Rasterplatz nach
  oben, dann links/rechts oder Enter), Q/E bzw. Schultertasten, oder Mausklick.
- Noch nicht getroffene Gegner als Silhouette; Details: Name, Leben, Berührungsschaden, bei
  Bossen „Boss“, Titel und Beiname. Bilder werden auf die Zelle verkleinert.
- Ausgeblendet: Ladenbesitzer, Asselsegment, Bieber-Stämme.
- Spielstand v14: `discoveredEnemies` (Migration v13 → v14, startet leer). Ein Gegner gilt als
  getroffen, sobald er lebend im Raum ist (`EnemyDiscovery`).
- Bairische Texte der neuen Schlüssel sind vorerst deutsch.
- Test: `tests/unit/collection-enemies.test.ts`; Tab-Wechsel und Raster im Spiel geprüft.

## 8. Debug-Build (`vite.debug.config.ts`, `src/debug/spawn-panel.ts`, neu)
- `npm run build:release` baut zusätzlich `release/Kellerbier-debug.html` (Release plus
  `__KELLERBIER_DEBUG__`, Hilfsordner `release-debug/`, `tools/release/copy-debug.mjs`).
- Spawn-Menü über F8 oder den Hinweis oben rechts: Gegner spawnen, Item geben, Pickup ablegen,
  alle Gegner töten, volles Leben. Bedienung steht im Menü; Esc schließt es.
- Auch im Dev-Server verfügbar, nicht im Release (geprüft).

## 9. Sonstiges
- `SPRITE_OVERVIEW.md` neu erzeugt (`npm run docs:sprites`).

---

# Branch `Bacon` (zweite Runde, gemergt mit #486)

Stand: 09.10.2026 · Basis: `main` bei `67211575` (nach dem Merge von #485). Performance,
Nebel-Fluch, Boss-Intro und Gegner-Spawns. Jede Änderung wurde im laufenden Spiel
(Headless-Browser) oder per Unit-Test gegengeprüft; wo beides fehlt, steht es dabei.

## Auf einen Blick

| Bereich | Änderung | Spürbar im Spiel? |
|---|---|---|
| Performance | Transparente, beidseitige Materialien werden nur noch einmal gezeichnet | ja, flüssiger |
| Performance | Ausgeblendete Menüs und Overlays kosten pro Frame nichts mehr | ja, flüssiger |
| Nebel-Fluch | Weißer, treibender Wolkenschleier über dem Spiel statt nur fehlender Minimap | ja |
| Boss-Intro | Erscheint pro Boss-Raum nur einmal, nicht bei jedem Wiederbetreten | ja |
| Gegner | Gegner, die sich nicht bewegen, spawnen nicht mehr direkt nebeneinander | ja |

---

## 1. Performance

Gemessen in Chrome mit echter GPU, ohne Frame-Limit, Seed 1:

| | Vorher | Nachher |
|---|---|---|
| JS pro Frame (Median), leerer Raum | 2,8 ms | 0,6 ms |
| JS pro Frame (Median), 30 Gegner + Schießen | 3,0 ms | 0,8 ms |
| Draw-Calls | 116 | 76 |

### Doppeltes Zeichnen (`src/render/gfx/sprite.ts`, `graphics.ts` und Welt-Effekte)
- **Vorher:** three.js zeichnet ein Material, das `transparent` und `side: DoubleSide` ist, in
  zwei Durchgängen (Rück-, dann Vorderseite) und setzt dabei jedes Mal `needsUpdate`. Das HUD
  allein löste so rund 100 Shader-Parameter-Neuberechnungen pro Frame aus, dazu 40 überflüssige
  Draw-Calls.
- **Jetzt:** Alle diese Materialien haben `forceSinglePass: true`. Für flache Quads sieht ein
  Durchgang gleich aus. Betrifft HUD, Partikel, Projektile, Giftwolke, Obazda, Schnee, Canopy,
  Laternen, Bodensprites, Risse, Podest-Strahl, Fingerhakeln, Hendl-Duft und die Figuren
  (kein Neuberechnen mehr beim Ausblenden).

### Ausgeblendete UI (`src/render/gfx/layer.ts`)
- **Vorher:** Der UI-Baum hat im Lauf rund 2800 Objekte (alle Menüs und Overlays), sichtbar sind
  etwa 170. three.js hat in jedem Frame die Matrizen aller Objekte neu berechnet.
- **Jetzt:** Vor dem Zeichnen werden nur sichtbare Teilbäume aktualisiert. Code, der Matrizen
  ausgeblendeter Knoten liest (`Container.toLocal` u. a.), aktualisiert sie vorher selbst.

## 2. Nebel-Fluch sichtbar (`src/render/nebel-veil.ts`, neu)
- **Vorher:** Den Nebel-Fluch merkte man nur daran, dass die Minimap fehlt.
- **Jetzt:** Ein weißer Schleier liegt über der Spielwelt, unter dem HUD:
  - Randdunst, zum Bildrand hin dichter, in der Mitte frei, damit der Kampf lesbar bleibt.
  - Eine Wolkenschicht, die langsam seitwärts treibt, in Stufen gezeichnet (2×2-Pixelblöcke).
  - Bei reduzierter Bewegung stehen die Wolken still und sind etwas durchsichtiger.
- Dev-Vorschau: `?nebel` zeigt den Schleier ohne den Fluch (`src/app/build-mode.ts`, nur im
  Dev-Build).
- Im Spiel geprüft (Keller und Ebene 2, Screenshots). Werte als Konstanten oben in der Datei.

## 3. Boss-Intro nur einmal (`src/app/main.ts`)
- **Vorher:** Das Intro lief bei jedem Betreten eines Boss-Raums. War der Boss schon besiegt,
  erschien es ohne Bild, nur als Banner.
- **Jetzt:** Pro Lauf wird gemerkt, in welchen Boss-Räumen (Ebene + Raum) das Intro schon lief.
  Auf der nächsten Ebene kommt es normal wieder.
- Im Spiel geprüft: Große Kellerassel besiegt, raus, wieder rein → kein Intro. Wiederbetreten mit
  lebendem Boss nicht eigens getestet (gleicher Mechanismus).

## 4. Stationäre Gegner nicht nebeneinander (`src/sim/room/spread-stationary.ts`, neu)
- **Betrifft:** Gegner, deren Zustände sich alle nicht bewegen (`pause`): Schimmelfleck,
  Zapfhahn, Gartenzwerg, Blaskapellist, Fliegenpilz, Gipfelkreuz, Schneekanone. Bosse, Minibosse
  und der Ladenbesitzer bleiben, wo sie stehen.
- **Regel:** Mindestens 48 Einheiten (3 Kacheln) Abstand. Ein zu naher Gegner wird auf den
  nächsten freien Punkt (kein Hindernis, kein Bach) mit genug Abstand verschoben, gesucht in
  Ringen um die ursprüngliche Stelle. Ohne Zufall, ein Seed bleibt reproduzierbar. Passt in
  Reichweite nichts, bleibt die ursprüngliche Stelle.
- Häufigkeit über je 400 generierte Räume: Ebene 1 und 2 je 8 Verschiebungen, Ebene 3 zwei,
  Ebene 4 drei; danach kein Paar mehr zu nah.
- Test: `tests/unit/stationary-spawn-spread.test.ts`. Nicht per Screenshot im Spiel geprüft.

---

# Branch `Bacon` (erste Runde, gemergt mit #485)

Stand: 09.10.2026 · Basis: `main` bei `a17fcc08`. Fehlerbehebungen und kleine Spielmechaniken aus
dem Playtesting. Jede Änderung wurde im laufenden Spiel (Headless-Browser) oder per Unit-Test
gegengeprüft; wo beides fehlt, steht es dabei.

## Auf einen Blick

| Bereich | Änderung | Spürbar im Spiel? |
|---|---|---|
| Räume | Rauchwolke beim Betreten an der richtigen Tür statt an der gegenüberliegenden Wand | ja |
| Räume | Rauchwolke beim Leeren auch an versteckten Geheimwänden, als Hinweis | ja |
| Bierfassl | Sprengt Steine jetzt zuverlässig, feldweise statt ganzer Blöcke | ja |
| Bierfassl | Gesprengte Steine bleiben auch optisch weg, wenn man zurückkommt | ja |
| Fässer | Selten Beute (Biermarke 1, halbe Bratwurst, halbe Maß), noch seltener Schimmelfleck/Bierratte | ja |
| Geheimräume | Jeder Ausgang eines Geheimraums muss einzeln gesprengt werden | ja |
| Rendering | Kisten und andere Deko liegen hinter Items und Felsen | ja |
| Ebenenwechsel | Startraum ohne Scheintüren; gesprengte Steine werden pro Ebene vergessen | ja |
| Statuseffekte | Brennen, Gift, Eis usw. gehen nicht mehr auf neu erscheinende Gegner und Items über | ja |
| HUD | Item-Zeilen links (Watschn, Lebkuchenherz, Set-Anzeige) überlappen nicht mehr | ja |

---

## 1. Räume und Türen

### Rauchwolke beim Betreten (`src/sim/game/sim.ts`)
- **Vorher:** Die Wolke entstand an der Spielerposition, bevor der Spieler an die Eingangstür
  gesetzt wurde, also dort, wo er den alten Raum verlassen hatte. Im neuen Raum ist das die
  gegenüberliegende Wand.
- **Jetzt:** Die Wolke entsteht erst nach dem Positionieren, an der Tür, durch die man hereinkommt.

### Rauchwolke beim Leeren eines Raums (`src/sim/game/sim.ts`)
- Beim Leeren staubt es an jeder Tür, die sich öffnet. **Absichtlich auch an noch versteckten
  Geheimwänden**: Die Wolke ist ein Hinweis, dass dort etwas ist; die Wand bleibt bis zum Sprengen zu.
- Gilt auch für Super-Geheimräume, die Simulation unterscheidet hier nicht.
- Test: `tests/unit/room-clear-puff.test.ts`.

### Geheimräume: jeder Ausgang einzeln (`src/app/main.ts`)
- **Vorher:** Versteckte Wände gab es nur auf der Seite des normalen Raums. Ein Geheimraum hat seine
  eigenen Türen nie versteckt, drinnen standen alle weiteren Ausgänge offen.
- **Jetzt:** Jeder Übergang mit einem Geheim- oder Super-Geheimraum auf *irgendeiner* Seite ist eine
  eigene Wand, die separat gesprengt werden muss.
  - Gesprengt bleibt gesprengt, für den Rest des Laufs und von beiden Seiten.
  - Die Wand, durch die man hereingekommen ist, gilt als offen; man kann sich nicht einsperren.
  - Im Geheimraum zeigen Risse die versteckten Ausgänge. Von außen bleibt ein Super-Geheimraum
    weiterhin ohne Riss.
- Im Spiel geprüft: Geheimraum mit 3 Ausgängen → 1 offen, 2 Wand; nach einer Sprengung 2 offen,
  1 Wand; nach Verlassen und Zurückkommen unverändert.

### Scheintüren nach dem Ebenenwechsel (`src/app/main.ts`)
- **Vorher:** Beim Wechsel auf die nächste Ebene wurde der Startraum ohne den Grundriss geladen und
  bekam auf jeder Seite eine Tür, auch ohne Nachbarraum. Diese Türen waren sichtbar, aber nicht
  begehbar, und verschwanden beim Wiederbetreten. Dasselbe beim Zurückversetzen durch die
  Blutwurz-Geisterwanderung.
- **Jetzt:** Beide Stellen laden den Startraum mit dem Grundriss der Ebene.
- Im Spiel geprüft (Ebene 1 → Boss → Ebene 2): gezeichnete, echte und wiederbetretene Türen stimmen
  überein, jede ist begehbar.

## 2. Bierfassl und Steine

### Steine sprengen (`src/sim/room/geometry.ts`, `src/sim/game/sim.ts`)
- **Vorher:** Der Raumgenerator fasst Steine zu großen Rechtecken zusammen. Die Explosion prüfte nur,
  ob der *Mittelpunkt* eines solchen Rechtecks im Explosionskreuz liegt. Längere Steinreihen und leicht
  versetzte Steine wurden dadurch nie getroffen, auf allen Ebenen.
- **Jetzt:** Jedes Steinfeld, das das Kreuz berührt, bricht einzeln weg; der Rest bleibt stehen (wie
  beim Wildschwein). Gespeichert und beim Wiederbetreten wiederhergestellt wird pro Feld.
- Tests: `tests/unit/boulder-blast.test.ts` (lange Reihe, versetzter Stein, exakte Wiederherstellung).

### Gesprengte Steine tauchen wieder auf (`src/app/main.ts`)
- **Vorher:** Der Nachbarraum wird beim Durchgehen vorab gebaut. Diese Vorab-Ansicht suchte die
  gesprengten Steine unter dem Namen der Raumvorlage statt unter dem Raumnamen aus dem Grundriss, fand
  nichts und zeichnete alle Steine neu. Begehbar war die Stelle trotzdem. Dasselbe galt für von
  Borkenkäfern gefressene Bodenstellen.
- **Jetzt:** Gleicher Schlüssel wie in der Simulation.
- Im Spiel geprüft: ohne Fix 22 Steinfelder in der Simulation, 25 gezeichnet; mit Fix identisch.

### Gesprengte Steine über Ebenen hinweg (`src/sim/game/sim.ts`)
- Raumnamen (`r0`, `r1`, …) wiederholen sich auf jeder Ebene. Die Liste gesprengter Steine wird beim
  Ebenenwechsel jetzt geleert, sonst fehlten Steine im gleichnamigen Raum der nächsten Ebene.

## 3. Fässer im Raum (`src/content/pickups/drop-tables.ts`, `src/sim/systems/loot.ts`)
Zerstörte Fässer geben jetzt selten etwas her. Nur `barrel`; Maibaum, Strohballen und Baumstamm bleiben leer.

| Ergebnis | Chance pro Fass |
|---|---|
| Schimmelfleck oder Bierratte (je halb) | 3 % |
| Biermarke 1 | ca. 3,4 % |
| halbe Bratwurst | ca. 3,4 % |
| halbe Maß (nur mit Promille) | ca. 1 % |

- Ohne Promille fällt die Maß weg; Biermarke und Bratwurst werden entsprechend häufiger, damit Fässer
  gleich oft etwas hergeben (wie bei den Gegner-Tabellen).
- Ein Tier aus einem Fass in einem geleerten Raum schließt die Türen nicht wieder.
- Gewürfelt wird über den Beute-Zufallsstrom; ein Lauf mit gleichem Seed bleibt reproduzierbar.
- Werte an einer Stelle: `BARREL_DROP_TABLE`, `BARREL_CRITTER_CHANCE`, `BARREL_CRITTER_IDS`.
- Test: `tests/unit/barrel-loot.test.ts`.

## 4. Rendering und HUD

### Kisten hinter Items und Felsen (`src/render/world/billboard.ts`, `scenery.ts`, `entities.ts`, `pedestal-view.ts`)
- **Vorher:** Deko-Requisiten (Kisten, Strohballen, Zaunpfosten, Tannen …) haben keine Kollision. Items
  und Felsen konnten auf derselben Stelle liegen, und die Kiste stand einen Hauch näher an der Kamera und
  verdeckte sie.
- **Jetzt:** Deko schreibt keine Tiefe mehr und wird vor Items und Felsen gezeichnet. Items, Items auf
  Podesten und Felsen liegen immer darüber. Figuren und Wände sortieren weiterhin normal.

### Item-Zeilen links überlappen (`src/app/main.ts`)
- **Vorher:** Die linke HUD-Spalte wurde nur bei Laufstart, Fenstergröße und Gift- oder Sixpack-Zeile
  neu angeordnet. Item-Status- und Set-Zeilen, die mitten im Raum dazukommen, lagen übereinander, bis ein
  anderer Auslöser kam.
- **Jetzt:** Ändert sich die Höhe der Item-Zeilen (Status, Gate, aktives Item), wird sofort neu angeordnet.
- Im Spiel geprüft: Watschn, Braumeister-Visier, Lebkuchenherz und „Braumeister: 2/3“ stehen untereinander.

## 5. Statuseffekte (`src/sim/game/sim.ts`)
- **Vorher:** Brennen, Gift, Einfrieren, Verlangsamung, Einfrier-Abklingzeit und Benommenheit werden pro
  Speicherplatz gespeichert und beim Entfernen eines Objekts nicht gelöscht. Neue Gegner und Items im
  nächsten Raum übernahmen so Reste, zum Beispiel den Brand des Steckerlfischs.
- **Jetzt:** Alle Statuseffekte werden beim Erzeugen jedes Objekts zurückgesetzt (Spieler, Gegner und
  Requisiten, Items, gelegte Bierfassl).
- Test: `tests/unit/status-slot-reuse.test.ts`.

## Untersucht, ohne Änderung
- **Bierfassl folgt dem Spieler:** Kein Item beeinflusst gelegte Fässer. Wer beim Drücken von `E` läuft,
  *rollt* das Fassl in Laufrichtung; das ist eine gewollte Mechanik.
- **Zwei Blaskapellen auf Ebene 2:** XL-Ebenen (25 %) haben absichtlich zwei Minibossräume, und Ebene 2
  hat nur eine Minibossraum-Vorlage.
- **Minimap nach Esc weg:** Nicht nachstellbar (Esc, Resume, Einstellungen, Tab, Fenstergröße). Die
  einzige dauerhafte Ausblendung ist der Fluch „Nebel“.

---

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
