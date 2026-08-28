import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { scanSprites } from '../../tools/art/scan.mjs';
import { decodePng } from '../../tools/art/png.mjs';
import { validateAnimation } from '../../tools/art/validate.mjs';
import {
  AnimationState,
  compileAnimationSet,
  type AnimationSidecar,
} from '../../src/render/animation/definition.js';
import { ENEMY_DEFINITIONS } from '../../src/content/enemies/index.js';
import { PLAYER_BODY_KEYS, SCHLAUCH_OCTANTS } from '../../src/render/player-art.js';
import { WALK_CYCLE_FRAMES } from '../../tools/art/spec.mjs';

/** Every strip name `render/player-art.ts` asks `common/characters/` for. */
const PLAYER_STRIP_NAMES = [...PLAYER_BODY_KEYS.map((key) => `alois-${key}`), 'alois-schlauch'];

/**
 * The animated art that is actually committed, compiled the way the game
 * compiles it.
 *
 * Every other test in this area works on temporary fixtures, which is right for
 * testing the pipeline but proves nothing about the tree. This is the
 * counterpart `docs/DECISIONS.md` #19 asks for: the runtime falls back
 * gracefully on an unauthored clip, and CI is what stops one reaching a player
 * in the first place — the same job `tests/content/room-floor-eligibility.test.ts`
 * does for room content.
 */

const SPRITE_ROOT = fileURLToPath(new URL('../../assets/sprites/', import.meta.url));

const animated = (await scanSprites(SPRITE_ROOT)).filter((sprite) => sprite.animation !== null);

describe('every animation strip in assets/sprites/', () => {
  it('there is at least one, so this file is not silently vacuous', () => {
    expect(animated.length).toBeGreaterThan(0);
  });

  it.each(animated.map((sprite) => [`${sprite.bucketId}/${sprite.name}`, sprite] as const))(
    '%s compiles into a playable clip set',
    async (_label, sprite) => {
      const sidecar = sprite.animation as AnimationSidecar;
      expect(validateAnimation(sidecar as unknown as Record<string, unknown>)).toBeNull();

      const { width, height } = decodePng(await readFile(sprite.filePath));
      // The check the build cannot make on its own: the declared frame count
      // against the file that is actually on disk.
      expect(width % sidecar.frames).toBe(0);
      expect(height).toBeGreaterThan(0);

      const set = compileAnimationSet(sprite.name, sidecar, sidecar.frames);
      expect(set.frameCount).toBe(sidecar.frames);
      // Every compiled sequence stays inside the strip, which is what stops a
      // frame rectangle running off the edge of the texture at load.
      for (const clip of set.clips) {
        if (clip === null) {
          continue;
        }
        for (const frame of clip.sequence) {
          expect(frame).toBeGreaterThanOrEqual(0);
          expect(frame).toBeLessThan(sidecar.frames);
        }
        expect(clip.totalMs).toBeGreaterThan(0);
      }
    },
  );

  it.each(animated.map((sprite) => [sprite.name, sprite] as const))(
    '%s is named after a sprite something in the game asks for',
    (name, sprite) => {
      // A strip is looked up by name and by nothing else, so a typo in a
      // filename is a strip nothing ever plays — the animated equivalent of an
      // unresolvable enemy id, and `docs/DECISIONS.md` #7 says that fails
      // rather than degrades. Which names are askable depends on the bucket:
      // a floor bucket is a roster, keyed by `EnemyDefinition.id`
      // (`render/floor-art.ts`); `common/` is where Alois lives, keyed by
      // facing and drunkenness (`render/player-art.ts`).
      if (sprite.bucketId === 'common') {
        expect(PLAYER_STRIP_NAMES).toContain(name);
        return;
      }
      const ids = ENEMY_DEFINITIONS.map((definition) => definition.id);
      expect(ids).toContain(name);
    },
  );
});

