import { Texture } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { buildParticleArt, TELEGRAPH_RING_SPRITE } from '../../src/render/art-bundle.js';
import { ParticleView } from '../../src/render/particles.js';
import {
  PARTICLE_KIND_IDS,
  ParticleKind,
  ParticleStore,
  type ParticleKindId,
} from '../../src/sim/particle/store.js';
import { DEATH_EFFECT_KINDS } from '../../src/sim/particle/effects.js';
import { ENEMY_DEFINITIONS } from '../../src/content/enemies/index.js';
import { EnemyRegistry } from '../../src/sim/enemy/registry.js';
import type { EnemyDefinition } from '../../src/sim/enemy/definition.js';

/** A named texture per effect sprite, so an assertion can say which one was chosen. */
function vfx(): Record<string, Texture> {
  return Object.fromEntries(
    ['foam', 'splash', 'spark', 'dust', 'spore', 'shard', 'ember', 'glint', 'flash', 'ring'].map(
      (name) => [name, new Texture()],
    ),
  );
}

describe('buildParticleArt', () => {
  it('gives every particle kind a sprite of its own', () => {
    const art = buildParticleArt(vfx(), Texture.EMPTY);
    for (const kind of PARTICLE_KIND_IDS) {
      expect(art.byKind[kind]).toBeDefined();
    }
    // And no two kinds share one — a spore burst that drew as beer foam would
    // undo the whole point of a per-creature death effect (#153).
    const drawn = PARTICLE_KIND_IDS.map((kind) => art.byKind[kind]);
    expect(new Set(drawn).size).toBe(drawn.length);
  });

  it('falls back for a kind whose sprite is not loaded, rather than drawing nothing', () => {
    const art = buildParticleArt({}, Texture.EMPTY);
    for (const kind of PARTICLE_KIND_IDS) {
      expect(art.byKind[kind] ?? art.fallback).toBe(Texture.EMPTY);
    }
  });

  it('names a telegraph ring that the effect set actually authors', () => {
    expect(vfx()[TELEGRAPH_RING_SPRITE]).toBeDefined();
  });
});

describe('the accessibility toggles suppress the right effects', () => {
  function viewWith(reducedMotion: boolean, reduceFlashes: boolean): ParticleView {
    const view = new ParticleView(new ParticleStore(16), buildParticleArt(vfx(), Texture.EMPTY));
    view.setAccessibility({ reducedMotion, reduceFlashes });
    return view;
  }

  /** The kinds that carry information nothing else does — never removable. */
  const informational: ParticleKindId[] = [
    ParticleKind.Foam,
    ParticleKind.Splash,
    ParticleKind.Spark,
    ParticleKind.Spore,
    ParticleKind.Shard,
  ];

  it('draws everything with both toggles off', () => {
    const view = viewWith(false, false);
    for (const kind of PARTICLE_KIND_IDS) {
      expect(view.draws(kind)).toBe(true);
    }
  });

  it('never removes an effect that is the only copy of something', () => {
    // The acceptance criterion this pins: the game stays readable with every
    // toggle on. A hit still confirms, a death still throws what that creature
    // throws — only the decoration goes.
    const view = viewWith(true, true);
    for (const kind of informational) {
      expect(view.draws(kind)).toBe(true);
    }
  });

  it('reduced motion removes the decorative kinds and nothing else', () => {
    const view = viewWith(true, false);
    expect(view.draws(ParticleKind.Dust)).toBe(false);
    expect(view.draws(ParticleKind.Glint)).toBe(false);
    expect(view.draws(ParticleKind.Ember)).toBe(false);
    // The muzzle flash is the *other* toggle's business: it is a flashing
    // hazard, not a motion one.
    expect(view.draws(ParticleKind.Flash)).toBe(true);
  });

  it('reduce flashing removes the muzzle flash and nothing else', () => {
    const view = viewWith(false, true);
    expect(view.draws(ParticleKind.Flash)).toBe(false);
    expect(view.draws(ParticleKind.Dust)).toBe(true);
    expect(view.draws(ParticleKind.Glint)).toBe(true);
  });
});

describe('authored death effects', () => {
  const registry = new EnemyRegistry(ENEMY_DEFINITIONS);

  it('compiles every authored name to a real particle kind', () => {
    for (const enemy of registry.all) {
      expect(PARTICLE_KIND_IDS).toContain(enemy.deathEffect);
    }
  });

  it('refuses a name nobody has an effect for, rather than quietly throwing beer', () => {
    const [first] = ENEMY_DEFINITIONS;
    if (first === undefined) {
      throw new Error('the roster is empty, so there is nothing to base a bad definition on');
    }
    const typo: EnemyDefinition = { ...first, id: 'typo-thrower', deathEffect: 'sparkls' };
    expect(() => new EnemyRegistry([typo])).toThrow(/deathEffect/);
  });

  it('defaults to beer for a creature that names none', () => {
    const plain = registry.all.find((enemy) => enemy.id === 'bierratte');
    expect(plain?.deathEffect).toBe(ParticleKind.Splash);
  });

  it('gives the things that are not full of beer something else', () => {
    // The issue's own example, and the reason this is authored per creature
    // rather than switched on globally: "Beer splashes; a Schimmelfleck does
    // not."
    expect(registry.all.find((enemy) => enemy.id === 'schimmelfleck')?.deathEffect).toBe(
      ParticleKind.Spore,
    );
    expect(registry.all.find((enemy) => enemy.id === 'rollfass')?.deathEffect).toBe(
      ParticleKind.Shard,
    );
  });

  it('offers every name the effect table knows about, and no others', () => {
    const authored = new Set(
      ENEMY_DEFINITIONS.map((definition) => definition.deathEffect).filter(
        (name): name is string => name !== undefined,
      ),
    );
    for (const name of authored) {
      expect(Object.keys(DEATH_EFFECT_KINDS)).toContain(name);
    }
  });
});
