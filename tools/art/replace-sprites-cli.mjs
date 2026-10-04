#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { replaceSprites } from './replace-sprites.mjs';

/**
 * `npm run sprites:replace` — swaps the sprites dropped into
 * `sprites-changed/` into `assets/sprites/`, archiving the old files under
 * `sprites-archive/<timestamp>/`. `--dry-run` only lists what would happen.
 * See `replace-sprites.mjs`.
 */
const repo = (relative) => fileURLToPath(new URL(`../../${relative}`, import.meta.url));
const dryRun = process.argv.includes('--dry-run');

try {
  const { replaced, archiveFolder } = await replaceSprites({
    rootDir: repo('assets/sprites/'),
    inboxDir: repo('sprites-changed/'),
    archiveDir: repo('sprites-archive/'),
    dryRun,
  });
  if (replaced.length === 0) {
    console.log('sprites: sprites-changed/ is empty — nothing to replace');
  } else {
    console.log(`sprites: ${dryRun ? 'would replace' : 'replaced'} ${String(replaced.length)}`);
    for (const line of replaced) {
      console.log(`  ${line}`);
    }
    console.log(`sprites: old files ${dryRun ? 'would go' : 'archived'} to ${archiveFolder}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
