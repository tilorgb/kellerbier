import { Container, Point } from 'pixi.js';
import { ENEMY_DEFINITIONS } from '../content/enemies/index.js';
import {
  FLOOR_CONFIGS,
  ROOM_GEN_FLOOR_OVERRIDES,
  type FloorConfig,
} from '../content/floors/definition.js';
import {
  DIRECTION_OFFSET,
  isMultiCellRoomTemplate,
  type MultiCellRoomShape,
} from '../content/rooms/definition.js';
import { ROOM_TEMPLATES, STAIRCASE_TEMPLATES, type DoorDirection } from '../content/rooms/index.js';
import { type RoomDirection, GameSim, MAX_COLLIDER_RADIUS } from '../sim/game/sim.js';
import { promilleMeterLabel, promilleTierDisplayName } from '../sim/game/promille.js';
import { type FloorPlan, type FloorPlanRoom, generateFloor } from '../sim/room/floor-plan.js';
import { generateMultiCellRoom, generateRoom, roomGenSeed } from '../sim/room/generate-room.js';
import type { RoomGenTuning } from '../sim/tuning.js';
import { validateStaircaseTemplate } from '../sim/room/staircase.js';
import { Rng } from '../sim/rng/rng.js';
import {
  type CompiledDoor,
  type RoomPlacement,
  validateRoomTemplate,
} from '../sim/room/template.js';
import { RngStream, createStreamRng } from '../sim/rng/streams.js';
import { TICKS_PER_SECOND } from '../sim/time.js';
import {
  InputAction,
  createInputFrame,
  isActionDown,
  type InputFrame,
} from '../sim/input/frame.js';
import { InputPlayback, InputRecording } from '../sim/input/recording.js';
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
import { CharacterHud } from '../render/character-hud.js';
import { EntityView } from '../render/entities.js';
import { GameOverScreen } from '../render/game-over.js';
import { VictoryScreen } from '../render/victory-screen.js';
import { RunResultsScreen } from '../render/run-results.js';
import { HealthHud } from '../render/health-hud.js';
import { ItemGateHud } from '../render/item-gate-hud.js';
import { MinimapHud } from '../render/minimap-hud.js';
import { CurseHud } from '../render/curse-hud.js';
import { BlutwurzHud } from '../render/blutwurz-hud.js';
import { ItemSetHud } from '../render/item-set-hud.js';
import { PromilleHud } from '../render/promille-hud.js';
import { WalletHud } from '../render/wallet-hud.js';
import { HUD_PALETTE, PARTICLE_PALETTE, UI_PALETTE } from '../render/palette.js';
import { FloorTitleCard } from '../render/floor-title-card.js';
import { ReplayViewer } from '../render/replay-viewer.js';
import { installPixelFonts, UI_FONT_FAMILY } from '../render/ui/font.js';
import { UiKit } from '../render/ui/kit.js';
import { TextPlate } from '../render/ui/text-plate.js';
import { DisplayTitle, TITLE_STYLES } from '../render/ui/title.js';
import { UiKitGallery } from '../render/ui/gallery.js';
import { uiScaleFor, uiText, UI_TEXT_HEIGHT } from '../render/ui/text.js';
import { Vignette } from '../render/vignette.js';
import { BlaueStundeOverlay } from '../render/blaue-stunde-overlay.js';
import { GameView } from '../render/view.js';
import { FLOOR_TILESETS, buildAnimatedSets, loadFloorArt } from '../render/floor-art.js';
import {
  bossIdsFrom,
  buildParticleArt,
  buildProjectileArt,
  doorTexturesFrom,
  TELEGRAPH_RING_SPRITE,
} from '../render/art-bundle.js';
import { loadPlayerArt } from '../render/player-art.js';
import { attachLiveArtPreviewListener } from '../render/live-art-preview.js';
import { AmbienceTracker, SynthAmbienceAudio } from './audio/ambience.js';
import { playImpactAudio } from './audio/impact.js';
import { SYNTH_IMPACT_AUDIO, playSfx, playVictoryFanfare } from './audio/sfx-player.js';
import { FootstepTracker } from './audio/footsteps.js';
import { attachAudioUnlockListener, isMuted, toggleMute } from './audio/context.js';
import { Bindable } from './input/bindings.js';
import { actionPrompt, detectGlyphSet } from './input/glyphs.js';
import { InputSampler } from './input/sampler.js';
import { playRumble } from './input/rumble.js';
import { FixedTimestepLoop, runAnimationFrameLoop } from './loop.js';
import { RunSummaryTracker, buildRunDetailsText, runDetailsFrom } from './run-summary.js';
import { buildReplayRecord, loadReplayFrames, saveReplay } from './replay/store.js';
import { downloadReplayFile, parseReplayText } from './replay/file.js';
import { createAccessibilityPanel } from './accessibility-panel.js';
import { createTouchControls, isTouchCapable } from './touch-controls.js';
import { createEditorDock } from './editor-dock.js';
import {
  pickDecorativePropAt,
  pickEnemyAt,
  pickObstacleBlockNameAt,
  pickPlayerAt,
  pickPropAt,
  pickTileNameAt,
} from './sprite-pick.js';
import {
  type AccessibilitySettings,
  applySettingsToSim,
  loadSettings,
  saveSettings,
} from './settings.js';
import { ActiveRunRecorder, decodeActiveRunFrames, persistActiveRun } from './save/active-run.js';
import type { CharacterTraits } from '../sim/character/definition.js';
import { loadSave } from './save/storage.js';
import {
  recordBossDefeat,
  recordRunOutcome,
  characterTraitsById,
  resetProgress,
  selectCharacter,
  selectedCharacter,
  runResultsView,
  unlockEverything,
} from './meta/index.js';
import {
  type PromilleOverride,
  nextPromilleOverride,
  readPromilleOverride,
  resolvePromilleUnlocked,
  writePromilleOverride,
} from './promille-gate.js';
import { readEndlessFloors, writeEndlessFloors } from './endless-floor-debug.js';

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

/**
 * A fresh run seed.
 *
 * `Math.random` rather than a stream: picking which run to play is not part
 * of the run, so it is the one roll that must *not* come out of the seeded
 * streams `src/sim/rng/` owns — drawing it from one would make the next run's
 * identity a function of the last one's.
 */
function rollSeed(): number {
  return Math.floor(Math.random() * 1_000_000);
}

/** Margin from the frame's edge to the HUD, in UI pixels. */
const HUD_MARGIN = 6;

/** Vertical gap between two rows of the top-left HUD stack, in UI pixels. */
const HUD_ROW_GAP = 2;

/** How much bigger than one UI pixel the dev readout draws. Whole, like every other scale here. */
const DEV_READOUT_SCALE = 2;

/** Wrap width for the pedestal reveal's description, in UI pixels — a little under two-thirds of the frame. */
const PEDESTAL_REVEAL_WRAP = 380;

/** How far above a pedestal its name plate floats, in UI pixels. */
const PEDESTAL_PLATE_LIFT = 18;

/**
 * How long a floor's title card stays up, and how long its fade-out takes.
 *
 * Milliseconds off the wall clock, and it is the one presentation timer here
 * that is. Ticks would tie the card to `loop.timeScale` (which the death
 * sequence deliberately drags to a crawl) and rendered *frames* are not ticks
 * — a fixed-timestep loop catching up steps several ticks per frame, so a
 * frame count reads as a different duration on a slow machine than on a fast
 * one. Nothing about the card reaches the simulation, so nothing about it can
 * reach a replay, which is what makes the wall clock allowable here and
 * nowhere in `sim/`.
 */
const FLOOR_CARD_MS = 2600;
const FLOOR_CARD_FADE_MS = 700;

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

/**
 * Procedural room content (#random-rooms).
 *
 * `sim/room/generate-room.ts` synthesises a `RoomTemplate` for every ordinary
 * `normal` slot (any shape) — except the `authoredRoomChance` fraction, filled
 * by a hand-authored room of the same shape drawn from the pool instead. Any
 * authored room with no `specialRole` is a candidate; that is the whole of
 * "add a room and it shows up on a floor". The floor generator still owns the
 * room *graph*; the start room and every special room stay hand-authored.
 * Keyed by floor-plan room id and rebuilt every time a new `floorPlan` is
 * assigned; `roomTemplateFor` consults it before the authored fallback. Params
 * are read live off `sim.tuning.roomGen` (so the debug tuning-window sliders
 * apply on the next room generated), merged with any per-floor override from
 * `ROOM_GEN_FLOOR_OVERRIDES`. `roomGenSalt` is bumped by the `G` debug key so a
 * dev can walk through fresh layouts without touching the run seed.
 */
let proceduralRooms = new Map<string, unknown>();
let roomGenSalt = 0;

/**
 * The hand-authored ordinary rooms that fit a slot — no special role, right
 * shape, right tag, and (`1x1` only) doors a superset of what the slot needs.
 * Every one is a sprinkle candidate; there is no opt-in flag.
 */
function sprinkleCandidates(
  room: FloorPlanRoom,
  floorTag: string,
): { value: unknown; weight: number }[] {
  const needed = room.doors.map((door) => door.direction);
  const candidates: { value: unknown; weight: number }[] = [];
  for (const template of ROOM_TEMPLATE_POOL) {
    if (
      template.metadata.specialRole !== undefined ||
      template.metadata.shape !== room.shape ||
      !template.metadata.floorTags.includes(floorTag)
    ) {
      continue;
    }
    if (
      !isMultiCellRoomTemplate(template) &&
      !needed.every((direction) => template.metadata.doors[direction])
    ) {
      continue;
    }
    candidates.push({ value: template, weight: template.metadata.weight });
  }
  return candidates;
}

function rebuildProceduralRooms(plan: FloorPlan, runSeed: number, baseTuning: RoomGenTuning): void {
  const next = new Map<string, unknown>();
  const config = FLOOR_CONFIGS.find((candidate) => candidate.floor === plan.floor);
  if (config !== undefined) {
    const params: RoomGenTuning = {
      ...baseTuning,
      ...(ROOM_GEN_FLOOR_OVERRIDES[config.floorTag] ?? {}),
    };
    for (const room of plan.rooms) {
      if (room.role !== 'normal' || room.staircaseTemplateId !== undefined) {
        continue;
      }
      const rng = new Rng(roomGenSeed(runSeed, plan.floor, room.id, roomGenSalt));
      const sprinkle = rng.chance(params.authoredRoomChance)
        ? sprinkleCandidates(room, config.floorTag)
        : [];
      if (sprinkle.length > 0) {
        next.set(room.id, rng.weightedPick(sprinkle));
        continue;
      }
      const ctx = {
        roomId: room.id,
        floor: plan.floor,
        floorTag: config.floorTag,
        distanceFromStart: room.distanceFromStart,
        rng,
      };
      if (room.shape === '1x1') {
        next.set(
          room.id,
          generateRoom({ ...ctx, doors: room.doors.map((door) => door.direction) }, params),
        );
      } else {
        const placement = buildPlacement(room);
        next.set(
          room.id,
          generateMultiCellRoom(
            {
              ...ctx,
              shape: room.shape as MultiCellRoomShape,
              cells: placement.cells,
              doors: placement.doors ?? [],
            },
            params,
          ),
        );
      }
    }
  }
  proceduralRooms = next;
}

