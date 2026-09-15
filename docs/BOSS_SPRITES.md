# Boss sprites: from key art to a working strip

How Die Große Kellerassel and Der Stier got their sprites, written down so the next boss
(#39-#43, the Maibaum-Dieb should he ever grow, a superboss) follows the same road instead of
rediscovering it. `docs/DECISIONS.md` #99-#102 has the *why* and the dead ends; this is the
*how*. Everything below is deterministic and lives in the repo — no GPU is needed after step 1.

The one-line version: **the shapes come from the boss's own postcard illustration, the rendering
is the game's flat-ink style, and the motion comes from articulating cut-out parts.** A boss
sprite is not drawn by hand and it is not a downsampled picture; it is a paper puppet cut from the
picture and re-posed.

## 0. What you are making

- A strip `assets/sprites/<floor>/bosses/<id>.strip.png` plus a sidecar `<id>.anim.json`
  (`assets/sprites/README.md` has the format).
- **Twelve frames in this order**, which both existing sidecars index by position:

  | Frames | Clip | What the pose says |
  |---|---|---|
  | 0-1 | `idle` (pingPong, ~520 ms) | a breath: body down a pixel, a tail flick or feeler twitch |
  | 2-5 | `move` (loop, ~120 ms) | a four-frame walk — contact, pass, contact, pass |
  | 6-7 | `telegraph` (pingPong, ~110 ms) | the wind-up the fight's attack reads off: head down and pawing, rearing up, whatever the attack is |
  | 8 | `hurt` (once → idle) | a recoil, one shade step lighter — the engine adds the white flash |
  | 9-11 | `death` (once, hold) | three beats ending in a pose that is unmistakably dead |

- Facing **left** (`render/animation/state.ts`'s `AUTHORED_FACING`); the engine mirrors it.
- Ground contact on the **bottom rows** of the canvas (`docs/DECISIONS.md` #56): a boss stands on
  its collider, so the hooves or feet sit on row `H - 2` and their ink on `H - 1`.
- The canvas is a design choice that needs sign-off (`CLAUDE.md`, "size is a design choice").
  116×100 and 140×86 were decided for the two existing bosses under #193/#199; a new boss picks
  its own with the person, against `tools/art/spec.mjs`'s 160×160 ceiling and
  `tests/content/sprite-scale.test.ts`'s band around the `boss` collider (88 px wide).

## 1. Get the key art signed off first

The sprite is derived from the postcard, so the postcard is where the design is decided. Generate
candidates through `keyart-bench`'s `bossPlate` preset (1344×768; `docs/DECISIONS.md` #94/#99,
local GPU only), bring the person ~10 survivors, and commit the pick as
`assets/art/bosses/<id>.png`. That file is also what `BossIntroPlate` shows on entering the room,
so it does double duty. Things that make the next steps easier, worth asking the model for:

- **A full-body side view, facing left**, all limbs visible. Der Stier's postcard shows three legs
  clearly; the sprite's far pair are copies of the near pair as a result. Ask for four.
- **A background that contrasts with the subject in brightness.** A near-black bull on a bright
  field keys out with one threshold; a tan shell against tan stone has to be traced by hand.
- **Nothing overlapping the creature** — no barrel in front of a leg, no fence through the hooves.

Do not redraw the art toward the palette. The palette snap happens per part in step 4, and it
wants the illustration's real shading to band.

## 2. Read the parts off the picture

Decide what moves. Every part is one polygon in **key-art pixels** and, if it rotates, one pivot.
Fewer, larger parts read better than many small ones; a part narrower than ~3 sprite pixels
(at 0.12-0.17 scale, ~20 source pixels) will thin to nothing.

| Creature | Parts that worked |
|---|---|
| quadruped (Der Stier) | torso · head (horns and muzzle keyed out of it, then cut again as their own parts) · tail · one front leg · one rear leg — the far pair are the same two parts, set back 9 px, up 4 px, one shade darker |
| many-legged (Die Große Kellerassel) | shell (one piece) · the dark underbody the legs hang from · head · two feelers · seven legs, each a tapered stroke |

Print a gridded crop of the region you are tracing and read coordinates off it:

```
npm run art:boss-preview grid <id> x0 y0 x1 y1 [gridStep] [scale]
```

(`<id>` has to be registered in `bosses.mjs`'s `BOSS_RIGS` first — add the entry with an empty
`specs: {}` to start.) Red lines every `gridStep` source pixels, yellow every two. Zoom the head
and the legs separately (`scale` 1.5-2); 50-pixel cells at 1:1 are enough for a torso.

Polygon rules of thumb:

- **Loose where a key will do the precise work, tight where it will not.** The bull's torso polygon
  runs a little into the sky and grass because `key: 'dark'` removes them. Every Kellerassel leg
  polygon hugs the leg because the shadow between legs is as dark as the leg's own shaded side, and
  keying it tore each leg into fragments.
- **A part that rotates extends into the part that covers it.** Legs run ~40 source pixels up into
  the torso and are drawn *behind* it, so the hip stays hidden at any angle. The head's back edge
  follows the neck fold and the head is drawn *over* the torso, so that edge is a drawn line.
- **Pivots are joints**: a hip at the belly line, the neck where the head meets the shoulder, a
  feeler's base. Sprite-space pivots (a squash about the ground) are given in sprite pixels.

## 3. Map the picture onto the canvas

One `mapping({ scale, originX, originY, dstX, dstY })` per boss: `scale` is sprite pixels per
source pixel (the creature's source width divided by the canvas width, minus a pixel or two of
margin), and the source point `(originX, originY)` — leftmost extent, ground line — lands on sprite
`(dstX, dstY)` — `~1`, `H - 1.5`. Check the topmost feature (a horn tip) still lands above row 0;
drop `scale` a notch if not.

## 4. Flatten each part to a material

A material is `{ tones: [dark … light], cuts: [q1, q2, …] }`: legal palette hexes
(`tools/art/palette.mjs`'s `legalPixelColorsFor`, i.e. a floor hue's ±2-step ramp — the
`CELLAR`/`RURAL` tables in `bosses.mjs` name the ones already in use) and the **luminance
quantiles within that part** at which the next tone starts. Two or three tones for a coat or a
leg, four for a shell with grooves and a rim, two for a horn.

Why quantiles and not nearest colour: the light tone lands on the brightest fifth of *the coat*,
wherever the illustrator put the highlight, instead of on whichever pixel happened to be nearest
some palette entry. #100's green bull came from nearest-colour; this cannot produce it, because a
material only ever draws its own tones.

Knobs, in the order to reach for them when a part looks wrong:

1. `blur` (default 1) — passes of a 3×3 mean over the luminance before banding. `2` for a big
   soft body so brushwork merges into its band; `0` for a two-pixel feeler.
2. `key` — `'dark'`/`'light'` with `keyThreshold` (0-1 luminance) keeps only source pixels on one
   side of it. Use it when the polygon has to include background; leave it `'none'` when it
   removes part of the subject (hoof highlights, a leg's shaded side).
3. `coverage` (default 0.5) — the fraction of a sprite pixel's source block that must be kept for
   the pixel to be opaque. `0.3-0.4` for thin parts, or their edges vanish.
4. `erode` — one pass strips single-pixel fringes a loose polygon let in. Rarely needed once the
   polygon is right; fix the polygon first.
5. The `cuts` themselves — move a cut up to shrink the lighter band.

What has no knob: the ink. Every part is outlined in black **after** it is posed
(`composeFrame`), on its own silhouette, so a leg in front of a leg keeps its line and a rotated
edge gets a clean 1-px outline. That is the single step that turns "picture" into "character";
do not skip it for a part unless it is a detail painted on another part (an eye, the wreath's
beads: `ink: false`).

Hand-placed pixels are allowed for what the art cannot supply — `drawnPart` for a grid, `pixelPart`
for a list — and are placed with the part they belong to (the bull's wreath rides the head's
transform).

## 5. Look before you build

```
npm run art:boss-preview overlay <id> [x0 y0 x1 y1 scale]
```

draws every polygon (one colour each, listed on stdout) and pivot over the dimmed art. Fix a
polygon that misses an edge *here*; it is far cheaper than judging a mis-cut from a 100-px frame.
Then build and look at the frames at 4×:

```
npm run art:bosses
npm run art:boss-preview frames <id> [scale]
```

The overlay and sheet land in `tools/art/authoring/preview/` (gitignored). Iterate polygons →
materials → frames until the idle reads at 4× *and* at 1× — the game shows it at 1×, so a
detail that only reads upscaled is noise.

## 6. Pose the frames

A pose is a plain object of dials fed to `composeFrame` through the boss's own `*Pose` function;
the two in `bosses.mjs` are the templates. Dials that exist and what they did:

- **Walk**: legs rotate at the hip in opposite pairs (a quadruped: front and rear opposite, far
  pair half a cycle behind the near pair; a many-legged animal: a travelling sine wave, one phase
  step per leg). ±16-18° on contact frames, ±5-6° on passing frames with the body raised a pixel
  and the swinging foot lifted two. Four frames is enough; the eye completes it.
- **Telegraph**: make it the attack's own wind-up, large. The bull drops his head 20-24° with the
  horns forward, squashes 5% onto braced legs and paws (front leg forward and lifted, then back
  down — the pingPong is the pawing). The Kellerassel rears 22-32° at the neck, feelers forward,
  front legs off the floor. `render/entities.ts` already flushes a boss red over the wind-up; the
  pose is what tells the player *what* is coming.
- **Hurt**: the opposite lean to the telegraph (head up, body back) plus `tint: 1` — one
  `nudgeShade` step lighter on every pixel, staying on-palette. Never white; the engine's emissive
  flash is white.
- **Death**: legs fold (rotate toward horizontal) *and* follow the body down (`legDy`), so the
  body ends on the ground with hooves poking out. A quadruped stumbles, collapses, lies. A bug
  splays, sinks, and flips: the last frame is the normal pose under a global `sy: -1` about its
  own centre — on its back, legs up. Whatever the creature, the last frame should be readable as
  "dead" from across the room.

Keep the frame count at twelve unless the sidecar changes with it; `tests/art/boss-authoring.test.ts`
checks the two agree and that the committed PNG is byte-identical to a fresh build.

## 7. Sign-off and verification

- Show the person the `frames` sheet **and** the boss standing in its room from the game's camera
  (`CLAUDE.md`'s billboards note) before committing. Two or three material variants (a coat in
  neutrals vs. a coat with a blue-black shadow, say) are one-line changes and cheap to offer.
- Verify live through the **real** door transition, not the debug Rooms panel: `J` grants the
  Meisterschlüssel, `N` walks the floor room by room once each room is cleared, and the boss
  room's warmup edge raises the intro plate — the panel's "Apply to running game" skips that
  edge, which is how #99's plate bug stayed hidden. Headless: launch `vite`, press `Enter`, `J`,
  then kill the room's enemies and press `N` until `__kellerbier.sim.bossDefinition` is set;
  screenshot at once (plate) and again a few seconds later (boss walking).
  `__kellerbier.view.animator` shows which clip and frame each body is on.
- `npm test`, `npm run typecheck`, `npm run lint`. `assertOnPalette` runs inside `art:bosses`.

## 8. Things that did not work, so nobody tries them again

- **Composing the creature from primitives to match the art** (#99): proportions can be measured
  from a reference; shape fidelity cannot. It stayed a rounded rectangle with legs.
- **Downsampling the whole cutout and quantizing it** (#100/#101): a photograph at 116 px is a
  photograph. One outline round the union, brushwork inside, nothing to articulate.
- **Nearest-colour against the floor's full palette**: snaps a brown coat to green. Per-part
  materials replace it entirely.
- **Luminance-keying a mid-toned part against a mid-toned background** (Kellerassel legs): tears
  the part into fragments. Tight polygon, no key.
- **Per-column ripple as a walk** (#101): shears a thin leg apart; a rigid rotation at a hip does
  not.
- **Rotating a whole frozen raster for a death pose** (#100): reads as the same picture tipped
  over. Fold the legs and drop the body instead.
