import { Container, type BitmapText } from 'pixi.js';
import type { GameSim } from '../sim/game/sim.js';
import { HUD_PALETTE } from './palette.js';
import { TextPlate } from './ui/text-plate.js';
import type { UiKit } from './ui/kit.js';
import { uiText } from './ui/text.js';

/**
 * Item sets (#137): a small progress readout — "Braumeister: 2/3" — while
 * the player holds at least one piece of a set that is not yet complete,
 * plus the bigger completion notification once it is.
 *
 * Two separate pieces, the same reason `CurseHud` keeps its banner and its
 * timer apart: progress is a persistent row (`ActiveItemHud`'s "hide when
 * nothing to show" pattern — nothing shows for a run that has never touched
 * a set piece), completion is a fading announcement (`sim.setCompletionReveal`,
 * the same `TextPlate` shape `pickupToast`/`pedestalReveal`/`CurseHud`'s own
 * banner already use).
 */
export class ItemSetHud {
  readonly view = new Container();

  private readonly progressLabel: BitmapText;
  private readonly completion: TextPlate;
  private completionLabel = '';

  constructor(kit: UiKit) {
    this.progressLabel = uiText('', { colour: HUD_PALETTE.toastText });
    this.view.addChild(this.progressLabel);
    this.progressLabel.visible = false;

    this.completion = new TextPlate(kit, { colour: HUD_PALETTE.toastText });
    this.view.addChild(this.completion.view);
  }

  sync(sim: GameSim): void {
    let progressText = '';
    for (const set of sim.itemSets.all) {
      const held = set.memberIndices.filter((index) => sim.inventory.has(index)).length;
      if (held > 0 && held < set.memberIndices.length) {
        progressText = `${set.name}: ${String(held)}/${String(set.memberIndices.length)}`;
        break;
      }
    }
    if (progressText !== '') {
      this.progressLabel.text = progressText;
      this.progressLabel.visible = true;
    } else {
      this.progressLabel.visible = false;
    }

    const reveal = sim.setCompletionReveal;
    if (reveal !== null) {
      const label = `${reveal.name} complete! ${reveal.description}`;
      if (label !== this.completionLabel) {
        this.completionLabel = label;
        this.completion.set(label);
      }
      this.completion.visible = true;
    } else {
      this.completion.visible = false;
      this.completionLabel = '';
    }
  }

  /** Places the persistent progress row at `(x, y)`, and centres the completion banner on `centreX`. */
  place(x: number, y: number, centreX: number, bannerTop: number): void {
    this.progressLabel.position.set(x, y);
    this.completion.place(centreX, bannerTop);
  }

  /** Height of the persistent progress row, for `layoutHud`'s stacking. */
  get height(): number {
    return this.progressLabel.visible ? this.progressLabel.height : 0;
  }
}
