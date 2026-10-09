import { Container, Sprite, type Texture } from './gfx/index.js';
import {
  ETERNAL_HEALTH_MAX,
  PLAYER_MAX_HEALTH_CAP,
  SOUL_HEALTH_MAX,
  type GameSim,
} from '../sim/game/sim.js';
import { HEALTH_ICON_ROLES, type UiKit } from './ui/kit.js';

const WURST_GAP = 1;

/** Half-heart units per icon. Fixed by the health model — see `applyPlayerDamage`. */
const HALF_UNITS_PER_ICON = 2;

/** Most icons one row holds before the next ones wrap under it (a max-health item can pile up containers). */
const ROW_LIMIT = 8;

const RED_WURST_COUNT = PLAYER_MAX_HEALTH_CAP / HALF_UNITS_PER_ICON;
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
 * for) means a spent icon switches to its empty texture rather than being
 * removed, so the row never gets shorter *within a run*.
 *
 * What it does NOT mean is showing every container the pool could ever hold:
 * a fresh run drew five empty Weißwurst and six empty Blutwurst the player
 * had no way to fill yet, which reads as "you are missing eleven hearts,"
 * not as headroom. Each pool now renders only as many containers as the
 * player has actually had at once this run — a per-pool high-water mark
 * (`*SeenHalves`), so an emptied container still shows (you can refill it)
 * but one you have never earned does not. Red starts at the character's
 * three; soul and eternal start hidden and appear the first time a Wurst
 * grants one. `reset()` clears the marks — `app/main.ts` calls it per run.
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

  /** Highest half-heart count each pool has held this run — how many containers to draw. See the class doc comment. */
  private soulSeenHalves = 0;
  private eternalSeenHalves = 0;

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

  /** Clears the per-run high-water marks — `app/main.ts` calls this on every `startRun`. */
  reset(): void {
    this.soulSeenHalves = 0;
    this.eternalSeenHalves = 0;
  }

  /** Icons to draw for a pool: enough for the most it has ever held this run, rounded up to a whole container. */
  private static iconsFor(seenHalves: number): number {
    return Math.ceil(seenHalves / HALF_UNITS_PER_ICON);
  }

  /** Rows drawn last sync — height, which pp/main.ts's layout watches. */
  private rows = 1;

  /** Next free slot, in icons: column within the row, and the row itself. */
  private column = 0;
  private row = 0;

  private startRow(): void {
    if (this.column > 0) {
      this.row += 1;
      this.column = 0;
    }
  }

  private layoutRow(
    sprites: readonly Sprite[],
    pool: Pool,
    halves: number,
    visibleIcons: number,
  ): void {
    for (let index = 0; index < sprites.length; index++) {
      const wurst = sprites[index];
      if (wurst === undefined) {
        continue;
      }
      if (index >= visibleIcons) {
        wurst.visible = false;
        continue;
      }
      if (this.column >= ROW_LIMIT) {
        this.row += 1;
        this.column = 0;
      }
      wurst.visible = true;
      wurst.texture = this.texture(pool, fillFor(halves, index));
      wurst.position.set(
        this.column * (this.wurstWidth + WURST_GAP),
        this.row * (this.wurstHeight + WURST_GAP),
      );
      this.column += 1;
    }
  }

  sync(sim: GameSim): void {
    // A container the player has had once stays drawn (emptied, ready to
    // refill); one never earned is not drawn at all — see the class comment.
    // Red also tracks the pool ceiling, which a heart-container item raises.
    this.soulSeenHalves = Math.max(this.soulSeenHalves, sim.playerSoulHealth);
    this.eternalSeenHalves = Math.max(this.eternalSeenHalves, sim.playerEternalHealth);

    // Homebrew (#484): the glass is the health, so no hearts are drawn at all
    // while it is held. The Promille bar is the life.
    const noHearts = sim.lifeIsPromille;
    const redIcons = noHearts ? 0 : HealthHud.iconsFor(sim.playerMaxHealth);
    const soulIcons = noHearts ? 0 : HealthHud.iconsFor(this.soulSeenHalves);
    const eternalIcons = noHearts ? 0 : HealthHud.iconsFor(this.eternalSeenHalves);

    // Soul then red share the top row (wrapping past `ROW_LIMIT`); eternal
    // starts a fresh row under them, and only if the player has ever banked one.
    this.column = 0;
    this.row = 0;
    this.layoutRow(this.soulWurst, 'soul', sim.playerSoulHealth, soulIcons);
    this.layoutRow(this.redWurst, 'red', sim.playerHealth, redIcons);
    if (eternalIcons > 0) {
      this.startRow();
    }
    this.layoutRow(this.eternalWurst, 'eternal', sim.playerEternalHealth, eternalIcons);

    this.rows = noHearts ? 0 : Math.max(1, this.column > 0 ? this.row + 1 : this.row);
  }
  /**
   * Height of the row stack in UI pixels, so `main.ts` can stack the next HUD
   * under it. Drops to a single row until the player has banked an eternal
   * heart — `app/main.ts` re-runs its HUD layout when this changes.
   */
  get height(): number {
    return this.rows === 0 ? 0 : this.rows * this.wurstHeight + (this.rows - 1) * WURST_GAP;
  }
}
