import { describe, expect, it } from 'vitest';
import {
  ENEMY_DEFINITIONS,
  derStier,
  grosseKellerassel,
  kellerassel,
} from '../../src/content/enemies/index.js';
import type { EnemyDefinition } from '../../src/sim/enemy/definition.js';
import { EnemyRegistry } from '../../src/sim/enemy/registry.js';

/**
 * The shipped roster, checked at build time rather than at play time.
 *
 * A transition pointing at a state that does not exist produces an enemy that
 * stands still in one room out of forty, which is the kind of bug that is found
 * by a player and not by the person who wrote it. The registry validates on
 * construction; this is what makes that construction happen in CI.
 */
describe('the enemy roster', () => {
  it('compiles', () => {
    expect(() => new EnemyRegistry(ENEMY_DEFINITIONS)).not.toThrow();
  });

  it('has a definition for every enemy, reachable by id', () => {
    const registry = new EnemyRegistry(ENEMY_DEFINITIONS);
    expect(registry.count).toBe(ENEMY_DEFINITIONS.length);
    for (const definition of ENEMY_DEFINITIONS) {
      expect(registry.get(definition.id).id).toBe(definition.id);
      // The id is what room templates, loot tables and saves will name, so it
      // has to survive being typed by hand.
      expect(definition.id).toBe(definition.id.toLowerCase().trim());
      expect(definition.id).not.toContain(' ');
      // The name is what a player reads. German, per docs/CONTENT_BIBLE.md.
      expect(definition.name.length).toBeGreaterThan(0);
    }
  });

  it('leaves no state stranded', () => {
    for (const definition of ENEMY_DEFINITIONS) {
      const reached = new Set<string>([definition.initial]);
      for (const state of definition.states) {
        for (const transition of state.transitions ?? []) {
          reached.add(transition.to);
        }
      }
      for (const state of definition.states) {
        // A state nothing can enter is content somebody wrote and wired up
        // wrong, and it is invisible in play: the enemy simply never does it.
        expect(reached.has(state.name), `${definition.id} cannot reach "${state.name}"`).toBe(true);
      }
    }
  });

  it('teaches timing with the first enemy anybody fights', () => {
    const registry = new EnemyRegistry(ENEMY_DEFINITIONS);
    const compiled = registry.get('kellerassel');

    const crawl = compiled.states[compiled.initialState];
    expect(crawl?.name).toBe('crawl');
    // It walks at you, it curls when hit, and the curl cannot hurt you back.
    expect(crawl?.movement.behaviour).toBe('walkTowardPlayer');
    expect(crawl?.invulnerableTicks).toBe(0);

    const curl = compiled.states.find((state) => state.name === 'curl');
    expect(curl?.invulnerableTicks).toBeGreaterThan(0);
    expect(curl?.movement.behaviour).toBe('pause');
    // And it always opens again: a shell with no way out is a body that cannot
    // be killed by a player who has learnt the lesson it is teaching.
    expect(curl?.transitions.some((transition) => transition.to === compiled.initialState)).toBe(
      true,
    );
  });

  it('authors a second enemy out of the same primitives, with no engine work', () => {
    const registry = new EnemyRegistry(ENEMY_DEFINITIONS);
    const first = new Set<string>();
    for (const state of kellerassel.states) {
      for (const behaviour of state.behaviours) {
        first.add(behaviour.behaviour);
      }
    }

    // The Bierratte, the Schimmelfleck and the Zapfhahn are all data, and the
    // whole point of #14 is that adding them touched nothing but `src/content`.
    // Between them they use primitives the Kellerassel does not, which is the
    // library being a library rather than one enemy with parameters.
    const rest = new Set<string>();
    for (const definition of ENEMY_DEFINITIONS) {
      if (definition.id === kellerassel.id) {
        continue;
      }
      for (const state of definition.states) {
        for (const behaviour of state.behaviours) {
          rest.add(behaviour.behaviour);
        }
      }
    }
    expect([...rest].some((name) => !first.has(name))).toBe(true);
    expect(registry.count).toBeGreaterThan(1);
  });

  it('gives the boss a phase-two split declared on every phase-one state (#36)', () => {
    const registry = new EnemyRegistry(ENEMY_DEFINITIONS);
    const compiled = registry.get('grosse-kellerassel');
    const segment = registry.get('kellerassel-segment');

    // Every state reachable in phase one carries the same split, so wherever
    // the threshold is crossed the boss actually splits rather than quietly
    // vanishing in whichever state has no `splitOnDeath` of its own.
    for (const state of compiled.states) {
      expect(
        state.splits.some(
          (split) =>
            split.definition === registry.indexOf('kellerassel-segment') &&
            split.atHealthBelow === 0.5,
        ),
        `"${state.name}" is missing the phase-two split`,
      ).toBe(true);
    }
    // Phase two is the same curl loop the tutorial boss's own phase one is,
    // just quicker — the lesson does not change, only the count of bodies
    // asking for it at once.
    const segmentCurl = segment.states.find((state) => state.name === 'curl');
    expect(segmentCurl?.invulnerableTicks).toBeGreaterThan(0);
    expect(grosseKellerassel.states.some((state) => state.name === 'wind')).toBe(true);
  });

  it('splits Der Stier into the dismounted Maibaum-Dieb on death, on every state (#199)', () => {
    const registry = new EnemyRegistry(ENEMY_DEFINITIONS);
    const maibaumDiebIndex = registry.indexOf('der-stier-maibaum-dieb');

    for (const state of registry.get('der-stier').states) {
      const split = state.splits.find((s) => s.definition === maibaumDiebIndex);
      expect(split, `"${state.name}" is missing the phase-two split`).toBeDefined();
      // No health gate any more (#199): Der Stier fights his full pool and
      // the dieb spawns on the real killing blow, with his own fresh pool.
      expect(split?.atHealthBelow).toBe(0);
    }

    const maibaumDieb = registry.get('der-stier-maibaum-dieb');
    // #232: raised from 24/18 so each boss's authored cycle plays out
    // several times against a realistic mid-run fight — see
    // `tests/content/boss-pacing.test.ts` for the measured version of this.
    expect(derStier.health).toBe(80);
    expect(maibaumDieb.health).toBe(60);

    // Phase two forks once on whether the dieb reaches the arena maypole: an
    // armed swing branch (`meleeArc`), or Der Stier's own charge, disarmed.
    const swing = maibaumDieb.states.find((state) => state.name === 'swing');
    expect(swing?.meleeArc).not.toBeNull();
    expect(swing?.meleeArc?.knockback).toBeGreaterThan(0);
    expect(maibaumDieb.states.some((state) => state.name === 'dash')).toBe(true);

    const approach = maibaumDieb.states.find((state) => state.name === 'approach');
    expect(approach?.movement.behaviour).toBe('approachProp');
    expect(approach?.approachPropKind).toBeGreaterThanOrEqual(0);
    const grab = maibaumDieb.states.find((state) => state.name === 'grab');
    expect(grab?.grabProp).not.toBeNull();
  });
});

