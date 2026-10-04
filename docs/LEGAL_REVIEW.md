# Kellerbier — Legal Review

The audit #55 asks for, run against what ships in the two-floor build, as of 2026-10-02
(commit `5a0eadc`). It records what was checked and how, what was found, and what is still a
decision for the project owner.

**This is an engineer's audit, not legal advice.** The repository checks below were run and are
reproducible. The trademark statements are from general knowledge and were **not** verified
against a register — each one that matters is marked *verify*. Nothing here has been seen by a
lawyer.

---

## 1. Summary

| # | Finding | Severity | Owner's decision needed |
|---|---|---|---|
| 1 | An item is named **Spezi**, which is a registered drinks brand | High | **Decided 2026-10-02: the name stays.** The risk described in §2.1 is accepted, not removed |
| 2 | An item is named **Neuschwanstein-Bauplan**; "Neuschwanstein" is a registered mark and the landmark work was deferred to M10 | Medium | **Decided 2026-10-02: the name stays.** The register check in Finding 6 still applies to it |
| 3 | The music and sound-effect recordings have no recorded origin or licence | — | **Closed 2026-10-02:** all ten are the project owner's own recordings |
| 4 | The key art is diffusion-generated; the model and LoRA licences are unrecorded, and itch.io asks about generative AI | Medium | Confirm the licences; disclose on the page |
| 5 | No project licence, no attribution file | Medium | Choose a licence |
| 6 | Invented brands are not checked against a trademark register | Medium | Run the searches |
| 7 | Age rating for itch.io not set | Low | Fill in the page's content fields |

Nothing was found for: real brewery names, "Oktoberfest", the Bavarian coat of arms in code or
strings, third-party code licences, or the fonts.

## 2. Names

### 2.1 Real breweries and other brands — clean, with one exception

Searched `src/`, `assets/sprites/`, `index.html`, `README.md`, `ITEM_ROSTER.md` and
`tools/release/READ-ME.txt`, case-insensitively, for: Paulaner, Augustiner, Hofbräu, Erdinger,
Spaten, Löwenbräu, Hacker-Pschorr, Franziskaner, Tegernseer, Weihenstephan, Ayinger, Schneider
Weisse, Beck's, Warsteiner, Krombacher, Bitburger, Red Bull, Jägermeister, Coca-Cola, Fanta,
Almdudler, Haribo, Capri-Sun.

**No hits in anything that ships.** The only matches are `docs/CONTENT_BIBLE.md` §0 naming what
not to use.

That list is brands somebody thought of. The list of what actually ships is more useful, so every
item, enemy and pickup name was read as well (every file under `src/content/items`, `enemies` and `pickups`). Two stand out:

**Finding 1 — "Spezi".** `src/content/items/spezi.ts`, described in its own comment as "cola and
orange soda, half a glass each". In Germany *Spezi* is not only the everyday word for that mix:
it is a registered trademark for exactly that drink, owned by a brewery, with a second brewery
selling its own under licence. *Verify the current registration and owner.* The word is used
generically in speech, which is the argument for leaving it, but the game uses it as the name of
a drink item, which is the use the mark covers. This is the same category §0 of the content bible
bans outright, and it is the one name in the build I would not ship without a decision.

**Decision (project owner, 2026-10-02): keep the name.** The finding stands as a description of
the risk; the choice to carry it is made. If a complaint ever arrives, the item is one file and
three dictionary entries to rename.

**Finding 2 — "Neuschwanstein-Bauplan"** (and, more mildly, **"Ludwigs Schwan"**).
`CONTENT_BIBLE.md` §0 treats landmarks as buildings that can be depicted, and #55 deferred
"landmark provenance for Neuschwanstein" to M10 *with its floor*. But the item ships now, in the
two-floor build. "Neuschwanstein" is registered as a trademark by the Bavarian state for a range
of goods; whether that range reaches a video game is exactly the deferred question. *Verify.*
Ludwig II himself is a historical figure and "Ludwigs Schwan" names no mark I know of.

