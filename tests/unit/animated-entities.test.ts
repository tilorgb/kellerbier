import { describe, expect, it } from 'vitest';
import { Rectangle, Sprite, Texture, TextureSource } from 'pixi.js';
import { entityIndex } from '../../src/sim/ecs/entity.js';
import { World } from '../../src/sim/ecs/world.js';
import { GameSim } from '../../src/sim/game/sim.js';
import { createInputFrame } from '../../src/sim/input/frame.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import { EntityView } from '../../src/render/entities.js';
import { buildAnimatedSets, cutStrip, type AnimatedSpriteSet } from '../../src/render/floor-art.js';
import { ACTOR_SPRITE_SCALE, TILE_SPRITE_SCALE } from '../../src/render/resolution.js';

/**
 * The loader and the view, headlessly.
 *
 * Pixi builds and updates a scene graph perfectly well with no renderer
 * attached (the same property `tests/bench/scene.ts` leans on), so the
 * question this file can actually answer is the one that matters: does the
 * sprite a walking enemy is drawn with change frame by frame, and does a dead
 * one leave a corpse behind.
 */

const FRAME_WIDTH = 24;
const FRAME_HEIGHT = 16;
const FRAMES = 8;

const SIDECAR = {
  frames: FRAMES,
  frameDurationMs: 120,
  loop: true,
  clips: {
    idle: { frames: [0], frameDurationMs: 400, mode: 'loop' as const },
    move: { frames: [0, 1, 2, 3], frameDurationMs: 110, mode: 'loop' as const },
    hurt: { frames: [4], frameDurationMs: 90, mode: 'once' as const, onEnd: 'idle' as const },
    death: {
      frames: [5, 6, 7],
      frameDurationMs: 100,
      mode: 'once' as const,
      onEnd: 'hold' as const,
    },
  },
};

function stripTexture(): Texture {
  return new Texture({
    source: new TextureSource({ width: FRAME_WIDTH * FRAMES, height: FRAME_HEIGHT }),
  });
}

describe('cutStrip', () => {
  it('cuts one frame rectangle per declared frame, edge to edge along the strip', () => {
    const { frames, clips } = cutStrip('crawler', stripTexture(), SIDECAR);
    expect(frames).toHaveLength(FRAMES);
    frames.forEach((frame, index) => {
      expect(frame.width).toBe(FRAME_WIDTH);
      expect(frame.height).toBe(FRAME_HEIGHT);
      // Contiguity, from the runtime's side: frame `n` is `n * frameWidth`
      // along the same scanline, which is what makes a frame swap a rectangle
      // change rather than a texture bind.
      expect(frame.frame.x).toBe(index * FRAME_WIDTH);
      expect(frame.frame.y).toBe(0);
    });
    expect(clips.name).toBe('crawler');
    expect(clips.frameCount).toBe(FRAMES);
  });

  it('shares one texture source across every frame', () => {
    const { frames } = cutStrip('crawler', stripTexture(), SIDECAR);
    const sources = new Set(frames.map((frame) => frame.source));
    expect(sources.size).toBe(1);
  });

  it('cuts a frame out of a strip that is itself a sub-rectangle', () => {
    // What a packed atlas hands back. The frame offsets have to be relative to
    // where the strip sits, not to the top-left of the whole sheet.
    const source = new TextureSource({ width: 512, height: 512 });
    const packed = new Texture({
      source,
      frame: new Rectangle(64, 128, FRAME_WIDTH * FRAMES, FRAME_HEIGHT),
    });
    const { frames } = cutStrip('crawler', packed, SIDECAR);
    expect(frames[0]?.frame.x).toBe(64);
    expect(frames[0]?.frame.y).toBe(128);
    expect(frames[3]?.frame.x).toBe(64 + 3 * FRAME_WIDTH);
  });

  it('throws when the strip does not divide into the frames the sidecar declares', () => {
    const odd = new Texture({ source: new TextureSource({ width: 100, height: FRAME_HEIGHT }) });
    expect(() => cutStrip('crawler', odd, SIDECAR)).toThrow(/does not divide into the 8 frame/);
  });
});

describe('buildAnimatedSets', () => {
  it('adds one flash silhouette per frame, not one per creature', () => {
    const strips = { crawler: cutStrip('crawler', stripTexture(), SIDECAR) };
    const sets = buildAnimatedSets(strips, () => Texture.EMPTY);
    expect(sets.crawler?.flashFrames).toHaveLength(FRAMES);
    expect(sets.crawler?.frames).toHaveLength(FRAMES);
  });
});

