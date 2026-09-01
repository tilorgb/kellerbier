import { PromilleTier, type PromilleTierId } from '../sim/game/promille.js';

/**
 * Every colour `render/` draws with, named by what it means rather than left
 * as a bare hex int at the call site (#109).
 *
 * Grouped the way the colours themselves are used, not alphabetically:
 * - `ENTITY_PALETTE` — the player/enemy/pickup layer (`entities.ts`)
 * - `EFFECT_PALETTE` — full-screen overlays tied to player state (`vignette.ts`, `game-over.ts`)
 * - `PARTICLE_PALETTE` — the placeholder blob/ring textures `main.ts` and
 *   `editor/playtest.ts` both build once at boot (`placeholder-art.ts`'s
 *   `createBlobTexture`/`createRingTexture`); `STRUCTURAL_WHITE` is the
 *   related "no colour yet, tint me later" primitive those same generators
 *   use for shapes nobody has assigned a colour to at all (mug outlines, bar
 *   fills) — a genuine placeholder rather than a meaningful token, kept
 *   named here anyway so the "no raw hex literal outside this file" rule
 *   has no exception.
 * - `HUD_PALETTE` — screen-space chrome: health, Promille, minimap, item
 *   gate, active item, wallet, boss health, game over, and the dev-only
 *   overlay text `main.ts` draws directly
 * - `RoomTheme`/`roomThemeForFloor`/`ROOM_HAZARD_PALETTE` — room geometry
 *   (walls, floor, obstacles, puddles, trellises, doors, secret-wall cracks)
 *
 * None of these values are new choices — every one is transcribed from
 * whatever constant used to sit at its call site (`git blame` finds the
 * original if the reasoning behind a specific number matters later).
 */

// ---------------------------------------------------------------------------
// Ground shadows (render/ground-shadow.ts) — one rule, one set of numbers
// ---------------------------------------------------------------------------

/**
 * The soft ellipse every foreground thing the player *acts on* casts where it
 * meets the floor — the player, an enemy, a boss, a dropped pickup, a
 * destructible barrel, a placed Bierfassl, the planted Maibaum
 * (`docs/DECISIONS.md` #61). Not pure scenery the player only walks past (a
 * fence post, a well, bunting), not a shot in flight, not the item floating
 * in a pedestal's beam; and not the obstacle tiles, which carry their own
 * baked contact shadow (#60).
 *
 * `render/ground-shadow.ts` owns the maths; these are the only knobs. The
 * shadow texture (`common/characters/actor-shadow.png`, a soft blob;
 * `common/bosses/boss-shadow.png`, a bigger flatter one) is drawn at these
 * alphas — the values #195 introduced were faint enough to barely read, so
 * `bodyAlpha` is up from 0.22/0.24.
 */
export const GROUND_SHADOW = {
  /** Player, enemy, pickup, destructible — anything actor-sized. */
  bodyAlpha: 0.4,
  /** A boss: its own wider, flatter texture, already tuned in #152 — kept where it was. */
  bossAlpha: 0.35,
  /** Shadow height as a fraction of its width — a shallow ellipse seen at the game's fixed ¾ angle. */
  aspect: 0.42,
  /** Fraction of a body's drawn width its shadow reads at — a standing body's footprint is narrower than its silhouette, and the canvas is padded on top of that. */
  standingFootprint: 0.72,
  /** Tighter still for a compact object that lies on the floor rather than standing — a keg, a stein, a coin, a Brezn. */
  lyingFootprint: 0.5,
  /**
   * How far *above* the art's last opaque row the shadow's centre sits, in
   * world units. Half a unit — barely a pixel — just so the ellipse straddles
   * the contact line instead of hanging entirely off the heels. The bottom of
   * the drawing itself is found per sprite by `render/inked-bounds.ts`, not
   * guessed from the canvas or the collider (#195's `radius * 0.85` was the
   * guess, and it sat 2px up the player's shins).
   */
  contactInset: 0.5,
} as const;

// ---------------------------------------------------------------------------
// Entities (render/entities.ts)
// ---------------------------------------------------------------------------

