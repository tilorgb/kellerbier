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
import { InputAction, isActionDown } from '../sim/input/frame.js';
import { createRenderer, trackWindowSize } from '../render/app.js';
import { createBlobTexture, createRingTexture } from '../render/placeholder-art.js';
import {
  type GameLayout,
  INTERNAL_HEIGHT,
  INTERNAL_WIDTH,
  WORLD_ZOOM,
  computeGameLayout,
  roomUnitsPerPixel,
} from '../render/resolution.js';
import { EntityView } from '../render/entities.js';
import { GameOverScreen } from '../render/game-over.js';
import { HealthHud } from '../render/health-hud.js';
import { MinimapHud } from '../render/minimap-hud.js';
import { PromilleHud } from '../render/promille-hud.js';
import { WalletHud } from '../render/wallet-hud.js';
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

const DIRECTIONS: readonly RoomDirection[] = ['north', 'east', 'south', 'west'];

/** Unordered pair key — an edge is the same whichever of its two rooms asks about it. */
function edgeKey(roomA: string, roomB: string): string {
  return roomA < roomB ? `${roomA}|${roomB}` : `${roomB}|${roomA}`;
}

/**
 * Which of the *currently loading* room's doors should load hidden — a wall,
 * not a doorway, until a nearby Bierfassl blast reveals it
 * (`GameSim.revealBombableWalls`).
 *
 * Only ever computed for the plain-room side of a secret/supersecret edge —
 * a secret room's own way back out is never itself hidden (see the module
 * doc on `revealedEdges` below) — and only for an edge `revealedEdges`
 * doesn't already know about, so a wall found once stays open for the rest
 * of the run, on both sides, everywhere the floor plan is asked again.
 */
function hiddenDoorsFor(
  plan: FloorPlan,
  roomId: string,
  revealedEdges: ReadonlySet<string>,
): RoomDirection[] {
  const room = planRoom(plan, roomId);
  if (room.role === 'secret' || room.role === 'supersecret') {
    return [];
  }
  const hidden: RoomDirection[] = [];
  for (const direction of DIRECTIONS) {
    const neighborId = room.neighbors[direction];
    if (neighborId === undefined) {
      continue;
    }
    const neighbor = planRoom(plan, neighborId);
    const isSecretEdge = neighbor.role === 'secret' || neighbor.role === 'supersecret';
    if (isSecretEdge && !revealedEdges.has(edgeKey(roomId, neighborId))) {
      hidden.push(direction);
    }
  }
  return hidden;
}

/**
 * Directions `hiddenDoorsFor` would hide for `roomId` that should draw a
 * crack hint — every one of them except a supersecret's, which gets no hint
 * at all. "Deliberately obnoxious to find" (#23) is entirely this omission;
 * nothing else in the reveal mechanic treats a supersecret edge differently
 * from a secret one.
 */
