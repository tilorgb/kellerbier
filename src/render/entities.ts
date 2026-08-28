import { Container, Sprite, Text, type Texture } from 'pixi.js';
import { CollisionLayer } from '../sim/collision/layers.js';
import { World } from '../sim/ecs/world.js';
import type { GameSim } from '../sim/game/sim.js';
import { lerp } from '../sim/math.js';
import {
  ENEMY_STRIDE,
  enemyTelegraphProgress,
  isEnemyElite,
  isEnemyInvulnerable,
} from '../sim/systems/enemy.js';
import { EntityAnimator } from './animation/animator.js';
import { AUTHORED_FACING, resolveAnimationState, resolveFacing } from './animation/state.js';
import type { AnimatedSpriteSet } from './floor-art.js';
import { ENTITY_PALETTE } from './palette.js';

/**
 * How much wider than the body a telegraph ring ends up.
 *
 * Wide enough to be read out of the corner of an eye while dodging something
 * else, and no wider — a ring that covers half the room says where the attack
 * is coming from and nothing about where it is safe to stand.
 */
const TELEGRAPH_SCALE = 2.6;

/** Radius the ring texture is generated at, before it is scaled per body. */
const TELEGRAPH_TEXTURE_RADIUS = 24;

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
   * Per-enemy character art (#35), keyed by `EnemyDefinition.id`. An id with
   * no entry — every enemy floors 2-7 haven't been drawn yet, plus the
   * training target and the shopkeeper — falls back to `texture`, the
   * shared blob every enemy used to draw as before this.
   */
  private readonly enemyTextures: Readonly<Record<string, Texture>>;
  /**
   * The same shape, solid white.
   *
   * Swapping the texture rather than tinting, because a tint multiplies and
   * cannot make a dark sprite white. The flash is the single cheapest piece of
   * impact feel and it has to actually be white to read.
   */
  private readonly flashTexture: Texture;
  /**
   * Each enemy's own hit-flash silhouette (#37), keyed the same way
   * `enemyTextures` is. An id with no entry — the same ones that fall back
   * to `texture` for `bodyTexture` — falls back to `flashTexture`, the
   * generic circle, for its flash too.
   */
  private readonly enemyFlashTextures: Readonly<Record<string, Texture>>;
  /**
   * Animated character art (#150), keyed the same way `enemyTextures` is. An
   * id in here draws off its current clip frame instead of a single static
   * texture; an id that is not — every creature whose animation has not been
   * drawn yet — takes exactly the path it took before this existed.
   */
  private readonly enemyAnimation: Readonly<Record<string, AnimatedSpriteSet>>;
  /**
   * Whose clip is where. Owned here rather than by `GameView` because this is
   * the view that knows which bodies are on screen and which enemy definition
   * each one is — the animator is a table keyed by entity, exactly like
   * `sprites` below, and the two are populated by the same loop.
   */
  readonly animator = new EntityAnimator();
  private readonly telegraphTexture: Texture;
  private readonly sprites: Sprite[] = [];
  private readonly corpses: Sprite[] = [];
  private readonly rings: Sprite[] = [];
  private readonly labels: Text[] = [];

  /**
   * Rings live in their own layer, under the bodies; labels live above them.
   *
   * Three pools drawn from one container would interleave as the population
   * changes, and a warning (or a label) that flickers in front of and behind
   * the thing making it is one that reads as a glitch.
   */
  private readonly ringLayer = new Container();
  /**
   * Corpses (#150's death clips) sit under everything living: a body on the
   * floor must never hide the enemy that is still shooting at you.
   */
  private readonly corpseLayer = new Container();
  private readonly bodyLayer = new Container();
  private readonly labelLayer = new Container();

  /** Tint and label per pickup kind, indexed the same way `pickupKind` component values are. */
  private readonly pickupTints: readonly number[];
  private readonly pickupLabels: readonly string[];

  constructor(
    sim: GameSim,
    texture: Texture,
    flashTexture: Texture,
    telegraphTexture: Texture,
    enemyTextures: Readonly<Record<string, Texture>> = {},
    enemyFlashTextures: Readonly<Record<string, Texture>> = {},
    enemyAnimation: Readonly<Record<string, AnimatedSpriteSet>> = {},
  ) {
    this.sim = sim;
    this.texture = texture;
    this.enemyTextures = enemyTextures;
    this.flashTexture = flashTexture;
    this.enemyFlashTextures = enemyFlashTextures;
    this.enemyAnimation = enemyAnimation;
    this.telegraphTexture = telegraphTexture;
    this.container.addChild(this.ringLayer);
    this.container.addChild(this.corpseLayer);
    this.container.addChild(this.bodyLayer);
    this.container.addChild(this.labelLayer);
    this.pickupTints = sim.pickups.all.map((definition) => definition.tint);
    this.pickupLabels = sim.pickups.all.map((definition) => definition.label);
  }

  /**
   * `nowMs` is a render-clock reading (`performance.now()`), not simulation
   * time: clips advance on it, so animation runs at the display's rate and
   * keeps running while the simulation is paused or single-stepped. Passed in
   * rather than read here so a test can drive an exact 60 Hz or 144 Hz.
   */
  sync(alpha: number, nowMs: number): void {
    this.animator.beginFrame(nowMs);
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
    let labelsUsed = 0;
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
      const isPickup = ((collision[index * 2] ?? 0) & CollisionLayer.Pickup) !== 0;
      // An enemy with its own art (#35) draws off that instead of the
      // shared blob — everything else (the training target, the
      // shopkeeper, and every enemy floors 2-7 haven't been drawn yet)
      // still falls back to it, the same texture this whole view used to
      // draw every enemy from.
      const isEnemyBody = ((masks[index] ?? 0) & sim.enemyMask) === sim.enemyMask;
      const enemyId = isEnemyBody
        ? sim.enemies.at(sim.enemy.data[index * ENEMY_STRIDE] ?? 0).id
        : null;
      // An animated creature (#150) resolves its frame first, because both
      // `bodyTexture` and the flash silhouette below are that frame rather
      // than one fixed texture. The animation state handed to the animator is
      // a pure function of simulation state; the *frame* it comes back with is
      // a function of the render clock, and that split is the whole of why
      // animation can be smooth without the simulation being non-deterministic.
      const animation = enemyId === null ? undefined : this.enemyAnimation[enemyId];
      let animationFrame = 0;
      let flip = 1;
      if (animation !== undefined) {
        animationFrame = this.animator.track(
          index,
          world.entityAt(index),
          animation.clips,
          resolveAnimationState(sim, index),
          resolveFacing(sim, index),
          x,
          y,
          radius,
        );
        flip = this.animator.facingOf(index) === AUTHORED_FACING ? 1 : -1;
      }
      const bodyTexture =
        animation !== undefined
          ? (animation.frames[animationFrame] ?? this.texture)
          : enemyId === null
            ? this.texture
            : (this.enemyTextures[enemyId] ?? this.texture);
      // Pickups always draw off the white-fill texture (the same one the hit
      // flash uses), never the body texture: a tint multiplies the texture
      // underneath it, and a bright tint over a dark base is exactly what
      // read as "everything is a brown blob" — white is the one base a tint
      // reproduces exactly.
      //
      // A hit flash, by contrast, is that enemy's own shape (#37's bug
      // report — it used to be `flashTexture`'s generic circle for every
      // enemy, wider than most of them): `enemyFlashTextures` is keyed the
      // same way `enemyTextures` is, so an id with no dedicated art falls
      // back to `flashTexture` the same way `bodyTexture` falls back to
      // `texture`.
      sprite.texture = isPickup
        ? this.flashTexture
        : (flash[index] ?? 0) > 0
          ? animation !== undefined
            ? // An animated body flashes as the frame it is actually on, not
              // as a single stand-in pose: the flash is the silhouette read
              // (#37), and a walk cycle's silhouette changes every frame.
              (animation.flashFrames[animationFrame] ?? this.flashTexture)
            : enemyId === null
              ? this.flashTexture
              : (this.enemyFlashTextures[enemyId] ?? this.flashTexture)
          : bodyTexture;
      // A curled body has to look like one. Without this the player is told
      // their shots are doing nothing only by the shots doing nothing.
      const pickupKindIndex = sim.pickupKind.data[index] ?? -1;
      sprite.tint = isPickup
        ? (this.pickupTints[pickupKindIndex] ?? ENTITY_PALETTE.unknownPickupTint)
        : isEnemyInvulnerable(sim, index)
          ? ENTITY_PALETTE.invulnerableShellTint
          : isEnemyElite(sim, index)
            ? ENTITY_PALETTE.eliteTint
            : ENTITY_PALETTE.normalTint;
      // The texture is drawn at a fixed size; scaling it to the collider is
      // what keeps the sprite and the hitbox describing the same object.
      // Read off `bodyTexture` (what's drawn most of the time) rather than
      // `sprite.texture` (which is the flash texture for one tick out of
      // sixty) — otherwise the one flash tick would render at a different
      // size than every frame around it, since dedicated character art and
      // the shared flash blob are not the same shape. `bodyTexture.height`
      // rather than a fixed constant: `character` sprites are no longer all
      // exactly 16 tall (`docs/DECISIONS.md` #26 raised the ceiling to 32
      // for more detail), so the scale reference has to be each sprite's own
      // real height, not an assumption that stopped holding.
      const referenceHeight = bodyTexture.height;
      // A pickup pops in on spawn — a cosmetic-only bump read off the same
      // countdown `stepPickups`' collection never touches, so it never
      // affects the hitbox it's drawn over.
      const bounceTicks = sim.spawnBounce.data[index] ?? 0;
      const bounceMax = Math.max(1, sim.tuning.pickup.spawnBounceTicks);
      const bounceProgress = bounceTicks / bounceMax;
      const pop = bounceTicks > 0 ? 1 + 0.4 * Math.sin(bounceProgress * Math.PI) : 1;
      // `flip` mirrors an animated body that is walking the other way. Every
      // character sprite in the game is authored facing left
      // (`render/animation/state.ts`'s `AUTHORED_FACING`), so this is 1 for a
      // leftward body and -1 for a rightward one, and always 1 for anything
      // with no animation set — which is what keeps a static sprite drawn
      // exactly as it was before #150.
      const spriteScale = (radius / (referenceHeight / 2)) * pop;
      sprite.scale.set(spriteScale * flip, spriteScale);
      sprite.position.set(x, y);

      if (isPickup) {
        const label = this.labelAt(labelsUsed);
        labelsUsed += 1;
        label.visible = true;
        const priced = ((masks[index] ?? 0) & sim.pickupPrice.bit) !== 0;
        const kindLabel = this.pickupLabels[pickupKindIndex] ?? '?';
        // A shop's stock reads its price the same way everything else in the
        // wallet reads Biermarken — a plain number, no currency glyph — so
        // this is legible before the player has ever seen a shop.
        label.text = priced
          ? `${kindLabel} · ${String(sim.pickupPrice.data[index] ?? 0)}`
          : kindLabel;
        label.position.set(x, y);
      }

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

    // Every body that was drawn last frame and not this one has left the
    // world; the animator turns the ones that died into corpses here, which is
    // why this runs before they are drawn below.
    this.animator.endFrame();
    this.syncCorpses();

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

    for (let slot = labelsUsed; slot < this.labels.length; slot++) {
      const label = this.labels[slot];
      if (label !== undefined) {
        label.visible = false;
      }
    }
  }

  /**
   * Draws the death clips of enemies that are no longer in the world.
   *
   * A corpse is entirely render-side state (`animation/animator.ts`'s corpse
   * table): the simulation freed the entity the tick it died, nothing here can
   * be hit or hit anything, and a room change throws the lot away
   * (`resetAnimation`). It fades out rather than popping, over the tail of its
   * linger.
   */
  private syncCorpses(): void {
    const animator = this.animator;
    let used = 0;
    for (let entry = 0; entry < animator.corpseCount; entry++) {
      const corpse = animator.corpseSlotAt(entry);
      const clips = animator.corpseSetAt(corpse);
      if (clips === null) {
        continue;
      }
      const set = this.enemyAnimation[clips.name];
      const texture = set?.frames[animator.corpseFrameAt(corpse)];
      if (texture === undefined) {
        continue;
      }
      const sprite = this.corpseAt(used);
      used += 1;
      sprite.visible = true;
      sprite.texture = texture;
      sprite.alpha = animator.corpseAlphaAt(corpse);
      const scale = animator.corpseRadiusAt(corpse) / (texture.height / 2);
      sprite.scale.set(
        scale * (animator.corpseFacingAt(corpse) === AUTHORED_FACING ? 1 : -1),
        scale,
      );
      sprite.position.set(animator.corpseXAt(corpse), animator.corpseYAt(corpse));
    }
    for (let slot = used; slot < this.corpses.length; slot++) {
      const sprite = this.corpses[slot];
      if (sprite !== undefined) {
        sprite.visible = false;
      }
    }
  }

  /**
   * Forgets every clip phase and every corpse.
   *
   * Called by `GameView` on a room change: a body vanishing because its room
   * unloaded is not a body dying, and without this a door transition would
   * leave the new room strewn with the old one's corpses.
   */
  resetAnimation(): void {
    this.animator.reset();
    for (const sprite of this.corpses) {
      sprite.visible = false;
    }
  }

  private corpseAt(slot: number): Sprite {
    const existing = this.corpses[slot];
    if (existing !== undefined) {
      return existing;
    }
    const created = new Sprite(this.texture);
    created.anchor.set(0.5);
    this.corpses.push(created);
    this.corpseLayer.addChild(created);
    return created;
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
    created.tint = ENTITY_PALETTE.telegraphRing;
    this.rings.push(created);
    this.ringLayer.addChild(created);
    return created;
  }

  private labelAt(slot: number): Text {
    const existing = this.labels[slot];
    if (existing !== undefined) {
      return existing;
    }
    const created = new Text({
      text: '',
      style: {
        fill: ENTITY_PALETTE.pickupLabelText,
        fontFamily: 'monospace',
        fontSize: 6,
        fontWeight: 'bold',
      },
    });
    // Dark text on a light pickup reads at this size where a light outline
    // on a dark fill would not — the fill colours here are pastel/bright by
    // design (see `content/pickups/pickups.ts`), so this is the one label
    // colour that works across all of them without per-kind styling.
    created.anchor.set(0.5);
    created.resolution = 2;
    this.labels.push(created);
    this.labelLayer.addChild(created);
    return created;
  }

  /** The radius the ring texture must be generated at. */
  static get telegraphTextureRadius(): number {
    return TELEGRAPH_TEXTURE_RADIUS;
  }
}
