import { Container, Graphics, Sprite, type BitmapText, type Texture } from './gfx/index.js';
import type { Locale } from '../i18n/locale.js';
import { t, type DictKey } from '../i18n/translate.js';
import { EFFECT_PALETTE, UI_PALETTE } from './palette.js';
import { iconRoles, FocusRing, type UiKit } from './ui/kit.js';
import { Menu, type MenuItem, type MenuScreen } from './ui/menu.js';
import { PostcardPanel } from './postcard-panel.js';
import { DisplayTitle, TITLE_STYLES } from './ui/title.js';
import { UI_LINE_HEIGHT, uiText, uiTextWidth } from './ui/text.js';

/** One item as the Collection lists it — everything the screen draws, nothing it would have to look up. */
export interface CollectionEntry {
  readonly id: string;
  readonly name: string;
  /** Localisation keys, resolved here so a language change re-reads them. `''` for none. */
  readonly flavourKey: string;
  readonly descriptionKey: string;
  readonly quality: number;
  readonly active: boolean;
  /** The item's authored icon, or `null` while its art is not drawn yet — the kit's star stands in. */
  readonly art: Texture | null;
  /** Set on the enemy tab's entries: what the detail pane says about the creature instead of an item's effect. */
  readonly enemy?: {
    readonly health: number;
    readonly contactDamage: number;
    readonly boss: boolean;
  };
}

/** The Collection's two pages: the items, and the enemies. */
export type CollectionTab = 'items' | 'enemies';
const TABS: readonly CollectionTab[] = ['items', 'enemies'];

export interface CollectionScreenActions {
  readonly onBack: () => void;
  /** Whether this save has ever held `id` — `app/collection.ts`'s `ItemDiscovery`. */
  readonly isDiscovered: (id: string) => boolean;
  /** Whether the run behind the pause menu holds `id` right now. Always false from the title screen. */
  readonly isHeld: (id: string) => boolean;
  /**
   * What still earns `id` if it is not in the pool yet (#503), else `null`.
   * A locked item is drawn fainter than one merely not found yet, and its
   * detail says what earns it instead of "pick it up on a run" — advice it
   * cannot follow while the item is never offered.
   */
  readonly lockedGoal: (id: string) => string | null;
  /** Whether this save has ever met enemy `id` — `app/collection.ts`'s `EnemyDiscovery`. Unset: every enemy shows. */
  readonly isEnemyDiscovered?: (id: string) => boolean;
}

/** `focus` while the tab bar holds it. */
const TAB_BAR = -2;
const TAB_GAP = 18;
const GAP_BELOW_TABS = 3;

/** One grid cell's footprint: a 24×24 item icon in a slot with a pixel of air round it. */
const CELL = 28;
const CELL_GAP = 2;
const PITCH = CELL + CELL_GAP;
const PANEL_MARGIN = 12;
const PANEL_PADDING = 12;
const GAP_BELOW_HEADLINE = 4;
const GAP_ABOVE_GRID = 8;
const GAP_ABOVE_MENU = 8;
const DETAIL_GAP = 14;
/** The detail pane's icon is drawn at twice its size — it is the one place a player gets to look at it. */
const DETAIL_ART_SCALE = 2;
/** The largest the detail pane draws a picture, so a boss does not push its text off the panel. */
const DETAIL_ART_BOX = 64;
const STAR_GAP = 1;
/** A silhouette, not a blank: the shape is a hint, the name and text are what stays hidden. */
const SILHOUETTE_TINT = 0x000000;
const SILHOUETTE_ALPHA = 0.75;
/** A locked item (#503) — fainter than a silhouette, so "not earned" reads apart from "not found". */
const LOCKED_ALPHA = 0.3;

interface Cell {
  readonly view: Container;
  readonly art: Sprite;
  readonly held: Sprite;
}

