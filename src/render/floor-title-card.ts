import { Container, Graphics, type BitmapText, type Renderer } from 'pixi.js';
import { TITLE_PALETTE, UI_PALETTE } from './palette.js';
import { DisplayTitle, TITLE_STYLES } from './ui/title.js';
import { displayText, SeasonedText, UI_TEXT_HEIGHT } from './ui/text.js';

/** How large the floor's own name is drawn, as a whole multiple of the display face's cell. */
const NAME_SCALE = 3;

/** Width of the ornamental rules, as a fraction of the frame. */
const RULE_SPAN = 0.62;

/**
 * Ordinals for the seven floors — a card says "First Floor", not "Floor 1".
 * Plain English (#221): the ordinal is read on every floor transition, which
 * makes it functional text under `docs/CONTENT_BIBLE.md` §0, not flavour.
 */
const ORDINALS: readonly string[] = [
  'Zeroth',
  'First',
  'Second',
  'Third',
  'Fourth',
  'Fifth',
  'Sixth',
  'Seventh',
];

/**
 * The card a floor opens on: a screen-filling title, the way a Heimatfilm
 * opens.
 *
 * ## Why this exists at all
 *
 * A floor was previously announced by a line of `monospace` in the corner of
 * the minimap. Seven floors, each with a name and a mood written down in
 * `docs/CONTENT_BIBLE.md` §1, and the only thing that marked arriving at one
 * was a HUD label changing. This is the moment the game gets to say where you
 * are — and it is the one place a broken script belongs, because nothing is
 * shooting at you while it is on screen.
 *
 * ## The shape of it
 *
 * A dark plate over the whole frame with a double border, a rule, the floor's
 * ordinal in the text face, the floor's **name** in treated Fraktur at three
 * times its authored size, a line of flavour, and a second rule. Everything
 * is centred, and every offset is a whole number of UI pixels — a title card
 * that half-pixels its rules looks like a bug, not like a film.
 *
 * ## Timing lives outside
 *
 * `show`/`hide`/`setFade` are all this owns. What counts the ticks is
 * `app/main.ts`, next to the floor transition that triggers it, for the same
 * reason `BossHealthHud` does not own the boss fight: this is a view, and a
 * view that keeps its own clock is a view that drifts from the thing it is
 * describing.
 */
export class FloorTitleCard {
  readonly view = new Container();

  private readonly backdrop = new Graphics();
  private readonly border = new Graphics();
  private readonly rules = new Graphics();
  private readonly ordinal: BitmapText;
  private readonly name: DisplayTitle;
  private readonly subtitle: SeasonedText;

  private width = 0;
  private height = 0;

  constructor(renderer: Renderer) {
    this.view.visible = false;
    this.view.addChild(this.backdrop, this.border, this.rules);

    // The ordinal is in the *display* face too, but at 1:1 — a card with two
    // sizes of one script reads as typography; a card with two scripts reads
    // as two cards.
    this.ordinal = displayText('', { colour: TITLE_PALETTE.rule });
    this.view.addChild(this.ordinal);

    this.name = new DisplayTitle(renderer, TITLE_STYLES.floor);
    this.name.view.scale.set(NAME_SCALE);
    this.view.addChild(this.name.view);

    // The flavour line is the *text* face on purpose. It is the only thing on
    // the card anyone actually reads a sentence of, and a sentence of Fraktur
    // is a sentence nobody finishes. It carries one seasoned Bavarian word
    // (`*word*`, `docs/CONTENT_BIBLE.md` §0, #221) in `UI_PALETTE.accent` —
    // the same gold the card's own rules and border already use, so the
    // one dropped-in word reads as part of the card's chrome rather than a
    // competing colour.
    this.subtitle = new SeasonedText(renderer, {
      colour: TITLE_PALETTE.cardSubtitle,
      accentColour: UI_PALETTE.accent,
    });
    this.view.addChild(this.subtitle.view);
  }

