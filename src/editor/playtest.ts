import { Container } from 'pixi.js';
import type { RoomShape } from '../content/rooms/definition.js';
import { GameSim, MAX_COLLIDER_RADIUS } from '../sim/game/sim.js';
import type { RoomPlacement } from '../sim/room/template.js';
import { MULTI_CELL_LAYOUT } from './definitions.js';
import { installPixelFonts, UI_FONT_FAMILY } from '../render/ui/font.js';
import { createRenderer, trackWindowSize } from '../render/app.js';
import {
  createBlobTexture,
  createRingTexture,
  createSilhouetteTexture,
  createSolidTexture,
} from '../render/placeholder-art.js';
import { EntityView } from '../render/entities.js';
import { GameView } from '../render/view.js';
import { buildAnimatedSets, loadFloorArt } from '../render/floor-art.js';
import {
  bossIdsFrom,
  buildParticleArt,
  buildProjectileArt,
  doorTexturesFrom,
  TELEGRAPH_RING_SPRITE,
} from '../render/art-bundle.js';
import { loadPlayerArt } from '../render/player-art.js';
import { PARTICLE_PALETTE } from '../render/palette.js';
import { FixedTimestepLoop, runAnimationFrameLoop } from '../app/loop.js';
import { InputSampler } from '../app/input/sampler.js';
import { computeGameLayout } from '../render/resolution.js';

export interface PlaytestHandle {
  destroy(): void;
}

/**
 * A playtest's canonical layout for a multi-cell shape, in the local
 * (0-indexed) coordinates `compileRoomTemplate`'s `RoomPlacement` needs — see
 * `definitions.ts`'s `MULTI_CELL_LAYOUT` for why any one legal layout does
 * the job here.
 */
function canonicalPlacement(shape: RoomShape): RoomPlacement | undefined {
  if (shape === '1x1') {
    return undefined;
  }
  return { cells: MULTI_CELL_LAYOUT[shape] };
}

/**
 * Drops into `templateJson` in-engine, no disk round-trip and no rebuild —
 * the AC's "live playtest". Mounts as a fullscreen overlay over `host` (the
 * same assumption `createRenderer`/`trackWindowSize` already make about
 * sizing off the window) with its own `GameSim`/`GameView`/render loop,
 * entirely independent of the editor's own state; `destroy()` tears all of
 * it down and leaves the editor exactly as it was.
 *
 * Built via `GameSim`'s `population: 'empty'` plus a direct `loadRoom` call
 * rather than the `roomTemplate` constructor option: the constructor's own
 * path never accepts a `placement`, so it cannot load a multi-cell draft
 * (whose `cells.length` will not match the single-cell default placement)
 * — `loadRoom` is the same public method the app layer already uses for a
 * room transition, just called once, directly, right after construction.
 */
