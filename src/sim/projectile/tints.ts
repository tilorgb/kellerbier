/**
 * Projectile tints: the colour an item paints its shots.
 *
 * The roster rule behind this is "every item is visible on the thing it
 * changed" — a Spezi's second shot is brown, a Colaweizen's sticky shot is
 * cola-dark, an Almabtrieb moving shot reads differently from a standing
 * one. A tag already picks a *sprite* (`render/projectiles.ts`'s
 * `PLAYER_TAG_SPRITE_ORDER`), but a tag is behaviour and two items granting
 * the same behaviour would look identical, and most of what an item does to
 * a shot — a second one, a bigger one, a harder one — is not a tag at all.
 * So a shot carries one small colour index alongside its tag mask, and the
 * renderer multiplies the sprite by that colour.
 *
 * Names live here, in `sim/`, so content can name one as a string literal
 * (`ctx.sim.tintProjectile(slot, 'spezi')`) under `content-is-data`'s
 * type-only import rule — the same reason `PROJECTILE_TAG_BY_NAME` exists.
 * The actual RGB values live in `render/palette.ts`'s
 * `PROJECTILE_TINT_COLOURS`: the simulation never learns what colour a
 * name is, only that a shot has one, which keeps this presentational field
 * out of anything a replay could diverge on.
 *
 * Index 0 is "no tint". `ProjectileStore.tint` is a `Uint8Array`, so the
 * roster can grow to 255 tints before this needs revisiting.
 */
export const PROJECTILE_TINT_NAMES = [
  'none',
  /** Almabtrieb's shot fired on the move — the promised "different colour". */
  'almabtrieb',
  /** Spezi: cola and orange, so the second shot is brown. */
  'spezi',
  /** Colaweizen: cola-dark. */
  'cola',
  /** Radler: paler, lemonade-yellow. */
  'radler',
  /** Kraftbier and Maß: a darker, heavier pour. */
  'dunkel',
  /** Weißwurst: white, while the tradition still holds. */
  'weiss',
  /** Feuerwehrhelm: hose water, pale blue. */
  'wasser',
  /** Bauern-Mistgabel: steel prongs. */
  'stahl',
  /** Kartoffelsalat: potato-yellow chunks. */
  'kartoffel',
  /** Apfelkuchen (mit Rosinen): a raisin, dark and wrong. */
  'rosine',
  /** Reinheitsgebot 1516 / Sudordnung 1493: the pure golden pour. */
  'gold',
  /** Traktor-Auspuff: diesel exhaust. */
  'abgas',
  /** Ludwigs Schwan: a white feather. */
  'feder',
  /** Bierdeckel: cardboard. */
  'pappe',
  /** Luftballon: a red balloon. */
  'ballon',
  /** Gartenzwerg-Hut: the extra shots a lucky streak adds, gnome-hat red. */
  'zwerg',
  /** Braumeister-Schürze: the two extra pours of the triple, a lighter head of foam. */
  'schaum',
  /** Bierbank: the second board of the bench, wood-brown. */
  'holz',
] as const;

export type ProjectileTintName = (typeof PROJECTILE_TINT_NAMES)[number];

/** Index of a tint by name — what `ProjectileStore.tint` stores. */
export const PROJECTILE_TINT_INDEX: Readonly<Record<ProjectileTintName, number>> =
  Object.fromEntries(PROJECTILE_TINT_NAMES.map((name, index) => [name, index])) as Readonly<
    Record<ProjectileTintName, number>
  >;
