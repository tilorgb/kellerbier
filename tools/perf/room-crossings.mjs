/**
 * Measures what a room crossing costs, in the real game, in a headless browser.
 *
 * Usage:
 *   npm run dev                                   # in another terminal, port 5173
 *   node tools/perf/room-crossings.mjs [walk|tour] [crossings] [url]
 *
 * Needs `playwright-core` (not a project dependency — `npm i --no-save
 * playwright-core` once) and a Chromium to drive: the preinstalled one at
 * `/opt/pw-browsers` on the cloud runners, or set `CHROMIUM=/path/to/chrome`.
 *
 * `walk` (default) is a real crossing: the player is teleported to a door's
 * threshold and the movement key toward it is held through #289's dwell, so the
 * prewarm (`GameView.prewarmRoom`) runs exactly as it does for a player. `tour`
 * presses the dev `N` key instead (`force: true`, no prewarm). Enemies are killed
 * via `sim.kill` before each crossing so the doors are open.
 *
 * What it reports, per crossing, is the *work* — which is what stays
 * machine-independent under SwiftShader (`docs/PERFORMANCE_AUDIT.md` §1): every
 * frame that took more than 30 ms of JavaScript, with its WebGL call counts
 * (`compileShader`, `linkProgram`, `getProgramInfoLog` — the blocking link —
 * buffer and texture churn), plus the renderer's program list before and after
 * any frame that linked one, diffed by cache key so the parameter that changed
 * can be read off. `KEYS=1` prints the keys; `INV=1` diffs the scene's mesh
 * inventory across each crossing; `PROFILE=1` also takes a CPU profile.
 *
 * The healthy state after `docs/DECISIONS.md` #80 is zero `linkProgram` on every
 * crossing after the run's first, and a program count that plateaus in the
 * low twenties. Anything else is a regression in one of the three rules that
 * entry states — a light that joined the scene graph somewhere other than
 * `Lighting`'s constructor, a program-key input that changed mid-run, or a warm
 * that compiled a variant the frame does not draw.
 */
/* global window */
import { writeFileSync } from 'node:fs';

const mode = process.argv[2] ?? 'walk';
const crossings = Number(process.argv[3] ?? 20);
const url = process.argv[4] ?? 'http://127.0.0.1:5173/';
const profile = process.env.PROFILE === '1';
const showKeys = process.env.KEYS === '1';
const diffInventory = process.env.INV === '1';
const executablePath = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

let chromium;
try {
  ({ chromium } = await import('playwright-core'));
} catch {
  console.error('playwright-core is not installed: npm i --no-save playwright-core');
  process.exit(1);
}

// Runs before the page's own scripts: wraps the WebGL2 methods whose counts we
// care about, and requestAnimationFrame so each frame's JS time and GL calls
// are attributed to it.
const initScript = `
(() => {
  const S = (window.__perf = { frames: [], longTasks: [], cur: null, lastPrograms: [] });
  const GL_METHODS = ['compileShader','linkProgram','getProgramParameter','getShaderParameter','deleteProgram',
    'texImage2D','texSubImage2D','texStorage2D','bufferData','bufferSubData','readPixels','getError','finish',
    'createTexture','deleteTexture','createBuffer','deleteBuffer','drawElements','drawArrays',
    'drawElementsInstanced','drawArraysInstanced','useProgram','getUniformLocation','getActiveUniform','getActiveAttrib',
    'getProgramInfoLog','getShaderInfoLog','bindTexture'];
  const proto = WebGL2RenderingContext.prototype;
  for (const name of GL_METHODS) {
    const orig = proto[name];
    if (typeof orig !== 'function') continue;
    proto[name] = function (...args) {
      const t0 = performance.now();
      const r = orig.apply(this, args);
      const dt = performance.now() - t0;
      const cur = S.cur;
      if (cur) {
        const e = (cur.gl[name] ??= { n: 0, ms: 0 });
        e.n += 1; e.ms += dt;
      }
      return r;
    };
  }
  const origRaf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => origRaf((ts) => {
    const start = performance.now();
    const frame = { start, gl: {}, roomId: null };
    S.cur = frame;
    try { cb(ts); } finally {
      frame.js = performance.now() - start;
      const k = window.__kellerbier;
      try { frame.roomId = k ? k.sim.roomId : null; } catch {}
      try {
        const r = k && k.view && k.view.renderer;
        if (r) {
          const keys = r.info.programs.map((p) => p.cacheKey);
          if (frame.gl.linkProgram || frame.gl.deleteProgram) {
            frame.programsBefore = S.lastPrograms; frame.programsAfter = keys;
          }
          S.lastPrograms = keys;
        }
      } catch {}
      S.cur = null;
      S.frames.push(frame);
      if (S.frames.length > 5000) S.frames.shift();
    }
  });
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) S.longTasks.push({ start: e.startTime, dur: e.duration });
    }).observe({ type: 'longtask', buffered: true });
  } catch {}
})();
`;

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
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') {
    const text = m.text();
    if (!text.includes('AudioContext')) console.log('[page]', m.type(), text.slice(0, 300));
  }
});
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.addInitScript(initScript);
await page.goto(url);
await page.waitForFunction(() => Boolean(window.__kellerbier), null, { timeout: 60000 });
await page.waitForTimeout(1500);
// Title screen → Start.
await page.keyboard.press('Enter');
await page.waitForFunction(
  () => {
    const k = window.__kellerbier;
    try {
      return Boolean(k.sim.roomId) && k.sim.tick > 5;
    } catch {
      return false;
    }
  },
  null,
  { timeout: 30000 },
);
// Let the floor card and the boot shader warm queue drain.
await page.waitForTimeout(6000);

