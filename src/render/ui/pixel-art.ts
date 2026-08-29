/**
 * Screen-space pixel art, authored in this file's own format rather than
 * packed into a floor atlas.
 *
 * `docs/DECISIONS.md` #43 is why UI art lives in `src/render/ui/` as source
 * instead of in `assets/sprites/`: the atlas pipeline's whole contract — 16×16
 * tiles, a per-floor palette, sprites drawn in the world at `WORLD_ZOOM` — is
 * about art that lives *in a room on a floor*. A heart, a Biermarke and a
 * panel corner live on the screen, at the UI's own integer scale, on every
 * floor at once. Holding them to a floor's five colours would be asking the
 * wrong question.
 *
 * ## Roles, not colours
 *
 * A row is a string, one character per pixel, and each character names a
 * **role** rather than a colour:
 *
 * | Char | Role | Typically |
 * |---|---|---|
 * | `.` | nothing | transparent |
 * | `o` | `outline` | the near-black every shape is drawn against |
 * | `f` | `fill` | the body of the shape |
 * | `h` | `highlight` | the lit edge |
 * | `a` | `accent` | the one colour that says *which* thing this is |
 *
 * One mug bitmap therefore draws red Maß, white Weißbier and dark Schwarzbier
 * — `HealthHud` already tinted a single generated mug three ways, and roles
 * keep that possible now that the mug has more than one colour in it. A tint
 * could not: a multiply only ever darkens, which is `placeholder-art.ts`'s own
 * note on why a hit flash swaps textures instead of tinting one.
 */
import { Graphics, Rectangle, type Renderer, type Texture } from 'pixi.js';

/** The colour roles a piece of UI art is drawn in. */
export interface ArtRoles {
  readonly outline: number;
  readonly fill: number;
  readonly highlight: number;
  readonly accent: number;
}

/** Rows of role characters. Every row must be the same length. */
export type PixelArt = readonly string[];

const ROLE_CHARS = 'ofha';

/** Width of `art` in pixels — its longest row, though every row should already match. */
export function artWidth(art: PixelArt): number {
  let width = 0;
  for (const row of art) {
    width = Math.max(width, row.length);
  }
  return width;
}

/** Height of `art` in pixels. */
export function artHeight(art: PixelArt): number {
  return art.length;
}

function colourFor(role: string, roles: ArtRoles): number | undefined {
  switch (role) {
    case 'o':
      return roles.outline;
    case 'f':
      return roles.fill;
    case 'h':
      return roles.highlight;
    case 'a':
      return roles.accent;
    default:
      return undefined;
  }
}

/**
 * Draws `art` into `graphics` at `(x, y)`.
 *
 * One `rect` per horizontal run of the same role rather than one per pixel:
 * a 12-wide mug is a handful of rectangles instead of 144, which matters
 * because these are built once at boot into a texture and a `Graphics` with
 * ten thousand commands is slow to build even once.
 */
export function drawPixelArt(
  graphics: Graphics,
  art: PixelArt,
  roles: ArtRoles,
  x = 0,
  y = 0,
): void {
  for (const role of ROLE_CHARS) {
    const colour = colourFor(role, roles);
    if (colour === undefined) {
      continue;
    }
    let drew = false;
    for (let row = 0; row < art.length; row++) {
      const line = art[row] ?? '';
      let run = 0;
      for (let column = 0; column <= line.length; column++) {
        if (line[column] === role) {
          run += 1;
          continue;
        }
        if (run > 0) {
          graphics.rect(x + column - run, y + row, run, 1);
          drew = true;
          run = 0;
        }
      }
    }
    if (drew) {
      graphics.fill({ color: colour });
    }
  }
}

/** `art` as its own texture, sized exactly to the bitmap. */
export function pixelArtTexture(renderer: Renderer, art: PixelArt, roles: ArtRoles): Texture {
  const graphics = new Graphics();
  drawPixelArt(graphics, art, roles);
  const texture = renderer.generateTexture({
    target: graphics,
    resolution: 1,
    frame: new Rectangle(0, 0, artWidth(art), artHeight(art)),
  });
  graphics.destroy();
  return texture;
}
