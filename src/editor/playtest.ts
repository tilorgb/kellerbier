import type { RoomShape } from '../content/rooms/definition.js';
import { GameSim, MAX_COLLIDER_RADIUS } from '../sim/game/sim.js';
import type { RoomPlacement } from '../sim/room/template.js';
import { MULTI_CELL_LAYOUT } from './definitions.js';
import { installPixelFonts, UI_FONT_FAMILY } from '../render/ui/font.js';
import { canvasToFrame, createRenderer, trackWindowSize } from '../render/app.js';
import { GameView } from '../render/view.js';
import { loadFloorArt } from '../render/floor-art.js';
import { bossIdsFrom, buildParticleArt, buildProjectileArt } from '../render/art-bundle.js';
import { loadPlayerArt } from '../render/player-art.js';
import { PARTICLE_PALETTE } from '../render/palette.js';
import { dotTexture } from '../render/ui/marker-art.js';
import { FixedTimestepLoop, runAnimationFrameLoop } from '../app/loop.js';
import { InputSampler } from '../app/input/sampler.js';

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
 * the AC's "live playtest". Mounts as a fullscreen overlay over `host` with
 * its own `GameSim`/`GameView`/render loop, entirely independent of the
 * editor's own state; `destroy()` tears all of it down and leaves the editor
 * exactly as it was.
 *
 * Built via `GameSim`'s `population: 'empty'` plus a direct `loadRoom` call
 * rather than the `roomTemplate` constructor option: the constructor's own
 * path never accepts a `placement`, so it cannot load a multi-cell draft
 * (whose `cells.length` will not match the single-cell default placement)
 * — `loadRoom` is the same public method the app layer already uses for a
 * room transition, just called once, directly, right after construction.
 *
 * The same renderer boot as `app/main.ts`, minus the HUD: a room author
 * checking a layout sees exactly the room a run would show — the same walls,
 * lights and sprites — because it is the same `GameView`.
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

  const app = createRenderer(overlay);
  // The playtest view draws damage numbers, and they are drawn in the pixel
  // font like everything else — so the faces have to exist here too, not only
  // in `app/main.ts`. Idempotent, so the two entry points cannot build two.
  installPixelFonts();

  // Real floor/enemy art (#35) and Alois's own (#151) — a room author checking
  // their layout in Playtest has the exact same "which blob was that" problem a
  // real run does, so this preview gets the same art a run would.
  const [
    {
      roomTiles,
      enemyArt,
      enemyStrips,
      pickupArt,
      itemArt,
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
      dotTexture(
        sim.tuning.shooting.shotRadius,
        PARTICLE_PALETTE.projectileFill,
        PARTICLE_PALETTE.projectileRim,
      ),
    ),
    projectileArtNames: sim.enemies.projectileArtNames.map((name) => (name === '' ? null : name)),
    entity: dotTexture(
      MAX_COLLIDER_RADIUS,
      PARTICLE_PALETTE.entityFill,
      PARTICLE_PALETTE.entityRim,
    ),
    particleArt: buildParticleArt(
      vfxArt,
      dotTexture(2, PARTICLE_PALETTE.foamFill, PARTICLE_PALETTE.foamRim),
    ),
    decal: dotTexture(8, PARTICLE_PALETTE.decalFill, PARTICLE_PALETTE.decalRim),
    numberFont: UI_FONT_FAMILY,
    pedestalItem: dotTexture(
      5,
      PARTICLE_PALETTE.pedestalItemFill,
      PARTICLE_PALETTE.pedestalItemFill,
    ),
    pedestalPlinth: tileTextures.pedestal,
    pickupArt,
    itemArt,
    tileTextures,
    bossIds: bossIdsFrom(spriteOrigins),
    roomTiles,
    enemyArt,
    enemyAnimation: enemyStrips,
  });
  app.ui.root.addChild(view.labelLayer);

  const windowSizeTracker = trackWindowSize(app.canvas, overlay, () => {
    // Nothing to lay out: the frame is fixed and the playtest has no HUD.
  });
  app.ui.attachPointer(app.canvas, (clientX, clientY, out) => {
    canvasToFrame(app.canvas, clientX, clientY, out);
  });

  const input = new InputSampler();
  const stopKeyboard = input.keyboard.attach(window);
  const stopGamepad = input.gamepad.attach(window);

  const loop = new FixedTimestepLoop({
    step: () => {
      sim.step(input.sample());
    },
    render: (alpha) => {
      view.sync(alpha, performance.now());
      app.render(() => {
        view.render(app.renderer);
      });
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
    view.destroy();
    app.destroy();
    overlay.remove();
  }

  return { destroy };
}