/** A sim holding exactly one Kellerassel, so the view's loop has one animated body in it. */
function oneEnemySim(): { sim: GameSim; index: number } {
  const sim = new GameSim({ seed: 7, room: new RoomGeometry(0, 0, 320, 180) });
  const player = sim.playerIndex;
  const doomed: number[] = [];
  sim.world.forEach(sim.collidableMask, (index) => {
    if (index !== player) {
      doomed.push(index);
    }
  });
  for (const slot of doomed) {
    sim.world.destroy(sim.world.entityAt(slot));
  }
  sim.world.flush();
  const entity = sim.spawnEnemyKind(sim.enemies.indexOf('kellerassel'), 120, 90);
  sim.world.flush();
  return { sim, index: entityIndex(entity) };
}

function animatedView(sim: GameSim): { view: EntityView; set: AnimatedSpriteSet } {
  const strip = cutStrip('kellerassel', stripTexture(), SIDECAR);
  const sets = buildAnimatedSets({ kellerassel: strip }, () => Texture.EMPTY);
  const set = sets.kellerassel;
  if (set === undefined) {
    throw new Error('unreachable: the set was just built');
  }
  const view = new EntityView(
    sim,
    Texture.EMPTY,
    Texture.EMPTY,
    Texture.EMPTY,
    {},
    {},
    { kellerassel: set },
  );
  return { view, set };
}

/**
 * `EntityView` stacks its layers shadows / rings / corpses / bodies / labels,
 * in that order, so that a boss's ground shadow can never cover its own
 * telegraph and a corpse can never cover something still alive. These two
 * readers depend on that order, and the first test below asserts it, so a
 * reshuffle fails there once rather than here four times.
 */
const CORPSE_LAYER = 2;
const BODY_LAYER = 3;

function spriteIn(view: EntityView, layer: number, slot = 0): Sprite | undefined {
  return view.container.children[layer]?.children[slot] as Sprite | undefined;
}

