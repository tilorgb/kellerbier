import { Container, Sprite, type BitmapText } from 'pixi.js';
import type { GameSim } from '../sim/game/sim.js';
import { promilleRequirementMet } from '../sim/game/promille.js';
import { HUD_PALETTE } from './palette.js';
import { iconRoles, type UiKit } from './ui/kit.js';
import { uiText, UI_TEXT_HEIGHT } from './ui/text.js';

const ROW_HEIGHT = 11;
const ICON_GAP = 3;

/** Generous cap on rows shown at once — a run realistically holds a handful of gated items, never all 19. */
const MAX_ROWS = 10;

/** How much an inactive row dims, on both the icon and its label — the same "bright the instant it matters" idea `ActiveItemHud`'s tint swap uses, just expressed as alpha instead of a colour swap. */
const DORMANT_ALPHA = 0.4;

interface Row {
  readonly container: Container;
  readonly icon: Sprite;
  readonly label: BitmapText;
}

/**
 * One row per currently-held `sober`/`rausch` item — never `any`, since those
 * never go dormant and would just be clutter here. #32's acceptance
 * criterion ("item activation state is unambiguous in the HUD") for every
 * *passive* gated item: `ActiveItemHud` already carries this same
 * active/dormant read for the one active item slot, so this is the
 * equivalent for the (potentially several) passive ones that had no on-screen
 * representation at all before this.
 *
 * The row used to say "active"/"dormant" in English next to a coloured
 * square. #154 replaces both halves: a padlock or a tick carries the state,
 * and the gate colour is decoration on top of a shape — which is the same
 * rule the minimap icons are held to, and the one that makes the row read
 * without being translated.
 *
 * Screen-space, in `uiLayer`, same as every other HUD piece — never inside
 * anything the camera shakes.
 *
 * A fixed pool of rows, sized to `MAX_ROWS` and hidden rather than
 * created/destroyed as the held set changes tick to tick — `HealthHud`'s own
 * mug pool is the same shape, for the same reason.
 */
export class ItemGateHud {
  readonly view = new Container();

  private readonly kit: UiKit;
  private readonly rows: Row[] = [];
  private readonly iconWidth: number;

  constructor(kit: UiKit) {
    this.kit = kit;
    this.iconWidth = kit.iconSize('lock').width;

    for (let index = 0; index < MAX_ROWS; index++) {
      const container = new Container();
      container.position.set(0, index * ROW_HEIGHT);

      const icon = new Sprite(kit.icon('lock', iconRoles(HUD_PALETTE.itemGateSober)));
      container.addChild(icon);

      const label = uiText('');
      label.position.set(this.iconWidth + ICON_GAP, 0);
      container.addChild(label);

      container.visible = false;
      this.view.addChild(container);
      this.rows.push({ container, icon, label });
    }
  }

  sync(sim: GameSim): void {
    const tier = sim.promilleTier;
    const total = sim.items.count;
    let shown = 0;

    for (let index = 0; index < total && shown < this.rows.length; index++) {
      if (!sim.inventory.has(index)) {
        continue;
      }
      const item = sim.items.at(index);
      if (item.promilleRequirement === 'any') {
        continue;
      }
      const row = this.rows[shown];
      if (row === undefined) {
        continue;
      }
      const active = promilleRequirementMet(item.promilleRequirement, tier);
      const tint =
        item.promilleRequirement === 'sober'
          ? HUD_PALETTE.itemGateSober
          : HUD_PALETTE.itemGateRausch;
      const alpha = active ? 1 : DORMANT_ALPHA;

      row.container.visible = true;
      row.icon.texture = this.kit.icon(active ? 'tick' : 'lock', iconRoles(tint));
      // Icons in this set differ in height; sit each on the text baseline
      // rather than on the row's top edge, so a tick and a padlock line up.
      row.icon.position.y = UI_TEXT_HEIGHT - this.kit.iconSize(active ? 'tick' : 'lock').height;
      row.icon.alpha = alpha;
      row.label.alpha = alpha;
      row.label.text = item.name;
      shown += 1;
    }

    for (let index = shown; index < this.rows.length; index++) {
      const row = this.rows[index];
      if (row !== undefined) {
        row.container.visible = false;
      }
    }
  }
}
