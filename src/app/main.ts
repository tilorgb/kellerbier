import { Assets, Container, Text, type Texture } from 'pixi.js';
import massUrl from '../../assets/sprites/mass.png';
import { ENEMY_DEFINITIONS } from '../content/enemies/index.js';
import { FLOOR_CONFIGS, type FloorConfig } from '../content/floors/definition.js';
import { DIRECTION_OFFSET } from '../content/rooms/definition.js';
import { ROOM_TEMPLATES, STAIRCASE_TEMPLATES, type DoorDirection } from '../content/rooms/index.js';
import { type RoomDirection, GameSim, MAX_COLLIDER_RADIUS } from '../sim/game/sim.js';
import { promilleMeterLabel, promilleTierDisplayName } from '../sim/game/promille.js';
import { type FloorPlan, type FloorPlanRoom, generateFloor } from '../sim/room/floor-plan.js';
import { validateStaircaseTemplate } from '../sim/room/staircase.js';
import {
  type CompiledDoor,
  type RoomPlacement,
  validateRoomTemplate,
} from '../sim/room/template.js';
import { RngStream, createStreamRng } from '../sim/rng/streams.js';
import { TICKS_PER_SECOND } from '../sim/time.js';
import { InputAction, isActionDown } from '../sim/input/frame.js';
import { createRenderer, trackWindowSize } from '../render/app.js';
import {
  createBlobTexture,
  createRingTexture,
  createSilhouetteTexture,
  createSolidTexture,
} from '../render/placeholder-art.js';
import {
  type GameLayout,
  INTERNAL_HEIGHT,
  INTERNAL_WIDTH,
  computeGameLayout,
} from '../render/resolution.js';
import { ActiveItemHud } from '../render/active-item-hud.js';
import { BossHealthHud } from '../render/boss-health-hud.js';
import { EntityView } from '../render/entities.js';
import { GameOverScreen } from '../render/game-over.js';
import { HealthHud } from '../render/health-hud.js';
import { ItemGateHud } from '../render/item-gate-hud.js';
import { MinimapHud } from '../render/minimap-hud.js';
import { PromilleHud } from '../render/promille-hud.js';
import { WalletHud } from '../render/wallet-hud.js';
import { Vignette } from '../render/vignette.js';
import { GameView } from '../render/view.js';
import { loadFloorArt } from '../render/floor-art.js';
import { attachLiveArtPreviewListener } from '../render/live-art-preview.js';
import { AmbienceTracker, SILENT_AMBIENCE } from './audio/ambience.js';
import { SILENT_AUDIO, playImpactAudio } from './audio/impact.js';
import { Bindable } from './input/bindings.js';
import { actionPrompt, detectGlyphSet } from './input/glyphs.js';
import { InputSampler } from './input/sampler.js';
import { playRumble } from './input/rumble.js';
import { FixedTimestepLoop, runAnimationFrameLoop } from './loop.js';
import { RunSummaryTracker } from './run-summary.js';
import { createAccessibilityPanel } from './accessibility-panel.js';
import { createEditorDock } from './editor-dock.js';
import {
  type AccessibilitySettings,
  applySettingsToSim,
  loadSettings,
  saveSettings,
} from './settings.js';

/**
 * The authored pool, run through the same typed boundary the sim uses to load
 * a single room — the floor generator (#20) needs `shape`/`doors`/`floorTags`
 * typed to match a slot against, which a raw JSON import does not carry.
 */
const ROOM_TEMPLATE_POOL = ROOM_TEMPLATES.map((room, index) =>
  validateRoomTemplate(room, `room[${String(index)}]`, ENEMY_DEFINITIONS),
);
const TEMPLATES_BY_ID = new Map(ROOM_TEMPLATE_POOL.map((template) => [template.id, template]));

/** The staircase content pool (#112), through the same typed boundary as `ROOM_TEMPLATE_POOL`. */
const STAIRCASE_TEMPLATE_POOL = STAIRCASE_TEMPLATES.map((room, index) =>
  validateStaircaseTemplate(room, `staircase[${String(index)}]`),
);
const STAIRCASE_TEMPLATES_BY_ID = new Map(
  STAIRCASE_TEMPLATE_POOL.map((template) => [template.id, template]),
);

/**
 * The highest floor number with a real room pool to draw from, today — see
 * `advanceFloor`'s doc comment for why this is separate from `FLOOR_CONFIGS`
 * simply listing floors 1-7. Bump this the moment a floor's room templates
 * land (its `floorTag` shows up in at least a start/boss/treasure/shop/
 * secret/supersecret template — see `sim/room/floor-plan.ts`'s
 * `MIN_ROOMS_FOR_ROLES`), not before.
 */
const HIGHEST_PLAYABLE_FLOOR = 2;

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

/** `planTemplate`'s staircase counterpart (#112) — `room.staircaseTemplateId` must be set. */
function planStaircaseTemplate(room: FloorPlanRoom): unknown {
  const id = room.staircaseTemplateId;
  const template = id === undefined ? undefined : STAIRCASE_TEMPLATES_BY_ID.get(id);
  if (template === undefined) {
    throw new Error(
      `floor plan room "${room.id}" references unknown staircase template "${String(id)}"`,
    );
  }
  return template;
}

/**
 * A staircase room's two doors, each with its real pixel centre —
 * `hiddenDoorsFor`/`crackHintsFor` need this because a staircase has no
 * floor-grid cell for `doorCentre`'s normal cell-relative formula to place
 * a door against (`CompiledDoor.centre`'s doc comment). Read straight off
 * `FloorPlanRoom.doorCentres`, precomputed once by `floor-plan.ts`'s
 * `staircaseDoorCentres` at placement time (#117) — this never compiles the
 * staircase room itself.
 */
function staircaseDoorCentres(
  room: FloorPlanRoom,
): ReadonlyMap<DoorDirection, { x: number; y: number }> {
  return new Map((room.doorCentres ?? []).map((door) => [door.direction, door]));
}

/**
 * `room`'s real floor-grid layout, translated into the local (0-indexed,
 * origin-agnostic) coordinates `compileRoomTemplate` needs (#100) — a `1x1`
 * room's is always the trivial single-cell case.
 */
