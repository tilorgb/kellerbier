import { Container, Sprite, type Texture } from 'pixi.js';
import type { GameSim } from '../sim/game/sim.js';
import { ENTITY_PALETTE } from './palette.js';
import { tileGridScale } from './room.js';

/**
 * Draws the current floor's Losbrunnen (#218), if it has spawned and the
 * current room is where it lives.
 *
 * Placeholder art: reuses `PedestalView`'s own beam/plinth textures, tinted
 * distinctly (`ENTITY_PALETTE.machineTint`/`machineBrokenTint`) rather than
 * a dedicated sprite — see `docs/DECISIONS.md`'s Losbrunnen entry for why a
 * new sprite waits for the pixel-art sign-off pass `CLAUDE.md` requires
 * rather than landing in this pass. At most one instance ever needs
 * drawing, so unlike `PedestalView` this has no sprite pool: one beam, one
 * plinth, hidden when there's nothing to show.
 */
export class MachineView {
  readonly container = new Container();

  private readonly sim: GameSim;
  private readonly beam: Sprite;
  private readonly plinth: Sprite | null;

  constructor(sim: GameSim, beamTexture: Texture, plinthTexture?: Texture) {
    this.sim = sim;
    this.beam = new Sprite(beamTexture);
    this.beam.anchor.set(0.5, 1);
    this.beam.width = BEAM_WIDTH;
    this.beam.height = BEAM_HEIGHT;
    this.beam.alpha = 0.35;
    this.container.addChild(this.beam);

    if (plinthTexture !== undefined) {
      this.plinth = new Sprite(plinthTexture);
      this.plinth.scale.set(tileGridScale(plinthTexture));
      this.plinth.anchor.set(0.5, 0.5);
      this.container.addChild(this.plinth);
    } else {
      this.plinth = null;
    }
  }

  sync(): void {
    const machine = this.sim.activeMachine;
    if (machine === null) {
      this.container.visible = false;
      return;
    }
    this.container.visible = true;
    const tint = machine.broken ? ENTITY_PALETTE.machineBrokenTint : ENTITY_PALETTE.machineTint;
    this.beam.tint = tint;
    this.beam.position.set(machine.x, machine.y);
    if (this.plinth !== null) {
      this.plinth.tint = tint;
      this.plinth.position.set(machine.x, machine.y);
    }
  }

  /** Screen-space position of the Losbrunnen, or `null` while nothing is drawn — same shape as `PedestalView.screenPositionFor`. */
  screenPosition(): { readonly x: number; readonly y: number } | null {
    if (!this.container.visible) {
      return null;
    }
    const point = this.beam.getGlobalPosition();
    return { x: point.x, y: point.y };
  }
}

const BEAM_WIDTH = 10;
const BEAM_HEIGHT = 26;
