import { execFile } from 'node:child_process';
import { readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { Script } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * The release build, asserted on rather than assumed.
 *
 * Every property checked here has already been wrong once during this
 * feature's own development, and each failed in the same expensive way: not
 * at build time, not in a unit test, but in a browser at the very end of the
 * pipeline, on a file that had already been handed to somebody. A page that
 * would not parse (`String.replace`'s `$` patterns rewriting the minified
 * bundle), a classic script hoisted into `<head>` and running before
 * `<body>` existed, an asset left as a separate file that `file://` then
 * refused to load — none of them are visible in a diff, and all of them are
 * trivially visible in the emitted bytes.
 *
 * So this runs the real `vite build --config vite.release.config.ts`, into a
 * temporary directory, and reads what comes out. It is slower than the rest
 * of the suite (a few seconds), which is why `vite.config.ts` carries a
 * 180-second `testTimeout`.
 *
 * What it deliberately does *not* check is that the game plays, which needs a
 * browser and a GPU — `tools/perf/room-crossings.mjs` is the shape that would
 * take. This checks the properties that make the file openable at all, plus
 * the ones that decide whether what a player opens is the game or the
 * workshop it was built in.
 */

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const OUT_DIR = join(tmpdir(), `kellerbier-release-test-${String(process.pid)}`);

let page = '';
let readme = '';

/**
 * The CLI, spawned, rather than Vite's `build()` API called in-process.
 *
 * The two are not the same build, and the difference is exactly the kind this
 * file exists to catch: under Vitest the API build resolved
 * `import.meta.env.DEV` to `true` (Vitest sets `NODE_ENV=test`, and that is
 * one of the inputs Vite derives `isProduction` from), so the whole of
 * `src/debug/` came back into a bundle that `npm run build:release` does not
 * contain. A test that passes against a bundle nobody ships is worse than no
 * test. `node node_modules/vite/bin/vite.js` rather than the `.bin` shim
 * because the shim is a `.cmd` on Windows.
 */
beforeAll(async () => {
  await promisify(execFile)(
    process.execPath,
    [
      join(ROOT, 'node_modules/vite/bin/vite.js'),
      'build',
      '--config',
      'vite.release.config.ts',
      '--outDir',
      OUT_DIR,
      '--logLevel',
      'error',
    ],
    { cwd: ROOT, env: { ...process.env, NODE_ENV: 'production' }, maxBuffer: 32 * 1024 * 1024 },
  );
  page = await readFile(join(OUT_DIR, 'Kellerbier.html'), 'utf8');
  readme = await readFile(join(OUT_DIR, 'READ-ME.txt'), 'utf8');
}, 180_000);

afterAll(async () => {
  await rm(OUT_DIR, { recursive: true, force: true });
});

describe('the release build is one file that opens from a local disk', () => {
  it('emits the page and its read-me, and nothing else', async () => {
    const entries = await readdir(OUT_DIR);
    expect(entries.sort()).toEqual(['Kellerbier.html', 'READ-ME.txt']);
    expect(readme.length).toBeGreaterThan(0);
  });

  it('fetches nothing: every asset is inlined as a data URI', () => {
    // A `src`/`href` that is not a `data:` URI is a file that is not there —
    // and on `file://` would be a cross-origin read that taints any texture
    // made from it.
    const external = [...page.matchAll(/(?:src|href)="([^"]*)"/g)]
      .map((match) => match[1] ?? '')
      .filter((url) => !url.startsWith('data:'));
    expect(external).toEqual([]);
    expect(page).toContain('data:audio/mpeg;base64');
    expect(page).toContain('data:image/png;base64');
  });

  it('carries a classic script, not a module', () => {
    // A `<script type="module">` is fetched under CORS even from `file://`,
    // so a module entry means a page that loads to a black screen when it is
    // double-clicked — the exact failure this build shape exists to avoid.
    expect(page).not.toMatch(/<script\b[^>]*type=["']module["']/i);
    expect(page).toMatch(/<script>/);
  });

  it('runs the script after the document it needs, not before it', () => {
    // A classic script runs where it stands. `vite build` hoists the entry
    // into `<head>`, which is harmless for a deferred module and fatal here:
    // `boot`'s first line looks up `#game`.
    const script = page.indexOf('<script>');
    const gameHost = page.indexOf('id="game"');
    expect(gameHost).toBeGreaterThan(-1);
    expect(script).toBeGreaterThan(gameHost);
  });

  it('parses as JavaScript', () => {
    // The `$`-pattern bug produced a page whose script was syntactically
    // broken in the middle, which every other assertion here passed happily.
    // `new Script` compiles without running: the bundle's first statement
    // boots the game, and there is no DOM here for it to boot into.
    const open = page.indexOf('<script>') + '<script>'.length;
    const code = page.slice(open, page.indexOf('</script>', open));
    expect(code.length).toBeGreaterThan(100_000);
    expect(() => new Script(code)).not.toThrow();
  });
});

describe('the release build is the game, not the workshop it was built in', () => {
  it('ships no editors', () => {
    // `editor-dock.ts` and the three pages it opens are tools for building
    // the game. They stay in the CI preview build; they are not part of what
    // a player is handed.
    expect(page).not.toContain('dock-toggle');
    expect(page).not.toContain('pixel-editor.html');
    expect(page).not.toContain('kb-pixel-editor:pick');
  });

  it('exposes no debug handle, and carries no debug overlay', () => {
    expect(page).not.toContain('__kellerbier');
    // `mountDebugOverlay`'s dynamic import is what drops `src/debug/`, and
    // `inlineDynamicImports` (which the single-file output needs) is exactly
    // the setting that could fold it back in if the guard ever stopped
    // folding to a constant.
    expect(page).not.toContain('DebugOverlay');
  });

  it('drops the boot screen it starts behind', () => {
    // Present in the markup (it is what the browser paints first) and taken
    // down by `app/boot-progress.ts` once there is a frame to show.
    expect(page).toContain('id="boot-screen"');
    expect(page).toContain('kb-boot-done');
  });
});
