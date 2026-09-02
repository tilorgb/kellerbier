import { describe, expect, it } from 'vitest';
import { ENEMY_DEFINITIONS } from '../../src/content/enemies/index.js';
import { blaskapellist } from '../../src/content/enemies/blaskapellist.js';
import {
  BARK_DEFINITIONS,
  ENEMY_SFX_CATEGORY,
  INSTRUMENT_DEFINITIONS,
  PROMILLE_AUDIO_TIERS,
  SFX_DEFINITIONS,
  TRACK_DEFINITIONS,
  floor2DorfUndAcker,
} from '../../src/content/audio/index.js';
import { noteToFrequency } from '../../src/app/audio/synth.js';
import { PromilleTier } from '../../src/sim/game/promille.js';

const instrumentIds = new Set(INSTRUMENT_DEFINITIONS.map((instrument) => instrument.id));
const sfxIds = new Set(SFX_DEFINITIONS.map((sfx) => sfx.id));

function notesOf(note: string | readonly string[]): readonly string[] {
  return typeof note === 'string' ? [note] : note;
}

/**
 * #51's own acceptance bar, checked at build time rather than in play:
 * "No impact anywhere in the game is silent." An enemy id with no entry in
 * `ENEMY_SFX_CATEGORY`, or a category with no `hit-*`/`death-*` pair, would
 * still play *something* today (`sfx-player.ts`'s default-category
 * fallback) — this is the CI-side half of `docs/DECISIONS.md` #19's "a
 * content gap degrades gracefully at runtime, and still fails loudly in
 * CI", applied to sound the same way `room-floor-eligibility.test.ts`
 * applies it to rooms.
 */
describe('the enemy SFX map', () => {
  it('sorts every enemy in the roster into a timbre category', () => {
    for (const enemy of ENEMY_DEFINITIONS) {
      expect(
        ENEMY_SFX_CATEGORY[enemy.id],
        `"${enemy.id}" has no ENEMY_SFX_CATEGORY entry`,
      ).toBeDefined();
    }
  });

  it('names no enemy that is not actually in the roster', () => {
    const rosterIds = new Set(ENEMY_DEFINITIONS.map((enemy) => enemy.id));
    for (const id of Object.keys(ENEMY_SFX_CATEGORY)) {
      expect(rosterIds.has(id), `ENEMY_SFX_CATEGORY names "${id}", which is not an enemy id`).toBe(
        true,
      );
    }
  });

  it('gives every category used a hit and a death sound', () => {
    const categories = new Set(Object.values(ENEMY_SFX_CATEGORY));
    for (const category of categories) {
      expect(sfxIds.has(`hit-${category}`), `no "hit-${category}" SFX`).toBe(true);
      expect(sfxIds.has(`death-${category}`), `no "death-${category}" SFX`).toBe(true);
    }
  });
});

describe('the SFX catalog', () => {
  it('has no duplicate ids', () => {
    expect(sfxIds.size).toBe(SFX_DEFINITIONS.length);
  });

  it('covers every impact/player/wall cue `sfx-player.ts` plays', () => {
    for (const id of [
      'player-hit',
      'player-death',
      'wall-hit',
      'pickup-generic',
      'pickup-pedestal',
      'door-open',
      'door-locked',
      'secret-reveal',
      'floor-card-whoosh',
      'footstep',
      'ui-open',
      'ui-close',
      'ui-confirm',
      'ui-cancel',
      'ui-unlock-fanfare',
    ]) {
      expect(sfxIds.has(id), `missing SFX id "${id}"`).toBe(true);
    }
  });

  it('references only real instruments in its tone layer', () => {
    for (const sfx of SFX_DEFINITIONS) {
      const tone = sfx.tone;
      if (tone !== undefined) {
        expect(
          instrumentIds.has(tone.instrument),
          `"${sfx.id}" references unknown instrument "${tone.instrument}"`,
        ).toBe(true);
        expect(() => noteToFrequency(tone.note)).not.toThrow();
      }
    }
  });
});

