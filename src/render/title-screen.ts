import { Container, Sprite, type BitmapText, type Texture } from './gfx/index.js';
import type { Locale } from '../i18n/locale.js';
import { t } from '../i18n/translate.js';
import { UI_PALETTE } from './palette.js';
import type { UiKit } from './ui/kit.js';
import { ornamentTexture } from './ui/ornament.js';
import { Menu, type MenuItem, type MenuScreen } from './ui/menu.js';
import { UI_LINE_HEIGHT, uiText, uiTextWidth } from './ui/text.js';
import { DisplayTitle, TITLE_STYLES } from './ui/title.js';
import { Postcard } from './postcard.js';
import { postcardBoxWithin } from './ui/postcard-paper.js';

/** How much bigger than its authored size the name is drawn, when there is room for it. */
const HEADLINE_SCALE = 2;

const MARGIN = 24;
/** Between the menu column and the pane beside it. */
const COLUMN_GAP = 24;
const MENU_MIN_WIDTH = 148;
const GAP_UNDER_HEADLINE = 12;
/**
 * `assets/art/title/postcard.png`'s native 832×1216, which the card's own box
 * is sized around — the card is the picture's box plus the paper margins and
 * the franked foot, which is what `postcardBoxWithin` works out. `Postcard`
 * fits whatever texture it is actually given to its own window, so a
 * different-aspect replacement still renders correctly, just with the paper
 * margins absorbing the difference.
 */
const TITLE_ART_ASPECT = 832 / 1216;

