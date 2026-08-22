import { kellerbierPlugin } from './no-hot-allocation.js';

/**
 * The layering, enforced mechanically.
 *
 * `sim/` never importing `render/` is the single most important structural
 * decision in the project: it is what buys headless testing, determinism,
 * replays, shareable seeds and the WASM escape hatch. Every one of those
 * disappears the moment one system reaches into a sprite, and that erosion is
 * invisible in code review — the diff looks like a small convenience.
 *
 * Rules catch it. Discipline does not, because discipline is exactly what is in
 * short supply on the afternoon somebody is trying to ship a fix.
 *
 * Exported as a flat-config fragment so the rule definitions the project ships
 * are the same ones its tests assert on.
 */

const TECH_STACK = 'docs/TECH_STACK.md §4';

const SIM_IMPORT_MESSAGE =
  `src/sim/ must not import from the layers above it. The simulation is a pure ` +
  `function of its seed and its input log; reaching into the renderer, the app ` +
  `shell or Pixi takes headless tests, determinism, replays and the WASM seam ` +
  `with it. Report what happened through the event queue instead. See ${TECH_STACK}.`;

const DOM_MESSAGE =
  `src/sim/ must not touch the DOM. There is no window in a headless test, in a ` +
  `replay, or on the other side of the WASM boundary. See ${TECH_STACK}.`;

export const architectureRules = [
  {
    name: 'kellerbier/sim-layering',
    files: ['src/sim/**/*.ts'],
    plugins: { kellerbier: kellerbierPlugin },
    rules: {
      'kellerbier/no-hot-allocation': 'error',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['**/render/*', '**/render', '@render/*'], message: SIM_IMPORT_MESSAGE },
            { group: ['**/app/*', '**/app', '@app/*'], message: SIM_IMPORT_MESSAGE },
            { group: ['pixi.js', 'pixi.js/*'], message: SIM_IMPORT_MESSAGE },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        {
          name: 'window',
          message: DOM_MESSAGE,
        },
        { name: 'document', message: DOM_MESSAGE },
        { name: 'navigator', message: DOM_MESSAGE },
        { name: 'localStorage', message: DOM_MESSAGE },
        { name: 'requestAnimationFrame', message: DOM_MESSAGE },
        {
          name: 'Date',
          message:
            'src/sim/ must not read the wall clock. Simulation time is the integer tick ' +
            `counter — see src/sim/time.ts and ${TECH_STACK}.`,
        },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message:
            'Math.random is banned in src/sim/. Draw from a seeded Rng stream instead — see ' +
            'src/sim/rng/streams.ts. Unseeded randomness takes seeded runs, the daily run, ' +
            'replays and reproducible bug reports with it.',
        },
        {
          object: 'Date',
          property: 'now',
          message:
            'src/sim/ must not read the wall clock. Simulation time is the integer tick ' +
            'counter — see src/sim/time.ts.',
        },
        {
          object: 'performance',
          property: 'now',
          message:
            'src/sim/ must not read the wall clock. Simulation time is the integer tick ' +
            'counter — see src/sim/time.ts.',
        },
      ],
    },
  },
  {
    name: 'kellerbier/content-is-data',
    files: ['src/content/**/*.ts'],
    rules: {
      // Content is data. A content file that can import code is a content file
      // that eventually contains code, and then adding an enemy stops being a
      // data change — which is the assumption the whole M6 schedule rests on.
      // Type imports are allowed, so content is checked against the shapes the
      // engine expects; the project-wide `consistent-type-imports` rule is what
      // keeps those imports type-only.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/sim/**', '**/render/**', '**/app/**', 'pixi.js'],
              allowTypeImports: true,
              message:
                'src/content/ is data. It may import types, so that content is checked ' +
                'against the shapes the engine expects, and nothing else — adding an enemy ' +
                `has to stay a data change. See ${TECH_STACK}.`,
            },
          ],
        },
      ],
    },
  },
];
