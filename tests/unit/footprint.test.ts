import { describe, expect, it } from 'vitest';
import {
  FOOTPRINT_RATIO,
  footprintRadius,
  hurtboxOffsetY,
} from '../../src/sim/collision/footprint.js';
import { ENEMY_PROFILES, ENEMY_SIZE_BY_NAME } from '../../src/sim/enemy/size.js';
import { GameSim, PLAYER_FOOTPRINT, PLAYER_RADIUS } from '../../src/sim/game/sim.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import { createInputFrame } from '../../src/sim/input/frame.js';
import { entityIndex } from '../../src/sim/ecs/entity.js';

/**
 * The two circles (`docs/DECISIONS.md` #73).
 *
 * The interesting assertions here are not the arithmetic — they are the two
 * promises the split makes to the rest of the game. **Shooting does not
 * change**: an enemy's hurtbox keeps the radius every balance number in
 * `tuning.ts` was felt against, and it rises with the art rather than sinking
 * to the body's feet. **The floor circle really is smaller**: every body has
 * pixels above what it can be stopped by, which is the whole of "perceived
 * height".
 *
 * How the screen honours the split — standing a sprite on the smaller circle's
 * south pole and sorting bodies by foot line — was the 2D renderer's depth
 * layer; in the 3D room a body's quad stands at its footprint and the depth
 * buffer orders it (`render/world/billboard.ts`), so that half has no
 * renderer-side test to keep here.
 */

describe('the footprint and the hurtbox', () => {
  it('puts a body on less floor than it is drawn over', () => {
    for (const radius of [4, 7, 10, 22]) {
      expect(footprintRadius(radius)).toBeLessThan(radius);
      expect(footprintRadius(radius)).toBeGreaterThan(0);
    }
    expect(FOOTPRINT_RATIO).toBeLessThan(1);
  });

  it('lifts the hurtbox by exactly what the footprint gave up', () => {
    // The sprite is stood on the smaller circle's south pole, so it rises by
    // `radius - footprint`; the hurtbox rises with it. Any other offset would
    // slide a body's hurtbox toward its feet as the footprint shrank, which is
    // the failure this number exists to prevent.
    for (const radius of [4, 7, 10, 22]) {
      const footprint = footprintRadius(radius);
      expect(hurtboxOffsetY(radius, footprint)).toBeCloseTo(Math.round(footprint - radius), 6);
      expect(hurtboxOffsetY(radius, footprint)).toBeLessThan(0);
    }
  });

  it('snaps the hurtbox to a whole world unit, never half a screen pixel', () => {
    for (const radius of [4, 5.5, 7, 9.3, 10, 22]) {
      const offset = hurtboxOffsetY(radius, footprintRadius(radius));
      expect(Number.isInteger(offset)).toBe(true);
    }
  });

  it('gives every enemy size class a footprint inside its drawn radius', () => {
    for (const name of Object.keys(ENEMY_SIZE_BY_NAME) as (keyof typeof ENEMY_SIZE_BY_NAME)[]) {
      const profile = ENEMY_PROFILES[ENEMY_SIZE_BY_NAME[name]];
      expect(profile.footprint, name).toBeGreaterThan(0);
      expect(profile.footprint, name).toBeLessThan(profile.radius);
    }
  });
});

describe('what a spawned body carries', () => {
  const room = (): RoomGeometry => new RoomGeometry(0, 0, 640, 360);

  it('spawns an enemy collided on its class footprint and shot at its class radius', () => {
    const sim = new GameSim({ seed: 1, population: 'empty', room: room() });
    const entity = sim.spawnEnemy(200, 200, ENEMY_SIZE_BY_NAME.mid);
    sim.world.flush();
    const index = entityIndex(entity);
    const profile = ENEMY_PROFILES[ENEMY_SIZE_BY_NAME.mid];

    expect(sim.body.data[index * 2]).toBeCloseTo(profile.footprint);
    // Unchanged from before the split: this is the number the fight was tuned
    // against, and the point of having two circles is that it did not have to
    // move for the body to gain height.
    expect(sim.hurtbox.data[index * 2]).toBeCloseTo(profile.radius);
    expect(sim.hurtbox.data[index * 2 + 1]).toBeLessThan(0);
  });

  it('gives Alois the one hurtbox in the game that is not the size of its art', () => {
    const sim = new GameSim({ seed: 1, population: 'empty', room: room() });
    sim.step(createInputFrame());
    const index = sim.playerIndex;
    expect(sim.body.data[index * 2]).toBe(PLAYER_FOOTPRINT);
    // Deliberately his footprint rather than `PLAYER_RADIUS`: a shot over his
    // hat is a miss. Everything else keeps a hurtbox the size of its drawing.
    expect(sim.hurtbox.data[index * 2]).toBe(PLAYER_FOOTPRINT);
    expect(sim.hurtbox.data[index * 2 + 1]).toBe(hurtboxOffsetY(PLAYER_RADIUS, PLAYER_FOOTPRINT));
  });

  it('leaves a pickup as one circle, so its grab reach does not shrink', () => {
    const sim = new GameSim({ seed: 1, population: 'empty', room: room() });
    const entity = sim.spawnPickup('mass-half', 120, 120);
    sim.world.flush();
    const index = entityIndex(entity);
    expect(sim.hurtbox.data[index * 2]).toBeCloseTo(sim.body.data[index * 2] ?? 0);
    expect(sim.hurtbox.data[index * 2 + 1]).toBe(0);
  });
});
