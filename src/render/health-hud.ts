import { Container, Sprite, type Texture } from 'pixi.js';
import { PLAYER_HEALTH, type GameSim } from '../sim/game/sim.js';
import { HEALTH_ICON_ROLES, type UiKit } from './ui/kit.js';

const MUG_GAP = 1;

/** Half-Maß per red mug. Fixed by the health model — see `applyPlayerDamage`. */
const HALF_MASS_PER_MUG = 2;

/**
 * Generous caps on how many mugs are ever drawn, sized well above anything
 * the game hands out today. Sprites beyond the current count are simply
 * hidden rather than destroyed, the same pooling approach the rest of
 * `render/` uses for anything that changes size every frame.
 */
const SOUL_MUG_CAP = 10;
const ETERNAL_MUG_CAP = 6;
const RED_MUG_COUNT = PLAYER_HEALTH / HALF_MASS_PER_MUG;

type Fill = 'full' | 'half' | 'empty';
type Pool = 'red' | 'soul' | 'eternal';

const MUG_ICONS: Readonly<Record<Fill, string>> = {
  full: 'mug-full',
  half: 'mug-half',
  empty: 'mug-empty',
};

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
 *
 * The mugs are the kit's art now (#154) rather than a generated rounded
 * rectangle: a real Maßkrug silhouette with a handle and a foam line, drawn
 * once per (fill, pool) pair. The pool is the *roles* the same bitmap is
 * drawn in, not a tint, because Schwarzbier's near-black fill needs its foam
 * lighter than its body and a tint can only ever darken.
 */
export class HealthHud {
  readonly view = new Container();

  private readonly kit: UiKit;
  private readonly mugWidth: number;
  private readonly mugHeight: number;

  private readonly soulMugs: Sprite[] = [];
  private readonly redMugs: Sprite[] = [];
  private readonly eternalMugs: Sprite[] = [];

  constructor(kit: UiKit) {
    this.kit = kit;
    const size = kit.iconSize('mug-full');
    this.mugWidth = size.width;
    this.mugHeight = size.height;

    for (let index = 0; index < SOUL_MUG_CAP; index++) {
      this.soulMugs.push(this.makeMug('soul'));
    }
    for (let index = 0; index < RED_MUG_COUNT; index++) {
      this.redMugs.push(this.makeMug('red'));
    }
    for (let index = 0; index < ETERNAL_MUG_CAP; index++) {
      this.eternalMugs.push(this.makeMug('eternal'));
    }
  }

  private texture(pool: Pool, fill: Fill): Texture {
    return this.kit.icon(MUG_ICONS[fill], HEALTH_ICON_ROLES[pool]);
  }

  private makeMug(pool: Pool): Sprite {
    const sprite = new Sprite(this.texture(pool, 'full'));
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
      mug.texture = this.texture('soul', fillFor(soulHalves, index));
      mug.position.set(x, 0);
      x += this.mugWidth + MUG_GAP;
    }

    const redHalves = sim.playerHealth;
    for (let index = 0; index < this.redMugs.length; index++) {
      const mug = this.redMugs[index];
      if (mug === undefined) {
        continue;
      }
      mug.texture = this.texture('red', fillFor(redHalves, index));
      mug.position.set(x, 0);
      x += this.mugWidth + MUG_GAP;
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
      mug.texture = this.texture('eternal', 'full');
      mug.position.set(eternalX, this.mugHeight + MUG_GAP);
      eternalX += this.mugWidth + MUG_GAP;
    }
  }

  /** Height of the row stack in UI pixels, so `main.ts` can stack the next HUD under it. */
  get height(): number {
    return this.mugHeight * 2 + MUG_GAP;
  }
}