/**
 * What the registry refuses.
 *
 * Every one of these is a mistake somebody will make while writing the other
 * thirty-five enemies, and every one of them fails at load with the id of the
 * enemy in the message rather than silently producing a body that does nothing.
 */
describe('broken content', () => {
  const walker: EnemyDefinition = {
    id: 'walker',
    name: 'Walker',
    size: 'normal',
    health: 2,
    contactDamage: 1,
    initial: 'go',
    states: [{ name: 'go', behaviours: [{ behaviour: 'walkTowardPlayer', speed: 1 }] }],
  };

  function build(definition: EnemyDefinition, ...rest: readonly EnemyDefinition[]): () => void {
    return () => new EnemyRegistry([definition, ...rest]);
  }

  it('rejects two enemies sharing an id', () => {
    expect(build(walker, walker)).toThrow(/share the id/i);
  });

  it('rejects a state that says nothing about where the body goes', () => {
    expect(
      build({
        ...walker,
        states: [{ name: 'go', behaviours: [{ behaviour: 'telegraph', ticks: 4 }] }],
      }),
    ).toThrow(/no movement behaviour/i);
  });

  it('rejects a state that goes two ways at once', () => {
    expect(
      build({
        ...walker,
        states: [
          {
            name: 'go',
            behaviours: [
              { behaviour: 'walkTowardPlayer', speed: 1 },
              { behaviour: 'fleeFromPlayer', speed: 1 },
            ],
          },
        ],
      }),
    ).toThrow(/two movement behaviours/i);
  });

  it('rejects a transition to a state that does not exist', () => {
    expect(
      build({
        ...walker,
        states: [
          {
            name: 'go',
            behaviours: [{ behaviour: 'walkTowardPlayer', speed: 1 }],
            transitions: [{ to: 'panic', after: 10 }],
          },
        ],
      }),
    ).toThrow(/not one of its states/i);
  });

  it('rejects starting in a state that does not exist', () => {
    expect(build({ ...walker, initial: 'sprint' })).toThrow(/not one of its states/i);
  });

  it('rejects an enemy that splits into itself, which never stops', () => {
    expect(
      build({
        ...walker,
        states: [
          {
            name: 'go',
            behaviours: [
              { behaviour: 'pause' },
              { behaviour: 'splitOnDeath', into: 'walker', count: 2 },
            ],
          },
        ],
      }),
    ).toThrow(/splits into itself/i);
  });

  it('rejects splitting into something that is not an enemy', () => {
    expect(
      build({
        ...walker,
        states: [
          {
            name: 'go',
            behaviours: [
              { behaviour: 'pause' },
              { behaviour: 'splitOnDeath', into: 'nothing', count: 2 },
            ],
          },
        ],
      }),
    ).toThrow(/not an enemy id/i);
  });

  it('rejects a body that cannot be killed', () => {
    expect(build({ ...walker, health: 0 })).toThrow(/health above zero/i);
  });

  it('rejects an atHealthBelow that is not a fraction between 0 and 1', () => {
    expect(
      build(
        {
          ...walker,
          states: [
            {
              name: 'go',
              behaviours: [
                { behaviour: 'pause' },
                { behaviour: 'splitOnDeath', into: 'shard', count: 2, atHealthBelow: 1.5 },
              ],
            },
          ],
        },
        { ...walker, id: 'shard' },
      ),
    ).toThrow(/atHealthBelow/);
  });
});
