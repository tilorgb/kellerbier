import type { UiKit } from '../render/ui/kit.js';
import type { MenuScreen } from '../render/ui/menu.js';
import { CollectionScreen } from '../render/collection-screen.js';
import { CreditsScreen } from '../render/credits-screen.js';
import { PauseScreen } from '../render/pause-screen.js';
import { MedalScreen } from '../render/medal-screen.js';
import { RunSetupScreen } from '../render/run-setup-screen.js';
import type { MedalShelfView, RunSetupView } from './meta/progress.js';
import { SettingsScreen } from '../render/settings-screen.js';
import { TitleScreen } from '../render/title-screen.js';
import { BUILD_ID } from './build-mode.js';
import type { Locale } from '../i18n/locale.js';
import { HoldRepeater } from './input/hold-repeat.js';
import type { GamepadMenuNav } from './input/menu-nav.js';
import type { GamepadSource } from './input/gamepad.js';
import type { FixedTimestepLoop } from './loop.js';
import type { SettingsMenu } from './settings-menu.js';

/**
 * The top-level screens a player moves through (#158): the title screen,
 * an actual run, the pause menu over one, and the credits.
 *
 * One place owns which of these is current, rather than a scatter of
 * booleans (`titleScreen`'s own visibility, `loop.paused`, a credits flag)
 * spread through `app/main.ts` for the same question asked four different
 * ways. Deliberately narrow, though: a run's own ending — the freeze/slowmo
 * beat, the game-over or victory screen, the results screen behind or after
 * it — stays inside `'run'` here. Those are the run *finishing*, tracked by
 * `main.ts`'s own `deathPhase`, not a different top-level screen; the player
 * is still looking at the run, on the screen it ends on. See
 * `docs/DECISIONS.md` #67 for the full reasoning.
 */
export type Screen =
  'title' | 'run' | 'paused' | 'credits' | 'settings' | 'collection' | 'setup' | 'medals';

export class ScreenFlow {
  private screen: Screen = 'title';

  get current(): Screen {
    return this.screen;
  }

  is(screen: Screen): boolean {
    return this.screen === screen;
  }

  goTo(screen: Screen): void {
    this.screen = screen;
  }
}

export interface ScreenFlowControllerDeps {
  readonly kit: UiKit;
  readonly locale: Locale;
  readonly loop: FixedTimestepLoop;
  readonly gamepad: GamepadSource;
  /** Shared with whatever else in `main.ts` polls gamepad menu navigation (the game-over/victory/results screens) — see `GamepadMenuNav`'s own doc comment for why one instance is enough. */
  readonly menuNav: GamepadMenuNav;
  /** A fresh random-seed run — the same primitive the global `R` key and the game-over/victory screens' own "Retry" call. */
  readonly startNewRun: () => void;
  /**
   * The settings themselves — what the tabs are, and the rebind capture that
   * swallows input while it is armed. `render/` never sees this; the screen
   * gets `tabs`, and this controller asks the rest of it who input belongs to.
   */
  readonly settingsMenu: SettingsMenu;
  readonly playOpenSound: () => void;
  readonly playCloseSound: () => void;
  /** What the Collection asks about each item — `app/collection.ts`'s discovery set, and the live run's inventory. */
  readonly collection: {
    readonly isDiscovered: (id: string) => boolean;
    readonly isHeld: (id: string) => boolean;
    /** What still earns a locked item (#503), or `null` — `app/meta`'s `itemUnlockGoal`. */
    readonly lockedGoal: (id: string) => string | null;
  };
  /**
   * The run-setup screen's side of the save (#493/#505): the roster and
   * ladder to draw, stepping the stored character choice, and starting the
   * run on the chosen tier.
   */
  readonly runSetup: {
    readonly view: () => RunSetupView;
    readonly cycleCharacter: (delta: 1 | -1) => void;
    readonly start: (tier: number) => void;
  };
  /** The medal shelf's view of the save (#506). */
  readonly medals: () => MedalShelfView;
  /** The daily run (#494): whether today's is spent, and starting it. */
  readonly daily: {
    readonly playedToday: () => boolean;
    readonly start: () => void;
  };
}

/**
 * Owns `ScreenFlow` and the title/pause/credits screens together, since the
 * three only ever change on each other's behalf: opening one is always
 * leaving another. `app/main.ts` still owns the run itself — `startRun`,
 * `deathPhase`, the game-over/victory/results screens — and reaches in here
 * only at the handful of seams a run's own lifecycle touches this one
 * (booting to the title screen, the bindable `pause` action, the
 * game-over/victory "Hub" button).
 */
