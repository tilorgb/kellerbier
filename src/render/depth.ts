import { Container, type Sprite } from 'pixi.js';

/**
 * The one layer in the game whose children are ordered by where they stand,
 * and the convention every sprite in it is drawn by (`docs/DECISIONS.md` #73).
 *
 * ## What this is for
 *
 * Everything else `render/view.ts` builds is a **fixed** stack: the room, then
 * the props, then the bodies, then the player. That order cannot express the
 * one thing an Isaac-like room is mostly made of — a player standing *behind*
 * something, with their head clear of it. Before this, the game had exactly
 * one object that could do it, and it did it by hand: `view.ts` removed the
 * Maibaum's container from the world and re-added it above or below the player
 * every single frame, off a `footY` getter written for that one prop (#199).
 *
 * This is that trick, generalised and made ordinary. Everything that *stands
 * on the floor* — a rock, a market stall, a barrel, an enemy, a boss, the
 * player, the Maibaum — goes in here, and each one says where its ground
 * contact is. Pixi sorts them by it. The Maibaum's special case is gone; so is
 * the reason anything would ever need another one.
 *
 * ## The convention: a sprite stands on its footprint's south pole
 *
 * A body's **foot line** is `y + footprintRadius` — the bottom of the circle
 * it is collided as (`sim/collision/footprint.ts`). That is both where the
 * sprite is anchored and what it is sorted by, which is what makes the two
 * agree by construction: a body that draws in front of another is a body whose
 * feet are further down the screen, no exceptions and nothing to keep in sync.
 *
 * It also makes "perceived height" free rather than a feature. A sprite is
 * bottom-anchored at its foot line, so everything it has above `y -
 * footprintRadius` is drawn but never collided — a head over a rock, a
 * boss's shoulders over the enemy in front of it. #56 already discovered this
 * for bosses ("a boss stands on its collider rather than being centred through
 * it") and called it the one place the anchor is not `0.5`; #73 is that
 * sentence applied to everything, which is why bosses need no special case
 * here any more either.
 *
 * ## Why it is its own render group
 *
 * Writing `zIndex` marks the parent render group's structure dirty, and Pixi
 * rebuilds that group's whole instruction set when it is. The world container
 * also holds the projectile layer, which in a busy room is thousands of
 * sprites that did not move in the scene graph at all — rebuilding those every
 * frame because a body walked two pixels is the kind of cost that only shows
 * up in the exact fight it must not. `enableRenderGroup` scopes the rebuild to
 * the sorted children.
 */

/**
 * Builds the sorted layer.
 *
 * Add to it with `addChild` like any container; give every child a foot line
 * with `setFootY` before it is first drawn.
 */
export function createDepthLayer(): Container {
  const layer = new Container();
  layer.sortableChildren = true;
  layer.enableRenderGroup();
  return layer;
}

/**
 * Sets where `child` touches the floor, in world units — the number the layer
 * sorts on.
 *
 * A no-op when it has not moved (Pixi's own `zIndex` setter returns early on
 * an unchanged value), which is what keeps a room full of static rock and
 * furniture from dirtying the sort every frame: only the things that actually
 * walk pay for it.
 *
 * @hot — called per body per rendered frame.
 */
export function setFootY(child: Container, footY: number): void {
  child.zIndex = footY;
}

/**
 * Stands `sprite` on the floor at `(x, footY)`: bottom-anchored, so whatever
 * it has above that line is height rather than hitbox.
 *
 * `flipX` is the facing mirror the caller would otherwise apply to `scale.x`
 * itself; it is taken here because the anchor and the mirror have to be set
 * together — a sprite flipped without its anchor being centred horizontally
 * mirrors about its left edge and slides sideways as it turns.
 */
export function standSprite(
  sprite: Sprite,
  x: number,
  footY: number,
  scale: number,
  flipX = 1,
): void {
  sprite.anchor.set(0.5, 1);
  sprite.scale.set(scale * flipX, scale);
  sprite.position.set(x, footY);
}

/**
 * Moves everything in `group` into `layer` as **direct** children, and hands
 * back the list so the caller can tear the set down together later.
 *
 * The room's rocks and its furniture are each built as one group by a factory
 * that knows nothing about depth (`createBlockView`, `createPropView`), and
 * each is replaced wholesale when the room changes. Adding the group itself
 * would be the easy thing and the wrong one: a nested container sorts as a
 * single item, so every rock in the room would land in front of, or behind,
 * every body in it — which is the ordering this layer exists to end. So the
 * children are adopted and the empty group is dropped.
 *
 * Their `zIndex` is written once, when they are built. Nothing here moves
 * again until the room does.
 */
export function adoptInto(layer: Container, group: Container): Container[] {
  const adopted = group.removeChildren();
  for (const child of adopted) {
    layer.addChild(child);
  }
  group.destroy();
  return adopted;
}
