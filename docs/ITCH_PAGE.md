# Kellerbier — the alpha itch.io page

**The page: <https://tilorgb.itch.io/kellerbier>** (created 2026-10-04, live — #367 is done).

What is on the page. It was drafted so that making it was filling in a form (#367), and it is
kept here so each content update only has to change what changed. The upload and the
embed settings are in [`tools/release/ITCH.md`](../tools/release/ITCH.md); this is everything a
visitor reads.

**Every piece of copy here is a draft for the project owner to edit.** It was written from what
the game does today, not signed off.

---

## Shipping a content update

The game is an early alpha that gets content updates step by step until it is finished — floor 5
(M11) is the next one. The page describes the game as that, not as a number of chapters, so an
update changes **In this build** and the screenshots, not the framing. For each update:

- upload the new build and run the embed checklist (`tools/release/ITCH.md`)
- write the release notes (docs/releases/README.md) and post them as the page's devlog entry
- update **In this build** below and on the page
- check the telemetry Worker is still current (`tools/telemetry/README.md`)

## Page fields

| Field | Value |
|---|---|
| Title | Kellerbier |
| Project URL | `kellerbier` |
| Short description / tagline | A Bavarian cellar-crawling roguelike — alpha |
| Classification | Games |
| Kind of project | HTML |
| Release status | **In development** |
| Pricing | No payments (free) for the alpha — a price or name-your-price is #56's decision |
| Genre | Action |
| Tags | `roguelike`, `roguelite`, `bullet-hell`, `twin-stick-shooter`, `pixel-art`, `dungeon-crawler`, `singleplayer`, `2d`, `comedy` |
| AI generation disclosure | **Yes — graphics.** The title postcard, the opening illustration and the two boss key-art images were made with a generative model; sprites, fonts and code-drawn UI were not. See `LEGAL_REVIEW.md` Finding 4 |
| Languages | English, German |
| Inputs | Keyboard, gamepad |
| Accessibility | Configurable controls; subtitles not applicable |
| Visibility | Draft while testing → **Public, with "Unlisted in search & browse" ticked** for the alpha → untick it for #56's release. **Not Restricted:** that asks every visitor for a password or key, which is the opposite of what a playtest page wants. An earlier version of this table said "Restricted or unlisted" as though they were the same; they are not |
| Community | Comments on |

Leave **Mobile friendly** off until the touch controls have been tried on a real phone.

## Description

> **This is an early alpha.** It gets content updates step by step until it is finished, and a
> run takes about fifteen minutes. Some of what you will see and hear is a placeholder — the voice
> barks, and parts of the music and art — and the balance is exactly what this test is for.
>
> ---
>
> Alois is at his grandparents' for Sunday lunch, the way he is every Sunday, and he has gone
> down to the cellar for another bottle of the good Pfeitinger. The crate is empty. The full one
> next to it is Pfeitinger too, and the label is wrong: *brewed according to the new Bavarian
> purity law.* Water, malt, hops — and raisins.
>
> So Alois takes Opa's drinking backpack off its hook, fills it with what is left of the tainted
> crate, switches it from *drink* to *shoot*, and heads south to find out who is responsible.
>
> **Kellerbier** is a roguelike dungeon crawler in the tradition of *The Binding of Isaac*: a new
> cellar every run, rooms full of things that want you gone, items that change how you shoot and
> combine in ways nobody planned, and a boss at the bottom of each floor.
>
> **What makes it its own thing is Promille.** Drink and you hit harder — and the room starts to
> close in. How far you push it is the decision the game is built around. It unlocks once you
> have beaten a boss.
>
> ### In this build
>
> - Four floors: the cellar, the village above it, the forest beyond and the mountains above that, each with a mini-boss and a boss
> - About sixty items
> - Keyboard and gamepad, fully rebindable
> - English, German and Bavarian
>
> ### Controls
>
> | | |
> |---|---|
> | Move | WASD |
> | Aim and fire | Arrow keys |
> | Bomb | E |
> | Use carried item | Q |
> | Map | Tab |
> | Pause | Escape |
>
> A gamepad works too: stick or d-pad to move, right trigger to fire, left trigger to bomb. Rebind
> anything under Settings → Controls.
>
> ### This is a playtest
>
> The first time you start, the game asks whether you want to take part. If you say yes, it
> records anonymous stats about each run — whether you won or died and on which floor, how long
> rooms took, which items you held, how drunk Alois was — and sends them when the run ends. After
> a run it may ask one short question, which you can skip. No name, no account, nothing that says
> who you are, and you can turn it off in Settings at any time. Say no and the game plays exactly
> the same and sends nothing.
>
> ### Tell me what broke
>
> Press **C** at any point in a run: it copies the seed and what you were carrying. Paste that in
> a comment below, or open an issue at https://github.com/tilorgb/kellerbier/issues — with the
> seed, the exact run can be replayed.
>
> ### Content note
>
> Cartoon violence, and drinking as a game mechanic played for comedy.

## Images

itch.io wants a cover image at **630 × 500** and three to five screenshots.

- **Cover:** [`docs/itch/cover.png`](itch/cover.png), 630 × 500 — the title postcard's picture
  filling the frame, with the game's name across the bottom. Chosen 2026-10-04 from three
  compositions (the title screen's own layout, this one, and the whole postcard centred), because
  it is the one where the figure stays readable at thumbnail size. It is built only from art that
  was already signed off: the postcard picture and the title lettering.
- **Screenshots:** seven are in [`docs/itch/`](itch/), all 1280 × 720 (exactly 2×, so the pixels
  stay square).
  - `01`–`03` — the title screen, the start room and a cellar room mid-fight, from the tester
    build of commit `14c9d0b`, taken by a script holding keys down.
  - `04`–`07` — Die Zapfhahn-Orgel (a floor 1 mini-boss), a village room on floor 2, an item on
    its pedestal in a treasure room, and Die Blaskapelle (a floor 2 mini-boss) mid-volley, from the
    dev build. **These four are staged, and it is worth knowing how:** the room
    was loaded directly rather than walked to, Alois was given two items and kept at full health
    so the script survived long enough to take the picture, and the dev build's debug readout and
    panels were hidden. Loading a room directly also leaves the HUD's floor label out. Everything
    in frame is the game's own rendering of its own rooms; nothing was composited.
  - **No boss is shown, on purpose** (decided 2026-10-04). Die Große Kellerassel is what floor 1
    builds to and Der Stier is the last fight in the game; a store page that shows both has spent
    the two reveals a new player is playing towards. A mini-boss and a glimpse of the village say
    "there is more down here" without saying what. The same goes for any trailer or GIF made
    later.
  - `07` is the frame to lead with: #56's own note is that the brass band is the most distinctive
    thing in the game. It was taken without firing, so nobody is caught mid hit-flash.
  - **Still wanted, from a played session:** the card that appears when an item is picked up.
    `06` shows the pedestal and its label, not the card.

## After it is up

- ~~Put the page link in the README next to the Pages link.~~ Done.
- Runs from the page arrive in the telemetry report under the build id in the uploaded zip's
  file name (`tools/telemetry/README.md`).
- Check the comments when triaging playtest findings (`docs/PLAYTEST_PROTOCOL.md` §8).
