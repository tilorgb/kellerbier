# Kellerbier — the alpha itch.io page

What goes on the page, drafted so that making it is filling in a form (#367). The upload and the
embed settings are in [`tools/release/ITCH.md`](../tools/release/ITCH.md); this is everything a
visitor reads.

**Every piece of copy here is a draft for the project owner to edit.** It was written from what
the game does today, not signed off.

---

## Before the page can go up

Nothing in [`LEGAL_REVIEW.md`](LEGAL_REVIEW.md) blocks it any more: the two findings that did
were settled on 2026-10-02 (Spezi keeps its name; the music and sound effects are the owner's own
recordings). What is left is practical:

- upload a build and run the embed checklist (`tools/release/ITCH.md`)
- redeploy the telemetry Worker (`tools/telemetry/README.md`)
- a cover image, and screenshots past the second room (below)

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
| Visibility | Draft → Restricted or unlisted for the alpha → Public is #56 |
| Community | Comments on |

Leave **Mobile friendly** off until the touch controls have been tried on a real phone.

## Description

> **This is an alpha.** Two chapters of a planned seven are playable, start to finish, and a run
> takes about fifteen minutes. Some of what you will see and hear is a placeholder — the voice
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
> - Two floors: the cellar and the village above it, each with a mini-boss and a boss
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

- **Cover:** the title postcard (`assets/art/title/postcard.png`) is portrait, 832 × 1216, so it
  needs a landscape composition made for this — the name over a crop of the postcard is the
  obvious one. That is new art and needs sign-off before it is used.
- **Screenshots:** three are in [`docs/itch/`](itch/), captured at 1280 × 720 (exactly 2×, so
  the pixels stay square) from the tester build of commit `14c9d0b`: the title screen, the start
  room, and a cellar room mid-fight. They were taken by a script holding keys down, which gets
  as far as the second room and no further. **Still wanted, from a played session:** a mini-boss,
  Die Große Kellerassel, a village room on floor 2, and the item pickup card.

## After it is up

- Put the page link in the README next to the Pages link.
- Runs from the page arrive in the telemetry report under the build id in the uploaded zip's
  file name (`tools/telemetry/README.md`).
- Check the comments when triaging playtest findings (`docs/PLAYTEST_PROTOCOL.md` §8).