export async function createPlaytest(
  host: HTMLElement,
  templateJson: unknown,
  shape: RoomShape,
  floor: number,
): Promise<PlaytestHandle> {
  const overlay = document.createElement('div');
  overlay.className = 'kb-editor-playtest-overlay';
  host.appendChild(overlay);

  const exitButton = document.createElement('button');
  exitButton.type = 'button';
  exitButton.textContent = 'Exit playtest (Esc)';
  exitButton.className = 'kb-editor-playtest-exit';
  overlay.appendChild(exitButton);

  const app = await createRenderer(overlay);
  // The playtest view draws damage numbers, and they are drawn in the pixel
  // font like everything else — so the faces have to exist here too, not only
  // in `app/main.ts`. Idempotent, so the two entry points cannot build two.
  installPixelFonts(app.renderer);

  // Real floor/enemy art (#35) and Alois's own (#151) — a room author checking
  // their layout in Playtest has the exact same "which blob was that" problem a
  // real run does, so this preview gets the same art a run would.
  const [
    {
      roomTiles,
      enemyArt,
      enemyStrips,
      pickupArt,
      projectileArt,
      vfxArt,
      tileTextures,
      spriteOrigins,
    },
    playerArt,
  ] = await Promise.all([loadFloorArt(), loadPlayerArt()]);

  const sim = new GameSim({ seed: 1, population: 'empty', floor });
  sim.loadRoom(templateJson, floor, null, [], canonicalPlacement(shape));

  const view = new GameView(sim, {
    playerArt,
    projectileArt: buildProjectileArt(
      projectileArt,
      createBlobTexture(
        app.renderer,
        sim.tuning.shooting.shotRadius,
        PARTICLE_PALETTE.projectileFill,
        PARTICLE_PALETTE.projectileRim,
      ),
    ),
    projectileArtNames: sim.enemies.projectileArtNames.map((name) => (name === '' ? null : name)),
    entity: createBlobTexture(
      app.renderer,
      MAX_COLLIDER_RADIUS,
      PARTICLE_PALETTE.entityFill,
      PARTICLE_PALETTE.entityRim,
    ),
    entityFlash: createBlobTexture(
      app.renderer,
      MAX_COLLIDER_RADIUS,
      PARTICLE_PALETTE.entityFlash,
      PARTICLE_PALETTE.entityFlash,
    ),
    telegraph:
      vfxArt[TELEGRAPH_RING_SPRITE] ??
      createRingTexture(
        app.renderer,
        EntityView.telegraphTextureRadius,
        PARTICLE_PALETTE.telegraphRing,
      ),
    particleArt: buildParticleArt(
      vfxArt,
      createBlobTexture(app.renderer, 2, PARTICLE_PALETTE.foamFill, PARTICLE_PALETTE.foamRim),
    ),
    decal: createBlobTexture(
      app.renderer,
      8,
      PARTICLE_PALETTE.decalFill,
      PARTICLE_PALETTE.decalRim,
    ),
    numberFont: UI_FONT_FAMILY,
    pedestalItem: createBlobTexture(
      app.renderer,
      5,
      PARTICLE_PALETTE.pedestalItemFill,
      PARTICLE_PALETTE.pedestalItemFill,
    ),
    pedestalBeam: createSolidTexture(app.renderer),
    pedestalPlinth: tileTextures.pedestal,
    doors: doorTexturesFrom(tileTextures),
    pickupArt,
    tileTextures,
    bossShadow: enemyArt['boss-shadow'],
    bossIds: bossIdsFrom(spriteOrigins),
    actorShadow: enemyArt['actor-shadow'],
    roomTiles,
    enemyArt,
    enemyFlash: Object.fromEntries(
      Object.entries(enemyArt).map(([id, texture]) => [
        id,
        createSilhouetteTexture(app.renderer, texture),
      ]),
    ),
    enemyAnimation: buildAnimatedSets(enemyStrips, (texture) =>
      createSilhouetteTexture(app.renderer, texture),
    ),
  });
  const game = new Container();
  game.addChild(view.stage);
  app.stage.addChild(game);

  let layout = computeGameLayout(window.innerWidth, window.innerHeight, window.devicePixelRatio);
  const windowSizeTracker = trackWindowSize(app, game, overlay, (applied) => {
    layout = applied;
  });

  const input = new InputSampler();
  const stopKeyboard = input.keyboard.attach(window);
  const stopGamepad = input.gamepad.attach(window);

  const loop = new FixedTimestepLoop({
    step: () => {
      sim.step(input.sample());
    },
    render: (alpha) => {
      view.sync(alpha, layout.scale, performance.now());
    },
  });
  const stopLoop = runAnimationFrameLoop(loop);

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      destroy();
    }
  };
  window.addEventListener('keydown', onKeyDown);
  exitButton.addEventListener('click', destroy);

  function destroy(): void {
    window.removeEventListener('keydown', onKeyDown);
    stopLoop();
    windowSizeTracker.dispose();
    stopKeyboard();
    stopGamepad();
    app.destroy(true, { children: true });
    overlay.remove();
  }

  return { destroy };
}
