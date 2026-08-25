import type { ProjectileStore } from './store.js';

/**
 * Projectile behaviour tags (#27) and how they compose.
 *
 * A projectile carries a bitmask of these rather than a discriminated "kind",
 * and that bitmask is the entire mechanism synergies come from —
 * `docs/GAME_DESIGN.md` §8 states it directly: a bouncing, splitting, homing
 * projectile has to simply work, because the item that grants `homing` and the
 * item that grants `splitting` are authored without either ever knowing the
 * other exists. `sim/projectile/behavior.ts` is where the tags are actually
 * evaluated; this file only owns identity and the composition rules, so
 * anything that needs to name a tag — an item's `onProjectileSpawn` hook, a
 * test, the fuzz test (#30) — imports this rather than the evaluator.
 *
 * ## Composition, and the two places it actually conflicts
 *
 * Most tags never interact: `burning` sets a status effect, `arcing` bends the
 * flight path, and the two have nothing to say to each other — both just run.
 * Two families of tag genuinely compete for the same decision. Rather than
 * special-case every pair the way an N×N synergy table would, each family
 * picks one fixed priority order, here, so a new tag joining a family only has
 * to say where it slots in — which is what the acceptance criterion "adding a
 * tag does not require touching existing tags" actually buys.
 *
 * **What survives an enemy hit** (`resolveProjectileHit` in `behavior.ts`):
 * `sticky` beats `piercing` beats `bouncing` beats nothing (the shot ends).
 * `sticky` wins outright because it is the most specific promise a tag makes —
 * an item that grants it is asking for exactly one thing, a projectile
 * embedded in whatever it hit, and letting `piercing` carry it straight
 * through would make the item that granted `sticky` do nothing at all.
 * `piercing` beats `bouncing` next, and this is the pair the issue names
 * directly: a piercing shot ignoring the enemy it just passed through and
 * continuing dead straight reads as the tag working; the same shot suddenly
 * caroming off at an angle reads as a bug, not as two features stacking.
 * Bouncing off the enemy it hit is still what happens when nothing stronger is
 * present, and a shot that both pierces and bounces spends its pierce budget
 * before it starts spending its bounce budget — see `behavior.ts`.
 *
 * **What owns position** (`applyProjectileMotionTags` in `behavior.ts`):
 * `orbiting` beats every other steering tag. `orbiting` computes where the
 * shot is directly, from an angle around its spawn point; `homing`, `arcing`
 * and `returning` all work the same way as each other — by nudging *velocity*
 * a little every tick — and none of that has anything left to steer once
 * position stops being integrated from velocity at all. `homing`, `returning`
 * and `arcing` do compose with each other: a returning shot that is also
 * homing chases the nearest target on the way back, and arcing's constant
 * curve rides on top of both, because each of the three only ever touches the
 * velocity the previous one left behind.
 *
 * `splitting` and the three status tags (`burning`, `freezing`, `poison`) are
 * orthogonal to both families above — they fire *on* a hit or *every* tick
 * respectively, never compete with a motion tag for control of velocity, and
 * so never needed a place in either order.
 */

export const ProjectileTag = {
  Homing: 1 << 0,
  Piercing: 1 << 1,
  Bouncing: 1 << 2,
  Splitting: 1 << 3,
  Sticky: 1 << 4,
  Arcing: 1 << 5,
  Burning: 1 << 6,
  Freezing: 1 << 7,
  Poison: 1 << 8,
  Spectral: 1 << 9,
  Returning: 1 << 10,
  Orbiting: 1 << 11,
} as const;

export type ProjectileTagId = (typeof ProjectileTag)[keyof typeof ProjectileTag];

/** Every tag, in bit order — for the fuzz test (#30) and the debug overlay. */
export const PROJECTILE_TAG_IDS: readonly ProjectileTagId[] = [
  ProjectileTag.Homing,
  ProjectileTag.Piercing,
  ProjectileTag.Bouncing,
  ProjectileTag.Splitting,
  ProjectileTag.Sticky,
  ProjectileTag.Arcing,
  ProjectileTag.Burning,
  ProjectileTag.Freezing,
  ProjectileTag.Poison,
  ProjectileTag.Spectral,
  ProjectileTag.Returning,
  ProjectileTag.Orbiting,
];

/** One past the highest bit `ProjectileTag` uses — every valid mask is below `1 << PROJECTILE_TAG_COUNT`. */
export const PROJECTILE_TAG_COUNT = PROJECTILE_TAG_IDS.length;

export function hasTag(mask: number, tag: ProjectileTagId): boolean {
  return (mask & tag) !== 0;
}

/**
 * Adds a tag to a shot already in flight — the shape an item's
 * `onProjectileSpawn` hook (`sim/item/definition.ts`) reaches for, since that
 * hook only ever sees a shot that already exists. A plain `tags[slot] |= tag`
 * at the call site reads the same, but `noUncheckedIndexedAccess` treats the
 * read half of that compound assignment as possibly `undefined` on a typed
 * array — this exists so an item author (and #29's content, not #27's engine)
 * never has to work around that themselves.
 */
export function addProjectileTag(
  projectiles: ProjectileStore,
  slot: number,
  tag: ProjectileTagId,
): void {
  projectiles.tags[slot] = (projectiles.tags[slot] ?? 0) | tag;
}

/**
 * The lower-case spelling of every tag, exactly `docs/GAME_DESIGN.md` §8's
 * names — what #29's content actually reaches for.
 *
 * `content-is-data` (`tools/eslint/architecture.js`) bans `src/content/**`
 * from importing anything but a type from `src/sim/**`, which means an item
 * cannot import `ProjectileTag` itself to say which bit it means — the whole
 * reason this function's own doc comment above promised item hooks would
 * "reach for" it turned out to need one more piece: a string name a hook can
 * write as a literal, typed against `ProjectileTagName` without importing the
 * value it resolves to. `GameSim.addProjectileTag` (`sim/game/sim.ts`) is the
 * method that actually does the resolving, one layer over this map, so a
 * hook body never touches `ProjectileTag` at all — only `ctx.sim`.
 */
export const PROJECTILE_TAG_BY_NAME = {
  homing: ProjectileTag.Homing,
  piercing: ProjectileTag.Piercing,
  bouncing: ProjectileTag.Bouncing,
  splitting: ProjectileTag.Splitting,
  sticky: ProjectileTag.Sticky,
  arcing: ProjectileTag.Arcing,
  burning: ProjectileTag.Burning,
  freezing: ProjectileTag.Freezing,
  poison: ProjectileTag.Poison,
  spectral: ProjectileTag.Spectral,
  returning: ProjectileTag.Returning,
  orbiting: ProjectileTag.Orbiting,
} as const satisfies Record<string, ProjectileTagId>;

export type ProjectileTagName = keyof typeof PROJECTILE_TAG_BY_NAME;
