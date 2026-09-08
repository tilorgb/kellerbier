import { Group } from 'three';
import { ROOM_TILE_UNITS } from '../content/rooms/definition.js';
import { CollisionLayer } from '../sim/collision/layers.js';
import { hurtboxRadiusOf } from '../sim/collision/footprint.js';
import { World } from '../sim/ecs/world.js';
import type { GameSim } from '../sim/game/sim.js';
import { propKindIndex } from '../sim/game/prop-kinds.js';
import { lerp } from '../sim/math.js';
import { bombBlastArmLength, bombFuseProgress } from '../sim/systems/bombs.js';
import {
  ENEMY_STRIDE,
  type EnemyTelegraphShapeInfo,
  enemyTelegraphProgress,
  enemyTelegraphShape,
  isEnemyElite,
  isEnemyInvulnerable,
  TelegraphShape,
} from '../sim/systems/enemy.js';
import { EntityAnimator } from './animation/animator.js';
import { AUTHORED_FACING, resolveAnimationState, resolveFacing } from './animation/state.js';
import type { AnimatedSpriteSet } from './floor-art.js';
import { type BitmapText, type Container, type Texture } from './gfx/index.js';
import { ENTITY_PALETTE } from './palette.js';
import { tileGridScale } from './tiles.js';
import { Billboard } from './world/billboard.js';
import { FloorBar, FloorRing, FloorWedge } from './world/flat.js';
import { WorldLabel } from './world/label.js';

/**
 * Every collidable body that is not the player: enemies, bosses, pickups,
 * destructible props, placed Bierfassl bombs — each a `Billboard` standing at
 * its footprint, plus the flat shapes on the floor that tell the player what
 * is about to happen there.
 *
 * ## What survived the move to 3D, and what did not
 *
 * The gameplay signals are all here and read from the same simulation state
 * they always did: the hit flash (now the billboard's emissive term, so the
 * frame's own shape blows out white — what the silhouette texture swap used to
 * do), the invulnerable and elite tints, a boss's wind-up flush, a bomb's fuse
 * ramp and blink, all four telegraph shapes sized by their countdown, the bomb
 * cross the blast will actually fill, a pickup's spawn pop, shop prices and
 * pickup labels, and the death clips of bodies that just left the world.
 *
 * What went: the hand-drawn ground shadows (the shadow map casts the
 * silhouette), the foot-line sort (the depth buffer), and the scenery tinting
 * (the lights fall on a body because it stands in them).
 *
 * ## Telegraphs lie on the floor
 *
 * A ring, a wedge, a bar is the area the attack will cover, so it is drawn
 * *as* that area: flat on the floor, in room units, where the 2D game drew
 * it over the body. Under a tilted camera a flat shape is exactly as
 * foreshortened as the floor it marks, which is what makes "will that reach
 * me" answerable at a glance.
 */
const TELEGRAPH_SCALE = 2.6;
const LINE_TELEGRAPH_SCALE = 6;
const LINE_TELEGRAPH_HALF_ANGLE = 0.12;
const MAYPOLE_PROP_KIND = propKindIndex('maypole');
const BOMB_PICKUP_ID = 'bierfassl';
const RING_PULSE_RATE = 0.011;
const BOMB_BLINK_RATE = 0.045;
const LABEL_POINT = { x: 0, y: 0 };
/** How far above the floor a pickup hovers, so its shadow separates it from the ground. */
const PICKUP_LIFT = 1.5;

export function mixColor(a: number, b: number, t: number): number {
  const k = Math.min(1, Math.max(0, t));
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const r = Math.round(ar + (((b >> 16) & 0xff) - ar) * k);
  const g = Math.round(ag + (((b >> 8) & 0xff) - ag) * k);
  const bl = Math.round(ab + ((b & 0xff) - ab) * k);
  return (r << 16) | (g << 8) | bl;
}

