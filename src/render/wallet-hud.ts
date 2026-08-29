import { Container, Sprite, type BitmapText } from 'pixi.js';
import type { GameSim } from '../sim/game/sim.js';
import { HUD_PALETTE, UI_PALETTE } from './palette.js';
import { iconRoles, type UiKit } from './ui/kit.js';
import { uiText, UI_TEXT_HEIGHT } from './ui/text.js';

/** Gap between an icon and its count, and between one pair and the next. */
const ICON_GAP = 2;
const PAIR_GAP = 8;

interface Slot {
  readonly icon: Sprite;
  readonly count: BitmapText;
  readonly width: number;
}

/**
 * Biermarken, Kellerschlüssel and Bierfassl in inventory.
 *
 * Was one line of text with the German words spelled out — the cheapest
 * possible readout, and honest about it, since no icon set existed. #154 is
 * the icon set, so this is now three icon-and-number pairs: a token, a key
 * and a keg. That is not only shorter, it is the only version that survives
 * localisation, since the icons carry the meaning and the numbers are the
 * only thing left to translate (nothing).
 *
 * Screen-space, in `uiLayer`, same as every other HUD piece here.
 */
export class WalletHud {
  readonly view = new Container();

  private readonly biermarken: Slot;
  private readonly keys: Slot;
  private readonly bombs: Slot;

  constructor(kit: UiKit) {
    this.biermarken = this.makeSlot(kit, 'biermarke', HUD_PALETTE.minimapTreasureIcon);
    this.keys = this.makeSlot(kit, 'key', UI_PALETTE.knobFill);
    this.bombs = this.makeSlot(kit, 'fassl', UI_PALETTE.accent);
    this.layOut();
  }

  private makeSlot(kit: UiKit, iconName: string, accent: number): Slot {
    const size = kit.iconSize(iconName);
    const icon = new Sprite(kit.icon(iconName, iconRoles(accent)));
    // Icons are shorter than a text cell; centre them on the line rather than
    // hanging them from its top, or a 5-tall key floats above its own number.
    icon.position.set(0, Math.floor((UI_TEXT_HEIGHT - size.height) / 2));
    const count = uiText('0');
    this.view.addChild(icon, count);
    return { icon, count, width: size.width };
  }

  private layOut(): void {
    let x = 0;
    for (const slot of [this.biermarken, this.keys, this.bombs]) {
      slot.icon.position.x = x;
      slot.count.position.set(x + slot.width + ICON_GAP, 0);
      // Two digits of room before the next pair, so a count ticking from 9 to
      // 10 does not shove the rest of the row sideways.
      x = slot.count.position.x + 10 + PAIR_GAP;
    }
  }

  sync(sim: GameSim): void {
    this.biermarken.count.text = String(sim.biermarken);
    this.keys.count.text = String(sim.keys);
    this.bombs.count.text = String(sim.bombs);
  }

  /** Height of the row in UI pixels. */
  get height(): number {
    return UI_TEXT_HEIGHT;
  }
}
