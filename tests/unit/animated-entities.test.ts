import { describe, expect, it } from 'vitest';
import { Texture as ThreeTexture } from 'three';
import { entityIndex } from '../../src/sim/ecs/entity.js';
import { World } from '../../src/sim/ecs/world.js';
import { GameSim } from '../../src/sim/game/sim.js';
import { createInputFrame } from '../../src/sim/input/frame.js';
import { RoomGeometry } from '../../src/sim/room/geometry.js';
import { ROOM_TILE_UNITS } from '../../src/content/rooms/definition.js';
import { EntityView } from '../../src/render/entities.js';
import { cutStrip, type AnimatedSpriteSet } from '../../src/render/floor-art.js';
import {
  BitmapText,
  Container,
  Rectangle,
  Texture,
  TextureSource,
} from '../../src/render/gfx/index.js';
import { ACTOR_PIXELS_PER_UNIT } from '../../src/render/resolution.js';
import { installPixelFonts, UI_FONT_FAMILY } from '../../src/render/ui/font.js';
import { UI_TEXT_HEIGHT } from '../../src/render/ui/text.js';
import { billboardMeshes, frameShown, isMirrored } from '../helpers/billboard.js';

/**
 * The loader and the view, headlessly.
 *
 * three.js builds and updates a scene graph perfectly well with no renderer
 * attached (the same property `tests/bench/scene.ts` leans on), so the
 * question this file can actually answer is the one that matters: does the
 * frame a walking enemy's billboard points at change frame by frame, and does
 * a dead one leave a corpse behind.
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

installPixelFonts();

function blank(width: number, height: number): Texture {
  return new Texture(new TextureSource(new ThreeTexture(), width, height));
}

function stripTexture(): Texture {
  return blank(FRAME_WIDTH * FRAMES, FRAME_HEIGHT);
}

describe('cutStrip', () => {
  it('cuts one frame rectangle per declared frame, edge to edge along the strip', () => {
    const { frames, clips } = cutStrip('crawler', stripTexture(), SIDECAR);
    expect(frames).toHaveLength(FRAMES);
    frames.forEach((frame, index) => {
      expect(frame.width).toBe(FRAME_WIDTH);
      expect(frame.height).toBe(FRAME_HEIGHT);
      // Contiguity, from the runtime's side: frame `n` is `n * frameWidth`
      // along the same scanline, which is what makes a frame swap a UV
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
    const source = new TextureSource(new ThreeTexture(), 512, 512);
    const packed = new Texture(source, new Rectangle(64, 128, FRAME_WIDTH * FRAMES, FRAME_HEIGHT));
    const { frames } = cutStrip('crawler', packed, SIDECAR);
    expect(frames[0]?.frame.x).toBe(64);
    expect(frames[0]?.frame.y).toBe(128);
    expect(frames[3]?.frame.x).toBe(64 + 3 * FRAME_WIDTH);
  });

  it('throws when the strip does not divide into the frames the sidecar declares', () => {
    const odd = blank(100, FRAME_HEIGHT);
    expect(() => cutStrip('crawler', odd, SIDECAR)).toThrow(/does not divide into the 8 frame/);
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

function makeLabel(): BitmapText {
  return new BitmapText({
    text: '',
    style: { fontFamily: UI_FONT_FAMILY, fontSize: UI_TEXT_HEIGHT },
  });
}

function bareView(
  sim: GameSim,
  enemyAnimation: Record<string, AnimatedSpriteSet> = {},
): EntityView {
  return new EntityView(
    sim,
    {
      fallback: Texture.EMPTY,
      enemyArt: {},
      enemyAnimation,
      pickupArt: {},
      bossIds: new Set(),
    },
    new Container(),
    makeLabel,
  );
}

function animatedView(sim: GameSim): { view: EntityView; set: AnimatedSpriteSet } {
  const set = cutStrip('kellerassel', stripTexture(), SIDECAR);
  return { view: bareView(sim, { kellerassel: set }), set };
}

/** Screen position the view never reads back here; labels only need *a* projection. */
const project = (x: number, _height: number, z: number, out: { x: number; y: number }): void => {
  out.x = x;
  out.y = z;
};

