import { Container, Sprite, type Texture } from 'pixi.js';
import { ROOM_TILE_UNITS } from '../content/rooms/definition.js';
import { setFootY } from './depth.js';
import { MAIBAUM_TOP_TILE, PROP_TILE_NAMES } from './floor-art.js';
import { tileGridScale } from './room.js';

/**
 * Draws a room's authored `decorativeProps` (#152).
 *
 * These have been in the room format since the beginning
 * (`content/rooms/definition.ts`'s `RoomDecorativeProp`) and, until this,
 * only two of the seventeen authored types did anything: `barrel` and
 * `maypole` become destructible targets and `pedestal` becomes loot, all in
 * the simulation. The other fourteen — the fence posts, the bunting, the
 * Maibaum, the market stall, the well — were authored intention that reached
 * the screen as nothing at all, which is most of why every room read as a
 * bare grid.
 *
 * Built once per room load, like `createRoomView`, and never touched per
 * frame: a prop does not move and cannot be destroyed. The three types the
 * simulation *does* turn into entities are deliberately absent from
 * `PROP_TILE_NAMES`, so nothing here draws a second copy of a barrel that
 * `EntityView` is already drawing.
 */
export function createPropView(
  props: readonly { readonly x: number; readonly y: number; readonly type: string }[],
  tileTextures: Readonly<Record<string, Texture>>,
): Container {
  const container = new Container();
  for (const prop of props) {
    const tileName = PROP_TILE_NAMES[prop.type];
    if (tileName === null) {
      // Something else draws this one — a trellis from the room's
      // `sightBlocks`, a puddle from its hazards, a pedestal from
      // `PedestalView`. An explicit `null` rather than an omission so the
      // warning below stays a real signal.
      continue;
    }
    if (tileName === undefined) {
      warnOnce(`no sprite is mapped for decorative prop type "${prop.type}"`);
      continue;
    }
    const texture = tileTextures[tileName];
    if (texture === undefined) {
      warnOnce(`decorative prop "${prop.type}" maps to tile "${tileName}", which is not loaded`);
      continue;
    }
    // The prop's own foot line: the bottom of the cell it is authored in.
    // Everything the prop has above that is height a player walks behind.
    const footY = prop.y + ROOM_TILE_UNITS / 2;
    container.addChild(standing(texture, prop.x, footY, footY));
    // A maypole one tile tall is a stick. `maibaum` is the one prop authored
    // as a two-tile stack, with its crown drawn directly above its base — and
    // the crown takes the *base's* foot line, not its own, so the two halves
    // of one object always sort together (#73).
    if (prop.type === 'maibaum') {
      const top = tileTextures[MAIBAUM_TOP_TILE];
      if (top !== undefined) {
        container.addChild(standing(top, prop.x, footY - ROOM_TILE_UNITS, footY));
      }
    }
  }
  return container;
}

/**
 * One prop tile, standing on `bottomY` and sorted by `footY`.
 *
 * The two are the same for a one-tile prop and differ for the upper half of a
 * stacked one, which has to sort with the half it sits on rather than by its
 * own (higher, therefore further away) edge.
 */
function standing(texture: Texture, x: number, bottomY: number, footY: number): Sprite {
  const sprite = new Sprite(texture);
  // A decorative prop is tile-category art (`docs/DECISIONS.md` #48), so it
  // takes the same `tileGridScale` every other tile-category renderer does —
  // authored at 16 or 32, filling the same on-screen footprint either way.
  // Before #182's follow-up this had no scale at all, which was silently
  // correct only because every prop happened to be 16px; redrawing one at 32
  // doubled it on screen with nothing here to notice.
  sprite.scale.set(tileGridScale(texture));
  // Bottom-anchored on the same convention every body takes since #73, so a
  // well or a market stall redrawn taller than its cell overhangs upward and
  // is something to stand behind rather than something that grew downward
  // through the floor.
  sprite.anchor.set(0.5, 1);
  sprite.position.set(x, bottomY);
  setFootY(sprite, footY);
  return sprite;
}

const warned = new Set<string>();

/**
 * Warns once per distinct message, in dev builds only.
 *
 * The graceful-degradation shape `docs/DECISIONS.md` #19 settled on: a prop
 * type nobody has drawn art for yet is a content gap, not a bug, so the room
 * loads without it and the run continues. Once per message rather than once
 * per prop, because a room revisited twenty times would otherwise print the
 * same line twenty times and bury everything else.
 *
 * What is *not* a gap, and so is not routed through here: a tileset naming a
 * sprite that does not exist, which `floor-art.ts` throws on. The difference
 * is whether the data is incomplete or wrong.
 */
function warnOnce(message: string): void {
  if (!import.meta.env.DEV || warned.has(message)) {
    return;
  }
  warned.add(message);
  console.warn(`prop-view: ${message}`);
}

/** Test seam: forgets which warnings have been printed. */
export function resetPropWarnings(): void {
  warned.clear();
}
