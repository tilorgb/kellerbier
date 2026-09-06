import {
  BufferAttribute,
  BufferGeometry,
  Mesh,
  type MeshBasicMaterial,
  type Object3D,
} from 'three';
import { Container, ObservablePoint } from './container.js';
import { flatMaterial } from './sprite.js';
import { Rectangle, type Texture } from './texture.js';

/**
 * Bitmap text: every glyph a quad into one atlas texture, one mesh per label.
 *
 * Fonts are registered by family (`registerBitmapFont`) and a label names the
 * family in its style, the way the HUD always has. There is no fallback to a
 * browser face — a family nobody registered throws, because a system-font HUD
 * is exactly the failure #154 removed and it should never be silent.
 */
export interface BitmapGlyph {
  readonly texture: Texture;
  /** Row of the line box the glyph's top pixel row sits on. */
  readonly yOffset: number;
  readonly xAdvance: number;
}

export interface BitmapFont {
  readonly family: string;
  /** The line box height — what `fontSize` means for this face. */
  readonly cellHeight: number;
  /** Default distance between lines of a wrapped paragraph. */
  readonly lineAdvance: number;
  readonly letterSpacing: number;
  readonly glyphs: ReadonlyMap<string, BitmapGlyph>;
  readonly atlas: Texture;
  /** What an unknown character draws as; `undefined` skips it. */
  readonly fallback?: string;
}

const FONTS = new Map<string, BitmapFont>();

export function registerBitmapFont(font: BitmapFont): void {
  FONTS.set(font.family, font);
}

export function bitmapFontInstalled(family: string): boolean {
  return FONTS.has(family);
}

export function installedBitmapFontCount(): number {
  return FONTS.size;
}

export interface BitmapTextStyleOptions {
  fontFamily: string;
  fontSize?: number;
  fill?: number;
  align?: 'left' | 'center' | 'right';
  wordWrap?: boolean;
  wordWrapWidth?: number;
  lineHeight?: number;
}

/** The style object a label exposes: `label.style.fill = colour` recolours it. */
export class BitmapTextStyle {
  readonly fontFamily: string;
  readonly fontSize: number | undefined;
  align: 'left' | 'center' | 'right';
  wordWrap: boolean;
  wordWrapWidth: number;
  lineHeight: number | undefined;
  private fillValue: number;

  constructor(
    options: BitmapTextStyleOptions,
    private readonly onChange: () => void,
  ) {
    this.fontFamily = options.fontFamily;
    this.fontSize = options.fontSize;
    this.fillValue = options.fill ?? 0xffffff;
    this.align = options.align ?? 'left';
    this.wordWrap = options.wordWrap ?? false;
    this.wordWrapWidth = options.wordWrapWidth ?? 0;
    this.lineHeight = options.lineHeight;
  }

  get fill(): number {
    return this.fillValue;
  }

  set fill(value: number) {
    this.fillValue = value;
    this.onChange();
  }
}

interface LaidOutGlyph {
  readonly glyph: BitmapGlyph;
  readonly x: number;
  readonly y: number;
}

export class BitmapText extends Container {
  readonly anchor: ObservablePoint;
  readonly style: BitmapTextStyle;

  private textValue: string;
  private readonly font: BitmapFont;
  private readonly geometry = new BufferGeometry();
  private readonly material: MeshBasicMaterial;
  private readonly mesh: Mesh;
  private tintValue = 0xffffff;
  private measured = new Rectangle();
  private dirty = true;

  constructor(options: { text: string; style: BitmapTextStyleOptions }) {
    super();
    const font = FONTS.get(options.style.fontFamily);
    if (font === undefined) {
      throw new Error(
        `bitmap text: no font registered as "${options.style.fontFamily}" — install the pixel fonts at boot`,
      );
    }
    this.font = font;
    this.textValue = options.text;
    this.style = new BitmapTextStyle(options.style, () => {
      this.material.color.setHex(this.style.fill);
    });
    this.material = flatMaterial(font.atlas);
    this.material.color.setHex(this.style.fill);
    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.anchor = new ObservablePoint(() => {
      this.dirty = true;
    });
    this.rebuild();
    this.attachOwnObject();
  }

  protected override ownObjects(): Object3D[] {
    return [this.mesh];
  }

  get text(): string {
    return this.textValue;
  }

  set text(value: string) {
    if (value === this.textValue) {
      return;
    }
    this.textValue = value;
    this.dirty = true;
  }

  /** A multiply over the fill — the menu greys a disabled row this way. */
  get tint(): number {
    return this.tintValue;
  }

