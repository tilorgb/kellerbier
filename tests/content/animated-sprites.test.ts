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

  it.each(animated.map((sprite) => [sprite.name, sprite.filePath] as const))(
    '%s is named after a sprite something in the game asks for',
    (name) => {
      // A strip under `characters/` is looked up by `EnemyDefinition.id`
      // (`render/floor-art.ts`), so a typo in the filename is a strip nothing
      // ever plays — the animated equivalent of an unresolvable enemy id, and
      // `docs/DECISIONS.md` #7 says that fails rather than degrades.
      const ids = ENEMY_DEFINITIONS.map((definition) => definition.id);
      expect(ids).toContain(name);
    },
  );
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