**Decision (project owner, 2026-10-02): keep the name.** The deferred landmark question is still
worth answering before a paid release; it no longer blocks the alpha page.

Lower risk, noted so nobody has to rediscover them:

- **Obazda** — a protected geographical indication for the cheese spread. That protects the food
  product's name on food; an item named after a dish in a game is not selling cheese.
- **Reinheitsgebot 1516**, **Sudordnung 1493**, **Radler**, **Blutwurz**, **Rumtopf**,
  **Weißwurst**, **Lebkuchenherz** — generic terms, historical laws or dish names.
- **Sixpack**, **Kraftbier**, **Konterbier**, **Feierabendbier** — ordinary words.

### 2.2 "Oktoberfest" — clean

One match in the whole tree: a code comment in `src/content/floors/definition.ts` explaining why
the floor is called "Die Wiesn". No string in any locale, no metadata, no file name.

### 2.3 Invented brands

`CONTENT_BIBLE.md` §0 lists five: Pfeitinger, Kellerbräu, Löwenbrunn, Sankt Anzelm, Alpenkrone.

**Only Pfeitinger ships.** It appears in the opening story text in all three locales. Kellerbräu,
Löwenbrunn, Sankt Anzelm and Alpenkrone appear nowhere in `src/`. **Oberniederburg** ships in the
same story text, all three locales.

**Finding 6 — none of these has been checked against a register.** That needs a person and a
browser:

- **Pfeitinger** and **Oberniederburg**: search DPMAregister (German marks) and EUIPO eSearch for
  the word in class 32 (beers) and class 9/41 (games), and a place-name search for Oberniederburg.
- **Kellerbier** itself, the game's title: it is a generic beer style, so it cannot be owned as
  a beer name, but check classes 9 and 41 for an existing game or software mark before the store
  page goes up. This was not in #55's list and should be.
- The four unshipped brands can wait until something uses them.

### 2.4 State symbols

No file name, identifier or string mentions a coat of arms (`wappen`, `coat of arms`, `staatswappen`
searched). The title wallpaper is the lozenge pattern (`render/ui/ornament.ts`), which the
content bible allows as a folk motif. **The art itself was not inspected image by image** — a
pixel coat of arms in a sprite would not show up in a text search.

### 2.5 Locales

Item, enemy and pickup names are proper nouns and identical in all three locales, so the name
review above covers en, de and bar. Descriptions and story text were searched in all three
dictionaries for the same brand list: no hits.

## 3. Third-party material

### 3.1 Code — clean

Runtime dependencies, from `package.json` and the installed packages:

| Package | Version | Licence |
|---|---|---|
| three | 0.185.1 | MIT |

`@types/three` (MIT) is listed under `dependencies` but is types only and ships no code. Everything
else is a dev dependency and is not in the build. MIT requires the copyright notice to accompany
copies: **three.js's licence text belongs in the attribution file** (Finding 5). The Credits screen
names the engine, which is courteous but is not the notice.

### 3.2 Fonts — clean

Both faces (the text face and the Fraktur display face) are authored in this repository as
source — `src/render/ui/font-data.ts`, `display-font-data.ts` — and rasterised at boot. There is
no font file and no third-party font. #55 asked for the pixel font's licence to be confirmed: it
is the project's own work.

### 3.3 Audio — Finding 3, closed

Almost all sound is synthesised live (`src/content/audio/`). Ten recorded files are not:

| File | Used for |
|---|---|
| `assets/audio/01-consolidated.mp3` (5.4 MB) | every recorded music track: both floor themes, both boss themes, title, victory |
| `click`, `enemydie`, `enemyshot`, `metaldie`, `metalhit`, `playershot`, `shotland`, `softhit`, `windup` (.mp3) | sound effects |