describe('EntityView, drawing an animated enemy', () => {
  const idle = createInputFrame();

  it('stands exactly one billboard per body', () => {
    const { sim } = oneEnemySim();
    const { view } = animatedView(sim);
    view.sync(0, 0, project);
    expect(billboardMeshes(view.group)).toHaveLength(1);
    expect(view.spriteCount).toBe(1);
  });

  it('walks through the move clip as the render clock advances', () => {
    const { sim } = oneEnemySim();
    const { view, set } = animatedView(sim);
    const drawn = new Set<number>();
    let nowMs = 0;
    for (let tick = 0; tick < 90; tick++) {
      sim.step(idle);
      view.sync(0, nowMs, project);
      nowMs += 1000 / 60;
      // Which frame of the strip the body's quad is pointing at.
      const body = billboardMeshes(view.group)[0];
      const frame = body === undefined ? -1 : frameShown(body, set.frames);
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
    view.sync(0, 0, project);
    expect(view.animator.facingOf(index)).toBe(1);
    // Authored facing is left, so a rightward body draws with its U edges swapped.
    const body = billboardMeshes(view.group)[0];
    expect(body).toBeDefined();
    expect(body !== undefined && isMirrored(body)).toBe(true);
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
   * These two assert the property that replaced it from both sides: the quad
   * is the frame's authored size on the actor grid, and it does not move when
   * the collider does.
   */
  it('draws a body at its authored size on the actor grid, not at a scale derived from its collider', () => {
    const { sim } = oneEnemySim();
    const { view } = animatedView(sim);
    view.sync(0, 0, project);
    const body = billboardMeshes(view.group)[0];
    expect(body?.scale.x).toBeCloseTo(FRAME_WIDTH / ACTOR_PIXELS_PER_UNIT);
    expect(body?.scale.y).toBeCloseTo(FRAME_HEIGHT / ACTOR_PIXELS_PER_UNIT);
  });

  it('draws the same body at the same size whatever its collider is', () => {
    const drawn: number[] = [];
    for (const radius of [4, 7, 10, 20]) {
      const { sim, index } = oneEnemySim();
      sim.body.data[index * 2] = radius;
      const { view } = animatedView(sim);
      view.sync(0, 0, project);
      drawn.push(billboardMeshes(view.group)[0]?.scale.y ?? 0);
    }
    // Four colliders spanning every size class in the game and one past it.
    // Under the old formula these were four different sizes.
    expect(new Set(drawn)).toEqual(new Set([FRAME_HEIGHT / ACTOR_PIXELS_PER_UNIT]));
  });

  it('draws a destructible prop on the tile grid, one cell wide', () => {
    // A barrel is authored once, in the floor's tileset, and reaches the
    // screen down two different paths: `Scenery` stands the decorative ones
    // on their cell, `EntityView` draws the breakable ones. They used to
    // disagree by 25%, so the barrel you could smash was visibly bigger than
    // the one beside it that you could not.
    const sixteenPxTile = blank(16, 16);
    const { sim } = oneEnemySim();
    const { view } = animatedView(sim);
    view.setTargetTextures([sixteenPxTile]);
    sim.spawnTarget(60, 60);
    sim.world.flush();
    view.sync(0, 0, project);
    const widths = billboardMeshes(view.group).map((mesh) => mesh.scale.x);
    expect(widths).toContain(ROOM_TILE_UNITS);
  });

  it('draws a destructible authored at 32x32 on the same grid as its 16x16 counterpart', () => {
    // #182's follow-up: a destructible's on-screen size must track its own
    // texture's width (`tileGridScale`), not a constant baked in for the
    // 16px case — otherwise redrawing one barrel PNG at 32x32 for more
    // detail silently doubles it on screen instead of just adding detail.
    const thirtyTwoPxTile = blank(32, 32);
    const { sim } = oneEnemySim();
    const { view } = animatedView(sim);
    view.setTargetTextures([thirtyTwoPxTile]);
    sim.spawnTarget(60, 60);
    sim.world.flush();
    view.sync(0, 0, project);
    const widths = billboardMeshes(view.group).map((mesh) => mesh.scale.x);
    expect(widths).toContain(ROOM_TILE_UNITS);
  });

  it('blows a hit body out white through the emissive term', () => {
    const { sim, index } = oneEnemySim();
    const { view } = animatedView(sim);
    view.sync(0, 0, project);
    const body = billboardMeshes(view.group)[0];
    expect(body?.material.emissive.r).toBe(0);

    sim.flash.data[index] = 3;
    view.sync(0, 16, project);
    expect(body?.material.emissive.r).toBe(1);
    expect(body?.material.emissive.g).toBe(1);
    expect(body?.material.emissive.b).toBe(1);

    sim.flash.data[index] = 0;
    view.sync(0, 32, project);
    expect(body?.material.emissive.r).toBe(0);
  });

  it('leaves a corpse playing the death clip when the body is gone', () => {
    const { sim, index } = oneEnemySim();
    const { view, set } = animatedView(sim);
    let nowMs = 0;
    view.sync(0, nowMs, project);
    nowMs += 16;

    sim.world.destroy(sim.world.entityAt(index));
    sim.world.flush();
    // The frame that notices the body has left, then the frame that draws the
    // corpse the notice created.
    view.sync(0, nowMs, project);
    nowMs += 16;
    view.sync(0, nowMs, project);

    expect(view.animator.corpseCount).toBe(1);
    const corpse = view.animator.corpseSlotAt(0);
    // Frame 5 is the death clip's first pose in `SIDECAR` above.
    expect(view.animator.corpseFrameAt(corpse)).toBe(5);
    // The body's own billboard is hidden; the one still showing is the corpse,
    // pointing at that death frame.
    const shown = billboardMeshes(view.group);
    expect(shown).toHaveLength(1);
    const [only] = shown;
    expect(only === undefined ? -1 : frameShown(only, set.frames)).toBe(5);
  });

  it('drops every corpse when the room changes under it', () => {
    const { sim, index } = oneEnemySim();
    const { view } = animatedView(sim);
    view.sync(0, 0, project);
    sim.world.destroy(sim.world.entityAt(index));
    sim.world.flush();
    view.sync(0, 16, project);
    view.sync(0, 32, project);
    expect(view.animator.corpseCount).toBe(1);
    expect(billboardMeshes(view.group)).toHaveLength(1);

    view.resetAnimation();
    expect(view.animator.corpseCount).toBe(0);
    expect(billboardMeshes(view.group)).toHaveLength(0);
  });

  it('draws an enemy with no animation set exactly as it did before', () => {
    const { sim } = oneEnemySim();
    const view = bareView(sim);
    sim.step(idle);
    view.sync(0, 0, project);
    expect(view.animator.trackedCount).toBe(0);
    const body = billboardMeshes(view.group)[0];
    expect(body).toBeDefined();
    expect(body === undefined || isMirrored(body)).toBe(false);
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
