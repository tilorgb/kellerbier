import { Assets, Container, Text, type Texture } from 'pixi.js';
import massUrl from '../../assets/sprites/mass.png';
import { ENEMY_DEFINITIONS } from '../content/enemies/index.js';
import { FLOOR_CONFIGS, type FloorConfig } from '../content/floors/definition.js';
import { ROOM_TEMPLATES } from '../content/rooms/index.js';
import { type RoomDirection, GameSim, MAX_COLLIDER_RADIUS } from '../sim/game/sim.js';
import { promilleTierName } from '../sim/game/promille.js';
import { type FloorPlan, type FloorPlanRoom, generateFloor } from '../sim/room/floor-plan.js';
import { validateRoomTemplate } from '../sim/room/template.js';
import { RngStream, createStreamRng } from '../sim/rng/streams.js';
import { TICKS_PER_SECOND } from '../sim/time.js';
import { createRenderer, trackWindowSize } from '../render/app.js';
import { createBlobTexture, createRingTexture } from '../render/placeholder-art.js';
import {
  type GameLayout,
  INTERNAL_HEIGHT,
  WORLD_ZOOM,
  computeGameLayout,
  roomUnitsPerPixel,
} from '../render/resolution.js';
import { EntityView } from '../render/entities.js';
import { GameOverScreen } from '../render/game-over.js';
import { HealthHud } from '../render/health-hud.js';
import { Vignette } from '../render/vignette.js';
import { GameView } from '../render/view.js';
import { SILENT_AUDIO, playImpactAudio } from './audio/impact.js';
import { InputSampler } from './input/sampler.js';
import { playRumble } from './input/rumble.js';
import { FixedTimestepLoop, runAnimationFrameLoop } from './loop.js';
import { RunSummaryTracker } from './run-summary.js';

/**
 * The authored pool, run through the same typed boundary the sim uses to load
 * a single room — the floor generator (#20) needs `shape`/`doors`/`floorTags`
 * typed to match a slot against, which a raw JSON import does not carry.
 */
const ROOM_TEMPLATE_POOL = ROOM_TEMPLATES.map((room, index) =>
  validateRoomTemplate(room, `room[${String(index)}]`, ENEMY_DEFINITIONS),
);
const TEMPLATES_BY_ID = new Map(ROOM_TEMPLATE_POOL.map((template) => [template.id, template]));

function floorConfig(floorNumber: number): FloorConfig {
  const config = FLOOR_CONFIGS.find((candidate) => candidate.floor === floorNumber);
  if (config === undefined) {
    throw new Error(`no floor config for floor ${String(floorNumber)}`);
  }
  return config;
}

function planRoom(plan: FloorPlan, id: string): FloorPlanRoom {
  const room = plan.rooms.find((candidate) => candidate.id === id);
  if (room === undefined) {
    throw new Error(`floor plan has no room "${id}"`);
  }
  return room;
}

function planTemplate(room: FloorPlanRoom): unknown {
  const template = TEMPLATES_BY_ID.get(room.templateId);
  if (template === undefined) {
    throw new Error(
      `floor plan room "${room.id}" references unknown template "${room.templateId}"`,
    );
  }
  return template;
}

