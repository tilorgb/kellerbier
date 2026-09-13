import { Container, Graphics, type BitmapText } from './gfx/index.js';
import type { Locale } from '../i18n/locale.js';
import { t } from '../i18n/translate.js';
import { EFFECT_PALETTE, HUD_PALETTE, UI_PALETTE } from './palette.js';
import type { UiKit } from './ui/kit.js';
import { Menu, type MenuItem, type MenuScreen } from './ui/menu.js';
import { DisplayTitle, TITLE_STYLES } from './ui/title.js';
import { uiText, uiTextWidth } from './ui/text.js';

/** How much bigger than its authored size the headline is drawn — same scale `GameOverScreen` uses. */
const HEADLINE_SCALE = 3;

/** Padding inside the plate the summary/epilogue sits on. */
const PLATE_PADDING = 8;

const GAP_ABOVE_MENU = 10;

/** Gap between the (now multi-line) epilogue and the summary plate beneath it. */
const GAP_BELOW_EPILOGUE = 16;

/** Margin either side of the epilogue's wrap width, in UI pixels. */
const EPILOGUE_MARGIN = 40;

/** What the screen shows. Assembled by whoever tracks the run, not read from `GameSim` directly. */
export interface VictorySummaryText {
  readonly seconds: number;
  readonly kills: number;
  readonly floor: string;
}

export interface VictoryScreenActions {
  readonly onRetry: () => void;
  readonly onResults: () => void;
  readonly onHub: () => void;
}

/**
 * The victory screen (#155): clearing Der Stier — the last boss the game
 * has today — ends the run and says so.
 *
 * Same shape as `GameOverScreen`, on purpose: a dim over the game, a
 * headline in the display face, a summary plate, a `Menu` (#158) in place of
 * the old two-key hint. The headline takes `TITLE_STYLES.floor` (gold)
 * rather than `threat` (blood) — the one other place a title this size
 * appears — so a win reads as a different feeling from a death rather than a
 * re-skinned loss screen.
 *
 * The epilogue carries #58's chapter-two cliffhanger and its "more to come"
 * frame: Der Stier falling and the delivery lorry pulling out of the square
 * are the direction the ending promises, without saying what is upstream —
 * `docs/CONTENT_BIBLE.md`'s own acceptance bar for it is a playtester
 * calling it a cliffhanger unprompted. It stays plain text rather than a
 * dedicated illustrated card (the `StoryCard` shape `startRun`'s opening
 * beat uses): the win screen already is the "moment of quiet" #155 asks
 * for, and stacking a second full-frame card behind it would cost the
 * player another skip for prose that reads fine as an epilogue. A matching
 * illustrated ending card is the natural follow-up once art exists for the
 * scene, the same way the title screen graduated from block art to a real
 * backdrop.
 */
export class VictoryScreen implements MenuScreen {
  readonly view = new Container();

  private readonly actions: VictoryScreenActions;
  private readonly dim: Graphics;
  private readonly plate: Container;
  private readonly headline: DisplayTitle;
  private epilogue: BitmapText;
  private readonly summary: BitmapText;
  private readonly menu: Menu;
  private readonly kit: UiKit;
  private locale: Locale;
  private lastInfo: VictorySummaryText | null = null;
  private width = 0;
  private height = 0;
  private epilogueWrapWidth = 0;

  constructor(kit: UiKit, actions: VictoryScreenActions, locale: Locale) {
    this.kit = kit;
    this.actions = actions;
    this.locale = locale;
    this.view.visible = false;

    this.dim = new Graphics();
    this.view.addChild(this.dim);

    this.plate = new Container();
    this.view.addChild(this.plate);

    this.headline = new DisplayTitle(TITLE_STYLES.floor);
    this.headline.view.scale.set(HEADLINE_SCALE);
    this.headline.set(t(locale, 'ui.victory.headline'));
    this.view.addChild(this.headline.view);

    // Built for real in `layOut`, once a wrap width is known — same
    // rebuild-on-wrapWidth-change reason `StoryCard`'s own body text gives:
    // `BitmapText`'s word-wrap is fixed at construction.
    this.epilogue = uiText('', { colour: UI_PALETTE.text, align: 'center' });
    this.view.addChild(this.epilogue);

    this.summary = uiText('', { colour: HUD_PALETTE.gameOverSummary });
    this.view.addChild(this.summary);

    this.menu = new Menu(kit, this.menuItems());
    this.view.addChild(this.menu.view);
  }

