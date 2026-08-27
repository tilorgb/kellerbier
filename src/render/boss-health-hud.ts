import { Container, Sprite, Text, type Renderer } from 'pixi.js';
import type { GameSim } from '../sim/game/sim.js';
import { createBarOutlineTexture, createSolidTexture } from './placeholder-art.js';

const BAR_WIDTH = 140;
const BAR_HEIGHT = 8;
const BAR_PADDING = 1;

/**
 * A boss room's health bar (#36) — top-centre, screen-space, and hidden
 * outside a boss encounter entirely rather than shown empty.
 *
 * Reads `GameSim.bossHealth`, which sums every enemy still counted toward
 * `roomEnemyCount` in a boss room — the same bodies the door lock itself
 * counts. That is what makes this HUD framework-level rather than Die Große
 * Kellerassel's own: it fills and empties correctly whether the room holds
 * one boss body or three split segments, for this boss or any later one,
 * with nothing here naming either.
 *
 * No name label: three independent bodies mid-fight have no one name to
 * show, and a framework piece should not need one to make sense.
 */
export class BossHealthHud {
  readonly view = new Container();

  private readonly fill: Sprite;
  private readonly label: Text;

  constructor(renderer: Renderer) {
    const outline = new Sprite(createBarOutlineTexture(renderer, BAR_WIDTH, BAR_HEIGHT));
    outline.position.set(-BAR_WIDTH / 2, 0);
    this.view.addChild(outline);

    this.fill = new Sprite(createSolidTexture(renderer));
    this.fill.tint = 0xb23a3a;
    this.fill.position.set(-BAR_WIDTH / 2 + BAR_PADDING, BAR_PADDING);
    this.fill.height = BAR_HEIGHT - BAR_PADDING * 2;
    this.view.addChild(this.fill);

    this.label = new Text({
      text: 'BOSS',
      style: { fill: 0xe8dfd0, fontFamily: 'monospace', fontSize: 9, fontWeight: 'bold' },
    });
    this.label.anchor.set(0.5, 1);
    this.label.position.set(0, -2);
    this.view.addChild(this.label);

    this.view.visible = false;
  }

  sync(sim: GameSim): void {
    const boss = sim.bossHealth;
    this.view.visible = boss !== null;
    if (boss === null || boss.max <= 0) {
      return;
    }
    const ratio = Math.min(1, Math.max(0, boss.current / boss.max));
    this.fill.width = Math.max(0, (BAR_WIDTH - BAR_PADDING * 2) * ratio);
  }
}