async function boot(): Promise<void> {
  const host = document.getElementById('game');
  if (host === null) {
    throw new Error('Missing #game host element in index.html');
  }

  const app = await createRenderer(host);

  const playerTexture = await Assets.load<Texture>({
    src: massUrl,
    data: { scaleMode: 'nearest' },
  });

  // The run seed is fixed until seeded runs land in #48. Everything downstream
  // of it already behaves as though it were chosen, which is the point — the
  // floor below is generated from this same seed's `RngStream.Floor` stream
  // (see `src/sim/rng/streams.ts`), so it is exactly as reproducible as the
  // rest of the run.
  const RUN_SEED = 1;
  const floorPlan = generateFloor(
    createStreamRng(RUN_SEED, RngStream.Floor),
    floorConfig(1),
    ROOM_TEMPLATE_POOL,
  );
  let currentRoomId = floorPlan.startRoomId;

  // The room is populated with the authored roster rather than the training
  // targets: the targets are the rig impact feel was tuned against, and the
  // game is the thing with enemies in it.
  const sim = new GameSim({
    seed: RUN_SEED,
    roomTemplate: planTemplate(planRoom(floorPlan, currentRoomId)),
    floor: floorPlan.floor,
  });
  const view = new GameView(sim, {
    player: playerTexture,
    projectile: createBlobTexture(app.renderer, sim.tuning.shooting.shotRadius, 0xf0c46a, 0xfff3d0),
    entity: createBlobTexture(app.renderer, MAX_COLLIDER_RADIUS, 0x7d5a3c, 0xb08056),
    entityFlash: createBlobTexture(app.renderer, MAX_COLLIDER_RADIUS, 0xffffff, 0xffffff),
    // White, and tinted where it is drawn — one texture for every telegraph.
    telegraph: createRingTexture(app.renderer, EntityView.telegraphTextureRadius, 0xffffff),
    foam: createBlobTexture(app.renderer, 2, 0xfff4dc, 0xffffff),
    splash: createBlobTexture(app.renderer, 2, 0xd9a441, 0xf6d08a),
    // Dark and wet, not another body. A splash the same brown as a target
    // reads as "something is still standing there", which is the one thing a
    // corpse marker must not do.
    decal: createBlobTexture(app.renderer, 8, 0x3a2a12, 0x4a3618),
    numberFont: 'monospace',
  });
  // Everything drawn at the game's own resolution goes in here, and this is the
  // only thing that ever gets scaled. Anything added to `app.stage` instead is
  // drawn at the display's resolution, which is what the debug panels want.
  const game = new Container();
  game.addChild(view.stage);
  app.stage.addChild(game);

  // Drawn over the game rather than inside it, so its text is not made of game
  // pixels. Kept above everything the game adds.
  const uiLayer = new Container();
  app.stage.addChild(uiLayer);

  // Added before everything else in `uiLayer`, so it darkens the game world
  // underneath without ever covering the HUD text, health row or game-over
  // screen drawn after it.
  const vignette = new Vignette();
  uiLayer.addChild(vignette.view);

  const hud = new Text({
    text: '',
    style: { fill: 0x8a7f74, fontFamily: 'monospace', fontSize: 13 },
  });
  // In the screen layer rather than the game, for the reason the debug panels
  // are: this is text, and text made of game pixels is text nobody can read.
  // Anchored bottom-left so it stays put as lines are added to it, and pinned
  // to the game's own bottom-left corner rather than the window's, so it does
  // not drift out into the letterbox.
  hud.anchor.set(0, 1);
  uiLayer.addChild(hud);
  const positionHud = (applied: GameLayout): void => {
    hud.position.set(applied.originX + 8, applied.originY + INTERNAL_HEIGHT * applied.scale - 8);
  };

  const gameOverScreen = new GameOverScreen();
  uiLayer.addChild(gameOverScreen.view);

  const healthHud = new HealthHud(app.renderer);
  uiLayer.addChild(healthHud.view);
  // Screen pixels, not scaled — the same choice `hud` (the debug text) makes,
  // and for the same reason: `uiLayer` is drawn at display resolution, and a
  // fixed-size icon scaled up with the game's integer zoom would go blocky
  // exactly when the window is large enough that it would otherwise be able
  // to look its best.
  const positionHealthHud = (applied: GameLayout): void => {
    healthHud.view.position.set(applied.originX + 8, applied.originY + 8);
  };

  const summary = new RunSummaryTracker();
  /**
   * Where the run is, once the player dies.
   *
   * 'freezing' and 'slowmo' still call `sim.step()` every tick — the freeze
   * is `sim.requestHitstop` (the same mechanism every other hit already
   * uses, just held longer) and the slow-motion beat is `loop.timeScale`
   * (the same knob the debug `[`/`]` keys already drive), not a second
   * mechanism. Only 'over' stops stepping: by then there is nothing left to
   * simulate, and the screen is showing the frozen tableau underneath it.
   */
  let deathPhase: 'alive' | 'freezing' | 'slowmo' | 'over' = 'alive';
  let deathPhaseTicks = 0;

  /** Called once per real `sim.step()`, right after it, to drive `deathPhase` forward. */
  function advanceDeathSequence(): void {
    const tuning = sim.tuning.impact;
    if (deathPhase === 'alive') {
      if (sim.playerDead) {
        deathPhase = 'freezing';
        sim.requestHitstop(Math.round(tuning.deathFreezeTicks));
      }
      return;
    }
    if (deathPhase === 'freezing') {
      if (!sim.frozen) {
        deathPhase = 'slowmo';
        deathPhaseTicks = 0;
        loop.timeScale = tuning.deathSlowmoScale;
      }
      return;
    }
    if (deathPhase === 'slowmo') {
      deathPhaseTicks += 1;
      if (deathPhaseTicks >= tuning.deathSlowmoTicks) {
        deathPhase = 'over';
        loop.timeScale = 1;
        gameOverScreen.show({
          word: sim.deathWord ?? 'Umgfalln',
          seconds: sim.playerDeathTick / TICKS_PER_SECOND,
          kills: summary.kills,
          // `src/debug/panels/run-info.ts` still shows its own placeholder —
          // wiring the generated floor into the debug overlay's context is a
          // separate, smaller follow-up.
          floor: `${floorPlan.floorName}  room ${sim.roomId} (${planRoom(floorPlan, currentRoomId).role})`,
        });
      }
    }
  }

  // The pointer is reported in room coordinates, not screen ones: mouse aim is
  // measured against the player's simulation position, and the room sits scaled
  // and letterboxed inside a full-window canvas. Updated on every resize, and
  // read — never replaced — by whoever needs to convert a client pixel.
  const pointerMapping = { originX: 0, originY: 0, unitsPerPixel: 1 / WORLD_ZOOM };
  let layout = computeGameLayout(window.innerWidth, window.innerHeight, window.devicePixelRatio);

  trackWindowSize(app, game, (applied) => {
    layout = applied;
    pointerMapping.originX = applied.originX;
    pointerMapping.originY = applied.originY;
    pointerMapping.unitsPerPixel = roomUnitsPerPixel(applied);
    positionHud(applied);
    positionHealthHud(applied);
    gameOverScreen.resize(applied);
    vignette.resize(applied);
  });

  const input = new InputSampler();
  input.keyboard.attach(window, app.canvas, pointerMapping);
  input.gamepad.attach(window);

  // The overlay is created asynchronously and may never arrive — in a
  // production build the import below is never reached and the whole of
  // `src/debug/` is dropped from the bundle.
  let overlay: DebugOverlayHandle | null = null;

  let simMs = 0;
  // Milliseconds of deliberate stall to burn on the next step. The debug handle
  // sets it; it is how the frame graph gets checked against a known spike
  // rather than against a hope that one will turn up.
  let stallMs = 0;

  const loop = new FixedTimestepLoop({
    step: () => {
      const started = performance.now();
      if (stallMs > 0) {
        const until = started + stallMs;
        stallMs = 0;
        while (performance.now() < until) {
          // Busy-wait: a stall has to be spent inside the step being measured.
        }
      }
      if (deathPhase !== 'over') {
        // Mouse aim is measured from the player, so the sampler is told where
        // the player is before it reads the pointer.
        const index = sim.playerIndex;
        input.setAimOrigin(sim.positionX(index), sim.positionY(index));
        sim.step(input.sample());
        playImpactAudio(sim, SILENT_AUDIO);
        playRumble(sim, input.gamepad);
        summary.recordTick(sim);
        advanceDeathSequence();
      }
      simMs += performance.now() - started;
    },
    render: (alpha) => {
      const started = performance.now();
      overlay?.drawCalls.beginFrame();
      view.sync(alpha, layout.scale);
      healthHud.sync(sim);
      const playerScreen = view.playerScreenPosition();
      vignette.sync(sim, playerScreen.x, playerScreen.y);
      overlay?.sync(alpha);
      overlay?.record(simMs, performance.now() - started, 0);
      simMs = 0;
    },
  });

  // Refreshing the HUD regenerates a texture, so it runs on a slow cadence
  // rather than every frame.
  const refreshHud = (): void => {
    const seconds = (loop.tick / TICKS_PER_SECOND).toFixed(2);
    const scale = loop.timeScale.toFixed(2);
    const shots = sim.projectiles;
    const particles = sim.particles;
    const playerSlot = sim.playerIndex;
    const hearts = sim.health.data[playerSlot * 2] ?? 0;
    const maxHearts = sim.health.data[playerSlot * 2 + 1] ?? 0;
    const invulnerable = sim.playerInvulnerableTicks > 0 ? '  INVULN' : '';
    const dead = sim.playerDead ? '  DEAD' : '';
    const knockedDown = sim.umgfallnTicks > 0 ? '  KNOCKDOWN' : '';
    const roomState = sim.doorsLocked ? 'LOCKED' : 'OPEN';
    const currentRole = planRoom(floorPlan, currentRoomId).role;
    hud.text = `${floorPlan.floorName}  room ${sim.roomId} (${currentRole})  doors ${roomState}  enemies ${String(sim.liveEnemyCount)}
  tick ${String(loop.tick)}  ${seconds}s  x${scale}${loop.paused ? '  PAUSED' : ''}
hp ${String(hearts)}/${String(maxHearts)}  soul ${String(sim.playerSoulHealth)}  eternal ${String(sim.playerEternalHealth)}${invulnerable}${dead}
promille ${sim.promille.toFixed(2)} ${promilleTierName(sim.promilleTier)}${knockedDown}
shots ${String(shots.liveCount)}/${String(shots.capacity)}  particles ${String(
      particles.liveCount,
    )}/${String(particles.capacity)}${shots.overflows > 0 ? '  SHOT OVERFLOW' : ''}
WASD move   arrows/mouse aim and fire
  F1 debug   F2 tuning   P pause   . step   [ ] time scale
  N next room (after clear)`;
  };
  refreshHud();
  positionHud(layout);

  window.addEventListener('keydown', (event: KeyboardEvent) => {
    switch (event.key) {
      case 'p':
      case 'P':
        loop.paused = !loop.paused;
        break;
      case '.':
        loop.stepOnce();
        break;
      case '[':
        loop.timeScale = Math.max(0.05, loop.timeScale / 2);
        break;
      case ']':
        loop.timeScale = Math.min(8, loop.timeScale * 2);
        break;
      case 'n':
      case 'N': {
        // Walks through the first available door of the generated floor, in a
        // fixed north/east/south/west priority — one key, same as before #20,
        // now stepping through a real floor instead of one hardcoded room.
        const room = planRoom(floorPlan, currentRoomId);
        const directions = ['north', 'east', 'south', 'west'] as const;
        const direction: RoomDirection | undefined = directions.find(
          (candidate) => room.neighbors[candidate] !== undefined,
        );
        const neighborId = direction === undefined ? undefined : room.neighbors[direction];
        if (
          direction !== undefined &&
          neighborId !== undefined &&
          sim.transitionTo(
            planTemplate(planRoom(floorPlan, neighborId)),
            floorPlan.floor,
            direction,
          )
        ) {
          currentRoomId = neighborId;
        }
        break;
      }
      default:
        return;
    }
    refreshHud();
  });

  runAnimationFrameLoop(loop);
  window.setInterval(refreshHud, 100);

  overlay = await mountDebugOverlay(sim, view, app, uiLayer, () => layout.scale);
  exposeDebugHandle(loop, sim, (ms) => {
    stallMs = ms;
  });
}

