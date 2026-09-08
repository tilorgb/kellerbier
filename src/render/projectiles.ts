import {
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

const SCRATCH_MATRIX = new Matrix4();
const SCRATCH_POSITION = new Vector3();
const SCRATCH_QUATERNION = new Quaternion();
const SCRATCH_SCALE = new Vector3();
const SCRATCH_COLOR = new Color(0xffffff);
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

  constructor(texture: Texture, capacity: number) {
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
    });
    this.mesh = new InstancedMesh(geometry, material, capacity);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    // Allocate the colour attribute up front so `setColorAt` never does —
    // and so the program is linked with instance colours from its first
    // frame rather than relinked on the first tinted shot (see the class doc).
    this.mesh.setColorAt(0, SCRATCH_COLOR.setHex(NO_TINT));
  }

  begin(): void {
    this.count = 0;
  }

  /** Places one quad, centred at the point, `size` room units square, leaning to the camera, multiplied by `tint` (an RGB hex; white for none). */
  add(x: number, height: number, z: number, size: number, lean: number, tint = NO_TINT): void {
    if (this.count >= this.mesh.instanceMatrix.count) {
      return;
    }
    SCRATCH_POSITION.set(x, height, z);
    SCRATCH_QUATERNION.setFromAxisAngle(X_AXIS, lean);
    SCRATCH_SCALE.set(size, size, 1);
    SCRATCH_MATRIX.compose(SCRATCH_POSITION, SCRATCH_QUATERNION, SCRATCH_SCALE);
    this.mesh.setMatrixAt(this.count, SCRATCH_MATRIX);
    this.mesh.setColorAt(this.count, SCRATCH_COLOR.setHex(tint));
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
  private accessibility: ProjectileAccessibility = DEFAULT_PROJECTILE_ACCESSIBILITY;
  private lean = 0;
  private lighting: Lighting | null = null;

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
      // Only a player shot carries an item's tint; an enemy's sprite is its own.
      const tint = isPlayer ? (TINT_BY_INDEX[store.tint[index] ?? 0] ?? NO_TINT) : NO_TINT;
      this.layerFor(texture, this.layers).add(x, height, z, radius * 2, this.lean, tint);
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
          light.intensity = SHOT_LIGHT_INTENSITY;
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
  }

  private layerFor(texture: Texture, into: Map<Texture, InstancedSprites>): InstancedSprites {
    const existing = into.get(texture);
    if (existing !== undefined) {
      return existing;
    }
    const created = new InstancedSprites(texture, this.store.capacity);
    created.begin();
    into.set(texture, created);
    this.group.add(created.mesh);
    return created;
  }

  destroy(): void {
    for (const layer of [...this.layers.values(), ...this.markerLayers.values()]) {
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
