#!/usr/bin/env node
/**
 * Generates `SPRITE_OVERVIEW.md` next to the game design document: every
 * authored object (characters, enemies, items, pickups) with the sprite it
 * draws — or a "fehlt" marker where it has none yet — plus every sprite that
 * belongs to no object (tiles, VFX, projectiles, orphans).
 *
 * Images are embedded as relative links, so redrawing a PNG shows up in the
 * document without regenerating it. Adding/removing an object or a sprite
 * file does need a regeneration; `artPipelineDevPlugin` runs this on every
 * change under `assets/sprites/` or `src/content/` while `npm run dev` is up,
 * and `npm run docs:sprites` runs it by hand.
 *
 * Content is read by regex from the source rather than imported, so this
 * runs in plain Node with no TypeScript step.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const SPRITES = join(REPO, 'assets/sprites');
const CONTENT = join(REPO, 'src/content');
const OUT = join(REPO, 'SPRITE_OVERVIEW.md');

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const tsFiles = (dir) =>
  readdirSync(join(CONTENT, dir))
    .filter((f) => f.endsWith('.ts') && f !== 'index.ts')
    .map((f) => join(CONTENT, dir, f));

/** Every `id: '…', name: '…'` pair (plus optional `sprite: '…'`) in a file. */
function definitions(file) {
  const src = readFileSync(file, 'utf8');
  const out = [];
  const re = /\bid:\s*'([^']+)',\s*\n\s*name:\s*'([^']+)'/g;
  for (let m; (m = re.exec(src));) {
    const rest = src.slice(m.index, m.index + 600);
    const sprite = /\bsprite:\s*'([^']+)'/.exec(rest)?.[1];
    if (!out.some((d) => d.id === m[1])) out.push({ id: m[1], name: m[2], sprite, file });
  }
  return out;
}

const rel = (p) => relative(REPO, p).split('\\').join('/');
// `@2x` is a resolution, not part of the name (`scan.mjs`'s `parseDensity`).
const spriteKey = (p) =>
  basename(p)
    .replace(/\.strip\.png$|\.png$/, '')
    .replace(/@[2-4]x$/, '');
const floorOf = (p) => rel(p).split('/')[2];

const img = (p) =>
  `<img src="${encodeURI(rel(p))}" height="${p.endsWith('.strip.png') ? 32 : 48}" style="image-rendering:pixelated" title="${basename(p)}">`;

/** A clickable repo-relative path, e.g. for the file list next to each sprite. */
/**
 * A sprite's format: its size from the PNG header, and for an animation strip
 * the per-frame size — the number the size rules apply to — plus frame count.
 */
function format(p) {
  const header = readFileSync(p).subarray(16, 24);
  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  // A `@2x` sprite stands at its base-grid size; the file's own size follows.
  const density = Number(/@([2-4])x(\.strip)?\.png$/.exec(p)?.[1] ?? 1);
  const hiRes = density > 1 ? ` (@${density}x, ${width}×${height} px)` : '';
  const anim = p.replace(/\.strip\.png$/, '.anim.json');
  if (anim !== p && existsSync(anim)) {
    const frames = JSON.parse(readFileSync(anim, 'utf8')).frames ?? 1;
    return `${width / frames / density}×${height / density} · ${frames} Frames${hiRes || ` (Strip ${width}×${height})`}`;
  }
  return `${width / density}×${height / density}${hiRes}`;
}

const link = (p) => `[\`${rel(p)}\`](${encodeURI(rel(p))})`;

