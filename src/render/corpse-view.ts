import { Container, Graphics } from 'pixi.js';
import type { GameSim } from '../sim/game/sim.js';

/**
 * The corpse (#84): where the player fell, while Blutwurz is active — drawn
 * procedurally with `Graphics` rather than from a sprite sheet, the same
 * `docs/DECISIONS.md` #43 reasoning `maibaum-view.ts` already gives, so a
 * small marker needs no pixel art and no sign-off.
 *
 * Only ever visible in the one room it can possibly mean anything in:
 * `GameSim.corpsePosition`'s `x`/`y` are local to whichever room the
 * player died in, not a floor-wide space, so this checks `roomId` before
 * drawing at all — the same guard `stepBlutwurz`'s own touch check applies.
 */

const MOUND = 0x3a3228;
const MOUND_RIM = 0x554a3a;
const MARKER = 0xc9c2a8;

function drawMarker(g: Graphics): void {
  g.ellipse(0, 0, 9, 4).fill(MOUND);
  g.ellipse(0, -1, 9, 4).stroke({ width: 1, color: MOUND_RIM });
  g.rect(-1, -12, 2, 10).fill(MARKER);
  g.rect(-4, -10, 8, 2).fill(MARKER);
}

export class CorpseView {
  readonly container = new Container();

  private readonly marker = new Graphics();

  constructor() {
    drawMarker(this.marker);
    this.container.addChild(this.marker);
    this.container.visible = false;
  }

  sync(sim: GameSim): void {
    const corpse = sim.corpsePosition;
    const visible = corpse !== null && corpse.roomId === sim.roomId;
    this.container.visible = visible;
    if (visible) {
      this.container.position.set(corpse.x, corpse.y);
    }
  }
}
