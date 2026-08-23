import { Container, Sprite, Text, type Renderer } from 'pixi.js';
import type { GameSim } from '../sim/game/sim.js';
import {
  PROMILLE_MAX,
  PromilleTier,
  promilleTierName,
  type PromilleTierId,
} from '../sim/game/promille.js';
import { createBarOutlineTexture, createSolidTexture } from './placeholder-art.js';

const BAR_WIDTH = 56;
const BAR_HEIGHT = 6;
const BAR_PADDING = 1;

/** One colour per tier — decoration on top of the tier name text, never the only signal. */
const TIER_COLOR: Readonly<Record<PromilleTierId, number>> = {
  [PromilleTier.Nuchtern]: 0x6fae6f,
  [PromilleTier.Angeheitert]: 0xc9b45a,
  [PromilleTier.Beduselt]: 0xd99a3a,
  [PromilleTier.Vollrausch]: 0xd9603a,
  [PromilleTier.Umgfalln]: 0x8a3a3a,
};

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
    const ratio = Math.min(1, Math.max(0, sim.promille / PROMILLE_MAX));
    this.fill.width = Math.max(0, (BAR_WIDTH - BAR_PADDING * 2) * ratio);
    this.fill.tint = TIER_COLOR[sim.promilleTier];
    this.label.text = `${promilleTierName(sim.promilleTier)} ${sim.promille.toFixed(1)}‰`;
  }
}