function table(rows, withFloor) {
  const lines = [
    `| Status | Name | ID | Dateiname | ${withFloor ? 'Floor | ' : ''}Sprite(s) | Datei(en) | Definition |`,
    `|---|---|---|---|${withFloor ? '---|' : ''}---|---|---|`,
  ];
  for (const r of rows) {
    const status = r.sprites.length ? '✅' : '❌ fehlt';
    const floor = withFloor ? `${r.sprites[0] ? floorOf(r.sprites[0]) : '–'} | ` : '';
    const imgs = r.sprites.length ? r.sprites.map(img).join(' ') : '–';
    const files = r.sprites.length
      ? r.sprites
          .flatMap((p) => {
            const anim = p.replace(/\.strip\.png$/, '.anim.json');
            return anim !== p && existsSync(anim) ? [p, anim] : [p];
          })
          .map((f) => (f.endsWith('.png') ? `${link(f)} — **${format(f)}**` : link(f)))
          .join('<br>')
      : `erwartet: \`${r.expected}\``;
    // Just the file name, ready to copy for a file dropped into
    // `sprites-changed/` (`npm run sprites:replace`).
    const names = (r.sprites.length ? r.sprites : [r.expected])
      .map((p) => `\`${basename(p)}\``)
      .join('<br>');
    lines.push(
      `| ${status} | ${r.name} | \`${r.id}\` | ${names} | ${floor}${imgs} | ${files} | ${link(r.file)} |`,
    );
  }
  const done = rows.filter((r) => r.sprites.length).length;
  return { md: lines.join('\n'), done, total: rows.length };
}

