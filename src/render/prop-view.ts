import { Container, Sprite, type Texture } from 'pixi.js';
import { ROOM_TILE_UNITS } from '../content/rooms/definition.js';
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
    container.addChild(centred(texture, prop.x, prop.y));
    // A maypole one tile tall is a stick. `maibaum` is the one prop authored
    // as a two-tile stack, with its crown drawn directly above its base.
    if (prop.type === 'maibaum') {
      const top = tileTextures[MAIBAUM_TOP_TILE];
      if (top !== undefined) {
        container.addChild(centred(top, prop.x, prop.y - ROOM_TILE_UNITS));
      }
    }
  }
  return container;
}

function centred(texture: Texture, x: number, y: number): Sprite {
  const sprite = new Sprite(texture);
  // A decorative prop is tile-category art (`docs/DECISIONS.md` #48), so it
  // takes the same `tileGridScale` every other tile-category renderer does —
  // authored at 16 or 32, filling the same on-screen footprint either way.
  // Before #182's follow-up this had no scale at all, which was silently
  // correct only because every prop happened to be 16px; redrawing one at 32
  // doubled it on screen with nothing here to notice.
  sprite.scale.set(tileGridScale(texture));
  sprite.anchor.set(0.5);
  sprite.position.set(x, y);
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
