import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Texture as ThreeTexture } from 'three';
import { Texture, TextureSource } from '../../src/render/gfx/index.js';
import {
  LIVE_PREVIEW_MESSAGE_TYPE,
  applyLiveArtPreview,
  isLiveArtPreviewMessage,
  type LiveArtPreviewMessage,
} from '../../src/render/live-art-preview.js';

const VALID = {
  type: LIVE_PREVIEW_MESSAGE_TYPE,
  name: 'kellerassel',
  category: 'character',
  width: 16,
  height: 16,
  pixels: 'AAAA',
};

describe('isLiveArtPreviewMessage', () => {
  it('accepts a well-formed message', () => {
    expect(isLiveArtPreviewMessage(VALID)).toBe(true);
  });

  it('rejects a message with the wrong type tag', () => {
    expect(isLiveArtPreviewMessage({ ...VALID, type: 'something-else' })).toBe(false);
  });

  it.each(['name', 'category', 'pixels'] as const)(
    'rejects a message with a non-string %s',
    (field) => {
      expect(isLiveArtPreviewMessage({ ...VALID, [field]: 42 })).toBe(false);
    },
  );

  it.each(['width', 'height'] as const)('rejects a message with a non-number %s', (field) => {
    expect(isLiveArtPreviewMessage({ ...VALID, [field]: '16' })).toBe(false);
  });

  it.each([null, undefined, 42, 'string', [], true])('rejects non-object value %s', (value) => {
    expect(isLiveArtPreviewMessage(value)).toBe(false);
  });
});

/**
 * The swap itself: the message's pixels land under the *same* GPU texture,
 * composited into its shared sheet at the target sprite's own offset, so
 * every billboard and tile already drawing with it repaints on the next
 * frame with nothing rebound. In Node there is no canvas, so a `document` and
 * an `ImageData` just wide enough for `putImageData` stand in.
 */
describe('applyLiveArtPreview', () => {
  interface FakeCanvas {
    width: number;
    height: number;
    putCalls: { x: number; y: number }[];
    drawCalls: number;
    getContext(kind: string): {
      putImageData(data: unknown, x: number, y: number): void;
      drawImage(): void;
    } | null;
  }
  let created: FakeCanvas[] = [];
  const globals = globalThis as { document?: unknown; ImageData?: unknown };
  let previous: { document: unknown; ImageData: unknown; had: [boolean, boolean] };

  beforeAll(() => {
    previous = {
      document: globals.document,
      ImageData: globals.ImageData,
      had: ['document' in globals, 'ImageData' in globals],
    };
    globals.document = {
      createElement: (): FakeCanvas => {
        const canvas: FakeCanvas = {
          width: 0,
          height: 0,
          putCalls: [],
          drawCalls: 0,
          getContext: () => ({
            putImageData: (_data: unknown, x: number, y: number) => {
              canvas.putCalls.push({ x, y });
            },
            drawImage: () => {
              canvas.drawCalls += 1;
            },
          }),
        };
        created.push(canvas);
        return canvas;
      },
    };
    globals.ImageData = class {
      constructor(
        readonly data: Uint8ClampedArray,
        readonly width: number,
        readonly height: number,
      ) {}
    };
  });

  afterAll(() => {
    for (const [key, had, value] of [
      ['document', previous.had[0], previous.document],
      ['ImageData', previous.had[1], previous.ImageData],
    ] as const) {
      if (had) {
        globals[key] = value;
      } else {
        Reflect.deleteProperty(globals, key);
      }
    }
  });

  function message(width = 2, height = 2): LiveArtPreviewMessage {
    const bytes = new Uint8Array(width * height * 4).fill(255);
    return {
      type: LIVE_PREVIEW_MESSAGE_TYPE,
      name: 'crate-opa',
      category: 'tile',
      width,
      height,
      pixels: Buffer.from(bytes).toString('base64'),
    };
  }

  it("paints the pixels into the texture's image and marks the source for re-upload", () => {
    created = [];
    const texture = new Texture(new TextureSource(new ThreeTexture(), 2, 2));
    const versionBefore = texture.source.texture.version;

    expect(applyLiveArtPreview({ 'crate-opa': texture }, message())).toBe(true);

    // The same three.js texture object, now backed by the canvas that was painted.
    const [canvas] = created;
    expect(canvas).toBeDefined();
    expect(canvas?.putCalls).toEqual([{ x: 0, y: 0 }]);
    expect(canvas?.width).toBe(2);
    expect(texture.source.texture.image).toBe(canvas);
    expect(texture.source.texture.version).toBeGreaterThan(versionBefore);
  });

  it('reports a sprite with no live target as not applied', () => {
    const texture = new Texture(new TextureSource(new ThreeTexture(), 2, 2));
    expect(applyLiveArtPreview({ 'something-else': texture }, message())).toBe(false);
  });

  it("paints a sub-rectangle view into its shared sheet at the view's own offset", () => {
    // Every sprite is a `.sub()` view over a shared per-bucket atlas sheet
    // now (#294) — the composite has to land at the target's own offset in
    // that sheet, not at (0, 0), or it would overwrite whatever else the
    // sheet happens to have packed there.
    created = [];
    const sheet = new Texture(new TextureSource(new ThreeTexture(), 8, 4));
    const view = sheet.sub(2, 1, 2, 2);

    expect(applyLiveArtPreview({ 'crate-opa': view }, message())).toBe(true);

    const [canvas] = created;
    expect(canvas).toBeDefined();
    // Promoted to a full-sheet canvas, not one sized to just the view.
    expect(canvas?.width).toBe(8);
    expect(canvas?.putCalls).toEqual([{ x: 2, y: 1 }]);
  });

  it('reuses the same composited canvas across repeated edits of the same sheet', () => {
    created = [];
    const sheet = new Texture(new TextureSource(new ThreeTexture(), 8, 4));
    const view = sheet.sub(0, 0, 2, 2);

    expect(applyLiveArtPreview({ 'crate-opa': view }, message())).toBe(true);
    expect(applyLiveArtPreview({ 'crate-opa': view }, message())).toBe(true);

    expect(created).toHaveLength(1);
    expect(created[0]?.putCalls).toHaveLength(2);
  });

  it("rejects a message whose size does not match the target's own footprint", () => {
    // An animation frame's footprint is one frame of the strip, not the
    // whole strip — a message sized for the whole strip is not this sprite.
    const strip = new Texture(new TextureSource(new ThreeTexture(), 8, 2));
    const frame = strip.sub(2, 0, 2, 2);
    const versionBefore = strip.source.texture.version;
    expect(applyLiveArtPreview({ 'crate-opa': frame }, message(8, 2))).toBe(false);
    expect(strip.source.texture.version).toBe(versionBefore);
  });
});