describe('EntityView, drawing an animated enemy', () => {
  const idle = createInputFrame();

  it('stacks corpses under living bodies', () => {
    const { sim } = oneEnemySim();
    const { view } = animatedView(sim);
    view.sync(0, 0);
    expect(view.container.children).toHaveLength(5);
    expect(spriteIn(view, BODY_LAYER)).toBeInstanceOf(Sprite);
  });

  it('walks through the move clip as the render clock advances', () => {
    const { sim } = oneEnemySim();
    const { view, set } = animatedView(sim);
    const drawn = new Set<number>();
    let nowMs = 0;
    for (let tick = 0; tick < 90; tick++) {
      sim.step(idle);
      view.sync(0, nowMs);
      nowMs += 1000 / 60;
      // Which frame of the strip the body's sprite is pointing at.
      const drawnTexture = spriteIn(view, BODY_LAYER)?.texture;
      const frame = set.frames.findIndex((texture) => texture === drawnTexture);
      if (frame >= 0) {
        drawn.add(frame);
      }
    }
    // A chaser closing on the player is in `move` throughout, so what should
    // have been drawn is the whole four-frame cycle and nothing else.
    expect([...drawn].sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
  });

  it('mirrors a body walking the other way', () => {
    const { sim, index } = oneEnemySim();
    const { view } = animatedView(sim);
    // Player is spawned at the room's centre-bottom; drop the enemy to the
    // player's left so it chases rightwards.
    sim.transform.data[index * 4] = 20;
    sim.transform.data[index * 4 + 2] = 20;
    for (let tick = 0; tick < 40; tick++) {
      sim.step(idle);
    }
    view.sync(0, 0);
    expect(view.animator.facingOf(index)).toBe(1);
    // Authored facing is left, so a rightward body draws with a negated x scale.
    expect(spriteIn(view, BODY_LAYER)?.scale.x).toBeLessThan(0);
  });

  /**
   * The regression this whole area exists for (`docs/DECISIONS.md` #45).
   *
   * `EntityView` used to size a body by `radius / (texture.height / 2)`, which
   * normalised height to the collider and left width entirely free — so a
   * redraw that bought its detail sideways, which is the only direction a flat
   * creature has, widened the enemy on screen one-for-one with no change to
   * what could be hit. The Kellerassel went from 26x18 to 42x25 internal
   * pixels that way, on an unchanged radius of 7.
   *
   * These two assert the property that replaced it from both sides: the drawn
   * scale is the grid constant, and it does not move when either the texture
   * or the collider does.
   */
  it('draws a body at the actor grid, not at a scale derived from its collider', () => {
    const { sim } = oneEnemySim();
    const { view } = animatedView(sim);
    view.sync(0, 0);
    const sprite = spriteIn(view, BODY_LAYER);
    expect(sprite?.scale.y).toBe(ACTOR_SPRITE_SCALE);
    expect(Math.abs(sprite?.scale.x ?? 0)).toBe(ACTOR_SPRITE_SCALE);
  });

  it('draws the same body at the same size whatever its collider is', () => {
    const drawn: number[] = [];
    for (const radius of [4, 7, 10, 20]) {
      const { sim, index } = oneEnemySim();
      sim.body.data[index * 2] = radius;
      const { view } = animatedView(sim);
      view.sync(0, 0);
      drawn.push(spriteIn(view, BODY_LAYER)?.scale.y ?? 0);
    }
    // Four colliders spanning every size class in the game and one past it.
    // Under the old formula these were four different sizes.
    expect(new Set(drawn)).toEqual(new Set([ACTOR_SPRITE_SCALE]));
  });

  it('draws a destructible prop at the same size as the identical tile as furniture', () => {
    // A barrel is authored once, in the floor's tileset, and reaches the
    // screen down two different paths: `render/prop-view.ts` draws the
    // decorative ones at native size, `EntityView` draws the breakable ones.
    // They used to disagree by 25% — 2.5 internal pixels per authored pixel
    // against the room's own 2.0 — so the barrel you could smash was visibly
    // bigger than the one beside it that you could not.
    const { sim } = oneEnemySim();
    const { view } = animatedView(sim);
    view.setTargetTextures([Texture.EMPTY]);
    sim.spawnTarget(60, 60);
    sim.world.flush();
    view.sync(0, 0);
    const scales = (view.container.children[BODY_LAYER]?.children ?? [])
      .filter((child): child is Sprite => child instanceof Sprite && child.visible)
      .map((sprite) => sprite.scale.y);
    expect(scales).toContain(TILE_SPRITE_SCALE);
  });

  it('leaves a corpse playing the death clip when the body is gone', () => {
    const { sim, index } = oneEnemySim();
    const { view } = animatedView(sim);
    let nowMs = 0;
    view.sync(0, nowMs);
    nowMs += 16;

    sim.world.destroy(sim.world.entityAt(index));
    sim.world.flush();
    // The frame that notices the body has left, then the frame that draws the
    // corpse the notice created.
    view.sync(0, nowMs);
    nowMs += 16;
    view.sync(0, nowMs);

    expect(view.animator.corpseCount).toBe(1);
    const corpse = view.animator.corpseSlotAt(0);
    // Frame 5 is the death clip's first pose in `SIDECAR` above.
    expect(view.animator.corpseFrameAt(corpse)).toBe(5);
    // The corpse layer sits below the bodies, so a body on the floor can never
    // hide something still shooting.
    expect(spriteIn(view, CORPSE_LAYER)?.visible).toBe(true);
  });

  it('drops every corpse when the room changes under it', () => {
    const { sim, index } = oneEnemySim();
    const { view } = animatedView(sim);
    view.sync(0, 0);
    sim.world.destroy(sim.world.entityAt(index));
    sim.world.flush();
    view.sync(0, 16);
    view.sync(0, 32);
    expect(view.animator.corpseCount).toBe(1);

    view.resetAnimation();
    expect(view.animator.corpseCount).toBe(0);
    expect(spriteIn(view, CORPSE_LAYER)?.visible).toBe(false);
  });

  it('draws an enemy with no animation set exactly as it did before', () => {
    const { sim } = oneEnemySim();
    const still = Texture.EMPTY;
    const view = new EntityView(sim, still, still, still, {}, {}, {});
    sim.step(idle);
    view.sync(0, 0);
    expect(view.animator.trackedCount).toBe(0);
    expect(spriteIn(view, BODY_LAYER)?.scale.x).toBeGreaterThan(0);
  });
});

/**
 * The `World` state constant is imported for the same reason the view uses it —
 * a body that is not `ALIVE` is not drawn — and asserting on it here keeps this
 * file honest about what "the body is gone" means.
 */
describe('a destroyed body', () => {
  it('is no longer alive in the world the view reads', () => {
    const { sim, index } = oneEnemySim();
    sim.world.destroy(sim.world.entityAt(index));
    sim.world.flush();
    expect(sim.world.states[index]).not.toBe(World.ALIVE);
  });
});