export const ENTITY_PALETTE = {
  /** Colour of a telegraph ring. The same red the debug overlay draws enemy colliders in. */
  telegraphRing: 0xf2566f,
  /** What an invulnerable body is tinted. Cold and dull: nothing is getting in. */
  invulnerableShellTint: 0x8fa2b8,
  /** What an elite (#156) is tinted — a warm gold, as far from `invulnerableShellTint`'s cold blue-grey as the palette allows. */
  eliteTint: 0xf2c14e,
  /**
   * What a boss reddens toward while it winds up an attack (#193).
   *
   * A boss fills a quarter of the screen, so the expanding telegraph ring every
   * other enemy gets would cover the room — for a boss the wind-up is read off
   * the body instead: the strained pose its `telegraph` clip holds, plus this
   * flush ramped in over the countdown. A hot red multiply, so it darkens and
   * reddens whatever the boss's own palette is.
   */
  bossTelegraphTint: 0xff5a44,
  /** Tint for a pickup whose kind failed to resolve. Should never be seen; a loud colour if it is. */
  unknownPickupTint: 0xff00ff,
  /** What a placed Bierfassl reddens toward as its fuse burns down (#208) — the same hot red a boss's own wind-up uses, so "about to go off" reads as one consistent warning across the game. */
  bombFuseTint: 0xff5a44,
  /** The untinted read — an ordinary body, or an untinted vignette. */
  normalTint: 0xffffff,
  /** A shop/pickup price label's text, dark-on-pastel — the fill colours pickups draw with are pastel/bright by design, so this is the one label colour that reads across all of them without per-kind styling. */
  pickupLabelText: 0x1b1622,
  /** Quality 0-3 tint for a pedestal's item/beam (`pedestal-view.ts`) — Isaac's own quality-colour convention loosely followed: plain, then warmer, then a real "this one matters" gold. */
  itemQualityTints: [0xd8d0c0, 0x7fd0e8, 0xb98af0, 0xf2c94c] as readonly [
    number,
    number,
    number,
    number,
  ],
} as const;

// ---------------------------------------------------------------------------
// Full-screen effects (render/vignette.ts, render/game-over.ts)
// ---------------------------------------------------------------------------

/**
 * What the vignette tints toward at each Promille tier (#153).
 *
 * The vignette used to be one black fade that got darker, plus #92's red
 * pulse at the very top — so the whole middle of the meter, where a player
 * actually spends a run, looked identical at every tier. These are the same
 * warm ramp the HUD's tier colours already run (`HUD_PALETTE.promilleTier`),
 * desaturated toward the dark end: the vignette should agree with the meter
 * without competing with it.
 *
 * Nuchtern is untinted, not "black" — at zero Promille the vignette's alpha
 * is zero anyway, and a tint on nothing is nothing.
 */
export const PROMILLE_VIGNETTE_TINT: Readonly<Record<PromilleTierId, number>> = {
  [PromilleTier.Nuchtern]: 0xffffff,
  [PromilleTier.Angeheitert]: 0xf0e4c8,
  [PromilleTier.Beduselt]: 0xe8c48a,
  [PromilleTier.Vollrausch]: 0xd99a5a,
  [PromilleTier.Sturzbesoffen]: 0xc76a4a,
  [PromilleTier.Filmriss]: 0x9a3a4a,
  [PromilleTier.Umgfalln]: 0x7a2a3a,
};

/**
 * Kater overrides the tier tint entirely — the debuff outlasts the tier that
 * caused it, so the screen has to say "hangover" rather than "still drunk".
 * Cold and grey where every tier tint is warm, which is the whole read.
 */
export const PROMILLE_KATER_TINT = 0x6a7080;

export const EFFECT_PALETTE = {
  /** The reddening the vignette tints toward as Trinkfest screen-distortion climbs — pure white (`ENTITY_PALETTE.normalTint`) is "no distortion." */
  distortionTint: 0xff5555,
  /** The game-over dim over the game, behind the death word and run summary. */
  gameOverDim: 0x0a0806,
} as const;

