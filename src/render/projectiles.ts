import {
  AdditiveBlending,
  Color,
  DoubleSide,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
  Group,
} from 'three';
import { lerp } from '../sim/math.js';
import { ProjectileTeam, type ProjectileStore } from '../sim/projectile/store.js';
import { ProjectileTag, type ProjectileTagId } from '../sim/projectile/tags.js';
import { PROJECTILE_TINT_NAMES } from '../sim/projectile/tints.js';
import type { Texture } from './gfx/index.js';
import { PROJECTILE_TINT_COLOURS } from './palette.js';
import { ACTOR_PIXELS_PER_UNIT } from './resolution.js';
import type { Lighting } from './world/lighting.js';

/**
 * Every live shot, and the light it throws.
 *
 * ## Instanced by texture
 *
 * A bullet hell's projectiles are the one place count matters, so shots are
 * not billboards one by one: every texture a shot can wear gets one
 * `InstancedMesh` sized to the store's capacity, and a frame writes each live
 * shot's transform into its texture's mesh. Eight or so draw calls for five
 * thousand shots, whatever the mix.
 *
 * ## Which texture
 *
 * `spriteFor` is unchanged from the 2D renderer: a player shot wears the art
 * of its highest-priority status tag (`PLAYER_TAG_SPRITE_ORDER` — a burning
 * poisoned shot reads as burning), an enemy shot wears its enemy's own art if
 * it has some, else the floor's, else the fallback. And a shot's size is
 * still its collision radius: the one deliberate exception to "a sprite's
 * canvas is its size" (#45), because `shotRadius` is tunable and items grow
 * it, and the player has to see that.
 *
 * ## Height and light
 *
 * The simulation is flat. A player's thrown Maß gets a presentation-only arc
 * over its first `ARC_TICKS`, and the first `SHOT_LIGHT_COUNT` player shots
 * each carry a point light — where it hits is unchanged, what it lights up on
 * the way is new. Enemy shots skim low and unlit, so the two teams read apart
 * even before colour.
 *
 * #53's colourblind team markers ride along the same way: a second instanced
 * layer, a dot over a player shot and a diamond over an enemy's, both pure
 * white — brightness is the primary cue, the shape the backup.
 *
 * ## Tint
 *
 * A shot's `ProjectileStore.tint` (`sim/projectile/tints.ts`) multiplies its
 * sprite through the mesh's per-instance colour — the same attribute
 * `ParticleView` already fades particles with — so an item can colour the
 * shots it touched (a brown Spezi, a white Weißwurst) without a sprite of its
 * own. The attribute is allocated at layer construction, never on first use,
 * for the reason `ParticleView` gives: a layer that grows an attribute
 * mid-run relinks its program on that frame (`docs/DECISIONS.md` #80).
 */
export interface ProjectileArt {
  readonly player: Texture;
  readonly playerTags: readonly { readonly tag: ProjectileTagId; readonly texture: Texture }[];
  readonly enemyByName: Readonly<Record<string, Texture>>;
  readonly enemyByFloor: Readonly<Record<number, Texture>>;
  readonly fallback: Texture;
  readonly teamMarkers?: { readonly player: Texture; readonly enemy: Texture };
}

export function spriteFor(
  art: ProjectileArt,
  team: number,
  tags: number,
  artName: string | null,
  floor: number,
): Texture {
  if (team === ProjectileTeam.Player) {
    for (const entry of art.playerTags) {
      if ((tags & entry.tag) !== 0) {
        return entry.texture;
      }
    }
    return art.player;
  }
  if (artName !== null) {
    const named = art.enemyByName[artName];
    if (named !== undefined) {
      return named;
    }
  }
  return art.enemyByFloor[floor] ?? art.fallback;
}

export const PLAYER_TAG_SPRITE_ORDER: readonly { tag: ProjectileTagId; sprite: string }[] = [
  { tag: ProjectileTag.Burning, sprite: 'beer-burning' },
  { tag: ProjectileTag.Freezing, sprite: 'beer-freezing' },
  { tag: ProjectileTag.Poison, sprite: 'beer-poison' },
  { tag: ProjectileTag.Piercing, sprite: 'beer-piercing' },
  { tag: ProjectileTag.Spectral, sprite: 'beer-spectral' },
];

export interface ProjectileAccessibility {
  readonly colorblindPalette: boolean;
}

