import { Container, Sprite, Text, type Renderer } from 'pixi.js';
import type { GameSim } from '../sim/game/sim.js';
import {
  promilleCapFor,
  promilleKaterLabel,
  promilleTierDisplayName,
  promilleUnitSuffix,
} from '../sim/game/promille.js';
import { createBarOutlineTexture, createSolidTexture } from './placeholder-art.js';
import { HUD_PALETTE } from './palette.js';

const BAR_WIDTH = 56;
const BAR_HEIGHT = 6;
const BAR_PADDING = 1;

/**
 * The Promille meter: a fill bar plus its tier name as text.
 *
 * Screen-space, in `uiLayer`, positioned directly under `HealthHud` — same
 * reasoning as every other HUD piece here: never inside anything the camera
 * shakes, so the one thing the player reads their state off of holds still.
 *
 * The tier name is not decorative: it is what keeps this widget from
 * conveying its state by bar colour alone (the #21 acceptance criterion),
 * the same way the mug shapes carry `HealthHud`'s state independent of tint.
 */
export class PromilleHud {
  readonly view = new Container();

  private readonly fill: Sprite;
  private readonly label: Text;

  constructor(renderer: Renderer) {
    const outline = new Sprite(createBarOutlineTexture(renderer, BAR_WIDTH, BAR_HEIGHT));
    this.view.addChild(outline);

    this.fill = new Sprite(createSolidTexture(renderer));
    this.fill.position.set(BAR_PADDING, BAR_PADDING);
    this.fill.height = BAR_HEIGHT - BAR_PADDING * 2;
    this.view.addChild(this.fill);

    this.label = new Text({
      text: '',
      style: { fill: HUD_PALETTE.labelText, fontFamily: 'monospace', fontSize: 9 },
    });
    this.label.position.set(BAR_WIDTH + 6, -2);
    this.view.addChild(this.label);
  }

  /**
   * `neutralReskin` (#33) is `app/settings.ts`'s own flag, read straight
   * through rather than cached on the HUD: nothing here needs to know it
   * changed, only what it currently is, the next time a frame syncs.
   */
  sync(sim: GameSim, neutralReskin: boolean): void {
    // The bar's own denominator is "how close to falling over," not a fixed
    // scale — at baseline Trinkfest that is `PROMILLE_MAX` exactly (unchanged
    // from pre-#92), and it grows with `promilleCapFor` once Trinkfest is
    // raised, so a full bar always means the same thing regardless of how
    // high tolerance has pushed the ceiling.
    const cap = promilleCapFor(sim.trinkfest, sim.tuning.promille);
    const ratio = Math.min(1, Math.max(0, sim.promille / cap));
    this.fill.width = Math.max(0, (BAR_WIDTH - BAR_PADDING * 2) * ratio);
    const tierColor = neutralReskin ? HUD_PALETTE.promilleTierNeutral : HUD_PALETTE.promilleTier;
    const katerColor = neutralReskin ? HUD_PALETTE.promilleKaterNeutral : HUD_PALETTE.promilleKater;
    this.fill.tint = sim.hasKater ? katerColor : tierColor[sim.promilleTier];
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
}
