import { Container, Sprite, Text, type Texture } from 'pixi.js';
import { ROOM_TILE_UNITS } from '../content/rooms/definition.js';
import { CollisionLayer } from '../sim/collision/layers.js';
import { World } from '../sim/ecs/world.js';
import type { GameSim } from '../sim/game/sim.js';
import { propKindIndex } from '../sim/game/prop-kinds.js';
import { lerp } from '../sim/math.js';
import { bombBlastArmLength, bombFuseProgress } from '../sim/systems/bombs.js';
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
import { ACTOR_SPRITE_SCALE } from './resolution.js';
import { tileGridScale } from './room.js';

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
 * The `maypole` prop kind (#199). `MaibaumView` draws this one — tall,
 * walk-behind, and the Maibaum-Dieb's weapon once grabbed — so `EntityView`
 * leaves it alone rather than drawing a second short copy at the collider.
 */
const MAYPOLE_PROP_KIND = propKindIndex('maypole');

/** The pickup id whose art a placed Bierfassl reuses (#208) — see `bombTexture`'s own doc comment. */
const BOMB_PICKUP_ID = 'bierfassl';

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
 * The same idea as `BOSS_SHADOW_ALPHA`, lighter: every other body standing on
 * the floor — a walking enemy, a pickup, the player (`player-view.ts` reuses
 * this same texture and ratios) — reads as sitting on the ground rather than
 * floating over it, but a shadow this common must stay quiet enough that a
 * roomful of them never competes with the shots the player is dodging.
 */
const MOB_SHADOW_ALPHA = 0.22;

/** How much wider than its own radius a mob/pickup shadow is drawn — narrower than a boss's, since there is far less body to seat. */
const MOB_SHADOW_WIDTH_SCALE = 1.5;
/** How much shorter than its own radius a mob/pickup shadow is drawn. */
const MOB_SHADOW_HEIGHT_SCALE = 0.5;

/**
 * How fast a placed Bierfassl's fuse-warning blink oscillates at its
 * fastest, once the fuse is past half burned — radians/ms, the same unit
 * `RING_PULSE_RATE` uses. Roughly four times that rate: a bomb about to go
 * off reads as urgent close up, where a telegraph ring is read at a glance
 * from across the room.
 */
const BOMB_BLINK_RATE = 0.045;

/** `a` and `b` as `0xrrggbb`, blended per channel — `t` 0 is all `a`, 1 is all `b`. */
function mixColor(a: number, b: number, t: number): number {
  const k = Math.min(1, Math.max(0, t));
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const r = Math.round(ar + (((b >> 16) & 0xff) - ar) * k);
  const g = Math.round(ag + (((b >> 8) & 0xff) - ag) * k);
  const bl = Math.round(ab + ((b & 0xff) - ab) * k);
  return (r << 16) | (g << 8) | bl;
}

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
  /**
   * A 1x1 solid, stretched into the two bars a bomb's cross telegraph is
   * drawn from (#210) — the same generic "meant to be stretched" texture
   * `main.ts`'s `pedestalBeam` already uses for a bar fill, since a cross's
   * arms are rectangles and the ring pool's round texture cannot draw one.
   * Undefined leaves a placed bomb with no telegraph at all, the same
   * "missing texture, skip the effect" fallback every other optional texture
   * here already takes.
   */
  private readonly barTexture: Texture | undefined;
  private readonly sprites: Sprite[] = [];
  private readonly corpses: Sprite[] = [];
  private readonly rings: Sprite[] = [];
  /** Two per bomb telegraphed this frame — the horizontal arm, then the vertical one. See `barTexture`. */
  private readonly bars: Sprite[] = [];
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
   * The placed-Bierfassl sprite — the same texture `pickupSprites` draws the
   * `bierfassl` pickup with (#208), so a bomb on the ground and a bomb
   * underfoot read as the same object at the same size. Deliberately not a
   * destructible prop's `targetTextures`/`propKind` path: a live bomb never
   * gets a `propKind` (`GameSim.spawnBierfassl` builds it directly rather
   * than through `spawnTarget`), so falling into that path read whatever
   * prop kind `0` — `'barrel'` — happened to mean, at the floor's own
   * tile-grid scale, which is why a planted bomb used to render as a room
   * barrel. `undefined` (no `bierfassl` pickup art loaded) falls back to
   * `texture`, the same shared blob every other unartworked body already
   * falls back to.
   */
  private readonly bombTexture: Texture | undefined;
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
   * The generic ground shadow every non-boss body draws (loot, a walking
   * enemy) — everything `bossShadowTexture` above deliberately excludes.
   * Undefined leaves them exactly as they were before this: no shadow at all.
   */
  private readonly actorShadowTexture: Texture | undefined;
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
    actorShadow?: Texture,
    barTexture?: Texture,
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
    this.actorShadowTexture = actorShadow;
    this.bombTexture = pickupArt[BOMB_PICKUP_ID];
    this.barTexture = barTexture;
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
    let barsUsed = 0;
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
      // The arena maypole is `MaibaumView`'s to draw (#199) — skip it here.
      if (
        ((masks[index] ?? 0) & sim.enemyMask) !== sim.enemyMask &&
        ((collision[index * 2] ?? 0) & CollisionLayer.Pickup) === 0 &&
        ((masks[index] ?? 0) & sim.propKind.bit) !== 0 &&
        (sim.propKind.data[index] ?? 0) === MAYPOLE_PROP_KIND
      ) {
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
      const isBoss = enemyId !== null && this.bossIds.has(enemyId);
      // A boss reads its wind-up off its own body, not the expanding ring (#193):
      // 0 unless this is a boss that is telegraphing right now.
      const bossTelegraph = isBoss ? enemyTelegraphProgress(sim, index) : 0;
      // A placed Bierfassl (#208) — neither a pickup nor an enemy, but drawn
      // off its own dedicated texture rather than falling into the
      // destructible-prop path below, which is what used to draw it as a
      // room barrel (see `bombTexture`'s doc comment).
      const isBomb = ((masks[index] ?? 0) & sim.bombFuse.bit) !== 0;
      // 0 for anything but a live bomb — how far through its fuse it is,
      // driving the red flush/blink below the same way `bossTelegraph` drives
      // a boss's own wind-up flush.
      const bombFuse = isBomb ? bombFuseProgress(sim, index) : 0;
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
      // Neither an enemy nor a pickup, and not a live bomb either: an
      // authored destructible prop, drawn from the floor tileset rather than
      // from `characters/`.
      const isPropTarget = !isPickup && enemyId === null && !isBomb;
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
            : isBomb
              ? (this.bombTexture ?? this.texture)
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
            : bossTelegraph > 0
              ? mixColor(
                  ENTITY_PALETTE.normalTint,
                  ENTITY_PALETTE.bossTelegraphTint,
                  Math.min(1, bossTelegraph * 1.15),
                )
              : bombFuse > 0
                ? mixColor(
                    ENTITY_PALETTE.normalTint,
                    ENTITY_PALETTE.bombFuseTint,
                    // Reddens steadily as the fuse burns down; past the
                    // halfway point an accelerating blink rides on top of
                    // that ramp, so the last stretch before it goes off
                    // reads as an urgent countdown rather than a flat glow.
                    Math.min(
                      1,
                      bombFuse +
                        Math.max(0, bombFuse - 0.5) *
                          (Math.sin(nowMs * BOMB_BLINK_RATE * (1 + bombFuse * 3)) * 0.5 + 0.5),
                    ),
                  )
                : ENTITY_PALETTE.normalTint;
      // Drawn at the actor grid: one authored pixel per internal pixel,
      // whatever the body is (`render/resolution.ts`, `docs/DECISIONS.md`
      // #45). This used to be `radius / (bodyTexture.height / 2)` — size
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
      // a target than as scenery, in the same room. `tileGridScale` (not a
      // fixed constant, since #182) is what keeps that true whether the
      // destructible's art is authored at 16 or 32.
      const gridScale = isPropTarget ? tileGridScale(bodyTexture) : ACTOR_SPRITE_SCALE;
      // A pickup pops in on spawn — a cosmetic-only bump read off the same
      // countdown `stepPickups`' collection never touches, so it never
      // affects the hitbox it's drawn over. Gated to `isPickup`: the
      // component array is dense and reused across recycled ECS slots, so an
      // enemy or prop created into a slot a just-collected pickup still had a
      // few bounce ticks left in would otherwise inherit its pop.
      const bounceTicks = isPickup ? (sim.spawnBounce.data[index] ?? 0) : 0;
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
      // A boss is drawn far taller than its collider (`sim/enemy/size.ts`'s
      // `boss` class, #193), so it *stands on* the collider instead of being
      // centred through it the way #45 assumes for everything the size of a
      // body: bottom-anchored, feet at the collider's lower edge — which is
      // why every boss frame is authored with its ground contact on the
      // canvas's bottom edge. Every other sprite keeps the centre anchor, so a
      // recycled ECS slot that was a boss and is now a fly is put back.
      sprite.anchor.set(0.5, isBoss ? 1 : 0.5);
      sprite.position.set(x, isBoss ? y + radius : y);

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
        // thing it captions hides the thing. The offset is the sprite's own
        // half-height (#208) rather than a fixed number — a fixed 8 was
        // exactly half of the 16px canvas every pickup used to be authored
        // at, so it stopped sitting under the art the moment that canvas
        // grew, the same "offset tied to a size that can change instead of
        // the actual sprite" mistake #204's ground-shadow fix already caught.
        label.position.set(
          x,
          pickupSprite === undefined ? y : y + (pickupSprite.height / 2) * ACTOR_SPRITE_SCALE,
        );
      }

      // A boss draws its own wider shadow (#152); every other body that
      // stands on the floor — a walking enemy or a piece of loot — draws the
      // shared, quieter one. An authored destructible prop (a barrel, the
      // Maibaum) is neither: it is furniture the room placed, not something
      // that walked or dropped there, so it keeps drawing without one.
      const wantsShadow = enemyId !== null || isPickup;
      const shadowTexture = isBoss ? this.bossShadowTexture : this.actorShadowTexture;
      if (wantsShadow && shadowTexture !== undefined) {
        const shadow = this.shadowAt(shadowsUsed, shadowTexture);
        shadowsUsed += 1;
        shadow.visible = true;
        shadow.texture = shadowTexture;
        if (isBoss) {
          // Wider than tall and wider than the body, the way a shadow cast by
          // one overhead bulb is. A boss sprite is bottom-anchored at the
          // collider's lower edge (#193), so the shadow goes there too — under
          // the feet, not floating up inside the body the way `radius * 0.75`
          // left it once the sprite grew past the collider.
          shadow.alpha = BOSS_SHADOW_ALPHA;
          shadow.scale.set(
            (radius * 3) / shadow.texture.width,
            (radius * 1) / shadow.texture.height,
          );
          shadow.position.set(x, y + radius);
        } else {
          // Every other body keeps its centre anchor, so its own "ground" sits
          // a little above its own visual bottom edge rather than exactly on
          // it — near enough to read as underfoot without the shadow eating
          // into the body it is meant to be seating. This used to be
          // `radius * 0.85` — the collider's half-height — which is only the
          // sprite's own half-height when the authored canvas happens to
          // match the collider. Since #45 an authored pixel is a screen
          // pixel and nothing constrains canvas size to collider size
          // (Rollfass's 26px-tall barrel over a 20-unit `mid` collider,
          // Kellerassel's 16px body over a 14-unit `normal` one), so a body
          // taller than its collider had its shadow sitting well above its
          // drawn feet — read as floating rather than standing on it.
          const visualHalfHeight = (bodyTexture.height / 2) * gridScale;
          shadow.alpha = MOB_SHADOW_ALPHA;
          shadow.scale.set(
            (radius * MOB_SHADOW_WIDTH_SCALE) / shadow.texture.width,
            (radius * MOB_SHADOW_HEIGHT_SCALE) / shadow.texture.height,
          );
          shadow.position.set(x, y + visualHalfHeight * 0.85);
        }
      }

      // The expanding ring is for enemies the player might lose in the shuffle.
      // A boss is a quarter of the screen and telegraphs off its own body
      // (`bossTelegraph` above drives the red flush; its `telegraph` clip holds
      // the strained pose) — a ring scaled to *that* collider would wrap the
      // room and say nothing about where it is safe to stand.
      const progress = isBoss ? 0 : enemyTelegraphProgress(sim, index);
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

      // A placed Bierfassl telegraphs a cross, not a ring (#210) — the same
      // shape `blastCandidate` (`sim/systems/bombs.ts`) actually damages,
      // growing from nothing to the real blast reach as `bombFuse` counts
      // down rather than a fixed multiple of the bomb's own tiny collider.
      // `bombFuseProgress` already gates this to a live bomb (0 otherwise).
      if (isBomb && bombFuse > 0 && this.barTexture !== undefined) {
        const armSpan = bombBlastArmLength(sim) * 2 * bombFuse;
        const pulse = this.ringPulses ? Math.sin(nowMs * RING_PULSE_RATE) * 0.12 : 0;
        const alpha = Math.min(1, 0.35 + bombFuse * 0.5 + pulse);

        const horizontalBar = this.barAt(barsUsed);
        barsUsed += 1;
        horizontalBar.visible = true;
        horizontalBar.width = armSpan;
        horizontalBar.height = ROOM_TILE_UNITS;
        horizontalBar.alpha = alpha;
        horizontalBar.position.set(x, y);

        const verticalBar = this.barAt(barsUsed);
        barsUsed += 1;
        verticalBar.visible = true;
        verticalBar.width = ROOM_TILE_UNITS;
        verticalBar.height = armSpan;
        verticalBar.alpha = alpha;
        verticalBar.position.set(x, y);
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

    for (let slot = barsUsed; slot < this.bars.length; slot++) {
      const bar = this.bars[slot];
      if (bar !== undefined) {
        bar.visible = false;
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

  /**
   * `initialTexture` seeds a freshly created sprite; a reused slot gets its
   * texture (and alpha) overwritten by the caller regardless, since the same
   * slot may draw a boss's shadow one frame and a mob's the next as bodies
   * come and go.
   */
  private shadowAt(slot: number, initialTexture: Texture): Sprite {
    const existing = this.shadows[slot];
    if (existing !== undefined) {
      return existing;
    }
    const created = new Sprite(initialTexture);
    created.anchor.set(0.5);
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
      // Match the living body's anchor (#193): a boss corpse is bottom-anchored
      // at the collider's lower edge, so it does not jump half a sprite-height
      // the frame the boss dies.
      const isBoss = this.bossIds.has(clips.name);
      sprite.anchor.set(0.5, isBoss ? 1 : 0.5);
      sprite.position.set(
        animator.corpseXAt(corpse),
        isBoss
          ? animator.corpseYAt(corpse) + animator.corpseRadiusAt(corpse)
          : animator.corpseYAt(corpse),
      );
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

  /** One bar of a bomb's cross telegraph. `this.barTexture` must be defined — checked once by the caller rather than per bar. */
  private barAt(slot: number): Sprite {
    const existing = this.bars[slot];
    if (existing !== undefined) {
      return existing;
    }
    const created = new Sprite(this.barTexture);
    created.anchor.set(0.5);
    created.tint = ENTITY_PALETTE.telegraphRing;
    this.bars.push(created);
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
