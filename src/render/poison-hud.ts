import { Container, Sprite, type BitmapText } from './gfx/index.js';
import type { GameSim } from '../sim/game/sim.js';
import { STATUS_EFFECT_STRIDE, STATUS_POISON } from '../sim/systems/status-effects.js';
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
 * The player's poison readout (#401): a green label with the seconds left and
 * a bar draining in a well, shown only while poisoned.
 *
 * Lives in the screen-space HUD column like every other readout, so a
 * darkness room — which dims the world, not the HUD — never hides it. The
 * player's green tint (`player-view.ts`) says *that* they are poisoned; this
 * says for how long and, in its label, what cures it.
 */
export class PoisonHud {
  readonly view = new Container();

  private readonly barFill: Sprite;
  private readonly label: BitmapText;
  private locale: Locale;
  private lastSim: GameSim | null = null;

  constructor(kit: UiKit, locale: Locale) {
    this.locale = locale;
    this.label = uiText('');
    this.label.tint = HUD_PALETTE.poison;
    this.view.addChild(this.label);

    const well = kit.wellSprite(BAR_WIDTH, BAR_HEIGHT);
    well.position.set(0, UI_TEXT_HEIGHT + 1);
    this.view.addChild(well);

    this.barFill = new Sprite(kit.solid);
    this.barFill.tint = HUD_PALETTE.poison;
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
    const ticks =
      sim.statusEffect.data[sim.playerIndex * STATUS_EFFECT_STRIDE + STATUS_POISON] ?? 0;
    if (ticks <= 0 || sim.playerDead) {
      this.view.visible = false;
      return;
    }
    this.view.visible = true;
    const full = Math.max(1, sim.tuning.projectileTags.playerPoisonDurationTicks);
    const ratio = Math.min(1, ticks / full);
    this.barFill.width = Math.max(0, (BAR_WIDTH - BAR_INSET * 2) * ratio);
    this.label.text = t(this.locale, 'ui.hud.poisoned', {
      seconds: Math.ceil(ticks / TICKS_PER_SECOND),
    });
  }

  /** Height of the block in UI pixels. */
  get height(): number {
    return UI_TEXT_HEIGHT + 1 + BAR_HEIGHT;
  }
}
