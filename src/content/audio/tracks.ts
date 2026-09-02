import type { NoteEvent, TrackDefinition } from '../../app/audio/types.js';

/**
 * The Blaskapelle's repertoire (#51).
 *
 * **A first pass, not a final mix.** Like `docs/CONTENT_BIBLE.md` puts it,
 * "the cellar is a lone accordion, the Wiesn is the full brass band at
 * maximum volume" — `floor1DerKeller` and `floor2DorfUndAcker` are the same
 * eight-beat theme, played first by one instrument and then by the full
 * ensemble, so the "same band, different room" constraint this issue
 * establishes is something you can actually hear rather than a claim.
 * Everything downstream (mixing, ducking, real crossfades) is #157's; this
 * is the composition #157's engine will play.
 *
 * `TICKS_PER_BEAT` mirrors `content/enemies/blaskapellist.ts`'s own literal
 * 30 (120 BPM at the simulation's fixed 60 ticks/second) — written out
 * again here rather than imported, for the same "content is a literal"
 * reason that file gives its copy. `floor2DorfUndAcker` is the one track
 * this actually matters for: the Blaskapellist fires a ring of sound "on the
 * beat" of `sim.tick`, and this is the track that beat has to read against
 * (#51's own acceptance criteria). The other tracks reuse the same grid for
 * consistency, except the two boss themes, which lean on a different tempo
 * to read as their own set piece.
 */
const TICKS_PER_BEAT = 30;

// --- Floor 1 & 2: the same eight-beat theme, two arrangements ------------

/** The shared melody line — literal beat/note pairs, not derived, so both
 * tracks below are visibly "the same tune" rather than two arrays that
 * happen to agree. */
const MAIN_THEME_MELODY: readonly (readonly [beat: number, note: string])[] = [
  [0, 'C4'],
  [1, 'E4'],
  [2, 'G4'],
  [3, 'E4'],
  [4, 'F4'],
  [5, 'A4'],
  [6, 'G4'],
  [7, 'E4'],
];

export const floor1DerKeller: TrackDefinition = {
  id: 'floor-1-der-keller',
  title: 'Der Keller',
  ticksPerBeat: TICKS_PER_BEAT,
  loopBeats: 8,
  // A lone accordion, nothing else — no bass, no stabs. The floor is empty
  // and so is the arrangement.
  events: MAIN_THEME_MELODY.map(([beat, note]): NoteEvent => ({
    beat,
    durationBeats: 0.9,
    instrument: 'accordion',
    note,
    velocity: 0.75,
  })),
};

export const floor2DorfUndAcker: TrackDefinition = {
  id: 'floor-2-dorf-acker',
  title: 'Dorf & Acker',
  ticksPerBeat: TICKS_PER_BEAT,
  loopBeats: 8,
  events: [
    // The same accordion line, unchanged...
    ...MAIN_THEME_MELODY.map(([beat, note]): NoteEvent => ({
      beat,
      durationBeats: 0.9,
      instrument: 'accordion',
      note,
      velocity: 0.7,
    })),
    // ...doubled an octave up by the clarinet — the full band's brightness.
    ...MAIN_THEME_MELODY.map(([beat, note]): NoteEvent => ({
      beat,
      durationBeats: 0.85,
      instrument: 'clarinet',
      note: bumpOctave(note, 1),
      velocity: 0.5,
    })),
    // Tuba "oom": root/fifth on every beat, C under bars one, F under bar two
    // — the chord the melody's second half (F A G E) sits over.
    { beat: 0, durationBeats: 0.8, instrument: 'tuba', note: 'C2', velocity: 0.9 },
    { beat: 1, durationBeats: 0.8, instrument: 'tuba', note: 'G2', velocity: 0.8 },
    { beat: 2, durationBeats: 0.8, instrument: 'tuba', note: 'C2', velocity: 0.9 },
    { beat: 3, durationBeats: 0.8, instrument: 'tuba', note: 'G2', velocity: 0.8 },
    { beat: 4, durationBeats: 0.8, instrument: 'tuba', note: 'F2', velocity: 0.9 },
    { beat: 5, durationBeats: 0.8, instrument: 'tuba', note: 'C3', velocity: 0.8 },
    { beat: 6, durationBeats: 0.8, instrument: 'tuba', note: 'F2', velocity: 0.9 },
    { beat: 7, durationBeats: 0.8, instrument: 'tuba', note: 'C3', velocity: 0.8 },
    // Brass "pah": a stab on every off-beat.
    {
      beat: 0.5,
      durationBeats: 0.2,
      instrument: 'brass-stab',
      note: ['C4', 'E4', 'G4'],
      velocity: 0.6,
    },
    {
      beat: 1.5,
      durationBeats: 0.2,
      instrument: 'brass-stab',
      note: ['C4', 'E4', 'G4'],
      velocity: 0.6,
    },
    {
      beat: 2.5,
      durationBeats: 0.2,
      instrument: 'brass-stab',
      note: ['C4', 'E4', 'G4'],
      velocity: 0.6,
    },
    {
      beat: 3.5,
      durationBeats: 0.2,
      instrument: 'brass-stab',
      note: ['C4', 'E4', 'G4'],
      velocity: 0.6,
    },
    {
      beat: 4.5,
      durationBeats: 0.2,
      instrument: 'brass-stab',
      note: ['F4', 'A4', 'C5'],
      velocity: 0.6,
    },
    {
      beat: 5.5,
      durationBeats: 0.2,
      instrument: 'brass-stab',
      note: ['F4', 'A4', 'C5'],
      velocity: 0.6,
    },
    {
      beat: 6.5,
      durationBeats: 0.2,
      instrument: 'brass-stab',
      note: ['F4', 'A4', 'C5'],
      velocity: 0.6,
    },
    {
      beat: 7.5,
      durationBeats: 0.2,
      instrument: 'brass-stab',
      note: ['F4', 'A4', 'C5'],
      velocity: 0.6,
    },
  ],
};