/**
 * The half of the overlay this module needs to know about.
 *
 * Declared structurally rather than imported, so that naming the overlay here
 * does not pull `src/debug/` into the production bundle.
 */
interface DebugOverlayHandle {
  sync(alpha: number): void;
  record(simMs: number, renderMs: number, steps: number): void;
  readonly drawCalls: { beginFrame(): void };
}

/**
 * Loads the debug overlay, in dev builds only.
 *
 * The import is dynamic and inside the guard, which is what actually removes
 * it: `import.meta.env.DEV` is replaced by `false` at build time, the branch
 * becomes unreachable, and Rollup drops the chunk rather than shipping a module
 * nobody can reach. A static import would be bundled whatever the flag says.
 */
async function mountDebugOverlay(
  sim: GameSim,
  view: GameView,
  app: Awaited<ReturnType<typeof createRenderer>>,
  uiLayer: Container,
  gameScale: () => number,
): Promise<DebugOverlayHandle | null> {
  if (!import.meta.env.DEV) {
    return null;
  }
  const { createDebugOverlay } = await import('../debug/index.js');
  return createDebugOverlay({
    sim,
    view,
    uiLayer,
    gameScale,
    canvas: app.canvas,
    gl: (app.renderer as unknown as { gl?: unknown }).gl ?? null,
  });
}

/**
 * Debug handle, dev builds only — compiled out of a production bundle.
 *
 * `__kellerbier.tuning.movement` is the live tuning object. Assigning to a
 * field on it changes how the player moves on the very next tick, with no
 * rebuild, which is what makes tuning by feel practical before the debug
 * overlay's sliders arrive in #8:
 *
 *   __kellerbier.tuning.movement.maxSpeed = 4;
 */
interface DebugHost {
  __kellerbier?: {
    loop: FixedTimestepLoop;
    sim: GameSim;
    tuning: GameSim['tuning'];
    /** Burns `ms` inside the next simulation step, to test the frame graph. */
    stall: (ms: number) => void;
  };
}

function exposeDebugHandle(
  loop: FixedTimestepLoop,
  sim: GameSim,
  stall: (ms: number) => void,
): void {
  if (!import.meta.env.DEV) {
    return;
  }
  (globalThis as unknown as DebugHost).__kellerbier = { loop, sim, tuning: sim.tuning, stall };
  console.warn('__kellerbier is exposed for debugging (dev build only)');
}

void boot().catch((error: unknown) => {
  console.error('Kellerbier failed to boot', error);
});