describe('Alois (#151)', () => {
  const bodies = PLAYER_BODY_KEYS.map((key) => {
    const sprite = animated.find((entry) => entry.name === `alois-${key}`);
    if (sprite === undefined) {
      throw new Error(`alois-${key}.strip.png is not committed`);
    }
    return [key, sprite] as const;
  });

  it('has a body strip for every facing, sober and drunk', () => {
    // Six: three facings (side is mirrored for the fourth) times sober and
    // drunk. The acceptance criterion this stands for is "no generated
    // placeholder draws the player" — `render/player-art.ts` throws on a
    // missing one at load, and this is the same guarantee a pull request away
    // from a player rather than a tick away.
    expect(bodies).toHaveLength(6);
  });

  it.each(bodies)('alois-%s walks and idles', (_key, sprite) => {
    const sidecar = sprite.animation as AnimationSidecar;
    const set = compileAnimationSet(sprite.name, sidecar, sidecar.frames);
    // An idle that is one frame is a paused game, which is the thing #151 says
    // it must not look like.
    expect(set.idle.sequence.length).toBeGreaterThan(1);
    const move = set.clips[AnimationState.Move];
    expect(move?.sequence).toHaveLength(WALK_CYCLE_FRAMES);
  });

  it('flinches and dies, in every facing he can be looked at in', () => {
    for (const [key, sprite] of bodies) {
      if (key.startsWith('drunk-')) {
        // Deliberately unauthored: `PlayerView` never asks a drunk strip for
        // `hurt` or `death` — a flinch is a flinch — so drawing six more poses
        // nothing plays would be six more poses to keep in step. The idle
        // fallback covers it if that ever changes, and warns once.
        continue;
      }
      const sidecar = sprite.animation as AnimationSidecar;
      const set = compileAnimationSet(sprite.name, sidecar, sidecar.frames);
      expect(set.clips[AnimationState.Hurt]?.repeats).toBe(false);
      const death = set.clips[AnimationState.Death];
      expect(death?.repeats).toBe(false);
      // Held, not handed back to idle: the death clip has to still be on
      // screen when the game-over screen comes up over it.
      expect(death?.holds).toBe(true);
    }
  });

  it('aims through a Schlauch with eight resting and eight firing frames', () => {
    const schlauch = animated.find((sprite) => sprite.name === 'alois-schlauch');
    expect(schlauch).toBeDefined();
    const sidecar = schlauch?.animation as AnimationSidecar;
    expect(sidecar.frames).toBe(SCHLAUCH_OCTANTS * 2);
    // No clips at all, and that is the honest shape: the game indexes this
    // strip by aim octant, it never plays it as a timeline.
    expect(sidecar.clips).toBeUndefined();
  });
});

describe('the Kellerassel', () => {
  const kellerassel = animated.find((sprite) => sprite.name === 'kellerassel');

  it('is animated at all — #150 acceptance criterion', () => {
    expect(kellerassel).toBeDefined();
  });

  it('walks with a walk cycle and dies with a death clip', () => {
    if (kellerassel === undefined) {
      throw new Error('unreachable: guarded by the test above');
    }
    const sidecar = kellerassel.animation as AnimationSidecar;
    const set = compileAnimationSet('kellerassel', sidecar, sidecar.frames);

    const move = set.clips[AnimationState.Move];
    expect(move).not.toBeNull();
    // Four frames of playback out of three drawn — the walk plays 0-1-0-2, so
    // the contact pose is not stored twice just because it is played twice
    // (`docs/DECISIONS.md` #37 on the frame budget).
    expect(move?.sequence.length).toBe(4);
    expect(new Set(move?.sequence ?? []).size).toBe(3);

    const death = set.clips[AnimationState.Death];
    expect(death).not.toBeNull();
    expect(death?.repeats).toBe(false);
    // A corpse holds its last pose rather than popping back to an idle one.
    expect(death?.holds).toBe(true);

    const hurt = set.clips[AnimationState.Hurt];
    expect(hurt?.repeats).toBe(false);
    expect(hurt?.holds).toBe(false);

    // Telegraph is deliberately unauthored: the Kellerassel has no wind-up
    // attack, so that state takes the idle fallback and warns once. Asserted
    // rather than left implicit, so the day it *does* get one, this test says
    // where the expectation was written down.
    expect(set.clips[AnimationState.Telegraph]).toBeNull();
    expect(set.idle).not.toBeNull();
  });
});
