import { Container, Sprite, Text, type Renderer } from 'pixi.js';
import type { GameSim } from '../sim/game/sim.js';
import {
  PromilleTier,
  promilleCapFor,
  promilleKaterLabel,
  promilleTierDisplayName,
  promilleUnitSuffix,
  type PromilleTierId,
} from '../sim/game/promille.js';
import { createBarOutlineTexture, createSolidTexture } from './placeholder-art.js';

const BAR_WIDTH = 56;
const BAR_HEIGHT = 6;
const BAR_PADDING = 1;

/**
 * One colour per tier — decoration on top of the tier name text, never the
 * only signal. Sturzbesoffen and Filmriss (#92) get progressively darker,
 * redder shades past Vollrausch's own, so a glance at the bar's colour alone
 * still roughly orders the tiers even before the label is read.
 */
const TIER_COLOR: Readonly<Record<PromilleTierId, number>> = {
  [PromilleTier.Nuchtern]: 0x6fae6f,
  [PromilleTier.Angeheitert]: 0xc9b45a,
  [PromilleTier.Beduselt]: 0xd99a3a,
  [PromilleTier.Vollrausch]: 0xd9603a,
  [PromilleTier.Sturzbesoffen]: 0xb23a3a,
  [PromilleTier.Filmriss]: 0x6a1f2a,
  [PromilleTier.Umgfalln]: 0x8a3a3a,
};

/**
 * Kater overrides the tier colour entirely rather than blending with it —
 * the debuff outlasts the tier that caused it (a player can sober all the
 * way to Nüchtern and still be hungover), so the bar has to read "Kater" on
 * its own rather than as a tint on whatever tier happens to be current.
 */
const KATER_COLOR = 0x5a4a6a;

/**
 * Neutral reskin (#33): the same seven-step readable ordering as
 * `TIER_COLOR`, but blue-through-magenta-to-red — a "power" ramp rather than
 * beer's amber/gold. `Nuchtern`'s green is kept as-is: "all clear, nothing
 * active" doesn't read as alcohol-specific either way.
 */
const NEUTRAL_TIER_COLOR: Readonly<Record<PromilleTierId, number>> = {
  [PromilleTier.Nuchtern]: 0x6fae6f,
  [PromilleTier.Angeheitert]: 0x5aa9c9,
  [PromilleTier.Beduselt]: 0x5a7fc9,
  [PromilleTier.Vollrausch]: 0x8a5ac9,
  [PromilleTier.Sturzbesoffen]: 0xb23ac9,
  [PromilleTier.Filmriss]: 0xd93a6a,
  [PromilleTier.Umgfalln]: 0x8a3a3a,
};

/** Neutral reskin's `KATER_COLOR` — a cool grey rather than Kater's boozy purple. */
const NEUTRAL_KATER_COLOR = 0x4a4a5a;

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
      style: { fill: 0xe8dfd0, fontFamily: 'monospace', fontSize: 9 },
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
    const tierColor = neutralReskin ? NEUTRAL_TIER_COLOR : TIER_COLOR;
    const katerColor = neutralReskin ? NEUTRAL_KATER_COLOR : KATER_COLOR;
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
