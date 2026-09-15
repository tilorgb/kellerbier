import { createServer } from 'vite';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

/**
 * The postcard sign-off sheet:
 *
 *   node tools/art/postcard-specimens.mjs
 *
 * `CLAUDE.md` asks for new UI art to be *shown* before it is committed, and
 * for a card that is drawn as pixels there is no browser needed to do it: the
 * same pure functions the game uploads as a texture (`ui/postcard-paper.ts`'s
 * `renderPostcardPixels`, `ui/title.ts`'s `renderTitlePixels`, the compiled
 * pixel faces) render straight into a PNG here. So this sheet is the card the
 * player sees, not an impression of it.
 *
 * Three scenes, each at the game's own 640×360 internal frame and then
 * nearest-neighbour upscaled so a 21-pixel stamp is legible in a chat message:
 * the opening story beat over a dimmed room, a boss reveal over a live one,
 * and the title screen. Each mirrors what its real caller
 * (`render/story-card.ts`, `render/boss-intro-plate.ts`,
 * `render/title-screen.ts`) does with the card, so a layout change there is
 * meant to be copied here rather than guessed at.
 *
 * Output lands in `tools/art/authoring/preview/` (gitignored), same as the
 * boss-rig previews.
 */

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const OUT = fileURLToPath(new URL('./authoring/preview/', import.meta.url));
mkdirSync(OUT, { recursive: true });

const FRAME_W = 640;
const FRAME_H = 360;
const UPSCALE = 2;

const server = await createServer({
  root: ROOT,
  configFile: `${ROOT}vite.config.ts`,
  server: { middlewareMode: true, hmr: false },
  logLevel: 'error',
});
const load = (path) => server.ssrLoadModule(path);

const paper = await load('/src/render/ui/postcard-paper.ts');
const ornament = await load('/src/render/ui/ornament.ts');
const fonts = await load('/src/render/ui/font-compile.ts');
const title = await load('/src/render/ui/title.ts');
const palette = await load('/src/render/palette.ts');

// --- raster helpers -------------------------------------------------------

function surface(width, height) {
  return { width, height, pixels: Buffer.alloc(width * height * 4) };
}

function put(surf, x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= surf.width || y >= surf.height) return;
  const i = (y * surf.width + x) * 4;
  const inv = 1 - a / 255;
  surf.pixels[i] = r * (a / 255) + surf.pixels[i] * inv;
  surf.pixels[i + 1] = g * (a / 255) + surf.pixels[i + 1] * inv;
  surf.pixels[i + 2] = b * (a / 255) + surf.pixels[i + 2] * inv;
  surf.pixels[i + 3] = 255;
}

function putHex(surf, x, y, hex, alpha = 255) {
  put(surf, x, y, (hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff, alpha);
}

function fillRect(surf, x, y, w, h, hex, alpha = 255) {
  for (let row = y; row < y + h; row++)
    for (let col = x; col < x + w; col++) putHex(surf, col, row, hex, alpha);
}

/** Blits a `{width, height, colours}` grid, `-1` transparent. */
function blitGrid(surf, grid, dx, dy) {
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const colour = grid.colours[y * grid.width + x];
      if (colour < 0) continue;
      putHex(surf, dx + x, dy + y, colour);
    }
  }
}

/** Box-filter downscale of a decoded PNG into `rect` — what the GPU does to the art sprite. */
function blitArt(surf, png, rect) {
  const sx = png.width / rect.width;
  const sy = png.height / rect.height;
  for (let y = 0; y < rect.height; y++) {
    for (let x = 0; x < rect.width; x++) {
      const x0 = Math.floor(x * sx);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
      const y0 = Math.floor(y * sy);
      const y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let py = y0; py < y1; py++) {
        for (let px = x0; px < x1; px++) {
          const i = (py * png.width + px) * 4;
          r += png.data[i];
          g += png.data[i + 1];
          b += png.data[i + 2];
          n++;
        }
      }
      put(surf, rect.x + x, rect.y + y, r / n, g / n, b / n);
    }
  }
}

// --- text -----------------------------------------------------------------

