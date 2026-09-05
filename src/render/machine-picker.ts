import { Container, Graphics, Sprite } from 'pixi.js';
import type { MachineRollTier } from '../sim/item/roll.js';
import { EFFECT_PALETTE, HUD_PALETTE, UI_PALETTE } from './palette.js';
import { FocusRing, type UiKit } from './ui/kit.js';
import { UI_LINE_HEIGHT, UI_TEXT_HEIGHT, uiText, uiTextWidth } from './ui/text.js';

/** One left-column item card's footprint, in UI pixels — stacked one per row rather than a grid, now that the panel is split in two and has half the width to work with. */
const CARD_WIDTH = 96;
const CARD_HEIGHT = 20;
const CARD_GAP = 6;

/** One right-column result card. */
const RESULT_WIDTH = 132;
const RESULT_HEIGHT = 20;
const RESULT_GAP = 6;

const ROLL_BAR_HEIGHT = 8;
const BADGE_WIDTH = 60;
const BADGE_HEIGHT = 11;

/** Widest the left column's description line, or the right column's placeholder, wraps to. */
const COLUMN_WRAP_WIDTH = 132;

const COLUMN_GAP = 20;
const MARGIN = 16;
/** Gap between stacked sections, and between the two columns and the divider. */
const SECTION_GAP = 8;

/** One item the Losbrunnen could feed right now — see `GameSim.machineChoices`. */
export interface MachinePickerCard {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly selected: boolean;
}

/** One results-board card (#238's UX redesign) — see `GameSim.machineRollDisplay`. */
export interface MachineResultCard {
  readonly tier: MachineRollTier;
  /** Pre-formatted "Tier — effect" text (`machineRollCardLabel` in `sim/game/sim.ts`) — no item name, the left pane already shows it. */
  readonly label: string;
  readonly selected: boolean;
}

/**
 * Everything the picker screen draws for one frame — read once and rebuilt
 * wholesale on `show`/`update`, the same "no incremental diffing" shape
 * `RunResultsScreen` already uses.
 *
 * `phase` drives the right pane: `'select'` while there is nothing to show
 * there yet (still choosing which item to feed, or idly `'fed'` waiting for
 * the next press), `'rolling'` for the anticipation beat
 * (`rollProgress` 0→1), and `'results'` for the board itself — one
 * `unlucky` card alone, or three to choose between.
 */
export interface MachinePickerView {
  readonly cards: readonly MachinePickerCard[];
  readonly phase: 'select' | 'rolling' | 'results';
  readonly rollProgress: number;
  readonly results: readonly MachineResultCard[];
  readonly cost: number;
  readonly breakChance: number;
  readonly affordable: boolean;
  readonly lastRollSummary: string | undefined;
  /** The bottom hint line — `[move: browse] [use: feed]` and the like. Built in `app/main.ts`, the same "screen reads state, main.ts owns the words" split every other HUD piece here keeps. */
  readonly hint: string;
}

/**
 * Der Losbrunnen's real picker menu, redesigned (#238's own "argue with, not
 * a spec" follow-up, parked as "not done this pass" in `docs/DECISIONS.md`
 * #69 and finally done here): a two-pane dialog rather than one column that
 * swapped its own contents — the left pane is always "which item," the
 * right pane is always "what happened to it," and the two never occupy the
 * same space, so browsing an item and reading a rolled result never look
 * like the same kind of card even though both are drawn with `buttonSprite`.
 *
 * Built entirely from the existing `UiKit`, same as before: a column of
 * `buttonSprite` cards on each side, a `FocusRing` on each column tracking
 * its own current selection, a `wellSprite`/`solid` fill for the rolling
 * beat's anticipation bar, and the same dimmed backdrop `RunResultsScreen`
 * uses. A result card is tinted by its own rarity
 * (`HUD_PALETTE.machineRollTier`) — decoration on top of its label text,
 * which already spells the tier out, never the only signal (`palette.ts`'s
 * own `promilleTier` convention). The one `unlucky` result a bad pull ever
 * shows gets a small red badge above it besides — `CARD_WIDTH`'s single
 * card is easy to misread as "just another common," and the badge is there
 * so nobody confirms a penalty by not reading closely enough.
 *
 * Reads no input itself. `app/main.ts` owns pause/visibility exactly the
 * way it owns `RunResultsScreen`'s — this class only turns a
 * `MachinePickerView` into pixels.
 */
export class MachinePickerScreen {
  readonly view = new Container();

  private readonly kit: UiKit;
  private readonly backdrop = new Graphics();
  private readonly panel = new Container();
  private readonly itemFocusRing: FocusRing;
  private readonly resultFocusRing: FocusRing;
  private readonly content = new Container();

  private state: MachinePickerView | null = null;
  private width = 0;
  private height = 0;

