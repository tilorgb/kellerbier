import { Container, Sprite, Text, type Renderer } from 'pixi.js';
import type { GameSim } from '../sim/game/sim.js';
import { promilleRequirementMet } from '../sim/game/promille.js';
import { createBarOutlineTexture, createSolidTexture } from './placeholder-art.js';

const BAR_WIDTH = 40;
const BAR_HEIGHT = 6;
const BAR_PADDING = 1;
const ICON_SIZE = 10;
const ICON_GAP = 4;

const CHARGING_TINT = 0xa89a6a;
const READY_TINT = 0xe8c65a;
/** #32: a `rausch`/`sober` active item outside its tier — grey, distinct from either charging shade above, backed by its own text ("sober only"/"rausch only") rather than colour alone. */
const DORMANT_TINT = 0x6a6a6a;

/**
 * The held active item's readout: a placeholder icon, a charge/"buildup"
 * bar, and which button fires it — #59's item batches are the first content
 * to actually reach `maxCharge`, and until now nothing in the dev app showed
 * an active item existed at all short of reading `O`'s debug overlay.
 *
 * `main.ts` passes the current button prompt in on every `sync` rather than
 * this class computing one itself — `app/input/glyphs.ts`'s `actionPrompt`
 * needs the sampler's live `bindings` and `activeDevice`, neither of which
 * this render-only class has any business reaching for, the same "screen
 * space, HUD reads sim state, input state stays in `main.ts`" split every
 * other HUD piece here already keeps.
 *
 * No icon set exists yet (`ItemDefinition.sprite` is a placeholder key —
 * #34's job to resolve), so the icon is a plain tinted square: dim while
 * charging, bright gold the instant `useActiveItem` would actually fire.
 * That tint is the one piece of state duplicated outside the bar on
 * purpose — a charged item is worth noticing at a glance, not only on a
 * close read of the bar.
 */
export class ActiveItemHud {
  readonly view = new Container();

  private readonly icon: Sprite;
  private readonly barFill: Sprite;
  private readonly label: Text;

  private heldId: string | null = null;

  constructor(renderer: Renderer) {
    this.icon = new Sprite(createSolidTexture(renderer));
    this.icon.width = ICON_SIZE;
    this.icon.height = ICON_SIZE;
    this.icon.position.set(0, 0);
    this.view.addChild(this.icon);

    const barX = ICON_SIZE + ICON_GAP;
    const outline = new Sprite(createBarOutlineTexture(renderer, BAR_WIDTH, BAR_HEIGHT));
    outline.position.set(barX, 0);
    this.view.addChild(outline);

    this.barFill = new Sprite(createSolidTexture(renderer));
    this.barFill.position.set(barX + BAR_PADDING, BAR_PADDING);
    this.barFill.height = BAR_HEIGHT - BAR_PADDING * 2;
    this.view.addChild(this.barFill);

    this.label = new Text({
      text: '',
      style: { fill: 0xe8dfd0, fontFamily: 'monospace', fontSize: 9 },
    });
    this.label.position.set(barX + BAR_WIDTH + 6, -2);
    this.view.addChild(this.label);

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

    this.barFill.width = Math.max(0, (BAR_WIDTH - BAR_PADDING * 2) * ratio);
    const tint = dormant ? DORMANT_TINT : ready ? READY_TINT : CHARGING_TINT;
    this.icon.tint = tint;
    this.barFill.tint = tint;

    const prompt = activatePrompt ?? 'unbound';
    const percent = Math.round(ratio * 100);
    this.label.text = dormant
      ? `${item.name}  (${item.promilleRequirement} only)`
      : ready
        ? `${item.name}  [${prompt}]`
        : `${item.name}  ${String(percent)}%`;
  }

  /** The item this HUD is currently showing, or `null` — for tests. */
  get shownItemId(): string | null {
    return this.heldId;
  }
}
