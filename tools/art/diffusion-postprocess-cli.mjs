#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { decodePng, encodePng } from './png.mjs';
import { paletteForFloor, postprocessDiffusionOutput } from './diffusion-postprocess.mjs';

/**
 * `npm run art:diffusion-postprocess -- --in raw.png --out candidate.png --width 32 --height 32 [--floor cellar]`
 *
 * The repo-side half of #258: turns one raw ComfyUI output into one
 * grid-aligned, on-palette candidate PNG. Never overwrites the source, and
 * never writes into `assets/sprites/` itself — a candidate still needs the
 * `CLAUDE.md` pixel-art sign-off before it becomes committed art.
 */

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    if (!flag?.startsWith('--')) {
      throw new Error(`expected a --flag, got "${String(flag)}"`);
    }
    args[flag.slice(2)] = argv[i + 1];
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
if (
  args.in === undefined ||
  args.out === undefined ||
  args.width === undefined ||
  args.height === undefined
) {
  console.error(
    'usage: diffusion-postprocess-cli.mjs --in <raw.png> --out <candidate.png> --width <n> --height <n> [--floor <floorTag>]',
  );
  process.exitCode = 1;
} else {
  const raw = await readFile(args.in);
  const decoded = decodePng(raw);
  const palette = paletteForFloor(args.floor ?? null);
  const candidate = postprocessDiffusionOutput(decoded, {
    targetWidth: Number.parseInt(args.width, 10),
    targetHeight: Number.parseInt(args.height, 10),
    palette,
  });
  await writeFile(args.out, encodePng(candidate));
  console.log(
    `diffusion-postprocess: ${args.in} (${String(decoded.width)}x${String(decoded.height)}) -> ` +
      `${args.out} (${String(candidate.width)}x${String(candidate.height)}, ` +
      `${args.floor ?? 'master'} palette, ${String(palette.length)} colours)`,
  );
}
