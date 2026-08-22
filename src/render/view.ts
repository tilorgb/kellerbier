import { Container, Sprite, type Texture } from 'pixi.js';
import type { GameSim } from '../sim/game/sim.js';
import { lerp } from '../sim/math.js';
import { ProjectileView } from './projectiles.js';
import { createRoomView } from './room.js';

export interface GameViewTextures {
  readonly player: Texture;
  readonly projectile: Texture;
}

/**
 * The scene graph for one running game.
 *
 * Reads simulation state and writes sprite positions. It never writes back —
 * the arrow only ever points this way, which is what keeps the simulation
 * headless and the renderer replaceable.
 *
 * `sync` runs once per rendered frame, which on a 144 Hz display is more often
 * than the simulation ticks, so positions are interpolated between the previous
 * and current tick rather than snapped.
 */
export class GameView {
  readonly stage = new Container();

  private readonly sim: GameSim;
  private readonly player: Sprite;
  private readonly projectiles: ProjectileView;

  constructor(sim: GameSim, textures: GameViewTextures) {
    this.sim = sim;
    this.stage.addChild(createRoomView(sim.room));

    this.projectiles = new ProjectileView(sim.projectiles, textures.projectile);
    this.stage.addChild(this.projectiles.container);

    this.player = new Sprite(textures.player);
    this.player.anchor.set(0.5);
    this.stage.addChild(this.player);
  }

  /** `alpha` is the fraction of a tick elapsed since the last simulation step. */
  sync(alpha: number): void {
    this.projectiles.sync(alpha);

    const index = this.sim.playerIndex;
    this.player.position.set(
      lerp(this.sim.previousX(index), this.sim.positionX(index), alpha),
      lerp(this.sim.previousY(index), this.sim.positionY(index), alpha),
    );
  }
}
