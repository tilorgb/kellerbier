import { Container, Sprite, type BitmapText } from 'pixi.js';
import type { GameSim } from '../sim/game/sim.js';
import { HUD_PALETTE, UI_PALETTE } from './palette.js';
import { type UiKit } from './ui/kit.js';
import { uiText, uiTextWidth, UI_TEXT_HEIGHT } from './ui/text.js';

const BAR_WIDTH = 150;
const BAR_HEIGHT = 11;
const BAR_INSET = 2;

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
 * show, and a framework piece should not need one to make sense. The word
 * above the bar is the generic `BOSS`, drawn in the kit's accent so it reads
 * as a heading rather than as a name the game failed to fill in.
 */
export class BossHealthHud {
  readonly view = new Container();

  private readonly fill: Sprite;
  private readonly label: BitmapText;

  constructor(kit: UiKit) {
    const well = kit.wellSprite(BAR_WIDTH, BAR_HEIGHT);
    well.position.set(-BAR_WIDTH / 2, 0);
    this.view.addChild(well);

    this.fill = new Sprite(kit.solid);
    this.fill.tint = HUD_PALETTE.bossHealthFill;
    this.fill.position.set(-BAR_WIDTH / 2 + BAR_INSET, BAR_INSET);
    this.fill.height = BAR_HEIGHT - BAR_INSET * 2;
    this.view.addChild(this.fill);

    this.label = uiText('BOSS', { colour: UI_PALETTE.accent });
    // Positioned rather than anchored: `BitmapText`'s anchor is applied to its
    // whole line box, and the exact centring wanted here is over the bar,
    // which is the thing whose width is known.
    this.label.position.set(-Math.round(uiTextWidth('BOSS') / 2), -UI_TEXT_HEIGHT - 2);
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
    this.fill.width = Math.max(0, (BAR_WIDTH - BAR_INSET * 2) * ratio);
  }
}