export interface TitleScreenActions {
  readonly onStart: () => void;
  readonly onContinue: () => void;
  readonly onSettings: () => void;
  readonly onCredits: () => void;
  readonly onQuit: () => void;
  /** Re-checked on every `show()` — whether a save exists to resume into. */
  readonly canContinue: () => boolean;
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
 * So the two diverge deliberately. This is opaque, edge to edge, and laid
 * out in two columns — the choices down the left in the display face
 * (`docs/DECISIONS.md` #44 — nothing is shooting at anyone here), the game's
 * name and its postcard to the right — but the same wallpaper runs under
 * both columns with nothing drawn between them. An earlier pass darkened the
 * menu column with its own scrim and a hard rule at the seam, which read as
 * two panels glued together rather than one scene; dropping that is what
 * makes the choices feel like they are standing on the same postcard-covered
 * table as the picture beside them, not boxed off from it.
 *
 * ## A wallpaper and a postcard, not a full-bleed photo
 *
 * The screen used to swap a procedural poster for one full-bleed illustrated
 * backdrop once a real PNG loaded (#322) — the whole frame became the
 * picture. That is retired: the background is now `ornamentTexture`'s
 * Rautenmuster, drawn at boot and never anything else, and the game's own
 * motif sits in a discrete `Postcard` in the right pane instead of stretched
 * behind everything. The same postcard object is what `StoryCard` puts a
 * story beat's illustration inside — the title screen, the opening, and any
 * future chapter card are one physical object with a different picture in
 * it, not three different treatments.
 *
 * `setPostcardArt` is the one asset swap left: the postcard's frame and the
 * wallpaper behind it are both up from the very first frame (one is a
 * repeating pattern, the other has no picture in it yet), and a real
 * illustration fades into the card once it loads — the same
 * never-block-boot-on-it shape `docs/DECISIONS.md` #19 asks for a content
 * gap, applied to an asset fetch instead.
 *
 * ## The right pane is a pane, not a picture
 *
 * Opening Settings from here does not put a dialog over the screen — it hands
 * the right pane to `SettingsScreen`, and the name and postcard step aside for
 * as long as it is up. The menu column stays exactly where it was, so the
 * screen never jumps and there is never a question about what the Escape key
 * goes back to. `contentBox` is the seam: this screen owns the geometry and
 * hands the rectangle out; `ScreenFlowController` puts the settings panel in
 * it.
 */
export class TitleScreen implements MenuScreen {
  readonly view = new Container();

  private readonly actions: TitleScreenActions;
  private readonly wallpaper = new Sprite();
  private readonly headline: DisplayTitle;
  private readonly postcard = new Postcard({ seed: 9 });
  private readonly footer: BitmapText;
  private readonly menu: Menu;
  private width = 0;
  private height = 0;
  private headlineScale = HEADLINE_SCALE;
  private settingsOpen = false;
  private pane = { x: 0, y: 0, width: 0, height: 0 };
  private wallpaperWidth = -1;
  private wallpaperHeight = -1;

  constructor(kit: UiKit, actions: TitleScreenActions, locale: Locale) {
    this.actions = actions;
    this.view.visible = false;

    this.view.addChild(this.wallpaper);

    // `title.ts`'s own doc comment names `TITLE_STYLES.floor` for "the game's
    // own name" alongside a floor's intro card — this is that name. The
    // game's own title is a proper noun, unchanged in every locale, the
    // same rule an item's name follows (`docs/CONTENT_BIBLE.md` §0).
    this.headline = new DisplayTitle(TITLE_STYLES.floor);
    this.headline.set('Kellerbier');
    this.view.addChild(this.headline.view);

    this.view.addChild(this.postcard.view);

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

  /**
   * Swaps a real illustration into the title postcard once one has finished
   * loading — see the class doc comment's wallpaper-and-postcard note. Safe
   * to call before the first `show()`/`resize()`; the next layout pass
   * picks it up.
   */
  setPostcardArt(texture: Texture): void {
    this.postcard.setArt(texture);
  }

  /** Steps the name and postcard aside (or brings them back) while settings has the pane. */
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

    if (width !== this.wallpaperWidth || height !== this.wallpaperHeight) {
      const previous = this.wallpaper.texture;
      this.wallpaper.texture = ornamentTexture(width, height);
      this.wallpaper.width = width;
      this.wallpaper.height = height;
      if (previous.width > 1) {
        previous.destroy(true);
      }
      this.wallpaperWidth = width;
      this.wallpaperHeight = height;
    }

    const menuWidth = this.menu.width;
    const columnRight = MARGIN + menuWidth + COLUMN_GAP;

    const menuTop = Math.round(height / 2 - this.menu.height / 2);
    this.menu.view.position.set(MARGIN, menuTop);
    this.footer.position.set(MARGIN, height - MARGIN + 2);

    const paneLeft = columnRight + COLUMN_GAP;
    const paneWidth = width - paneLeft - MARGIN;
    this.pane = { x: paneLeft, y: MARGIN, width: paneWidth, height: height - MARGIN * 2 };

    this.headline.view.visible = !this.settingsOpen;
    this.postcard.view.visible = !this.settingsOpen;
    if (this.settingsOpen) {
      return;
    }

    const paneCentreX = Math.round(paneLeft + paneWidth / 2);

    // The name at 2× is the intent; a frame too narrow for it (a large text
    // scale, a very small window) drops to 1× rather than overflowing the
    // pane, which is `docs/DECISIONS.md` #19's graceful degradation applied to
    // a layout rather than to content.
    this.headlineScale = this.headline.width * HEADLINE_SCALE <= paneWidth ? HEADLINE_SCALE : 1;
    this.headline.view.scale.set(this.headlineScale);
    const headlineHeight = this.headline.height * this.headlineScale;
    this.headline.place(paneCentreX, MARGIN);

    const cardTop = MARGIN + headlineHeight + GAP_UNDER_HEADLINE;
    const availWidth = paneWidth;
    const availHeight = height - MARGIN - cardTop;
    const card = postcardBoxWithin(availWidth, availHeight, TITLE_ART_ASPECT);
    const cardX = Math.round(paneLeft + (availWidth - card.width) / 2);
    const cardY = Math.round(cardTop + (availHeight - card.height) / 2);
    this.postcard.view.position.set(cardX, cardY);
    this.postcard.resize(card.width, card.height);
  }

  /** How wide the footer line draws — the layout keeps the menu column at least this wide. */
  get footerWidth(): number {
    return Math.max(uiTextWidth(this.footer.text), UI_LINE_HEIGHT);
  }
}
