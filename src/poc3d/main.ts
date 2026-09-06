import { ENEMY_DEFINITIONS } from '../content/enemies/index.js';
import { ROOM_TEMPLATES } from '../content/rooms/index.js';
import { GameSim } from '../sim/game/sim.js';
import { validateRoomTemplate } from '../sim/room/template.js';
import { INTERNAL_HEIGHT, INTERNAL_WIDTH } from '../render/resolution.js';
import { InputSampler } from '../app/input/sampler.js';
import { FixedTimestepLoop, runAnimationFrameLoop } from '../app/loop.js';
import { loadSpriteSheets } from './art.js';
import { CAMERA_PRESETS, Dungeon } from './dungeon.js';

/**
 * Kellerbier in a 3D dungeon — a proof of concept (`/poc-3d.html` under
 * `npm run dev`).
 *
 * Same simulation, same input, same fixed-timestep loop as `app/main.ts`,
 * with `render/`'s Pixi scene swapped for `poc3d/dungeon.ts`'s three.js one.
 * Nothing in `sim/` knows, which is the point: the question this POC answers
 * is whether the 2D game can be *presented* in 3D — walls with height,
 * real lights, shadows, a thrown Maß that arcs — while still playing as the
 * same fixed-camera room-by-room bullet hell.
 *
 * Scope: floor 1's hand-authored `1x1` combat rooms, walking from one to the
 * next through any door. No floor plan, minimap, HUD, items or audio — those
 * are all `app/main.ts`'s and would come across unchanged if this direction
 * were taken.
 */

const FLOOR = 1;

/** Floor 1's single-screen combat rooms: what the door loop cycles through. */
const ROOM_POOL = ROOM_TEMPLATES.map((room, index) =>
  validateRoomTemplate(room, `room[${String(index)}]`, ENEMY_DEFINITIONS),
).filter(
  (template) =>
    template.metadata.shape === '1x1' &&
    template.metadata.floorTags.includes('cellar') &&
    template.metadata.keyLocked !== true &&
    'enemySpawns' in template &&
    template.enemySpawns.length > 0 &&
    !/boss|shop/.test(template.id),
);

function seedFromLocation(): number {
  const raw = new URLSearchParams(window.location.search).get('seed');
  const parsed = raw === null ? NaN : Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : 7;
}

function byId(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (element === null) {
    throw new Error(`#${id} missing from poc-3d.html`);
  }
  return element;
}

async function boot(): Promise<void> {
  const canvas = byId('scene') as HTMLCanvasElement;
  const status = byId('status');
  const help = byId('help');
  status.textContent = 'loading sprites…';

  const sheets = await loadSpriteSheets();

  const seed = seedFromLocation();
  const first = ROOM_POOL[seed % ROOM_POOL.length];
  if (first === undefined) {
    throw new Error('no floor-1 1x1 combat rooms to load');
  }
  let roomCursor = seed % ROOM_POOL.length;
  const sim = new GameSim({ seed, roomTemplate: first, floor: FLOOR });

  const dungeon = new Dungeon(canvas, sim, sheets);
  status.textContent = '';

  let hiRes = false;
  const fitCanvas = (): void => {
    const width = hiRes ? Math.floor(window.innerWidth * window.devicePixelRatio) : INTERNAL_WIDTH;
    const height = hiRes ? Math.floor((width * INTERNAL_HEIGHT) / INTERNAL_WIDTH) : INTERNAL_HEIGHT;
    dungeon.setResolution(width, height);
    // Integer upscale so the pixel art stays crisp, letterboxed to the window.
    const scale = hiRes
      ? 1 / window.devicePixelRatio
      : Math.max(1, Math.floor(Math.min(window.innerWidth / width, window.innerHeight / height)));
    canvas.style.width = `${String(Math.floor(width * scale))}px`;
    canvas.style.height = `${String(Math.floor(height * scale))}px`;
  };
  fitCanvas();
  window.addEventListener('resize', fitCanvas);

  const input = new InputSampler();
  input.keyboard.attach(window);
  input.gamepad.attach(window);

  let transitions = 0;
  let presetIndex = 0;
  const loop = new FixedTimestepLoop({
    step: () => {
      sim.step(input.sample());
      // The door loop `app/main.ts`'s floor plan would otherwise drive: walk
      // into any open door and the next combat room is on the other side.
      const door = sim.doorContact;
      if (door !== null) {
        roomCursor = (roomCursor + 1) % ROOM_POOL.length;
        const next = ROOM_POOL[roomCursor];
        if (next !== undefined && sim.transitionTo(next, FLOOR, door.direction)) {
          transitions += 1;
        }
      }
    },
    render: (alpha) => {
      dungeon.sync(alpha, performance.now());
    },
  });

  let frames = 0;
  let fpsWindowStart = performance.now();
  let fps = 0;
  const hud = (): void => {
    frames += 1;
    const now = performance.now();
    if (now - fpsWindowStart >= 500) {
      fps = Math.round((frames * 1000) / (now - fpsWindowStart));
      frames = 0;
      fpsWindowStart = now;
    }
    const hearts = '♥'.repeat(Math.max(0, Math.ceil(sim.playerHealth / 2)));
    status.textContent =
      `${hearts.length > 0 ? hearts : '☠'}  ·  room ${sim.roomId}` +
      `${sim.doorsLocked ? ' (doors locked)' : ''}  ·  ${String(sim.liveEnemyCount)} enemies` +
      `  ·  cam ${dungeon.presetId}  ·  ${hiRes ? 'hi-res' : '640×360'}  ·  ${String(fps)} fps` +
      `  ·  ${String(transitions)} doors`;
    requestAnimationFrame(hud);
  };
  requestAnimationFrame(hud);

  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyV') {
      presetIndex = (presetIndex + 1) % CAMERA_PRESETS.length;
      dungeon.setPreset(CAMERA_PRESETS[presetIndex] ?? 'perspective');
    } else if (event.code === 'KeyR') {
      hiRes = !hiRes;
      fitCanvas();
    } else if (event.code === 'KeyH') {
      help.hidden = !help.hidden;
    } else if (event.code === 'KeyP') {
      loop.paused = !loop.paused;
    }
  });

  runAnimationFrameLoop(loop);

  // For scripting and screenshots, the same shape `app/main.ts` exposes as `__kellerbier`.
  (window as unknown as { __poc3d: unknown }).__poc3d = { sim, dungeon, loop, rooms: ROOM_POOL };
}

boot().catch((error: unknown) => {
  byId('status').textContent =
    `failed to boot: ${error instanceof Error ? error.message : String(error)}`;
  console.error(error);
});
