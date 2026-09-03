import type { Renderer } from 'pixi.js';
import type { UiKit } from '../render/ui/kit.js';
import type { MenuScreen } from '../render/ui/menu.js';
import { CreditsScreen } from '../render/credits-screen.js';
import { PauseScreen } from '../render/pause-screen.js';
import { TitleScreen } from '../render/title-screen.js';
import type { GamepadMenuNav } from './input/menu-nav.js';
import type { GamepadSource } from './input/gamepad.js';
import type { FixedTimestepLoop } from './loop.js';

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
export type Screen = 'title' | 'run' | 'paused' | 'credits';

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
  readonly renderer: Renderer;
  readonly loop: FixedTimestepLoop;
  readonly gamepad: GamepadSource;
  /** Shared with whatever else in `main.ts` polls gamepad menu navigation (the game-over/victory/results screens) — see `GamepadMenuNav`'s own doc comment for why one instance is enough. */
  readonly menuNav: GamepadMenuNav;
  /** A fresh random-seed run — the same primitive the global `R` key and the game-over/victory screens' own "Retry" call. */
  readonly startNewRun: () => void;
  readonly openSettings: () => void;
  readonly playOpenSound: () => void;
  readonly playCloseSound: () => void;
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

  private readonly flow = new ScreenFlow();
  private readonly deps: ScreenFlowControllerDeps;
  private canContinueFlag = false;

  constructor(deps: ScreenFlowControllerDeps) {
    this.deps = deps;
    this.title = new TitleScreen(deps.kit, deps.renderer, {
      onStart: () => {
        this.startFromTitle();
      },
      onContinue: () => {
        this.continueFromTitle();
      },
      onSettings: () => {
        deps.openSettings();
      },
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
    });
    this.pause = new PauseScreen(deps.kit, deps.renderer, {
      onResume: () => {
        this.closePause();
      },
      onSettings: () => {
        deps.openSettings();
      },
      onQuitToTitle: () => {
        this.quitToTitle();
      },
    });
    this.credits = new CreditsScreen(deps.kit, deps.renderer, {
      onBack: () => {
        this.closeCredits();
      },
    });
  }

  get current(): Screen {
    return this.flow.current;
  }

  is(screen: Screen): boolean {
    return this.flow.is(screen);
  }

  /** Call on every resize. Dimensions in UI pixels. */
  resize(width: number, height: number): void {
    this.title.resize(width, height);
    this.pause.resize(width, height);
    this.credits.resize(width, height);
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

  private startFromTitle(): void {
    this.title.hide();
    this.flow.goTo('run');
    this.deps.startNewRun();
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
      case 'Enter':
      case ' ':
        menuScreen?.activate();
        break;
      case 'Escape':
        if (this.flow.is('paused')) {
          this.closePause();
        } else if (this.flow.is('credits')) {
          this.closeCredits();
        }
        break;
      default:
        break;
    }
    event.preventDefault();
    return true;
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
    const edges = this.deps.menuNav.poll(this.deps.gamepad);
    const menuScreen = this.currentMenuScreen();
    if (edges.up) {
      menuScreen?.moveFocus(-1);
    }
    if (edges.down) {
      menuScreen?.moveFocus(1);
    }
    if (edges.confirm) {
      menuScreen?.activate();
    }
    if (edges.cancel) {
      if (this.flow.is('paused')) {
        this.closePause();
      } else if (this.flow.is('credits')) {
        this.closeCredits();
      }
    }
    return true;
  }
}
