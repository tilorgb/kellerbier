import { Container, type BitmapText, type Texture } from './gfx/index.js';
import type { Locale } from '../i18n/locale.js';
import { t, type DictKey } from '../i18n/translate.js';
import { UI_PALETTE } from './palette.js';
import { Postcard } from './postcard.js';
import { postcardBoxForPicture } from './ui/postcard-paper.js';
import { DisplayTitle, TITLE_STYLES } from './ui/title.js';
import { uiText } from './ui/text.js';

const GAP_UNDER_NAME = 6;
const GAP_UNDER_TITLE = 4;
/** Clear of the card's own shadow (`POSTCARD_SHADOW_OFFSET`), not just its bottom edge. */
const GAP_UNDER_ART = 12;

/** The boss-plate art's own aspect — `keyart-bench`'s `bossPlate` preset, 1344×768. Used until a real texture says otherwise. */
const ART_ASPECT = 1344 / 768;
/** How wide the *picture* sits, in UI pixels — the card is this plus its paper margins and franked foot. */
const PICTURE_WIDTH = 232;

/**
 * The boss room's intro plate (#58/#327): a name, a title and a one-line
 * epithet, replacing the generic "Boss Room" banner this stood in for
 * (#23) — plus, where one has been authored, a small illustrated `Postcard`
 * above the text (the boss-postcard redesign, `docs/DECISIONS.md` #98's
 * successor). Same non-opaque, bare-text-over-the-live-room composition the
 * old banner used for everything below the picture — this plate still draws
 * no dim of its own.
 *
 * What sits *behind* it changed, though: this used to go up over a fully
 * live room, on the premise that the boss stayed visible and in play the
 * whole time made the reveal fair on its own. It didn't — the room's
 * ordinary warmup window is far shorter than this plate stays up, so the
 * boss could act while it was still on screen. `app/main.ts`'s
 * `advanceBossIntroPlate` now fades the whole frame to black before raising
 * this (and back before taking it down), with `loop.paused` held for the
 * entire sequence — this class still knows nothing about that; it only
 * renders whatever `show`/`hide` tell it to, same as always. The postcard
 * itself is opaque (it has to be, to hold a picture), but it is sized as an
 * object on the (now paused) room, not a dim over it.
 *
 * `name` keeps the exact `DisplayTitle(TITLE_STYLES.threat)` treatment the
 * old banner had. `title` and `epithet` are in the text face, same
 * reasoning `FloorTitleCard`'s own flavour line gives for staying out of
 * the display face: they are the two lines on this plate actually meant to
 * be read as sentences, not glanced at.
 *
 * ## The art tier is the same two-step swap every illustrated screen uses
 *
 * `show()` can be called with no art at all — the plate still works,
 * text-only, the same graceful-degradation shape `docs/DECISIONS.md` #19
 * asks for a content gap applied to an asset fetch: most bosses (floors
 * 3-7, parked) have none authored yet. `art`, when given, is a texture the
 * caller already resolved — `app/main.ts` keeps one `Postcard`-ready
 * texture per boss id it has art for, loaded once at boot the same
 * never-block-boot-on-it way the title postcard and the opening card are.
 */
export class BossIntroPlate {
  readonly view = new Container();

  private readonly postcard = new Postcard({ seed: 5 });
  private readonly nameLine: DisplayTitle;
  private titleLine: BitmapText;
  private epithetLine: BitmapText;

  private titleText = '';
  private epithetText = '';
  private hasArt = false;
  /** The mounted picture's own aspect, from the texture `show` was given. */
  private artAspect = ART_ASPECT;
  private wrapWidth = 0;
  private width = 0;
  /** Where `place` last put the plate — re-applied by `show`, see there. */
  private placedCentreX = 0;
  private placedTop = 0;

  constructor() {
    this.postcard.view.visible = false;
    this.view.addChild(this.postcard.view);

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
   * `art`, if given, is shown as a postcard above the text; omitted, the
   * plate is exactly the text-only banner it always was.
   */
  show(name: string, locale: Locale, titleKey?: string, epithetKey?: string, art?: Texture): void {
    this.nameLine.set(name);
    this.titleText = titleKey === undefined ? '' : t(locale, titleKey as DictKey);
    this.epithetText = epithetKey === undefined ? '' : t(locale, epithetKey as DictKey);
    this.hasArt = art !== undefined;
    if (art !== undefined) {
      this.artAspect = art.height === 0 ? ART_ASPECT : art.width / art.height;
      this.postcard.setArt(art);
    }
    this.postcard.view.visible = this.hasArt;
    this.view.visible = true;
    // Re-place, not just re-lay-out: `place` is the only thing that sizes
    // the postcard, and the resize handler calls it while the plate is still
    // hidden with no art — so a plate that was placed hidden and then shown
    // with art had a postcard that had never been sized, and `Postcard`
    // draws an unsized card's art at the texture's native size (the whole
    // 1344×768 key art over a 640×360 frame — a player saw the top-left
    // quarter of the picture and nothing else).
    this.place(this.placedCentreX, this.placedTop);
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

  /** Centres the whole plate on `centreX`, with its top (the postcard's, or the name's) at `top`. UI pixels. */
  place(centreX: number, top: number): void {
    this.placedCentreX = centreX;
    this.placedTop = top;
    this.layOut();
    let cursor = top;
    if (this.hasArt) {
      const card = postcardBoxForPicture(PICTURE_WIDTH, this.artAspect);
      this.postcard.view.position.set(Math.round(centreX - card.width / 2), Math.round(cursor));
      this.postcard.resize(card.width, card.height);
      cursor += card.height + GAP_UNDER_ART;
    }
    this.nameLine.place(centreX, cursor);
    const titleTop = cursor + this.nameLine.height + GAP_UNDER_NAME;
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