function buildPlacement(room: FloorPlanRoom): RoomPlacement {
  const minX = Math.min(...room.cells.map((cell) => cell.x));
  const minY = Math.min(...room.cells.map((cell) => cell.y));
  return {
    cells: room.cells.map((cell) => ({ col: cell.x - minX, row: cell.y - minY })),
    doors: room.doors.map((door) => ({ cellIndex: door.cellIndex, direction: door.direction })),
  };
}

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
 *
 * Returns specific doors — `(cellCol, cellRow, direction)`, same shape as
 * `crackHintsFor` below — not bare directions: a multi-cell room (#100) can
 * have two doors sharing a direction on different cells, and hiding the one
 * that borders a secret room must never also hide an unrelated door to a
 * normal neighbour that happens to face the same way.
 */
function hiddenDoorsFor(
  plan: FloorPlan,
  roomId: string,
  revealedEdges: ReadonlySet<string>,
): CompiledDoor[] {
  const room = planRoom(plan, roomId);
  if (room.role === 'secret' || room.role === 'supersecret') {
    return [];
  }
  // A staircase (#112) has no real floor-grid cell for `buildPlacement`'s
  // col/row math to place a door against — its two doors are always
  // `(cellCol: 0, cellRow: 0)` in `GameSim.loadStaircaseRoom`'s synthesised
  // `CompiledDoor`s (see that method's doc comment), each with its real
  // pixel `centre` (`staircaseDoorCentres`) instead — match and render off
  // that directly rather than running them through `buildPlacement`.
  const placement = room.staircaseTemplateId === undefined ? buildPlacement(room) : null;
  const staircaseCentres =
    room.staircaseTemplateId === undefined ? null : staircaseDoorCentres(room);
  const hidden: CompiledDoor[] = [];
  for (const door of room.doors) {
    const neighbor = planRoom(plan, door.neighborRoomId);
    const isSecretEdge = neighbor.role === 'secret' || neighbor.role === 'supersecret';
    if (!isSecretEdge || revealedEdges.has(edgeKey(roomId, door.neighborRoomId))) {
      continue;
    }
    if (staircaseCentres !== null) {
      const centre = staircaseCentres.get(door.direction);
      hidden.push({
        direction: door.direction,
        cellCol: 0,
        cellRow: 0,
        ...(centre === undefined ? {} : { centre }),
      });
      continue;
    }
    const cell = placement?.cells[door.cellIndex];
    if (cell === undefined) {
      continue;
    }
    hidden.push({ direction: door.direction, cellCol: cell.col, cellRow: cell.row });
  }
  return hidden;
}

/**
 * The doors `hiddenDoorsFor` would hide for `roomId` that should draw a
 * crack hint — every one of them except a supersecret's, which gets no hint
 * at all. "Deliberately obnoxious to find" (#23) is entirely this omission;
 * nothing else in the reveal mechanic treats a supersecret edge differently
 * from a secret one.
 *
 * Returns real `CompiledDoor`s (cell included), not bare directions — the
 * crack has to land on the specific sub-cell's wall (#100), same as the door
 * it stands in for.
 */
function crackHintsFor(
  plan: FloorPlan,
  roomId: string,
  revealedEdges: ReadonlySet<string>,
): CompiledDoor[] {
  const room = planRoom(plan, roomId);
  const placement = room.staircaseTemplateId === undefined ? buildPlacement(room) : null;
  const staircaseCentres =
    room.staircaseTemplateId === undefined ? null : staircaseDoorCentres(room);
  const hints: CompiledDoor[] = [];
  for (const door of room.doors) {
    if (planRoom(plan, door.neighborRoomId).role !== 'secret') {
      continue;
    }
    if (revealedEdges.has(edgeKey(roomId, door.neighborRoomId))) {
      continue;
    }
    if (staircaseCentres !== null) {
      const centre = staircaseCentres.get(door.direction);
      hints.push({
        direction: door.direction,
        cellCol: 0,
        cellRow: 0,
        ...(centre === undefined ? {} : { centre }),
      });
      continue;
    }
    const cell = placement?.cells[door.cellIndex];
    if (cell === undefined) {
      continue;
    }
    hints.push({ direction: door.direction, cellCol: cell.col, cellRow: cell.row });
  }
  return hints;
}

async function boot(): Promise<void> {
  const host = document.getElementById('game');
  if (host === null) {
    throw new Error('Missing #game host element in index.html');
  }

  const app = await createRenderer(host);

  // Accessibility settings (#33): persisted across reloads in `localStorage`,
  // read once here and mutated in place from then on — by the panel below,
  // and re-applied to a fresh `sim` on every `startRun` (a restart rebuilds
  // `sim` from scratch, and `swayScale`/`driftScale`/`wobbleScale` live on
  // it, not in `tuning`). See `app/settings.ts` for why these live outside
  // `GameSim`/replay state.
  const settings = loadSettings();

  const playerTexture = await Assets.load<Texture>({
    src: massUrl,
    data: { scaleMode: 'nearest' },
  });
  // Floor 1's real tile and character art (#35) — see
  // `assets/sprites/README.md`'s "nothing under here is loaded by the game
  // directly" for why this goes through plain static imports rather than
  // the atlas the pipeline builds: nothing in `render/` consumes that atlas
  // yet, so `loadFloorArt` loads the source PNGs the same way `playerTexture`
  // above already does.
  const { floorTiles, enemyArt, tileTextures } = await loadFloorArt();
  // Sprite names are unique across floors and categories by the existing
  // authoring convention (`cellar-floor`, `rural-floor-2`, `kellerassel`, ...),
  // so one flat name -> `Texture` map is enough for the pixel editor's live
  // preview (#108) to find "the texture for this sprite" without also
  // needing the bucketId it was authored under.
  attachLiveArtPreviewListener({ ...tileTextures, ...enemyArt });

  // The run seed: fixed via the page's `?seed=` query param when present,
  // otherwise freshly randomised on every load — proper seeded runs are #48,
  // this is the dev-only stopgap that makes "here's a seed that breaks"
  // actionable before then. Everything downstream of it already behaves as
  // though it were chosen, which is the point — the floor below is generated
  // from this same seed's `RngStream.Floor` stream (see
  // `src/sim/rng/streams.ts`), so it is exactly as reproducible as the rest
  // of the run. The current seed is always shown in `hud` (`refreshHud`,
  // below) so a run that misbehaves can be reported by seed number alone.
  // `#seed-input` (`index.html`) and the `R` key (below) both restart the run
  // in place via `startRun` — no page reload, so no `?seed=` URL/storage
  // plumbing is needed for either.
  const seedParam = new URLSearchParams(location.search).get('seed');
  const parsedSeed = seedParam === null ? Number.NaN : Number(seedParam);
  let RUN_SEED = Number.isFinite(parsedSeed)
    ? Math.trunc(parsedSeed)
    : Math.floor(Math.random() * 1_000_000);
  const seedInput = document.getElementById('seed-input');

  // Rooms `N` has already stepped into. Preferring an unvisited neighbour
  // over a fixed door order turns the walk into a real depth-first tour of
  // the floor — without it, standing in any dead end (a treasure or shop
  // room always is one) makes `N` just bounce back to wherever it came from,
  // which reads as "the generator only has one room" even though the floor
  // behind it is not.
  let floorPlan: FloorPlan;
  let currentRoomId: string;
  let visitedRoomIds: Set<string>;
  /**
   * Edges of the floor's room graph a secret/supersecret wall has been
   * bombed open on, keyed by `edgeKey` so either side recognizes it. Lives
   * for the run: `hiddenDoorsFor` never hides a direction once its edge is
   * in here, so a wall found once stays open on every later visit, from
   * either room it touches.
   */
  let revealedEdges: Set<string>;
  // The room is populated with the authored roster rather than the training
  // targets: the targets are the rig impact feel was tuned against, and the
  // game is the thing with enemies in it.
  // Definite-assignment (`!`): both are always set by `startRun`, called
  // synchronously below before anything reads them — `tsc` cannot see through
  // that function call, only direct assignment in this same scope.
  let sim!: GameSim;
  let view!: GameView;
  /**
   * The player/entity/projectile textures `view` draws with. Built once,
   * from whichever `sim` exists first — every `GameSim`'s `tuning` defaults
   * are the same fixed values (`createTuning`), never seed-dependent, so
   * there is nothing to rebuild here on a later `startRun` restart, only a
   * `GameView` to hand them to.
   */
  let viewTextures: ConstructorParameters<typeof GameView>[1] | undefined;

  // Everything drawn at the game's own resolution goes in here, and this is the
  // only thing that ever gets scaled. Anything added to `app.stage` instead is
  // drawn at the display's resolution, which is what the debug panels want.
  const game = new Container();
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

  /**
   * The boss room's own health bar (#36) — see `render/boss-health-hud.ts`'s
   * doc comment for why it reads `sim.bossHealth` rather than anything named
   * after this specific boss. Positioned just above `bossBanner`'s own text
   * so the two never overlap while both happen to be visible during the
   * room's warmup beat.
   */
  const bossHealthHud = new BossHealthHud(app.renderer);
  uiLayer.addChild(bossHealthHud.view);
  const positionBossHealthHud = (applied: GameLayout): void => {
    bossHealthHud.view.position.set(
      applied.originX + (INTERNAL_WIDTH * applied.scale) / 2,
      applied.originY + 12,
    );
  };

  /**
   * "What did I just pick up" toast (#26): the German name of whatever was
   * just collected — a pickup or an item — plus a short plain-language
   * translation of what it does ("Bierfassl — Bomb +1"). Driven by
   * `sim.pickupToast`, which is presentation state that lives in the
   * simulation (ticks down in `decayPresentation`) rather than a wall-clock
   * timer here, for the same replay-determinism reason `bossBanner` reads
   * `sim.roomWarmupTicks` instead of its own clock.
   */
  const pickupToast = new Text({
    text: '',
    style: { fill: 0xe8c94a, fontFamily: 'monospace', fontSize: 14, fontWeight: 'bold' },
  });
  pickupToast.anchor.set(0.5);
  pickupToast.visible = false;
  uiLayer.addChild(pickupToast);
  const positionPickupToast = (applied: GameLayout): void => {
    pickupToast.position.set(
      applied.originX + (INTERNAL_WIDTH * applied.scale) / 2,
      // Clear of the top-left HUD stack (health/Promille/wallet, the last of
      // which sits at a fixed `originY + 42` screen pixels) even at a small
      // window scale, and still well above `bossBanner`'s 0.3.
      applied.originY + INTERNAL_HEIGHT * applied.scale * 0.22,
    );
  };
  let pickupToastLabel = '';

  /**
   * A shop item's preview — "here is what this is," on touch, not a purchase.
   * Fixed HUD position rather than anchored to the item itself the way the
   * pedestal name plate is: a shop room is a bare floor with a handful of
   * items, not a room complex enough that "belongs to the thing it floats
   * over" is doing any work, and this stays simple the same reason
   * `pickupToast` is fixed rather than anchored to the pickup that triggered
   * it. Driven by `sim.shopPreview`, itself driven by `sim.nearbyShopPickup`
   * (`sim/systems/pickup.ts`'s `stepPickups`) — touching a priced pickup no
   * longer buys it outright, this is what tells the player what pressing
   * `use` would.
   */
  const shopPreview = new Text({
    text: '',
    style: { fill: 0xe8c94a, fontFamily: 'monospace', fontSize: 13, fontWeight: 'bold' },
  });
  shopPreview.anchor.set(0.5);
  shopPreview.visible = false;
  uiLayer.addChild(shopPreview);
  const positionShopPreview = (applied: GameLayout): void => {
    shopPreview.position.set(
      applied.originX + (INTERNAL_WIDTH * applied.scale) / 2,
      // Below `bossBanner`'s 0.3 and clear of the room itself for any window
      // scale — this is a floor-reading prompt, not a mid-room callout.
      applied.originY + INTERNAL_HEIGHT * applied.scale * 0.88,
    );
  };
  let shopPreviewLabel = '';

  /**
   * A pedestal's name plate "on approach" (#28) — the item's name only (the
   * full description waits for the reveal panel below, once it's actually
   * taken). Anchored to the pedestal's own screen position each frame
   * (`view.pedestalScreenPosition`) rather than a fixed HUD slot, so it
   * reads as belonging to the pedestal it floats over. Drawn in `uiLayer`,
   * at the display's own resolution rather than the low-res game layer, the
   * same choice `pickupToast`/`bossBanner` already make — the acceptance
   * criterion that the name and description stay readable at internal
   * resolution is what that choice is for.
   */
  const pedestalNamePlate = new Text({
    text: '',
    style: { fill: 0xffffff, fontFamily: 'monospace', fontSize: 10, fontWeight: 'bold' },
  });
  pedestalNamePlate.anchor.set(0.5, 1);
  pedestalNamePlate.visible = false;
  uiLayer.addChild(pedestalNamePlate);
  let pedestalNamePlateLabel = '';

  /**
   * The pedestal pickup/swap reveal panel — #28's "a brief pause, the item
   * held aloft, name and description shown, then the effect." The pause
   * itself is `GameSim.requestHitstop` (called the same tick this becomes
   * non-null); this panel is what fills the pause and lingers a little past
   * it, driven by `sim.pedestalReveal`/`pedestalRevealTicks` the same way
   * `pickupToast`/`toastTicks` already work, just longer and worth reading
   * in full rather than skimming.
   */
  const pedestalReveal = new Text({
    text: '',
    style: {
      fill: 0xffffff,
      fontFamily: 'monospace',
      fontSize: 16,
      fontWeight: 'bold',
      align: 'center',
      wordWrap: true,
      wordWrapWidth: 420,
    },
  });
  pedestalReveal.anchor.set(0.5);
  pedestalReveal.visible = false;
  uiLayer.addChild(pedestalReveal);
  const positionPedestalReveal = (applied: GameLayout): void => {
    pedestalReveal.position.set(
      applied.originX + (INTERNAL_WIDTH * applied.scale) / 2,
      applied.originY + (INTERNAL_HEIGHT * applied.scale) / 2,
    );
  };
  let pedestalRevealLabel = '';

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

  const activeItemHud = new ActiveItemHud(app.renderer);
  uiLayer.addChild(activeItemHud.view);
  // Stacked directly under the wallet row, same corner. Hidden entirely
  // (`ActiveItemHud.sync`) whenever no active item is held, so an ordinary
  // run without one never shows an empty row here.
  const positionActiveItemHud = (applied: GameLayout): void => {
    activeItemHud.view.position.set(applied.originX + 8, applied.originY + 54);
  };

  const itemGateHud = new ItemGateHud(app.renderer);
  uiLayer.addChild(itemGateHud.view);
  // Stacked directly under the active-item row, same corner — #32's "item
  // activation state is unambiguous in the HUD" acceptance criterion for
  // every held `sober`/`rausch` passive item. Rows past the held gated set
  // stay hidden (`ItemGateHud.sync`), so a run holding none of them shows
  // nothing here at all.
  const positionItemGateHud = (applied: GameLayout): void => {
    itemGateHud.view.position.set(applied.originX + 8, applied.originY + 66);
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

  let summary = new RunSummaryTracker();
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

  let layout = computeGameLayout(window.innerWidth, window.innerHeight, window.devicePixelRatio);

  trackWindowSize(app, game, host, (applied) => {
    layout = applied;
    positionHud(applied);
    positionHealthHud(applied);
    positionPromilleHud(applied);
    positionWalletHud(applied);
    positionActiveItemHud(applied);
    positionItemGateHud(applied);
    positionMinimapHud(applied);
    positionBossBanner(applied);
    positionBossHealthHud(applied);
    positionPickupToast(applied);
    positionShopPreview(applied);
    positionPedestalReveal(applied);
    gameOverScreen.resize(applied);
    vignette.resize(applied);
  });

  const input = new InputSampler();
  input.keyboard.attach(window);
  input.gamepad.attach(window);

  // Floor music and room ambience's seam (#35, `audio/ambience.ts`) — silent
  // until #51, wired up and being called the same way `playImpactAudio`
  // already is below.
  const ambience = new AmbienceTracker();

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
        sim.step(input.sample());
        playImpactAudio(sim, SILENT_AUDIO);
        ambience.sync(sim, SILENT_AMBIENCE);
        playRumble(sim, input.gamepad);
        summary.recordTick(sim);
        advanceDeathSequence();
        checkSecretReveals();
        if (keyHintTicks > 0) {
          keyHintTicks -= 1;
        }
        const touchedDoor = sim.doorContact;
        if (touchedDoor !== null) {
          enterNeighbor(touchedDoor);
        }
      }
      simMs += performance.now() - started;
    },
    render: (alpha) => {
      const started = performance.now();
      overlay?.drawCalls.beginFrame();
      view.sync(alpha, layout.scale);
      healthHud.sync(sim);
      promilleHud.sync(sim, settings.neutralReskin);
      walletHud.sync(sim);
      // `use` is dual-purpose (`stepPedestal`) — near a pedestal it takes the
      // item instead, but the prompt shown here is always the activation one:
      // the two are mutually exclusive in practice (`sim/systems/pedestal.ts`'s
      // own doc comment), and a player standing on a pedestal with a charged
      // active item already has the pedestal's own name plate telling them
      // what `use` does there instead.
      const glyphSet = detectGlyphSet(input.activeDevice, input.gamepad.id);
      const device = input.activeDevice === 'keyboard' ? 'keyboard' : 'gamepad';
      const activatePrompt = actionPrompt(input.bindings, Bindable.Use, device, glyphSet);
      activeItemHud.sync(sim, activatePrompt);
      itemGateHud.sync(sim);
      bossHealthHud.sync(sim);
      minimapHud.setMapOpen(isActionDown(input.frame, InputAction.Map));
      const showBossBanner =
        sim.roomWarmupTicks > 0 && planRoom(floorPlan, currentRoomId).role === 'boss';
      if (showBossBanner !== bossBannerShown) {
        bossBannerShown = showBossBanner;
        bossBanner.visible = showBossBanner;
      }
      const toast = sim.pickupToast;
      if (toast !== null) {
        const label = `${toast.name} — ${toast.description}`;
        if (label !== pickupToastLabel) {
          pickupToastLabel = label;
          pickupToast.text = label;
        }
        pickupToast.visible = true;
      } else if (pickupToast.visible) {
        pickupToast.visible = false;
        pickupToastLabel = '';
      }
      const preview = sim.shopPreview;
      if (preview !== null) {
        const price = `${String(preview.price)} Biermarken`;
        const label = preview.affordable
          ? `${preview.name} — ${preview.description} — ${price}  [use]`
          : `${preview.name} — ${preview.description} — ${price} (not enough)`;
        if (label !== shopPreviewLabel) {
          shopPreviewLabel = label;
          shopPreview.text = label;
        }
        shopPreview.tint = preview.affordable ? 0xffffff : 0x8a8a8a;
        shopPreview.visible = true;
      } else if (shopPreview.visible) {
        shopPreview.visible = false;
        shopPreviewLabel = '';
      }
      const nearbyPedestal = sim.nearestAvailablePedestal();
      const nameplateScreen =
        nearbyPedestal >= 0 ? view.pedestalScreenPosition(nearbyPedestal) : null;
      if (nameplateScreen !== null) {
        const item = sim.items.at(sim.activePedestals[nearbyPedestal]?.itemIndex ?? -1);
        const label = `${item.name}  [use]`;
        if (label !== pedestalNamePlateLabel) {
          pedestalNamePlateLabel = label;
          pedestalNamePlate.text = label;
        }
        pedestalNamePlate.position.set(nameplateScreen.x, nameplateScreen.y - 14);
        pedestalNamePlate.visible = true;
      } else if (pedestalNamePlate.visible) {
        pedestalNamePlate.visible = false;
        pedestalNamePlateLabel = '';
      }
      const reveal = sim.pedestalReveal;
      if (reveal !== null) {
        const label = `${reveal.name}\n${reveal.description}`;
        if (label !== pedestalRevealLabel) {
          pedestalRevealLabel = label;
          pedestalReveal.text = label;
        }
        pedestalReveal.visible = true;
      } else if (pedestalReveal.visible) {
        pedestalReveal.visible = false;
        pedestalRevealLabel = '';
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
    // Trinkfest (#92) only earns space on this line once it has actually
    // moved off baseline — same reasoning as `PromilleHud`'s own label.
    const trinkfest = sim.trinkfest !== 0 ? `  trinkfest ${String(sim.trinkfest)}` : '';
    // Neutral reskin (#33): the meter's own name and its tier both switch —
    // this line is reachable by a normal player (`O`) and is what a bug
    // report's clipboard copy carries, so it gets the same treatment as
    // `PromilleHud`'s label rather than staying the classic name always.
    const meterLabel = promilleMeterLabel(settings.neutralReskin).toLowerCase();
    const tierLabel = promilleTierDisplayName(sim.promilleTier, settings.neutralReskin);
    hud.text = `seed ${String(RUN_SEED)}  ${floorPlan.floorName}  room ${sim.roomId} (${currentRole})  doors ${roomState}${warmup}${keyHint}  enemies ${String(sim.liveEnemyCount)}
  tick ${String(loop.tick)}  ${seconds}s  x${scale}${loop.paused ? '  PAUSED' : ''}
hp ${String(hearts)}/${String(maxHearts)}  soul ${String(sim.playerSoulHealth)}  eternal ${String(sim.playerEternalHealth)}${invulnerable}${dead}
${meterLabel} ${sim.promille.toFixed(2)} ${tierLabel}${trinkfest}${knockedDown}
shots ${String(shots.liveCount)}/${String(shots.capacity)}  particles ${String(
      particles.liveCount,
    )}/${String(particles.capacity)}${shots.overflows > 0 ? '  SHOT OVERFLOW' : ''}
WASD move   arrows aim and fire
  O debug   T tuning   I shot tags   Y accessibility   P pause   . step   [ ] time scale
  N next room (after clear)   R restart (new seed)`;
  };
  /**
   * (Re)starts the run on `seed`: regenerates the floor plan and rebuilds
   * `sim`/`view` from scratch, in place — no page reload. Called once for
   * the initial boot, and again by the `R` key / `#seed-input` (below) for a
   * restart, the same way Isaac's own restart key works.
   *
   * Everything that outlives one run (the renderer, `app`, `playerTexture`,
   * every screen-space HUD element, `loop`, `input`) is left alone; only the
   * run-scoped state — `floorPlan`/`currentRoomId`/`visitedRoomIds`/
   * `revealedEdges`/`sim`/`view`, plus death/summary/key-hint bookkeeping —
   * is torn down and rebuilt.
   *
   * Known gap (deliberately not fixed here — full in-run restart, including
   * this, is #46): the debug overlay, its tuning window, and the
   * `__kellerbier` debug handle are bound once, at the very end of `boot`,
   * to whichever `sim`/`view` exist at that moment. A restart after that
   * point leaves them pointed at the *previous* run — reload the page to
   * reset them, same as before this existed.
   */
  function startRun(seed: number): void {
    RUN_SEED = seed;
    if (seedInput instanceof HTMLInputElement) {
      seedInput.value = String(RUN_SEED);
    }

    floorPlan = generateFloor(
      createStreamRng(RUN_SEED, RngStream.Floor),
      floorConfig(1),
      ROOM_TEMPLATE_POOL,
      STAIRCASE_TEMPLATE_POOL,
    );
    currentRoomId = floorPlan.startRoomId;
    visitedRoomIds = new Set([currentRoomId]);
    revealedEdges = new Set<string>();

    sim = new GameSim({
      seed: RUN_SEED,
      roomTemplate: planTemplate(planRoom(floorPlan, currentRoomId)),
      // Without this, the start room falls back to `compileRoomTemplate`'s
      // default `SINGLE_CELL_PLACEMENT` (no doors), which in turn falls back
      // to compiling a door on every direction the template's raw metadata
      // allows — not just the ones the floor plan actually put a room
      // behind. The start room is always a plain `1x1` (`buildSkeleton`
      // places it first, unconditionally), so `buildPlacement` always has a
      // real floor-grid cell to work from here.
      roomPlacement: buildPlacement(planRoom(floorPlan, currentRoomId)),
      floor: floorPlan.floor,
      hiddenDoors: hiddenDoorsFor(floorPlan, currentRoomId, revealedEdges),
      // The run's very first room reads as a quick, safe tutorial beat
      // rather than the first real encounter — no enemies, no drops,
      // whatever the chosen template itself authors.
      suppressRoomContent: true,
    });
    // A restart rebuilds `sim` from scratch, so the accessibility settings
    // have to be re-applied to it every time — they live on the instance
    // (`GameSim.swayScale`/`driftScale`/`wobbleScale`), not in `tuning`,
    // which `viewTextures`'s own comment notes is otherwise never rebuilt.
    applySettingsToSim(sim, settings);
    viewTextures ??= {
      player: playerTexture,
      projectile: createBlobTexture(
        app.renderer,
        sim.tuning.shooting.shotRadius,
        0xf0c46a,
        0xfff3d0,
      ),
      entity: createBlobTexture(app.renderer, MAX_COLLIDER_RADIUS, 0x7d5a3c, 0xb08056),
      entityFlash: createBlobTexture(app.renderer, MAX_COLLIDER_RADIUS, 0xffffff, 0xffffff),
      // White, and tinted where it is drawn — one texture for every telegraph.
      telegraph: createRingTexture(app.renderer, EntityView.telegraphTextureRadius, 0xffffff),
      foam: createBlobTexture(app.renderer, 2, 0xfff4dc, 0xffffff),
      splash: createBlobTexture(app.renderer, 2, 0xd9a441, 0xf6d08a),
      // Dark and wet, not another body. A splash the same brown as a target
      // reads as "something is still standing there", which is the one
      // thing a corpse marker must not do.
      decal: createBlobTexture(app.renderer, 8, 0x3a2a12, 0x4a3618),
      numberFont: 'monospace',
      // Placeholder art (#34) — a plain bright disc and a soft vertical bar
      // are enough to read as "an item floating on light" until real sprites
      // land; `PedestalView` tints both per quality.
      pedestalItem: createBlobTexture(app.renderer, 5, 0xffffff, 0xffffff),
      pedestalBeam: createSolidTexture(app.renderer),
      floorTiles,
      enemyArt,
      enemyFlash: Object.fromEntries(
        Object.entries(enemyArt).map(([id, texture]) => [
          id,
          createSilhouetteTexture(app.renderer, texture),
        ]),
      ),
    };
    view = new GameView(sim, viewTextures);
    game.removeChildren();
    game.addChild(view.stage);
    view.setSecretHints(crackHintsFor(floorPlan, currentRoomId, revealedEdges));
    minimapHud.rebuild(floorPlan, currentRoomId, visitedRoomIds);

    summary = new RunSummaryTracker();
    deathPhase = 'alive';
    deathPhaseTicks = 0;
    keyHintTicks = 0;
    bossBannerShown = false;
    bossBanner.visible = false;
    pickupToastLabel = '';
    pickupToast.visible = false;
    shopPreviewLabel = '';
    shopPreview.visible = false;
    pedestalNamePlateLabel = '';
    pedestalNamePlate.visible = false;
    pedestalRevealLabel = '';
    pedestalReveal.visible = false;
    gameOverScreen.hide();
    loop.reset();
    loop.timeScale = 1;
    loop.paused = false;

    refreshHud();
    positionHud(layout);
    positionBossBanner(layout);
  }

  startRun(RUN_SEED);

  if (seedInput instanceof HTMLInputElement) {
    seedInput.addEventListener('change', () => {
      const next = Math.trunc(Number(seedInput.value));
      if (Number.isFinite(next)) {
        startRun(next);
      }
    });
  }

  /**
   * `#seed-finder` (`index.html`): each checked filter has to match before a
   * seed counts as found, so "staircase" + "all shapes" together finds a
   * seed with both, not either. Add a filter here and a checkbox next to it
   * in `index.html` to extend this — nothing else needs to change.
   */
  const SEED_FILTERS: readonly {
    readonly checkboxId: string;
    readonly matches: (plan: FloorPlan) => boolean;
  }[] = [
    {
      checkboxId: 'filter-staircase',
      // Within 2 doors of the start room — close enough to actually reach
      // and check without a real playthrough, which is the only reason this
      // filter exists.
      matches: (candidate) =>
        candidate.rooms.some(
          (room) => room.staircaseTemplateId !== undefined && room.distanceFromStart <= 2,
        ),
    },
    {
      checkboxId: 'filter-all-shapes',
      matches: (candidate) => {
        const shapes = new Set(candidate.rooms.map((room) => room.shape));
        return (['1x1', '1x2', '2x2', 'L', 'T'] as const).every((shape) => shapes.has(shape));
      },
    },
  ];
  /** How many seeds past the current one to try before giving up. */
  const MAX_SEED_SEARCH = 5_000;

  const seedFindButton = document.getElementById('seed-find-button');
  if (seedFindButton instanceof HTMLButtonElement) {
    seedFindButton.addEventListener('click', () => {
      const activeFilters = SEED_FILTERS.filter((filter) => {
        const checkbox = document.getElementById(filter.checkboxId);
        return checkbox instanceof HTMLInputElement && checkbox.checked;
      });
      if (activeFilters.length === 0) {
        return;
      }
      seedFindButton.disabled = true;
      const originalLabel = 'find';
      seedFindButton.textContent = 'searching…';
      // Deferred one tick so the disabled/"searching…" state actually paints
      // before the search itself — generateFloor is fast per call, but a
      // few thousand of them in a row on the main thread still take a
      // perceptible moment.
      window.setTimeout(() => {
        let found: number | null = null;
        for (let seed = RUN_SEED + 1; seed <= RUN_SEED + MAX_SEED_SEARCH; seed++) {
          let candidate: FloorPlan;
          try {
            candidate = generateFloor(
              createStreamRng(seed, RngStream.Floor),
              floorConfig(1),
              ROOM_TEMPLATE_POOL,
              STAIRCASE_TEMPLATE_POOL,
            );
          } catch {
            continue;
          }
          if (activeFilters.every((filter) => filter.matches(candidate))) {
            found = seed;
            break;
          }
        }
        seedFindButton.disabled = false;
        if (found !== null) {
          seedFindButton.textContent = originalLabel;
          startRun(found);
          return;
        }
        seedFindButton.textContent = 'no match';
        window.setTimeout(() => {
          seedFindButton.textContent = originalLabel;
        }, 1500);
      }, 0);
    });
  }

  /**
   * Crosses one specific door: resolves the real neighbour room on the other
   * side of it, works out exactly which of *that* room's cells the player
   * lands in (#100 — not always its first one), and hands both to
   * `sim.transitionTo`. Shared by `enterNeighbor` (`sim.doorContact`, walking
   * into a door for real) and the `N` debug tour, which already knows which
   * `RoomDoor` it wants without needing to touch one.
   */
  function crossDoor(
    exitCellIndex: number,
    direction: RoomDirection,
    neighborRoomId: string,
  ): boolean {
    const room = planRoom(floorPlan, currentRoomId);
    const exitCell = room.cells[exitCellIndex];
    if (exitCell === undefined) {
      return false;
    }
    const neighborRoom = planRoom(floorPlan, neighborRoomId);
    // A staircase (#112) is never a multi-cell *shape*-family room —
    // `RoomPlacement`/`entryCell` (#100's sub-cell gluing) don't apply to it,
    // it always has exactly one door per direction, and it compiles through
    // `compileStaircaseRoom`, not `compileRoomTemplate` — see
    // `GameSim.transitionToStaircase`.
    const succeeded =
      neighborRoom.staircaseTemplateId !== undefined
        ? sim.transitionToStaircase(
            planStaircaseTemplate(neighborRoom),
            floorPlan.floor,
            direction,
            hiddenDoorsFor(floorPlan, neighborRoomId, revealedEdges),
          )
        : (() => {
            const neighborPlacement = buildPlacement(neighborRoom);
            const offset = DIRECTION_OFFSET[direction];
            const targetX = exitCell.x + offset.x;
            const targetY = exitCell.y + offset.y;
            const entryCellIndex = neighborRoom.cells.findIndex(
              (cell) => cell.x === targetX && cell.y === targetY,
            );
            const entryCell = neighborPlacement.cells[entryCellIndex] ?? { col: 0, row: 0 };
            return sim.transitionTo(
              planTemplate(neighborRoom),
              floorPlan.floor,
              direction,
              hiddenDoorsFor(floorPlan, neighborRoomId, revealedEdges),
              neighborPlacement,
              entryCell,
            );
          })();
    if (!succeeded) {
      // A heuristic, not a reason code out of `transitionTo`: the current
      // room's own enemies are the only other thing that blocks a
      // transition, so ruling that out and checking the target is a
      // treasure room the player has no key for is enough to tell the two
      // apart without threading a discriminated failure reason through the
      // sim layer for one HUD line.
      if (!sim.doorsLocked && neighborRoom.role === 'treasure' && sim.keys <= 0) {
        keyHintTicks = KEY_HINT_TICKS;
      }
      return false;
    }
    currentRoomId = neighborRoomId;
    visitedRoomIds.add(neighborRoomId);
    view.setSecretHints(crackHintsFor(floorPlan, currentRoomId, revealedEdges));
    minimapHud.rebuild(floorPlan, currentRoomId, visitedRoomIds);
    refreshHud();
    return true;
  }

  /**
   * Regenerates the floor in place once a cleared boss room's dev-only
   * "next floor" exit (`GameSim.nextFloorDoor`) is walked through — an
   * endless loop, not a real run reset: `sim` itself is never recreated, so
   * the player's items, stats, promille and Biermarken all carry straight
   * over, the same as any ordinary `sim.loadRoom` call.
   *
   * Advances to `floorPlan.floor + 1`, wrapping back to floor 1 once it
   * passes `HIGHEST_PLAYABLE_FLOOR` — the highest floor `generateFloor` can
   * actually build a plan for today. `FLOOR_CONFIGS` already lists floors up
   * to 7 (#37's doc comment), but a floor's config being *present* isn't the
   * same as its room pool being non-empty: floors 3-7 have zero templates
   * tagged for their `floorTag` (`wald`/`alpen`/`schloss`/`brauerei`/`wiesn`),
   * so `generateFloor` would throw the moment it tried to place a start or
   * boss room. Bump `HIGHEST_PLAYABLE_FLOOR` as each new floor's content
   * lands — this is what keeps the loop endless rather than a dead end the
   * moment a `npm run dev` playtest clears the last floor that exists, so
   * item stacks can be tested across as many runs through them as needed.
   */
  function advanceFloor(): void {
    const nextFloor = floorPlan.floor >= HIGHEST_PLAYABLE_FLOOR ? 1 : floorPlan.floor + 1;
    const seed = Math.floor(Math.random() * 1_000_000);
    floorPlan = generateFloor(
      createStreamRng(seed, RngStream.Floor),
      floorConfig(nextFloor),
      ROOM_TEMPLATE_POOL,
      STAIRCASE_TEMPLATE_POOL,
    );
    currentRoomId = floorPlan.startRoomId;
    visitedRoomIds = new Set([currentRoomId]);
    revealedEdges = new Set<string>();
    // `sim` itself is never recreated here, and every loop regenerates from
    // the same small `floorConfig(1)` template pool — without this, the
    // previous loop's `roomClearedIds` would wrongly mark an increasing
    // share of the new floor's rooms (they can share a template with an
    // already-cleared one) as already cleared. See
    // `GameSim.clearFloorProgress`'s doc comment.
    sim.clearFloorProgress();
    sim.loadRoom(
      planTemplate(planRoom(floorPlan, currentRoomId)),
      floorPlan.floor,
      null,
      hiddenDoorsFor(floorPlan, currentRoomId, revealedEdges),
      undefined,
      { col: 0, row: 0 },
      // Same "quick, safe tutorial beat" as the run's real first room
      // (`startRun`) — a freshly reset floor starts safe too.
      true,
    );
    view.setSecretHints(crackHintsFor(floorPlan, currentRoomId, revealedEdges));
    minimapHud.rebuild(floorPlan, currentRoomId, visitedRoomIds);
    refreshHud();
  }

  /** `sim.doorContact`'s door, translated into "which of this room's real cells did that come from". */
  function enterNeighbor(exitDoor: CompiledDoor): boolean {
    if (exitDoor === sim.nextFloorDoor) {
      advanceFloor();
      return true;
    }
    const room = planRoom(floorPlan, currentRoomId);
    // A staircase's own doors (#112) are always synthesised at
    // `(cellCol: 0, cellRow: 0)` regardless of which of its two doors they
    // are (`GameSim.loadStaircaseRoom`) — `buildPlacement`'s col/row math
    // does not apply to it at all, and direction alone already identifies
    // which door this is (it never has two doors sharing a direction).
    if (room.staircaseTemplateId !== undefined) {
      const match = room.doors.find((door) => door.direction === exitDoor.direction);
      if (match === undefined) {
        return false;
      }
      return crossDoor(match.cellIndex, exitDoor.direction, match.neighborRoomId);
    }
    const placement = buildPlacement(room);
    const exitCellIndex = placement.cells.findIndex(
      (cell) => cell.col === exitDoor.cellCol && cell.row === exitDoor.cellRow,
    );
    const match = room.doors.find(
      (door) => door.cellIndex === exitCellIndex && door.direction === exitDoor.direction,
    );
    if (match === undefined) {
      return false;
    }
    return crossDoor(exitCellIndex, exitDoor.direction, match.neighborRoomId);
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
    for (const door of room.doors) {
      const neighbor = planRoom(floorPlan, door.neighborRoomId);
      const isSecretEdge = neighbor.role === 'secret' || neighbor.role === 'supersecret';
      const key = edgeKey(currentRoomId, door.neighborRoomId);
      if (
        isSecretEdge &&
        !revealedEdges.has(key) &&
        sim.doors.some((visible) => visible.direction === door.direction)
      ) {
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
      case 'r':
      case 'R':
        // A fresh random seed every press, same as Isaac's own restart key —
        // `#seed-input` is what pins a specific one instead.
        startRun(Math.floor(Math.random() * 1_000_000));
        break;
      case 'n':
      case 'N': {
        // Walks the generated floor depth-first: an unvisited door first,
        // backtracking through an already-seen room only once every door
        // from here has been used. Now that `sim.doorContact` triggers a
        // real transition on its own, this is a dev shortcut for touring the
        // floor without walking it — both go through the same `crossDoor`.
        //
        // Tries every candidate in priority order rather than picking one
        // and stopping: a neighbour existing in the floor-plan graph does
        // not mean its door is currently walkable — a secret/supersecret
        // room's approach loads hidden until bombed (#23), so `N` has to
        // fall through to the next candidate rather than getting stuck
        // repeatedly failing to walk through a wall.
        const room = planRoom(floorPlan, currentRoomId);
        const unvisited = room.doors.filter((door) => !visitedRoomIds.has(door.neighborRoomId));
        const visited = room.doors.filter((door) => visitedRoomIds.has(door.neighborRoomId));
        for (const door of [...unvisited, ...visited]) {
          if (crossDoor(door.cellIndex, door.direction, door.neighborRoomId)) {
            break;
          }
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

  // The room editor (#24) / pixel editor (#108) split-view toggle. Ships
  // unconditionally, unlike the debug overlay below — see
  // `editor-dock.ts`'s doc comment for why it can't live behind that
  // `import.meta.env.DEV` gate and still be reachable from a published
  // preview build. Placed here, not at the top of `boot`, because pausing
  // and the room-sync messages below both need `loop`/`sim`/`floorPlan`,
  // which do not exist yet that early.
  const dockRoot = document.getElementById('dock-root');
  if (dockRoot !== null) {
    let pausedBeforeDock = false;
    createEditorDock(dockRoot, {
      // Pausing while any editor is docked is what makes it safe to hand the
      // live room over to the room editor below — the player can't walk
      // through a door mid-edit and invalidate `currentRoomId`/`floorPlan`
      // out from under it. It also means editing an enemy's sprite never
      // has to worry about that enemy attacking mid-edit.
      onOpen: () => {
        pausedBeforeDock = loop.paused;
        loop.paused = true;
      },
      onClose: () => {
        if (!pausedBeforeDock) {
          loop.paused = false;
        }
      },
    });

    window.addEventListener('message', (event: MessageEvent<unknown>) => {
      const data = event.data;
      if (typeof data !== 'object' || data === null || !('type' in data)) {
        return;
      }
      if (data.type === 'kb-room-editor:request-current') {
        const room = planRoom(floorPlan, currentRoomId);
        const templateJson = room.staircaseTemplateId === undefined ? planTemplate(room) : null;
        event.source?.postMessage(
          { type: 'kb-room-editor:current-room', templateJson },
          { targetOrigin: '*' },
        );
        return;
      }
      if (data.type === 'kb-room-editor:apply' && 'templateJson' in data) {
        try {
          const room = planRoom(floorPlan, currentRoomId);
          if (room.staircaseTemplateId !== undefined) {
            throw new Error('the current room is a staircase, which the room editor cannot edit');
          }
          sim.loadRoom(
            data.templateJson,
            floorPlan.floor,
            null,
            hiddenDoorsFor(floorPlan, currentRoomId, revealedEdges),
            buildPlacement(room),
          );
          view.setSecretHints(crackHintsFor(floorPlan, currentRoomId, revealedEdges));
          minimapHud.rebuild(floorPlan, currentRoomId, visitedRoomIds);
          refreshHud();
          event.source?.postMessage(
            { type: 'kb-room-editor:apply-ack', ok: true },
            { targetOrigin: '*' },
          );
        } catch (error) {
          event.source?.postMessage(
            {
              type: 'kb-room-editor:apply-ack',
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            },
            { targetOrigin: '*' },
          );
        }
      }
    });
  }

  // Re-applies the accessibility settings to whichever `GameSim` a restart
  // has most recently built, and refreshes the two places that show a
  // Promille label immediately, rather than waiting for their own next
  // scheduled sync. Shared by the panel below and the headless debug setter,
  // so both change paths behave identically.
  const applyAccessibilityChange = (): void => {
    applySettingsToSim(sim, settings);
    promilleHud.sync(sim, settings.neutralReskin);
    refreshHud();
  };

  overlay = await mountDebugOverlay(sim, view, app, uiLayer, () => layout.scale);
  exposeDebugHandle(
    loop,
    sim,
    (ms) => {
      stallMs = ms;
    },
    settings,
    (patch) => {
      Object.assign(settings, patch);
      saveSettings(settings);
      applyAccessibilityChange();
    },
  );
  // Not gated behind `import.meta.env.DEV` like `mountDebugOverlay` above —
  // this is the player-facing half of #33, so it has to ship in a production
  // build.
  createAccessibilityPanel(settings, applyAccessibilityChange);
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
    /**
     * The live accessibility settings (#33) — read directly for inspection,
     * or changed through `setAccessibilitySettings` below rather than by
     * assigning fields on this object directly, since a plain assignment
     * would skip re-applying to `sim` and persisting to `localStorage`. The
     * headless smoke check this issue's process asks for
     * (`window.__kellerbier.setAccessibilitySettings({ swayScale: 0 })`,
     * then screenshot) drives it through here.
     */
    settings: AccessibilitySettings;
    setAccessibilitySettings: (patch: Partial<AccessibilitySettings>) => void;
  };
}

function exposeDebugHandle(
  loop: FixedTimestepLoop,
  sim: GameSim,
  stall: (ms: number) => void,
  settings: AccessibilitySettings,
  setAccessibilitySettings: (patch: Partial<AccessibilitySettings>) => void,
): void {
  if (!import.meta.env.DEV) {
    return;
  }
  (globalThis as unknown as DebugHost).__kellerbier = {
    loop,
    sim,
    tuning: sim.tuning,
    stall,
    settings,
    setAccessibilitySettings,
  };
  console.warn('__kellerbier is exposed for debugging (dev build only)');
}

void boot().catch((error: unknown) => {
  console.error('Kellerbier failed to boot', error);
});
