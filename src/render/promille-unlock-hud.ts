import { Container } from './gfx/index.js';
import type { GameSim } from '../sim/game/sim.js';
import { promilleMeterLabel } from '../sim/game/promille.js';
import { HUD_PALETTE } from './palette.js';
import { TextPlate } from './ui/text-plate.js';
import type { UiKit } from './ui/kit.js';

/**
 * The banner the mid-run Promille unlock arrives on (#236).
 *
 * The gate used to be Der Stier — the last boss of the two-floor game — so
 * the arrival could be a line on the results screen the run ended into.
 * Moving it to floor 1's boss moved the moment *inside* the run, and a
 * mechanic that switches on with no announcement at all is a HUD row
 * silently appearing mid-fight. This is that beat: two lines over the
 * cleared boss room, for as long as `sim.promilleUnlockAnnounced` holds.
 *
 * Two `TextPlate`s stacked rather than one two-line plate, the same split
 * `CurseHud` draws: the headline is the mechanic's own name and the second
 * line is what to do about it, and they want different emphasis even when
 * they always appear together.
 *
 * The wording lives here, not in the sim, because the meter has a neutral
 * reskin (#33) — `promilleMeterLabel` is the same function `app/main.ts`'s
 * debug line reads for its own label.
 */
export class PromilleUnlockHud {
  readonly view = new Container();

  private readonly headline: TextPlate;
  private readonly hint: TextPlate;
  private label = '';

  constructor(kit: UiKit) {
    this.headline = new TextPlate(kit, { colour: HUD_PALETTE.toastText });
    this.view.addChild(this.headline.view);
    this.hint = new TextPlate(kit, { colour: HUD_PALETTE.toastText });
    this.view.addChild(this.hint.view);
  }

  sync(sim: GameSim, neutralReskin: boolean): void {
    if (!sim.promilleUnlockAnnounced) {
      this.headline.visible = false;
      this.hint.visible = false;
      this.label = '';
      return;
    }
    const meter = promilleMeterLabel(neutralReskin);
    // Rebuilt only when the words actually change — a `TextPlate.set` re-lays
    // its glyphs out, and this banner is up for several hundred ticks.
    if (this.label !== meter) {
      this.label = meter;
      this.headline.set(`${meter} unlocked`);
      this.hint.set(
        neutralReskin
          ? 'Charging up hits harder. Too much and you go down.'
          : 'The Maß hits harder. Too much and you fall over.',
      );
    }
    this.headline.visible = true;
    this.hint.visible = true;
  }

  /** Centred, a little above the middle of the screen — clear of the HUD column and of the boss's own reward. */
  resize(width: number, height: number): void {
    const centreX = Math.round(width / 2);
    const top = Math.round(height * 0.32);
    this.headline.place(centreX, top);
    this.hint.place(centreX, top + this.headline.height + 4);
  }
}
