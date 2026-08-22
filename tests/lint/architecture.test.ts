import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { beforeAll, describe, expect, it } from 'vitest';
import { architectureRules } from '../../tools/eslint/architecture.js';

/**
 * The architecture rules, proved to fire.
 *
 * A lint rule nobody has watched fail is a lint rule that might be silently
 * misconfigured, and this particular set is the mechanical enforcement of the
 * one structural decision the whole project rests on. Each fixture is a real
 * violation; each assertion says which rule catches it, and that the message
 * explains *why* rather than only what.
 *
 * The rule definitions are imported from the same module `eslint.config.js`
 * uses, so this tests what ships rather than a copy of it.
 */

const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url));

/**
 * Lints a fixture as though it lived at `pretendPath`.
 *
 * The path is what decides which rules apply, and the fixtures cannot actually
 * live under `src/sim/` — they are deliberately broken, and everything there is
 * compiled by the build.
 */
async function lintAs(fixture: string, pretendPath: string): Promise<ESLint.LintResult> {
  const code = await readFile(`${FIXTURES}${fixture}`, 'utf8');
  const eslint = new ESLint({
    overrideConfigFile: true,
    // The fixtures are ignored by the project config precisely so that
    // `npm run lint` does not fail on files that exist in order to fail.
    ignore: false,
    overrideConfig: [{ languageOptions: { parser: tseslint.parser } }, ...architectureRules],
  });
  const [result] = await eslint.lintText(code, { filePath: pretendPath });
  if (result === undefined) {
    throw new Error(`no lint result for ${fixture}`);
  }
  return result;
}

function ruleIds(result: ESLint.LintResult): string[] {
  return result.messages.map((message) => message.ruleId ?? '');
}

function messagesFor(result: ESLint.LintResult, ruleId: string): string[] {
  return result.messages
    .filter((message) => message.ruleId === ruleId)
    .map((message) => message.message);
}

const SIM_FILE = `${process.cwd()}/src/sim/systems/fixture.ts`;

describe('src/sim may not reach the layers above it', () => {
  let pixi: ESLint.LintResult;
  let render: ESLint.LintResult;

  beforeAll(async () => {
    pixi = await lintAs('imports-pixi.ts', SIM_FILE);
    render = await lintAs('imports-render.ts', SIM_FILE);
  });

  it('fails on importing pixi.js', () => {
    expect(ruleIds(pixi)).toContain('no-restricted-imports');
  });

  it('fails on importing the render layer', () => {
    expect(ruleIds(render)).toContain('no-restricted-imports');
  });

  it('explains why, and points at the document that argues for it', () => {
    const [message = ''] = messagesFor(pixi, 'no-restricted-imports');
    expect(message).toMatch(/headless tests, determinism, replays/);
    expect(message).toMatch(/docs\/TECH_STACK\.md/);
  });
});

describe('src/sim may not be unreproducible', () => {
  it('fails on Math.random, and says what to use instead', async () => {
    const result = await lintAs('uses-math-random.ts', SIM_FILE);
    expect(ruleIds(result)).toContain('no-restricted-properties');
    const [message = ''] = messagesFor(result, 'no-restricted-properties');
    expect(message).toMatch(/seeded Rng stream/);
    expect(message).toMatch(/src\/sim\/rng\/streams\.ts/);
  });

  it('fails on reading a wall clock', async () => {
    const result = await lintAs('uses-wall-clock.ts', SIM_FILE);
    // Both `Date.now` and `performance.now` are caught.
    expect(messagesFor(result, 'no-restricted-properties')).toHaveLength(2);
    for (const message of messagesFor(result, 'no-restricted-properties')) {
      expect(message).toMatch(/integer tick counter/);
    }
  });

  it('fails on touching the DOM', async () => {
    const result = await lintAs('touches-dom.ts', SIM_FILE);
    expect(ruleIds(result)).toContain('no-restricted-globals');
    const [message = ''] = messagesFor(result, 'no-restricted-globals');
    expect(message).toMatch(/no window in a headless test/);
  });
});

describe('a @hot file may not allocate', () => {
  it('catches every shape of allocation in the frame loop', async () => {
    const result = await lintAs('hot-allocates.ts', SIM_FILE);
    const found = messagesFor(result, 'kellerbier/no-hot-allocation');

    expect(found.some((message) => message.includes('an object literal'))).toBe(true);
    expect(found.some((message) => message.includes('an array literal'))).toBe(true);
    expect(found.some((message) => message.includes('a closure created per call'))).toBe(true);
    expect(found.some((message) => message.includes('a call to .map()'))).toBe(true);
    expect(found.some((message) => message.includes('a spread'))).toBe(true);
  });

  it('explains why rather than only what', async () => {
    const result = await lintAs('hot-allocates.ts', SIM_FILE);
    const [message = ''] = messagesFor(result, 'kellerbier/no-hot-allocation');
    expect(message).toMatch(/frame loop must not produce garbage/);
    expect(message).toMatch(/docs\/TECH_STACK\.md/);
  });

  it('allows preallocating in a constructor, which is the whole design', async () => {
    const result = await lintAs('hot-preallocates.ts', SIM_FILE);
    expect(messagesFor(result, 'kellerbier/no-hot-allocation')).toEqual([]);
  });

  it('leaves a file without the marker alone', async () => {
    const result = await lintAs('hot-allocates.ts', `${process.cwd()}/src/render/fixture.ts`);
    expect(ruleIds(result)).not.toContain('kellerbier/no-hot-allocation');
  });
});

describe('src/content is data', () => {
  it('fails on importing engine code', async () => {
    const result = await lintAs(
      'content-imports-code.ts',
      `${process.cwd()}/src/content/enemies/fixture.ts`,
    );
    expect(ruleIds(result)).toContain('no-restricted-imports');
    const [message = ''] = messagesFor(result, 'no-restricted-imports');
    expect(message).toMatch(/adding an enemy has to stay a data change/);
  });
});
