import type { EnemyDefinition } from '../../sim/enemy/definition.js';

/**
 * Blaskapellist — tuba player (`docs/CONTENT_BIBLE.md`'s Floor 2 roster).
 *
 * Fires expanding sound rings on the beat of the floor music. There is no
 * real music track yet (`app/audio/ambience.ts`'s silent stub, M8's job),
 * so "on the beat" cannot mean synchronised to audio playback today — but
 * #37's own notes are explicit that it must not mean that anyway: "the
 * simulation needs a music-clock reference that does not violate
 * determinism — drive it from the tick counter, not from audio playback
 * position." `fireOnBeat` is exactly that: it fires off `sim.tick`, the
 * simulation's one deterministic clock, rather than off ticks-since-this-
 * state-began the way every other firing primitive does. Two Blaskapellisten
 * in the same room ring together right now, for that reason, and whatever
 * M8's real track turns out to be only has to share this same tick rate to
 * land on it exactly.
 *
 * 30 ticks per beat is 0.5s at the simulation's fixed 60 ticks/second
 * (`sim/time.ts`) — 120 BPM, a plain marching-band tempo. Written as a
 * literal rather than imported: content is data and imports types only
 * (`tools/eslint/architecture.js`).
 */
export const blaskapellist: EnemyDefinition = {
  id: 'blaskapellist',
  name: 'Blaskapellist',
  size: 'normal',
  health: 3,
  contactDamage: 1,
  initial: 'oompah',
  states: [
    {
      name: 'oompah',
      behaviours: [
        { behaviour: 'pause' },
        {
          behaviour: 'fireOnBeat',
          shots: 14,
          everyTicks: 30,
          speed: 0.9,
          damage: 1,
          lifetimeTicks: 50,
          // A ring of sound, drawn as one (#152). The one shot on the floor
          // that arrives on the beat is also the one that should not look like
          // everything else that arrives.
          art: 'blas-note',
        },
      ],
    },
  ],
};