  /** Shows the card for `floor`, named and described. Sizes in UI pixels. */
  show(floor: number, floorName: string, flavour: string): void {
    this.ordinal.text = `${ORDINALS[floor] ?? 'Further'} Floor`;
    this.name.set(floorName);
    this.subtitle.set(flavour);
    this.view.visible = true;
    this.view.alpha = 1;
    this.layOut();
  }

  hide(): void {
    this.view.visible = false;
  }

  /** 0 to 1. `main.ts` fades the whole card in and out rather than each piece. */
  setFade(alpha: number): void {
    this.view.alpha = Math.min(1, Math.max(0, alpha));
  }

  get visible(): boolean {
    return this.view.visible;
  }

  /** Call on every resize. Dimensions in UI pixels. */
  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    if (this.view.visible) {
      this.layOut();
    }
  }

  private layOut(): void {
    const { width, height } = this;
    const centreX = Math.round(width / 2);

    this.backdrop.clear();
    this.backdrop.rect(0, 0, width, height).fill({ color: TITLE_PALETTE.cardBackdrop });
    // A darker band top and bottom: the letterbox an opening title used to be
    // printed inside, and the cheapest way to stop a full-screen flat colour
    // from reading as "the renderer failed".
    const band = Math.round(height * 0.08);
    this.backdrop.rect(0, 0, width, band).fill({ color: TITLE_PALETTE.cardEdge });
    this.backdrop.rect(0, height - band, width, band).fill({ color: TITLE_PALETTE.cardEdge });

    const inset = 6;
    this.border.clear();
    this.border
      .rect(inset, inset, width - inset * 2, 2)
      .rect(inset, height - inset - 2, width - inset * 2, 2)
      .rect(inset, inset, 2, height - inset * 2)
      .rect(width - inset - 2, inset, 2, height - inset * 2)
      .fill({ color: TITLE_PALETTE.rule });
    const inner = inset + 5;
    this.border
      .rect(inner, inner, width - inner * 2, 1)
      .rect(inner, height - inner - 1, width - inner * 2, 1)
      .rect(inner, inner, 1, height - inner * 2)
      .rect(width - inner - 1, inner, 1, height - inner * 2)
      .fill({ color: TITLE_PALETTE.ruleShade });

    // Lay the stack out from its own total height so the card stays centred
    // whatever the name's size does — a two-word floor and a one-word floor
    // should sit in the same place.
    const nameHeight = this.name.height * NAME_SCALE;
    const gap = 8;
    const stack = UI_TEXT_HEIGHT + gap + nameHeight + gap + UI_TEXT_HEIGHT;
    const top = Math.round((height - stack) / 2);

    this.ordinal.position.set(
      centreX - Math.round(this.ordinal.width / 2),
      top - this.ordinal.height + UI_TEXT_HEIGHT,
    );
    this.name.place(centreX, top + UI_TEXT_HEIGHT + gap);
    this.subtitle.view.position.set(
      centreX - Math.round(this.subtitle.width / 2),
      top + UI_TEXT_HEIGHT + gap + nameHeight + gap,
    );

    const span = Math.round(width * RULE_SPAN);
    const ruleX = centreX - Math.round(span / 2);
    this.rules.clear();
    for (const y of [top - 18, top + stack + 12]) {
      this.rules.rect(ruleX, y, span, 2).fill({ color: TITLE_PALETTE.rule });
      this.rules.rect(ruleX, y + 3, span, 1).fill({ color: TITLE_PALETTE.ruleShade });
      // A diamond centred on the rule — the one flourish, and the mark that
      // says "title card" rather than "divider in a settings menu".
      for (let row = 0; row < 5; row++) {
        const half = 2 - Math.abs(2 - row);
        this.rules
          .rect(centreX - half, y - 5 + row, half * 2 + 1, 1)
          .fill({ color: TITLE_PALETTE.rule });
      }
    }
  }
}