  private menuItems(): MenuItem[] {
    const locale = this.locale;
    const actions = this.actions;
    return [
      { label: t(locale, 'ui.victory.retry'), onSelect: actions.onRetry },
      { label: t(locale, 'ui.victory.results'), onSelect: actions.onResults },
      { label: t(locale, 'ui.victory.hub'), onSelect: actions.onHub },
    ];
  }

  private applySummary(info: VictorySummaryText): void {
    this.summary.text = t(this.locale, 'ui.victory.summary', {
      seconds: info.seconds.toFixed(1),
      kills: info.kills,
      floor: info.floor,
    });
  }

  /** Rebuilds every label in `locale` — call whenever the player changes the language. */
  setLocale(locale: Locale): void {
    this.locale = locale;
    this.headline.set(t(locale, 'ui.victory.headline'));
    this.menu.setItems(this.menuItems());
    if (this.lastInfo !== null) {
      this.applySummary(this.lastInfo);
    }
    if (this.view.visible) {
      this.layOut();
    }
  }

  get visible(): boolean {
    return this.view.visible;
  }

  show(info: VictorySummaryText): void {
    this.lastInfo = info;
    this.applySummary(info);
    this.view.visible = true;
    this.menu.refresh();
    this.layOut();
  }

  hide(): void {
    this.view.visible = false;
  }

  moveFocus(delta: 1 | -1): void {
    this.menu.moveFocus(delta);
  }

  activate(): void {
    this.menu.activate();
  }

  /** Call on every resize, same as the HUD's own layout pass. Dimensions in UI pixels. */
  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    if (this.view.visible) {
      this.layOut();
    }
  }

  private layOut(): void {
    const { width, height } = this;

    this.dim.clear();
    this.dim.rect(0, 0, width, height).fill({ color: EFFECT_PALETTE.gameOverDim, alpha: 0.78 });

    const centreX = width / 2;
    const centreY = height / 2;

    this.headline.place(centreX, Math.round(centreY - this.headline.height * HEADLINE_SCALE - 34));

    const epilogueText = t(this.locale, 'ui.victory.epilogue');
    const wrapWidth = Math.max(1, width - EPILOGUE_MARGIN * 2);
    if (wrapWidth !== this.epilogueWrapWidth) {
      this.epilogueWrapWidth = wrapWidth;
      this.view.removeChild(this.epilogue);
      this.epilogue.destroy();
      this.epilogue = uiText(epilogueText, { colour: UI_PALETTE.text, align: 'center', wrapWidth });
      this.view.addChild(this.epilogue);
    } else if (this.epilogue.text !== epilogueText) {
      this.epilogue.text = epilogueText;
    }

    const epilogueTop = Math.round(centreY - (this.headline.height * HEADLINE_SCALE) / 2 + 10);
    this.epilogue.position.set(Math.round(centreX - this.epilogue.width / 2), epilogueTop);

    const summaryWidth = uiTextWidth(this.summary.text);
    const plateWidth = Math.max(summaryWidth, this.menu.width) + PLATE_PADDING * 2;
    const plateHeight = PLATE_PADDING * 3 + this.summary.height + GAP_ABOVE_MENU + this.menu.height;
    const plateX = Math.round(centreX - plateWidth / 2);
    const plateY = Math.round(epilogueTop + this.epilogue.height + GAP_BELOW_EPILOGUE);

    this.plate.removeChildren();
    const panel = this.kit.panelSprite(plateWidth, plateHeight);
    this.plate.addChild(panel);
    this.plate.position.set(plateX, plateY);

    this.summary.position.set(Math.round(centreX - summaryWidth / 2), plateY + PLATE_PADDING);
    this.menu.view.position.set(
      Math.round(centreX - this.menu.width / 2),
      plateY + PLATE_PADDING * 2 + this.summary.height + GAP_ABOVE_MENU,
    );
  }
}