function wrap(face, text, width) {
  const lines = [];
  for (const paragraph of text.split('\n')) {
    if (paragraph === '') {
      lines.push('');
      continue;
    }
    let line = '';
    for (const word of paragraph.split(' ')) {
      const candidate = line === '' ? word : `${line} ${word}`;
      if (face.measure(candidate) > width && line !== '') {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    lines.push(line);
  }
  return lines;
}

function drawLine(surf, face, text, x, y, hex) {
  let pen = x;
  for (const character of text) {
    const glyph = face.glyph(character);
    for (let row = 0; row < glyph.rows.length; row++) {
      const line = glyph.rows[row] ?? '';
      for (let col = 0; col < line.length; col++) {
        if (line[col] === '#') putHex(surf, pen + col, y + glyph.top + row, hex);
      }
    }
    pen += glyph.advance;
  }
}

function drawTitleLine(surf, text, centreX, y, style) {
  const pixels = title.renderTitlePixels(fonts.DISPLAY_FACE, text, style);
  blitGrid(surf, pixels, Math.round(centreX - pixels.width / 2), y);
  return pixels.height;
}

// --- the card ------------------------------------------------------------

/** Draws one card exactly as `render/postcard.ts` does: shadow, sheet, picture, message. */
function drawCard(surf, art, { x, y, width, height, caption, seed }) {
  const face = fonts.TEXT_FACE;
  const artAspect = art === null ? undefined : art.width / art.height;
  let captionHeight = 0;
  let lines = [];
  if (caption !== undefined) {
    const wrapWidth = paper.postcardCaptionWrapWidth(width, height, { artAspect });
    lines = wrap(face, caption, wrapWidth);
    captionHeight = lines.length * face.metrics.lineAdvance;
  }
  const options = { artAspect, captionHeight, seed };
  const geometry = paper.postcardGeometry(width, height, options);

  const offset = paper.POSTCARD_SHADOW_OFFSET;
  fillRect(surf, x + offset, y + offset, width, height, palette.POSTCARD_PALETTE.shadow, 115);
  blitGrid(surf, paper.renderPostcardPixels(width, height, options), x, y);
  if (art !== null) {
    blitArt(surf, art, {
      x: x + geometry.picture.x,
      y: y + geometry.picture.y,
      width: geometry.picture.width,
      height: geometry.picture.height,
    });
  }
  if (geometry.caption !== null) {
    const top =
      y +
      geometry.caption.y +
      Math.max(0, Math.round((geometry.caption.height - captionHeight) / 2));
    lines.forEach((line, index) => {
      drawLine(
        surf,
        face,
        line,
        x + geometry.caption.x,
        top + index * face.metrics.lineAdvance,
        palette.POSTCARD_PALETTE.ink,
      );
    });
  }
  return geometry;
}

// --- scenes ---------------------------------------------------------------

/** A stand-in for the live room a card is shown over. */
function mockRoom(surf, dim) {
  const floor = 0x3c3a38;
  const wall = 0x2a2724;
  fillRect(surf, 0, 0, surf.width, surf.height, floor);
  for (let y = 0; y < surf.height; y += 32)
    for (let x = 0; x < surf.width; x += 32) {
      fillRect(surf, x, y, 32, 1, wall);
      fillRect(surf, x, y, 1, 32, wall);
    }
  fillRect(surf, 0, 0, surf.width, 48, wall);
  if (dim > 0)
    fillRect(
      surf,
      0,
      0,
      surf.width,
      surf.height,
      palette.EFFECT_PALETTE.gameOverDim,
      Math.round(dim * 255),
    );
}

const OPENING =
  "Opa's last Pfeitinger is empty. The full crate beside it is the same beer, but the label is new: water, malt, hops — and raisins.\n\nAlois takes Opa's Trink-Rucksack down off its hook, fills it with the tainted crate, and switches it from trinken to schießen.";

/** `render/story-card.ts`: the card inset on the dimmed room, carrying the beat's message. */
function storyScene(art) {
  const surf = surface(FRAME_W, FRAME_H);
  mockRoom(surf, 0.78);
  const margin = 24;
  const inset = 40;
  drawCard(surf, art, {
    x: margin,
    y: inset,
    width: FRAME_W - margin * 2,
    height: FRAME_H - inset * 2,
    caption: OPENING,
    seed: 3,
  });
  const hint = 'Press to skip';
  drawLine(
    surf,
    fonts.TEXT_FACE,
    hint,
    FRAME_W - margin - fonts.TEXT_FACE.measure(hint),
    FRAME_H - inset / 2 - 5,
    palette.UI_PALETTE.textDim,
  );
  return surf;
}

/** `render/boss-intro-plate.ts`: a franked front over the live room, the name and epithet under it. */
function bossScene(art) {
  const surf = surface(FRAME_W, FRAME_H);
  mockRoom(surf, 0);
  const card = paper.postcardBoxForPicture(232, art.width / art.height);
  const top = Math.round(FRAME_H * 0.16);
  drawCard(surf, art, {
    x: Math.round((FRAME_W - card.width) / 2),
    y: top,
    width: card.width,
    height: card.height,
    seed: 5,
  });
  const face = fonts.TEXT_FACE;
  let cursor = top + card.height + 8;
  cursor += drawTitleLine(surf, 'Der Stier', FRAME_W / 2, cursor, title.TITLE_STYLES.threat) + 6;
  const centred = (text, colour, y) =>
    drawLine(surf, face, text, Math.round((FRAME_W - face.measure(text)) / 2), y, colour);
  centred('Guardian of the Maypole', palette.UI_PALETTE.text, cursor);
  centred(
    'Two horns, one grudge: the maypole stays exactly where it is.',
    palette.UI_PALETTE.textDim,
    cursor + 14,
  );
  return surf;
}

/** `render/title-screen.ts`: menu column left, the game's name and its card in the right pane. */
function titleScene(art) {
  const surf = surface(FRAME_W, FRAME_H);
  blitGrid(surf, ornament.renderOrnamentPixels(FRAME_W, FRAME_H), 0, 0);

  const margin = 24;
  const menuWidth = 148;
  const items = ['Start', 'Continue', 'Settings', 'Credits', 'Quit'];
  const rowHeight = 22;
  const menuTop = Math.round(FRAME_H / 2 - (items.length * rowHeight) / 2);
  items.forEach((item, index) => {
    const y = menuTop + index * rowHeight;
    blitGrid(
      surf,
      title.renderTitlePixels(fonts.DISPLAY_FACE, item, {
        ramp: index === 0 ? palette.TITLE_PALETTE.goldRamp : palette.TITLE_PALETTE.boneRamp,
        texture: 'none',
        outline: palette.TITLE_PALETTE.outline,
      }),
      margin,
      y,
    );
    if (index < items.length - 1)
      fillRect(surf, margin, y + rowHeight - 6, menuWidth, 1, palette.TITLE_PALETTE.ruleShade);
  });

  const paneLeft = margin + menuWidth + 48;
  const paneWidth = FRAME_W - paneLeft - margin;
  const headline = title.renderTitlePixels(
    fonts.DISPLAY_FACE,
    'Kellerbier',
    title.TITLE_STYLES.floor,
  );
  const scale = 2;
  for (let y = 0; y < headline.height * scale; y++)
    for (let x = 0; x < headline.width * scale; x++) {
      const colour =
        headline.colours[Math.floor(y / scale) * headline.width + Math.floor(x / scale)];
      if (colour >= 0)
        putHex(
          surf,
          Math.round(paneLeft + paneWidth / 2 - (headline.width * scale) / 2) + x,
          margin + y,
          colour,
        );
    }

  const cardTop = margin + headline.height * scale + 12;
  const availHeight = FRAME_H - margin - cardTop;
  const card = paper.postcardBoxWithin(paneWidth, availHeight, art.width / art.height);
  drawCard(surf, art, {
    x: Math.round(paneLeft + (paneWidth - card.width) / 2),
    y: Math.round(cardTop + (availHeight - card.height) / 2),
    width: card.width,
    height: card.height,
    seed: 9,
  });

  drawLine(
    surf,
    fonts.TEXT_FACE,
    'A Bavarian cellar-crawling roguelike',
    margin,
    FRAME_H - margin + 2,
    palette.UI_PALETTE.textDim,
  );
  return surf;
}

/** The franking at 6×: the one piece of new pixel art here, too small to judge in a 640×360 frame. */
function frankingDetail() {
  const width = 120;
  const height = 62;
  const zoom = 6;
  const card = paper.renderPostcardPixels(250, 200, {
    artAspect: 1344 / 768,
    captionHeight: 0,
    seed: 5,
  });
  const out = surface(width * zoom, height * zoom);
  for (let y = 0; y < out.height; y++)
    for (let x = 0; x < out.width; x++) {
      const sx = card.width - width + Math.floor(x / zoom);
      const sy = card.height - height + Math.floor(y / zoom);
      const colour = card.colours[sy * card.width + sx];
      putHex(out, x, y, colour < 0 ? 0x101014 : colour);
    }
  return out;
}

// --- sheet ----------------------------------------------------------------

function upscale(surf, factor) {
  const out = surface(surf.width * factor, surf.height * factor);
  for (let y = 0; y < out.height; y++)
    for (let x = 0; x < out.width; x++) {
      const i = (Math.floor(y / factor) * surf.width + Math.floor(x / factor)) * 4;
      const o = (y * out.width + x) * 4;
      out.pixels[o] = surf.pixels[i];
      out.pixels[o + 1] = surf.pixels[i + 1];
      out.pixels[o + 2] = surf.pixels[i + 2];
      out.pixels[o + 3] = 255;
    }
  return out;
}

function write(name, surf) {
  const png = new PNG({ width: surf.width, height: surf.height });
  surf.pixels.copy(png.data);
  writeFileSync(`${OUT}${name}`, PNG.sync.write(png));
  console.log(`${name} ${surf.width}×${surf.height}`);
}

const opening = PNG.sync.read(readFileSync(`${ROOT}assets/art/story/opening.png`));
const stier = PNG.sync.read(readFileSync(`${ROOT}assets/art/bosses/der-stier.png`));
const titleArt = PNG.sync.read(readFileSync(`${ROOT}assets/art/title/postcard.png`));

const scenes = [
  ['story beat', storyScene(opening)],
  ['boss reveal', bossScene(stier)],
  ['title screen', titleScene(titleArt)],
];

const sheet = surface(FRAME_W + 8, (FRAME_H + 22) * scenes.length + 8);
fillRect(sheet, 0, 0, sheet.width, sheet.height, 0x101014);
let y = 4;
for (const [name, scene] of scenes) {
  drawLine(sheet, fonts.TEXT_FACE, name, 4, y + 2, 0xffffff);
  y += 16;
  for (let row = 0; row < scene.height; row++)
    for (let col = 0; col < scene.width; col++) {
      const i = (row * scene.width + col) * 4;
      put(sheet, 4 + col, y + row, scene.pixels[i], scene.pixels[i + 1], scene.pixels[i + 2]);
    }
  y += FRAME_H + 6;
}
write('postcard-scenes.png', upscale(sheet, UPSCALE));
write('postcard-franking.png', frankingDetail());

await server.close();