// ---------------------------------------------------------------------------
// Placeholder particle/blob textures (render/placeholder-art.ts callers:
// app/main.ts's `viewTextures`, editor/playtest.ts's near-identical block)
// ---------------------------------------------------------------------------

export const PARTICLE_PALETTE = {
  projectileFill: 0xf0c46a,
  projectileRim: 0xfff3d0,
  entityFill: 0x7d5a3c,
  entityRim: 0xb08056,
  /** Solid white on both fill and rim — the flash swaps the whole texture rather than tinting one, since a tint can only ever darken. */
  entityFlash: 0xffffff,
  /** White, and tinted where it is drawn — one ring texture serves every telegraph. */
  telegraphRing: 0xffffff,
  foamFill: 0xfff4dc,
  foamRim: 0xffffff,
  splashFill: 0xd9a441,
  splashRim: 0xf6d08a,
  /** Dark and wet, not another body — a splash the same brown as a target would read as "something is still standing there." */
  decalFill: 0x3a2a12,
  decalRim: 0x4a3618,
  pedestalItemFill: 0xffffff,
} as const;

/**
 * The "no colour assigned, tint me later" primitive `placeholder-art.ts`'s
 * shape generators (`createRingTexture`'s default caller, `createMugTexture`,
 * `createBarOutlineTexture`, `createSolidTexture`, `createSilhouetteTexture`)
 * draw their outlines/fills in — genuinely not a meaningful colour choice the
 * way everything else in this file is, but named anyway so those call sites
 * have no exception to "no raw hex literal outside `palette.ts`."
 */
export const STRUCTURAL_WHITE = 0xffffff;

// ---------------------------------------------------------------------------
// HUD chrome
// ---------------------------------------------------------------------------

/** One colour per Promille tier — decoration on top of the tier name text, never the only signal. */
const PROMILLE_TIER: Readonly<Record<PromilleTierId, number>> = {
  [PromilleTier.Nuchtern]: 0x6fae6f,
  [PromilleTier.Angeheitert]: 0xc9b45a,
  [PromilleTier.Beduselt]: 0xd99a3a,
  [PromilleTier.Vollrausch]: 0xd9603a,
  [PromilleTier.Sturzbesoffen]: 0xb23a3a,
  [PromilleTier.Filmriss]: 0x6a1f2a,
  [PromilleTier.Umgfalln]: 0x8a3a3a,
};

/** Neutral reskin (#33) of `PROMILLE_TIER`: blue-through-magenta-to-red, a "power" ramp rather than beer's amber/gold. `Nuchtern`'s green is kept as-is. */
const PROMILLE_TIER_NEUTRAL: Readonly<Record<PromilleTierId, number>> = {
  [PromilleTier.Nuchtern]: 0x6fae6f,
  [PromilleTier.Angeheitert]: 0x5aa9c9,
  [PromilleTier.Beduselt]: 0x5a7fc9,
  [PromilleTier.Vollrausch]: 0x8a5ac9,
  [PromilleTier.Sturzbesoffen]: 0xb23ac9,
  [PromilleTier.Filmriss]: 0xd93a6a,
  [PromilleTier.Umgfalln]: 0x8a3a3a,
};