describe('the track catalog', () => {
  it('has no duplicate track or instrument ids', () => {
    const trackIds = new Set(TRACK_DEFINITIONS.map((track) => track.id));
    expect(trackIds.size).toBe(TRACK_DEFINITIONS.length);
    expect(instrumentIds.size).toBe(INSTRUMENT_DEFINITIONS.length);
  });

  it('keeps every note event inside its own loop and its notes well-formed', () => {
    for (const track of TRACK_DEFINITIONS) {
      for (const event of track.events) {
        expect(
          event.beat + event.durationBeats,
          `"${track.id}": an event at beat ${String(event.beat)} runs past loopBeats ${String(track.loopBeats)}`,
        ).toBeLessThanOrEqual(track.loopBeats);
        expect(
          instrumentIds.has(event.instrument),
          `"${track.id}" references unknown instrument "${event.instrument}"`,
        ).toBe(true);
        for (const note of notesOf(event.note)) {
          expect(() => noteToFrequency(note), `"${track.id}": bad note "${note}"`).not.toThrow();
        }
      }
    }
  });

  it("locks Floor 2 to the Blaskapellist's own beat (#51 acceptance criteria)", () => {
    // `blaskapellist.ts`'s `fireOnBeat` fires every `everyTicks` off `sim.tick`
    // directly — the floor track has to share that exact grid for the
    // Blaskapellist's rhythm to read against it at all.
    const fireOnBeat = blaskapellist.states[0]?.behaviours.find(
      (behaviour) => behaviour.behaviour === 'fireOnBeat',
    );
    expect(fireOnBeat).toBeDefined();
    expect(floor2DorfUndAcker.ticksPerBeat).toBe((fireOnBeat as { everyTicks: number }).everyTicks);
  });

  it('gives Floor 1 and Floor 2 the same melody in different arrangements', () => {
    const floor1Notes = TRACK_DEFINITIONS.find(
      (track) => track.id === 'floor-1-der-keller',
    )?.events.map((event) => `${String(event.beat)}:${String(event.note)}`);
    const floor2AccordionNotes = TRACK_DEFINITIONS.find(
      (track) => track.id === 'floor-2-dorf-acker',
    )
      ?.events.filter((event) => event.instrument === 'accordion')
      .map((event) => `${String(event.beat)}:${String(event.note)}`);
    expect(floor1Notes).toBeDefined();
    expect(floor2AccordionNotes).toEqual(floor1Notes);
    // ...but Floor 2 is not just Floor 1 replayed — it has more going on
    // underneath, the "full band" half of #51's "same band, different room".
    const floor2 = TRACK_DEFINITIONS.find((track) => track.id === 'floor-2-dorf-acker');
    expect(floor2).toBeDefined();
    expect(floor2?.events.length).toBeGreaterThan(floor1Notes?.length ?? 0);
    const floor2Instruments = new Set(floor2?.events.map((event) => event.instrument));
    expect(floor2Instruments.size).toBeGreaterThan(1);
  });
});

describe('voice barks', () => {
  it("covers docs/CONTENT_BIBLE.md §6's three named barks", () => {
    const texts = new Set(BARK_DEFINITIONS.map((bark) => bark.text));
    for (const text of ['Sauber!', 'Geh weida!', 'Passt scho.']) {
      expect(texts.has(text), `missing bark line "${text}"`).toBe(true);
    }
  });

  it('references only real instruments and well-formed notes', () => {
    for (const bark of BARK_DEFINITIONS) {
      expect(instrumentIds.has(bark.motif.instrument)).toBe(true);
      for (const note of bark.motif.notes) {
        expect(() => noteToFrequency(note)).not.toThrow();
      }
    }
  });
});

describe('Promille audio content', () => {
  it('has exactly one entry per sim.promilleTier value, in order', () => {
    const tierValues = Object.values(PromilleTier);
    expect(PROMILLE_AUDIO_TIERS.length).toBe(tierValues.length);
    PROMILLE_AUDIO_TIERS.forEach((content, index) => {
      expect(content.tier).toBe(index);
    });
  });

  it('keeps every tempoScale positive and detune/muffle non-negative', () => {
    for (const content of PROMILLE_AUDIO_TIERS) {
      expect(content.tempoScale).toBeGreaterThan(0);
      expect(content.detuneCents).toBeGreaterThanOrEqual(0);
      expect(content.muffle).toBeGreaterThanOrEqual(0);
      expect(content.muffle).toBeLessThanOrEqual(1);
    }
  });

  it('sobers up to no drift at all — Nüchtern is the identity tier', () => {
    const sober = PROMILLE_AUDIO_TIERS[PromilleTier.Nuchtern];
    expect(sober?.tempoScale).toBe(1);
    expect(sober?.detuneCents).toBe(0);
  });
});
