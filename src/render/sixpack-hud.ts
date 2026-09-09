import { Container, Sprite, type BitmapText } from './gfx/index.js';
import type { GameSim } from '../sim/game/sim.js';
import { SIXPACK_SLOTS, sixpackFilledSlots } from '../content/items/sixpack.js';
import { HUD_PALETTE, UI_PALETTE } from './palette.js';
import { type UiKit } from './ui/kit.js';
import { uiText, UI_TEXT_HEIGHT } from './ui/text.js';

/** The one item this row exists for. */
const ITEM_ID = 'sixpack';

const BOTTLE_GAP = 1;
const LABEL_GAP = 3;

/**
 * How much of a slot has to be in the carrier before its bottle reads as
 * full. Not `1`: a half Maß fills 0.6 of a slot and the arithmetic on a
 * float will land a hair under a whole one often enough to matter, and a
 * bottle that shows empty while the meter says it is not is the kind of
 * thing that gets reported as a bug rather than read as a rounding rule.
 */
const FULL_AT = 0.999;

/**
 * The Sixpack's row: six bottles, filling as the player banks Maß
 * instead of drinking them.
 *
 * Its own HUD element rather than a `status` line (`ItemStatusReader`),
 * which the item also has, because the two answer different questions. The
 * status line says "Tragerl 4/6" and lives in a list of every held item's
 * one-liner; this is the thing the player glances at mid-fight to decide
 * whether to press the button, and "how many bottles" is a *quantity* — six
 * containers you read the shape of is faster than a fraction you read the
 * digits of, which is exactly the argument `HealthHud` already makes for
 * drawing Wurst instead of "6/6".
 *
 * Hidden entirely whenever the item is not held (`view.visible`), the same
 * as `ActiveItemHud` — and `height` goes to zero with it, so `main.ts`'s HUD
 * column closes the gap rather than leaving a blank row where a carrier the
 * player has never seen would be.
 *
 * Screen-space, in the HUD layer: never inside anything the camera shakes.
 */
export class SixpackHud {
  readonly view = new Container();

  private readonly kit: UiKit;
  private readonly bottles: Sprite[] = [];
  private readonly label: BitmapText;
  private readonly bottleHeight: number;

  constructor(kit: UiKit) {
    this.kit = kit;
    const size = kit.iconSize('bottle-full');
    this.bottleHeight = size.height;

    let x = 0;
    for (let index = 0; index < SIXPACK_SLOTS; index++) {
      const bottle = new Sprite(this.texture(false));
      bottle.position.set(x, 0);
      this.view.addChild(bottle);
      this.bottles.push(bottle);
      x += size.width + BOTTLE_GAP;
    }

    this.label = uiText('');
    this.label.position.set(
      x + LABEL_GAP,
      Math.max(0, Math.floor((size.height - UI_TEXT_HEIGHT) / 2)),
    );
    this.view.addChild(this.label);

    this.view.visible = false;
  }

  private texture(full: boolean) {
    // Amber when there is beer in it, the HUD's own dim outline colour when
    // there is not — the same "shape first, colour second" split the health
    // row uses: the empty bottle is already a different *bitmap*, and the
    // colour only makes the difference easier to catch in peripheral vision.
    return this.kit.icon(full ? 'bottle-full' : 'bottle-empty', {
      outline: UI_PALETTE.outline,
      fill: full ? HUD_PALETTE.promilleTier[2] : UI_PALETTE.panelHighlight,
      highlight: full ? UI_PALETTE.text : UI_PALETTE.panelHighlight,
      accent: full ? HUD_PALETTE.promilleTier[3] : UI_PALETTE.panelHighlight,
    });
  }

  sync(sim: GameSim): void {
    const held = sim.hasItem(ITEM_ID);
    this.view.visible = held;
    if (!held) {
      return;
    }
    const filled = sixpackFilledSlots(sim, sim.itemState(ITEM_ID));
    let whole = 0;
    for (let index = 0; index < this.bottles.length; index++) {
      const bottle = this.bottles[index];
      if (bottle === undefined) {
        continue;
      }
      // A slot is full once the carrier holds at least that many slots'
      // worth. Partial fill (a lone half Maß) is deliberately not drawn as a
      // half-height bottle: the player's decision is "is there a bottle to
      // drink", and the answer to that is yes for any amount at all — the
      // pour takes whatever is in there.
      const full = filled - index >= FULL_AT;
      bottle.texture = this.texture(full);
      if (full) {
        whole += 1;
      }
    }
    // The digits are still there for the player who wants them, and they are
    // what makes a part-filled seventh-of-a-slot legible at all.
    this.label.text = `${String(whole)}/${String(SIXPACK_SLOTS)}`;
  }

  /** Height of the row in UI pixels — zero while the carrier is not held, so the HUD column closes up. */
  get height(): number {
    return this.view.visible ? this.bottleHeight : 0;
  }
}
