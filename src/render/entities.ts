import { Container, Sprite, type Texture } from 'pixi.js';
import { CollisionLayer } from '../sim/collision/layers.js';
import { World } from '../sim/ecs/world.js';
import type { GameSim } from '../sim/game/sim.js';
import { lerp } from '../sim/math.js';
import { enemyTelegraphProgress, isEnemyInvulnerable } from '../sim/systems/enemy.js';

/**
 * How much wider than the body a telegraph ring ends up.
 *
 * Wide enough to be read out of the corner of an eye while dodging something
 * else, and no wider — a ring that covers half the room says where the attack
 * is coming from and nothing about where it is safe to stand.
 */
const TELEGRAPH_SCALE = 2.6;

/** Colour of a telegraph ring. The same red the overlay draws enemy colliders in. */
const TELEGRAPH_COLOUR = 0xf2566f;

/** Radius the ring texture is generated at, before it is scaled per body. */
const TELEGRAPH_TEXTURE_RADIUS = 24;

/** What an invulnerable body is tinted. Cold and dull: nothing is getting in. */
const SHELL_TINT = 0x8fa2b8;

/** What a beer pickup (#17) is tinted, so it doesn't read as another body. */
const BEER_TINT = 0xf0c46a;

/**
 * Draws the collidable things that are not the player: targets, enemies, and
 * the ring an enemy warns with before it attacks.
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
  private readonly telegraphTexture: Texture;
  private readonly sprites: Sprite[] = [];
  private readonly rings: Sprite[] = [];

  /**
   * Rings live in their own layer, under the bodies.
   *
   * Two pools drawn from one container would interleave as the population
   * changes, and a warning that flickers in front of and behind the thing
   * making it is a warning that reads as a glitch.
   */
  private readonly ringLayer = new Container();
  private readonly bodyLayer = new Container();

  constructor(sim: GameSim, texture: Texture, flashTexture: Texture, telegraphTexture: Texture) {
    this.sim = sim;
    this.texture = texture;
    this.flashTexture = flashTexture;
    this.telegraphTexture = telegraphTexture;
    this.container.addChild(this.ringLayer);
    this.container.addChild(this.bodyLayer);
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
    let ringsUsed = 0;
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

      const radius = body[index * 2] ?? 1;
      const x = lerp(sim.previousX(index), sim.positionX(index), alpha);
      const y = lerp(sim.previousY(index), sim.positionY(index), alpha);

      const sprite = this.spriteAt(used);
      used += 1;
      sprite.visible = true;
      sprite.texture = (flash[index] ?? 0) > 0 ? this.flashTexture : this.texture;
      const isPickup = ((collision[index * 2] ?? 0) & CollisionLayer.Pickup) !== 0;
      // A curled body has to look like one. Without this the player is told
      // their shots are doing nothing only by the shots doing nothing.
      sprite.tint = isPickup ? BEER_TINT : isEnemyInvulnerable(sim, index) ? SHELL_TINT : 0xffffff;
      // The texture is drawn at a fixed size; scaling it to the collider is
      // what keeps the sprite and the hitbox describing the same object.
      sprite.scale.set(radius / (this.texture.width / 2));
      sprite.position.set(x, y);

      const progress = enemyTelegraphProgress(sim, index);
      if (progress > 0) {
        const ring = this.ringAt(ringsUsed);
        ringsUsed += 1;
        ring.visible = true;
        // Grows out of the body over the wind-up, and is at its widest on the
        // tick the attack leaves. The size is the countdown.
        const ringRadius = radius * (1 + (TELEGRAPH_SCALE - 1) * progress);
        ring.scale.set(ringRadius / (this.telegraphTexture.width / 2));
        // Fades in with it, so the first frame of a telegraph does not pop.
        ring.alpha = 0.35 + progress * 0.5;
        ring.position.set(x, y);
      }
    }

    for (let slot = used; slot < this.sprites.length; slot++) {
      const sprite = this.sprites[slot];
      if (sprite !== undefined) {
        sprite.visible = false;
      }
    }

    for (let slot = ringsUsed; slot < this.rings.length; slot++) {
      const ring = this.rings[slot];
      if (ring !== undefined) {
        ring.visible = false;
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
    this.bodyLayer.addChild(created);
    return created;
  }

  private ringAt(slot: number): Sprite {
    const existing = this.rings[slot];
    if (existing !== undefined) {
      return existing;
    }
    const created = new Sprite(this.telegraphTexture);
    created.anchor.set(0.5);
    created.tint = TELEGRAPH_COLOUR;
    this.rings.push(created);
    this.ringLayer.addChild(created);
    return created;
  }

  /** The radius the ring texture must be generated at. */
  static get telegraphTextureRadius(): number {
    return TELEGRAPH_TEXTURE_RADIUS;
  }
}
