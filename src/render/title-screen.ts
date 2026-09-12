import { Container, Graphics, Sprite, type BitmapText } from './gfx/index.js';
import type { Locale } from '../i18n/locale.js';
import { t } from '../i18n/translate.js';
import { TITLE_PALETTE, UI_PALETTE } from './palette.js';
import type { UiKit } from './ui/kit.js';
import { keyArtHeight, keyArtTexture, keyArtWidth, type KeyArt } from './ui/key-art.js';
import { TITLE_KEY_ART } from './ui/title-key-art.js';
import { Menu, type MenuItem, type MenuScreen } from './ui/menu.js';
import { UI_LINE_HEIGHT, uiText, uiTextWidth } from './ui/text.js';
import { DisplayTitle, TITLE_STYLES } from './ui/title.js';

/** How much bigger than its authored size the name is drawn, when there is room for it. */
const HEADLINE_SCALE = 2;

const MARGIN = 24;
/** Between the menu column and the pane beside it. */
const COLUMN_GAP = 24;
const MENU_MIN_WIDTH = 148;
const GAP_UNDER_HEADLINE = 12;
/** Below this the right pane is not worth drawing a poster into, and the layout centres instead. */
const MIN_PANE_WIDTH = 200;

export interface TitleScreenActions {
  readonly onStart: () => void;
  readonly onContinue: () => void;
  readonly onSettings: () => void;
  readonly onCredits: () => void;
  readonly onQuit: () => void;
  /** Re-checked on every `show()` — whether a save exists to resume into. */
  readonly canContinue: () => boolean;
}

export interface TitleScreenOptions {
  /** Overridable so a specimen tool or a test can draw the layout without the real poster. */
  readonly keyArt?: KeyArt;
}

/**
 * The title screen: the first thing anyone sees, and the one screen in the
 * game a stranger judges it by before playing at all.
 *
 * ## Why it is not shaped like the pause menu
 *
 * It used to be: a dim, a centred headline, a centred column of buttons —
 * `PauseScreen`'s layout with a different word at the top. That reads as a
 * pause menu that happens to be up at boot. A front door and an interruption
 * want opposite things: pause is *over* a run and should show as much of it as
 * it can, so it stays centred, small and translucent; the title screen has no
 * run behind it to respect and should fill the frame.
 *
 * So the two diverge deliberately. This is opaque, edge to edge, and split:
 * the choices down the left in the display face (`docs/DECISIONS.md` #44 —
 * nothing is shooting at anyone here), the game's name and its poster filling
 * everything to the right. `PauseScreen` keeps the centred dim it always had.
 *
 * ## The right pane is a pane, not a picture
 *
 * Opening Settings from here does not put a dialog over the screen — it hands
 * the right pane to `SettingsScreen`, and the name and poster step aside for
 * as long as it is up. The menu column stays exactly where it was, so the
 * screen never jumps and there is never a question about what the Escape key
 * goes back to. `contentBox` is the seam: this screen owns the geometry and
 * hands the rectangle out; `ScreenFlowController` puts the settings panel in
 * it.
 */
export class TitleScreen implements MenuScreen {
  readonly view = new Container();

  private readonly actions: TitleScreenActions;
  private readonly background: Graphics;
  private readonly headline: DisplayTitle;
  private readonly art: Sprite;
  private readonly artScale: number;
  private readonly footer: BitmapText;
  private readonly menu: Menu;
  private width = 0;
  private height = 0;
  private headlineScale = HEADLINE_SCALE;
  private settingsOpen = false;
  private pane = { x: 0, y: 0, width: 0, height: 0 };

  constructor(
    kit: UiKit,
    actions: TitleScreenActions,
    locale: Locale,
    options: TitleScreenOptions = {},
  ) {
    this.actions = actions;
    this.view.visible = false;

    this.background = new Graphics();
    this.view.addChild(this.background);

    const keyArt = options.keyArt ?? TITLE_KEY_ART;
    this.artScale = keyArt.scale;
    this.art = new Sprite(keyArtTexture(keyArt));
    this.art.scale.set(this.artScale);
    this.view.addChild(this.art);

    // `title.ts`'s own doc comment names `TITLE_STYLES.floor` for "the game's
    // own name" alongside a floor's intro card — this is that name. The
    // game's own title is a proper noun, unchanged in every locale, the
    // same rule an item's name follows (`docs/CONTENT_BIBLE.md` §0).
    this.headline = new DisplayTitle(TITLE_STYLES.floor);
    this.headline.set('Kellerbier');
    this.view.addChild(this.headline.view);

    this.menu = new Menu(kit, this.menuItems(locale), {
      face: 'display',
      minWidth: MENU_MIN_WIDTH,
    });
    this.view.addChild(this.menu.view);

    this.footer = uiText(t(locale, 'ui.title.tagline'), { colour: UI_PALETTE.textDim });
    this.view.addChild(this.footer);
  }

