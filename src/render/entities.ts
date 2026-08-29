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
import { ACTOR_SPRITE_SCALE, TILE_SPRITE_SCALE } from './resolution.js';

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

/** How far below a priced pickup its number sits, once the pickup has art of its own to not cover. */
const PRICE_LABEL_OFFSET_Y = 8;

/** Radians per millisecond of the telegraph ring's brightness pulse — a little under two a second. */
const RING_PULSE_RATE = 0.011;

/**
 * How dark a boss's ground shadow reads.
 *
 * Soft on purpose: it exists to seat the body on the floor, and a hard shadow
 * under a boss is one more dark shape competing with the shots the player is
 * trying to track.
 */
const BOSS_SHADOW_ALPHA = 0.35;

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
  /** Under everything, including the telegraph ring — a shadow is on the floor. */
  private readonly shadowLayer = new Container();
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
  /**
   * Each pickup kind's own sprite (#152), indexed the same way — a Maß, a
   * Biermarke, a Bierfassl, a Schlüssel, the food. A kind with no entry
   * falls back to the tinted white disc and its two-letter label, which is
   * what every pickup in the game looked like before this.
   */
  private readonly pickupSprites: readonly (Texture | undefined)[];
  /**
   * What each destructible prop is drawn as on the floor currently loaded, by
   * `DESTRUCTIBLE_PROP_KINDS` index (`FloorTileset.destructibles`).
   *
   * Targets are the one collidable body with neither an `EnemyDefinition.id`
   * nor a pickup kind, so this is how a room's authored `barrel` and
   * `maypole` props stop being the same brown blob every enemy used to be.
   * Empty on a floor with no tileset, which falls back to `texture`.
   */
  private targetTextures: readonly Texture[] = [];
  /**
   * The ground shadow a boss stands on (#152), and which ids get one.
   *
   * Only bosses. A boss sprite is two to three times the size of anything else
   * in the room, and at that size a body with nothing under it reads as
   * hovering rather than standing — which is the whole reason this is the one
   * asset in `common/bosses/`. An ordinary enemy is small enough that its own
   * silhouette does the job, and giving everything a shadow would put a
   * second dark shape under every body in a game whose projectiles the player
   * must not lose track of.
   */
  private readonly bossShadowTexture: Texture | undefined;
  /**
   * Whether the telegraph ring's brightness pulses (#153).
   *
   * The ring's *growth* is the information — it is the countdown — and always
   * plays. The pulse on top of it is emphasis, and emphasis that repeats every
   * telegraph is exactly what `reduceFlashes` exists to remove.
   */
  private ringPulses = true;
  private readonly bossIds: ReadonlySet<string>;
  private readonly shadows: Sprite[] = [];

  constructor(
    sim: GameSim,
    texture: Texture,
    flashTexture: Texture,
    telegraphTexture: Texture,
    enemyTextures: Readonly<Record<string, Texture>> = {},
    enemyFlashTextures: Readonly<Record<string, Texture>> = {},
    enemyAnimation: Readonly<Record<string, AnimatedSpriteSet>> = {},
    pickupArt: Readonly<Record<string, Texture>> = {},
    bossShadow?: Texture,
    bossIds: ReadonlySet<string> = new Set(),
  ) {
    this.sim = sim;
    this.texture = texture;
    this.enemyTextures = enemyTextures;
    this.flashTexture = flashTexture;
    this.enemyFlashTextures = enemyFlashTextures;
    this.enemyAnimation = enemyAnimation;
    this.telegraphTexture = telegraphTexture;
    this.bossShadowTexture = bossShadow;
    this.bossIds = bossIds;
    this.container.addChild(this.shadowLayer);
    this.container.addChild(this.ringLayer);
    this.container.addChild(this.corpseLayer);
    this.container.addChild(this.bodyLayer);
    this.container.addChild(this.labelLayer);
    this.pickupTints = sim.pickups.all.map((definition) => definition.tint);
    this.pickupLabels = sim.pickups.all.map((definition) => definition.label);
    this.pickupSprites = sim.pickups.all.map((definition) => pickupArt[definition.id]);
  }

  /**
   * Points the destructible-prop sprite at the floor now loaded.
   *
   * Called by `GameView` on every room load rather than passed once in the
   * constructor: a run crosses floors and `EntityView` outlives the crossing,
   * so "which barrel" is per-room state, not per-view state.
   */
  setTargetTextures(textures: readonly Texture[] = []): void {
    this.targetTextures = textures;
  }

  /** `reduceFlashes` off means the telegraph ring may pulse; on means it only grows. */
  setRingPulses(pulses: boolean): void {
    this.ringPulses = pulses;
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
    let shadowsUsed = 0;
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
      // Neither an enemy nor a pickup: an authored destructible prop, drawn
      // from the floor tileset rather than from `characters/`.
      const isPropTarget = !isPickup && enemyId === null;
      const pickupKindIndex = sim.pickupKind.data[index] ?? -1;
      // A pickup with real art (#152) draws it untinted. One without still
      // draws off the white-fill texture (the same one the hit flash uses),
      // never the body texture: a tint multiplies the texture underneath it,
      // and a bright tint over a dark base is exactly what read as
      // "everything is a brown blob" — white is the one base a tint
      // reproduces exactly.
      const pickupSprite = isPickup ? this.pickupSprites[pickupKindIndex] : undefined;
      const bodyTexture =
        pickupSprite ??
        (isPickup
          ? this.flashTexture
          : animation !== undefined
            ? (animation.frames[animationFrame] ?? this.texture)
            : enemyId === null
              ? // `isPropTarget` in every sense but the type checker's — this
                // spelling is what narrows `enemyId` for the branch below.
                // Drawn as whichever of the floor's own props it was spawned
                // from (#152) rather than as the shared blob.
                (this.targetTextures[sim.propKind.data[index] ?? 0] ??
                this.targetTextures[0] ??
                this.texture)
              : (this.enemyTextures[enemyId] ?? this.texture));
      // A hit flash is that enemy's own shape (#37's bug report — it used to
      // be `flashTexture`'s generic circle for every enemy, wider than most
      // of them): `enemyFlashTextures` is keyed the same way `enemyTextures`
      // is, so an id with no dedicated art falls back to `flashTexture` the
      // same way `bodyTexture` falls back to `texture`.
      sprite.texture = isPickup
        ? bodyTexture
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
      sprite.tint = isPickup
        ? pickupSprite !== undefined
          ? ENTITY_PALETTE.normalTint
          : (this.pickupTints[pickupKindIndex] ?? ENTITY_PALETTE.unknownPickupTint)
        : isEnemyInvulnerable(sim, index)
          ? ENTITY_PALETTE.invulnerableShellTint
          : isEnemyElite(sim, index)
            ? ENTITY_PALETTE.eliteTint
            : ENTITY_PALETTE.normalTint;
      // Drawn at the actor grid: one authored pixel per internal pixel,
      // whatever the body is (`render/resolution.ts`, `docs/DECISIONS.md`
      // #42). This used to be `radius / (bodyTexture.height / 2)` — size
      // derived from the collider — which normalised height and left width
      // free, so widening a canvas for more detail widened the body on
      // screen instead. On-screen size is now the authored canvas and
      // nothing else; `tests/content/sprite-scale.test.ts` is what keeps a
      // canvas honest about the collider it is drawn over.
      //
      // A destructible prop is the one exception, and it is not really one:
      // it is drawn from the floor's own *tile* art, so it takes the tile
      // grid the identical sprite takes when `render/prop-view.ts` draws it
      // as furniture. Before this the same barrel PNG rendered 25% larger as
      // a target than as scenery, in the same room.
      const gridScale = isPropTarget ? TILE_SPRITE_SCALE : ACTOR_SPRITE_SCALE;
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
      const spriteScale = gridScale * pop;
      sprite.scale.set(spriteScale * flip, spriteScale);
      sprite.position.set(x, y);

      const priced = isPickup && ((masks[index] ?? 0) & sim.pickupPrice.bit) !== 0;
      // The two-letter label was how a pickup said which one it was before it
      // had a sprite (#152). Now the sprite says it, so the label survives
      // only where it carries something the art cannot: a shop price, and any
      // pickup whose art has not been drawn yet.
      if (isPickup && (priced || pickupSprite === undefined)) {
        const label = this.labelAt(labelsUsed);
        labelsUsed += 1;
        label.visible = true;
        const kindLabel = this.pickupLabels[pickupKindIndex] ?? '?';
        // A shop's stock reads its price the same way everything else in the
        // wallet reads Biermarken — a plain number, no currency glyph — so
        // this is legible before the player has ever seen a shop.
        label.text = priced
          ? pickupSprite === undefined
            ? `${kindLabel} · ${String(sim.pickupPrice.data[index] ?? 0)}`
            : String(sim.pickupPrice.data[index] ?? 0)
          : kindLabel;
        // Under the sprite rather than across it once there is a sprite to be
        // across: a price is a caption, and a caption over the middle of the
        // thing it captions hides the thing.
        label.position.set(x, pickupSprite === undefined ? y : y + PRICE_LABEL_OFFSET_Y);
      }

      if (enemyId !== null && this.bossIds.has(enemyId)) {
        const shadow = this.shadowAt(shadowsUsed);
        if (shadow !== null) {
          shadowsUsed += 1;
          shadow.visible = true;
          // Wider than tall and wider than the body, the way a shadow cast by
          // one overhead bulb is. Anchored at the body's feet rather than its
          // centre, which is the bottom of the sprite, not the bottom of the
          // collider.
          shadow.scale.set(
            (radius * 2.4) / shadow.texture.width,
            (radius * 0.9) / shadow.texture.height,
          );
          shadow.position.set(x, y + radius * 0.75);
        }
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
        // The extra pulse rides on top and is the only removable half: with
        // `reduceFlashes` on, the ring still grows and still fades in, it
        // simply stops flickering while it does (#153).
        const pulse = this.ringPulses ? Math.sin(nowMs * RING_PULSE_RATE) * 0.12 : 0;
        ring.alpha = Math.min(1, 0.35 + progress * 0.5 + pulse);
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

    for (let slot = shadowsUsed; slot < this.shadows.length; slot++) {
      const shadow = this.shadows[slot];
      if (shadow !== undefined) {
        shadow.visible = false;
      }
    }
  }

  /** `null` when no shadow sprite was loaded — the pre-#152 behaviour. */
  private shadowAt(slot: number): Sprite | null {
    const texture = this.bossShadowTexture;
    if (texture === undefined) {
      return null;
    }
    const existing = this.shadows[slot];
    if (existing !== undefined) {
      return existing;
    }
    const created = new Sprite(texture);
    created.anchor.set(0.5);
    created.alpha = BOSS_SHADOW_ALPHA;
    this.shadows.push(created);
    this.shadowLayer.addChild(created);
    return created;
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
      // The same grid the living body was on — a corpse that changed size
      // the frame the enemy died would read as the death, not as the clip.
      sprite.scale.set(
        ACTOR_SPRITE_SCALE * (animator.corpseFacingAt(corpse) === AUTHORED_FACING ? 1 : -1),
        ACTOR_SPRITE_SCALE,
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