const cdp = await page.context().newCDPSession(page);
if (profile) {
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  await cdp.send('Profiler.start');
}

const DIR_KEY = { north: 'KeyW', south: 'KeyS', west: 'KeyA', east: 'KeyD' };

const killAll = () =>
  page.evaluate(() => {
    const sim = window.__kellerbier.sim;
    const enemies = [];
    sim.world.forEach(sim.enemyMask, (i) => enemies.push(i));
    for (const i of enemies) sim.kill(i);
    sim.world.flush();
    return enemies.length;
  });

const inventory = () =>
  page.evaluate(() => {
    const out = [];
    window.__kellerbier.view.scene.traverse((o) => {
      if (!o.isMesh && !o.isLine && !o.isSprite && !o.isPoints) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        out.push(
          `${o.type}:${o.name || '-'}:${m.type}:map=${m.map ? 1 : 0}:at=${m.alphaTest}:tr=${m.transparent}:side=${m.side}:inst=${o.isInstancedMesh ? 1 : 0}:vis=${o.visible}`,
        );
      }
    });
    return out;
  });

// Teleports the player just inside one of the current room's doors and holds
// the key toward it; returns the key held, or null when the room has no door.
async function approachDoor() {
  const door = await page.evaluate(() => {
    const sim = window.__kellerbier.sim;
    const doors = sim.doors;
    if (doors.length === 0) return null;
    // Rotate through the doors so a back-and-forth pair is not the only path.
    const d = doors[Math.floor(sim.tick / 7) % doors.length];
    return {
      direction: d.direction,
      cellCol: d.cellCol,
      cellRow: d.cellRow,
      centre: d.centre ?? null,
    };
  });
  if (door === null) return null;
  await page.evaluate(
    ({ door }) => {
      const sim = window.__kellerbier.sim;
      const room = sim.room;
      // `doorCentre` (sim/room/template.ts) — a door sits on the room's boundary,
      // centred on its cell; a staircase door carries its own centre.
      const SW = 240;
      const SH = 144;
      let cx;
      let cy;
      if (door.centre) {
        cx = door.centre.x;
        cy = door.centre.y;
      } else {
        const ccx = room.minX + door.cellCol * SW + SW / 2;
        const ccy = room.minY + door.cellRow * SH + SH / 2;
        if (door.direction === 'north') {
          cx = ccx;
          cy = room.minY;
        }
        if (door.direction === 'south') {
          cx = ccx;
          cy = room.maxY;
        }
        if (door.direction === 'west') {
          cx = room.minX;
          cy = ccy;
        }
        if (door.direction === 'east') {
          cx = room.maxX;
          cy = ccy;
        }
      }
      const inset = 14;
      if (door.direction === 'north') cy += inset;
      if (door.direction === 'south') cy -= inset;
      if (door.direction === 'west') cx += inset;
      if (door.direction === 'east') cx -= inset;
      const pi = sim.playerIndex;
      const d = sim.transform.data;
      d[pi * 4] = cx;
      d[pi * 4 + 1] = cy;
      d[pi * 4 + 2] = cx;
      d[pi * 4 + 3] = cy;
    },
    { door },
  );
  const key = DIR_KEY[door.direction];
  await page.keyboard.down(key);
  return key;
}

const summarizeGl = (f) =>
  Object.entries(f.gl)
    .filter(([, v]) => v.n > 0)
    .map(([k, v]) => `${k}:${v.n}${v.ms > 1 ? `(${v.ms.toFixed(0)}ms)` : ''}`)
    .join(' ');