  constructor(kit: UiKit) {
    this.kit = kit;
    this.view.visible = false;
    this.view.addChild(this.backdrop);
    this.view.addChild(this.panel);
    this.panel.addChild(this.content);
    this.itemFocusRing = new FocusRing(kit);
    this.resultFocusRing = new FocusRing(kit);
    this.panel.addChild(this.itemFocusRing.view);
    this.panel.addChild(this.resultFocusRing.view);
  }

  get visible(): boolean {
    return this.view.visible;
  }

  show(view: MachinePickerView): void {
    this.state = view;
    this.view.visible = true;
    this.layOut();
  }

  /** Rebuilds in place without a visibility flicker — every frame the view actually changed while open. */
  update(view: MachinePickerView): void {
    this.state = view;
    if (this.view.visible) {
      this.layOut();
    }
  }

  hide(): void {
    this.view.visible = false;
  }

  /** Call on every resize. Dimensions in UI pixels. */
  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.backdrop.clear();
    // Lighter than `RunResultsScreen`'s 0.96 — this opens mid-run, over a
    // room the player just walked through, not between runs over nothing.
    this.backdrop
      .rect(0, 0, width, height)
      .fill({ color: EFFECT_PALETTE.gameOverDim, alpha: 0.55 });
    if (this.view.visible) {
      this.layOut();
    }
  }

  private layOut(): void {
    const state = this.state;
    if (state === null) {
      return;
    }
    this.content.removeChildren();

    // --- Left column: which item. ---------------------------------------
    const selectedCard = state.cards.find((card) => card.selected);
    const detail =
      selectedCard === undefined || selectedCard.description.length === 0
        ? null
        : uiText(selectedCard.description, {
            colour: UI_PALETTE.textDim,
            wrapWidth: COLUMN_WRAP_WIDTH,
          });
    const cardsHeight =
      state.cards.length * CARD_HEIGHT + Math.max(0, state.cards.length - 1) * CARD_GAP;
    const detailHeight =
      detail === null ? 0 : SECTION_GAP + Math.max(UI_LINE_HEIGHT, detail.height);
    const leftHeight = cardsHeight + detailHeight;

    // --- Right column: what happened. ------------------------------------
    let rightHeight: number;
    if (state.phase === 'rolling') {
      rightHeight = UI_LINE_HEIGHT + SECTION_GAP + ROLL_BAR_HEIGHT;
    } else if (state.phase === 'results') {
      const badgeSpace =
        state.results.length === 1 && state.results[0]?.tier === 'unlucky'
          ? BADGE_HEIGHT + SECTION_GAP
          : 0;
      rightHeight =
        badgeSpace +
        state.results.length * RESULT_HEIGHT +
        Math.max(0, state.results.length - 1) * RESULT_GAP;
    } else {
      rightHeight = UI_LINE_HEIGHT;
    }

    const columnsHeight = Math.max(leftHeight, rightHeight);
    const infoLines = 1 + (state.lastRollSummary === undefined ? 0 : 1) + 1; // cost/break, roll summary, hint
    const contentHeight = columnsHeight + SECTION_GAP + infoLines * UI_LINE_HEIGHT;

    const centreX = Math.round(this.width / 2);
    const panelWidth = MARGIN * 2 + CARD_WIDTH + COLUMN_GAP + RESULT_WIDTH;
    const panelTop = Math.round((this.height - contentHeight) / 2) - SECTION_GAP;
    const panelLeft = Math.round(centreX - panelWidth / 2);
    const columnsTop = panelTop + SECTION_GAP;

    const leftX = panelLeft + MARGIN;
    const rightX = leftX + CARD_WIDTH + COLUMN_GAP;

    // A thin divider between the two panes — the split is the whole point
    // of this redesign, so it is drawn, not just implied by whitespace.
    const divider = new Sprite(this.kit.solid);
    divider.tint = UI_PALETTE.textDim;
    divider.alpha = 0.5;
    divider.width = 1;
    divider.height = columnsHeight;
    divider.position.set(Math.round(leftX + CARD_WIDTH + COLUMN_GAP / 2), columnsTop);
    this.content.addChild(divider);

    let selectedItemBox: { x: number; y: number; width: number; height: number } | null = null;
    state.cards.forEach((card, index) => {
      const y = columnsTop + index * (CARD_HEIGHT + CARD_GAP);
      const button = this.kit.buttonSprite(
        card.selected ? 'selected' : 'normal',
        CARD_WIDTH,
        CARD_HEIGHT,
      );
      button.position.set(leftX, y);
      this.content.addChild(button);

      const name = uiText(card.name, {
        colour: card.selected ? UI_PALETTE.text : UI_PALETTE.textDim,
      });
      name.position.set(
        Math.round(leftX + (CARD_WIDTH - uiTextWidth(card.name)) / 2),
        Math.round(y + (CARD_HEIGHT - UI_TEXT_HEIGHT) / 2),
      );
      this.content.addChild(name);

      if (card.selected) {
        selectedItemBox = { x: leftX, y, width: CARD_WIDTH, height: CARD_HEIGHT };
      }
    });
    this.itemFocusRing.sync(selectedItemBox);

    if (detail !== null) {
      detail.position.set(leftX, columnsTop + cardsHeight + SECTION_GAP);
      this.content.addChild(detail);
    }

    let selectedResultBox: { x: number; y: number; width: number; height: number } | null = null;
    if (state.phase === 'rolling') {
      const label = uiText('Rolling…', { colour: UI_PALETTE.textDim });
      label.position.set(rightX, columnsTop);
      this.content.addChild(label);

      const barY = columnsTop + UI_LINE_HEIGHT + SECTION_GAP;
      const well = this.kit.wellSprite(RESULT_WIDTH, ROLL_BAR_HEIGHT);
      well.position.set(rightX, barY);
      this.content.addChild(well);

      const fillInset = 1;
      const fill = new Sprite(this.kit.solid);
      fill.tint = HUD_PALETTE.toastText;
      fill.width = Math.max(0, (RESULT_WIDTH - fillInset * 2) * state.rollProgress);
      fill.height = ROLL_BAR_HEIGHT - fillInset * 2;
      fill.position.set(rightX + fillInset, barY + fillInset);
      this.content.addChild(fill);
    } else if (state.phase === 'results') {
      const soleUnlucky =
        state.results.length === 1 && state.results[0]?.tier === 'unlucky'
          ? state.results[0]
          : undefined;
      let y = columnsTop;
      if (soleUnlucky !== undefined) {
        const badge = new Sprite(this.kit.solid);
        badge.tint = HUD_PALETTE.machineRollUnluckyBadge;
        badge.width = BADGE_WIDTH;
        badge.height = BADGE_HEIGHT;
        badge.position.set(Math.round(rightX + (RESULT_WIDTH - BADGE_WIDTH) / 2), y);
        this.content.addChild(badge);

        const badgeText = 'UNLUCKY';
        const badgeLabel = uiText(badgeText, { colour: 0xffffff });
        badgeLabel.position.set(
          Math.round(rightX + (RESULT_WIDTH - uiTextWidth(badgeText)) / 2),
          Math.round(y + (BADGE_HEIGHT - UI_TEXT_HEIGHT) / 2),
        );
        this.content.addChild(badgeLabel);
        y += BADGE_HEIGHT + SECTION_GAP;
      }

      state.results.forEach((result, index) => {
        const cardY = y + index * (RESULT_HEIGHT + RESULT_GAP);
        const button = this.kit.buttonSprite(
          result.selected ? 'selected' : 'normal',
          RESULT_WIDTH,
          RESULT_HEIGHT,
        );
        button.tint = HUD_PALETTE.machineRollTier[result.tier];
        button.position.set(rightX, cardY);
        this.content.addChild(button);

        const label = uiText(result.label, { colour: UI_PALETTE.text });
        label.position.set(
          Math.round(rightX + (RESULT_WIDTH - uiTextWidth(result.label)) / 2),
          Math.round(cardY + (RESULT_HEIGHT - UI_TEXT_HEIGHT) / 2),
        );
        this.content.addChild(label);

        if (result.selected) {
          selectedResultBox = { x: rightX, y: cardY, width: RESULT_WIDTH, height: RESULT_HEIGHT };
        }
      });
    } else {
      const placeholder = uiText('choose an item to begin', { colour: UI_PALETTE.textDim });
      placeholder.position.set(rightX, columnsTop);
      this.content.addChild(placeholder);
    }
    this.resultFocusRing.sync(selectedResultBox);

    let y = columnsTop + columnsHeight + SECTION_GAP;
    const costLine = `${String(state.cost)} Biermarken   ${String(Math.round(state.breakChance * 100))}% to break`;
    this.addCentred(
      costLine,
      panelLeft + Math.round(panelWidth / 2),
      y,
      state.affordable ? HUD_PALETTE.shopPreviewAffordable : HUD_PALETTE.shopPreviewUnaffordable,
    );
    y += UI_LINE_HEIGHT;

    if (state.lastRollSummary !== undefined) {
      this.addCentred(
        state.lastRollSummary,
        panelLeft + Math.round(panelWidth / 2),
        y,
        UI_PALETTE.textDim,
      );
      y += UI_LINE_HEIGHT;
    }
    this.addCentred(state.hint, panelLeft + Math.round(panelWidth / 2), y, UI_PALETTE.textDim);
    y += UI_LINE_HEIGHT;

    const panelHeight = y - panelTop + SECTION_GAP;
    const panel = this.kit.panelSprite(panelWidth, panelHeight);
    panel.position.set(panelLeft, panelTop);
    this.content.addChildAt(panel, 0);
  }

  private addCentred(text: string, centreX: number, y: number, colour: number): void {
    const label = uiText(text, { colour });
    label.position.set(Math.round(centreX - uiTextWidth(text) / 2), y);
    this.content.addChild(label);
  }
}
