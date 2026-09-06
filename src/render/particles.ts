import {
  AdditiveBlending,
  Color,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from 'three';
import { lerp } from '../sim/math.js';
import { ParticleKind, type ParticleStore } from '../sim/particle/store.js';
import type { Texture } from './gfx/index.js';

/**
 * Every live particle — foam, sparks, dust, embers, the muzzle flash.
 *
 * ## Instanced by kind
 *
 * One `InstancedMesh` per particle kind, sized to the store's capacity, so a
 * thousand particles are a dozen draw calls. The fade is baked into the
 * per-instance colour under additive blending: a particle near the end of its
 * life is drawn darker, and darker under additive *is* fainter — which sidesteps
 * both per-instance alpha and the sorting soft-alpha quads would otherwise
 * need in a 3D scene. Foam, sparks and embers are light; additive suits them.
 *
 * ## Accessibility is applied at draw time
 *
 * `draws(kind)` is the same filter as before (`docs/DECISIONS.md` #41):
 * reduced motion removes the decorative kinds, reduced flashes removes the
 * muzzle flash, and neither ever removes foam, splash or spark — the only copy
 * of "that connected" / "that died" a player gets. Suppressed here, never at
 * spawn, so a replay is byte-identical whatever the toggles.
 */
export interface ParticleTextures {
  readonly byKind: readonly (Texture | undefined)[];
  readonly fallback: Texture;
}

const DECORATIVE_KINDS = kindFlags([ParticleKind.Dust, ParticleKind.Glint, ParticleKind.Ember]);
const FLASHING_KINDS = kindFlags([ParticleKind.Flash]);

function kindFlags(kinds: readonly number[]): readonly boolean[] {
  const flags: boolean[] = [];
  for (const kind of kinds) {
    flags[kind] = true;
  }
  return flags;
}

export interface ParticleAccessibility {
  readonly reducedMotion: boolean;
  readonly reduceFlashes: boolean;
}

const FULL_EFFECTS: ParticleAccessibility = { reducedMotion: false, reduceFlashes: false };

/** How far above the floor a particle floats at birth, and how much higher it drifts as it dies. */
const PARTICLE_HEIGHT = 3;
const PARTICLE_RISE = 5;

const SCRATCH_MATRIX = new Matrix4();
const SCRATCH_POSITION = new Vector3();
const SCRATCH_QUATERNION = new Quaternion();
const SCRATCH_SCALE = new Vector3();
const SCRATCH_COLOR = new Color();
const X_AXIS = new Vector3(1, 0, 0);

class ParticleLayer {
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
    this.mesh = new InstancedMesh(
      geometry,
      new MeshBasicMaterial({
        map: texture.source.texture,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
        toneMapped: false,
      }),
      capacity,
    );
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    // Allocate the colour attribute up front so `setColorAt` never does.
    this.mesh.setColorAt(0, SCRATCH_COLOR.setScalar(1));
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshBasicMaterial).dispose();
    this.mesh.dispose();
    this.mesh.removeFromParent();
  }
}

export class ParticleView {
  readonly group = new Group();

  private readonly store: ParticleStore;
  private readonly textures: ParticleTextures;
  private readonly layers: (ParticleLayer | undefined)[] = [];
  private accessibility: ParticleAccessibility = FULL_EFFECTS;
  private lean = 0;

  constructor(store: ParticleStore, textures: ParticleTextures) {
    this.store = store;
    this.textures = textures;
  }

  setAccessibility(accessibility: ParticleAccessibility): void {
    this.accessibility = accessibility;
  }

  setLean(lean: number): void {
    this.lean = lean;
  }

  draws(kind: number): boolean {
    const settings = this.accessibility;
    if (settings.reducedMotion && DECORATIVE_KINDS[kind] === true) {
      return false;
    }
    return !(settings.reduceFlashes && FLASHING_KINDS[kind] === true);
  }

  /** Particles drawn this frame, across every kind. */
  get drawnCount(): number {
    let total = 0;
    for (const layer of this.layers) {
      total += layer?.count ?? 0;
    }
    return total;
  }

  sync(alpha: number): void {
    const store = this.store;
    for (const layer of this.layers) {
      if (layer !== undefined) {
        layer.count = 0;
      }
    }
    SCRATCH_QUATERNION.setFromAxisAngle(X_AXIS, this.lean);
    store.forEachLive((index) => {
      const kind = store.kind[index] ?? 0;
      if (!this.draws(kind)) {
        return;
      }
      const layer = this.layerFor(kind);
      if (layer.count >= layer.mesh.instanceMatrix.count) {
        return;
      }
      const life = store.life[index] ?? 0;
      const maxLife = store.maxLife[index] ?? 1;
      const remaining = maxLife === 0 ? 0 : life / maxLife;
      const size = (store.size[index] ?? 1) * (0.4 + remaining * 0.6) * 2;
      SCRATCH_POSITION.set(
        lerp(store.previousX[index] ?? 0, store.x[index] ?? 0, alpha),
        PARTICLE_HEIGHT + (1 - remaining) * PARTICLE_RISE,
        lerp(store.previousY[index] ?? 0, store.y[index] ?? 0, alpha),
      );
      SCRATCH_SCALE.set(size, size, 1);
      SCRATCH_MATRIX.compose(SCRATCH_POSITION, SCRATCH_QUATERNION, SCRATCH_SCALE);
      layer.mesh.setMatrixAt(layer.count, SCRATCH_MATRIX);
      layer.mesh.setColorAt(layer.count, SCRATCH_COLOR.setScalar(Math.min(1, remaining * 1.6)));
      layer.count += 1;
    });
    for (const layer of this.layers) {
      if (layer === undefined) {
        continue;
      }
      layer.mesh.count = layer.count;
      layer.mesh.instanceMatrix.needsUpdate = true;
      if (layer.mesh.instanceColor !== null) {
        layer.mesh.instanceColor.needsUpdate = true;
      }
    }
  }

  private layerFor(kind: number): ParticleLayer {
    const existing = this.layers[kind];
    if (existing !== undefined) {
      return existing;
    }
    const created = new ParticleLayer(
      this.textures.byKind[kind] ?? this.textures.fallback,
      this.store.capacity,
    );
    this.layers[kind] = created;
    this.group.add(created.mesh);
    return created;
  }

  destroy(): void {
    for (const layer of this.layers) {
      layer?.dispose();
    }
    this.group.removeFromParent();
  }
}
