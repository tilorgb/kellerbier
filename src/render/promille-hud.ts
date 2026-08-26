import { Container, Sprite, Text, type Renderer } from 'pixi.js';
import type { GameSim } from '../sim/game/sim.js';
import {
  PromilleTier,
  promilleCapFor,
  promilleTierName,
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

  sync(sim: GameSim): void {
    // The bar's own denominator is "how close to falling over," not a fixed
    // scale — at baseline Trinkfest that is `PROMILLE_MAX` exactly (unchanged
    // from pre-#92), and it grows with `promilleCapFor` once Trinkfest is
    // raised, so a full bar always means the same thing regardless of how
    // high tolerance has pushed the ceiling.
    const cap = promilleCapFor(sim.trinkfest, sim.tuning.promille);
    const ratio = Math.min(1, Math.max(0, sim.promille / cap));
    this.fill.width = Math.max(0, (BAR_WIDTH - BAR_PADDING * 2) * ratio);
    this.fill.tint = sim.hasKater ? KATER_COLOR : TIER_COLOR[sim.promilleTier];
    const tierText = `${promilleTierName(sim.promilleTier)} ${sim.promille.toFixed(1)}‰`;
    // Trinkfest itself only earns HUD space once it has actually moved off
    // baseline — showing "Trinkfest 0" on every single run would be clutter
    // for a number that, at baseline, changes nothing about how the bar
    // reads (open design question from #92, resolved this way: always
    // inspectable via the debug tuning window, only shown here when it
    // matters to the player in front of it).
    const trinkfestText =
      sim.trinkfest !== 0 ? ` T${sim.trinkfest > 0 ? '+' : ''}${String(sim.trinkfest)}` : '';
    this.label.text = sim.hasKater
      ? `${tierText} Kater${trinkfestText}`
      : `${tierText}${trinkfestText}`;
  }
}
