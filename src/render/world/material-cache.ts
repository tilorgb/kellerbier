import { MeshStandardMaterial, RepeatWrapping } from 'three';
import type { Texture } from '../gfx/index.js';
import { tilingTexture } from './flat.js';

/**
 * Materials `Scenery`/`DoorPiece` borrow instead of constructing fresh, so a
 * room transition stops relinking shaders it already linked once
 * (`docs/PERFORMANCE_AUDIT.md` F1).
 *
 * Three.js's program cache is keyed on a material's *shape* — whether it has
 * a map, its blending, alpha test, side, and so on — not on the numeric
 * value of a colour or a texture's repeat, and not on the material object's
 * identity. Disposing the last material of a given shape still deletes that
 * shape's compiled program, though, so the room-by-room churn of `new
 * MeshStandardMaterial(...)` + `dispose()` was relinking shapes it had
 * already linked, every crossing, forever. Handing back the *same* instance
 * for a shape already seen keeps that program's reference count above zero
 * for the run's lifetime, so a cache miss only ever happens once per shape
 * per floor.
 *
 * Not everything room geometry needs can come from here: a `DoorPiece` leaf
 * has its colour tinted per-door (locked vs. not), so it stays a private,
 * disposed-per-rebuild material — see `scenery.ts`'s `buildLeaves`. Its
 * shape (textured, roughness-only) still gets kept warm for free, by every
 * wall material this cache does hand out.
 */
export class MaterialCache {
  /** Textures cloned per-instance for a tiling repeat: keyed by the source texture, then by size/look. */
  private readonly tiled = new Map<Texture, Map<string, MeshStandardMaterial>>();
  /** The floor's own tile textures, used directly (never cloned): keyed by texture, then by roughness. */
  private readonly shared = new Map<Texture, Map<number, MeshStandardMaterial>>();
  /** Tiling via a baked UV repeat rather than a per-size clone — see `repeatingMaterial`. */
  private readonly repeating = new Map<Texture, MeshStandardMaterial>();
  /** No texture at all — a flat colour. */
  private readonly flat = new Map<string, MeshStandardMaterial>();

  /**
   * A material whose map tiles `texture` across `width × height` room units —
   * `tiledBox`'s faces, the floor's dark surround, a door leaf. `width`/
   * `height` are quantised to the room grid already (`ROOM_TILE_UNITS`), so
   * the same wall run size recurs often enough for this to be a real cache,
   * not just a keepalive.
   */
  tiledMaterial(
    texture: Texture,
    width: number,
    height: number,
    options: { readonly roughness?: number; readonly color?: number } = {},
  ): MeshStandardMaterial {
    const roughness = options.roughness ?? 0.95;
    const color = options.color ?? 0xffffff;
    let byShape = this.tiled.get(texture);
    if (byShape === undefined) {
      byShape = new Map();
      this.tiled.set(texture, byShape);
    }
    const key = `${String(width)}:${String(height)}:${String(roughness)}:${String(color)}`;
    let material = byShape.get(key);
    if (material === undefined) {
      material = new MeshStandardMaterial({
        map: tilingTexture(texture, width, height),
        roughness,
        color,
      });
      byShape.set(key, material);
    }
    return material;
  }

  /**
   * A material whose map is `texture` itself, undistorted — the living
   * floor's per-variant plane, which already lays out its own UVs per cell
   * rather than relying on wrap/repeat.
   */
  sharedMaterial(texture: Texture, roughness = 0.85): MeshStandardMaterial {
    let byRoughness = this.shared.get(texture);
    if (byRoughness === undefined) {
      byRoughness = new Map();
      this.shared.set(texture, byRoughness);
    }
    let material = byRoughness.get(roughness);
    if (material === undefined) {
      material = new MeshStandardMaterial({ map: texture.source.texture, roughness });
      byRoughness.set(roughness, material);
    }
    return material;
  }

  /**
   * A material whose map tiles by a UV repeat *baked into the geometry*
   * rather than a per-size texture clone's `.repeat` — what #293's merged
   * wall/void geometry needs, since one merged mesh holds every wall run in
   * the room and each run wants its own repeat count, which a single
   * material's `.repeat` cannot vary by face. One instance per texture, ever
   * — no per-size keying, unlike `tiledMaterial` — because the geometry is
   * what varies now, not the material.
   *
   * This sets the *shared*, un-cloned texture's own wrap mode to `Repeat`,
   * the first time any room asks for it. Safe today because a floor
   * tileset's wall texture is its own dedicated image (`frame` covers the
   * whole source, so wrapping repeats exactly that image) — `sharedMaterial`
   * above never samples the same texture outside `[0,1]`, so this does not
   * change how it looks. That stops being true the day `tiles.wall` becomes
   * a sub-rectangle of a packed atlas (#294): repeating would then wrap into
   * the *next* sprite in the sheet, not tile the same one. Whoever lands the
   * atlas needs to either give walls their own unpacked sheet or replace
   * this with a shader-level tiling trick.
   */
  repeatingMaterial(texture: Texture, roughness = 0.95): MeshStandardMaterial {
    let material = this.repeating.get(texture);
    if (material === undefined) {
      const map = texture.source.texture;
      map.wrapS = RepeatWrapping;
      map.wrapT = RepeatWrapping;
      material = new MeshStandardMaterial({ map, roughness });
      this.repeating.set(texture, material);
    }
    return material;
  }

  /** A solid-colour material with no map — a colour-only wall, a hazard, a door frame. */
  flatMaterial(
    colour: number,
    options: {
      readonly roughness?: number;
      readonly metalness?: number;
      readonly transparent?: boolean;
      readonly opacity?: number;
    } = {},
  ): MeshStandardMaterial {
    const roughness = options.roughness ?? 0.95;
    const metalness = options.metalness ?? 0;
    const transparent = options.transparent ?? false;
    const opacity = options.opacity ?? 1;
    const key = `${String(colour)}:${String(roughness)}:${String(metalness)}:${String(transparent)}:${String(opacity)}`;
    let material = this.flat.get(key);
    if (material === undefined) {
      material = new MeshStandardMaterial({
        color: colour,
        roughness,
        metalness,
        transparent,
        opacity,
      });
      this.flat.set(key, material);
    }
    return material;
  }

  /** Only for `GameView.destroy()` — every material here is otherwise meant to outlive any one `Scenery`. */
  dispose(): void {
    for (const byShape of this.tiled.values()) {
      for (const material of byShape.values()) {
        material.map?.dispose();
        material.dispose();
      }
    }
    for (const byRoughness of this.shared.values()) {
      for (const material of byRoughness.values()) {
        material.dispose();
      }
    }
    for (const material of this.repeating.values()) {
      material.dispose();
    }
    for (const material of this.flat.values()) {
      material.dispose();
    }
    this.tiled.clear();
    this.shared.clear();
    this.repeating.clear();
    this.flat.clear();
  }
}