/** `'C4'` one octave up is `'C5'` — used to double the shared melody. */
function bumpOctave(note: string, by: number): string {
  const match = /^([A-G][#b]?)(-?\d+)$/.exec(note);
  if (match === null) {
    throw new Error(`not a note: "${note}"`);
  }
  const [, letter, octaveText] = match;
  if (letter === undefined || octaveText === undefined) {
    throw new Error(`not a note: "${note}"`);
  }
  return `${letter}${String(Number.parseInt(octaveText, 10) + by)}`;
}

// --- Boss themes -----------------------------------------------------------

export const bossKellerassel: TrackDefinition = {
  id: 'boss-kellerassel',
  title: 'Die Große Kellerassel',
  // Slower grid (90 BPM) — the tutorial boss, gentle on purpose.
  ticksPerBeat: 40,
  loopBeats: 8,
  events: [
    { beat: 0, durationBeats: 1.8, instrument: 'accordion', note: 'C4', velocity: 0.55 },
    { beat: 2, durationBeats: 1.8, instrument: 'accordion', note: 'D4', velocity: 0.55 },
    { beat: 4, durationBeats: 1.8, instrument: 'accordion', note: 'E4', velocity: 0.55 },
    { beat: 6, durationBeats: 1.8, instrument: 'accordion', note: 'D4', velocity: 0.55 },
    { beat: 0, durationBeats: 3.8, instrument: 'tuba', note: 'C2', velocity: 0.5 },
    { beat: 4, durationBeats: 3.8, instrument: 'tuba', note: 'G1', velocity: 0.5 },
  ],
};

export const bossDerStier: TrackDefinition = {
  id: 'boss-der-stier',
  title: 'Der Stier',
  // Faster grid (180 BPM) — the charge-and-stun loop this fight runs on.
  ticksPerBeat: 20,
  loopBeats: 8,
  events: [
    {
      beat: 0,
      durationBeats: 0.3,
      instrument: 'brass-stab',
      note: ['D4', 'F4', 'A4'],
      velocity: 0.8,
    },
    {
      beat: 1,
      durationBeats: 0.3,
      instrument: 'brass-stab',
      note: ['D4', 'F4', 'A4'],
      velocity: 0.6,
    },
    {
      beat: 1.5,
      durationBeats: 0.3,
      instrument: 'brass-stab',
      note: ['D4', 'F4', 'A4'],
      velocity: 0.7,
    },
    {
      beat: 2,
      durationBeats: 0.3,
      instrument: 'brass-stab',
      note: ['D4', 'F4', 'A4'],
      velocity: 0.8,
    },
    {
      beat: 3,
      durationBeats: 0.3,
      instrument: 'brass-stab',
      note: ['C4', 'E4', 'G4'],
      velocity: 0.6,
    },
    {
      beat: 4,
      durationBeats: 0.3,
      instrument: 'brass-stab',
      note: ['D4', 'F4', 'A4'],
      velocity: 0.8,
    },
    {
      beat: 5,
      durationBeats: 0.3,
      instrument: 'brass-stab',
      note: ['D4', 'F4', 'A4'],
      velocity: 0.6,
    },
    {
      beat: 5.5,
      durationBeats: 0.3,
      instrument: 'brass-stab',
      note: ['D4', 'F4', 'A4'],
      velocity: 0.7,
    },
    {
      beat: 6,
      durationBeats: 0.3,
      instrument: 'brass-stab',
      note: ['D4', 'F4', 'A4'],
      velocity: 0.8,
    },
    {
      beat: 7,
      durationBeats: 0.3,
      instrument: 'brass-stab',
      note: ['C4', 'E4', 'G4'],
      velocity: 0.6,
    },
    { beat: 0, durationBeats: 0.9, instrument: 'tuba', note: 'D2', velocity: 0.9 },
    { beat: 2, durationBeats: 0.9, instrument: 'tuba', note: 'D2', velocity: 0.9 },
    { beat: 4, durationBeats: 0.9, instrument: 'tuba', note: 'D2', velocity: 0.9 },
    { beat: 6, durationBeats: 0.9, instrument: 'tuba', note: 'C2', velocity: 0.9 },
  ],
};

// --- Menu, hub and the ending ----------------------------------------------

export const titleTheme: TrackDefinition = {
  id: 'title-theme',
  title: 'Title',
  ticksPerBeat: TICKS_PER_BEAT,
  loopBeats: 8,
  // A stately accordion/clarinet duet on the main theme, ahead of the run
  // that will turn it into the full band. `#158` (title screen) is this
  // track's call site once it exists.
  events: [
    ...MAIN_THEME_MELODY.map(([beat, note]): NoteEvent => ({
      beat,
      durationBeats: 0.95,
      instrument: 'accordion',
      note,
      velocity: 0.6,
    })),
    ...MAIN_THEME_MELODY.map(([beat, note]): NoteEvent => ({
      beat,
      durationBeats: 0.9,
      instrument: 'clarinet',
      note: bumpOctave(note, 1),
      velocity: 0.35,
    })),
  ],
};

export const hubTheme: TrackDefinition = {
  id: 'hub-theme',
  title: 'Stammtisch',
  // Slow and relaxed (72 BPM) — a tavern between runs, not a chase.
  ticksPerBeat: 50,
  loopBeats: 8,
  events: [
    { beat: 0, durationBeats: 1.8, instrument: 'accordion', note: 'C4', velocity: 0.5 },
    { beat: 2, durationBeats: 1.8, instrument: 'accordion', note: 'E4', velocity: 0.5 },
    { beat: 4, durationBeats: 1.8, instrument: 'accordion', note: 'D4', velocity: 0.5 },
    { beat: 6, durationBeats: 1.8, instrument: 'accordion', note: 'C4', velocity: 0.5 },
    { beat: 0, durationBeats: 3.8, instrument: 'clarinet', note: 'G4', velocity: 0.25 },
    { beat: 4, durationBeats: 3.8, instrument: 'clarinet', note: 'F4', velocity: 0.25 },
  ],
};

export const victoryTheme: TrackDefinition = {
  id: 'victory-theme',
  title: 'Victory',
  ticksPerBeat: TICKS_PER_BEAT,
  // Not meant to loop — a one-shot fanfare `victory-screen.ts`'s call site
  // (`app/main.ts`'s `advanceDeathSequence`, on `sim.playerWon`) plays once.
  // `loopBeats` still bounds every event, per the schema.
  loopBeats: 16,
  events: [
    {
      beat: 0,
      durationBeats: 0.9,
      instrument: 'brass-stab',
      note: ['C4', 'E4', 'G4'],
      velocity: 0.9,
    },
    {
      beat: 1,
      durationBeats: 0.9,
      instrument: 'brass-stab',
      note: ['C4', 'E4', 'G4'],
      velocity: 0.7,
    },
    {
      beat: 2,
      durationBeats: 1.9,
      instrument: 'brass-stab',
      note: ['C4', 'F4', 'A4'],
      velocity: 0.9,
    },
    {
      beat: 4,
      durationBeats: 0.9,
      instrument: 'brass-stab',
      note: ['D4', 'G4', 'B4'],
      velocity: 0.9,
    },
    {
      beat: 5,
      durationBeats: 0.9,
      instrument: 'brass-stab',
      note: ['D4', 'G4', 'B4'],
      velocity: 0.7,
    },
    {
      beat: 6,
      durationBeats: 3.9,
      instrument: 'brass-stab',
      note: ['C4', 'E4', 'G4', 'C5'],
      velocity: 1,
    },
    { beat: 0, durationBeats: 1.8, instrument: 'tuba', note: 'C2', velocity: 0.9 },
    { beat: 2, durationBeats: 1.8, instrument: 'tuba', note: 'F2', velocity: 0.9 },
    { beat: 4, durationBeats: 1.8, instrument: 'tuba', note: 'G2', velocity: 0.9 },
    { beat: 6, durationBeats: 3.8, instrument: 'tuba', note: 'C2', velocity: 0.9 },
    { beat: 6, durationBeats: 3.9, instrument: 'bell', note: 'C6', velocity: 0.6 },
    { beat: 7, durationBeats: 2.9, instrument: 'bell', note: 'E6', velocity: 0.5 },
  ],
};

export const TRACK_DEFINITIONS: readonly TrackDefinition[] = [
  floor1DerKeller,
  floor2DorfUndAcker,
  bossKellerassel,
  bossDerStier,
  titleTheme,
  hubTheme,
  victoryTheme,
];