**Closed 2026-10-02.** The project owner recorded all ten files personally — the music and every
sound effect. Nothing here is third-party, no licence applies, and no credit is owed.
`assets/audio/README.md` now says so, because git records who committed a file and not where
it came from. A recording added later from anywhere else needs its source and licence written
down in that README when it lands.

### 3.4 Art — **Finding 4**

Sprites are block art authored in source (`tools/art/authoring/`) — the project's own work.

Four illustrations are not: `assets/art/title/postcard.png`, `assets/art/story/opening.png`,
`assets/art/bosses/der-stier.png` and `grosse-kellerassel.png`. Per `docs/DECISIONS.md` #71 these
come from a local pipeline: Stable Diffusion 1.5 with the `pixelartredmond-1-5v` LoRA. The boss
sprites are rigs cut from two of them (#102). Three things follow:

- **The model licences are not recorded.** SD 1.5 is under the CreativeML OpenRAIL-M licence,
  which permits commercial use of outputs with use restrictions; the LoRA has its own terms on
  its model page. *Verify both*, and note them in the attribution file.
- **Copyright in generated images is unsettled** and differs by country. That limits how well the
  key art can be protected against copying; it does not stop the game shipping.
- **itch.io asks whether a project contains generative AI content** and tags the page accordingly.
  The honest answer here is yes, for these four images.

## 4. Project licence and attribution — **Finding 5**

`package.json` says `"license": "UNLICENSED"` and there is no `LICENSE` file. The repository is
public, so the source is readable but nobody has been granted any rights to it. That may be
exactly what is wanted — it is still worth deciding on purpose and writing down. The options, in
short:

- **All rights reserved, source visible** — the current de facto state. Say so in a `LICENSE` file.
- **Open-source code, reserved assets** — a permissive or copyleft licence for `src/`, with art,
  audio and story text kept all-rights-reserved. Common for games.

`THIRD-PARTY-NOTICES.md` now exists and `npm run build:itch` puts it in the upload. It holds
three.js's notice and is marked incomplete. Once Finding 4 is answered it needs the model and
LoRA notes; the audio needs no entry beyond the one already there.

## 5. Age rating — **Finding 7**

Alcohol is the core mechanic: drinking is rewarded with stat bonuses and has comic consequences.
There is cartoon violence and no blood beyond a sausage called Blutwurst.

itch.io has no rating board. What it has is the page's own content fields, and those are what
"confirm for itch.io" comes down to: describe the alcohol use in the page text, and decide whether
to mark the page as adult content — which this is not, in itch.io's sense of the term. *Verify the
current fields on the project's edit page.* The roughly PEGI 12–16 estimate in #55 is reasonable
as a description for the page; a formal rating is a Steam-era question.

## 6. What is left, in order

1. ~~Decide Spezi~~ — kept (Finding 1).
2. ~~State where the audio came from~~ — the owner's own recordings (Finding 3).
3. ~~Decide Neuschwanstein-Bauplan~~ — kept (Finding 2).
4. Run the register searches for Pfeitinger, Oberniederburg and Kellerbier (Finding 6).
5. Choose the licence; then the attribution file can be written (Findings 4 and 5).
6. Fill in the itch.io content fields and the AI disclosure when the page is made (#367).

## 7. #55's acceptance criteria

| Criterion | Status |
|---|---|
| A full-text search for real brewery names across the repo returns nothing | Met for what ships; the content bible names them as examples of what not to use |
| Every invented brand has been checked against existing trademarks, Pfeitinger included | **Open** — Finding 6 |
| Oberniederburg has been confirmed as not naming a real place | **Open** — Finding 6 |
| All third-party licences are documented and compatible, the pixel font included | Code, fonts and audio done; the art models **open** — Finding 4 |
| The age rating is confirmed for itch.io | **Open** — Finding 7 |
| Every locale, not just English, has been checked | Met — §2.5 |
