import { Assets, Sprite, Text, type Texture } from 'pixi.js';
import massUrl from '../../assets/sprites/mass.png';
import { lerp } from '../sim/math.js';
import { TICKS_PER_SECOND } from '../sim/time.js';
import { createRenderer, trackWindowSize } from '../render/app.js';
import { INTERNAL_HEIGHT, INTERNAL_WIDTH } from '../render/resolution.js';
import { FixedTimestepLoop, runAnimationFrameLoop } from './loop.js';

const SPRITE_SIZE = 16;
const SPRITE_SCALE = 3;

/**
 * Scaffold scene. A single mug bouncing around the room, integrated at a fixed
 * 60 Hz and drawn interpolated, so the loop's behaviour is visible rather than
 * merely asserted. It is replaced wholesale by the ECS in M1.
 */
interface ScaffoldState {
  x: number;
  y: number;
  previousX: number;
  previousY: number;
  velocityX: number;
  velocityY: number;
}

function stepScaffold(state: ScaffoldState): void {
  state.previousX = state.x;
  state.previousY = state.y;
  state.x += state.velocityX;
  state.y += state.velocityY;

  const halfWidth = (SPRITE_SIZE * SPRITE_SCALE) / 2;
  if (state.x < halfWidth || state.x > INTERNAL_WIDTH - halfWidth) {
    state.velocityX = -state.velocityX;
    state.x += state.velocityX;
  }
  if (state.y < halfWidth || state.y > INTERNAL_HEIGHT - halfWidth) {
    state.velocityY = -state.velocityY;
    state.y += state.velocityY;
  }
}

async function boot(): Promise<void> {
  const host = document.getElementById('game');
  if (host === null) {
    throw new Error('Missing #game host element in index.html');
  }

  const app = await createRenderer(host);
  trackWindowSize(app.canvas);

  const texture = await Assets.load<Texture>({ src: massUrl, data: { scaleMode: 'nearest' } });

  const mug = new Sprite(texture);
  mug.scale.set(SPRITE_SCALE);
  mug.anchor.set(0.5);
  app.stage.addChild(mug);

  const hud = new Text({
    text: '',
    style: { fill: 0x8a7f74, fontFamily: 'monospace', fontSize: 12 },
  });
  hud.position.set(8, 8);
  app.stage.addChild(hud);

  const state: ScaffoldState = {
    x: INTERNAL_WIDTH / 2,
    y: INTERNAL_HEIGHT / 2,
    previousX: INTERNAL_WIDTH / 2,
    previousY: INTERNAL_HEIGHT / 2,
    velocityX: 2.7,
    velocityY: 1.7,
  };

  const loop = new FixedTimestepLoop({
    step: () => {
      stepScaffold(state);
    },
    render: (alpha) => {
      mug.position.set(
        lerp(state.previousX, state.x, alpha),
        lerp(state.previousY, state.y, alpha),
      );
    },
  });

  // Refreshing the HUD regenerates a texture, so it runs on a slow cadence
  // rather than every frame.
  const refreshHud = (): void => {
    const seconds = (loop.tick / TICKS_PER_SECOND).toFixed(2);
    const scale = loop.timeScale.toFixed(2);
    hud.text = `tick ${String(loop.tick)}  ${seconds}s  x${scale}${loop.paused ? '  PAUSED' : ''}
P pause   . step   [ ] time scale   R reset`;
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
      case 'r':
      case 'R':
        loop.reset();
        break;
      default:
        return;
    }
    refreshHud();
  });

  runAnimationFrameLoop(loop);
  window.setInterval(refreshHud, 100);
}

void boot().catch((error: unknown) => {
  console.error('Kellerbier failed to boot', error);
});
