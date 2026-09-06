import { NearestFilter, SRGBColorSpace, type Texture, TextureLoader } from 'three';
import {
  compileAnimationSet,
  type AnimationSidecar,
  type CompiledAnimationSet,
} from '../render/animation/definition.js';

/**
 * One authored sprite as the 3D POC draws it: the whole PNG as a single
 * three.js texture, plus the frame grid a strip is cut into. A static sprite
 * is a one-frame sheet with no clips — same shape, so a billboard slot
 * (`dungeon.ts`) does not have to care which it is holding.
 *
 * Frames are selected by *UV*, never by cutting textures: the same
 * `Texture` is shared by every billboard drawing that creature, and a slot
 * moves its quad's UVs to the frame it wants. That is what keeps a room full
 * of Kellerasseln at one texture bind rather than one per frame.
 */
export interface SpriteSheet {
  readonly name: string;
  readonly texture: Texture;
  readonly frames: number;
  /** One frame's size in authored pixels — what `docs/DECISIONS.md` #45 makes its size on screen. */
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly clips: CompiledAnimationSet | null;
}

/**
 * The same `import.meta.glob` discovery `render/floor-art.ts` and
 * `render/player-art.ts` use, minus Pixi: the POC reads the PNGs straight
 * into three.js textures, so it does not have to boot a second renderer to
 * borrow the first one's loader.
 */
const STATIC_URLS: Record<string, string> = import.meta.glob(
  ['../../assets/sprites/**/*.png', '!../../assets/sprites/**/*.strip.png'],
  { eager: true, query: '?url', import: 'default' },
);

const STRIP_URLS: Record<string, string> = import.meta.glob('../../assets/sprites/**/*.strip.png', {
  eager: true,
  query: '?url',
  import: 'default',
});

const SIDECARS: Record<string, AnimationSidecar> = import.meta.glob(
  '../../assets/sprites/**/*.anim.json',
  { eager: true, import: 'default' },
);

const NAME_PATTERN = /\/([a-z0-9-]+?)(\.strip)?\.png$/;

function nameOf(path: string): string | null {
  return NAME_PATTERN.exec(path)?.[1] ?? null;
}

function pixelTexture(texture: Texture): Texture {
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = SRGBColorSpace;
  // The default flips the image so v=0 is the bottom row, the way every
  // three.js geometry's UVs expect. Kept — `dungeon.ts` writes its own frame
  // UVs against that convention.
  texture.needsUpdate = true;
  return texture;
}

/** Every sprite under `assets/sprites/`, keyed by name, loaded as three.js textures. */
export async function loadSpriteSheets(): Promise<Readonly<Record<string, SpriteSheet>>> {
  const loader = new TextureLoader();
  const sheets: Record<string, SpriteSheet> = {};

  const statics = Object.entries(STATIC_URLS).map(async ([path, url]) => {
    const name = nameOf(path);
    if (name === null) {
      return;
    }
    const texture = pixelTexture(await loader.loadAsync(url));
    const image = texture.image as { width: number; height: number };
    sheets[name] = {
      name,
      texture,
      frames: 1,
      frameWidth: image.width,
      frameHeight: image.height,
      clips: null,
    };
  });

  const strips = Object.entries(STRIP_URLS).map(async ([path, url]) => {
    const name = nameOf(path);
    if (name === null) {
      return;
    }
    const sidecar = SIDECARS[path.replace('.strip.png', '.anim.json')];
    if (sidecar === undefined) {
      throw new Error(`${name}.strip.png has no ${name}.anim.json sidecar`);
    }
    const texture = pixelTexture(await loader.loadAsync(url));
    const image = texture.image as { width: number; height: number };
    const frames = sidecar.frames;
    // The Schlauch's sidecar authors no clips at all (`render/player-art.ts`):
    // it is a frame table indexed by aim octant, not a timeline. Everything
    // else compiles through the very same validator the Pixi renderer uses.
    const clips = sidecar.clips === undefined ? null : compileAnimationSet(name, sidecar, frames);
    sheets[name] = {
      name,
      texture,
      frames,
      frameWidth: image.width / frames,
      frameHeight: image.height,
      clips,
    };
  });

  await Promise.all([...statics, ...strips]);
  return sheets;
}
