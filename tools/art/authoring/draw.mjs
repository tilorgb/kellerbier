/**
 * A char-grid drawing kit, for art that is a *composition* rather than a
 * hand-placed bitmap.
 *
 * `compose.mjs` next door solves the other half of the same problem: Alois is
 * forty-four frames built from a dozen hand-typed blocks, so it composes typed
 * grids. The title screen's key art is one drawing far too large to type — a
 * 128×104 illustration is thirteen thousand characters, and a single mistyped
 * row shifts everything under it — but it is made of shapes: a head, an arm, a
 * Maß, an arch. So it is *drawn*: ellipses, polygons and lines into a grid of
 * the same palette characters, with one outline pass at the end.
 *
 * The outline pass is what makes this look like the rest of the game rather
 * than like vector shapes: every drawn shape gets a one-pixel ink edge, the
 * same four-neighbour dilation `render/ui/title.ts` puts round a display line,
 * and the same hard black every sprite in `assets/` is drawn against.
 */

/** A width×height grid of palette characters, `.` for transparent. */
export function canvas(width, height, fill = '.') {
  return {
    width,
    height,
    rows: Array.from({ length: height }, () => Array.from({ length: width }, () => fill)),
  };
}

export function px(c, x, y, ch) {
  const ix = Math.round(x);
  const iy = Math.round(y);
  if (ix < 0 || iy < 0 || ix >= c.width || iy >= c.height) return;
  c.rows[iy][ix] = ch;
}

export function get(c, x, y) {
  if (x < 0 || y < 0 || x >= c.width || y >= c.height) return '.';
  return c.rows[y][x];
}

export function fillRect(c, x, y, w, h, ch) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(c, x + i, y + j, ch);
}

export function ellipse(c, cx, cy, rx, ry, ch) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) px(c, x, y, ch);
    }
  }
}

/** A filled rectangle with its corners cut back by `r`. */
export function roundRect(c, x, y, w, h, r, ch) {
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const dx = i < r ? r - i : i >= w - r ? i - (w - r - 1) : 0;
      const dy = j < r ? r - j : j >= h - r ? j - (h - r - 1) : 0;
      if (dx * dx + dy * dy > r * r + r * 0.5) continue;
      px(c, x + i, y + j, ch);
    }
  }
}

/** `thickness` above 1 sweeps a disc along the line — a limb, not a hairline. */
export function line(c, x0, y0, x1, y1, ch, thickness = 1) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= steps; i++) {
    const x = x0 + ((x1 - x0) * i) / steps;
    const y = y0 + ((y1 - y0) * i) / steps;
    if (thickness <= 1) px(c, x, y, ch);
    else ellipse(c, x, y, thickness / 2, thickness / 2, ch);
  }
}

/** Scanline-fills a polygon given as `[x, y]` pairs. */
export function poly(c, points, ch) {
  const ys = points.map((point) => point[1]);
  const top = Math.floor(Math.min(...ys));
  const bottom = Math.ceil(Math.max(...ys));
  for (let y = top; y <= bottom; y++) {
    const crossings = [];
    for (let i = 0; i < points.length; i++) {
      const [x0, y0] = points[i];
      const [x1, y1] = points[(i + 1) % points.length];
      if (y0 === y1) continue;
      const lo = Math.min(y0, y1);
      const hi = Math.max(y0, y1);
      if (y + 0.5 < lo || y + 0.5 >= hi) continue;
      crossings.push(x0 + ((y + 0.5 - y0) * (x1 - x0)) / (y1 - y0));
    }
    crossings.sort((a, b) => a - b);
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      for (let x = Math.round(crossings[i]); x <= Math.round(crossings[i + 1]); x++)
        px(c, x, y, ch);
    }
  }
}

/** Wraps everything drawn so far in `ink`, four-neighbour — the ink edge, once, at the end. */
export function outline(c, ink = 'K') {
  const added = [];
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      if (get(c, x, y) !== '.') continue;
      if (
        get(c, x - 1, y) !== '.' ||
        get(c, x + 1, y) !== '.' ||
        get(c, x, y - 1) !== '.' ||
        get(c, x, y + 1) !== '.'
      ) {
        added.push([x, y]);
      }
    }
  }
  for (const [x, y] of added) px(c, x, y, ink);
}

/** Draws `art` onto `c` at `(x, y)`, leaving `c` showing through the transparent pixels. */
export function stamp(c, art, x, y) {
  for (let j = 0; j < art.height; j++) {
    for (let i = 0; i < art.width; i++) {
      const ch = art.rows[j][i];
      if (ch !== '.') px(c, x + i, y + j, ch);
    }
  }
}

/** A mirrored copy — one drawing, two facings. */
export function flip(c) {
  const out = canvas(c.width, c.height);
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) px(out, c.width - 1 - x, y, c.rows[y][x]);
  }
  return out;
}

export function toRows(c) {
  return c.rows.map((row) => row.join(''));
}