export interface EntityArt {
  /** What a body with no art of its own draws as. */
  readonly fallback: Texture;
  readonly enemyArt: Readonly<Record<string, Texture>>;
  readonly enemyAnimation: Readonly<Record<string, AnimatedSpriteSet>>;
  readonly pickupArt: Readonly<Record<string, Texture>>;
  readonly bossIds: ReadonlySet<string>;
}

export class EntityView {
  /** Everything this view draws in the world. */
  readonly group = new Group();
  readonly animator = new EntityAnimator();

  private readonly sim: GameSim;
  private readonly art: EntityArt;
  private readonly bodies: Billboard[] = [];
  private readonly corpses: Billboard[] = [];
  private readonly rings: FloorRing[] = [];
  private readonly wedges: FloorWedge[] = [];
  private readonly bars: FloorBar[] = [];
  private readonly labels: WorldLabel[] = [];
  private readonly pickupTints: readonly number[];
  private readonly pickupLabels: readonly string[];
  private readonly pickupSprites: readonly (Texture | undefined)[];
  private readonly bombTexture: Texture | undefined;
  private targetTextures: readonly Texture[] = [];
  private ringPulses = true;
  private lean = 0;
  private readonly telegraphShape: EnemyTelegraphShapeInfo = {
    shape: TelegraphShape.Ring,
    progress: 0,
    x: 0,
    y: 0,
    angle: 0,
    arc: 0,
    reach: 0,
  };

  constructor(
    sim: GameSim,
    art: EntityArt,
    private readonly labelLayer: Container,
    private readonly makeLabel: () => BitmapText,
  ) {
    this.sim = sim;
    this.art = art;
    this.bombTexture = art.pickupArt[BOMB_PICKUP_ID];
    this.pickupTints = sim.pickups.all.map((definition) => definition.tint);
    this.pickupLabels = sim.pickups.all.map((definition) => definition.label);
    this.pickupSprites = sim.pickups.all.map((definition) => art.pickupArt[definition.id]);
    // One of each telegraph shape built up front, hidden, so their (unlit,
    // colour-only) materials are in the scene for `GameView.render`'s
    // first-frame `renderer.compile` — otherwise the first enemy to telegraph
    // an attack linked their programs mid-fight (`docs/DECISIONS.md` #80).
    // Bodies and corpses need no such seed: they share the pedestal item's
    // `Billboard` material shape, which `PedestalView` seeds the same way.
    this.ringAt(0).hide();
    this.wedgeAt(0).hide();
    this.barAt(0).hide();
    // Likewise one world label (a shop price, a pickup name) — `WorldLabel`
    // constructs hidden — so the first priced pickup does not link the label
    // text's program on the way into the shop.
    this.labelAt(0);
  }

  static get telegraphScale(): number {
    return TELEGRAPH_SCALE;
  }

  /** The floor's destructible-prop art, by `DESTRUCTIBLE_PROP_KINDS` index. */
  setTargetTextures(textures: readonly Texture[] | undefined): void {
    this.targetTextures = textures ?? [];
  }

  setRingPulses(enabled: boolean): void {
    this.ringPulses = enabled;
  }

  setLean(lean: number): void {
    this.lean = lean;
  }

  /** Drops every animation and corpse — a room just changed under them. */
  resetAnimation(): void {
    this.animator.reset();
    for (const corpse of this.corpses) {
      corpse.visible = false;
    }
  }

  /** How many billboards are live this frame — the benchmark's proxy for draw work. */
  get spriteCount(): number {
    return this.bodies.length;
  }