/**
 * The Collection: every item in the game on one grid, the ones this save
 * has never held drawn as silhouettes, and whichever cell is focused spelled
 * out in full beside it — name, quality, its flavour line *and* its plain
 * effect text.
 *
 * The other half of the item-info feature `AccessibilitySettings`'
 * `statDisplay`/`detailedPickupText` toggles are the first half of: those
 * put precise numbers in the run for a player who wants them there, this is
 * where anybody can look an item up without changing how a run reads. It is
 * always available (title menu and pause menu both) and never behind a
 * setting, because looking something up is not the same act as having it
 * shouted at you on every pickup.
 *
 * Opened over a paused run, the items that run holds right now carry a
 * tick — the pause-screen inventory Isaac has, without a second screen.
 *
 * Navigation is a grid, so this is the one `MenuScreen` with a horizontal
 * axis: `ScreenFlowController` routes left/right here the way it routes them
 * to the settings screen's sliders. Down off the last row lands on "Back";
 * up from "Back" returns to the cell that was focused before.
 */
export class CollectionScreen implements MenuScreen {
  readonly view = new Container();

  private readonly kit: UiKit;
  private readonly actions: CollectionScreenActions;
  private readonly dim = new Graphics();
  private readonly panel = new PostcardPanel();
  private readonly headline = new DisplayTitle(TITLE_STYLES.heading);
  private readonly progress: BitmapText;
  private readonly tabLabels: BitmapText[] = [];
  private readonly tabFocus: FocusRing;
  private readonly grid = new Container();
  private readonly gridFocus: FocusRing;
  private readonly cells: Cell[] = [];
  private readonly detail = new Container();
  private readonly detailArt = new Sprite();
  private readonly detailName: BitmapText;
  private readonly detailStars = new Container();
  private readonly detailTags: BitmapText;
  private readonly detailFlavour: BitmapText;
  private readonly detailDescription: BitmapText;
  private readonly menu: Menu;
  private readonly starTexture: Texture;

  private entries: readonly CollectionEntry[] = [];
  private itemEntries: readonly CollectionEntry[] = [];
  private enemyEntries: readonly CollectionEntry[] = [];
  private tab: CollectionTab = 'items';
  private locale: Locale;
  private width = 0;
  private height = 0;
  private columns = 1;
  private visibleRows = 1;
  private scrollRow = 0;
  /** Focused cell index; `-1` while focus is on "Back", `TAB_BAR` on the tabs. */
  private focus = 0;
  /** The cell to return to when focus comes back up off "Back". */
  private lastCell = 0;
  private detailWidth = 0;

  constructor(kit: UiKit, actions: CollectionScreenActions, locale: Locale) {
    this.kit = kit;
    this.actions = actions;
    this.locale = locale;
    this.view.visible = false;
    this.starTexture = kit.icon('star', iconRoles(UI_PALETTE.accent));

    this.view.addChild(this.dim);
    this.view.addChild(this.panel.view);
    this.view.addChild(this.headline.view);
    this.progress = uiText('', { colour: UI_PALETTE.textDim });
    this.view.addChild(this.progress);
    for (const tab of TABS) {
      const label = uiText('', { colour: UI_PALETTE.text });
      label.eventMode = 'static';
      label.cursor = 'pointer';
      label.on('pointertap', () => {
        this.switchTab(tab);
      });
      this.tabLabels.push(label);
      this.view.addChild(label);
    }
    this.tabFocus = new FocusRing(kit);
    this.view.addChild(this.tabFocus.view);
    this.view.addChild(this.grid);
    this.gridFocus = new FocusRing(kit);
    this.view.addChild(this.gridFocus.view);

    this.detail.addChild(this.detailArt);
    this.detailName = uiText('', { colour: UI_PALETTE.accent });
    this.detail.addChild(this.detailName);
    this.detail.addChild(this.detailStars);
    this.detailTags = uiText('', { colour: UI_PALETTE.textDim });
    this.detail.addChild(this.detailTags);
    this.detailFlavour = uiText('', { colour: UI_PALETTE.textDim });
    this.detail.addChild(this.detailFlavour);
    this.detailDescription = uiText('', { colour: UI_PALETTE.text });
    this.detail.addChild(this.detailDescription);
    this.view.addChild(this.detail);

    this.menu = new Menu(kit, this.menuItems());
    this.view.addChild(this.menu.view);
    this.setLocale(locale);
  }

  /** Replaces the item list — once at boot, from the item registry and the loaded art. */
  setEntries(entries: readonly CollectionEntry[]): void {
    this.itemEntries = entries;
    if (this.tab === 'items') {
      this.useEntries(entries);
    }
  }

