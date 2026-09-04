import { Container, Sprite, type Texture } from 'pixi.js';
import {
  ETERNAL_HEALTH_MAX,
  PLAYER_HEALTH,
  SOUL_HEALTH_MAX,
  type GameSim,
} from '../sim/game/sim.js';
import { HEALTH_ICON_ROLES, type UiKit } from './ui/kit.js';

const WURST_GAP = 1;

/** Half-heart units per icon. Fixed by the health model — see `applyPlayerDamage`. */
const HALF_UNITS_PER_ICON = 2;

const RED_WURST_COUNT = PLAYER_HEALTH / HALF_UNITS_PER_ICON;
const SOUL_WURST_COUNT = SOUL_HEALTH_MAX / HALF_UNITS_PER_ICON;
const ETERNAL_WURST_COUNT = ETERNAL_HEALTH_MAX / HALF_UNITS_PER_ICON;

type Fill = 'full' | 'half' | 'empty';
type Pool = 'red' | 'soul' | 'eternal';

const WURST_ICONS: Readonly<Record<Fill, string>> = {
  full: 'wurst-full',
  half: 'wurst-half',
  empty: 'wurst-empty',
};

function fillFor(remaining: number, wurstIndex: number): Fill {
  const half = wurstIndex * HALF_UNITS_PER_ICON;
  if (remaining <= half) {
    return 'empty';
  }
  return remaining >= half + HALF_UNITS_PER_ICON ? 'full' : 'half';
}

/**
 * The player's health row: red Bratwurst, soul Weißwurst, and banked
 * Blutwurst (health-food-redesign — previously Maß, Weißbier, Schwarzbier).
 *
 * Screen-space — `main.ts` adds `view` to `uiLayer`, never to anything the
 * camera shakes, or a hit that shakes the screen would visibly rattle the
 * one thing on it that is supposed to hold still so the player can read it.
 *
 * "Draining rather than vanishing" (the acceptance criterion this exists
 * for) means the sprite count for every pool is fixed to what it could hold
 * — all three pools now have a real, enforced maximum
 * (`SOUL_HEALTH_MAX`/`ETERNAL_HEALTH_MAX`), not just a generous rendering
 * cap — and a spent icon switches to its empty texture rather than being
 * removed, so the row never gets shorter.
 *
 * The Wurst are the kit's art (#154's mugs, redrawn for the redesign) rather
 * than a generated rounded rectangle: one tied-off-both-ends silhouette,
 * drawn once per (fill, pool) pair. The pool is the *roles* the same bitmap
 * is drawn in, not a tint, because Blutwurst's near-black fill needs its
 * highlight lighter than its body and a tint can only ever darken. Eternal
 * hearts now drain in halves too, the same as red and soul — a
 * half-Blutwurst is a real half-heart, not a coin flip on a whole one.
 */
export class HealthHud {
  readonly view = new Container();

  private readonly kit: UiKit;
  private readonly wurstWidth: number;
  private readonly wurstHeight: number;

  private readonly soulWurst: Sprite[] = [];
  private readonly redWurst: Sprite[] = [];
  private readonly eternalWurst: Sprite[] = [];

  constructor(kit: UiKit) {
    this.kit = kit;
    const size = kit.iconSize('wurst-full');
    this.wurstWidth = size.width;
    this.wurstHeight = size.height;

    for (let index = 0; index < SOUL_WURST_COUNT; index++) {
      this.soulWurst.push(this.makeWurst('soul'));
    }
    for (let index = 0; index < RED_WURST_COUNT; index++) {
      this.redWurst.push(this.makeWurst('red'));
    }
    for (let index = 0; index < ETERNAL_WURST_COUNT; index++) {
      this.eternalWurst.push(this.makeWurst('eternal'));
    }
  }

  private texture(pool: Pool, fill: Fill): Texture {
    return this.kit.icon(WURST_ICONS[fill], HEALTH_ICON_ROLES[pool]);
  }

  private makeWurst(pool: Pool): Sprite {
    const sprite = new Sprite(this.texture(pool, 'full'));
    this.view.addChild(sprite);
    return sprite;
  }

  sync(sim: GameSim): void {
    let x = 0;
    const soulHalves = sim.playerSoulHealth;
    for (let index = 0; index < this.soulWurst.length; index++) {
      const wurst = this.soulWurst[index];
      if (wurst === undefined) {
        continue;
      }
      wurst.texture = this.texture('soul', fillFor(soulHalves, index));
      wurst.position.set(x, 0);
      x += this.wurstWidth + WURST_GAP;
    }

    const redHalves = sim.playerHealth;
    for (let index = 0; index < this.redWurst.length; index++) {
      const wurst = this.redWurst[index];
      if (wurst === undefined) {
        continue;
      }
      wurst.texture = this.texture('red', fillFor(redHalves, index));
      wurst.position.set(x, 0);
      x += this.wurstWidth + WURST_GAP;
    }

    // Eternal hearts drain in halves now (health-food-redesign), the same
    // shape as red and soul — see `fillFor` — rather than only ever showing
    // full or hidden, on a second row under the row that does drain.
    const eternalHalves = sim.playerEternalHealth;
    let eternalX = 0;
    for (let index = 0; index < this.eternalWurst.length; index++) {
      const wurst = this.eternalWurst[index];
      if (wurst === undefined) {
        continue;
      }
      wurst.texture = this.texture('eternal', fillFor(eternalHalves, index));
      wurst.position.set(eternalX, this.wurstHeight + WURST_GAP);
      eternalX += this.wurstWidth + WURST_GAP;
    }
  }

  /** Height of the row stack in UI pixels, so `main.ts` can stack the next HUD under it. */
  get height(): number {
    return this.wurstHeight * 2 + WURST_GAP;
  }
}
