import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'assets/atlases/**'],
  },
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    extends: [tseslint.configs.strictTypeChecked, tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      // Unused bindings are allowed only when explicitly marked with a leading underscore.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Config and tooling files are plain ESM run by Node, outside the app tsconfig.
    files: ['**/*.{js,mjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ['**/*.{ts,js,mjs}'],
    rules: {
      eqeqeq: ['error', 'always'],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['*.config.ts', 'tools/**/*.{ts,js,mjs}'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    // The simulation must be a pure function of its seed and its input log.
    // Any of these would make a run unreproducible, which takes seeded runs,
    // the daily run, replays and reproducible bug reports down with it.
    files: ['src/sim/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message:
            'Math.random is banned in src/sim/. Draw from a seeded Rng stream instead — see src/sim/rng/streams.ts.',
        },
        {
          object: 'Date',
          property: 'now',
          message:
            'src/sim/ must not read the wall clock. Simulation time is the integer tick counter — see src/sim/time.ts.',
        },
        {
          object: 'performance',
          property: 'now',
          message:
            'src/sim/ must not read the wall clock. Simulation time is the integer tick counter — see src/sim/time.ts.',
        },
      ],
      'no-restricted-globals': [
        'error',
        {
          name: 'Date',
          message:
            'src/sim/ must not read the wall clock. Simulation time is the integer tick counter.',
        },
      ],
    },
  },
  prettier,
);