  /** Replaces the enemy list — once at boot, from the enemy roster and the loaded art. */
  setEnemyEntries(entries: readonly CollectionEntry[]): void {
    this.enemyEntries = entries;
    if (this.tab === 'enemies') {
      this.useEntries(entries);
    }
  }

  /** Which page is showing — for tests and the dev console. */
  get activeTab(): CollectionTab {
    return this.tab;
  }

  /** Shows `tab`'s page, focus on the tab bar so the other direction comes straight back. */
  switchTab(tab: CollectionTab): void {
    if (tab !== this.tab) {
      this.tab = tab;
      this.focus = TAB_BAR;
      this.lastCell = 0;
      this.scrollRow = 0;
      this.useEntries(tab === 'items' ? this.itemEntries : this.enemyEntries);
    }
    this.focusTabs();
  }

  private discovered(id: string): boolean {
    return this.tab === 'items'
      ? this.actions.isDiscovered(id)
      : (this.actions.isEnemyDiscovered?.(id) ?? true);
  }

  /** What still earns a locked item (#503) — items only; an enemy is never locked. */
  private lockedGoal(id: string): string | null {
    return this.tab === 'items' ? this.actions.lockedGoal(id) : null;
  }

  private held(id: string): boolean {
    return this.tab === 'items' && this.actions.isHeld(id);
  }

  private useEntries(entries: readonly CollectionEntry[]): void {
    this.entries = entries;
    this.grid.removeChildren();
    this.cells.length = 0;
    entries.forEach((_entry, index) => {
      const view = new Container();
      const slot = this.kit.slotSprite(CELL, CELL);
      view.addChild(slot);
      const art = new Sprite();
      view.addChild(art);
      const held = new Sprite(this.kit.icon('tick', iconRoles(UI_PALETTE.accent)));
      const tickSize = this.kit.iconSize('tick');
      held.position.set(CELL - tickSize.width - 1, CELL - tickSize.height - 1);
      view.addChild(held);
      view.eventMode = 'static';
      view.cursor = 'pointer';
      view.on('pointerover', () => {
        this.focusCell(index);
      });
      view.on('pointertap', () => {
        this.focusCell(index);
      });
      this.grid.addChild(view);
      this.cells.push({ view, art, held });
    });
    if (this.focus >= 0) {
      this.focus = Math.min(this.focus, Math.max(0, entries.length - 1));
    }
    this.lastCell = Math.min(this.lastCell, Math.max(0, entries.length - 1));
    if (this.view.visible) {
      this.refreshCells();
      this.layOut();
    }
  }

  private menuItems(): MenuItem[] {
    return [{ label: t(this.locale, 'ui.collection.back'), onSelect: this.actions.onBack }];
  }

  /** Rebuilds every label in `locale` — call whenever the player changes the language. */
  setLocale(locale: Locale): void {
    this.locale = locale;
    this.headline.set(t(locale, 'ui.collection.headline'));
    TABS.forEach((tab, index) => {
      const label = this.tabLabels[index];
      if (label !== undefined) {
        label.text = t(
          locale,
          tab === 'items' ? 'ui.collection.tabItems' : 'ui.collection.tabEnemies',
        );
      }
    });
    this.menu.setItems(this.menuItems());
    this.menu.setFocusVisible(this.focus < 0);
    if (this.view.visible) {
      this.layOut();
    }
  }

  get visible(): boolean {
    return this.view.visible;
  }

  /** Opens on the first cell, with discovery and held-state re-read — both can have changed since it was last open. */
  show(): void {
    this.view.visible = true;
    if (this.tab !== 'items') {
      this.tab = 'items';
      this.useEntries(this.itemEntries);
    }
    this.focus = this.entries.length > 0 ? 0 : -1;
    this.lastCell = 0;
    this.scrollRow = 0;
    this.menu.refresh();
    this.refreshCells();
    this.layOut();
  }

  hide(): void {
    this.view.visible = false;
  }