export const HUD_PALETTE = {
  /** The one label-text colour shared verbatim by health, Promille, item gate, active item, wallet, boss health, minimap and game-over's own headline. */
  labelText: 0xe8dfd0,
  /** `main.ts`'s dev-only bottom-left overlay text, and game-over's "press R to try again" hint — the same muted tan. */
  devText: 0x8a7f74,

  healthRed: 0xd9403a,
  healthSoul: 0xdce8f2,
  /** "Schwarzbier" — dark rather than literally black, so the outline still reads. */
  healthEternal: 0x3a3a42,

  minimapUnvisited: 0x54445f,
  minimapVisited: 0x8a7f74,
  minimapCurrentFill: 0xe8dfd0,
  minimapCurrentOutline: 0xffffff,
  minimapBackdrop: 0x14101a,
  minimapTreasureIcon: 0xe8c96a,
  minimapShopIconFill: 0x6ab0c9,
  minimapShopIconRim: 0xd0eef6,
  minimapBossIcon: 0xc95a5a,

  promilleTier: PROMILLE_TIER,
  promilleTierNeutral: PROMILLE_TIER_NEUTRAL,
  /** Kater overrides the tier colour entirely — the debuff outlasts the tier that caused it. */
  promilleKater: 0x5a4a6a,
  /** Neutral reskin's Kater colour — a cool grey rather than Kater's boozy purple. */
  promilleKaterNeutral: 0x4a4a5a,

  /** Pale blue for a `sober`-gated item. */
  itemGateSober: 0x8fd0e8,
  /** Warm amber for a `rausch`-gated item. */
  itemGateRausch: 0xd97a3a,

  activeItemCharging: 0xa89a6a,
  activeItemReady: 0xe8c65a,
  /** A `rausch`/`sober` active item outside its tier — grey, distinct from either charging shade above. */
  activeItemDormant: 0x6a6a6a,

  bossHealthFill: 0xb23a3a,

  gameOverHeadline: 0xe8dfd0,
  gameOverSummary: 0xb8ac9c,
  gameOverHint: 0x8a7f74,

  /** The `BOSSRAUM` intro banner. */
  bossBanner: 0xd9a441,
  /** Pickup toast and shop preview text — the same highlight gold. */
  toastText: 0xe8c94a,
  /** Pedestal name plate and reveal panel text. */
  pedestalText: 0xffffff,
  shopPreviewAffordable: 0xffffff,
  shopPreviewUnaffordable: 0x8a8a8a,
} as const;

// ---------------------------------------------------------------------------
// The UI kit (render/ui/) — panels, buttons, sliders, the focus ring, icons
// ---------------------------------------------------------------------------

/**
 * The kit's own colours (#154).
 *
 * Separate from `HUD_PALETTE` above rather than folded into it, because the
 * two answer different questions. `HUD_PALETTE` is *what a value means* — a
 * Promille tier, a soul mug, an unaffordable price — and every entry there
 * exists because some piece of state needed a colour. `UI_PALETTE` is *what
 * the chrome around it is made of*, and it has to hold still: a panel that
 * changed colour with the floor would make every screen read as a different
 * game, which is exactly what the per-floor `RoomTheme` above is for and
 * exactly what the UI must not do.
 *
 * The neutrals come off the master palette (`tools/art/palette.mjs`'s
 * `NEUTRAL_PALETTE`) where there is a match — `outline` is its outline ink —
 * and the purples are the same family `APP_BACKGROUND_COLOUR` and
 * `DEFAULT_ROOM_THEME` already sit in, so a panel over an unthemed part of the
 * screen reads as belonging to it.
 */
export const UI_PALETTE = {
  /** Every piece of UI art is drawn against this. Master-palette outline ink. */
  outline: 0x1c1a1f,

  /** The dark field inside a panel — brown rather than the app's purple, so the chrome reads as a made object rather than as more background. */
  panelFill: 0x2a1c14,
  panelHighlight: 0x8a5a24,
  panelShadow: 0x120c0a,

  /** A button at rest. */
  buttonFill: 0x4a2f18,
  buttonHighlight: 0xd9a441,
  buttonShadow: 0x8a5a24,
  /** The row the cursor or the gamepad is on. */
  buttonSelectedFill: 0x8a5a24,
  buttonSelectedHighlight: 0xf0c46a,
  /** Held down — the bevel inverts, so a press reads without the row moving. */
  buttonPressedFill: 0x1c1a1f,
  /** Unavailable: flat, no bevel, and its label drops to `textDisabled`. */
  buttonDisabledFill: 0x2a2630,

  /** The inside of anything sunken — a slider track, a meter, an empty slot. */
  wellFill: 0x120c0a,

  sliderFill: 0xd9a441,
  knobFill: 0xd0c6b8,

  /** The gamepad focus ring (#53). The one gold nothing else on the screen uses. */
  focusRing: 0xe8c94a,

  /** Label text on a panel, and the dimmer secondary line under it. */
  text: 0xe8dfd0,
  textDim: 0x8a7f74,
  textDisabled: 0x6a6270,

  /** The kit's one accent — the same amber an open door and a cellar light already are. */
  accent: 0xd9a441,
} as const;

