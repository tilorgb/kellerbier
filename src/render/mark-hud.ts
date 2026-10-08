import { Container, Sprite, type BitmapText } from './gfx/index.js';
import type { GameSim } from '../sim/game/sim.js';
import type { Locale } from '../i18n/locale.js';
import { t } from '../i18n/translate.js';
import { HUD_PALETTE } from './palette.js';
import type { UiKit } from './ui/kit.js';
import { uiText, UI_TEXT_HEIGHT } from './ui/text.js';

const BAR_WIDTH = 60;
const BAR_HEIGHT = 7;
const BAR_INSET = 2;
const TICKS_PER_SECOND = 60;

/**
 * The flare's mark on the player (#40, the Bergwacht): a pink label with the
 * seconds left and a bar draining in a well, shown only while marked —
 * `PoisonHud`'s shape, for the other thing on the player that is a clock.
 * The player's own glow (`player-view.ts`) says *that* they are marked; this
 * says for how long and, in its label, what it costs: every enemy in the
 * room sees them, cover or no cover.
 */
export class MarkHud {
  readonly view = new Container();

  private readonly barFill: Sprite;
  private readonly label: BitmapText;
  private locale: Locale;
  private lastSim: GameSim | null = null;

  constructor(kit: UiKit, locale: Locale) {
    this.locale = locale;
    this.label = uiText('');
    this.label.tint = HUD_PALETTE.marked;
    this.view.addChild(this.label);

    const well = kit.wellSprite(BAR_WIDTH, BAR_HEIGHT);
    well.position.set(0, UI_TEXT_HEIGHT + 1);
    this.view.addChild(well);

    this.barFill = new Sprite(kit.solid);
    this.barFill.tint = HUD_PALETTE.marked;
    this.barFill.position.set(BAR_INSET, UI_TEXT_HEIGHT + 1 + BAR_INSET);
    this.barFill.height = BAR_HEIGHT - BAR_INSET * 2;
    this.view.addChild(this.barFill);

    this.view.visible = false;
  }

  setLocale(locale: Locale): void {
    this.locale = locale;
    if (this.lastSim !== null) {
      this.sync(this.lastSim);
    }
  }

  sync(sim: GameSim): void {
    this.lastSim = sim;
    const ticks = sim.playerMarked;
    if (ticks <= 0 || sim.playerDead) {
      this.view.visible = false;
      return;
    }
    this.view.visible = true;
    const full = Math.max(1, sim.tuning.projectileTags.playerMarkDurationTicks);
    const ratio = Math.min(1, ticks / full);
    this.barFill.width = Math.max(0, (BAR_WIDTH - BAR_INSET * 2) * ratio);
    this.label.text = t(this.locale, 'ui.hud.marked', {
      seconds: Math.ceil(ticks / TICKS_PER_SECOND),
    });
  }

  /** Height of the block in UI pixels. */
  get height(): number {
    return UI_TEXT_HEIGHT + 1 + BAR_HEIGHT;
  }
}