const DEFAULT_PROJECTILE_ACCESSIBILITY: ProjectileAccessibility = { colorblindPalette: false };
const MARKER_SCALE = 0.6;
const ARC_TICKS = 50;
const ARC_HEIGHT = 7;
const PLAYER_SHOT_HEIGHT = 6;
const ENEMY_SHOT_HEIGHT = 5;
const SHOT_LIGHT_INTENSITY = 220;

/**
 * How far past `1` the renderer is willing to draw `promilleShotHeat`.
 *
 * The ramp is uncapped on purpose (a raised Trinkfest pushes the threshold
 * out past it), and the same reasoning `Vignette`'s `MAX_DISTORTION_ALPHA`
 * gives applies here: past a point "hotter" stops reading as hotter and
 * starts reading as a white rectangle where the shot used to be.
 */
const MAX_SHOT_HEAT = 1.35;

/**
 * The instance colour a fully hot shot is multiplied by. Above `1` on red and
 * green on purpose: the material is `toneMapped: false`, so channels past 1
 * clip to white and the sprite's bright pixels become a white-hot core while
 * its darker ones stay amber — which is what a flame does, and what a flat
 * orange tint does not.
 */
const HOT_TINT_R = 1.9;
const HOT_TINT_G = 1.15;
const HOT_TINT_B = 0.45;

/** Heat below which no glow is drawn at all — roughly the top of Angeheitert, so a sip warms the shot without setting it on fire. */
const GLOW_FROM = 0.35;
/** The additive glow's colour at full strength, before the ramp scales it down. */
const GLOW_COLOUR = new Color(0xff7a1e);
/** How much bigger than the shot the glow quad is drawn, at `GLOW_FROM` and at full heat. */
const GLOW_SCALE_MIN = 1.3;
const GLOW_SCALE_MAX = 2;
/** The shot light's colour, cold end and hot end. */
const SHOT_LIGHT_COOL = new Color(0xffb347);
const SHOT_LIGHT_HOT = new Color(0xff5a1e);
/** How much brighter a fully hot shot's point light burns. */
const SHOT_LIGHT_HEAT_GAIN = 1.1;

const SCRATCH_MATRIX = new Matrix4();
const SCRATCH_POSITION = new Vector3();
const SCRATCH_QUATERNION = new Quaternion();
const SCRATCH_SCALE = new Vector3();
const SCRATCH_COLOR = new Color(0xffffff);
/** This frame's heat multiplier — recomputed once per `sync`, not per shot. */
const HEAT_COLOR = new Color(0xffffff);
/** This frame's glow colour, already scaled by the glow ramp. */
const GLOW_TINT = new Color(0x000000);
/** One shot's final instance colour: its item tint times `HEAT_COLOR`. */
const SHOT_COLOR = new Color(0xffffff);
const WHITE = new Color(0xffffff);
const X_AXIS = new Vector3(1, 0, 0);

/** `PROJECTILE_TINT_COLOURS` by store index, so the frame loop indexes an array rather than looking a name up. */
const TINT_BY_INDEX: readonly number[] = PROJECTILE_TINT_NAMES.map(
  (name) => PROJECTILE_TINT_COLOURS[name],
);
const NO_TINT = 0xffffff;

/** One instanced layer of quads wearing one texture. */
class InstancedSprites {
  readonly mesh: InstancedMesh;
  count = 0;

  /**
   * `additive: true` builds the glow variant — the same geometry and the same
   * alpha-tested cutout, blended additively with no depth write, so a hot
   * shot's halo brightens whatever is behind it instead of punching a hole in
   * it. Its own layer rather than a second pass over the main one because a
   * material cannot be two blend modes at once, and per-instance strength is
   * carried in the instance colour (a scaled `GLOW_COLOUR`) rather than in a
   * per-material opacity, which could not vary per shot.
   */
  constructor(texture: Texture, capacity: number, additive = false) {
    const geometry = new PlaneGeometry(1, 1);
    const [u0, v0, u1, v1] = texture.uvs();
    const uv = geometry.getAttribute('uv');
    uv.setXY(0, u0, v0);
    uv.setXY(1, u1, v0);
    uv.setXY(2, u0, v1);
    uv.setXY(3, u1, v1);
    const material = new MeshBasicMaterial({
      map: texture.source.texture,
      alphaTest: 0.5,
      side: DoubleSide,
      toneMapped: false,
      ...(additive
        ? { blending: AdditiveBlending, transparent: true, depthWrite: false }
        : undefined),
    });
    this.mesh = new InstancedMesh(geometry, material, capacity);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    // Allocate the colour attribute up front so `setColorAt` never does —
    // and so the program is linked with instance colours from its first
    // frame rather than relinked on the first tinted shot (see the class doc).
    this.mesh.setColorAt(0, SCRATCH_COLOR.setHex(NO_TINT));
    // Behind the shots themselves, whatever three.js's own transparent sort
    // would otherwise decide from a camera distance the two layers share.
    this.mesh.renderOrder = additive ? -1 : 0;
  }

