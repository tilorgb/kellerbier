import { describe, expect, it } from 'vitest';
import { Mesh } from 'three';
import cellarCrossroads from '../../src/content/rooms/cellar.json';
import cellarHall from '../../src/content/rooms/cellar-hall.json';
import { GameSim } from '../../src/sim/game/sim.js';
import { type GameView } from '../../src/render/view.js';
import { buildHeadlessView } from '../bench/scene.js';

/**
 * `GameView`'s use of `SceneryCache` end to end (#293): a real `GameSim`
 * loading real room templates, `GameView.sync` driving the same room-change
 * detection `app/main.ts` relies on, and the room's merged wall/void mesh's
 * own object identity as the signal — a cache hit hands back the very same
 * `Mesh`, not a new one built from the same data, which is what "zero
 * geometries constructed by a crossing between visited rooms" means at the
 * object level.
 */

function roomSim(template: unknown): GameSim {
  return new GameSim({ roomTemplate: template, floor: 1, population: 'empty' });
}

/** The room's merged wall body mesh — named by `Scenery.finalizeWalls`, unique in the scene. */
function wallMesh(view: GameView): Mesh {
  let found: Mesh | undefined;
  view.scene.traverse((object) => {
    if (object instanceof Mesh && object.name === 'scenery-wall-body') {
      found = object;
    }
  });
  if (found === undefined) {
    throw new Error('expected a "scenery-wall-body" mesh in the scene');
  }
  return found;
}

describe('GameView + SceneryCache, a revisited room reuses its Scenery', () => {
  it('hands back the same wall mesh on a revisit, and a different one for a different room', () => {
    const sim = roomSim(cellarCrossroads);
    const view = buildHeadlessView(sim);
    view.sync(0);
    const firstVisit = wallMesh(view);

    // A different room: a fresh build, a different mesh.
    sim.loadRoom(cellarHall, 1, null, [], undefined, { col: 0, row: 0 }, false);
    view.sync(0);
    const otherRoom = wallMesh(view);
    expect(otherRoom).not.toBe(firstVisit);

    // Back to the first room, same template (so the same `roomId`) but a
    // brand new `RoomGeometry` object from `loadRoom` — `sim.room` changes
    // identity even though it is "the same room", which is exactly the case
    // `SceneryCache` exists for.
    sim.loadRoom(cellarCrossroads, 1, null, [], undefined, { col: 0, row: 0 }, false);
    view.sync(0);
    const revisit = wallMesh(view);
    expect(revisit).toBe(firstVisit);

    view.destroy();
  });
});
