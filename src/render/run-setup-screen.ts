import { Container, Graphics, type BitmapText } from './gfx/index.js';
import type { RunSetupView } from '../app/meta/progress.js';
import type { Locale } from '../i18n/locale.js';
import { t } from '../i18n/translate.js';
import { EFFECT_PALETTE, UI_PALETTE } from './palette.js';
import type { UiKit } from './ui/kit.js';
import { Menu, type MenuItem, type MenuScreen } from './ui/menu.js';
import { PostcardPanel } from './postcard-panel.js';
import { DisplayTitle, TITLE_STYLES } from './ui/title.js';
import { UI_LINE_HEIGHT, uiText } from './ui/text.js';

const GAP_BELOW_HEADLINE = 12;
const GAP_ABOVE_DETAIL = 10;
const PANEL_PADDING = 16;
const MENU_MIN_WIDTH = 180;
/** The detail block's wrap width — the panel is at least this plus its padding. */
const DETAIL_WIDTH = 260;
/** The menu's rows, by index — see `menuItems`. */
const START_ROW = 2;

export interface RunSetupScreenActions {
  /** The roster and ladder as they stand right now — re-read on every change. */
  readonly view: () => RunSetupView;
  /** Steps the character choice to the next unlocked one in `delta`'s direction. */
  readonly cycleCharacter: (delta: 1 | -1) => void;
  /** Starts the run as the selected character, on `tier`. */
  readonly onStart: (tier: number) => void;
  readonly onBack: () => void;
}

/**
 * The run-setup screen (#493): what "Start" on the title screen opens —
 * who the run is played as, and on which difficulty tier (#505).
 *
 * One screen, not a wizard, as #501 settled: a character row and a tier row
 * that both cycle in place (left/right, or select to step forward — which is
 * also what a tap does, so touch needs no arrows of its own), then Start.
 * Under the menu, the detail the rows are about: the character's own line,
 * the goal of every locked one, and what the chosen tier adds.
 *
 * The tier defaults to the highest one open to the character whenever the
 * character changes, and is otherwise remembered for as long as the screen
 * lives — so a retry, which never comes back here, keeps it too (the app
 * holds the tier the last run started on).
 */
export class RunSetupScreen implements MenuScreen {
  readonly view = new Container();

  private readonly actions: RunSetupScreenActions;
  private readonly dim: Graphics;
  private readonly panel = new PostcardPanel();
  private readonly headline: DisplayTitle;
  private readonly detail = new Container();
  private readonly menu: Menu;
  private locale: Locale;
  private state: RunSetupView;
  private tier = 0;
  /** Whose ladder `tier` was chosen on — a different character resets it to their highest. */
  private tierFor = '';
  private width = 0;
  private height = 0;

  constructor(kit: UiKit, actions: RunSetupScreenActions, locale: Locale) {
    this.actions = actions;
    this.locale = locale;
    this.view.visible = false;
    this.state = actions.view();

    this.dim = new Graphics();
    this.view.addChild(this.dim);
    this.view.addChild(this.panel.view);
    this.headline = new DisplayTitle(TITLE_STYLES.heading);
    this.headline.set(t(locale, 'ui.setup.headline'));
    this.view.addChild(this.headline.view);
    this.menu = new Menu(kit, [], { minWidth: MENU_MIN_WIDTH });
    this.view.addChild(this.menu.view);
    this.view.addChild(this.detail);
  }

  /** The tier the next run starts on — what the app hands `startRun`. */
  get selectedTier(): number {
    return this.tier;
  }

  setLocale(locale: Locale): void {
    this.locale = locale;
    this.headline.set(t(locale, 'ui.setup.headline'));
    if (this.view.visible) {
      this.rebuild(true);
    }
  }

  get visible(): boolean {
    return this.view.visible;
  }