  begin(): void {
    this.count = 0;
  }

  /**
   * Places one quad, centred at the point, `size` room units square, leaning
   * to the camera, multiplied by `tint`.
   *
   * A `Color` rather than a hex since #311: the caller composes an item tint
   * with this frame's heat multiplier, and handing that composition back
   * through a hex would mean packing and unpacking it every shot. The colour
   * is read immediately, so a caller reusing one scratch instance is fine —
   * and is what the frame loop does.
   */
  add(x: number, height: number, z: number, size: number, lean: number, tint: Color = WHITE): void {
    if (this.count >= this.mesh.instanceMatrix.count) {
      return;
    }
    SCRATCH_POSITION.set(x, height, z);
    SCRATCH_QUATERNION.setFromAxisAngle(X_AXIS, lean);
    SCRATCH_SCALE.set(size, size, 1);
    SCRATCH_MATRIX.compose(SCRATCH_POSITION, SCRATCH_QUATERNION, SCRATCH_SCALE);
    this.mesh.setMatrixAt(this.count, SCRATCH_MATRIX);
    this.mesh.setColorAt(this.count, tint);
    this.count += 1;
  }

  end(): void {
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor !== null) {
      this.mesh.instanceColor.needsUpdate = true;
    }
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshBasicMaterial).dispose();
    this.mesh.dispose();
    this.mesh.removeFromParent();
  }
}

export class ProjectileView {
  readonly group = new Group();

  private readonly store: ProjectileStore;
  private readonly art: ProjectileArt;
  private readonly artNames: readonly (string | null)[];
  private readonly layers = new Map<Texture, InstancedSprites>();
  private readonly markerLayers = new Map<Texture, InstancedSprites>();
  private readonly glowLayers = new Map<Texture, InstancedSprites>();
  private accessibility: ProjectileAccessibility = DEFAULT_PROJECTILE_ACCESSIBILITY;
  private lean = 0;
  private lighting: Lighting | null = null;
  /** `GameSim.promilleShotHeat`, clamped — see `setShotHeat`. */
  private shotHeat = 0;

  constructor(
    store: ProjectileStore,
    art: ProjectileArt,
    artNames: readonly (string | null)[] = [],
  ) {
    this.store = store;
    this.art = art;
    this.artNames = artNames;
  }

  /** How many textures have been given an instanced layer so far. */
  get layerCount(): number {
    return this.layers.size;
  }

  setAccessibility(accessibility: ProjectileAccessibility): void {
    this.accessibility = accessibility;
  }

  setLean(lean: number): void {
    this.lean = lean;
  }

  /** Where the shot lights come from; without one, shots are unlit. */
  setLighting(lighting: Lighting | null): void {
    this.lighting = lighting;
  }

  /**
   * How hot the player's shots run this frame (#311) — `GameSim.
   * promilleShotHeat`, pushed in once a frame by `GameView` rather than read
   * off a `sim` this class does not otherwise hold, the same shape
   * `setLean`/`setLighting` already use.
   *
   * Clamped here rather than at the source: the ramp is deliberately
   * uncapped so Trinkfest keeps escalating it, and how far past `1` is still
   * legible is a rendering question (`MAX_SHOT_HEAT`).
   */
  setShotHeat(heat: number): void {
    this.shotHeat = Math.min(MAX_SHOT_HEAT, Math.max(0, heat));
  }

