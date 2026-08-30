import { Container, type NineSliceSprite } from 'pixi.js';
import { encodeSeed } from '../sim/rng/seed.js';
import { TICKS_PER_SECOND } from '../sim/time.js';
import { UI_PALETTE } from './palette.js';
import type { UiKit } from './ui/kit.js';
import { uiText, UI_LINE_HEIGHT } from './ui/text.js';

const PAD = 6;
const WIDTH = 420;
/** Room for `line1` plus `line2` wrapped across up to two lines of its own. */
const HEIGHT = PAD * 2 + UI_LINE_HEIGHT * 3;

/**
 * Replay playback's transport HUD (#48): tick position, speed and pause
 * state, and the keys that drive them.
 *
 * Keyboard-only rather than a scrubber the player drags: the kit (#154) has
 * no slider widget yet (that is #53's own follow-up), and every other
 * transport in this game — the debug step/pause/time-scale keys `main.ts`
 * already binds — is a keypress, not a mouse drag. A tick counter, a speed
 * readout and "left/right seek, Space pause" is the same instrument in the
 * same idiom, not a smaller version of a widget this project has not built
 * yet. Spelled out rather than drawn as arrow glyphs — the pixel face (#154)
 * has none, the same reason `render/stammtisch.ts`'s own hint line spells
 * "Links/Rechts" out instead.
 *
 * Drawn with the kit, in `hudLayer`, so it is real HUD — visible to a normal
 * player watching a replay, not a debug-overlay-only readout the way the
 * bottom-left dev text is.
 */
export class ReplayViewer {
  readonly view = new Container();

  private readonly panel: NineSliceSprite;
  private readonly line1: ReturnType<typeof uiText>;
  private readonly line2: ReturnType<typeof uiText>;

  constructor(kit: UiKit) {
    this.panel = kit.panelSprite(WIDTH, HEIGHT);
    this.view.addChild(this.panel);
    this.line1 = uiText('', { colour: UI_PALETTE.accent });
    this.line1.position.set(PAD, PAD);
    this.view.addChild(this.line1);
    // Wrapped rather than trusted to fit on one line — this panel's text is
    // assembled from a seed string, a tick readout and every control hint in
    // one sentence, and a width guess that is wrong by a few pixels should
    // wrap onto a second line, not run off the edge of its own panel.
    this.line2 = uiText('', { colour: UI_PALETTE.textDim, wrapWidth: WIDTH - PAD * 2 });
    this.line2.position.set(PAD, PAD + UI_LINE_HEIGHT);
    this.view.addChild(this.line2);
    this.view.visible = false;
  }

  get width(): number {
    return WIDTH;
  }

  get height(): number {
    return HEIGHT;
  }

  show(): void {
    this.view.visible = true;
  }

  hide(): void {
    this.view.visible = false;
  }

  sync(seed: number, tick: number, totalTicks: number, paused: boolean, timeScale: number): void {
    const seconds = (tick / TICKS_PER_SECOND).toFixed(1);
    const totalSeconds = (totalTicks / TICKS_PER_SECOND).toFixed(1);
    // `>>> 0`: an imported replay file's seed is only checked for
    // finiteness (`save/schema.ts`'s `sanitizeReplay`), not range — see
    // `debug/panels/run-info.ts`'s identical normalisation.
    this.line1.text =
      `Wiedergabe — Same ${encodeSeed(seed >>> 0)}` +
      (paused ? '  PAUSIERT' : `  x${timeScale.toFixed(2)}`);
    this.line2.text = `${seconds}s / ${totalSeconds}s   Leertaste Pause   Li/Re Same (Shift 60s)   +/- Tempo   Esc zua`;
  }
}
