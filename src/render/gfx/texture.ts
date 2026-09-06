import {
  DataTexture,
  LinearSRGBColorSpace,
  NearestFilter,
  RGBAFormat,
  SRGBColorSpace,
  Texture as ThreeTexture,
  TextureLoader,
  UnsignedByteType,
} from 'three';

/**
 * The 2D texture vocabulary the UI is written in: a `Texture` is a
 * rectangular *frame* of a `TextureSource`, so a strip's frames or an atlas's
 * cells are cheap views over one GPU upload rather than uploads of their own.
 *
 * Every source is nearest-filtered, mip-less and flipped the same way, so a
 * quad's UVs can be derived from `frame` alone without knowing where the
 * pixels came from — a PNG, a `<canvas>`, or a `Int32Array` of palette
 * colours built in Node with no DOM at all (`textureFromPixels`), which is
 * what lets the pixel fonts and the UI kit exist in a headless test.
 */
export class Rectangle {
  constructor(
    public x = 0,
    public y = 0,
    public width = 0,
    public height = 0,
  ) {}

  contains(x: number, y: number): boolean {
    return x >= this.x && y >= this.y && x < this.x + this.width && y < this.y + this.height;
  }

  clone(): Rectangle {
    return new Rectangle(this.x, this.y, this.width, this.height);
  }
}

export class TextureSource {
  readonly texture: ThreeTexture;
  width: number;
  height: number;

  constructor(texture: ThreeTexture, width: number, height: number) {
    this.texture = texture;
    this.width = width;
    this.height = height;
    pixelate(texture);
  }

  /** Re-upload after the underlying image or canvas changed in place. */
  update(): void {
    this.texture.needsUpdate = true;
  }

  destroy(): void {
    this.texture.dispose();
  }
}

export class Texture {
  readonly source: TextureSource;
  readonly frame: Rectangle;

  constructor(source: TextureSource, frame?: Rectangle) {
    this.source = source;
    this.frame = frame ?? new Rectangle(0, 0, source.width, source.height);
  }

  get width(): number {
    return this.frame.width;
  }

  get height(): number {
    return this.frame.height;
  }

  /** `[u0, v0, u1, v1]` with `v0` the *top* edge — sources are uploaded top row first. */
  uvs(): [number, number, number, number] {
    const { width, height } = this.source;
    if (width === 0 || height === 0) {
      return [0, 1, 1, 0];
    }
    const u0 = this.frame.x / width;
    const u1 = (this.frame.x + this.frame.width) / width;
    const v0 = 1 - this.frame.y / height;
    const v1 = 1 - (this.frame.y + this.frame.height) / height;
    return [u0, v0, u1, v1];
  }

  /** A sub-rectangle of the same source. */
  sub(x: number, y: number, width: number, height: number): Texture {
    return new Texture(
      this.source,
      new Rectangle(this.frame.x + x, this.frame.y + y, width, height),
    );
  }

  destroy(destroySource = false): void {
    if (destroySource) {
      this.source.destroy();
    }
  }

  /** A 1×1 transparent texture — what an unset sprite draws. */
  static get EMPTY(): Texture {
    return (EMPTY ??= textureFromPixels(1, 1, new Int32Array([-1])));
  }

  /** A 1×1 opaque white texture — tint it to get any flat colour. */
  static get WHITE(): Texture {
    return (WHITE ??= textureFromPixels(1, 1, new Int32Array([0xffffff])));
  }
}

let EMPTY: Texture | undefined;
let WHITE: Texture | undefined;

function pixelate(texture: ThreeTexture): void {
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.flipY = true;
  texture.premultiplyAlpha = false;
}

/**
 * A texture from palette colours, `-1` for a transparent pixel — the format
 * `render/ui/title.ts`'s `renderTitlePixels` and `render/ui/text.ts`'s
 * seasoned text already produce. Built straight into a `DataTexture`, so it
 * needs no canvas and works in Node.
 */
export function textureFromPixels(width: number, height: number, colours: Int32Array): Texture {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const colour = colours[y * w + x] ?? -1;
      const at = (y * w + x) * 4;
      if (colour < 0) {
        continue;
      }
      data[at] = (colour >> 16) & 0xff;
      data[at + 1] = (colour >> 8) & 0xff;
      data[at + 2] = colour & 0xff;
      data[at + 3] = 255;
    }
  }
  const texture = new DataTexture(data, w, h, RGBAFormat, UnsignedByteType);
  // Palette values are authored as sRGB hex, same as every other colour here.
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return new Texture(new TextureSource(texture, w, h));
}

/** A texture over RGBA bytes laid out top row first, e.g. a decoded PNG or an `ImageData`. */
export function textureFromRgba(
  width: number,
  height: number,
  rgba: Uint8Array | Uint8ClampedArray,
): Texture {
  const texture = new DataTexture(
    rgba instanceof Uint8Array
      ? rgba
      : new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.byteLength),
    width,
    height,
    RGBAFormat,
    UnsignedByteType,
  );
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return new Texture(new TextureSource(texture, width, height));
}

/**
 * A texture over an image-like object — a decoded `HTMLImageElement`,
 * `ImageBitmap` or a `<canvas>` something drew into. Pass `linear: true` for
 * data that is not colour (a gradient used as a mask) so it is not decoded.
 */
export function textureFromImage(
  image: { readonly width: number; readonly height: number },
  linear = false,
): Texture {
  const texture = new ThreeTexture(image as never);
  texture.colorSpace = linear ? LinearSRGBColorSpace : SRGBColorSpace;
  texture.needsUpdate = true;
  return new Texture(new TextureSource(texture, image.width, image.height));
}

const loader = new TextureLoader();

/** Loads a PNG by URL. Browser only — the tests build their textures from pixels instead. */
export async function loadTexture(url: string): Promise<Texture> {
  const texture = await loader.loadAsync(url);
  texture.colorSpace = SRGBColorSpace;
  const image = texture.image as { width: number; height: number };
  return new Texture(new TextureSource(texture, image.width, image.height));
}