  sync(alpha: number, floor: number): void {
    const store = this.store;
    const teamMarkers = this.art.teamMarkers;
    const markersOn = this.accessibility.colorblindPalette && teamMarkers !== undefined;
    for (const layer of this.layers.values()) {
      layer.begin();
    }
    for (const layer of this.markerLayers.values()) {
      layer.begin();
    }
    for (const layer of this.glowLayers.values()) {
      layer.begin();
    }
    // This frame's heat, resolved once rather than per shot: one player means
    // one meter, so every shot on screen is equally hot however long ago it
    // left the barrel. (Baking the heat into each shot at spawn was the other
    // option and is worse — a shot fired sober would stay cold while crossing
    // a room the player got drunk in, which reads as a rendering bug rather
    // than as history.)
    const heat = this.shotHeat;
    HEAT_COLOR.setRGB(
      1 + (HOT_TINT_R - 1) * heat,
      1 + (HOT_TINT_G - 1) * heat,
      1 + (HOT_TINT_B - 1) * heat,
    );
    const glow = heat <= GLOW_FROM ? 0 : (heat - GLOW_FROM) / (MAX_SHOT_HEAT - GLOW_FROM);
    GLOW_TINT.copy(GLOW_COLOUR).multiplyScalar(glow);
    const glowScale = GLOW_SCALE_MIN + (GLOW_SCALE_MAX - GLOW_SCALE_MIN) * glow;
    let lights = 0;
    store.forEachLive((index) => {
      const team = store.team[index] ?? 0;
      const isPlayer = team === ProjectileTeam.Player;
      const texture = spriteFor(
        this.art,
        team,
        store.tags[index] ?? 0,
        this.artNames[store.art[index] ?? 0] ?? null,
        floor,
      );
      const radius = store.radius[index] ?? 1;
      const x = lerp(store.previousX[index] ?? 0, store.x[index] ?? 0, alpha);
      const z = lerp(store.previousY[index] ?? 0, store.y[index] ?? 0, alpha);
      const t = Math.min(1, (store.ticksAlive[index] ?? 0) / ARC_TICKS);
      const height = isPlayer
        ? PLAYER_SHOT_HEIGHT + ARC_HEIGHT * Math.sin(t * Math.PI)
        : ENEMY_SHOT_HEIGHT;
      // Only a player shot carries an item's tint — or the meter's heat; an
      // enemy's sprite is its own, and an enemy shot getting brighter as the
      // player drinks would read as the enemy being buffed.
      if (isPlayer) {
        SHOT_COLOR.setHex(TINT_BY_INDEX[store.tint[index] ?? 0] ?? NO_TINT).multiply(HEAT_COLOR);
      } else {
        SHOT_COLOR.setHex(NO_TINT);
      }
      this.layerFor(texture, this.layers).add(x, height, z, radius * 2, this.lean, SHOT_COLOR);
      if (isPlayer && glow > 0) {
        // Always the base player sprite, never `texture`: the halo is a
        // flame shape, not a second copy of whatever status art the shot is
        // wearing, and one glow layer means exactly one extra shader program
        // for the whole effect rather than one per player-shot texture
        // (`docs/DECISIONS.md` #80 — the room-crossing gate counts those).
        this.layerFor(this.art.player, this.glowLayers, true).add(
          x,
          height,
          z,
          radius * 2 * glowScale,
          this.lean,
          GLOW_TINT,
        );
      }
      if (markersOn) {
        const marker = isPlayer ? teamMarkers.player : teamMarkers.enemy;
        this.layerFor(marker, this.markerLayers).add(
          x,
          height + 0.5,
          z,
          radius * 2 * MARKER_SCALE,
          this.lean,
        );
      }
      if (isPlayer && this.lighting !== null) {
        const light = this.lighting.shotLight(lights);
        if (light !== null) {
          light.position.set(x, height + 1, z);
          light.intensity = SHOT_LIGHT_INTENSITY * (1 + SHOT_LIGHT_HEAT_GAIN * heat);
          light.color.copy(SHOT_LIGHT_COOL).lerp(SHOT_LIGHT_HOT, Math.min(1, heat));
          lights += 1;
        }
      }
    });
    this.lighting?.dimShotLightsFrom(lights);
    for (const layer of this.layers.values()) {
      layer.end();
    }
    for (const layer of this.markerLayers.values()) {
      layer.end();
    }
    for (const layer of this.glowLayers.values()) {
      layer.end();
    }
  }

  private layerFor(
    texture: Texture,
    into: Map<Texture, InstancedSprites>,
    additive = false,
  ): InstancedSprites {
    const existing = into.get(texture);
    if (existing !== undefined) {
      return existing;
    }
    const created = new InstancedSprites(texture, this.store.capacity, additive);
    created.begin();
    into.set(texture, created);
    this.group.add(created.mesh);
    return created;
  }

  destroy(): void {
    for (const layer of [
      ...this.layers.values(),
      ...this.markerLayers.values(),
      ...this.glowLayers.values(),
    ]) {
      layer.dispose();
    }
    this.group.removeFromParent();
  }
}

export { InstancedSprites };
/** Kept so a colourblind marker's per-instance tint could be driven later; white today. */
export const MARKER_COLOUR = SCRATCH_COLOR;
/** Room units per authored shot pixel — a shot's texture height maps to its diameter, not this, but exported for tests. */
export const SHOT_PIXELS_PER_UNIT = ACTOR_PIXELS_PER_UNIT;