export function writeSpriteOverview() {
  const pngs = walk(SPRITES).filter((f) => f.endsWith('.png'));
  const claimed = new Set();
  const find = (match) => {
    const hits = pngs.filter((p) => match(spriteKey(p)));
    hits.forEach((p) => claimed.add(p));
    return hits;
  };
  const sections = [];

  const chars = tsFiles('characters').flatMap(definitions);
  sections.push([
    'Spielfiguren',
    chars.map((c) => ({
      ...c,
      expected: `assets/sprites/common/characters/${c.id}-south.strip.png`,
      sprites: find((k) => k === c.id || k.startsWith(`${c.id}-`)),
    })),
    false,
  ]);

  const enemies = tsFiles('enemies').flatMap(definitions);
  // Longest ids first, so `der-stier-maibaum-dieb` is not claimed by `der-stier`.
  const byLength = [...enemies].sort((a, b) => b.id.length - a.id.length);
  const enemySprites = new Map();
  for (const e of byLength) {
    enemySprites.set(
      e.id,
      find(
        (k) =>
          (k === e.id || k.startsWith(`${e.id}-`)) &&
          ![...enemySprites.values()].flat().some((p) => spriteKey(p) === k),
      ),
    );
  }
  // Tier comes from where an enemy is spawned: a room whose `specialRole` is
  // boss/miniboss. A boss's own phases (`into:` split-offs, `<boss-id>-…`
  // variants, anything drawn from `bosses/`) count as boss too.
  const roleOf = new Map();
  const roomsDir = join(CONTENT, 'rooms');
  for (const f of readdirSync(roomsDir).filter((n) => n.endsWith('.json'))) {
    const src = readFileSync(join(roomsDir, f), 'utf8');
    const role = /"specialRole":\s*"(boss|miniboss)"/.exec(src)?.[1];
    if (!role) continue;
    for (const m of src.matchAll(/"enemyId":\s*"([^"]+)"/g)) roleOf.set(m[1], role);
  }
  const bossIds = new Set(
    enemies
      .filter(
        (e) => roleOf.get(e.id) === 'boss' || /size:\s*'boss'/.test(readFileSync(e.file, 'utf8')),
      )
      .map((e) => e.id),
  );
  for (const e of enemies) {
    const src = readFileSync(e.file, 'utf8');
    const bossFile = [...bossIds].some((b) => src.includes(`id: '${b}'`));
    if (
      [...bossIds].some((b) => e.id.startsWith(`${b}-`)) ||
      (bossFile && src.includes(`into: '${e.id}'`)) ||
      enemySprites.get(e.id).some((p) => rel(p).includes('/bosses/'))
    ) {
      bossIds.add(e.id);
    }
  }
  const tierOf = (e) =>
    bossIds.has(e.id) ? 'boss' : roleOf.get(e.id) === 'miniboss' ? 'miniboss' : 'enemy';
  const enemyRows = (tier, folder) =>
    enemies
      .filter((e) => tierOf(e) === tier)
      .map((e) => ({
        ...e,
        expected: `assets/sprites/floor-N-…/${folder}/${e.id}.png`,
        sprites: enemySprites.get(e.id),
      }));
  sections.push(['Gegner', enemyRows('enemy', 'characters'), true]);
  sections.push(['Minibosse', enemyRows('miniboss', 'characters'), true]);
  sections.push(['Bosse', enemyRows('boss', 'bosses'), true]);

  const items = tsFiles('items').flatMap(definitions);
  sections.push([
    'Items',
    items.map((i) => ({
      ...i,
      expected: `assets/sprites/common/characters/item-${i.sprite ?? i.id}.png`,
      sprites: find((k) => k === `item-${i.sprite ?? i.id}`),
    })),
    false,
  ]);

  const pickups = definitions(join(CONTENT, 'pickups/pickups.ts'));
  sections.push([
    'Pickups',
    pickups.map((p) => ({
      ...p,
      expected: `assets/sprites/common/characters/pickup-${p.id}.png`,
      sprites: find((k) => k === `pickup-${p.id}`),
    })),
    false,
  ]);

  let md = `# Kellerbier — Sprite-Übersicht

  > **Automatisch generiert** von \`tools/art/sprite-overview.mjs\` — nicht von Hand bearbeiten.
  > Aktualisiert sich bei \`npm run dev\` automatisch, sobald sich etwas unter \`assets/sprites/\`
  > oder \`src/content/\` ändert; manuell mit \`npm run docs:sprites\`.
  > Die Bilder sind verlinkt, ein neu gezeichnetes PNG ist also sofort sichtbar.
  >
  > Zum Game Design Document: [Kellerbier — Game Design Document.md](${encodeURI('Kellerbier — Game Design Document.md')})

  ## Stand

  | Kategorie | Mit Sprite | Gesamt | Fehlt |
  |---|---|---|---|
  `.replace(/^ {2}/gm, '');
  const bodies = [];
  for (const [title, rows, withFloor] of sections) {
    const t = table(rows, withFloor);
    md += `| [${title}](#${title
      .toLowerCase()
      .replace(/[^a-z0-9äöü ]/g, '')
      .trim()
      .replace(/ +/g, '-')}) | ${t.done} | ${t.total} | ${t.total - t.done} |\n`;
    bodies.push(`## ${title}\n\n${t.md}\n`);
  }
  md += '\n' + bodies.join('\n');

  // Everything no object claimed: environment art, VFX, projectiles, orphans.
  const rest = pngs.filter((p) => !claimed.has(p));
  const groups = new Map();
  for (const p of rest) {
    const [, , floor, category] = rel(p).split('/');
    const key = `${floor} / ${category}`;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  md += '\n## Weitere Sprites (Tiles, Projektile, VFX, ohne Objekt-Zuordnung)\n';
  for (const [key, list] of [...groups].sort()) {
    md += `\n### ${key}\n\n| Dateiname | Größe | Datei | Sprite |\n|---|---|---|---|\n`;
    md +=
      list.map((p) => `| \`${basename(p)}\` | ${format(p)} | ${link(p)} | ${img(p)} |`).join('\n') +
      '\n';
  }

  const floors = readdirSync(SPRITES).filter((d) => d.startsWith('floor-'));
  const empty = floors.filter((f) => !pngs.some((p) => floorOf(p) === f));
  if (empty.length) {
    md += `\n## Floors ohne Sprites\n\n${empty.map((f) => `- ❌ \`${f}\``).join('\n')}\n`;
  }

  writeFileSync(OUT, md);
  return pngs.length;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log(`sprite overview: ${rel(OUT)} (${writeSpriteOverview()} sprites)`);
}