  /**
   * `project` maps a world point (x, height, z) to internal-frame pixels — the
   * camera's job, handed in so labels can sit over the heads they belong to.
   */
  sync(
    alpha: number,
    nowMs: number,
    project: (x: number, height: number, z: number, out: { x: number; y: number }) => void,
  ): void {
    this.animator.beginFrame(nowMs);
    const sim = this.sim;
    const world = sim.world;
    const states = world.states;
    const masks = world.masks;
    const required = sim.collidableMask;
    const collision = sim.collision.data;
    const body = sim.body.data;
    const hurtbox = sim.hurtbox.data;
    const flash = sim.flash.data;

    let used = 0;
    let ringsUsed = 0;
    let wedgesUsed = 0;
    let barsUsed = 0;
    let labelsUsed = 0;
    const highWater = world.highWater;
    for (let index = 0; index < highWater; index++) {
      if (states[index] !== World.ALIVE) {
        continue;
      }
      const mask = masks[index] ?? 0;
      if ((mask & required) !== required) {
        continue;
      }
      const layer = collision[index * 2] ?? 0;
      if ((layer & CollisionLayer.Player) !== 0) {
        continue;
      }
      const isEnemyBody = (mask & sim.enemyMask) === sim.enemyMask;
      const isPickup = (layer & CollisionLayer.Pickup) !== 0;
      const isBomb = (mask & sim.bombFuse.bit) !== 0;
      // The arena maypole is `MaibaumView`'s to draw (#199) — skip it here.
      if (
        !isEnemyBody &&
        !isPickup &&
        (mask & sim.propKind.bit) !== 0 &&
        (sim.propKind.data[index] ?? 0) === MAYPOLE_PROP_KIND
      ) {
        continue;
      }

      const footprint = body[index * 2] ?? 1;
      const hurtRadius = hurtboxRadiusOf(hurtbox[index * 2] ?? 0, footprint);
      const x = lerp(sim.previousX(index), sim.positionX(index), alpha);
      const y = lerp(sim.previousY(index), sim.positionY(index), alpha);
      const footZ = y + footprint;

      const enemyId = isEnemyBody
        ? sim.enemies.at(sim.enemy.data[index * ENEMY_STRIDE] ?? 0).id
        : null;
      const isBoss = enemyId !== null && this.art.bossIds.has(enemyId);
      const bossTelegraph = isBoss ? enemyTelegraphProgress(sim, index) : 0;
      const bombFuse = isBomb ? bombFuseProgress(sim, index) : 0;

      const animation = enemyId === null ? undefined : this.art.enemyAnimation[enemyId];
      let animationFrame = 0;
      let mirror = 1;
      if (animation !== undefined) {
        animationFrame = this.animator.track(
          index,
          world.entityAt(index),
          animation.clips,
          resolveAnimationState(sim, index),
          resolveFacing(sim, index),
          x,
          y,
          footprint,
        );
        mirror = this.animator.facingOf(index) === AUTHORED_FACING ? 1 : -1;
      }

      const isPropTarget = !isPickup && enemyId === null && !isBomb;
      const pickupKindIndex = sim.pickupKind.data[index] ?? -1;
      const pickupSprite = isPickup ? this.pickupSprites[pickupKindIndex] : undefined;
      const texture: Texture =
        pickupSprite ??
        (isPickup
          ? this.art.fallback
          : animation !== undefined
            ? (animation.frames[animationFrame] ?? this.art.fallback)
            : isBomb
              ? (this.bombTexture ?? this.art.fallback)
              : enemyId === null
                ? (this.targetTextures[sim.propKind.data[index] ?? 0] ??
                  this.targetTextures[0] ??
                  this.art.fallback)
                : (this.art.enemyArt[enemyId] ?? this.art.fallback));

      const billboard = this.bodyAt(used);
      used += 1;
      billboard.visible = true;
      billboard.setTexture(texture, mirror);
      billboard.flash = !isPickup && (flash[index] ?? 0) > 0;
      billboard.tint = isPickup
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
                    Math.min(
                      1,
                      bombFuse +
                        Math.max(0, bombFuse - 0.5) *
                          (Math.sin(nowMs * BOMB_BLINK_RATE * (1 + bombFuse * 3)) * 0.5 + 0.5),
                    ),
                  )
                : ENTITY_PALETTE.normalTint;

      // A prop tile draws on the tile grid (a 32px barrel covers one cell), a
      // creature on the actor grid — the same two rules the 2D renderer had.
      const gridScale = isPropTarget ? tileGridScale(texture) * 2 : 1;
      const bounceTicks = isPickup ? (sim.spawnBounce.data[index] ?? 0) : 0;
      const bounceMax = Math.max(1, sim.tuning.pickup.spawnBounceTicks);
      const bounceProgress = bounceTicks / bounceMax;
      const pop = bounceTicks > 0 ? 1 + 0.4 * Math.sin(bounceProgress * Math.PI) : 1;
      // A pickup hovers a fixed amount so its shadow separates it from the
      // floor — it does not bob. A per-frame sine here made every static
      // sprite in a still room read as "breathing".
      const lift = isPickup ? PICKUP_LIFT : 0;
      billboard.place(x, 0.2 + lift, footZ, this.lean, gridScale * pop);

      const priced = isPickup && (mask & sim.pickupPrice.bit) !== 0;
      if (isPickup && (priced || pickupSprite === undefined)) {
        const label = this.labelAt(labelsUsed);
        labelsUsed += 1;
        const kindLabel = this.pickupLabels[pickupKindIndex] ?? '?';
        label.text.text = priced
          ? pickupSprite === undefined
            ? `${kindLabel} · ${String(sim.pickupPrice.data[index] ?? 0)}`
            : String(sim.pickupPrice.data[index] ?? 0)
          : kindLabel;
        // Over the body's head: project its top and stand the label there.
        project(x, billboard.heightUnits + lift + 2, footZ, LABEL_POINT);
        label.place(LABEL_POINT.x, LABEL_POINT.y);
        label.show();
      }

      if (!isBoss && enemyTelegraphShape(sim, index, this.telegraphShape)) {
        const info = this.telegraphShape;
        const pulse = this.ringPulses ? Math.sin(nowMs * RING_PULSE_RATE) * 0.12 : 0;
        const shapeAlpha = Math.min(1, 0.35 + info.progress * 0.5 + pulse);
        switch (info.shape) {
          case TelegraphShape.Line: {
            const wedge = this.wedgeAt(wedgesUsed);
            wedgesUsed += 1;
            const reach = hurtRadius * (1 + (LINE_TELEGRAPH_SCALE - 1) * info.progress);
            wedge.place(info.x, info.y, info.angle, reach, LINE_TELEGRAPH_HALF_ANGLE, shapeAlpha);
            break;
          }
          case TelegraphShape.Arc: {
            const wedge = this.wedgeAt(wedgesUsed);
            wedgesUsed += 1;
            wedge.place(
              info.x,
              info.y,
              info.angle,
              info.reach * info.progress,
              info.arc / 2,
              shapeAlpha,
            );
            break;
          }
          case TelegraphShape.Ground: {
            const marker = this.barAt(barsUsed);
            barsUsed += 1;
            const size = info.reach * 2 * info.progress;
            marker.place(info.x, info.y, size, size, shapeAlpha);
            break;
          }
          default: {
            const ring = this.ringAt(ringsUsed);
            ringsUsed += 1;
            const ringRadius = hurtRadius * (1 + (TELEGRAPH_SCALE - 1) * info.progress);
            ring.place(info.x, info.y, ringRadius, shapeAlpha);
            break;
          }
        }
      }

      if (isBomb && bombFuse > 0) {
        // The exact cross `blastCandidate` damages: two arms, a tile wide.
        const armSpan = bombBlastArmLength(sim) * 2 * bombFuse;
        const pulse = this.ringPulses ? Math.sin(nowMs * RING_PULSE_RATE) * 0.12 : 0;
        const barAlpha = Math.min(1, 0.35 + bombFuse * 0.5 + pulse);
        this.barAt(barsUsed).place(x, y, armSpan, ROOM_TILE_UNITS, barAlpha);
        barsUsed += 1;
        this.barAt(barsUsed).place(x, y, ROOM_TILE_UNITS, armSpan, barAlpha);
        barsUsed += 1;
      }
    }

