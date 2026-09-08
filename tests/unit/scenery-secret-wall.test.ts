import { describe, expect, it } from 'vitest';
import { Scene } from 'three';
import { Lighting } from '../../src/render/world/lighting.js';
import { MaterialCache } from '../../src/render/world/material-cache.js';
import { Scenery } from '../../src/render/world/scenery.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import { type CompiledDoor, ROOM_MARGIN_X, ROOM_MARGIN_Y } from '../../src/sim/room/template.js';

/**
 * #5: a secret room's wall, once a Bierfassl blast has opened it, is a real
 * gap the player can see through — a blasted hole with rubble, not a hinged
 * timber door. `SceneryView` is told which of a room's doorways lead to a
 * secret room; the one that has become a real door (it is in `sim.doors`
 * only after the reveal) draws blasted.
 */

function room(): RoomGeometry {
  return new RoomGeometry(ROOM_MARGIN_X, ROOM_MARGIN_Y, ROOM_MARGIN_X + 240, ROOM_MARGIN_Y + 144);
}

const NORTH: readonly CompiledDoor[] = [{ direction: 'north', cellCol: 0, cellRow: 0 }];

function build(secret: Iterable<CompiledDoor['direction']>): Scenery {
  const scene = new Scene();
  const lighting = new Lighting(scene);
  return new Scenery(
    room(),
    1,
    NORTH,
    [],
    { tileTextures: {} },
    -1,
    lighting,
    new MaterialCache(),
    new Set(secret),
  );
}

describe('a blasted-open secret wall (#5)', () => {
  it('draws an ordinary hinged door when the doorway is not a secret one', () => {
    const scenery = build([]);
    const door = scenery.doors[0];
    expect(door).toBeDefined();
    expect(door?.hinges.length).toBeGreaterThan(0);
  });

  it('draws the secret doorway as a permanently-open hole with no leaf', () => {
    const scenery = build(['north']);
    const door = scenery.doors[0];
    expect(door).toBeDefined();
    // No leaf to swing…
    expect(door?.hinges.length).toBe(0);
    // …and it never reads as shut, so its passage light keeps shining.
    expect(door?.currentState).toBe('open');
  });

  it('ignores door-state changes on a blasted hole', () => {
    const scenery = build(['north']);
    const door = scenery.doors[0];
    door?.setState('closed');
    door?.setState('locked');
    expect(door?.currentState).toBe('open');
  });
});