export class ScreenFlowController {
  readonly title: TitleScreen;
  readonly pause: PauseScreen;
  readonly credits: CreditsScreen;
  readonly settings: SettingsScreen;
  readonly collection: CollectionScreen;
  readonly runSetup: RunSetupScreen;
  readonly medals: MedalScreen;

  private readonly flow = new ScreenFlow();
  private readonly deps: ScreenFlowControllerDeps;
  private canContinueFlag = false;
  /** Which screen Settings was opened from, and therefore what closing it goes back to. */
  private settingsOrigin: 'title' | 'paused' = 'title';
  /** Same as `settingsOrigin`, for the Collection. */
  private collectionOrigin: 'title' | 'paused' = 'title';
  private width = 0;
  private height = 0;
  /** Left/right as the keyboard holds them (arrows and A/D) — fed by keydown/keyup, read each frame by `stepHeldDirection`. */
  private readonly keysHeld = { left: false, right: false };
  private readonly repeater = new HoldRepeater();
  private lastRepeatMs: number | null = null;

  constructor(deps: ScreenFlowControllerDeps) {
    this.deps = deps;
    this.title = new TitleScreen(
      deps.kit,
      {
        onStart: () => {
          this.startFromTitle();
        },
        onContinue: () => {
          this.continueFromTitle();
        },
        onSettings: () => {
          this.openSettings();
        },
        onCollection: () => {
          this.openCollection();
        },
        onMedals: () => {
          this.openMedals();
        },
        onDaily: () => {
          this.title.hide();
          this.flow.goTo('run');
          this.deps.daily.start();
        },
        dailyPlayedToday: deps.daily.playedToday,
        onCredits: () => {
          this.openCredits();
        },
        onQuit: () => {
          // Best-effort, same as every other web game's "quit": `window.close`
          // only ever succeeds on a tab a script opened, so on an ordinary tab
          // this is a silent no-op rather than an error a player has to see.
          window.close();
        },
        canContinue: () => this.canContinueFlag,
      },
      deps.locale,
      BUILD_ID,
    );
    this.pause = new PauseScreen(
      deps.kit,
      {
        onResume: () => {
          this.closePause();
        },
        onSettings: () => {
          this.openSettings();
        },
        onCollection: () => {
          this.openCollection();
        },
        onQuitToTitle: () => {
          this.quitToTitle();
        },
      },
      deps.locale,
    );
    this.credits = new CreditsScreen(
      deps.kit,
      {
        onBack: () => {
          this.closeCredits();
        },
      },
      deps.locale,
    );
    this.collection = new CollectionScreen(
      deps.kit,
      {
        onBack: () => {
          this.closeCollection();
        },
        isDiscovered: deps.collection.isDiscovered,
        // Only a paused run has an inventory worth marking; from the title
        // screen the run behind it (if any) is not the one being browsed.
        isHeld: (id) => this.collectionOrigin === 'paused' && deps.collection.isHeld(id),
        lockedGoal: deps.collection.lockedGoal,
      },
      deps.locale,
    );
    this.medals = new MedalScreen(
      deps.kit,
      {
        view: deps.medals,
        onBack: () => {
          this.closeMedals();
        },
      },
      deps.locale,
    );
    this.runSetup = new RunSetupScreen(
      deps.kit,
      {
        view: deps.runSetup.view,
        cycleCharacter: deps.runSetup.cycleCharacter,
        onStart: (tier) => {
          this.startFromSetup(tier);
        },
        onBack: () => {
          this.closeSetup();
        },
      },
      deps.locale,
    );
    this.settings = new SettingsScreen(
      deps.kit,
      deps.settingsMenu.tabs,
      {
        onClose: () => {
          this.closeSettings();
        },
      },
      deps.locale,
    );
  }

  /** Rebuilds every title/pause/credits/settings label in `locale` — call whenever the player changes the language. */
  setLocale(locale: Locale): void {
    this.title.setLocale(locale);
    this.pause.setLocale(locale);
    this.credits.setLocale(locale);
    this.collection.setLocale(locale);
    this.runSetup.setLocale(locale);
    this.medals.setLocale(locale);
    this.deps.settingsMenu.setLocale(locale);
    this.settings.setLocale(locale, this.deps.settingsMenu.tabs);
  }

  get current(): Screen {
    return this.flow.current;
  }

  is(screen: Screen): boolean {
    return this.flow.is(screen);
  }

