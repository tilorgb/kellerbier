/**
 * Opens the release build the way a friend does — as a local file, with no
 * server — and checks that it is a game rather than a black screen.
 *
 * Usage:
 *   npm run build:release
 *   node tools/release/smoke.mjs [file] [--shots <dir>]
 *   npm run release:smoke
 *
 * `tests/build/release-bundle.test.ts` reads the emitted bytes and is the
 * thing CI runs; this needs a browser and a GL implementation, so it stays a
 * command somebody (or an agent) runs on purpose. It is the half a test of the
 * file cannot cover: three.js actually initialising, the atlases actually
 * uploading as textures out of their `data:` URIs, `localStorage` actually
 * being writable from a `file://` origin — every one of which is a plausible
 * way for a page that passes every static check to still not play.
 *
 * Drives a Chromium the same way `tools/perf/room-crossings.mjs` does:
 * `CHROMIUM=/path/to/chrome` if set, else the runner's Chrome, a system
 * Chromium, or the Playwright-managed one under `/opt/pw-browsers`.
 *
 * The release build exposes no `__kellerbier` handle by design, so unlike the
 * perf walk this cannot reach into the simulation: it drives the game through
 * real key presses and reads the DOM, which is all a player has too.
 */
/* The callbacks handed to `page.evaluate` run in the browser, not here — same
   arrangement, and the same directive, as `tools/perf/room-crossings.mjs`. */
/* global document, window */
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const shotsFlag = args.indexOf('--shots');
const shotsDir = shotsFlag === -1 ? null : args[shotsFlag + 1];
const positional = args.filter((arg, i) => !arg.startsWith('--') && i !== shotsFlag + 1);
const file =
  positional[0] ?? fileURLToPath(new URL('../../release/Kellerbier.html', import.meta.url));

if (!existsSync(file)) {
  console.error(`no release build at ${file} — run \`npm run build:release\` first`);
  process.exit(1);
}
if (shotsDir !== null && shotsDir !== undefined) {
  mkdirSync(shotsDir, { recursive: true });
}

const BROWSER_CANDIDATES = [
  process.env.CHROMIUM,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
];
const executablePath = BROWSER_CANDIDATES.find((path) => path !== undefined && existsSync(path));
if (executablePath === undefined) {
  console.error('no Chromium found: set CHROMIUM=/path/to/chrome');
  process.exit(1);
}

const { chromium } = await import('playwright-core');

const shot = async (page, name) => {
  if (shotsDir !== null && shotsDir !== undefined) {
    await page.screenshot({ path: `${shotsDir}/${name}.png` });
  }
};

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`[console] ${message.text().slice(0, 300)}`);
});
page.on('pageerror', (error) => errors.push(`[pageerror] ${error.message.slice(0, 300)}`));

const failures = [];
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}: ${JSON.stringify(actual)}`);
  if (!ok) failures.push(label);
};

const startedAt = Date.now();
await page.goto(`file://${file}`, { waitUntil: 'domcontentloaded' });
// Caught deliberately early: the boot screen has to be painted from the markup
// alone, before any of the game's own JavaScript has run.
await shot(page, '01-boot');

try {
  // `app/boot-progress.ts` removes the screen once the first real frame is up,
  // so this is "playable", not "parsed".
  await page.waitForFunction(() => document.getElementById('boot-screen') === null, null, {
    timeout: 60_000,
  });
} catch {
  console.error('the boot screen never came down — the game did not start');
  console.error(errors.join('\n') || '(no errors captured)');
  await shot(page, '01-stuck');
  await browser.close();
  process.exit(1);
}
console.log(`cold load to playable: ${String(Date.now() - startedAt)} ms (software rasteriser)`);

check(
  'canvas',
  await page.evaluate(() => {
    const canvas = document.querySelector('#game canvas');
    return canvas === null ? null : `${String(canvas.width)}x${String(canvas.height)}`;
  }),
  '640x360',
);
check(
  'debug handle',
  await page.evaluate(() => '__kellerbier' in window),
  false,
);
check(
  'editor dock buttons',
  await page.evaluate(() => document.querySelectorAll('#dock-toggle button').length),
  0,
);
check(
  'seed panel',
  await page.evaluate(() => document.getElementById('seed-control') !== null),
  false,
);
// Saving is what makes closing the window and coming back later work, and a
// `file://` origin is the one place it plausibly would not.
check(
  'localStorage writable',
  await page.evaluate(() => {
    try {
      localStorage.setItem('kb-smoke', '1');
      const ok = localStorage.getItem('kb-smoke') === '1';
      localStorage.removeItem('kb-smoke');
      return ok;
    } catch {
      return false;
    }
  }),
  true,
);

await shot(page, '02-title');
// Title -> Start, then past the opening card and the floor card.
await page.keyboard.press('Enter');
await page.waitForTimeout(2500);
await page.keyboard.press('Enter');
await page.waitForTimeout(4000);
for (const key of ['KeyD', 'KeyW', 'KeyD']) {
  await page.keyboard.down(key);
  await page.waitForTimeout(500);
  await page.keyboard.up(key);
}
await page.keyboard.down('ArrowRight');
await page.waitForTimeout(600);
await page.keyboard.up('ArrowRight');
await page.waitForTimeout(400);
await shot(page, '03-playing');

check('page errors', errors, []);

await browser.close();
if (failures.length > 0) {
  console.error(`\n${String(failures.length)} check(s) failed: ${failures.join(', ')}`);
  process.exit(1);
}
console.log('\nthe release build plays from file://');
