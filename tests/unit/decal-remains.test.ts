import { describe, expect, it } from 'vitest';
import { ENEMY_DEFINITIONS } from '../../src/content/enemies/index.js';
import { DECAL_PIXELS, decalPixels } from '../../src/render/decal-art.js';
import { EnemyRegistry } from '../../src/sim/enemy/registry.js';
import {
  DECAL_KIND_COUNT,
  DECAL_VARIANTS,
  DecalKind,
  DecalStore,
  REMAINS_KINDS,
  type DecalKindId,
} from '../../src/sim/particle/decals.js';

describe('death remains', () => {
  it('draws every kind and variant, differently, inside its canvas', () => {
    for (let kind = 0; kind < DECAL_KIND_COUNT; kind++) {
      const seen = new Set<string>();
      for (let variant = 0; variant < DECAL_VARIANTS; variant++) {
        const pixels = decalPixels(kind as DecalKindId, variant);
        expect(pixels).toHaveLength(DECAL_PIXELS * DECAL_PIXELS);
        expect(pixels.some((p) => p !== -1)).toBe(true);
        seen.add(pixels.join());
      }
      expect(seen.size).toBe(DECAL_VARIANTS);
    }
  });

  it('is deterministic', () => {
    expect(decalPixels(DecalKind.Blood, 2)).toEqual(decalPixels(DecalKind.Blood, 2));
  });

  it('stores the kind and variant it was spawned with', () => {
    const store = new DecalStore();
    const index = store.spawn(1, 2, 8, 0, DecalKind.Metal, 3);
    expect(store.kind[index]).toBe(DecalKind.Metal);
    expect(store.variant[index]).toBe(3);
  });

  it('compiles every authored remains name and rejects a typo', () => {
    const registry = new EnemyRegistry(ENEMY_DEFINITIONS);
    for (const definition of ENEMY_DEFINITIONS) {
      const compiled = registry.all.find((enemy) => enemy.id === definition.id);
      expect(compiled?.remains).toBe(REMAINS_KINDS[definition.remains ?? 'blood']);
    }
    const first = ENEMY_DEFINITIONS[0];
    if (first === undefined) {
      throw new Error('no enemies');
    }
    expect(() => new EnemyRegistry([{ ...first, remains: 'glitter' }])).toThrow(/remains/);
  });

  it('leaves what the thing was made of', () => {
    const registry = new EnemyRegistry(ENEMY_DEFINITIONS);
    const remains = (id: string): number | undefined =>
      registry.all.find((enemy) => enemy.id === id)?.remains;
    expect(remains('boar')).toBe(DecalKind.Blood);
    expect(remains('kellerassel')).toBe(DecalKind.Ichor);
    expect(remains('traktor')).toBe(DecalKind.Metal);
    expect(remains('rollfass')).toBe(DecalKind.Wood);
    expect(remains('fliegenpilz')).toBe(DecalKind.Spores);
  });
});