  /** Call on every resize. Dimensions in UI pixels. */
  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.title.resize(width, height);
    this.pause.resize(width, height);
    this.credits.resize(width, height);
    this.collection.resize(width, height);
    this.runSetup.resize(width, height);
    this.medals.resize(width, height);
    this.placeSettings();
  }

  /** Marks the flow as being in a run — `main.ts`'s `retryRun` calls this right before `startRun`. */
  enterRun(): void {
    this.flow.goTo('run');
  }

  /**
   * Shows the title screen, hiding pause behind it — a run's own end
   * screens are `main.ts`'s to hide, since this controller doesn't hold
   * them. `continuable` sets the title's "Continue" row: true only where
   * the caller knows an actual resumable run exists (boot's own
   * `resumeActiveRun`, or a pause-menu quit with a live run still going) —
   * never derived from a fresh save read, which turns true the instant
   * *any* run starts, `startRun`'s own fresh one included.
   */
  showTitle(continuable: boolean): void {
    this.flow.goTo('title');
    this.deps.loop.paused = true;
    this.canContinueFlag = continuable;
    this.pause.hide();
    this.settings.hide();
    this.collection.hide();
    this.runSetup.hide();
    this.medals.hide();
    this.title.setSettingsOpen(false);
    this.title.show();
  }

  /**
   * The pause menu's "Quit to Title" and the game-over/victory screens'
   * "Hub" — one function, because which of the two called it is exactly
   * `screenFlow.current` right now: `'paused'` still has a live run worth
   * continuing, `'run'` (a finished one, shown behind its own end screen)
   * does not — its `activeRun` save was already cleared the moment the run
   * ended.
   */
  quitToTitle(): void {
    this.showTitle(this.flow.is('paused'));
  }

  /** No-ops outside a live run — the bindable `pause` action re-checks nothing else before calling this. */
  openPause(): void {
    if (!this.flow.is('run')) {
      return;
    }
    this.flow.goTo('paused');
    this.deps.loop.paused = true;
    this.pause.show();
    this.deps.playOpenSound();
  }

  closePause(): void {
    if (!this.flow.is('paused')) {
      return;
    }
    this.flow.goTo('run');
    this.pause.hide();
    this.deps.loop.paused = false;
    this.deps.playCloseSound();
  }

  /**
   * Settings, from wherever it was asked for.
   *
   * From the title screen it takes the right pane — the name and poster step
   * aside and the menu column stays put, so the screen does not jump and the
   * player can see what they came from. Over a paused run there is no pane to
   * take, so it is a panel in the middle with its own dim, and the pause list
   * goes away underneath it rather than showing round the edges.
   */
  openSettings(): void {
    if (this.flow.is('settings')) {
      return;
    }
    // Asked for mid-run (the `Y` shortcut): pause first, so the run is
    // actually stopped while the settings are open and closing them lands on
    // the pause menu rather than dropping the player straight back into a
    // fight they had stepped away from.
    if (this.flow.is('run')) {
      this.openPause();
    }
    this.settingsOrigin = this.flow.is('paused') ? 'paused' : 'title';
    if (this.settingsOrigin === 'paused') {
      this.pause.hide();
    } else {
      this.title.setSettingsOpen(true);
    }
    this.flow.goTo('settings');
    this.settings.show();
    this.placeSettings();
    this.deps.playOpenSound();
  }

  closeSettings(): void {
    if (!this.flow.is('settings')) {
      return;
    }
    this.deps.settingsMenu.cancelCapture();
    this.settings.hide();
    if (this.settingsOrigin === 'paused') {
      this.flow.goTo('paused');
      this.pause.show();
    } else {
      this.flow.goTo('title');
      this.title.setSettingsOpen(false);
    }
    this.deps.playCloseSound();
  }

  /**
   * The settings panel's box, in UI pixels.
   *
   * On the title screen the geometry belongs to `TitleScreen` — it is that
   * screen's own right pane — so this asks rather than recomputing it. Over a
   * paused run it is a centred panel, capped so it stays a panel on a large
   * frame and shrinks to the margins on a small one.
   */
  private placeSettings(): void {
    if (this.width <= 0 || this.height <= 0) {
      return;
    }
    if (this.settingsOrigin === 'title') {
      const pane = this.title.contentBox();
      this.settings.place(pane.x, pane.y, pane.width, pane.height, false);
      return;
    }
    const width = Math.min(this.width - 48, 400);
    const height = Math.min(this.height - 32, 300);
    this.settings.place(
      Math.round((this.width - width) / 2),
      Math.round((this.height - height) / 2),
      width,
      height,
      true,
    );
  }

  /** The Collection, from the title screen or over a paused run — closing it goes back to whichever. */
  openCollection(): void {
    if (this.flow.is('collection')) {
      return;
    }
    if (this.flow.is('run')) {
      this.openPause();
    }
    this.collectionOrigin = this.flow.is('paused') ? 'paused' : 'title';
    if (this.collectionOrigin === 'paused') {
      this.pause.hide();
    } else {
      this.title.hide();
    }
    this.flow.goTo('collection');
    this.collection.show();
    this.deps.playOpenSound();
  }

  closeCollection(): void {
    if (!this.flow.is('collection')) {
      return;
    }
    this.collection.hide();
    if (this.collectionOrigin === 'paused') {
      this.flow.goTo('paused');
      this.pause.show();
    } else {
      this.flow.goTo('title');
      this.title.show();
    }
    this.deps.playCloseSound();
  }

  private openCredits(): void {
    this.flow.goTo('credits');
    this.title.hide();
    this.credits.show();
    this.deps.playOpenSound();
  }

  private closeCredits(): void {
    this.flow.goTo('title');
    this.credits.hide();
    this.title.show();
    this.deps.playCloseSound();
  }

  /**
   * "Start" on the title screen opens the run-setup screen (#493) rather
   * than a run: who to play as, and on which tier.
   */
  private startFromTitle(): void {
    this.title.hide();
    this.flow.goTo('setup');
    this.runSetup.show();
    this.deps.playOpenSound();
  }

  private openMedals(): void {
    this.flow.goTo('medals');
    this.title.hide();
    this.medals.show();
    this.deps.playOpenSound();
  }

  private closeMedals(): void {
    if (!this.flow.is('medals')) {
      return;
    }
    this.medals.hide();
    this.flow.goTo('title');
    this.title.show();
    this.deps.playCloseSound();
  }

  private closeSetup(): void {
    if (!this.flow.is('setup')) {
      return;
    }
    this.runSetup.hide();
    this.flow.goTo('title');
    this.title.show();
    this.deps.playCloseSound();
  }

  private startFromSetup(tier: number): void {
    this.runSetup.hide();
    this.flow.goTo('run');
    this.deps.runSetup.start(tier);
  }

  /** Resumes whichever run is already sitting there — the one boot loaded, or one merely paused-and-quit-to-title this session. */
  private continueFromTitle(): void {
    this.flow.goTo('run');
    this.title.hide();
    this.deps.loop.paused = false;
  }

  private currentMenuScreen(): MenuScreen | null {
    switch (this.flow.current) {
      case 'title':
        return this.title;
      case 'paused':
        return this.pause;
      case 'credits':
        return this.credits;
      case 'settings':
        return this.settings;
      case 'collection':
        return this.collection;
      case 'setup':
        return this.runSetup;
      case 'medals':
        return this.medals;
      case 'run':
        return null;
    }
  }

  /**
   * Routes one keydown to whichever of title/pause/credits is up. Returns
   * `false` while a run is live, so `main.ts`'s own keydown handler knows
   * to fall through to the replay/results/live-game switches instead.
   */
  handleKeydown(event: KeyboardEvent): boolean {
    if (this.flow.is('run')) {
      return false;
    }
    // A rebind row that is waiting for an input owns every key until it has
    // one — including the arrows and Escape, which are perfectly reasonable
    // things to bind and would otherwise navigate the menu instead.
    if (this.flow.is('settings') && this.deps.settingsMenu.handleKeydown(event)) {
      this.settings.refresh();
      event.preventDefault();
      return true;
    }
    const menuScreen = this.currentMenuScreen();
    switch (event.key) {
      case 'ArrowUp':
      case 'w':
      case 'W':
        menuScreen?.moveFocus(-1);
        break;
      case 'ArrowDown':
      case 's':
      case 'S':
        menuScreen?.moveFocus(1);
        break;
      // Left and right are only recorded here: the step itself, and its
      // auto-repeat with acceleration, come from `stepHeldDirection` once per
      // frame, shared with the pad. The OS's own key repeat is ignored.
      case 'ArrowLeft':
      case 'a':
      case 'A':
        this.keysHeld.left = true;
        break;
      case 'ArrowRight':
      case 'd':
      case 'D':
        this.keysHeld.right = true;
        break;
      case 'Tab':
        this.cycleSettingsTab(event.shiftKey ? -1 : 1);
        break;
      case 'q':
      case 'Q':
        this.cycleSettingsTab(-1);
        break;
      case 'e':
      case 'E':
        this.cycleSettingsTab(1);
        break;
      case 'Enter':
      case ' ':
        menuScreen?.activate();
        break;
      // Backspace closes too (#460): in fullscreen the browser spends the
      // first Escape leaving it, so Escape alone was not a way out.
      case 'Escape':
      case 'Backspace':
        if (this.flow.is('paused')) {
          this.closePause();
        } else if (this.flow.is('credits')) {
          this.closeCredits();
        } else if (this.flow.is('settings')) {
          this.closeSettings();
        } else if (this.flow.is('collection')) {
          this.closeCollection();
        } else if (this.flow.is('setup')) {
          this.closeSetup();
        } else if (this.flow.is('medals')) {
          this.closeMedals();
        }
        break;
      default:
        break;
    }
    event.preventDefault();
    return true;
  }

  /** Clears a held left/right the moment its key comes up. */
  handleKeyup(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowLeft':
      case 'a':
      case 'A':
        this.keysHeld.left = false;
        break;
      case 'ArrowRight':
      case 'd':
      case 'D':
        this.keysHeld.right = false;
        break;
      default:
        break;
    }
  }

  /** The window lost focus: whatever was held will never send its keyup. */
  releaseKeys(): void {
    this.keysHeld.left = false;
    this.keysHeld.right = false;
  }

  /**
   * Turns whatever left/right is held — by key or by pad — into steps, once
   * per rendered frame: one on press, then auto-repeat that accelerates, but
   * only where holding means something (a slider, the Collection's grid). A
   * choice or toggle that spun at 20Hz under a held key would just be a
   * flicker.
   */
  private stepHeldDirection(padLeft: boolean, padRight: boolean): void {
    const now = performance.now();
    const deltaMs = this.lastRepeatMs === null ? 0 : Math.min(250, now - this.lastRepeatMs);
    this.lastRepeatMs = now;
    const left = this.keysHeld.left || padLeft;
    const right = this.keysHeld.right || padRight;
    const direction = left === right ? 0 : left ? -1 : 1;
    const repeats =
      this.flow.is('collection') || (this.flow.is('settings') && this.settings.focusedSlider);
    const steps = this.repeater.update(deltaMs, direction, repeats);
    for (let remaining = Math.abs(steps); remaining > 0; remaining--) {
      this.adjustSettings(steps < 0 ? -1 : 1);
    }
  }

  /**
   * Gamepad menu navigation, once per rendered frame. Returns `false` while
   * a run is live (without touching the gamepad at all — see
   * `GamepadMenuNav`'s own doc comment), so `main.ts`'s own poll knows to
   * read the shared `menuNav` itself for the game-over/victory/results
   * screens instead.
   */
  pollGamepad(): boolean {
    if (this.flow.is('run')) {
      return false;
    }
    // Same rule as `handleKeydown`: while a rebind is armed the pad belongs to
    // the capture, and the button that takes the binding must not also press
    // the row it was taken on.
    if (this.flow.is('settings') && this.deps.settingsMenu.capturing) {
      if (this.deps.settingsMenu.poll()) {
        this.settings.refresh();
      }
      return true;
    }
    const edges = this.deps.menuNav.poll(this.deps.gamepad);
    const menuScreen = this.currentMenuScreen();
    if (edges.up) {
      menuScreen?.moveFocus(-1);
    }
    if (edges.down) {
      menuScreen?.moveFocus(1);
    }
    this.stepHeldDirection(edges.leftDown, edges.rightDown);
    if (edges.prevTab) {
      this.cycleSettingsTab(-1);
    }
    if (edges.nextTab) {
      this.cycleSettingsTab(1);
    }
    if (edges.confirm) {
      menuScreen?.activate();
    }
    if (edges.cancel) {
      if (this.flow.is('paused')) {
        this.closePause();
      } else if (this.flow.is('credits')) {
        this.closeCredits();
      } else if (this.flow.is('settings')) {
        this.closeSettings();
      } else if (this.flow.is('collection')) {
        this.closeCollection();
      } else if (this.flow.is('setup')) {
        this.closeSetup();
      } else if (this.flow.is('medals')) {
        this.closeMedals();
      }
    }
    return true;
  }

  /** Left/right: a slider on the settings screen, a column on the Collection's grid. */
  private adjustSettings(delta: 1 | -1): void {
    if (this.flow.is('settings')) {
      this.settings.adjust(delta);
    } else if (this.flow.is('collection')) {
      this.collection.moveFocusHorizontal(delta);
    } else if (this.flow.is('setup')) {
      this.runSetup.adjust(delta);
    }
  }

  private cycleSettingsTab(delta: 1 | -1): void {
    if (this.flow.is('settings')) {
      this.settings.cycleTab(delta);
    }
  }
}