  /** Up/down: a grid row at a time, off the top onto the tabs and off the bottom onto "Back". */
  moveFocus(delta: 1 | -1): void {
    if (this.focus === TAB_BAR) {
      if (delta > 0) {
        if (this.entries.length > 0) {
          this.focusCell(this.lastCell);
        } else {
          this.focusBack();
        }
      }
      return;
    }
    if (this.entries.length === 0) {
      if (delta < 0) {
        this.focusTabs();
      }
      return;
    }
    if (this.focus < 0) {
      if (delta < 0) {
        this.focusCell(this.lastCell);
      }
      return;
    }
    const next = this.focus + delta * this.columns;
    if (next >= this.entries.length) {
      // The last row can be short: below a cell with nothing under it, a
      // down press still has to go somewhere, and "Back" is the only thing
      // below the grid.
      this.focusBack();
    } else if (next >= 0) {
      this.focusCell(next);
    } else {
      this.focusTabs();
    }
  }

  /** Left/right: a cell at a time, stopping at either end rather than wrapping onto the next row. */
  moveFocusHorizontal(delta: 1 | -1): void {
    if (this.focus === TAB_BAR) {
      this.switchTab(delta > 0 ? 'enemies' : 'items');
      return;
    }
    if (this.focus < 0) {
      return;
    }
    const column = this.focus % this.columns;
    const next = this.focus + delta;
    if (next < 0 || next >= this.entries.length) {
      return;
    }
    if ((delta < 0 && column === 0) || (delta > 0 && column === this.columns - 1)) {
      return;
    }
    this.focusCell(next);
  }

  activate(): void {
    if (this.focus === TAB_BAR) {
      this.switchTab(this.tab === 'items' ? 'enemies' : 'items');
      return;
    }
    if (this.focus < 0) {
      this.menu.activate();
    }
  }

