import { Container, Sprite, type Renderer, type Texture } from 'pixi.js';
import { PLAYER_HEALTH, type GameSim } from '../sim/game/sim.js';
import { createMugTexture } from './placeholder-art.js';
import { HUD_PALETTE } from './palette.js';

const MUG_WIDTH = 12;
const MUG_HEIGHT = 12;
const MUG_GAP = 2;

/** Half-Maß per red mug. Fixed by the health model — see `applyPlayerDamage`. */
const HALF_MASS_PER_MUG = 2;

/**
 * Generous caps on how many mugs are ever drawn, sized well above anything
 * the game hands out today (no pickup exists yet — #22 — so soul and
 * eternal are debug-granted only). Sprites beyond the current count are
 * simply hidden rather than destroyed, the same pooling approach the rest of
 * `render/` uses for anything that changes size every frame.
 */
const SOUL_MUG_CAP = 10;
const ETERNAL_MUG_CAP = 6;
const RED_MUG_COUNT = PLAYER_HEALTH / HALF_MASS_PER_MUG;

type Fill = 'empty' | 'half' | 'full';

function fillFor(remaining: number, mugIndex: number): Fill {
  const half = mugIndex * HALF_MASS_PER_MUG;
  if (remaining <= half) {
    return 'empty';
  }
  return remaining >= half + HALF_MASS_PER_MUG ? 'full' : 'half';
}

/**
 * The player's health row: red Maß, soul Weißbier, and banked Schwarzbier.
 *
 * Screen-space — `main.ts` adds `view` to `uiLayer`, never to anything the
 * camera shakes, or a hit that shakes the screen would visibly rattle the
 * one thing on it that is supposed to hold still so the player can read it.
 *
 * "Draining rather than vanishing" (the acceptance criterion this exists
 * for) means the sprite count for red and soul mugs is fixed to what the
 * pool could hold, and a spent mug switches to its empty texture rather than
 * being removed — the row never gets shorter.
 */
export class HealthHud {
  readonly view = new Container();

  private readonly full: Texture;
  private readonly half: Texture;
  private readonly empty: Texture;

  private readonly soulMugs: Sprite[] = [];
  private readonly redMugs: Sprite[] = [];
  private readonly eternalMugs: Sprite[] = [];

  constructor(renderer: Renderer) {
    this.full = createMugTexture(renderer, MUG_WIDTH, MUG_HEIGHT, 'full');
    this.half = createMugTexture(renderer, MUG_WIDTH, MUG_HEIGHT, 'half');
    this.empty = createMugTexture(renderer, MUG_WIDTH, MUG_HEIGHT, 'empty');

    for (let index = 0; index < SOUL_MUG_CAP; index++) {
      this.soulMugs.push(this.makeMug(HUD_PALETTE.healthSoul));
    }
    for (let index = 0; index < RED_MUG_COUNT; index++) {
      this.redMugs.push(this.makeMug(HUD_PALETTE.healthRed));
    }
    for (let index = 0; index < ETERNAL_MUG_CAP; index++) {
      this.eternalMugs.push(this.makeMug(HUD_PALETTE.healthEternal));
    }
  }

  private makeMug(tint: number): Sprite {
    const sprite = new Sprite(this.full);
    sprite.tint = tint;
    this.view.addChild(sprite);
    return sprite;
  }

  sync(sim: GameSim): void {
    let x = 0;
    const soulHalves = sim.playerSoulHealth;
    const soulCount = Math.min(SOUL_MUG_CAP, Math.ceil(soulHalves / HALF_MASS_PER_MUG));
    for (let index = 0; index < this.soulMugs.length; index++) {
      const mug = this.soulMugs[index];
      if (mug === undefined) {
        continue;
      }
      if (index >= soulCount) {
        mug.visible = false;
        continue;
      }
      mug.visible = true;
      mug.texture = this.textureFor(fillFor(soulHalves, index));
      mug.position.set(x, 0);
      x += MUG_WIDTH + MUG_GAP;
    }

    const redHalves = sim.playerHealth;
    for (let index = 0; index < this.redMugs.length; index++) {
      const mug = this.redMugs[index];
      if (mug === undefined) {
        continue;
      }
      mug.texture = this.textureFor(fillFor(redHalves, index));
      mug.position.set(x, 0);
      x += MUG_WIDTH + MUG_GAP;
    }

    // Eternal hearts do not drain — a hit either does not touch them or spends
    // one whole, per `applyPlayerDamage` — so they only ever show full or
    // hidden, on a second row under the row that does drain.
    const eternalCount = Math.min(ETERNAL_MUG_CAP, sim.playerEternalHealth);
    let eternalX = 0;
    for (let index = 0; index < this.eternalMugs.length; index++) {
      const mug = this.eternalMugs[index];
      if (mug === undefined) {
        continue;
      }
      if (index >= eternalCount) {
        mug.visible = false;
        continue;
      }
      mug.visible = true;
      mug.texture = this.full;
      mug.position.set(eternalX, MUG_HEIGHT + MUG_GAP);
      eternalX += MUG_WIDTH + MUG_GAP;
    }
  }

  private textureFor(fill: Fill): Texture {
    switch (fill) {
      case 'full':
        return this.full;
      case 'half':
        return this.half;
      default:
        return this.empty;
    }
  }
}
