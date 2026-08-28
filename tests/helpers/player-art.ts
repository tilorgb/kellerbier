import { Rectangle, Texture, TextureSource } from 'pixi.js';
import {
  compileAnimationSet,
  type AnimationSidecar,
} from '../../src/render/animation/definition.js';
import { PLAYER_BODY_KEYS, SCHLAUCH_OCTANTS, type PlayerArt } from '../../src/render/player-art.js';
import type { LoadedStrip } from '../../src/render/floor-art.js';

/**
 * A `PlayerArt` with no pixels behind it.
 *
 * `loadPlayerArt` needs a browser (`import.meta.glob`, `Assets.load`), and
 * everything worth testing about `PlayerView` — which strip a facing picks,
 * which frame a clip is on, where the Schlauch lands — is decided by the
 * *clips* and the frame count, not by what the frames look like. So the shapes
 * are real (the same clip names, the same frame counts the committed sidecars
 * author) and the textures are empty.
 *
 * The frame *sizes* are real too, because `PlayerView` derives its pixel scale
 * from the body texture's height: an empty texture would make Alois render at
 * an infinite scale, which is a bug worth not having in a test fixture.
 */
export function stubPlayerArt(): PlayerArt {
  const body = Object.fromEntries(
    PLAYER_BODY_KEYS.map((key) => [key, stubStrip(key, key.startsWith('drunk') ? DRUNK : SOBER)]),
  ) as PlayerArt['body'];
  return { body, schlauch: stubStrip('alois-schlauch', SCHLAUCH, 16, 16) };
}

const SOBER: AnimationSidecar = {
  frames: 8,
  frameDurationMs: 120,
  loop: true,
  clips: {
    idle: { frames: [0, 1], frameDurationMs: [620, 300], mode: 'loop' },
    move: { frames: [0, 2, 0, 3], frameDurationMs: 110, mode: 'loop' },
    hurt: { frames: [4], frameDurationMs: 150, mode: 'once', onEnd: 'idle' },
    death: { frames: [5, 6, 7], frameDurationMs: [120, 140, 200], mode: 'once', onEnd: 'hold' },
  },
};

const DRUNK: AnimationSidecar = {
  frames: 4,
  frameDurationMs: 150,
  loop: true,
  clips: {
    idle: { frames: [0, 1], frameDurationMs: [700, 640], mode: 'loop' },
    move: { frames: [0, 2, 1, 3], frameDurationMs: 150, mode: 'loop' },
  },
};

const SCHLAUCH: AnimationSidecar = {
  frames: SCHLAUCH_OCTANTS * 2,
  frameDurationMs: 120,
  loop: true,
};

function stubStrip(name: string, sidecar: AnimationSidecar, width = 16, height = 28): LoadedStrip {
  const source = new TextureSource({ width: width * sidecar.frames, height });
  const frames = Array.from(
    { length: sidecar.frames },
    (_unused, index) =>
      new Texture({ source, frame: new Rectangle(index * width, 0, width, height) }),
  );
  return { frames, clips: compileAnimationSet(name, sidecar, sidecar.frames) };
}
