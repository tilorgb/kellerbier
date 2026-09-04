import { Container, Graphics } from 'pixi.js';
import { EFFECT_PALETTE, HUD_PALETTE, UI_PALETTE } from './palette.js';
import { FocusRing, type UiKit } from './ui/kit.js';
import { UI_LINE_HEIGHT, UI_TEXT_HEIGHT, uiText, uiTextWidth } from './ui/text.js';

/** One card's footprint, in UI pixels — a name only; the selected card's full description is its own line below the row. */
const CARD_WIDTH = 96;
const CARD_HEIGHT = 20;
const CARD_GAP = 6;
const ROW_GAP = 6;

/** Widest the description line wraps to. */
const DETAIL_WRAP_WIDTH = 280;

const MARGIN = 16;
/** Gap between the card row and the detail/cost block below it, and between that block's own lines. */
const SECTION_GAP = 8;

/** One item the Losbrunnen could feed right now — see `GameSim.machineChoices`. */
export interface MachinePickerCard {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly selected: boolean;
}

/**
 * Everything the picker screen draws for one frame — read once and rebuilt
 * wholesale on `show`/`update`, the same "no incremental diffing" shape
 * `RunResultsScreen` already uses. `cards` holds every eligible item while
 * still choosing (`GameSim.machineChoices`), or the machine's one locked-in
 * item once fed — the screen draws either shape the same way, a row of
 * name cards with the current one highlighted and its description spelled
 * out below, so "choosing" and "confirming a reroll" read as the same kind
 * of moment rather than two different UIs.
 */
export interface MachinePickerView {
  readonly cards: readonly MachinePickerCard[];
  readonly cost: number;
  readonly breakChance: number;
  readonly affordable: boolean;
  readonly lastRollSummary: string | undefined;
  /** The bottom hint line — `[move: browse] [use: feed]` and the like. Built in `app/main.ts`, the same "screen reads state, main.ts owns the words" split every other HUD piece here keeps. */
  readonly hint: string;
}

/**
 * Der Losbrunnen's real picker menu (#238) — a follow-up on #218's own
 * single-line HUD prompt, per the issue's own request: "a real menu where
 * the user can choose the item... like the reroll machine in Diablo, maybe
 * a little mixed with the reward dialog in Vampire Survivors."
 *
 * Built entirely from the existing `UiKit` — a row of `buttonSprite` cards
 * (its `selected` state doing double duty as "this is the one you'd feed"),
 * a `FocusRing` tracking whichever card that is, and the same dimmed
 * backdrop `RunResultsScreen` uses, lighter here since this opens mid-run
 * over a room that is still visible behind it rather than between runs.
 * Cards themselves hold only a name — description text is German, and can
 * run long (`Böllerschmeißer`'s is a full sentence); wrapping it inside a
 * small fixed-height card risked overflow, so the selected card's
 * description gets its own wide line underneath instead, the way a
 * Diablo-style reroll dialog separates "which slot" from "what it reads."
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
  private readonly focusRing: FocusRing;
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
    this.focusRing = new FocusRing(kit);
    this.panel.addChild(this.focusRing.view);
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
    const centreX = Math.round(this.width / 2);

    const perRow = Math.max(
      1,
      Math.floor((this.width - MARGIN * 2 + CARD_GAP) / (CARD_WIDTH + CARD_GAP)),
    );
    const rows = Math.max(1, Math.ceil(state.cards.length / perRow));
    const cardsHeight = rows * CARD_HEIGHT + (rows - 1) * ROW_GAP;

    // Built (not yet placed) first, purely to measure its wrapped height —
    // the same two-pass shape `RunResultsScreen.buildUnlockEntry` already
    // uses for a detail line whose own height depends on its own text.
    const selected = state.cards.find((card) => card.selected);
    const detail =
      selected === undefined || selected.description.length === 0
        ? null
        : uiText(selected.description, {
            colour: UI_PALETTE.textDim,
            wrapWidth: DETAIL_WRAP_WIDTH,
          });
    const detailHeight =
      detail === null ? 0 : Math.max(UI_LINE_HEIGHT, detail.height) + SECTION_GAP;

    const infoLines = 1 + (state.lastRollSummary === undefined ? 0 : 1) + 1; // cost/break, roll summary, hint
    const contentHeight = cardsHeight + SECTION_GAP + detailHeight + infoLines * UI_LINE_HEIGHT;
    const panelTop = Math.round((this.height - contentHeight) / 2) - SECTION_GAP;
    const cardsTop = panelTop + SECTION_GAP;

    let selectedBox: { x: number; y: number; width: number; height: number } | null = null;
    state.cards.forEach((card, index) => {
      const row = Math.floor(index / perRow);
      const col = index % perRow;
      const cardsInRow = Math.min(perRow, state.cards.length - row * perRow);
      const rowWidth = cardsInRow * CARD_WIDTH + (cardsInRow - 1) * CARD_GAP;
      const rowStartX = Math.round(centreX - rowWidth / 2);
      const x = rowStartX + col * (CARD_WIDTH + CARD_GAP);
      const y = cardsTop + row * (CARD_HEIGHT + ROW_GAP);

      const button = this.kit.buttonSprite(
        card.selected ? 'selected' : 'normal',
        CARD_WIDTH,
        CARD_HEIGHT,
      );
      button.position.set(x, y);
      this.content.addChild(button);

      const name = uiText(card.name, {
        colour: card.selected ? UI_PALETTE.text : UI_PALETTE.textDim,
      });
      name.position.set(
        Math.round(x + (CARD_WIDTH - uiTextWidth(card.name)) / 2),
        Math.round(y + (CARD_HEIGHT - UI_TEXT_HEIGHT) / 2),
      );
      this.content.addChild(name);

      if (card.selected) {
        selectedBox = { x, y, width: CARD_WIDTH, height: CARD_HEIGHT };
      }
    });
    this.focusRing.sync(selectedBox);

    let y = cardsTop + cardsHeight + SECTION_GAP;
    if (detail !== null) {
      detail.position.set(Math.round(centreX - detail.width / 2), y);
      this.content.addChild(detail);
      y += detailHeight;
    }

    const costLine = `${String(state.cost)} Biermarken   ${String(Math.round(state.breakChance * 100))}% to break`;
    this.addCentred(
      costLine,
      centreX,
      y,
      state.affordable ? HUD_PALETTE.shopPreviewAffordable : HUD_PALETTE.shopPreviewUnaffordable,
    );
    y += UI_LINE_HEIGHT;

    if (state.lastRollSummary !== undefined) {
      this.addCentred(state.lastRollSummary, centreX, y, UI_PALETTE.textDim);
      y += UI_LINE_HEIGHT;
    }
    this.addCentred(state.hint, centreX, y, UI_PALETTE.textDim);
    y += UI_LINE_HEIGHT;

    const panelHeight = y - panelTop + SECTION_GAP;
    const widestRow = Math.min(perRow, state.cards.length);
    const cardsBlockWidth = widestRow * CARD_WIDTH + (widestRow - 1) * CARD_GAP;
    const panelWidth = Math.max(cardsBlockWidth, DETAIL_WRAP_WIDTH) + SECTION_GAP * 2;
    const panel = this.kit.panelSprite(panelWidth, panelHeight);
    panel.position.set(Math.round(centreX - panelWidth / 2), panelTop);
    this.content.addChildAt(panel, 0);
  }

  private addCentred(text: string, centreX: number, y: number, colour: number): void {
    const label = uiText(text, { colour });
    label.position.set(Math.round(centreX - uiTextWidth(text) / 2), y);
    this.content.addChild(label);
  }
}
