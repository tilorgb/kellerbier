import { Container, Graphics, type Texture } from 'pixi.js';
import type { GameSim } from '../sim/game/sim.js';
import { createGroundShadow, styleGroundShadow } from './ground-shadow.js';

/**
 * The arena Maibaum (#199) — the one prop the player can walk *behind*, and
 * the Maibaum-Dieb's weapon once he grabs it.
 *
 * It is two drawings in one place because the simulation treats it as two
 * things at two times:
 *
 * - **planted** — while `GameSim.maypolePlanted` is non-null a live
 *   destructible target stands in the arena. Drawn tall and bottom-anchored at
 *   the collider, flushing red on a hit. `EntityView` skips the `maypole` prop
 *   kind, so this is the only copy. `view.ts` re-orders this container against
 *   the player each frame off `footY`, which is the whole of "walk behind it".
 * - **held** — once `GameSim.maibaumHeld` is non-null the pole is in the
 *   dieb's hands: a shorter weapon pole drawn at his body, angled by his
 *   swing. Not planted, so `footY` goes null and `view.ts` stops sorting.
 *
 * Drawn procedurally with `Graphics` rather than from a sprite sheet: a maypole
 * is a stack of stripes and a wreath of dots, the shape a pure function draws
 * cleanly (`docs/DECISIONS.md` #43's argument for UI art), and it sidesteps
 * the square-tile size rule a `tiles/` PNG would have to obey. Render-only.
 */

const INK = 0x141216;
const POLE_BLUE = 0x3962af;
const POLE_CREAM = 0xe8e2d0;
const WREATH = 0x4f9a4a;
const WREATH_LIT = 0x74c46a;
const RIBBON = [0x3962af, 0xd9cfb1, 0x74c46a];
const BASE_WOOD = 0x4a4451;
const HIT_FLUSH = 0xff8f7a;

/** The planted ceremonial Maibaum, base at (0,0), growing upward. Tall, decorated. */
function drawPlanted(g: Graphics): void {
  const h = 78;
  const w = 5;
  // braced wooden base
  g.rect(-4, -8, 8, 8).fill(BASE_WOOD);
  g.rect(-6, -3, 12, 3).fill(INK);
  g.moveTo(-3, -6)
    .lineTo(-8, 0)
    .moveTo(3, -6)
    .lineTo(8, 0)
    .stroke({ width: 1.5, color: BASE_WOOD });
  // barber-stripe pole
  for (let y = 6; y < h; y += 4) {
    g.rect(-w / 2, -(y + 4), w, 4).fill(((y / 4) | 0) % 2 === 0 ? POLE_BLUE : POLE_CREAM);
  }
  g.rect(-w / 2 - 1, -h, 1, h - 6).fill(INK);
  g.rect(w / 2, -h, 1, h - 6).fill(INK);
  // lower wreath
  wreath(g, 0, -(h - 20), 9);
  // crossed guild signs
  g.rect(-8, -(h - 8), 5, 5).fill(POLE_BLUE);
  g.rect(3, -(h - 8), 5, 5).fill(POLE_BLUE);
  g.rect(-9, -(h - 6), 18, 1.5).fill(POLE_CREAM);
  // ribbon crown
  RIBBON.forEach((c, i) => {
    const spread = (i - 1) * 8;
    g.moveTo(0, -(h - 2))
      .lineTo(spread, -(h - 14))
      .stroke({ width: 1.5, color: c });
  });
  g.circle(0, -h, 3).fill(WREATH_LIT);
}

/**
 * The weapon: a stubby little maypole he can actually lift — barely taller
 * than he is (~40px), thin (3px), a splintered butt where he wrenched it out
 * of the ground, and a small wreath + ribbon tuft at the tip so it still reads
 * as *a* maypole rather than a plank. Grip at (0,0), reaching in -y (#199).
 */
function drawHeld(g: Graphics): void {
  const len = 40;
  const w = 3;
  for (let y = 3; y < len; y += 3) {
    g.rect(-w / 2, -(y + 3), w, 3).fill(((y / 3) | 0) % 2 === 0 ? POLE_BLUE : POLE_CREAM);
  }
  g.rect(-w / 2 - 1, -len, 1, len).fill(INK);
  g.rect(w / 2, -len, 1, len).fill(INK);
  // splintered butt
  g.moveTo(-w / 2, 0)
    .lineTo(-w / 2 - 2, 3)
    .moveTo(0, 0)
    .lineTo(1, 4)
    .moveTo(w / 2, 0)
    .lineTo(w / 2 + 1, 2)
    .stroke({ width: 1, color: POLE_CREAM });
  // a small wreath + two ribbons at the head — not the ceremonial crown
  wreath(g, 0, -(len - 3), 4);
  RIBBON.slice(0, 2).forEach((c, i) => {
    g.moveTo(0, -len + 1)
      .lineTo(i === 0 ? -5 : 5, -len + 8 + i * 3)
      .stroke({ width: 1, color: c });
  });
  g.circle(0, -len, 2).fill(WREATH_LIT);
}

/** A ring of dots around (cx, cy). */
function wreath(g: Graphics, cx: number, cy: number, r: number): void {
  for (let a = 0; a < 14; a++) {
    const t = (a / 14) * Math.PI * 2;
    g.circle(cx + Math.cos(t) * r, cy + Math.sin(t) * r * 0.55, 1.6).fill(
      a % 2 === 0 ? WREATH : WREATH_LIT,
    );
  }
}

export class MaibaumView {
  readonly container = new Container();

  private readonly planted = new Graphics();
  private readonly held = new Graphics();
  private readonly shadow = new Container();
  private footYValue: number | null = null;

  constructor(shadowTexture?: Texture) {
    drawPlanted(this.planted);
    drawHeld(this.held);
    // Under the pole, so a planted Maibaum sits on the floor like every other
    // body (`docs/DECISIONS.md` #61). Only shown while planted — a held pole
    // is in the Dieb's hands, and the Dieb has his own shadow.
    if (shadowTexture !== undefined) {
      const blob = createGroundShadow(shadowTexture);
      styleGroundShadow(blob, shadowTexture, 12);
      this.shadow.addChild(blob);
    }
    this.container.addChild(this.shadow, this.planted, this.held);
    this.container.visible = false;
  }

  /** World Y of the planted pole's base — `view.ts` sorts the player against it. `null` when not planted. */
  get footY(): number | null {
    return this.footYValue;
  }

  sync(sim: GameSim): void {
    const plantedAt = sim.maypolePlanted;
    const heldAt = plantedAt === null ? sim.maibaumHeld : null;

    this.planted.visible = plantedAt !== null;
    this.shadow.visible = plantedAt !== null;
    if (plantedAt !== null) {
      this.planted.position.set(plantedAt.x, plantedAt.y);
      this.planted.tint = plantedAt.flash > 0 ? HIT_FLUSH : 0xffffff;
      this.shadow.position.set(plantedAt.x, plantedAt.y);
    }

    this.held.visible = heldAt !== null;
    if (heldAt !== null) {
      this.held.position.set(heldAt.x, heldAt.y - 3);
      // `drawHeld` builds the pole pointing straight up (-y); `poleAngle` is
      // the world bearing it should point along (0 = +x, -π/2 = up), which is
      // the same blade angle the swing's hit check reads (#199).
      this.held.rotation = heldAt.poleAngle + Math.PI / 2;
    }

    this.footYValue = plantedAt !== null ? plantedAt.y : null;
    this.container.visible = plantedAt !== null || heldAt !== null;
  }
}
