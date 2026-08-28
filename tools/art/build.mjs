import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { floorBackgroundSwatches, FLOOR_BUCKETS, legalPixelColorsFor } from './palette.mjs';
import { checkProjectileLegibility, relativeLuminance } from './contrast.mjs';
import { decodePng, encodePng } from './png.mjs';
import { packSprites } from './pack.mjs';
import { scanSprites } from './scan.mjs';
import { ALL_BUCKET_IDS, floorTagForBucket } from './spec.mjs';
import {
  brightestOpaqueColor,
  findOffPalettePixel,
  validateAnimation,
  validateSpriteSize,
} from './validate.mjs';

/** Every problem found in one build, reported together rather than one at a time. */
export class AtlasBuildError extends Error {
  constructor(problems) {
    super(
      `art pipeline: ${String(problems.length)} problem${problems.length === 1 ? '' : 's'} found\n` +
        problems.map((problem) => `  - ${problem}`).join('\n'),
    );
    this.name = 'AtlasBuildError';
    this.problems = problems;
  }
}

/**
 * Scans, validates, packs and (optionally) writes every sprite atlas.
 *
 * `rootDir`: the `assets/sprites/` folder to scan.
 * `outDir`: where atlas PNGs and manifests are written; ignored when `write`
 * is `false`, which is how the test suite exercises this without touching
 * disk.
 *
 * Throws `AtlasBuildError` — with every problem found, not just the first —
 * on any off-palette pixel, out-of-spec sprite, broken animation sidecar, or
 * illegible projectile. Otherwise returns the build report described below.
 */
export async function buildAtlases({ rootDir, outDir, write = true }) {
  const sprites = await scanSprites(rootDir);
  const problems = [];
  const decoded = [];

  for (const sprite of sprites) {
    const buffer = await readFile(sprite.filePath);
    const { width, height, pixels } = decodePng(buffer);
    const frameCount = sprite.animation?.frames ?? 1;

    const sizeError = validateSpriteSize(sprite.category, width, height, frameCount);
    if (sizeError !== null) {
      problems.push(`${sprite.filePath}: ${sizeError}`);
    }

    if (sprite.animation !== null) {
      const animationError = validateAnimation(sprite.animation);
      if (animationError !== null) {
        problems.push(`${sprite.filePath}: ${animationError}`);
      }
    }

    const allowed = legalPixelColorsFor(sprite.bucketId);
    const offending = findOffPalettePixel(pixels, width, height, allowed);
    if (offending !== null) {
      const hex = offending.color.toString(16).padStart(6, '0');
      problems.push(
        `${sprite.filePath}: pixel (${String(offending.x)}, ${String(offending.y)}) is #${hex}, ` +
          `which is off-palette for "${sprite.bucketId}"`,
      );
    }

    decoded.push({ sprite, width, height, pixels });
  }

  // Legibility: every projectile's brightest ("rim") pixel, checked against
  // the background swatches of every floor it could actually appear on.
  // A projectile authored under one floor's bucket only ever appears there,
  // so it is checked against that floor alone; a `common` projectile is
  // shared by every enemy in the game and is held to all seven at once.
  const allFloorSwatchSets = FLOOR_BUCKETS.map((bucket) => ({
    floorTag: bucket.floorTag,
    colors: floorBackgroundSwatches(bucket.floorTag),
  }));

  let projectileSpritesChecked = 0;
  for (const entry of decoded) {
    if (entry.sprite.category !== 'projectile') {
      continue;
    }
    const rim = brightestOpaqueColor(entry.pixels, entry.width, entry.height, relativeLuminance);
    if (rim === null) {
      continue;
    }
    projectileSpritesChecked += 1;
    const name = `${entry.sprite.bucketId}/${entry.sprite.category}/${entry.sprite.name}`;
    const ownFloorTag = floorTagForBucket(entry.sprite.bucketId);
    const floorSwatchSets =
      ownFloorTag === null
        ? allFloorSwatchSets
        : allFloorSwatchSets.filter((set) => set.floorTag === ownFloorTag);

    const legibilityFailures = checkProjectileLegibility([{ name, rim }], floorSwatchSets);
    for (const failure of legibilityFailures) {
      const hex = failure.against.toString(16).padStart(6, '0');
      problems.push(
        `${failure.projectile}: contrast ${failure.ratio.toFixed(2)}:1 against #${hex} on ` +
          `"${failure.floorTag}" is below the minimum 3:1`,
      );
    }
  }

  if (problems.length > 0) {
    throw new AtlasBuildError(problems);
  }

  const atlases = [];
  for (const bucketId of ALL_BUCKET_IDS) {
    const bucketSprites = decoded
      .filter(({ sprite }) => sprite.bucketId === bucketId)
      .map(({ sprite, width, height, pixels }) => ({
        key: `${sprite.category}/${sprite.name}`,
        width,
        height,
        pixels,
        animation: sprite.animation,
      }));
    const atlas = packSprites(bucketSprites);
    if (atlas === null) {
      continue;
    }

    const frames = {};
    for (const [key, rect] of Object.entries(atlas.frames)) {
      const match = bucketSprites.find((entry) => entry.key === key);
      frames[key] =
        match?.animation !== null && match?.animation !== undefined
          ? { ...rect, animation: match.animation }
          : rect;
    }

    if (write) {
      await mkdir(outDir, { recursive: true });
      const pngBuffer = encodePng(atlas);
      await writeFile(path.join(outDir, `${bucketId}.png`), pngBuffer);
      await writeFile(
        path.join(outDir, `${bucketId}.json`),
        `${JSON.stringify({ width: atlas.width, height: atlas.height, frames }, null, 2)}\n`,
      );
    }

    atlases.push({
      bucketId,
      width: atlas.width,
      height: atlas.height,
      spriteCount: bucketSprites.length,
      bytes: atlas.width * atlas.height * 4,
    });
  }

  return {
    atlasCount: atlases.length,
    spriteCount: decoded.length,
    totalBytes: atlases.reduce((sum, atlas) => sum + atlas.bytes, 0),
    projectileSpritesChecked,
    atlases,
  };
}

function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${String(bytes)} B`;
  }
  return `${(bytes / 1024).toFixed(1)} KB`;
}

/**
 * The one-block "atlas count and texture memory" report the CONTRIBUTING.md
 * art definition-of-done wants in the build output — shared by the CLI
 * (`build-atlas.mjs`) and the Vite plugin (`dev-plugin.mjs`), so `npm run
 * build:atlas` and `npm run build` never say something different for the
 * same report.
 */
export function formatBuildReport(report) {
  const lines = [];
  if (report.atlasCount === 0) {
    lines.push('art pipeline: no sprites found yet — nothing to pack');
  } else {
    lines.push(
      `art pipeline: built ${String(report.atlasCount)} atlas(es), ` +
        `${String(report.spriteCount)} sprite(s), ${formatBytes(report.totalBytes)} total`,
    );
    for (const atlas of report.atlases) {
      lines.push(
        `  ${atlas.bucketId}: ${String(atlas.width)}x${String(atlas.height)}, ` +
          `${String(atlas.spriteCount)} sprite(s), ${formatBytes(atlas.bytes)}`,
      );
    }
  }
  lines.push(
    `art pipeline: checked ${String(report.projectileSpritesChecked)} projectile sprite(s) for legibility`,
  );
  return lines.join('\n');
}
