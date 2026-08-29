import { Container, Sprite, type BitmapText } from 'pixi.js';
import type { GameSim } from '../sim/game/sim.js';
import { promilleRequirementMet } from '../sim/game/promille.js';
import { HUD_PALETTE } from './palette.js';
import { iconRoles, type UiKit } from './ui/kit.js';
import { uiText, UI_TEXT_HEIGHT } from './ui/text.js';

const SLOT_SIZE = 14;
const BAR_WIDTH = 44;
const BAR_HEIGHT = 7;
const BAR_INSET = 2;
const GAP = 3;

/**
 * The held active item's readout: an icon in a slot, a charge/"buildup"
 * bar in a well, and which button fires it — #59's item batches are the
 * first content to actually reach `maxCharge`, and until #59 nothing in the
 * dev app showed an active item existed at all short of reading `O`'s debug
 * overlay.
 *
 * `main.ts` passes the current button prompt in on every `sync` rather than
 * this class computing one itself — `app/input/glyphs.ts`'s `actionPrompt`
 * needs the sampler's live `bindings` and `activeDevice`, neither of which
 * this render-only class has any business reaching for, the same "screen
 * space, HUD reads sim state, input state stays in `main.ts`" split every
 * other HUD piece here already keeps.
 *
 * Per-item icons are still `ItemDefinition.sprite`'s job (#34) and do not
 * exist; what #154 replaces is the *slot* — a plain tinted square became the
 * kit's slot frame with a star in it, so an empty slot and a filled one read
 * as the same object in two states rather than as a coloured square that
 * came and went. The tint still carries readiness, because a charged item is
 * worth noticing at a glance rather than on a close read of the bar.
 */
export class ActiveItemHud {
  readonly view = new Container();

  private readonly kit: UiKit;
  private readonly icon: Sprite;
  private readonly barFill: Sprite;
  private readonly label: BitmapText;

  private heldId: string | null = null;

  constructor(kit: UiKit) {
    this.kit = kit;

    const slot = kit.slotSprite(SLOT_SIZE, SLOT_SIZE);
    this.view.addChild(slot);

    const starSize = kit.iconSize('star');
    this.icon = new Sprite(kit.icon('star', iconRoles(HUD_PALETTE.activeItemCharging)));
    this.icon.position.set(
      Math.floor((SLOT_SIZE - starSize.width) / 2),
      Math.floor((SLOT_SIZE - starSize.height) / 2),
    );
    this.view.addChild(this.icon);

    const barX = SLOT_SIZE + GAP;
    this.label = uiText('');
    this.label.position.set(barX, 0);
    this.view.addChild(this.label);

    const well = this.kit.wellSprite(BAR_WIDTH, BAR_HEIGHT);
    well.position.set(barX, UI_TEXT_HEIGHT + 1);
    this.view.addChild(well);

    this.barFill = new Sprite(kit.solid);
    this.barFill.position.set(barX + BAR_INSET, UI_TEXT_HEIGHT + 1 + BAR_INSET);
    this.barFill.height = BAR_HEIGHT - BAR_INSET * 2;
    this.view.addChild(this.barFill);

    this.view.visible = false;
  }

  /**
   * `activatePrompt` is a formatted button label (`app/input/glyphs.ts`'s
   * `actionPrompt`) or `null` when the `use` action has nothing bound on
   * the player's current device — shown as "unbound" rather than silently
   * dropped, the same reasoning `actionPrompt`'s own doc comment gives for
   * returning `null` instead of an empty string.
   */
  sync(sim: GameSim, activatePrompt: string | null): void {
    const id = sim.heldActiveItemId();
    this.heldId = id;
    if (id === null) {
      this.view.visible = false;
      return;
    }
    this.view.visible = true;

    const item = sim.items.get(id);
    const maxCharge = item.active?.maxCharge ?? 1;
    const charge = Math.max(0, sim.itemState(id).charge);
    const ratio = Math.min(1, charge / maxCharge);
    // #32: a `rausch`/`sober` active item outside its own tier cannot fire —
    // `GameSim.useActiveItem` gates it the same way every other hook is
    // gated — so "ready" has to mean "charged AND currently allowed to go
    // off," not charge alone, or this bar would read "press now" for a
    // button press that does nothing.
    const requirementMet = promilleRequirementMet(item.promilleRequirement, sim.promilleTier);
    const ready = ratio >= 1 && requirementMet;
    const dormant = !requirementMet;

    this.barFill.width = Math.max(0, (BAR_WIDTH - BAR_INSET * 2) * ratio);
    const tint = dormant
      ? HUD_PALETTE.activeItemDormant
      : ready
        ? HUD_PALETTE.activeItemReady
        : HUD_PALETTE.activeItemCharging;
    // A dormant item shows the padlock rather than the star: the same
    // "shape first, colour second" rule the minimap icons follow, so the
    // state survives being read on a bad monitor or by a colourblind player.
    this.icon.texture = this.kit.icon(dormant ? 'lock' : 'star', iconRoles(tint));
    this.barFill.tint = tint;

    const prompt = activatePrompt ?? 'unbound';
    const percent = Math.round(ratio * 100);
    this.label.text = dormant
      ? `${item.name} (${item.promilleRequirement})`
      : ready
        ? `${item.name} [${prompt}]`
        : `${item.name} ${String(percent)}%`;
  }

  /** The item this HUD is currently showing, or `null` — for tests. */
  get shownItemId(): string | null {
    return this.heldId;
  }

  /** Height of the block in UI pixels. */
  get height(): number {
    return SLOT_SIZE;
  }
}