const log = [];
let totalLinks = 0;
let totalLinksAfterFirst = 0;
for (let c = 0; c < crossings; c++) {
  const before = await page.evaluate(() => window.__kellerbier.sim.roomId);
  const killed = await killAll();
  await page.waitForTimeout(400);
  const frameCountBefore = await page.evaluate(() => window.__perf.frames.length);
  const invBefore = diffInventory ? await inventory() : null;
  const t0 = await page.evaluate(() => performance.now());
  let held = null;
  if (mode === 'tour') {
    await page.keyboard.press('n');
  } else {
    held = await approachDoor();
    if (held === null) {
      console.log('no doors in this room');
      break;
    }
  }
  let after = before;
  const deadline = Date.now() + 9000;
  while (Date.now() < deadline) {
    after = await page.evaluate(() => window.__kellerbier.sim.roomId);
    if (after !== before) break;
    await page.waitForTimeout(30);
  }
  const tSwitch = await page.evaluate(() => performance.now());
  if (held) await page.keyboard.up(held);
  if (after === before) {
    console.log(`crossing ${c}: no switch happened (mode ${mode})`);
    continue;
  }
  // Through the slide and past the outgoing room's detach.
  await page.waitForTimeout(1800);
  const frames = await page.evaluate((n) => window.__perf.frames.slice(n), frameCountBefore);
  const links = frames.reduce((n, f) => n + (f.gl.linkProgram?.n ?? 0), 0);
  totalLinks += links;
  if (c > 0) totalLinksAfterFirst += links;
  const worst = frames.reduce((a, f) => (f.js > a.js ? f : a), { js: 0 });
  const entry = {
    c,
    from: before,
    to: after,
    killed,
    switchAfterMs: Math.round(tSwitch - t0),
    frames: frames.length,
    links,
    worstJs: Math.round(worst.js),
  };
  log.push(entry);
  console.log(
    `#${c} ${before} -> ${after} (killed ${killed}) switch@${entry.switchAfterMs}ms frames=${frames.length} links=${links} worstJs=${entry.worstJs}ms`,
  );
  for (const f of frames) {
    if (f.js > 30) {
      console.log(
        `    long frame @${Math.round(f.start - t0)}ms js=${Math.round(f.js)}ms room=${f.roomId} ${summarizeGl(f)}`,
      );
    }
    if (f.programsAfter) {
      const beforeKeys = new Set(f.programsBefore ?? []);
      const afterKeys = new Set(f.programsAfter);
      const added = [...afterKeys].filter((k) => !beforeKeys.has(k));
      const removed = [...beforeKeys].filter((k) => !afterKeys.has(k));
      console.log(
        `    programs @${Math.round(f.start - t0)}ms: +${added.length} -${removed.length} total ${afterKeys.size}`,
      );
      if (showKeys) {
        for (const k of added) console.log('      + ' + k.slice(0, 400));
        for (const k of removed) console.log('      - ' + k.slice(0, 400));
      }
    }
  }
  if (invBefore) {
    const invAfter = await inventory();
    const count = (arr) => arr.reduce((m, k) => m.set(k, (m.get(k) ?? 0) + 1), new Map());
    const b = count(invBefore);
    for (const [k, n] of count(invAfter)) {
      if ((b.get(k) ?? 0) < n) console.log(`    +mesh ${k} x${n - (b.get(k) ?? 0)}`);
    }
  }
}

if (profile) {
  const { profile: prof } = await cdp.send('Profiler.stop');
  writeFileSync('room-crossings.cpuprofile', JSON.stringify(prof));
  const nodes = new Map(prof.nodes.map((n) => [n.id, n]));
  const self = new Map();
  for (let i = 0; i < prof.samples.length; i++) {
    const n = nodes.get(prof.samples[i]);
    const key = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').slice(-2).join('/')}:${n.callFrame.lineNumber}`;
    self.set(key, (self.get(key) ?? 0) + prof.timeDeltas[i]);
  }
  console.log('\nTop self-time (ms) over the tour:');
  for (const [k, v] of [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)) {
    console.log(`  ${(v / 1000).toFixed(1).padStart(8)}  ${k}`);
  }
}

const longTasks = await page.evaluate(() => window.__perf.longTasks);
const memory = await page.evaluate(() => {
  const r = window.__kellerbier.view?.renderer ?? null;
  return r ? { ...r.info.memory, programs: r.info.programs?.length } : null;
});
console.log(
  `\n${log.length} crossings: ${totalLinks} linkProgram in total, ${totalLinksAfterFirst} after the first crossing; ` +
    `${longTasks.length} long tasks (>50ms), worst ${Math.max(0, ...longTasks.map((l) => l.dur)).toFixed(0)}ms`,
);
console.log('renderer memory', memory);
writeFileSync(`room-crossings-${mode}.json`, JSON.stringify(log, null, 1));
await browser.close();