  /** Call on every resize, same as the other screens. Dimensions in UI pixels. */
  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    if (this.view.visible) {
      this.layOut();
    }
  }

  /** The focused item's id, or `null` on "Back" — for tests and the dev console. */
  get focusedId(): string | null {
    return this.focus < 0 ? null : (this.entries[this.focus]?.id ?? null);
  }

  /** What the detail pane currently says, one string per line — for tests. */
  get detailLines(): readonly string[] {
    return [
      this.detailName.text,
      this.detailTags.text,
      this.detailFlavour.text,
      this.detailDescription.text,
    ].filter((line) => line !== '');
  }

  private focusCell(index: number): void {
    this.focus = index;
    this.lastCell = index;
    this.menu.setFocusVisible(false);
    this.scrollIntoView();
    this.syncFocus();
  }

  private focusTabs(): void {
    if (this.focus >= 0) {
      this.lastCell = this.focus;
    }
    this.focus = TAB_BAR;
    this.menu.setFocusVisible(false);
    this.syncFocus();
  }

  private focusBack(): void {
    if (this.focus >= 0) {
      this.lastCell = this.focus;
    }
    this.focus = -1;
    this.menu.setFocusVisible(true);
    this.syncFocus();
  }

  private refreshCells(): void {
    this.entries.forEach((entry, index) => {
      const cell = this.cells[index];
      if (cell === undefined) {
        return;
      }
      const discovered = this.discovered(entry.id);
      this.drawArt(cell.art, entry, 1, CELL - 4);
      cell.art.position.set(
        Math.round((CELL - cell.art.width) / 2),
        Math.round((CELL - cell.art.height) / 2),
      );
      const locked = this.lockedGoal(entry.id) !== null;
      cell.art.tint = discovered && !locked ? 0xffffff : SILHOUETTE_TINT;
      cell.art.alpha = locked ? LOCKED_ALPHA : discovered ? 1 : SILHOUETTE_ALPHA;
      cell.held.visible = this.held(entry.id);
    });
    const found = this.entries.filter((entry) => this.discovered(entry.id)).length;
    this.progress.text = t(this.locale, 'ui.collection.progress', {
      found,
      total: this.entries.length,
    });
  }

  /**
   * Draws `entry`'s art at `scale`, shrunk to fit a `box`-pixel square when it
   * would not: an item icon is 24 pixels, but a creature is its size in the
   * room, and a boss would spill across half the grid.
   */
  private drawArt(sprite: Sprite, entry: CollectionEntry, scale: number, box: number): void {
    const texture = entry.art ?? this.starTexture;
    sprite.texture = texture;
    const largest = Math.max(texture.displayWidth, texture.displayHeight, 1);
    const fit = Math.min(scale, box / largest);
    sprite.width = Math.round(texture.displayWidth * fit);
    sprite.height = Math.round(texture.displayHeight * fit);
  }

  private scrollIntoView(): void {
    if (this.focus < 0) {
      return;
    }
    const row = Math.floor(this.focus / this.columns);
    if (row < this.scrollRow) {
      this.scrollRow = row;
    } else if (row >= this.scrollRow + this.visibleRows) {
      this.scrollRow = row - this.visibleRows + 1;
    }
    this.placeCells();
  }

  private placeCells(): void {
    this.cells.forEach((cell, index) => {
      const row = Math.floor(index / this.columns) - this.scrollRow;
      const column = index % this.columns;
      cell.view.visible = row >= 0 && row < this.visibleRows;
      cell.view.position.set(column * PITCH, row * PITCH);
    });
  }

  /** The active tab in the accent colour, the other plain; the ring round the active one while the bar has focus. */
  private syncTabs(): void {
    TABS.forEach((tab, index) => {
      const label = this.tabLabels[index];
      if (label !== undefined) {
        label.tint = tab === this.tab ? UI_PALETTE.accent : UI_PALETTE.textDim;
      }
    });
    const active = this.tabLabels[TABS.indexOf(this.tab)];
    this.tabFocus.sync(
      this.focus === TAB_BAR && active !== undefined
        ? {
            x: active.position.x - 3,
            y: active.position.y - 2,
            width: uiTextWidth(active.text) + 6,
            height: UI_LINE_HEIGHT + 3,
          }
        : null,
    );
  }

  private syncFocus(): void {
    this.syncTabs();
    const entry = this.focus >= 0 ? this.entries[this.focus] : undefined;
    const cell = this.focus >= 0 ? this.cells[this.focus] : undefined;
    if (cell?.view.visible !== true) {
      this.gridFocus.sync(null);
    } else {
      this.gridFocus.sync({
        x: this.grid.position.x + cell.view.position.x,
        y: this.grid.position.y + cell.view.position.y,
        width: CELL,
        height: CELL,
      });
    }
    this.syncDetail(entry ?? this.entries[this.lastCell]);
  }

  private syncDetail(entry: CollectionEntry | undefined): void {
    this.detailStars.removeChildren();
    if (entry === undefined) {
      this.detail.visible = false;
      return;
    }
    this.detail.visible = true;
    const discovered = this.discovered(entry.id);
    const lockedGoal = this.lockedGoal(entry.id);
    const locale = this.locale;
    const wrap = this.detailWidth;

    this.drawArt(this.detailArt, entry, DETAIL_ART_SCALE, DETAIL_ART_BOX);
    this.detailArt.tint = discovered && lockedGoal === null ? 0xffffff : SILHOUETTE_TINT;
    this.detailArt.alpha = lockedGoal !== null ? LOCKED_ALPHA : discovered ? 1 : SILHOUETTE_ALPHA;
    this.detailArt.position.set(0, 0);

    const textX = this.detailArt.width + 6;
    let y = 2;
    this.detailName.text = discovered ? entry.name : t(locale, 'ui.collection.unknownName');
    this.detailName.position.set(textX, y);
    y += UI_LINE_HEIGHT + 1;

    if (discovered) {
      const starSize = this.kit.iconSize('star');
      for (let star = 0; star < entry.quality; star++) {
        const sprite = new Sprite(this.starTexture);
        sprite.position.set(star * (starSize.width + STAR_GAP), 0);
        this.detailStars.addChild(sprite);
      }
      this.detailStars.position.set(textX, y);
      if (entry.quality > 0) {
        y += starSize.height + 2;
      }
    }

    const tags: string[] = [];
    if (discovered && entry.active) {
      tags.push(t(locale, 'ui.collection.active'));
    }
    if (discovered && entry.enemy?.boss === true) {
      tags.push(t(locale, 'ui.collection.boss'));
    }
    if (this.held(entry.id)) {
      tags.push(t(locale, 'ui.collection.held'));
    }
    if (lockedGoal !== null) {
      tags.push(t(locale, 'ui.collection.locked'));
    }
    this.detailTags.text = tags.join(' · ');
    this.detailTags.position.set(textX, y);

    y = Math.max(this.detailArt.height, y + (tags.length > 0 ? UI_LINE_HEIGHT : 0)) + 6;
    this.setWrapped(
      this.detailFlavour,
      discovered && entry.flavourKey !== '' ? `„${t(locale, entry.flavourKey as DictKey)}“` : '',
      wrap,
    );
    this.detailFlavour.position.set(0, y);
    if (this.detailFlavour.text !== '') {
      y += Math.ceil(this.detailFlavour.height) + 6;
    }
    this.setWrapped(
      this.detailDescription,
      lockedGoal !== null
        ? t(locale, 'ui.collection.lockedGoal', { goal: lockedGoal })
        : !discovered
          ? t(
              locale,
              entry.enemy === undefined
                ? 'ui.collection.unknownHint'
                : 'ui.collection.unknownEnemyHint',
            )
          : entry.enemy !== undefined
            ? [
                entry.descriptionKey === '' ? '' : t(locale, entry.descriptionKey as DictKey),
                t(locale, 'ui.collection.enemyStats', {
                  health: entry.enemy.health,
                  damage: entry.enemy.contactDamage,
                }),
              ]
                .filter((line) => line !== '')
                .join('\n')
            : entry.descriptionKey === ''
              ? ''
              : t(locale, entry.descriptionKey as DictKey),
      wrap,
    );
    this.detailDescription.position.set(0, y);
  }

  private setWrapped(label: BitmapText, text: string, width: number): void {
    label.style.wordWrap = true;
    label.style.wordWrapWidth = Math.max(40, width);
    label.style.lineHeight = UI_LINE_HEIGHT;
    // A style change alone does not mark the label dirty — clearing it first
    // does, so a resize that only moved the wrap width still re-wraps.
    label.text = '';
    label.text = text;
  }

  private layOut(): void {
    const { width, height } = this;
    if (width <= 0 || height <= 0) {
      return;
    }
    this.dim.clear();
    this.dim.rect(0, 0, width, height).fill({ color: EFFECT_PALETTE.gameOverDim, alpha: 0.9 });

    const panelWidth = width - PANEL_MARGIN * 2;
    const panelHeight = height - PANEL_MARGIN * 2;
    this.panel.view.position.set(PANEL_MARGIN, PANEL_MARGIN);
    this.panel.resize(panelWidth, panelHeight);

    const centreX = Math.round(width / 2);
    let top = PANEL_MARGIN + PANEL_PADDING;
    this.headline.place(centreX, top);
    top += this.headline.height + GAP_BELOW_HEADLINE;
    const tabWidths = this.tabLabels.map((label) => uiTextWidth(label.text));
    const tabsWidth =
      tabWidths.reduce((sum, w) => sum + w, 0) + TAB_GAP * Math.max(0, tabWidths.length - 1);
    let tabX = Math.round(centreX - tabsWidth / 2);
    this.tabLabels.forEach((label, index) => {
      label.position.set(tabX, top);
      tabX += (tabWidths[index] ?? 0) + TAB_GAP;
    });
    top += UI_LINE_HEIGHT + GAP_BELOW_TABS;
    this.progress.position.set(Math.round(centreX - uiTextWidth(this.progress.text) / 2), top);
    top += UI_LINE_HEIGHT + GAP_ABOVE_GRID;

    const innerLeft = PANEL_MARGIN + PANEL_PADDING;
    const innerWidth = panelWidth - PANEL_PADDING * 2;
    const menuTop = PANEL_MARGIN + panelHeight - PANEL_PADDING - this.menu.height;
    const gridHeight = Math.max(PITCH, menuTop - GAP_ABOVE_MENU - top);

    // The grid gets a bit over half the width; the detail pane the rest.
    this.columns = Math.max(1, Math.floor((innerWidth * 0.56 + CELL_GAP) / PITCH));
    this.visibleRows = Math.max(1, Math.floor((gridHeight + CELL_GAP) / PITCH));
    const gridWidth = this.columns * PITCH - CELL_GAP;
    this.grid.position.set(innerLeft, top);
    this.detail.position.set(innerLeft + gridWidth + DETAIL_GAP, top);
    this.detailWidth = innerWidth - gridWidth - DETAIL_GAP;

    this.menu.view.position.set(Math.round(centreX - this.menu.width / 2), menuTop);

    const totalRows = Math.ceil(this.entries.length / this.columns);
    this.scrollRow = Math.min(this.scrollRow, Math.max(0, totalRows - this.visibleRows));
    this.scrollIntoView();
    this.placeCells();
    this.syncFocus();
  }
}