  /**
   * Opens on Start rather than on the character row: the most common thing
   * to do here is play with what is already chosen, so title-then-setup is
   * still Enter, Enter — the muscle memory a single title "Start" had, and
   * what `tools/perf/room-crossings.mjs` and the release smoke test press.
   */
  show(): void {
    this.view.visible = true;
    this.rebuild(false);
    this.menu.focusRow(START_ROW);
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

  /** Left/right on whichever row is focused: the character row cycles the roster, the tier row the ladder. */
  adjust(delta: 1 | -1): void {
    const focused = this.focusedRow();
    if (focused === 'character') {
      this.actions.cycleCharacter(delta);
      this.rebuild(true);
    } else if (focused === 'tier') {
      this.stepTier(delta);
    }
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    if (this.view.visible) {
      this.layOut();
    }
  }

  /** Which value row holds the focus, read off the menu's own label — the rows are rebuilt on every change. */
  private focusedRow(): 'character' | 'tier' | null {
    const index = this.menu.focusedIndex;
    return index === 0 ? 'character' : index === 1 ? 'tier' : null;
  }

  private stepTier(delta: 1 | -1): void {
    const top = this.state.highestOpen;
    if (top === 0) {
      return;
    }
    this.tier = (this.tier + delta + top + 1) % (top + 1);
    this.rebuild(true);
  }

  /** Re-reads the view, clamps the tier to what is open, and redraws everything. */
  private rebuild(keepFocus: boolean): void {
    this.state = this.actions.view();
    if (this.tierFor !== this.state.selected) {
      this.tierFor = this.state.selected;
      this.tier = this.state.highestOpen;
    }
    this.tier = Math.min(this.tier, this.state.highestOpen);
    this.menu.setItems(this.menuItems(), keepFocus);
    this.buildDetail();
    this.layOut();
  }

  private menuItems(): MenuItem[] {
    const locale = this.locale;
    const selected = this.state.characters.find((row) => row.id === this.state.selected);
    const tierName =
      this.tier === 0
        ? t(locale, 'ui.setup.tierNormal')
        : (this.state.tiers.find((rung) => rung.tier === this.tier)?.label ?? String(this.tier));
    return [
      {
        label: t(locale, 'ui.setup.character', { name: selected?.name ?? '' }),
        onSelect: () => {
          this.actions.cycleCharacter(1);
          this.rebuild(true);
        },
      },
      {
        label: t(locale, 'ui.setup.tier', { tier: tierName }),
        onSelect: () => {
          this.stepTier(1);
        },
        // Nothing to choose until the first win opens tier 1.
        disabled: () => this.state.highestOpen === 0,
      },
      {
        label: t(locale, 'ui.title.start'),
        onSelect: () => {
          this.actions.onStart(this.tier);
        },
      },
      {
        label: t(locale, 'ui.credits.back'),
        onSelect: () => {
          this.actions.onBack();
        },
      },
    ];
  }

  private buildDetail(): void {
    this.detail.removeChildren();
    const locale = this.locale;
    const lines: { text: string; colour: number }[] = [];
    const selected = this.state.characters.find((row) => row.id === this.state.selected);
    if (selected !== undefined && selected.note !== '') {
      lines.push({ text: selected.note, colour: UI_PALETTE.text });
    }
    for (const row of this.state.characters) {
      if (!row.unlocked) {
        const goal = row.progress === null ? row.goal : `${row.progress} — ${row.goal}`;
        lines.push({
          text: t(locale, 'ui.setup.lockedCharacter', { name: row.name, goal }),
          colour: UI_PALETTE.textDisabled,
        });
      }
    }
    if (this.state.highestOpen === 0) {
      lines.push({ text: t(locale, 'ui.setup.tierHint'), colour: UI_PALETTE.textDim });
    } else {
      // A tier keeps everything below it, so the chosen one lists the whole stack.
      for (const rung of this.state.tiers) {
        if (rung.tier <= this.tier) {
          lines.push({ text: `${rung.label}: ${rung.adds}`, colour: UI_PALETTE.accent });
        }
      }
      if (this.tier === 0) {
        lines.push({ text: t(locale, 'ui.setup.tierNormalHint'), colour: UI_PALETTE.textDim });
      }
    }
    let y = 0;
    for (const line of lines) {
      const label: BitmapText = uiText(line.text, { colour: line.colour, wrapWidth: DETAIL_WIDTH });
      label.position.set(0, y);
      this.detail.addChild(label);
      y += Math.max(UI_LINE_HEIGHT, Math.ceil(label.height));
    }
  }

  private layOut(): void {
    const { width, height } = this;
    if (width <= 0 || height <= 0) {
      return;
    }
    this.dim.clear();
    this.dim.rect(0, 0, width, height).fill({ color: EFFECT_PALETTE.gameOverDim, alpha: 0.96 });

    const centreX = Math.round(width / 2);
    const detailHeight = Math.ceil(this.detail.height);
    const contentHeight =
      this.headline.height +
      GAP_BELOW_HEADLINE +
      this.menu.height +
      (detailHeight > 0 ? GAP_ABOVE_DETAIL + detailHeight : 0);
    const contentWidth = Math.max(this.headline.width, this.menu.width, DETAIL_WIDTH);
    const panelWidth = contentWidth + PANEL_PADDING * 2;
    const panelHeight = contentHeight + PANEL_PADDING * 2;
    const panelX = Math.round(centreX - panelWidth / 2);
    const panelY = Math.round(height / 2 - panelHeight / 2);
    this.panel.view.position.set(panelX, panelY);
    this.panel.resize(panelWidth, panelHeight);

    let top = panelY + PANEL_PADDING;
    this.headline.place(centreX, top);
    top += this.headline.height + GAP_BELOW_HEADLINE;
    this.menu.view.position.set(Math.round(centreX - this.menu.width / 2), top);
    top += this.menu.height + GAP_ABOVE_DETAIL;
    this.detail.position.set(Math.round(centreX - DETAIL_WIDTH / 2), top);
  }
}