function crackHintsFor(
  plan: FloorPlan,
  roomId: string,
  revealedEdges: ReadonlySet<string>,
): RoomDirection[] {
  const room = planRoom(plan, roomId);
  return hiddenDoorsFor(plan, roomId, revealedEdges).filter((direction) => {
    const neighborId = room.neighbors[direction];
    return neighborId !== undefined && planRoom(plan, neighborId).role === 'secret';
  });
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
  //
  // Seed 5 specifically, not 1: template selection is genuinely unbiased (a
  // 200-seed sweep of floor 1 puts a same-template run of 1x1 rooms at roughly
  // 1 floor in 50), but seed 1 was one of the unlucky ones, and a dev demo
  // that only ever shows one room layout does not showcase #20. Seed 5 uses
  // every authored template at least once.
  const RUN_SEED = 5;
  const floorPlan = generateFloor(
    createStreamRng(RUN_SEED, RngStream.Floor),
    floorConfig(1),
    ROOM_TEMPLATE_POOL,
  );
  let currentRoomId = floorPlan.startRoomId;
  // Rooms `N` has already stepped into. Preferring an unvisited neighbour
  // over the fixed north/east/south/west priority order turns the walk into
  // a real depth-first tour of the floor — without it, standing in any dead
  // end (a treasure or shop room always is one) makes `N` just bounce back
  // to wherever it came from, which reads as "the generator only has one
  // room" even though the floor behind it is not.
  const visitedRoomIds = new Set([currentRoomId]);

  /**
   * Edges of the floor's room graph a secret/supersecret wall has been
   * bombed open on, keyed by `edgeKey` so either side recognizes it. Lives
   * for the run: `hiddenDoorsFor` never hides a direction once its edge is
   * in here, so a wall found once stays open on every later visit, from
   * either room it touches.
   */
  const revealedEdges = new Set<string>();

  // The room is populated with the authored roster rather than the training
  // targets: the targets are the rig impact feel was tuned against, and the
  // game is the thing with enemies in it.
  const sim = new GameSim({
    seed: RUN_SEED,
    roomTemplate: planTemplate(planRoom(floorPlan, currentRoomId)),
    floor: floorPlan.floor,
    hiddenDoors: hiddenDoorsFor(floorPlan, currentRoomId, revealedEdges),
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
  view.setSecretHints(crackHintsFor(floorPlan, currentRoomId, revealedEdges));
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

  /**
   * The boss room's intro plate (#23): a plain banner shown for the room's
   * warmup window (`sim.roomWarmupTicks`, the same "enemies stand inert"
   * beat every room already gets) whenever that room's role is `'boss'`.
   * Toggled, not redrawn, every frame — `text` is only ever set on the edge
   * it becomes visible, the same restraint `hud`'s own slow-cadence comment
   * argues for, just event-driven instead of timed.
   */
  const bossBanner = new Text({
    text: 'BOSSRAUM',
    style: { fill: 0xd9a441, fontFamily: 'monospace', fontSize: 18, fontWeight: 'bold' },
  });
  bossBanner.anchor.set(0.5);
  bossBanner.visible = false;
  uiLayer.addChild(bossBanner);
  const positionBossBanner = (applied: GameLayout): void => {
    bossBanner.position.set(
      applied.originX + (INTERNAL_WIDTH * applied.scale) / 2,
      applied.originY + INTERNAL_HEIGHT * applied.scale * 0.3,
    );
  };
  let bossBannerShown = false;

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

  const promilleHud = new PromilleHud(app.renderer);
  uiLayer.addChild(promilleHud.view);
  // Stacked directly under the health row, same corner.
  const positionPromilleHud = (applied: GameLayout): void => {
    promilleHud.view.position.set(applied.originX + 8, applied.originY + 30);
  };

  const walletHud = new WalletHud();
  uiLayer.addChild(walletHud.view);
  // Stacked directly under the Promille bar, same corner.
  const positionWalletHud = (applied: GameLayout): void => {
    walletHud.view.position.set(applied.originX + 8, applied.originY + 42);
  };

  const minimapHud = new MinimapHud(app.renderer);
  uiLayer.addChild(minimapHud.view);
  // The overlay is centred over the game, not the window — it should stay
  // aligned with the room even in a letterboxed viewport.
  uiLayer.addChild(minimapHud.overlayView);
  const positionMinimapHud = (applied: GameLayout): void => {
    minimapHud.view.position.set(
      applied.originX + INTERNAL_WIDTH * applied.scale - 8,
      applied.originY + 8,
    );
    minimapHud.overlayView.position.set(
      applied.originX + (INTERNAL_WIDTH * applied.scale) / 2,
      applied.originY + (INTERNAL_HEIGHT * applied.scale) / 2,
    );
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

  /** Ticks left to show the "needs a key" HUD line — see `enterNeighbor`. */
  let keyHintTicks = 0;
  /** Three seconds at 60 ticks/second — long enough to read, short enough not to linger. */
  const KEY_HINT_TICKS = 180;

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
    positionPromilleHud(applied);
    positionWalletHud(applied);
    positionMinimapHud(applied);
    positionBossBanner(applied);
    gameOverScreen.resize(applied);
    vignette.resize(applied);
  });

  minimapHud.rebuild(floorPlan, currentRoomId, visitedRoomIds);

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
        checkSecretReveals();
        if (keyHintTicks > 0) {
          keyHintTicks -= 1;
        }
        const doorDirection = sim.doorContact;
        if (doorDirection !== null) {
          enterNeighbor(doorDirection);
        }
      }
      simMs += performance.now() - started;
    },
    render: (alpha) => {
      const started = performance.now();
      overlay?.drawCalls.beginFrame();
      view.sync(alpha, layout.scale);
      healthHud.sync(sim);
      promilleHud.sync(sim);
      walletHud.sync(sim);
      minimapHud.setMapOpen(isActionDown(input.frame, InputAction.Map));
      const showBossBanner =
        sim.roomWarmupTicks > 0 && planRoom(floorPlan, currentRoomId).role === 'boss';
      if (showBossBanner !== bossBannerShown) {
        bossBannerShown = showBossBanner;
        bossBanner.visible = showBossBanner;
      }
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
    const warmup = sim.roomWarmupTicks > 0 ? '  WARMUP' : '';
    const currentRole = planRoom(floorPlan, currentRoomId).role;
    const keyHint = keyHintTicks > 0 ? '  NEEDS A KELLERSCHLÜSSEL' : '';
    hud.text = `${floorPlan.floorName}  room ${sim.roomId} (${currentRole})  doors ${roomState}${warmup}${keyHint}  enemies ${String(sim.liveEnemyCount)}
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
  positionBossBanner(layout);

  /**
   * Moves the player into the room adjacent in `direction`, if the current
   * room has a door there and it's unlocked. Shared by the `N` debug tour
   * and `sim.doorContact` (walking into the door for real) — both just need
   * "cross this door", the same `transitionTo` call #19 already built.
   */
  function enterNeighbor(direction: RoomDirection): boolean {
    const room = planRoom(floorPlan, currentRoomId);
    const neighborId = room.neighbors[direction];
    if (neighborId === undefined) {
      return false;
    }
    const succeeded = sim.transitionTo(
      planTemplate(planRoom(floorPlan, neighborId)),
      floorPlan.floor,
      direction,
      hiddenDoorsFor(floorPlan, neighborId, revealedEdges),
    );
    if (!succeeded) {
      // A heuristic, not a reason code out of `transitionTo`: the current
      // room's own enemies are the only other thing that blocks a
      // transition, so ruling that out and checking the target is a
      // treasure room the player has no key for is enough to tell the two
      // apart without threading a discriminated failure reason through the
      // sim layer for one HUD line.
      const neighborRole = planRoom(floorPlan, neighborId).role;
      if (!sim.doorsLocked && neighborRole === 'treasure' && sim.keys <= 0) {
        keyHintTicks = KEY_HINT_TICKS;
      }
      return false;
    }
    currentRoomId = neighborId;
    visitedRoomIds.add(neighborId);
    view.setSecretHints(crackHintsFor(floorPlan, currentRoomId, revealedEdges));
    minimapHud.rebuild(floorPlan, currentRoomId, visitedRoomIds);
    refreshHud();
    return true;
  }

  /**
   * Notices when a Bierfassl blast has opened a hidden wall
   * (`GameSim.revealBombableWalls` flips `sim.doors` the instant it does)
   * and remembers the edge for the rest of the run, so no later load of
   * either room this secret touches hides that direction again.
   */
  function checkSecretReveals(): void {
    const room = planRoom(floorPlan, currentRoomId);
    let changed = false;
    for (const direction of DIRECTIONS) {
      const neighborId = room.neighbors[direction];
      if (neighborId === undefined) {
        continue;
      }
      const neighbor = planRoom(floorPlan, neighborId);
      const isSecretEdge = neighbor.role === 'secret' || neighbor.role === 'supersecret';
      const key = edgeKey(currentRoomId, neighborId);
      if (isSecretEdge && sim.doors[direction] && !revealedEdges.has(key)) {
        revealedEdges.add(key);
        changed = true;
      }
    }
    if (changed) {
      view.setSecretHints(crackHintsFor(floorPlan, currentRoomId, revealedEdges));
      minimapHud.rebuild(floorPlan, currentRoomId, visitedRoomIds);
    }
  }

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
        // Walks the generated floor depth-first: an unvisited door over a
        // fixed north/east/south/west priority, backtracking through an
        // already-seen room only once every door from here has been used.
        // Now that `sim.doorContact` triggers a real transition on its own,
        // this is a dev shortcut for touring the floor without walking it —
        // both go through the same `enterNeighbor`.
        const room = planRoom(floorPlan, currentRoomId);
        const unvisitedDirection = DIRECTIONS.find((candidate) => {
          const id = room.neighbors[candidate];
          return id !== undefined && !visitedRoomIds.has(id);
        });
        const direction: RoomDirection | undefined =
          unvisitedDirection ??
          DIRECTIONS.find((candidate) => room.neighbors[candidate] !== undefined);
        if (direction !== undefined) {
          enterNeighbor(direction);
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
