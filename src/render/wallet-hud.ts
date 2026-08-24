import { Text } from 'pixi.js';
import type { GameSim } from '../sim/game/sim.js';

/**
 * Biermarken, Kellerschlüssel and Bierfassl in inventory — one line of text.
 *
 * The pickup economy (#22) has no icon set yet (that is later art work), so
 * this is deliberately the cheapest possible readout, the same placeholder
 * tier `HealthHud`'s mugs and `PromilleHud`'s bar are one step above. It
 * exists so a fresh `npm run dev` shows *something* changing the moment a
 * Biermarke, Kellerschlüssel or Bierfassl is picked up, rather than asking
 * whoever is looking to trust that the counters exist.
 */
export class WalletHud {
  readonly view: Text;

  constructor() {
    this.view = new Text({
      text: '',
      style: { fill: 0xe8dfd0, fontFamily: 'monospace', fontSize: 9 },
    });
  }

  sync(sim: GameSim): void {
    this.view.text = `Biermarken ${String(sim.biermarken)}  Schlüssel ${String(sim.keys)}  Bierfassl ${String(sim.bombs)}`;
  }
}
