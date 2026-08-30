import { Container, Sprite, type BitmapText } from 'pixi.js';
import type { GameSim } from '../sim/game/sim.js';
import {
  promilleCapFor,
  promilleKaterLabel,
  promilleTierDisplayName,
  promilleUnitSuffix,
} from '../sim/game/promille.js';
import { HUD_PALETTE, UI_PALETTE } from './palette.js';
import { iconRoles, type UiKit } from './ui/kit.js';
import { uiText, UI_TEXT_HEIGHT } from './ui/text.js';

const BAR_WIDTH = 60;
const BAR_HEIGHT = 9;
/** The well's own border, inside which the fill is drawn. */
const BAR_INSET = 2;
const ICON_GAP = 2;
const LABEL_GAP = 4;

/**
 * The Promille meter: a drop icon, a fill in a sunken well, and the tier name.
 *
 * Screen-space, in `uiLayer`, positioned directly under `HealthHud` — same
 * reasoning as every other HUD piece here: never inside anything the camera
 * shakes, so the one thing the player reads their state off of holds still.
 *
 * The tier name is not decorative: it is what keeps this widget from
 * conveying its state by bar colour alone (the #21 acceptance criterion),
 * the same way the mug shapes carry `HealthHud`'s state independent of tint.
 * #154 adds a third, redundant-on-purpose channel — the drop icon takes the
 * tier's colour too, so the meter reads at a glance from the corner of the
 * eye without the label having to be read at all.
 */
export class PromilleHud {
  readonly view = new Container();

  private readonly kit: UiKit;
  private readonly icon: Sprite;
  private readonly fill: Sprite;
  private readonly label: BitmapText;
  private readonly iconWidth: number;

  constructor(kit: UiKit) {
    this.kit = kit;
    const iconSize = kit.iconSize('promille');
    this.iconWidth = iconSize.width;

    this.icon = new Sprite(kit.icon('promille', iconRoles(UI_PALETTE.accent)));
    this.icon.position.set(0, 0);
    this.view.addChild(this.icon);

    const barX = this.iconWidth + ICON_GAP;
    const well = kit.wellSprite(BAR_WIDTH, BAR_HEIGHT);
    well.position.set(barX, 0);
    this.view.addChild(well);

    this.fill = new Sprite(kit.solid);
    this.fill.position.set(barX + BAR_INSET, BAR_INSET);
    this.fill.height = BAR_HEIGHT - BAR_INSET * 2;
    this.view.addChild(this.fill);

    this.label = uiText('');
    this.label.position.set(barX + BAR_WIDTH + LABEL_GAP, 0);
    this.view.addChild(this.label);
  }

  /**
   * `neutralReskin` (#33) is `app/settings.ts`'s own flag, read straight
   * through rather than cached on the HUD: nothing here needs to know it
   * changed, only what it currently is, the next time a frame syncs.
   */
  sync(sim: GameSim, neutralReskin: boolean): void {
    // A sober run (#85) has no meter at all — not an empty one. `setUnlocked`
    // is what actually hides the row and closes the gap it leaves in the HUD
    // column; this is the guard that stops a frame syncing into a hidden
    // widget, and it is a plain early return because `sim.promilleUnlocked`
    // cannot change under a live run.
    if (!sim.promilleUnlocked) {
      return;
    }
    // The bar's own denominator is "how close to falling over," not a fixed
    // scale — at baseline Trinkfest that is `PROMILLE_MAX` exactly (unchanged
    // from pre-#92), and it grows with `promilleCapFor` once Trinkfest is
    // raised, so a full bar always means the same thing regardless of how
    // high tolerance has pushed the ceiling.
    const cap = promilleCapFor(sim.trinkfest, sim.tuning.promille);
    const ratio = Math.min(1, Math.max(0, sim.promille / cap));
    this.fill.width = Math.max(0, (BAR_WIDTH - BAR_INSET * 2) * ratio);
    const tierColor = neutralReskin ? HUD_PALETTE.promilleTierNeutral : HUD_PALETTE.promilleTier;
    const katerColor = neutralReskin ? HUD_PALETTE.promilleKaterNeutral : HUD_PALETTE.promilleKater;
    const colour = sim.hasKater ? katerColor : tierColor[sim.promilleTier];
    this.fill.tint = colour;
    this.icon.texture = this.kit.icon('promille', iconRoles(colour));

    const tierText = `${promilleTierDisplayName(sim.promilleTier, neutralReskin)} ${sim.promille.toFixed(1)}${promilleUnitSuffix(neutralReskin)}`;
    // Trinkfest itself only earns HUD space once it has actually moved off
    // baseline — showing "Trinkfest 0" on every single run would be clutter
    // for a number that, at baseline, changes nothing about how the bar
    // reads (open design question from #92, resolved this way: always
    // inspectable via the debug tuning window, only shown here when it
    // matters to the player in front of it).
    const trinkfestText =
      sim.trinkfest !== 0 ? ` T${sim.trinkfest > 0 ? '+' : ''}${String(sim.trinkfest)}` : '';
    this.label.text = sim.hasKater
      ? `${tierText} ${promilleKaterLabel(neutralReskin)}${trinkfestText}`
      : `${tierText}${trinkfestText}`;
  }

  /**
   * Shows or hides the whole row for a run (#85).
   *
   * Explicit rather than derived inside `sync`, because `height` is read by
   * `app/main.ts`'s `layoutHud` — which runs once per run start and per
   * resize, not per frame — and it has to already know the answer by then or
   * the HUD column keeps a hole where the meter used to be. `startRun` calls
   * this before `layoutHud` for exactly that reason.
   */
  setUnlocked(unlocked: boolean): void {
    this.view.visible = unlocked;
  }

  /**
   * Height of the row in UI pixels — the taller of the bar and one line of
   * text, and zero while hidden, so the rows below it close up rather than
   * stacking under a gap. `ActiveItemHud` gets away with a constant here
   * because it is second-from-last in the column; this row is second from
   * the top.
   */
  get height(): number {
    return this.view.visible ? Math.max(BAR_HEIGHT, UI_TEXT_HEIGHT) : 0;
  }
}
