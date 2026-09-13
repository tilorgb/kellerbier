import { Container, type BitmapText } from './gfx/index.js';
import type { Locale } from '../i18n/locale.js';
import { t, type DictKey } from '../i18n/translate.js';
import { UI_PALETTE } from './palette.js';
import { DisplayTitle, TITLE_STYLES } from './ui/title.js';
import { uiText } from './ui/text.js';

const GAP_UNDER_NAME = 6;
const GAP_UNDER_TITLE = 4;

/**
 * The boss room's intro plate (#58/#327): a name, a title and a one-line
 * epithet, replacing the generic "Boss Room" banner this stood in for
 * (#23). Same non-opaque, bare-text-over-the-live-room composition the old
 * banner used — the boss is standing right there, inert for exactly as long
 * as this is up (see `app/main.ts`'s boss-specific warmup window), which is
 * the point: this is a reveal, not a cutscene.
 *
 * `name` keeps the exact `DisplayTitle(TITLE_STYLES.threat)` treatment the
 * old banner had. `title` and `epithet` are in the text face, same
 * reasoning `FloorTitleCard`'s own flavour line gives for staying out of
 * the display face: they are the two lines on this plate actually meant to
 * be read as sentences, not glanced at.
 */
export class BossIntroPlate {
  readonly view = new Container();

  private readonly nameLine: DisplayTitle;
  private titleLine: BitmapText;
  private epithetLine: BitmapText;

  private titleText = '';
  private epithetText = '';
  private wrapWidth = 0;
  private width = 0;

  constructor() {
    this.nameLine = new DisplayTitle(TITLE_STYLES.threat);
    this.view.addChild(this.nameLine.view);

    // Placeholders — rebuilt for real in `layOut`, once a wrap width is
    // known. Same reason `StoryCard`'s own body line does this: a
    // `BitmapText`'s word-wrap is fixed at construction.
    this.titleLine = uiText('', { colour: UI_PALETTE.text, align: 'center' });
    this.view.addChild(this.titleLine);
    this.epithetLine = uiText('', { colour: UI_PALETTE.textDim, align: 'center' });
    this.view.addChild(this.epithetLine);
  }

  /**
   * Shows `name` (already resolved — the room-role text, not a content
   * lookup) with `titleKey`/`epithetKey` resolved via `locale`. Either key
   * may be absent (not every enemy is a boss with a plate authored yet);
   * `show` falls back to just the name in that case, the same "a content
   * gap degrades gracefully" shape `docs/DECISIONS.md` #19 asks for.
   */
  show(name: string, locale: Locale, titleKey?: string, epithetKey?: string): void {
    this.nameLine.set(name);
    this.titleText = titleKey === undefined ? '' : t(locale, titleKey as DictKey);
    this.epithetText = epithetKey === undefined ? '' : t(locale, epithetKey as DictKey);
    this.view.visible = true;
    this.layOut();
  }

  hide(): void {
    this.view.visible = false;
  }

  get visible(): boolean {
    return this.view.visible;
  }

  /** Call on every resize. `width` in UI pixels — height is not needed, this plate is placed by its caller. */
  resize(width: number): void {
    this.width = width;
    if (this.view.visible) {
      this.layOut();
    }
  }

  /** Centres the whole plate on `centreX`, with the name's top at `top`. UI pixels. */
  place(centreX: number, top: number): void {
    this.layOut();
    this.nameLine.place(centreX, top);
    const titleTop = top + this.nameLine.height + GAP_UNDER_NAME;
    this.titleLine.position.set(
      Math.round(centreX - this.titleLine.width / 2),
      Math.round(titleTop),
    );
    const epithetTop = titleTop + this.titleLine.height + GAP_UNDER_TITLE;
    this.epithetLine.position.set(
      Math.round(centreX - this.epithetLine.width / 2),
      Math.round(epithetTop),
    );
  }

  private layOut(): void {
    const wrapWidth = Math.round(this.width * 0.7);
    if (wrapWidth === this.wrapWidth) {
      this.titleLine.text = this.titleText;
      this.epithetLine.text = this.epithetText;
      return;
    }
    this.wrapWidth = wrapWidth;
    this.view.removeChild(this.titleLine);
    this.titleLine.destroy();
    this.titleLine = uiText(this.titleText, {
      colour: UI_PALETTE.text,
      align: 'center',
      wrapWidth,
    });
    this.view.addChild(this.titleLine);

    this.view.removeChild(this.epithetLine);
    this.epithetLine.destroy();
    this.epithetLine = uiText(this.epithetText, {
      colour: UI_PALETTE.textDim,
      align: 'center',
      wrapWidth,
    });
    this.view.addChild(this.epithetLine);
  }
}
