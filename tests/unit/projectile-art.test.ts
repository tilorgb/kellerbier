import { Texture } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import {
  PLAYER_TAG_SPRITE_ORDER,
  spriteFor,
  type ProjectileArt,
} from '../../src/render/projectiles.js';
import { ProjectileTeam } from '../../src/sim/projectile/store.js';
import { ProjectileTag } from '../../src/sim/projectile/tags.js';

/**
 * One texture per role, all distinct objects so an assertion can say *which*
 * sprite was chosen rather than only that one was.
 */
function art(): {
  readonly art: ProjectileArt;
  readonly named: Record<string, Texture>;
} {
  const player = new Texture();
  const burning = new Texture();
  const freezing = new Texture();
  const piercing = new Texture();
  const spore = new Texture();
  const cellarDefault = new Texture();
  const ruralDefault = new Texture();
  const fallback = new Texture();
  return {
    art: {
      player,
      playerTags: [
        { tag: ProjectileTag.Burning, texture: burning },
        { tag: ProjectileTag.Freezing, texture: freezing },
        { tag: ProjectileTag.Piercing, texture: piercing },
      ],
      enemyByName: { spore, 'tap-drip': cellarDefault, boeller: ruralDefault },
      enemyByFloor: { 1: cellarDefault, 2: ruralDefault },
      fallback,
    },
    named: { player, burning, freezing, piercing, spore, cellarDefault, ruralDefault, fallback },
  };
}

describe('spriteFor', () => {
  it('draws an untagged player shot as the base beer', () => {
    const { art: set, named } = art();
    expect(spriteFor(set, ProjectileTeam.Player, 0, null, 1)).toBe(named.player);
  });

  it('draws a tagged player shot as that tag', () => {
    const { art: set, named } = art();
    expect(spriteFor(set, ProjectileTeam.Player, ProjectileTag.Burning, null, 1)).toBe(
      named.burning,
    );
  });

  it('resolves a shot carrying several tags by fixed priority, not by bit order', () => {
    const { art: set, named } = art();
    // A burning shot that also pierces is, to the person dodging it, on fire —
    // and `Piercing` is the *lower* bit, so a naive mask walk would pick it.
    const both = ProjectileTag.Burning | ProjectileTag.Piercing;
    expect(spriteFor(set, ProjectileTeam.Player, both, null, 1)).toBe(named.burning);
    expect(ProjectileTag.Piercing).toBeLessThan(ProjectileTag.Burning);
  });

  it('ignores a tag with no sprite of its own and falls through to the next', () => {
    const { art: set, named } = art();
    const homingAndFreezing = ProjectileTag.Homing | ProjectileTag.Freezing;
    expect(spriteFor(set, ProjectileTeam.Player, homingAndFreezing, null, 1)).toBe(named.freezing);
    expect(spriteFor(set, ProjectileTeam.Player, ProjectileTag.Homing, null, 1)).toBe(named.player);
  });

  it('draws an enemy shot as the art its firing behaviour named', () => {
    const { art: set, named } = art();
    expect(spriteFor(set, ProjectileTeam.Enemy, 0, 'spore', 1)).toBe(named.spore);
  });

  it('draws an enemy shot that named nothing as its floor default', () => {
    const { art: set, named } = art();
    expect(spriteFor(set, ProjectileTeam.Enemy, 0, null, 1)).toBe(named.cellarDefault);
    expect(spriteFor(set, ProjectileTeam.Enemy, 0, null, 2)).toBe(named.ruralDefault);
  });

  it('ignores the player tag set entirely for an enemy shot', () => {
    const { art: set, named } = art();
    // An enemy shot can carry tags too (an item that adds `burning` to
    // everything, a future enemy that fires one) — it must not start drawing
    // as Alois's beer because of it.
    expect(spriteFor(set, ProjectileTeam.Enemy, ProjectileTag.Burning, null, 2)).toBe(
      named.ruralDefault,
    );
  });

  it('falls back for a floor with no authored projectile art', () => {
    const { art: set, named } = art();
    // Floors 3-7 (#39-#43, parked in M10). Unreachable in the dev build today
    // — `HIGHEST_PLAYABLE_FLOOR` is 2 — which is what keeps the generated disc
    // out of a player's view rather than merely rare.
    expect(spriteFor(set, ProjectileTeam.Enemy, 0, null, 5)).toBe(named.fallback);
  });

  it('falls back for an art name with no loaded sprite behind it', () => {
    const { art: set, named } = art();
    expect(spriteFor(set, ProjectileTeam.Enemy, 0, 'never-drawn', 2)).toBe(named.ruralDefault);
  });
});

describe('PLAYER_TAG_SPRITE_ORDER', () => {
  it('puts the status effects ahead of the flight-path tags', () => {
    const order = PLAYER_TAG_SPRITE_ORDER.map((entry) => entry.tag);
    const status = [ProjectileTag.Burning, ProjectileTag.Freezing, ProjectileTag.Poison];
    const lastStatus = Math.max(...status.map((tag) => order.indexOf(tag)));
    expect(order.indexOf(ProjectileTag.Piercing)).toBeGreaterThan(lastStatus);
    expect(order.indexOf(ProjectileTag.Spectral)).toBeGreaterThan(lastStatus);
  });

  it('names each sprite once', () => {
    const sprites = PLAYER_TAG_SPRITE_ORDER.map((entry) => entry.sprite);
    expect(new Set(sprites).size).toBe(sprites.length);
  });
});