  private menuItems(locale: Locale): MenuItem[] {
    const actions = this.actions;
    return [
      { label: t(locale, 'ui.title.start'), onSelect: actions.onStart },
      {
        label: t(locale, 'ui.title.continue'),
        onSelect: actions.onContinue,
        disabled: () => !actions.canContinue(),
      },
      { label: t(locale, 'ui.title.settings'), onSelect: actions.onSettings },
      { label: t(locale, 'ui.title.credits'), onSelect: actions.onCredits },
      { label: t(locale, 'ui.title.quit'), onSelect: actions.onQuit },
    ];
  }

  /** Rebuilds the menu's labels and the footer tagline in `locale` — call whenever the player changes the language. */
  setLocale(locale: Locale): void {
    this.menu.setItems(this.menuItems(locale));
    this.footer.text = t(locale, 'ui.title.tagline');
    if (this.view.visible) {
      this.layOut();
    }
  }

  get visible(): boolean {
    return this.view.visible;
  }

  show(): void {
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

  /**
   * The rectangle the settings panel takes over, in UI pixels — valid only
   * after a `resize`.
   */
  contentBox(): { x: number; y: number; width: number; height: number } {
    return { ...this.pane };
  }

  /** Steps the name and poster aside (or brings them back) while settings has the pane. */
  setSettingsOpen(open: boolean): void {
    this.settingsOpen = open;
    if (this.view.visible) {
      this.layOut();
    }
  }

  /** Call on every resize, same as the HUD's own layout pass. Dimensions in UI pixels. */
  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.layOut();
  }

  private layOut(): void {
    const { width, height } = this;
    if (width <= 0 || height <= 0) {
      return;
    }

    // Opaque, not a dim: there is no run behind the title screen, and letting
    // the last frame of one show through is what made this read as a pause
    // menu. The two-tone split is the whole of the "chrome" — a hard vertical
    // edge where the menu column meets the poster.
    const menuWidth = this.menu.width;
    const columnRight = MARGIN + menuWidth + COLUMN_GAP;
    this.background.clear();
    this.background.rect(0, 0, width, height).fill({ color: TITLE_PALETTE.cardEdge });
    this.background
      .rect(columnRight, 0, width - columnRight, height)
      .fill({ color: TITLE_PALETTE.cardBackdrop });
    this.background.rect(columnRight - 1, 0, 1, height).fill({ color: TITLE_PALETTE.ruleShade });

    const menuTop = Math.round(height / 2 - this.menu.height / 2);
    this.menu.view.position.set(MARGIN, menuTop);
    this.footer.position.set(MARGIN, height - MARGIN + 2);

    const paneLeft = columnRight + COLUMN_GAP;
    const paneWidth = width - paneLeft - MARGIN;
    this.pane = { x: paneLeft, y: MARGIN, width: paneWidth, height: height - MARGIN * 2 };

    this.headline.view.visible = !this.settingsOpen;
    this.art.visible = !this.settingsOpen;
    if (this.settingsOpen) {
      return;
    }

    // The name at 2× is the intent; a frame too narrow for it (a large text
    // scale, a very small window) drops to 1× rather than overflowing the
    // pane, which is `docs/DECISIONS.md` #19's graceful degradation applied to
    // a layout rather than to content.
    this.headlineScale = this.headline.width * HEADLINE_SCALE <= paneWidth ? HEADLINE_SCALE : 1;
    this.headline.view.scale.set(this.headlineScale);
    const paneCentreX = Math.round(paneLeft + paneWidth / 2);
    const headlineHeight = this.headline.height * this.headlineScale;

    const artWidth = keyArtWidth(TITLE_KEY_ART) * this.artScale;
    const artHeight = keyArtHeight(TITLE_KEY_ART) * this.artScale;
    const blockHeight = headlineHeight + GAP_UNDER_HEADLINE + artHeight;
    const top = Math.round(MARGIN + (height - MARGIN * 2 - blockHeight) / 2);

    this.headline.place(paneCentreX, top);
    this.art.visible = paneWidth >= MIN_PANE_WIDTH && artHeight + headlineHeight < height;
    this.art.position.set(
      Math.round(paneCentreX - artWidth / 2),
      Math.round(top + headlineHeight + GAP_UNDER_HEADLINE),
    );
  }

  /** How wide the footer line draws — the layout keeps the menu column at least this wide. */
  get footerWidth(): number {
    return Math.max(uiTextWidth(this.footer.text), UI_LINE_HEIGHT);
  }
}