    this.animator.endFrame();
    this.syncCorpses();

    for (let slot = used; slot < this.bodies.length; slot++) {
      const body = this.bodies[slot];
      if (body !== undefined) {
        body.visible = false;
      }
    }
    for (let slot = ringsUsed; slot < this.rings.length; slot++) {
      this.rings[slot]?.hide();
    }
    for (let slot = wedgesUsed; slot < this.wedges.length; slot++) {
      this.wedges[slot]?.hide();
    }
    for (let slot = barsUsed; slot < this.bars.length; slot++) {
      this.bars[slot]?.hide();
    }
    for (let slot = labelsUsed; slot < this.labels.length; slot++) {
      this.labels[slot]?.hide();
    }
  }

  /** Death clips of bodies no longer in the world, fading where they fell. */
  private syncCorpses(): void {
    const animator = this.animator;
    let used = 0;
    for (let entry = 0; entry < animator.corpseCount; entry++) {
      const slot = animator.corpseSlotAt(entry);
      const clips = animator.corpseSetAt(slot);
      if (clips === null) {
        continue;
      }
      const frame = this.art.enemyAnimation[clips.name]?.frames[animator.corpseFrameAt(slot)];
      if (frame === undefined) {
        continue;
      }
      const corpse = this.corpseAt(used);
      used += 1;
      corpse.visible = true;
      corpse.setTexture(frame, animator.corpseFacingAt(slot) === AUTHORED_FACING ? 1 : -1);
      corpse.alpha = animator.corpseAlphaAt(slot);
      corpse.flash = false;
      corpse.tint = ENTITY_PALETTE.normalTint;
      corpse.place(
        animator.corpseXAt(slot),
        0.2,
        animator.corpseYAt(slot) + animator.corpseRadiusAt(slot),
        this.lean,
      );
    }
    for (let slot = used; slot < this.corpses.length; slot++) {
      const corpse = this.corpses[slot];
      if (corpse !== undefined) {
        corpse.visible = false;
      }
    }
  }

  private bodyAt(slot: number): Billboard {
    const existing = this.bodies[slot];
    if (existing !== undefined) {
      return existing;
    }
    const created = new Billboard();
    this.bodies.push(created);
    this.group.add(created.mesh);
    return created;
  }

  private corpseAt(slot: number): Billboard {
    const existing = this.corpses[slot];
    if (existing !== undefined) {
      return existing;
    }
    const created = new Billboard();
    this.corpses.push(created);
    this.group.add(created.mesh);
    return created;
  }

  private ringAt(slot: number): FloorRing {
    const existing = this.rings[slot];
    if (existing !== undefined) {
      return existing;
    }
    const created = new FloorRing(ENTITY_PALETTE.telegraphRing);
    this.rings.push(created);
    this.group.add(created.mesh);
    return created;
  }

  private wedgeAt(slot: number): FloorWedge {
    const existing = this.wedges[slot];
    if (existing !== undefined) {
      return existing;
    }
    const created = new FloorWedge(ENTITY_PALETTE.telegraphRing);
    this.wedges.push(created);
    this.group.add(created.mesh);
    return created;
  }

  private barAt(slot: number): FloorBar {
    const existing = this.bars[slot];
    if (existing !== undefined) {
      return existing;
    }
    const created = new FloorBar(ENTITY_PALETTE.telegraphRing);
    this.bars.push(created);
    this.group.add(created.mesh);
    return created;
  }

  private labelAt(slot: number): WorldLabel {
    const existing = this.labels[slot];
    if (existing !== undefined) {
      return existing;
    }
    const created = new WorldLabel(this.makeLabel(), this.labelLayer);
    this.labels.push(created);
    return created;
  }

  destroy(): void {
    for (const body of [...this.bodies, ...this.corpses]) {
      body.dispose();
    }
    for (const shape of [...this.rings, ...this.wedges, ...this.bars]) {
      shape.dispose();
    }
    for (const label of this.labels) {
      label.dispose();
    }
    this.group.removeFromParent();
  }
}