/**
 * The display face's treatments (#154) — the colours a title is built out of.
 *
 * Kept apart from `UI_PALETTE` because they answer a different question again:
 * `UI_PALETTE` is the chrome a player looks *past*, and these are the two or
 * three seconds a floor card or a boss plate is the only thing on screen. A
 * ramp here is deliberately three or four flat bands rather than a gradient —
 * that is what the era's actual title cards did, and it is what survives being
 * drawn out of whole pixels.
 */
export const TITLE_PALETTE = {
  /** Gold leaf, lit from above: the floor cards and the game's own name. */
  goldRamp: [0xf6e3a0, 0xe8c94a, 0xd9a441, 0x8a5a24] as readonly number[],
  goldGrain: 0xf6e3a0,
  /** The boss plate and the word a run ends on — the same shapes, bled. */
  bloodRamp: [0xf2a09a, 0xd9403a, 0x8a1f22] as readonly number[],
  bloodGrain: 0xf2a09a,
  /** A quieter scheme for a heading that is not an event — the map overlay's floor line. */
  boneRamp: [0xf5f0e6, 0xd0c6b8, 0x8a7f74] as readonly number[],

  /** One pixel around every treated line. The master palette's outline ink. */
  outline: 0x1c1a1f,
  /** The hard offset shadow under a title. Darker than any fill, so it never reads as part of the letter. */
  shadow: 0x120c0a,

  /** The card's ornamental border and rules. */
  rule: 0xd9a441,
  ruleShade: 0x8a5a24,
  /** What a title card puts behind itself, over the frozen room. */
  cardBackdrop: 0x1c1410,
  cardEdge: 0x14100c,
  /** The line of flavour under a floor's name. */
  cardSubtitle: 0xb8ac9c,
} as const;

/** The colour behind everything — cellar dark, not black (`render/app.ts`). */
export const APP_BACKGROUND_COLOUR = 0x14101a;

// ---------------------------------------------------------------------------
// Room geometry — per-floor theme (render/room.ts)
// ---------------------------------------------------------------------------

export interface RoomTheme {
  readonly floor: number;
  readonly wall: number;
  readonly wallEdge: number;
  readonly block: number;
  readonly blockEdge: number;
}

/** Placeholder theme for a floor with no `ROOM_THEMES` entry of its own. Never hit today — every floor 1-7 has one below — kept as the fallback for a floor number outside that range (floor 0 in tests that don't care, or beyond 7). */
export const DEFAULT_ROOM_THEME: RoomTheme = {
  floor: 0x241d2b,
  wall: 0x3a2f45,
  wallEdge: 0x54445f,
  block: 0x4a3a2c,
  blockEdge: 0x6d5540,
};

/**
 * One `RoomTheme` per floor (#109) — the seven floors in
 * `docs/CONTENT_BIBLE.md` §1 each reading as a different place, applied to
 * the placeholder/procedural room geometry the renderer still generates
 * itself rather than drawing from a tileset (same shape #34's authored
 * per-floor sub-palettes, `tools/art/palette.mjs`'s `FLOOR_PALETTES`,
 * already establish for pixel art).
 *
 * Floors 1 and 2 are hand-tuned by feel against real rooms (#35, #37) —
 * `floor`/`wall` are the room's own material, `wallEdge`/`blockEdge` share
 * one highlight, `block` is the one accent for what's placed in the room
 * (Floor 1's wood racks, Floor 2's fence/bunting blue) rather than a second
 * inline colour. Floors 3-7 have no authored rooms yet (#39-#43, parked in
 * M10) — nothing to tune the arrangement by feel against — so their themes
 * below reuse that exact shape mechanically instead of inventing new
 * colours: `wall`/`floor` are the two darkest of that floor's own authored
 * background swatches (`tools/art/palette.mjs`'s `floorBackgroundSwatches`),
 * `wallEdge`/`blockEdge` share the single brightest colour on the floor
 * (background or accent) as the highlight, and `block` is the first accent
 * distinct from that highlight. Revisit each by feel once its floor gets
 * real rooms, the same way 1 and 2 already were.
 */
