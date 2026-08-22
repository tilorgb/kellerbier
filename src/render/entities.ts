import { Container, Sprite, type Texture } from 'pixi.js';
import { CollisionLayer } from '../sim/collision/layers.js';
import { World } from '../sim/ecs/world.js';
import type { GameSim } from '../sim/game/sim.js';
import { lerp } from '../sim/math.js';

/**
 * Draws the collidable things that are not the player: targets now, enemies
 * when there are enemies.
 *
 * Sprites are handed out in draw order and created on demand, the same way the
 * projectile layer does it — there are far fewer of these, but there is no
 * reason for a second pattern.
 */
export class EntityView {
  readonly container = new Container();

  private readonly sim: GameSim;
  private readonly texture: Texture;
  /**
   * The same shape, solid white.
   *
   * Swapping the texture rather than tinting, because a tint multiplies and
   * cannot make a dark sprite white. The flash is the single cheapest piece of
   * impact feel and it has to actually be white to read.
   */
  private readonly flashTexture: Texture;
  private readonly sprites: Sprite[] = [];

  constructor(sim: GameSim, texture: Texture, flashTexture: Texture) {
    this.sim = sim;
    this.texture = texture;
    this.flashTexture = flashTexture;
  }

  sync(alpha: number): void {
    const sim = this.sim;
    const world = sim.world;
    const states = world.states;
    const masks = world.masks;
    const required = sim.collidableMask;
    const collision = sim.collision.data;
    const body = sim.body.data;
    const flash = sim.flash.data;

    let used = 0;
    const highWater = world.highWater;
    for (let index = 0; index < highWater; index++) {
      if (states[index] !== World.ALIVE) {
        continue;
      }
      if (((masks[index] ?? 0) & required) !== required) {
        continue;
      }
      if (((collision[index * 2] ?? 0) & CollisionLayer.Player) !== 0) {
        continue;
      }

      const sprite = this.spriteAt(used);
      used += 1;
      sprite.visible = true;
      sprite.texture = (flash[index] ?? 0) > 0 ? this.flashTexture : this.texture;
      // The texture is drawn at a fixed size; scaling it to the collider is
      // what keeps the sprite and the hitbox describing the same object.
      sprite.scale.set((body[index * 2] ?? 1) / (this.texture.width / 2));
      sprite.position.set(
        lerp(sim.previousX(index), sim.positionX(index), alpha),
        lerp(sim.previousY(index), sim.positionY(index), alpha),
      );
    }

    for (let slot = used; slot < this.sprites.length; slot++) {
      const sprite = this.sprites[slot];
      if (sprite !== undefined) {
        sprite.visible = false;
      }
    }
  }

  private spriteAt(slot: number): Sprite {
    const existing = this.sprites[slot];
    if (existing !== undefined) {
      return existing;
    }
    const created = new Sprite(this.texture);
    created.anchor.set(0.5);
    this.sprites.push(created);
    this.container.addChild(created);
    return created;
  }
}
