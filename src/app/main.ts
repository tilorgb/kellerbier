import { Assets, Text, type Texture } from 'pixi.js';
import massUrl from '../../assets/sprites/mass.png';
import { GameSim } from '../sim/game/sim.js';
import { TICKS_PER_SECOND } from '../sim/time.js';
import { createRenderer, trackWindowSize } from '../render/app.js';
import { INTERNAL_HEIGHT, INTERNAL_WIDTH } from '../render/resolution.js';
import { GameView } from '../render/view.js';
import { InputSampler } from './input/sampler.js';
import { FixedTimestepLoop, runAnimationFrameLoop } from './loop.js';

async function boot(): Promise<void> {
  const host = document.getElementById('game');
  if (host === null) {
    throw new Error('Missing #game host element in index.html');
  }

  const app = await createRenderer(host);
  trackWindowSize(app.canvas);

  const playerTexture = await Assets.load<Texture>({
    src: massUrl,
    data: { scaleMode: 'nearest' },
  });

  // The run seed is fixed until seeded runs land in #48. Everything downstream
  // of it already behaves as though it were chosen, which is the point.
  const sim = new GameSim({ seed: 1 });
  const view = new GameView(sim, { player: playerTexture });
  app.stage.addChild(view.stage);

  const input = new InputSampler();
  input.keyboard.attach(window, app.canvas, INTERNAL_WIDTH, INTERNAL_HEIGHT);
  input.gamepad.attach(window);

  const hud = new Text({
    text: '',
    style: { fill: 0x8a7f74, fontFamily: 'monospace', fontSize: 12 },
  });
  hud.position.set(8, 8);
  app.stage.addChild(hud);

  const loop = new FixedTimestepLoop({
    step: () => {
      // Mouse aim is measured from the player, so the sampler is told where the
      // player is before it reads the pointer.
      const index = sim.playerIndex;
      input.setAimOrigin(sim.positionX(index), sim.positionY(index));
      sim.step(input.sample());
    },
    render: (alpha) => {
      view.sync(alpha);
    },
  });

  // Refreshing the HUD regenerates a texture, so it runs on a slow cadence
  // rather than every frame.
  const refreshHud = (): void => {
    const seconds = (loop.tick / TICKS_PER_SECOND).toFixed(2);
    const scale = loop.timeScale.toFixed(2);
    hud.text = `tick ${String(loop.tick)}  ${seconds}s  x${scale}${loop.paused ? '  PAUSED' : ''}
WASD move   P pause   . step   [ ] time scale`;
  };
  refreshHud();

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
      default:
        return;
    }
    refreshHud();
  });

  runAnimationFrameLoop(loop);
  window.setInterval(refreshHud, 100);

  exposeDebugHandle(loop, sim);
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
  };
}

function exposeDebugHandle(loop: FixedTimestepLoop, sim: GameSim): void {
  if (!import.meta.env.DEV) {
    return;
  }
  (globalThis as unknown as DebugHost).__kellerbier = { loop, sim, tuning: sim.tuning };
  console.warn('__kellerbier is exposed for debugging (dev build only)');
}

void boot().catch((error: unknown) => {
  console.error('Kellerbier failed to boot', error);
});