const ROOM_THEMES: Readonly<Record<number, RoomTheme>> = {
  // Der Keller (#35): bare concrete, not timber — cold grey is the base
  // material, brown is only the wooden racks sitting in the room. The three
  // greys sit close together on purpose — a damp basement lit by one bulb
  // is a low-contrast room, not a checkerboard.
  1: { floor: 0x4a4d50, wall: 0x3c3e40, wallEdge: 0x5b5f63, block: 0x54402e, blockEdge: 0x5b5f63 },
  // Dorf & Acker (#37): green, sky blue, white-and-blue bunting. `wallEdge`
  // is the sky blue so an outdoor room's wall band reads as a hedge rather
  // than a second floor material; `block` (fence post, hay bale) takes the
  // deep blue bunting accent.
  2: { floor: 0x3f7a3a, wall: 0x2e4f8c, wallEdge: 0x6ab0d9, block: 0x2e4f8c, blockEdge: 0x6ab0d9 },
  // Der Wald — no rooms yet (#39). Highlight is the "sickly luminous fungus" accent; block is the "wrong" purple.
  3: { floor: 0x234d2b, wall: 0x16261a, wallEdge: 0x9fe066, block: 0xc060d9, blockEdge: 0x9fe066 },
  // Die Alpen — no rooms yet (#40). Highlight is snow white; block is the "alpenglow pink" accent.
  4: { floor: 0xb9c4cc, wall: 0x6e7680, wallEdge: 0xeef2f5, block: 0xe893a8, blockEdge: 0xeef2f5 },
  // Schloss Neuschwanstein — no rooms yet (#41). Highlight is the candlelight accent; block is the gold trim.
  5: { floor: 0x3a5ba0, wall: 0x1f3a70, wallEdge: 0xf4d78a, block: 0xd4af37, blockEdge: 0xf4d78a },
  // Die Brauerei — no rooms yet (#42). Highlight is the hazard-yellow accent; block is the lighter cola-brown.
  6: { floor: 0x494f54, wall: 0x4a2f18, wallEdge: 0xe0b400, block: 0x8a5a24, blockEdge: 0xe0b400 },
  // Die Wiesn — no rooms yet (#43). "Everything at once" — every one of its five colours is a background swatch; highlight is the brightest, block the mid-bright teal.
  7: { floor: 0xb23bd9, wall: 0xd92b3c, wallEdge: 0xf5f0e6, block: 0x2fb8c4, blockEdge: 0xf5f0e6 },
};

/** `ROOM_THEMES[floor]`, falling back to `DEFAULT_ROOM_THEME` for a floor number with no entry. */
export function roomThemeForFloor(floor: number): RoomTheme {
  return ROOM_THEMES[floor] ?? DEFAULT_ROOM_THEME;
}

/**
 * Hazard/prop colours that are a fixed idea independent of which floor's
 * `RoomTheme` happens to be active — Floor 1's slick puddle and Floor 2's
 * hop trellis are drawn from their own floor's `RoomTheme` accents already
 * (the puddle's edge picks up Floor 1's one warm light source, the trellis
 * is Floor 2's leaf green), but neither generalises to a floor that has no
 * puddle or trellis at all, so they stay their own named colours here
 * rather than becoming a sixth/seventh `RoomTheme` field every floor would
 * need to fill in. Doors and the secret-room crack hint are drawn the same
 * on every floor today (locked reads cold and shut, open picks up Floor 1's
 * amber light, the crack is a plain wood-brown) — nothing yet asks for
 * these to vary by floor either.
 */
export const ROOM_HAZARD_PALETTE = {
  puddleFill: 0x3c3e40,
  puddleEdge: 0xd99a3f,
  trellisFill: 0x3f7a3a,
  trellisEdge: 0x7fbf6a,
  doorLocked: 0x5a2a2a,
  doorOpen: 0xd9a441,
  crack: 0x8a6a4a,
} as const;
