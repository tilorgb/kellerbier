import { Container, type BitmapText } from './gfx/index.js';
import type { Locale } from '../i18n/locale.js';
import { t } from '../i18n/translate.js';
import { uiText, UI_TEXT_HEIGHT } from './ui/text.js';

const ROW_HEIGHT = UI_TEXT_HEIGHT + 1;

/** The actions this readout lists, top to bottom. */
export const CONTROLS_HUD_ACTIONS = ['bomb', 'use', 'map'] as const;
export type ControlsHudAction = (typeof CONTROLS_HUD_ACTIONS)[number];

/** One button label per listed action, or `null` when nothing is bound. */
export type ControlsHudPrompts = Readonly<Record<ControlsHudAction, string | null>>;

const ACTION_KEYS = {
  bomb: 'ui.settings.action.bomb',
  use: 'ui.settings.action.use',
  map: 'ui.settings.action.map',
} as const;

/**
 * A permanent "which button does what" list for Bomb, Use and Map,
 * following the player's current bindings and active device.
 *
 * Like `ActiveItemHud`, the button labels come in through `sync` from
 * `main.ts` — `app/input/glyphs.ts`'s `actionPrompt` needs the sampler's live
 * bindings and device, which a render-only class has no business reaching
 * for. A row's text is only rewritten when it actually changes, since this
 * syncs every rendered frame.
 */
export class ControlsHud {
  readonly view = new Container();
  readonly height = CONTROLS_HUD_ACTIONS.length * ROW_HEIGHT;

  private readonly labels: BitmapText[] = [];
  private readonly shown: string[] = [];
  private locale: Locale;
  private lastPrompts: ControlsHudPrompts | null = null;

  constructor(locale: Locale) {
    this.locale = locale;
    CONTROLS_HUD_ACTIONS.forEach((_, index) => {
      const label = uiText('');
      label.position.set(0, index * ROW_HEIGHT);
      this.view.addChild(label);
      this.labels.push(label);
      this.shown.push('');
    });
  }

  /** Rebuilds the labels in `locale` — call whenever the player changes the language. */
  setLocale(locale: Locale): void {
    this.locale = locale;
    if (this.lastPrompts !== null) {
      this.sync(this.lastPrompts);
    }
  }

  sync(prompts: ControlsHudPrompts): void {
    this.lastPrompts = prompts;
    const locale = this.locale;
    CONTROLS_HUD_ACTIONS.forEach((action, index) => {
      const button = prompts[action] ?? t(locale, 'ui.hud.unbound');
      const text = `[${button}] ${t(locale, ACTION_KEYS[action])}`;
      if (this.shown[index] !== text) {
        this.shown[index] = text;
        const label = this.labels[index];
        if (label !== undefined) {
          label.text = text;
        }
      }
    });
  }
}