  set tint(value: number) {
    this.tintValue = value;
    // Fill and tint are both multiplies over white glyphs; combine them.
    const r = (((this.style.fill >> 16) & 0xff) * ((value >> 16) & 0xff)) / 255;
    const g = (((this.style.fill >> 8) & 0xff) * ((value >> 8) & 0xff)) / 255;
    const b = ((this.style.fill & 0xff) * (value & 0xff)) / 255;
    this.material.color.setRGB(r / 255, g / 255, b / 255);
  }

  override get width(): number {
    this.rebuildIfDirty();
    return this.measured.width * Math.abs(this.scale.x);
  }

  override get height(): number {
    this.rebuildIfDirty();
    return this.measured.height * Math.abs(this.scale.y);
  }

  protected override ownBounds(): Rectangle {
    this.rebuildIfDirty();
    return this.measured.clone();
  }

  /** @internal The layer calls this before drawing. */
  override prepare(parentAlpha: number): void {
    this.rebuildIfDirty();
    super.prepare(parentAlpha);
  }

  protected override applyAlpha(effective: number): void {
    this.material.opacity = effective;
  }

  private rebuildIfDirty(): void {
    if (this.dirty) {
      this.rebuild();
    }
  }

  /** Splits `text` into lines, wrapping at spaces when `wordWrap` is on. */
  private lines(): string[] {
    const paragraphs = this.textValue.split('\n');
    if (!this.style.wordWrap || this.style.wordWrapWidth <= 0) {
      return paragraphs;
    }
    const out: string[] = [];
    for (const paragraph of paragraphs) {
      let line = '';
      for (const word of paragraph.split(' ')) {
        const candidate = line === '' ? word : `${line} ${word}`;
        if (line !== '' && this.measure(candidate) > this.style.wordWrapWidth) {
          out.push(line);
          line = word;
        } else {
          line = candidate;
        }
      }
      out.push(line);
    }
    return out;
  }

  private measure(text: string): number {
    let width = 0;
    for (const character of text) {
      const glyph = this.glyphFor(character);
      if (glyph !== undefined) {
        width += glyph.xAdvance;
      }
    }
    return Math.max(0, width - this.font.letterSpacing);
  }

  private glyphFor(character: string): BitmapGlyph | undefined {
    return (
      this.font.glyphs.get(character) ??
      (this.font.fallback === undefined ? undefined : this.font.glyphs.get(this.font.fallback))
    );
  }

  private rebuild(): void {
    this.dirty = false;
    const lines = this.lines();
    const lineHeight = this.style.lineHeight ?? this.font.cellHeight;
    const placed: LaidOutGlyph[] = [];
    let widest = 0;
    const widths = lines.map((line) => this.measure(line));
    for (const width of widths) {
      widest = Math.max(widest, width);
    }
    lines.forEach((line, row) => {
      const width = widths[row] ?? 0;
      let pen =
        this.style.align === 'center'
          ? Math.floor((widest - width) / 2)
          : this.style.align === 'right'
            ? widest - width
            : 0;
      const top = row * lineHeight;
      for (const character of line) {
        const glyph = this.glyphFor(character);
        if (glyph === undefined) {
          continue;
        }
        if (glyph.texture.width > 0 && glyph.texture.height > 0) {
          placed.push({ glyph, x: pen, y: top + glyph.yOffset });
        }
        pen += glyph.xAdvance;
      }
    });
    const totalHeight =
      lines.length === 0 ? 0 : (lines.length - 1) * lineHeight + this.font.cellHeight;
    const offsetX = -this.anchor.x * widest;
    const offsetY = -this.anchor.y * totalHeight;
    this.measured = new Rectangle(offsetX, offsetY, widest, totalHeight);

    const positions = new Float32Array(placed.length * 12);
    const uvs = new Float32Array(placed.length * 8);
    const index = new Uint32Array(placed.length * 6);
    placed.forEach((entry, i) => {
      const x0 = entry.x + offsetX;
      const y0 = entry.y + offsetY;
      const x1 = x0 + entry.glyph.texture.width;
      const y1 = y0 + entry.glyph.texture.height;
      positions.set([x0, y0, 0, x1, y0, 0, x0, y1, 0, x1, y1, 0], i * 12);
      const [u0, v0, u1, v1] = entry.glyph.texture.uvs();
      uvs.set([u0, v0, u1, v0, u0, v1, u1, v1], i * 8);
      const base = i * 4;
      index.set([base, base + 2, base + 1, base + 1, base + 2, base + 3], i * 6);
    });
    this.geometry.setAttribute('position', new BufferAttribute(positions, 3));
    this.geometry.setAttribute('uv', new BufferAttribute(uvs, 2));
    this.geometry.setIndex(new BufferAttribute(index, 1));
  }

  protected override disposeOwn(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