/** The template for a room — the procedurally generated one when there is one, else the authored pick. */
function roomTemplateFor(room: FloorPlanRoom): unknown {
  return proceduralRooms.get(room.id) ?? planTemplate(room);
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

/**
 * The directions of `roomId`'s doorways that lead to a key-locked treasure
 * room (`metadata.keyLocked`, #196) the player has not opened yet — what
 * `GameView.setLockedDoors` draws with the padlocked door tile instead of
 * the open one once the room's own enemies are down.
 *
 * A visited room is never still locked: `GameSim.transitionTo` consumes the
 * key on entry, so once `visitedRoomIds` has it the door is just a door.
 * `GameSim` itself only knows door geometry, not which template sits on the
 * far side — this is the side of the app that has the floor plan.
 */
function lockedDoorsFor(
  plan: FloorPlan,
  roomId: string,
  visitedRoomIds: ReadonlySet<string>,
): RoomDirection[] {
  const directions: RoomDirection[] = [];
  for (const door of planRoom(plan, roomId).doors) {
    if (visitedRoomIds.has(door.neighborRoomId)) {
      continue;
    }
    const neighbor = planRoom(plan, door.neighborRoomId);
    if (neighbor.role !== 'treasure' || neighbor.staircaseTemplateId !== undefined) {
      continue;
    }
    const metadata = (planTemplate(neighbor) as { metadata?: { keyLocked?: unknown } }).metadata;
    if (metadata?.keyLocked === true) {
      directions.push(door.direction);
    }
  }
  return directions;
}

/**
 * Text for `machinePrompt`, from `sim.machinePreview` — one line per state.
 * `[use]` is the same shorthand `shopPreview`'s own label already uses,
 * since neither has a per-device glyph lookup the way `activatePrompt` does.
 * Everything here is reachable through `use` alone (`GameSim.useMachine`'s
 * own doc comment on why) — the picker's "browse" step is a move-axis tap,
 * mentioned in its own prompt line rather than bound to a second button.
 */
function machineHudLabel(preview: {
  readonly state: 'empty' | 'unfed' | 'fed' | 'broken';
  readonly pickerOpen: boolean;
  readonly itemName: string | undefined;
  readonly cost: number;
  readonly affordable: boolean;
  readonly lastRollSummary: string | undefined;
}): string {
  switch (preview.state) {
    case 'broken':
      return 'Losbrunnen — kaputt.';
    case 'empty':
      return preview.itemName === undefined
        ? 'Losbrunnen — nothing to feed it.'
        : `Losbrunnen — ${preview.itemName} is gone.`;
    case 'unfed': {
      if (!preview.pickerOpen) {
        return 'Losbrunnen  [use: choose an item]';
      }
      const cost = `${String(preview.cost)} Biermarken`;
      return preview.affordable
        ? `Losbrunnen — feed ${preview.itemName ?? ''}? ${cost}  [move: browse] [use: feed]`
        : `Losbrunnen — feed ${preview.itemName ?? ''}? ${cost} (not enough)`;
    }
    case 'fed': {
      const cost = `${String(preview.cost)} Biermarken`;
      const summary = preview.lastRollSummary === undefined ? '' : `${preview.lastRollSummary}  `;
      return preview.affordable
        ? `${summary}Reroll ${preview.itemName ?? ''}? ${cost}  [use]`
        : `${summary}Reroll ${preview.itemName ?? ''}? ${cost} (not enough)`;
    }
  }
}

async function boot(): Promise<void> {
  const host = document.getElementById('game');
  if (host === null) {
    throw new Error('Missing #game host element in index.html');
  }

  // Touch is the real input here, not a mouse that merely happens to sit on
  // a touch-capable laptop — decided once, up front, and reused everywhere
  // mobile chrome has to make room for the on-screen sticks or get out of
  // the way of a small screen entirely.
  const touchCapable = isTouchCapable();

  const app = await createRenderer(host);

  // Before anything builds a label: `render/ui/text.ts` warns loudly if a
  // `BitmapText` is made before the faces exist, because Pixi answers an
  // unknown `fontFamily` by generating one from a browser face — which is
  // silently the system-font HUD #154 exists to remove.
  installPixelFonts(app.renderer);
  const kit = new UiKit(app.renderer);

  // Accessibility settings (#33): persisted across reloads in `localStorage`,
  // read once here and mutated in place from then on — by the panel below,
  // and re-applied to a fresh `sim` on every `startRun` (a restart rebuilds
  // `sim` from scratch, and `swayScale`/`driftScale`/`wobbleScale` live on
  // it, not in `tuning`). See `app/settings.ts` for why these live outside
  // `GameSim`/replay state.
  const settings = loadSettings();

  // The floors' real tile and character art (#35), and Alois's own (#151) —
  // see `assets/sprites/README.md`'s "nothing under here is loaded by the game
  // directly" for why these go through plain imports rather than the atlas the
  // pipeline builds: nothing in `render/` consumes that atlas yet, so both
  // loaders load the source PNGs directly.
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
      tileVariantNames,
      blockVariantNames,
    },
    playerArt,
  ] = await Promise.all([loadFloorArt(), loadPlayerArt()]);
  // Sprite names are unique across floors and categories by the existing
  // authoring convention (`cellar-floor`, `rural-floor-2`, `kellerassel`, ...),
  // so one flat name -> `Texture` map is enough for the pixel editor's live
  // preview (#108) to find "the texture for this sprite" without also
  // needing the bucketId it was authored under.
  attachLiveArtPreviewListener({ ...tileTextures, ...enemyArt });

  // The run seed: fixed via the page's `?seed=` query param when present,
  // otherwise freshly randomised on every load. `?seed=`/`#seed-input`
  // (`index.html`) stay a raw-numeric dev convenience — a player-facing,
  // human-readable seed (entry/reroll/daily/copy, #48) is main-menu scope and
  // not built yet, now that the Stammtisch that used to carry it is gone.
  // Everything downstream of `RUN_SEED` already behaves as though it were
  // chosen, which is the point — the floor below is generated from this same
  // seed's `RngStream.Floor` stream (see `src/sim/rng/streams.ts`), so it is
  // exactly as reproducible as the rest of the run. The current seed is
  // always shown in `hud` (`refreshHud`, below) so a run that misbehaves can
  // be reported by seed number alone, and pressing `C` any time copies the
  // full seed/character/items/outcome summary (`app/run-summary.ts`). Both
  // `#seed-input` and the `R` key (below) restart the run in place via
  // `startRun` — no page reload, so no `?seed=` URL/storage plumbing is
  // needed for either.
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
   * The in-progress run's input log (#45). Reset by every `startRun`
   * (a restart abandons whatever was being recorded, the same as a fresh
   * `sim`) and replayed from a saved one at boot by `resumeActiveRun` below,
   * before the first real frame — see `save/schema.ts`'s `ActiveRunSave` for
   * why a recorded input log is what makes an exact resume possible at all.
   */
  let activeRunRecorder!: ActiveRunRecorder;
  /** Whether this run was resumed from a saved input log — see `resumeActiveRun`. Shown in `refreshHud`. */
  let wasResumed = false;
  /** Ticks since `activeRunRecorder` was last written to `localStorage` — see `autosaveActiveRun`. */
  let ticksSinceAutosave = 0;
  /** Once a second: frequent enough that a crash loses under a second of input, rare enough not to stringify the whole log every tick. */
  const AUTOSAVE_INTERVAL_TICKS = TICKS_PER_SECOND;
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
  /** Blaue Stunde's darkening (#49) — same layer/positioning as `vignette`, its own sprite. */
  const blaueStundeOverlay = new BlaueStundeOverlay();
  uiLayer.addChild(blaueStundeOverlay.view);

  /**
   * Everything drawn on the UI's own pixel grid (#154).
   *
   * `hudLayer` is scaled by a whole number (`uiScaleFor`) and positioned at
   * the game's own top-left, so **one UI pixel is one game pixel** and every
   * HUD piece below lays itself out against a 640x360 frame it never has to
   * ask the size of. The layer is what is scaled, not each component, so a
   * component holds no idea of the window at all.
   *
   * `vignette` stays outside it (it covers the frame, and wants no scaling)
   * and so does the `O` debug overlay, which `mountDebugOverlay` adds to
   * `uiLayer` afterwards and therefore draws on top of all of this.
   */
  const hudLayer = new Container();

  /**
   * The dev-only bottom-left readout: ticks, seed, room state, counts.
   *
   * Outside `hudLayer` and at its own fixed scale, because it is a dense
   * instrument rather than a HUD element — at the UI scale a large window
   * picks, five lines of it would cover the room it is reporting on. It is
   * still drawn in the pixel font: nothing a player can see should be in a
   * system face, and this is visible without pressing anything (the `O`
   * overlay's panels, which are not, keep their monospace).
   */
  const hud = uiText('', { colour: UI_PALETTE.textDim });
  hud.scale.set(DEV_READOUT_SCALE);
  hud.anchor.set(0, 1);
  // A dense instrument readout has no reader on a phone: nobody is holding a
  // controller in one hand and squinting at tick counts in the other, and it
  // would eat a meaningful slice of an already-small screen for nothing a
  // touch player can act on.
  hud.visible = !touchCapable;
  uiLayer.addChild(hud);

  // Added after the readout so anything screen-filling in here — a floor
  // card, the kit gallery, the game-over screen — covers it rather than
  // having a column of debug text drawn across it.
  uiLayer.addChild(hudLayer);

  const gameOverScreen = new GameOverScreen(kit, app.renderer);
  const victoryScreen = new VictoryScreen(kit, app.renderer);

  /**
   * The results screen — a stylized statistics page opened with `T` and
   * automatically the moment a run ends having earned something new.
   *
   * Replaced the Stammtisch hub (`docs/DECISIONS.md` #51 and its follow-up):
   * last run, unlocks, the run board — nothing else. Character select, seed
   * entry and the daily run are a real main menu's job, not built yet.
   */
  const runResults = new RunResultsScreen(kit, app.renderer);

  /**
   * The floor's title card (#154) — the screen-filling Fraktur plate a floor
   * opens on.
   *
   * Neither this nor the game-over screen is added here: both cover the HUD
   * rather than sitting under it, so they are added last, after every HUD
   * piece below. A title card with a health row on top of it is a title card
   * that reads as a bug.
   */
  const floorTitleCard = new FloorTitleCard(app.renderer);
  /** When the current floor card comes down, on the wall clock. Render-only — never sim state. */
  let floorCardUntil = 0;

  /**
   * The boss room's intro plate (#23): shown for the room's warmup window
   * (`sim.roomWarmupTicks`, the same "enemies stand inert" beat every room
   * already gets) whenever that room's role is `'boss'`.
   *
   * Drawn in the display face's threat treatment — the same Fraktur the floor
   * card uses, bled red. Rebuilt only on the edge it becomes visible, the
   * same restraint the old `Text` version kept, and cheaper now that a
   * treated line is a texture rather than a string.
   */
  const bossBanner = new DisplayTitle(app.renderer, TITLE_STYLES.threat);
  bossBanner.set('Bossraum');
  bossBanner.view.visible = false;
  hudLayer.addChild(bossBanner.view);
  let bossBannerShown = false;

  /**
   * The boss room's own health bar (#36) — see `render/boss-health-hud.ts`'s
   * doc comment for why it reads `sim.bossHealth` rather than anything named
   * after this specific boss.
   */
  const bossHealthHud = new BossHealthHud(kit);
  hudLayer.addChild(bossHealthHud.view);

  /**
   * "What did I just pick up" toast (#26): the German name of whatever was
   * just collected — a pickup or an item — plus a short plain-language
   * translation of what it does ("Bierfassl — Bomb +1"). Driven by
   * `sim.pickupToast`, which is presentation state that lives in the
   * simulation (ticks down in `decayPresentation`) rather than a wall-clock
   * timer here, for the same replay-determinism reason `bossBanner` reads
   * `sim.roomWarmupTicks` instead of its own clock.
   *
   * On a kit plate now rather than bare over the room: this is a line the
   * player has under a second to read, and over Die Alpen's snow or Die
   * Wiesn's magenta a bare label is a label with no background at all.
   */
  const pickupToast = new TextPlate(kit, { colour: HUD_PALETTE.toastText });
  hudLayer.addChild(pickupToast.view);
  let pickupToastLabel = '';

  /**
   * A shop item's preview — "here is what this is," on touch, not a purchase.
   * Fixed HUD position rather than anchored to the item itself the way the
   * pedestal name plate is: a shop room is a bare floor with a handful of
   * items, not a room complex enough that "belongs to the thing it floats
   * over" is doing any work. Driven by `sim.shopPreview`, itself driven by
   * `sim.nearbyShopPickup` (`sim/systems/pickup.ts`'s `stepPickups`).
   */
  const shopPreview = new TextPlate(kit, { colour: HUD_PALETTE.toastText });
  hudLayer.addChild(shopPreview.view);
  let shopPreviewLabel = '';

  /**
   * Der Losbrunnen's prompt (#218) — what feeding/rerolling it would cost,
   * and the last roll's outcome once it has one. Same fixed-HUD-slot shape
   * as `shopPreview` and the same reason: the room it appears in (a cleared
   * boss room) is bare enough that anchoring to the machine's own screen
   * position would buy nothing `shopPreview`'s own doc comment doesn't
   * already cover. Driven by `sim.machinePreview`.
   */
  const machinePrompt = new TextPlate(kit, { colour: HUD_PALETTE.toastText });
  hudLayer.addChild(machinePrompt.view);
  let machinePromptLabel = '';

  /**
   * A pedestal's name plate "on approach" (#28) — the item's name only (the
   * full description waits for the reveal panel below, once it's actually
   * taken). Anchored to the pedestal's own screen position each frame
   * (`view.pedestalScreenPosition`, converted into `hudLayer`'s space) rather
   * than a fixed HUD slot, so it reads as belonging to the pedestal it floats
   * over.
   */
  const pedestalNamePlate = new TextPlate(kit, { colour: UI_PALETTE.text });
  hudLayer.addChild(pedestalNamePlate.view);
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
  const pedestalReveal = new TextPlate(kit, {
    colour: UI_PALETTE.text,
    align: 'center',
    wrapWidth: PEDESTAL_REVEAL_WRAP,
  });
  hudLayer.addChild(pedestalReveal.view);
  let pedestalRevealLabel = '';

  const healthHud = new HealthHud(kit);
  hudLayer.addChild(healthHud.view);

  const promilleHud = new PromilleHud(kit);
  hudLayer.addChild(promilleHud.view);

  const walletHud = new WalletHud(kit);
  hudLayer.addChild(walletHud.view);

  /**
   * The character's own row (#47) — hidden for a character whose rules have
   * no state to watch, so an Alois run's HUD is unchanged.
   */
  const characterHud = new CharacterHud(kit);
  hudLayer.addChild(characterHud.view);

  /**
   * Hidden entirely (`ActiveItemHud.sync`) whenever no active item is held,
   * so an ordinary run without one never shows an empty row.
   */
  const activeItemHud = new ActiveItemHud(kit);
  hudLayer.addChild(activeItemHud.view);

  /**
   * #32's "item activation state is unambiguous in the HUD" for every held
   * `sober`/`rausch` passive item. Rows past the held gated set stay hidden
   * (`ItemGateHud.sync`), so a run holding none shows nothing here at all.
   */
  const itemGateHud = new ItemGateHud(kit);
  hudLayer.addChild(itemGateHud.view);

  /** Item sets (#137): the "N/M held" progress row and the completion banner. */
  const itemSetHud = new ItemSetHud(kit);
  hudLayer.addChild(itemSetHud.view);

  const minimapHud = new MinimapHud(app.renderer, kit, {
    treasure: tileTextures['minimap-treasure'],
    shop: tileTextures['minimap-shop'],
    boss: tileTextures['minimap-boss'],
  });
  hudLayer.addChild(minimapHud.view);
  // The overlay is centred over the game, not the window — it should stay
  // aligned with the room even in a letterboxed viewport.
  hudLayer.addChild(minimapHud.overlayView);

  /** A floor's curse (#49): the entry announcement and Sperrstunde's countdown. */
  const curseHud = new CurseHud(kit);
  hudLayer.addChild(curseHud.view);

  /** The spirit walk (#84): a small persistent "you are doing this" readout. */
  const blutwurzHud = new BlutwurzHud(kit);
  hudLayer.addChild(blutwurzHud.view);

  /**
   * The kit's own specimen page (`K`).
   *
   * Shipped rather than kept in a test because most of what #154 built — the
   * button states, the slider, the focus ring #53 needs — has no consumer in
   * the game until M8's menus, and `CLAUDE.md` is explicit that a feature
   * nobody can experience is not finished however green the suite is.
   */
  const kitGallery = new UiKitGallery(kit, app.renderer);

  // Last, and in this order: a floor card covers the HUD, the gallery covers
  // the card, and the game-over screen covers everything.
  hudLayer.addChild(floorTitleCard.view);
  hudLayer.addChild(kitGallery.view);
  hudLayer.addChild(gameOverScreen.view);
  hudLayer.addChild(victoryScreen.view);
  // Above the game-over/victory screens: the hub opens over a finished
  // run's tableau, and the two are on screen together the moment a new
  // regular arrives.
  hudLayer.addChild(runResults.view);

  /** The frame's size in UI pixels, kept for the per-frame placements below. */
  let uiFrame = { width: INTERNAL_WIDTH, height: INTERNAL_HEIGHT };

  /**
   * Places every HUD piece, in UI pixels, against the frame.
   *
   * One function rather than the dozen `positionX` closures this replaced:
   * the pieces are stacked *relative to each other* now (each one reports its
   * own height), so a component growing a row can no longer silently overlap
   * the one below it, which is exactly what a column of hand-written screen
   * offsets could not promise.
   */
  const layoutHud = (applied: GameLayout): void => {
    const scale = uiScaleFor(applied);
    hudLayer.scale.set(scale);
    hudLayer.position.set(applied.originX, applied.originY);
    const width = Math.round((INTERNAL_WIDTH * applied.scale) / scale);
    const height = Math.round((INTERNAL_HEIGHT * applied.scale) / scale);
    uiFrame = { width, height };

    hud.position.set(
      applied.originX + HUD_MARGIN,
      applied.originY + INTERNAL_HEIGHT * applied.scale - HUD_MARGIN,
    );

    let y = HUD_MARGIN;
    healthHud.view.position.set(HUD_MARGIN, y);
    y += healthHud.height + HUD_ROW_GAP;
    // A sober run has no meter (#85): `height` is 0 there, and the row's gap
    // goes with it — otherwise the column would keep a blank line where the
    // bar used to be, which reads as a HUD element that failed to draw.
    promilleHud.view.position.set(HUD_MARGIN, y);
    if (promilleHud.view.visible) {
      y += promilleHud.height + HUD_ROW_GAP;
    }
    walletHud.view.position.set(HUD_MARGIN, y);
    y += walletHud.height + HUD_ROW_GAP;
    characterHud.view.position.set(HUD_MARGIN, y);
    y += characterHud.height + HUD_ROW_GAP;
    activeItemHud.view.position.set(HUD_MARGIN, y);
    y += activeItemHud.height + HUD_ROW_GAP;
    itemGateHud.view.position.set(HUD_MARGIN, y);
    y += itemGateHud.height + HUD_ROW_GAP;

    const centreX = Math.round(width / 2);
    itemSetHud.place(HUD_MARGIN, y, centreX, Math.round(height * 0.32));
    bossHealthHud.view.position.set(centreX, HUD_MARGIN + UI_TEXT_HEIGHT + 2);
    bossBanner.place(centreX, Math.round(height * 0.26));
    pickupToast.place(centreX, Math.round(height * 0.2));
    shopPreview.place(centreX, Math.round(height * 0.85));
    machinePrompt.place(centreX, Math.round(height * 0.78));
    pedestalReveal.placeCentred(centreX, Math.round(height / 2));

    minimapHud.view.position.set(width - HUD_MARGIN, HUD_MARGIN);
    minimapHud.overlayView.position.set(centreX, Math.round(height / 2));
    curseHud.resize(width, height);
    blutwurzHud.place(centreX, Math.round(height * 0.06));

    replayViewer.view.position.set(
      centreX - Math.round(replayViewer.width / 2),
      height - HUD_MARGIN - replayViewer.height,
    );

    gameOverScreen.resize(width, height);
    victoryScreen.resize(width, height);
    runResults.resize(width, height);
    floorTitleCard.resize(width, height);
    kitGallery.resize(width, height);
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
  /** Edge-detects `sim.blutwurzActive` turning on — see `enterBlutwurzEntrance`. */
  let wasBlutwurzActive = false;

  /** Ticks left to show the "needs a key" HUD line — see `enterNeighbor`. */
  let keyHintTicks = 0;
  /** Three seconds at 60 ticks/second — long enough to read, short enough not to linger. */
  const KEY_HINT_TICKS = 180;

  /**
   * Boss rooms already paid for this run, keyed floor + floor-plan room.
   *
   * Walking back into a boss room you have already cleared re-reads as
   * "cleared boss room" on every tick you stand in it, so the credit needs a
   * memory of its own. Cleared on a floor advance rather than only on a
   * restart: a run that loops back round to floor 1 (`advanceFloor`) is
   * genuinely fighting that boss again.
   */
  let creditedBossRooms = new Set<string>();

  /** The seed the next run starts on — rolled at boot and on every death. */
  let pendingSeed = rollSeed();

  /**
   * The replay currently being watched (#48), or `null` for ordinary live
   * play. Entered only by loading a `.json` replay file (`L`), and only over
   * a finished run — see `loadReplayFromFile` for why that guard is what
   * keeps this from ever discarding a run still in progress.
   */
  let replay: {
    readonly seed: number;
    readonly recording: InputRecording;
    playback: InputPlayback;
    /** The recorded run's own Promille state (#85) — see `startRun`'s doc comment on why a replay never uses today's unlock state instead. */
    readonly promilleUnlocked: boolean;
    /** And the character it was played as (#47), for exactly the same reason. */
    readonly character: string;
  } | null = null;
  const replayViewer = new ReplayViewer(kit);
  hudLayer.addChild(replayViewer.view);

  /**
   * The dev override on the Promille gate (#85), read once at boot and
   * cycled by `B`. `auto` — the state every player is in — means the save's
   * own unlock decides.
   */
  let promilleOverride: PromilleOverride = readPromilleOverride();

  /** The dev override on the endless floor loop (#155), read once at boot and toggled by `Y`. */
  let endlessFloors = readEndlessFloors();

  /**
   * Whether the run *about to start* has Promille, from the save plus the
   * override above.
   *
   * Read at run start rather than held as a live flag, because the unlock
   * can be earned in the middle of a run: `creditBossDefeat` commits the
   * moment Der Stier falls, and the beer is deliberately not switched on
   * under the player's feet — Da Xaver announces it at the table and it is
   * there from the *next* run, which is what makes the unlock legible
   * instead of a mechanic that silently appeared.
   */
  function nextRunPromilleUnlocked(): boolean {
    return resolvePromilleUnlocked(loadSave(), promilleOverride);
  }

  /** Whether the loop was already paused when the results screen opened, so closing it doesn't un-pause a debug pause. */
  let pausedBeforeRunResults = false;

  /**
   * The save's unlocked ids at the moment the current run started — what
   * `advanceDeathSequence` compares the run's end against to decide whether
   * something new was earned during it (a boss defeat mid-run counts, since
   * it commits immediately — see `creditBossDefeat`).
   */
  let unlocksAtRunStart = new Set<string>();

  /** Whether the room read as cleared last tick — see `creditBossDefeat`. */
  let roomClearedLastTick = false;

  /**
   * Credits the floor's boss on the tick its room *becomes* clear.
   *
   * An edge rather than a state, because "I am standing in a cleared boss
   * room" is true for every tick of the walk to the exit, and because the
   * cheap read (`sim.roomCleared`) is the one that runs every tick while the
   * floor-plan lookup only runs on the handful of ticks a room is actually
   * finished on.
   *
   * `live` gates the credit for the same reason it gates audio and rumble: a
   * resumed run replays its whole input log through `advanceOneTick`, and a
   * boss beaten before the save was written was already credited when it
   * actually happened. Crediting it again would hand out a defeat per reload.
   * The edge itself is tracked in both cases, so a replay leaves this in the
   * same state the live run it is reconstructing was in.
   */
  function creditBossDefeat(live: boolean): void {
    const cleared = sim.roomCleared;
    const justCleared = cleared && !roomClearedLastTick;
    roomClearedLastTick = cleared;
    if (!live || !justCleared || planRoom(floorPlan, currentRoomId).role !== 'boss') {
      return;
    }
    const key = `${String(floorPlan.floor)}:${currentRoomId}`;
    if (creditedBossRooms.has(key)) {
      return;
    }
    creditedBossRooms.add(key);
    recordBossDefeat(floorPlan.floor);
  }

  /** Opens the results screen over whatever is on screen, pausing the run behind it. */
  function openRunResults(): void {
    if (runResults.visible) {
      return;
    }
    pausedBeforeRunResults = loop.paused;
    loop.paused = true;
    runResults.show(runResultsView(), deathPhase === 'over');
    playSfx('ui-open');
  }

  function closeRunResults(): void {
    if (!runResults.visible) {
      return;
    }
    runResults.hide();
    loop.paused = pausedBeforeRunResults;
    playSfx('ui-close');
  }

  /**
   * How far the run got, at the tick it ended — `playerDeathTick` for a
   * death, `playerWonTick` for a win (#155). The one thing the two outcomes
   * don't share a field for.
   */
  function runEndTick(): number {
    return sim.playerWon ? sim.playerWonTick : sim.playerDeathTick;
  }

  /**
   * Called once per real `sim.step()`, right after it, to drive `deathPhase`
   * forward. Despite the name, this now drives *either* way a run can end
   * (#155) — a death or a win — through the same freeze/slowmo/summary
   * shape, branching only at the very end on which one actually happened.
   * Kept as one sequence rather than a parallel `winPhase` because every
   * beat up to the summary screen is identical, and `sim.playerDead`/
   * `sim.playerWon` are mutually exclusive by construction (`GameSim.markWon`
   * is a no-op once the player is already dead).
   */
  function advanceDeathSequence(): void {
    const tuning = sim.tuning.impact;
    if (deathPhase === 'alive') {
      if (sim.playerDead || sim.playerWon) {
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
        const floorLabel = `${floorPlan.floorName}  room ${sim.roomId} (${planRoom(floorPlan, currentRoomId).role})`;
        if (sim.playerWon) {
          victoryScreen.show({
            seconds: sim.playerWonTick / TICKS_PER_SECOND,
            kills: summary.kills,
            floor: floorLabel,
          });
          ambience.stop();
          playVictoryFanfare();
        } else {
          gameOverScreen.show({
            word: sim.deathWord ?? 'Umgfalln',
            seconds: sim.playerDeathTick / TICKS_PER_SECOND,
            kills: summary.kills,
            // `src/debug/panels/run-info.ts` still shows its own placeholder —
            // wiring the generated floor into the debug overlay's context is a
            // separate, smaller follow-up.
            floor: floorLabel,
          });
          ambience.stop();
        }
        // Watching a replay plays this same sequence back — the summary
        // screen above still shows, since that is what the replay is *of*
        // — but none of the bookkeeping below runs a second time: the
        // outcome it is replaying was already recorded (or, for an imported
        // replay, belongs to whoever's machine recorded it in the first
        // place), and there is no in-progress `activeRun` for a replay to
        // clear or reroll `pendingSeed` out from under.
        if (replay === null) {
          // A finished run — won or dead — has nothing left to resume into:
          // the R key (or a fresh page load) starts a new one either way, so
          // the in-progress log is cleared rather than left around to be
          // resumed into a tableau that is already over.
          persistActiveRun(null);
          const ticksSurvived = runEndTick();
          const save = recordRunOutcome({
            seed: RUN_SEED,
            floor: floorPlan.floor,
            ticksSurvived,
            kills: summary.kills,
            // `null` rather than a drawn word is also how a *win* is told
            // apart from a death on the record itself — a won run never had
            // one to draw. See `run-summary.ts`'s own outcome-agnostic
            // `RunDetails.alive`/`deathWord` shape for the same idea applied
            // to the clipboard "copy run details" text.
            deathWord: sim.playerWon ? null : (sim.deathWord ?? null),
            recordedAt: Date.now(),
          });
          persistFinishedRunReplay();
          pendingSeed = rollSeed();
          // A new unlock is an event, so it interrupts: something earned
          // during the run that just ended (mid-run, via `creditBossDefeat`,
          // or by this very outcome) is shown now, over the summary screen,
          // which is the moment `docs/GAME_DESIGN.md` §9 describes for the
          // Promille unlock. Any other run end leaves the results screen
          // where it is — one keypress away, per the hint the summary screen
          // shows.
          if (save.unlocks.some((id) => !unlocksAtRunStart.has(id))) {
            openRunResults();
            playSfx('ui-unlock-fanfare');
          }
        }
      }
    }
  }

  /**
   * Compresses the just-finished run's input log and stores it as a replay
   * (#48) — fire-and-forget: compression is `async` (`replay/codec.ts`'s
   * `CompressionStream`), and nothing downstream of a finished run's game-
   * over screen depends on the write landing before the next frame.
   *
   * Reads `activeRunRecorder` synchronously, before the `await`, so a fast
   * `R`/Enter press that starts a new run (and reassigns it) in the
   * meantime cannot hand this the wrong run's frames.
   */
  function persistFinishedRunReplay(): void {
    const finishedSeed = RUN_SEED;
    const finishedFloor = floorPlan.floor;
    const finishedTicks = runEndTick();
    const finishedKills = summary.kills;
    const finishedDeathWord = sim.playerWon ? null : (sim.deathWord ?? null);
    const finishedPromilleUnlocked = activeRunRecorder.promilleUnlocked;
    const finishedCharacter = activeRunRecorder.character;
    const recording = new InputRecording(Math.max(1, activeRunRecorder.frameCount));
    for (const frame of decodeActiveRunFrames(activeRunRecorder.toSave())) {
      recording.push(frame);
    }
    buildReplayRecord(recording.toBytes(), {
      seed: finishedSeed,
      floor: finishedFloor,
      ticksSurvived: finishedTicks,
      kills: finishedKills,
      deathWord: finishedDeathWord,
      // The daily run's own entry point (`D` at the Stammtisch) is gone for
      // now along with it — main-menu scope, not built yet — so every replay
      // recorded today is 'normal'. `ReplayRecord.kind` stays `'normal' |
      // 'daily'` for when it comes back.
      kind: 'normal',
      promilleUnlocked: finishedPromilleUnlocked,
      character: finishedCharacter,
      recordedAt: Date.now(),
    })
      .then(saveReplay)
      .catch((error: unknown) => {
        console.warn('[replay] failed to store this run’s replay', error);
      });
  }

  let layout = computeGameLayout(window.innerWidth, window.innerHeight, window.devicePixelRatio);

  trackWindowSize(app, game, host, (applied) => {
    layout = applied;
    layoutHud(applied);
    vignette.resize(applied);
  });

  const input = new InputSampler();
  input.keyboard.attach(window);
  input.gamepad.attach(window);
  // On-screen dual sticks, only where touch is the real input.
  if (touchCapable) {
    createTouchControls(input.touch);
  }

  // Floor music, boss themes and room ambience (#51, `audio/ambience.ts`):
  // `ambienceTracker` edge-detects a floor/room change from `sim` and calls
  // `ambience`, the real Web-Audio-backed implementation, the same seam
  // shape `playImpactAudio`/`SYNTH_IMPACT_AUDIO` use below.
  const ambienceTracker = new AmbienceTracker();
  const ambience = new SynthAmbienceAudio();
  const footsteps = new FootstepTracker();
  attachAudioUnlockListener();

  // The overlay is created asynchronously and may never arrive — in a
  // production build the import below is never reached and the whole of
  // `src/debug/` is dropped from the bundle.
  let overlay: DebugOverlayHandle | null = null;

  let simMs = 0;
  // Milliseconds of deliberate stall to burn on the next step. The debug handle
  // sets it; it is how the frame graph gets checked against a known spike
  // rather than against a hope that one will turn up.
  let stallMs = 0;

  /**
   * Advances the simulation by exactly one tick given `frame`.
   *
   * `live` gates the presentation-only side effects — audio and controller
   * rumble — that must never re-fire during the fast-forward replay
   * `resumeActiveRun` (below) does at boot: replaying a saved run's whole
   * input log through this same function is what reconstructs it exactly
   * (see `save/schema.ts`'s `ActiveRunSave` doc comment), and fast-forwarding
   * through possibly tens of thousands of recorded frames must not replay
   * every historical gunshot's sound and rumble pulse at once. Everything
   * else — the step itself, the kill count, the death sequence, secret
   * reveals, the key-hint timer, and any door or floor transition — has to
   * run identically in both cases, since reproducing exactly that state is
   * the whole point of fast-forwarding through the log in the first place.
   */
  function advanceOneTick(frame: Readonly<InputFrame>, live: boolean): void {
    sim.step(frame);
    if (live) {
      playImpactAudio(sim, SYNTH_IMPACT_AUDIO);
      const isBossRoom = planRoom(floorPlan, currentRoomId).role === 'boss';
      ambienceTracker.sync(sim, ambience, isBossRoom);
      ambience.sync(sim.tick, live);
      ambience.syncPromilleTier(sim.promilleTier);
      footsteps.sync(sim, live);
      playRumble(sim, input.gamepad);
    }
    summary.recordTick(sim);
    creditBossDefeat(live);
    advanceDeathSequence();
    checkBlutwurzTransition();
    checkSecretReveals();
    if (keyHintTicks > 0) {
      keyHintTicks -= 1;
    }
    const touchedDoor = sim.doorContact;
    if (touchedDoor !== null) {
      if (enterNeighbor(touchedDoor)) {
        playSfx('door-open');
      }
    }
  }

  /**
   * Writes the in-progress run's input log to `localStorage` roughly once a
   * second, rather than every tick — `JSON.stringify`-ing a growing frame log
   * sixty times a second is exactly the per-tick allocation
   * `docs/TECH_STACK.md` §3's budget exists to catch, for a feature (mid-run
   * resume) that only needs to survive a *reload*, not a mid-tick crash.
   * `beforeunload`/`visibilitychange` (registered near `runAnimationFrameLoop`
   * below) cover the gap this leaves on an actual tab close.
   */
  function autosaveActiveRun(): void {
    ticksSinceAutosave += 1;
    if (ticksSinceAutosave < AUTOSAVE_INTERVAL_TICKS) {
      return;
    }
    ticksSinceAutosave = 0;
    persistActiveRun(activeRunRecorder);
  }

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
        if (replay !== null) {
          // A replay drives the same `advanceOneTick` a live tick does, just
          // fed from `InputPlayback` instead of `input.sample()`, and with
          // `live: false` — the same flag `resumeActiveRun`'s fast-forward
          // already uses to suppress audio/rumble/boss-credit for a tick that
          // already happened once, for real, when this was first recorded.
          if (replay.playback.finished) {
            // Pausing rather than looping: the death sequence (if the run
            // this replays ended in one) still has ticks queued up after the
            // last *input* frame, since a live run keeps stepping through
            // `deathPhase`'s freeze/slowmo beats — see `advanceDeathSequence`.
            // Holding here lets those play out instead of coasting on empty
            // input the moment the recorded log runs dry.
            loop.paused = true;
          } else {
            advanceOneTick(replay.playback.next(), false);
          }
        } else {
          const frame = input.sample();
          activeRunRecorder.record(frame);
          advanceOneTick(frame, true);
          autosaveActiveRun();
        }
      }
      simMs += performance.now() - started;
    },
    render: (alpha) => {
      const started = performance.now();
      overlay?.drawCalls.beginFrame();
      // `started` doubles as the render clock animation clips advance on
      // (#150) — the same reading this frame is already being timed from,
      // rather than a second `performance.now()` a fraction of a millisecond
      // later.
      view.sync(alpha, layout.scale, started);
      healthHud.sync(sim);
      promilleHud.sync(sim, settings.neutralReskin);
      walletHud.sync(sim);
      characterHud.sync(sim);
      // `use` is dual-purpose (`stepPedestal`) — near a pedestal it takes the
      // item instead, but the prompt shown here is always the activation one:
      // the two are mutually exclusive in practice (`sim/systems/pedestal.ts`'s
      // own doc comment), and a player standing on a pedestal with a charged
      // active item already has the pedestal's own name plate telling them
      // what `use` does there instead.
      const glyphSet = detectGlyphSet(input.activeDevice, input.gamepad.id);
      const device = input.activeDevice === 'gamepad' ? 'gamepad' : 'keyboard';
      // Touch has no bindings to look up a glyph for — the on-screen button
      // is already labelled "Use", so the prompt just points at it.
      const activatePrompt =
        input.activeDevice === 'touch'
          ? 'Tap Use'
          : actionPrompt(input.bindings, Bindable.Use, device, glyphSet);
      activeItemHud.sync(sim, activatePrompt);
      itemGateHud.sync(sim);
      itemSetHud.sync(sim);
      bossHealthHud.sync(sim);
      curseHud.sync(sim);
      blutwurzHud.sync(sim);
      minimapHud.setMapOpen(isActionDown(input.frame, InputAction.Map));
      // Nebel (#49): no minimap for the floor — render-only, the same
      // "accessibility suppression is render-side" split `docs/DECISIONS.md`
      // #41 already uses; the sim keeps tracking visited/revealed rooms
      // underneath, only the corner map and its overlay stop drawing.
      // After `setMapOpen`, which would otherwise stomp both flags back on.
      if (sim.curse === 'nebel') {
        minimapHud.view.visible = false;
        minimapHud.overlayView.visible = false;
      }
      const showBossBanner =
        sim.roomWarmupTicks > 0 && planRoom(floorPlan, currentRoomId).role === 'boss';
      if (showBossBanner !== bossBannerShown) {
        bossBannerShown = showBossBanner;
        bossBanner.view.visible = showBossBanner;
      }
      const toast = sim.pickupToast;
      if (toast !== null) {
        const label = `${toast.name} — ${toast.description}`;
        if (label !== pickupToastLabel) {
          pickupToastLabel = label;
          pickupToast.set(label);
          pickupToast.place(Math.round(uiFrame.width / 2), Math.round(uiFrame.height * 0.2));
          playSfx('pickup-generic');
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
          shopPreview.set(label);
          shopPreview.place(Math.round(uiFrame.width / 2), Math.round(uiFrame.height * 0.85));
        }
        shopPreview.setColour(
          preview.affordable
            ? HUD_PALETTE.shopPreviewAffordable
            : HUD_PALETTE.shopPreviewUnaffordable,
        );
        shopPreview.visible = true;
      } else if (shopPreview.visible) {
        shopPreview.visible = false;
        shopPreviewLabel = '';
      }
      const machine = sim.machinePreview;
      if (machine !== null) {
        const label = machineHudLabel(machine);
        if (label !== machinePromptLabel) {
          machinePromptLabel = label;
          machinePrompt.set(label);
          machinePrompt.place(Math.round(uiFrame.width / 2), Math.round(uiFrame.height * 0.78));
        }
        machinePrompt.setColour(
          machine.state === 'unfed' || machine.state === 'fed'
            ? machine.affordable
              ? HUD_PALETTE.shopPreviewAffordable
              : HUD_PALETTE.shopPreviewUnaffordable
            : HUD_PALETTE.toastText,
        );
        machinePrompt.visible = true;
      } else if (machinePrompt.visible) {
        machinePrompt.visible = false;
        machinePromptLabel = '';
      }
      const nearbyPedestal = sim.nearestAvailablePedestal();
      const nameplateScreen =
        nearbyPedestal >= 0 ? view.pedestalScreenPosition(nearbyPedestal) : null;
      if (nameplateScreen !== null) {
        const item = sim.items.at(sim.activePedestals[nearbyPedestal]?.itemIndex ?? -1);
        const label = `${item.name}  [use]`;
        if (label !== pedestalNamePlateLabel) {
          pedestalNamePlateLabel = label;
          pedestalNamePlate.set(label);
        }
        // `pedestalScreenPosition` is in stage space; `hudLayer` is scaled and
        // offset, so the point has to come back into its local pixels before
        // a plate laid out in UI pixels can use it.
        const local = hudLayer.toLocal({ x: nameplateScreen.x, y: nameplateScreen.y });
        pedestalNamePlate.place(local.x, local.y - PEDESTAL_PLATE_LIFT);
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
          pedestalReveal.set(label);
          pedestalReveal.placeCentred(
            Math.round(uiFrame.width / 2),
            Math.round(uiFrame.height / 2),
          );
          playSfx('pickup-pedestal');
        }
        pedestalReveal.visible = true;
      } else if (pedestalReveal.visible) {
        pedestalReveal.visible = false;
        pedestalRevealLabel = '';
      }
      advanceFloorCard(started);
      const playerScreen = view.playerScreenPosition();
      vignette.sync(sim, playerScreen.x, playerScreen.y);
      blaueStundeOverlay.sync(sim, playerScreen.x, playerScreen.y, layout, settings.reducedMotion);
      if (replay !== null) {
        replayViewer.show();
        replayViewer.sync(
          replay.seed,
          sim.tick,
          replay.recording.length,
          loop.paused,
          loop.timeScale,
        );
      } else {
        replayViewer.hide();
      }
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
    // Who the run is being played as (#47) — on the line a bug report's
    // clipboard copy carries, because "Barnabas refuses food" and "food
    // pickups are broken" are the same screenshot otherwise.
    const character = sim.character.name;
    // Neutral reskin (#33): the meter's own name and its tier both switch —
    // this line is reachable by a normal player (`O`) and is what a bug
    // report's clipboard copy carries, so it gets the same treatment as
    // `PromilleHud`'s label rather than staying the classic name always.
    const meterLabel = promilleMeterLabel(settings.neutralReskin).toLowerCase();
    const tierLabel = promilleTierDisplayName(sim.promilleTier, settings.neutralReskin);
    // The whole line goes in a sober run (#85), not a line reading "0.00
    // Nüchtern": this text is reachable with `O` and is what a bug report's
    // clipboard copy carries, and a meter that is not in the run should not
    // be in the readout of it either. What the run *is* gets said once, on
    // the seed line, where the override that pinned it is also named.
    const promilleLine = sim.promilleUnlocked
      ? `\n${meterLabel} ${sim.promille.toFixed(2)} ${tierLabel}${trinkfest}${knockedDown}`
      : '';
    const runState = sim.promilleUnlocked ? '' : '  SOBER RUN';
    const override = promilleOverride === 'auto' ? '' : `  [${promilleOverride} forced]`;
    // Dev builds only, like the key itself — and not only for symmetry: this
    // line is reachable with `O` in a shipped build, and a key list naming
    // the mechanic would hand a sober player the word the gate exists to
    // keep from them until Da Xaver says it.
    const overrideKeyHint = import.meta.env.DEV ? `   B promille gate (${promilleOverride})` : '';
    hud.text = `seed ${String(RUN_SEED)}  ${character}  ${floorPlan.floorName}  room ${sim.roomId} (${currentRole})  doors ${roomState}${warmup}${keyHint}  enemies ${String(sim.liveEnemyCount)}
  tick ${String(loop.tick)}  ${seconds}s  x${scale}${loop.paused ? '  PAUSED' : ''}
hp ${String(hearts)}/${String(maxHearts)}  soul ${String(sim.playerSoulHealth)}  eternal ${String(sim.playerEternalHealth)}${invulnerable}${dead}${runState}${override}${promilleLine}
shots ${String(shots.liveCount)}/${String(shots.capacity)}  particles ${String(
      particles.liveCount,
    )}/${String(particles.capacity)}${shots.overflows > 0 ? '  SHOT OVERFLOW' : ''}
save ${String(activeRunRecorder.frameCount)} ticks logged${wasResumed ? '  (resumed)' : ''}
WASD move   arrows aim and fire
  O debug   T tuning   I shot tags   Y accessibility   P pause   M ${isMuted() ? 'unmute' : 'mute'}   . step   [ ] time scale
  N next room (after clear)   R restart (new seed)   C copy run   L load replay${overrideKeyHint}`;
  };
  /**
   * (Re)starts the run on `seed`: regenerates the floor plan and rebuilds
   * `sim`/`view` from scratch, in place — no page reload. Called once for
   * the initial boot, and again by the `R` key / `#seed-input` (below) for a
   * restart, the same way Isaac's own restart key works.
   *
   * Everything that outlives one run (the renderer, `app`, `playerArt`,
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
   *
   * `persist` is `false` only for a replay's own rebuild-and-fast-forward
   * (#48's `enterReplay`/`seekReplayTo`) — those calls are not a new run the
   * player is starting, and writing their throwaway recorder over the
   * `activeRun` save slot would either clobber a real in-progress run (if one
   * were still live, which replay's own `deathPhase === 'over'` guard rules
   * out) or, harmlessly but pointlessly, overwrite it with an empty one.
   *
   * `promilleUnlocked` defaults to `nextRunPromilleUnlocked()` — the save's
   * current unlock state — for a genuinely new run, but a replay passes the
   * *recorded* run's own flag explicitly (#48/#85 together): replaying a
   * seed's inputs against today's unlock state instead of the state the run
   * actually had would reconstruct a different run whenever the two disagree.
   */
  function startRun(
    seed: number,
    {
      promilleUnlocked = nextRunPromilleUnlocked(),
      persist = true,
      character = selectedCharacter(),
    }: {
      promilleUnlocked?: boolean;
      persist?: boolean;
      character?: CharacterTraits;
    } = {},
  ): void {
    RUN_SEED = seed;
    if (seedInput instanceof HTMLInputElement) {
      seedInput.value = String(RUN_SEED);
    }
    unlocksAtRunStart = new Set(loadSave().unlocks);

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
      // Who the run is played as (#47) — the save's current selection for a
      // fresh run, and the *recorded* one for a resume or a replay. A
      // run parameter, the same shape as `promilleUnlocked` below, for the
      // same reason: see `ActiveRunSave.character`.
      character,
      roomTemplate: roomTemplateFor(planRoom(floorPlan, currentRoomId)),
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
      // Sober or promilled, decided here and never again for this run (#85).
      // Passed as a `GameSim` option rather than set afterwards because the
      // very first room is populated inside the constructor, and its drop
      // table has to already know which half to roll.
      promilleUnlocked,
    });
    // The start room is hand-authored (loaded just above); the procedural
    // `normal` rooms are built now that `sim` — and its live `tuning.roomGen`
    // — exists, ready for the first door the player walks through.
    rebuildProceduralRooms(floorPlan, RUN_SEED, sim.tuning.roomGen);
    // A restart rebuilds `sim` from scratch, so the accessibility settings
    // have to be re-applied to it every time — they live on the instance
    // (`GameSim.swayScale`/`driftScale`/`wobbleScale`), not in `tuning`,
    // which `viewTextures`'s own comment notes is otherwise never rebuilt.
    applySettingsToSim(sim, settings);
    // A restart abandons whatever was being recorded for the previous run —
    // persisted immediately (not just reassigned in memory) so a crash right
    // after a restart resumes into the *new* run next time, not the one the
    // player just left behind. Skipped for `persist: false` (a replay's own
    // rebuild) — see this function's doc comment.
    activeRunRecorder = new ActiveRunRecorder(seed, promilleUnlocked, character.id);
    ticksSinceAutosave = 0;
    if (persist) {
      persistActiveRun(activeRunRecorder);
    }
    wasResumed = false;
    viewTextures ??= {
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
      // The art-directed warning ring (#153) — a dashed arc set, authored at the
      // size a `mid` enemy's telegraph is actually drawn, so it lands near 1:1
      // where the generated ring it replaces already did. Still white and still
      // tinted where it is drawn: one texture serves every telegraph.
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
      // Dark and wet, not another body. A splash the same brown as a target
      // reads as "something is still standing there", which is the one
      // thing a corpse marker must not do.
      decal: createBlobTexture(
        app.renderer,
        8,
        PARTICLE_PALETTE.decalFill,
        PARTICLE_PALETTE.decalRim,
      ),
      numberFont: UI_FONT_FAMILY,
      // Placeholder art (#34) — a plain bright disc and a soft vertical bar
      // are enough to read as "an item floating on light" until real sprites
      // land; `PedestalView` tints both per quality.
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
      // Animated creatures (#150): one silhouette per frame rather than per
      // creature, built here because generating one needs the renderer.
      enemyAnimation: buildAnimatedSets(enemyStrips, (texture) =>
        createSilhouetteTexture(app.renderer, texture),
      ),
    };
    view = new GameView(sim, viewTextures);
    game.removeChildren();
    game.addChild(view.stage);
    view.setSecretHints(crackHintsFor(floorPlan, currentRoomId, revealedEdges));
    view.setLockedDoors(lockedDoorsFor(floorPlan, currentRoomId, visitedRoomIds));
    minimapHud.rebuild(floorPlan, currentRoomId, visitedRoomIds);

    summary = new RunSummaryTracker();
    creditedBossRooms = new Set<string>();
    roomClearedLastTick = false;
    deathPhase = 'alive';
    deathPhaseTicks = 0;
    wasBlutwurzActive = false;
    keyHintTicks = 0;
    bossBannerShown = false;
    bossBanner.view.visible = false;
    pickupToastLabel = '';
    pickupToast.visible = false;
    shopPreviewLabel = '';
    shopPreview.visible = false;
    machinePromptLabel = '';
    machinePrompt.visible = false;
    pedestalNamePlateLabel = '';
    pedestalNamePlate.visible = false;
    pedestalRevealLabel = '';
    pedestalReveal.visible = false;
    gameOverScreen.hide();
    victoryScreen.hide();
    loop.reset();
    loop.timeScale = 1;
    loop.paused = false;

    // Before `layoutHud`, not after: the meter's row is gone in a sober run,
    // and the column below it only closes up if the layout pass already
    // knows that. See `PromilleHud.setUnlocked`.
    promilleHud.setUnlocked(promilleUnlocked);

    refreshHud();
    layoutHud(layout);
    showFloorCard();
  }

  /**
   * Raises the current floor's title card.
   *
   * Called from `startRun` and from `advanceFloor` — the two moments a player
   * arrives somewhere new — rather than from a room transition, because the
   * card is announcing a *chapter*, and a chapter announced on every door
   * would stop being an announcement by the third room.
   */
  function showFloorCard(): void {
    const config = floorConfig(floorPlan.floor);
    floorTitleCard.show(floorPlan.floor, config.name, config.flavour);
    floorCardUntil = performance.now() + FLOOR_CARD_MS;
    playSfx('floor-card-whoosh');
  }

  /** Fades the card out and takes it down. See `FLOOR_CARD_MS` for why this is a clock and not a tick count. */
  function advanceFloorCard(now: number): void {
    if (!floorTitleCard.visible) {
      return;
    }
    const remaining = floorCardUntil - now;
    if (remaining <= 0) {
      floorTitleCard.hide();
      return;
    }
    floorTitleCard.setFade(Math.min(1, remaining / FLOOR_CARD_FADE_MS));
  }

  /**
   * Resumes the run saved by a previous session, if there is one, by
   * replaying its recorded input log through a fresh `GameSim` built for its
   * seed — see `save/schema.ts`'s `ActiveRunSave` doc comment for why replay
   * reconstructs the run exactly, RNG stream position included, rather than
   * this snapshotting `GameSim`'s internals directly.
   *
   * Returns whether a resume actually happened. A saved run that fails to
   * replay cleanly (a shape it depended on has since changed; any other
   * exception) must not leave the game unplayable — this discards it and
   * reports "no resume" rather than propagating the exception, the same
   * "a content gap degrades gracefully, but still fails loudly enough to
   * notice" shape `CLAUDE.md` asks of an authored-content gap, applied here
   * to a save that no longer replays.
   */
  function resumeActiveRun(): boolean {
    const activeRun = loadSave().activeRun;
    if (activeRun === null) {
      return false;
    }
    try {
      RUN_SEED = activeRun.seed;
      // The run's own recorded state, never the save's current unlock: the
      // Promille unlock is committed the instant Der Stier falls, so a player
      // who beat him and closed the tab has a save that says "promilled"
      // about a log that was recorded sober. Replaying those inputs against
      // the wrong drop tables would resume a different run — see
      // `ActiveRunSave.promilleUnlocked`.
      // Same argument for the character (#47): the table writes a choice the
      // moment the player cycles to it, mid-run included, so the save's
      // current pick can already describe somebody other than whoever
      // recorded this log. `characterTraitsById` resolves the recorded id
      // without asking whether it is still unlocked — a run in progress is
      // not a new choice to be validated.
      startRun(RUN_SEED, {
        promilleUnlocked: activeRun.promilleUnlocked,
        character: characterTraitsById(activeRun.character),
      });
      const frames = decodeActiveRunFrames(activeRun);
      for (const frame of frames) {
        activeRunRecorder.record(frame);
        advanceOneTick(frame, false);
      }
      // The replay above steps `sim` directly rather than through `loop`, so
      // `loop`'s own tick counter is still 0 (from `startRun`'s `loop.reset()`)
      // — catch its presentation clock up to match, or the HUD's elapsed-time
      // readout would restart from zero under a `sim` that is already well
      // past it.
      loop.fastForward(frames.length);
      persistActiveRun(activeRunRecorder);
      wasResumed = true;
      return true;
    } catch (error) {
      console.warn('[save] a saved run failed to resume; starting a fresh one instead', error);
      persistActiveRun(null);
      return false;
    }
  }

  /**
   * Rebuilds `sim`/`view` for `seed` and fast-forwards through `frames` up
   * to `upToTick`, the same technique `resumeActiveRun` above uses to
   * reconstruct a saved run — replaying the recorded log through
   * `advanceOneTick(frame, false)` is what reproduces every bit of
   * simulation state exactly, RNG stream position included, without a
   * snapshot format. `persist: false` (`startRun`'s own doc comment) keeps
   * this from writing a throwaway recorder over the real `activeRun` slot.
   */
  function replayTo(
    seed: number,
    frames: InputRecording,
    upToTick: number,
    promilleUnlocked: boolean,
    character: string,
  ): void {
    startRun(seed, {
      persist: false,
      promilleUnlocked,
      character: characterTraitsById(character),
    });
    const scratch = createInputFrame();
    const clamped = Math.max(0, Math.min(upToTick, frames.length));
    for (let tick = 0; tick < clamped; tick++) {
      frames.read(tick, scratch);
      advanceOneTick(scratch, false);
    }
    loop.fastForward(clamped);
  }

  /**
   * Enters replay mode on `seed`/`frameBytes`, watching from the start. Only
   * valid over a finished run — see `loadReplayFromFile`.
   *
   * `promilleUnlocked` is the recorded run's own flag (`ReplayRecord`/
   * `ActiveRunSave`, #85), not today's save state — see `startRun`'s doc
   * comment.
   */
  function enterReplay(
    seed: number,
    frameBytes: Int8Array,
    promilleUnlocked: boolean,
    character: string,
  ): void {
    const recording = InputRecording.fromBytes(frameBytes);
    closeRunResults();
    replay = {
      seed,
      recording,
      playback: new InputPlayback(recording),
      promilleUnlocked,
      character,
    };
    replayTo(seed, recording, 0, promilleUnlocked, character);
    loop.paused = false;
    loop.timeScale = 1;
    refreshHud();
  }

  /** Seeks the open replay to `targetTick`, clamped to the recording's own length. */
  function seekReplayTo(targetTick: number): void {
    if (replay === null) {
      return;
    }
    // `replayTo` rebuilds through `startRun`, which always leaves a fresh
    // run unpaused at 1x (its own doc comment on `persist`) — the right
    // default for starting a run, and the wrong one for seeking one that is
    // already open, where scrubbing while paused should still be paused
    // afterwards rather than quietly resuming.
    const wasPaused = loop.paused;
    const timeScale = loop.timeScale;
    const clamped = Math.max(0, Math.min(targetTick, replay.recording.length));
    replayTo(replay.seed, replay.recording, clamped, replay.promilleUnlocked, replay.character);
    replay.playback.rewind();
    for (let skipped = 0; skipped < clamped; skipped++) {
      replay.playback.next();
    }
    loop.paused = wasPaused;
    loop.timeScale = timeScale;
    refreshHud();
  }

  /** Leaves replay mode and reopens the results screen — there is nothing to resume back into, see `enterReplay`'s own guard. */
  function exitReplay(): void {
    replay = null;
    replayViewer.hide();
    openRunResults();
  }

  /**
   * Opens a file picker for an imported `.json` replay (`app/replay/file.ts`)
   * — the other half of `CONTRIBUTING.md`'s "attach the replay file too": a
   * replay someone else's machine recorded, dropped into a bug report, that
   * this build can watch without either machine needing anything else.
   *
   * A live run in progress is confirmed away rather than silently discarded
   * — the same guard `editor/main.ts`'s own `window.confirm` calls use for
   * "discard unsaved changes" — since loading a replay rebuilds `sim` from
   * scratch (`enterReplay`) the same way starting a new run does.
   */
  function loadReplayFromFile(): void {
    if (
      deathPhase !== 'over' &&
      !window.confirm('Load a replay now? This ends the run in progress.')
    ) {
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (file === undefined) {
        return;
      }
      file
        .text()
        .then((text) => {
          const record = parseReplayText(text);
          if (record === null) {
            console.warn('[replay] that file is not a Kellerbier replay');
            return null;
          }
          return loadReplayFrames(record).then((bytes) => {
            enterReplay(record.seed, bytes, record.promilleUnlocked, record.character);
          });
        })
        .catch((error: unknown) => {
          console.warn('[replay] failed to load the chosen file', error);
        });
    });
    input.click();
  }

  /** "Copy run details" (#48): the current run's seed, character, items and outcome, as shareable text. */
  function copyCurrentRunDetails(): void {
    const details = runDetailsFrom(
      sim,
      floorPlan.floorName,
      planRoom(floorPlan, currentRoomId).role,
      summary.kills,
    );
    void navigator.clipboard.writeText(buildRunDetailsText(details));
  }

  if (!resumeActiveRun()) {
    startRun(RUN_SEED);
  }

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
              roomTemplateFor(neighborRoom),
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
    view.setLockedDoors(lockedDoorsFor(floorPlan, currentRoomId, visitedRoomIds));
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
   *
   * Draws from `sim.random.floor` — the run's own seeded floor stream
   * (`sim/rng/streams.ts`) — rather than a freshly-`Math.random()`-picked
   * seed as this used to. That used to mean a run that crossed into floor 2
   * was no longer a pure function of its seed and input log: replaying the
   * exact same run twice could regenerate a different floor 2 each time.
   * `GameSim`'s own class doc comment promises the opposite ("reproducible
   * from a seed and an input log"), and the mid-run save/resume this
   * function rides along with (#45) depends on that promise holding across
   * a floor advance, not just within one floor.
   */
  function advanceFloor(): void {
    const nextFloor = floorPlan.floor >= HIGHEST_PLAYABLE_FLOOR ? 1 : floorPlan.floor + 1;
    floorPlan = generateFloor(
      sim.random.floor,
      floorConfig(nextFloor),
      ROOM_TEMPLATE_POOL,
      STAIRCASE_TEMPLATE_POOL,
    );
    rebuildProceduralRooms(floorPlan, RUN_SEED, sim.tuning.roomGen);
    currentRoomId = floorPlan.startRoomId;
    visitedRoomIds = new Set([currentRoomId]);
    revealedEdges = new Set<string>();
    // A new floor plan means new room ids, and a loop back round to floor 1
    // is a boss that has to be beaten again — see `creditedBossRooms`.
    creditedBossRooms = new Set<string>();
    // `sim` itself is never recreated here, and every loop regenerates from
    // the same small `floorConfig(1)` template pool — without this, the
    // previous loop's `roomClearedIds` would wrongly mark an increasing
    // share of the new floor's rooms (they can share a template with an
    // already-cleared one) as already cleared. See
    // `GameSim.clearFloorProgress`'s doc comment.
    sim.clearFloorProgress();
    sim.loadRoom(
      roomTemplateFor(planRoom(floorPlan, currentRoomId)),
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
    view.setLockedDoors(lockedDoorsFor(floorPlan, currentRoomId, visitedRoomIds));
    minimapHud.rebuild(floorPlan, currentRoomId, visitedRoomIds);
    refreshHud();
    showFloorCard();
  }

  /**
   * The spirit walk (#84) just started — the one thing outside `GameSim`'s
   * own state it needs is the floor's start room, since the floor plan
   * lives in `main.ts`, not `sim`. Otherwise nothing here resets: `sim`
   * keeps its inventory, its cleared rooms, its loot snapshots, exactly the
   * way `advanceFloor`'s own doc comment already explains a floor advance
   * does — this is that same "load a room in place, `sim` untouched"
   * shape, just landing on the room the player already started this floor
   * in rather than a freshly generated one.
   *
   * `direction: null` skips the walking-transition slide — waking up
   * elsewhere should read as a cut, not a walk through a door that was
   * never opened.
   */
  function enterBlutwurzEntrance(): void {
    currentRoomId = floorPlan.startRoomId;
    visitedRoomIds.add(currentRoomId);
    sim.loadRoom(
      roomTemplateFor(planRoom(floorPlan, currentRoomId)),
      floorPlan.floor,
      null,
      hiddenDoorsFor(floorPlan, currentRoomId, revealedEdges),
      undefined,
      { col: 0, row: 0 },
      false,
    );
    view.setSecretHints(crackHintsFor(floorPlan, currentRoomId, revealedEdges));
    view.setLockedDoors(lockedDoorsFor(floorPlan, currentRoomId, visitedRoomIds));
    minimapHud.rebuild(floorPlan, currentRoomId, visitedRoomIds);
    refreshHud();
  }

  function checkBlutwurzTransition(): void {
    const active = sim.blutwurzActive;
    if (active && !wasBlutwurzActive) {
      enterBlutwurzEntrance();
    }
    wasBlutwurzActive = active;
  }

  /** `sim.doorContact`'s door, translated into "which of this room's real cells did that come from". */
  function enterNeighbor(exitDoor: CompiledDoor): boolean {
    if (exitDoor === sim.nextFloorDoor) {
      // The last floor's boss room, cleared, walked through — the run is
      // won (#155) rather than looping back to floor 1, unless the dev-only
      // endless-floor override (`Y`) is on. `sim.markWon()` is the only
      // thing this branch does to `sim` itself: the boss room, its loot and
      // the player's own state are left exactly as they are, the same
      // "nothing regenerates" reasoning that makes the victory sequence
      // need no floor snapshot of its own.
      if (floorPlan.floor >= HIGHEST_PLAYABLE_FLOOR && !endlessFloors) {
        sim.markWon();
      } else {
        advanceFloor();
      }
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
      view.setLockedDoors(lockedDoorsFor(floorPlan, currentRoomId, visitedRoomIds));
      minimapHud.rebuild(floorPlan, currentRoomId, visitedRoomIds);
      playSfx('secret-reveal');
    }
  }

  window.addEventListener('keydown', (event: KeyboardEvent) => {
    // Replay playback (#48) swallows every key of its own before either of
    // the two switches below get a look — none of the hub's or the live
    // game's keys make sense over a run that is being watched, not played.
    if (replay !== null) {
      switch (event.key) {
        case ' ':
          loop.paused = !loop.paused;
          break;
        case 'ArrowLeft':
          seekReplayTo(sim.tick - (event.shiftKey ? 60 : 5) * TICKS_PER_SECOND);
          break;
        case 'ArrowRight':
          seekReplayTo(sim.tick + (event.shiftKey ? 60 : 5) * TICKS_PER_SECOND);
          break;
        case '+':
        case '=':
          loop.timeScale = Math.min(8, loop.timeScale * 2);
          break;
        case '-':
          loop.timeScale = Math.max(0.05, loop.timeScale / 2);
          break;
        case 'c':
        case 'C':
          copyCurrentRunDetails();
          break;
        case 'Escape':
        case 'v':
        case 'V':
          exitReplay();
          break;
        default:
          return;
      }
      event.preventDefault();
      return;
    }
    // The results screen swallows the dev keys while it is open: `N`/`P`/`K`
    // have nothing to act on behind a paused screen.
    if (runResults.visible) {
      switch (event.key) {
        case 'Enter':
          // Only from a finished run: see `RunResultsScreen.show`'s
          // `runOver`. Mid-run this screen is somewhere you look, not a way
          // to throw the run away by pressing the most obvious key on it.
          if (deathPhase === 'over') {
            closeRunResults();
            startRun(pendingSeed);
            playSfx('ui-confirm');
          }
          break;
        case 't':
        case 'T':
        case 'Escape':
          closeRunResults();
          break;
        default:
          return;
      }
      event.preventDefault();
      refreshHud();
      return;
    }
    switch (event.key) {
      case 'p':
      case 'P':
        loop.paused = !loop.paused;
        break;
      case 'm':
      case 'M':
        toggleMute();
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
      case 'k':
      case 'K':
        // Steps through the focus-ring rows on each press and closes on the
        // last one, so the ring is visibly a thing that moves rather than a
        // decoration painted on one button.
        kitGallery.toggle();
        break;
      case 'c':
      case 'C':
        // "Current seed always visible and copyable" (#48): the seed shown
        // in the dev readout is not the only way to get at it any more —
        // this works for every player, in the real, non-debug HUD, at any
        // point in a run.
        copyCurrentRunDetails();
        break;
      case 'l':
      case 'L':
        loadReplayFromFile();
        break;
      case 'x':
      case 'X': {
        // "Attach the replay file too" (`CONTRIBUTING.md`'s bug-report
        // step): the latest stored replay, as a `.json` a player can
        // actually attach to a report — the counterpart to `L`'s import.
        // Global, like `L` and `C`, rather than tucked behind the results
        // screen: reporting a bug is not a hub feature.
        const latest = loadSave().replays[0];
        if (latest !== undefined) {
          downloadReplayFile(latest);
        }
        break;
      }
      case 't':
      case 'T':
        // The results screen is reachable mid-run as well as after one, so
        // "what have I got so far" is a question a player can ask while
        // playing, not only after dying.
        openRunResults();
        break;
      case 'b':
      case 'B':
        // B for Bier: cycles auto -> sober -> promilled -> auto and restarts
        // on the new state (#85's debug override). A restart rather than a
        // live toggle because the flag is a run *parameter* — the drop
        // tables and the item pool were both chosen with it, so flipping it
        // mid-run would leave a promilled run's beer lying on a sober floor.
        //
        // Dev builds only. In a release build this key would hand a player
        // the mechanic the whole unlock exists to make them earn, and the
        // rest of `src/debug/` is behind a dynamic import for the same
        // reason.
        if (import.meta.env.DEV) {
          promilleOverride = nextPromilleOverride(promilleOverride);
          writePromilleOverride(promilleOverride);
          startRun(RUN_SEED);
        }
        break;
      case 'y':
      case 'Y':
        // Y for the pre-#155 endless floor loop: clearing the last floor's
        // boss used to always wrap back to floor 1 with `sim` intact, which
        // is genuinely useful for running an item stack through the floors
        // repeatedly during a playtest. Now that clearing Der Stier ends the
        // run for real, this toggle is the only way back to that loop — off
        // by default, so a player can never wander into it by just playing.
        // No live-toggle guard needed the way Promille's `B` has one: this
        // changes nothing about drop tables or item pools, only what happens
        // the next time the dev-only next-floor door is walked through.
        if (import.meta.env.DEV) {
          endlessFloors = !endlessFloors;
          writeEndlessFloors(endlessFloors);
        }
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
      case 'g':
      case 'G': {
        // #random-rooms: reroll every procedural room on this floor and reload
        // the current one in place, so a dev can mash `G` and watch fresh
        // layouts without changing the run seed. Dev builds only, same as `B`.
        if (import.meta.env.DEV) {
          roomGenSalt += 1;
          rebuildProceduralRooms(floorPlan, RUN_SEED, sim.tuning.roomGen);
          const room = planRoom(floorPlan, currentRoomId);
          if (room.staircaseTemplateId === undefined) {
            const isStart = currentRoomId === floorPlan.startRoomId;
            const placement = buildPlacement(room);
            // A generated room's centre can be blocked, so don't drop the
            // player there (`direction: null`) — walk them in through one of
            // its doors, where the wall-margin ring is always clear. For a
            // multi-cell room, land on the sub-cell that door is actually on.
            const entryDoor = isStart ? undefined : room.doors[0];
            const entryDirection: RoomDirection | null = entryDoor?.direction ?? null;
            let entryCell = { col: 0, row: 0 };
            if (entryDoor !== undefined) {
              entryCell = placement.cells[entryDoor.cellIndex] ?? entryCell;
            }
            sim.loadRoom(
              roomTemplateFor(room),
              floorPlan.floor,
              entryDirection,
              hiddenDoorsFor(floorPlan, currentRoomId, revealedEdges),
              placement,
              entryCell,
              isStart,
            );
            view.setSecretHints(crackHintsFor(floorPlan, currentRoomId, revealedEdges));
            view.setLockedDoors(lockedDoorsFor(floorPlan, currentRoomId, visitedRoomIds));
            minimapHud.rebuild(floorPlan, currentRoomId, visitedRoomIds);
          }
        }
        break;
      }
      default:
        return;
    }
    refreshHud();
  });

  // Catches the gap `autosaveActiveRun`'s once-a-second cadence leaves on an
  // actual tab close or backgrounding — `visibilitychange` fires reliably on
  // mobile browsers that don't always run `beforeunload`.
  window.addEventListener('beforeunload', () => {
    persistActiveRun(activeRunRecorder);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      persistActiveRun(activeRunRecorder);
    }
  });

  runAnimationFrameLoop(loop);
  window.setInterval(refreshHud, 100);

  // The room editor (#24) / pixel editor (#108) split-view toggle. Ships
  // unconditionally on desktop, unlike the debug overlay below — see
  // `editor-dock.ts`'s doc comment for why it can't live behind that
  // `import.meta.env.DEV` gate and still be reachable from a published
  // preview build. Placed here, not at the top of `boot`, because pausing
  // and the room-sync messages below both need `loop`/`sim`/`floorPlan`,
  // which do not exist yet that early.
  //
  // Skipped on touch: there is no keyboard-and-mouse editing session to be
  // had on a phone, the split view has nowhere to put a panel next to the
  // game on a small screen, and the toggle buttons would otherwise sit
  // directly on top of `touch-controls.ts`'s map button.
  const dockRoot = touchCapable ? null : document.getElementById('dock-root');
  if (dockRoot !== null) {
    let pausedBeforeDock = false;
    const dock = createEditorDock(dockRoot, {
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

    // Click-to-pick (#108's follow-up): while the Sprites editor is the
    // docked panel, a click on the game canvas resolves to whichever body is
    // under it and loads that sprite into the editor — `app.canvas`'s own
    // pointer events, not Pixi's interaction system, since nothing in the
    // game otherwise uses stage-level pointer interactivity and DOM
    // coordinates are all this needs. Checked most-specific-first — enemy,
    // then Alois himself, then a destructible prop (a barrel, a Maibaum),
    // then a decorative one (a fence post, a well), then an authored wall
    // obstacle (the room editor's Wall tool, drawn from the floor's `block`
    // tile rather than its floor variant), and only then the floor tile
    // underneath all of them — so a click landing on more than one of these
    // always resolves to whichever is actually drawn on top. Before this,
    // only the enemy/tile pair were checked at all: clicking the player or
    // any prop or obstacle silently fell through to "whatever tile is under
    // the cursor", which read as those categories being broken.
    // Only fires while the sprites editor is open — the room editor has no
    // use for a game click, and this would otherwise steal clicks a
    // mouse-driven aim scheme might one day want.
    app.canvas.addEventListener('pointerdown', (event: PointerEvent) => {
      if (dock.activeEditorId() !== 'sprites') {
        return;
      }
      const rect = app.canvas.getBoundingClientRect();
      const global = new Point(event.clientX - rect.left, event.clientY - rect.top);
      const local = view.worldLayer.toLocal(global);

      const enemyId = pickEnemyAt(sim, local.x, local.y);
      if (enemyId === null && pickPlayerAt(sim, local.x, local.y)) {
        // Alois's own strips (`common/characters/alois-*`) never went
        // through `loadFloorArt`'s `spriteOrigins` map — `render/player-art.ts`
        // loads them separately, keyed by facing rather than by name — so
        // this is resolved directly rather than through the `spriteOrigins`
        // lookup every other category below shares.
        dock.postToActive({
          type: 'kb-pixel-editor:pick',
          bucketId: 'common',
          category: 'character',
          name: `alois-${view.player.bodyKey}`,
        });
        return;
      }
      const tileset = FLOOR_TILESETS[floorPlan.floor];
      const name =
        enemyId ??
        pickPropAt(sim, local.x, local.y, tileset?.destructibles ?? []) ??
        pickDecorativePropAt(sim, local.x, local.y) ??
        pickObstacleBlockNameAt(sim, local.x, local.y, blockVariantNames[floorPlan.floor] ?? []) ??
        pickTileNameAt(sim, floorPlan.floor, local.x, local.y, tileVariantNames);
      if (name === null) {
        return;
      }
      const origin = spriteOrigins[name];
      if (origin === undefined) {
        return;
      }
      dock.postToActive({
        type: 'kb-pixel-editor:pick',
        bucketId: origin.bucketId,
        category: origin.category,
        name,
      });
    });

    window.addEventListener('message', (event: MessageEvent<unknown>) => {
      const data = event.data;
      if (typeof data !== 'object' || data === null || !('type' in data)) {
        return;
      }
      if (data.type === 'kb-room-editor:request-current') {
        const room = planRoom(floorPlan, currentRoomId);
        const templateJson = room.staircaseTemplateId === undefined ? roomTemplateFor(room) : null;
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
          view.setLockedDoors(lockedDoorsFor(floorPlan, currentRoomId, visitedRoomIds));
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
    // The two #153 toggles never reach the simulation — a reduced-motion run
    // has to step identically to a full one — so they are pushed at the
    // renderer instead, on the same change path as everything else.
    view.setAccessibility(settings);
    vignette.setPulses(!settings.reduceFlashes);
    promilleHud.sync(sim, settings.neutralReskin);
    refreshHud();
  };
  applyAccessibilityChange();

  overlay = await mountDebugOverlay(sim, view, app, uiLayer, () => layout.scale);
  exposeDebugHandle(
    loop,
    sim,
    view,
    (ms) => {
      stallMs = ms;
    },
    settings,
    (patch) => {
      Object.assign(settings, patch);
      saveSettings(settings);
      applyAccessibilityChange();
    },
    {
      open: openRunResults,
      close: closeRunResults,
      recordBossDefeat,
      resetProgress,
      unlockEverything: () => {
        unlockEverything();
        if (runResults.visible) {
          runResults.update(runResultsView());
        }
      },
      selectCharacter: (id: string) => {
        selectCharacter(id);
        if (runResults.visible) {
          runResults.update(runResultsView());
        }
      },
    },
    {
      // Getters, not a snapshot: the override and the live run's state both
      // change under this handle (`B`, a restart), and a headless check that
      // read a stale boolean would be checking the wrong run.
      get override() {
        return promilleOverride;
      },
      get unlocked() {
        return sim.promilleUnlocked;
      },
      setOverride: (override) => {
        promilleOverride = override;
        writePromilleOverride(override);
        startRun(RUN_SEED);
      },
    },
  );
  // Not gated behind `import.meta.env.DEV` like `mountDebugOverlay` above —
  // this is the player-facing half of #33, so it has to ship in a production
  // build. Moved to top-centre on touch: `touch-controls.ts` already claims
  // all four corners (move/aim sticks bottom-left/right, map/pause
  // top-left/right), so bottom-left — this panel's normal spot — would sit
  // right under the move stick.
  createAccessibilityPanel(settings, applyAccessibilityChange, {
    placement: touchCapable ? 'top-center' : 'bottom-left',
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
    /**
     * The scene graph, for `view.animator` (#150): which clip and frame each
     * body is on, without opening the overlay. The debug panel is how a person
     * reads that; this is how a headless check does — "the Kellerassel walks in
     * `npm run dev`" is only actually verified by something that can see the
     * frame index change.
     */
    view: GameView;
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
    /**
     * Meta-progression, for the same reason `stall` and
     * `setAccessibilitySettings` are here: earning an unlock is a
     * twenty-minute question to ask by playing (beat two bosses, die, look)
     * and a one-line question to ask from here, which is what makes checking
     * how one actually reads cheap enough to do on every change.
     *
     *   __kellerbier.progression.resetProgress();
     *   __kellerbier.progression.recordBossDefeat(1);
     *   __kellerbier.progression.open();
     */
    progression: ProgressionHandle;
    /**
     * The Promille gate (#85) — same reasoning as `progression` above; see
     * `PromilleHandle`.
     *
     *   __kellerbier.promille.setOverride('sober');
     */
    promille: PromilleHandle;
  };
}

/**
 * The debug handle's Promille-gate controls (#85) — the scriptable half of
 * the `B` key.
 *
 * Here for the same reason `progression` is: the honest way to reach a sober
 * run is a fresh save and not beating Der Stier, and the honest way back to a
 * promilled one from there is a twenty-minute run. Neither is a question
 * worth asking that expensively on every change to the mechanic.
 *
 *   __kellerbier.promille.setOverride('sober');
 *   __kellerbier.promille.unlocked;  // false
 */
interface PromilleHandle {
  /** The current override — `auto` follows the save's unlock. */
  readonly override: PromilleOverride;
  /** Whether the run on screen right now actually has the mechanic. */
  readonly unlocked: boolean;
  /** Pins (or releases) the state and restarts the run on the same seed. */
  setOverride: (override: PromilleOverride) => void;
}

/** The debug handle's meta-progression controls — see `DebugHost`. */
interface ProgressionHandle {
  open: () => void;
  close: () => void;
  /** Credits the boss of `floor`, exactly as beating it would. */
  recordBossDefeat: (floor: number) => void;
  /** Empties the unlocks and the statistics behind them, keeping settings and the run in progress. */
  resetProgress: () => void;
  /** Meets every unlock condition on the roster at once (#47) — its mirror. */
  unlockEverything: () => void;
  /**
   * Picks the character the next run starts as, by id. Refuses one that is
   * still locked, so a dev handle cannot start a run nobody could — pair it
   * with `unlockEverything` to try one out.
   */
  selectCharacter: (id: string) => void;
}

function exposeDebugHandle(
  loop: FixedTimestepLoop,
  sim: GameSim,
  view: GameView,
  stall: (ms: number) => void,
  settings: AccessibilitySettings,
  setAccessibilitySettings: (patch: Partial<AccessibilitySettings>) => void,
  progression: ProgressionHandle,
  promille: PromilleHandle,
): void {
  if (!import.meta.env.DEV) {
    return;
  }
  (globalThis as unknown as DebugHost).__kellerbier = {
    loop,
    sim,
    view,
    tuning: sim.tuning,
    stall,
    settings,
    setAccessibilitySettings,
    progression,
    promille,
  };
  console.warn('__kellerbier is exposed for debugging (dev build only)');
}

void boot().catch((error: unknown) => {
  console.error('Kellerbier failed to boot', error);
});
