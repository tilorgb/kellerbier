import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { ALL_BUCKET_IDS, CATEGORY_FOLDERS } from './spec.mjs';

const STRIP_SUFFIX = '.strip.png';
const ANIM_SUFFIX = '.anim.json';

/**
 * Walks `assets/sprites/<bucket>/<category>/` for every known bucket and
 * category, and returns every sprite found there.
 *
 * A bucket or category folder that does not exist yet is skipped rather than
 * erroring — "adding a sprite requires dropping a file in a folder" (#34's
 * first acceptance criterion) has to hold before any floor has art in it.
 *
 * A single sprite is either a plain `name.png`, or an animation strip —
 * `name.strip.png` paired with a `name.anim.json` sidecar naming the frame
 * count and timing. A strip missing its sidecar is a scan error, not a
 * silently-skipped file: a strip nobody can play back correctly is worse
 * than one the build refuses to pack.
 */
export async function scanSprites(rootDir) {
  const sprites = [];
  for (const bucketId of ALL_BUCKET_IDS) {
    for (const [category, folder] of Object.entries(CATEGORY_FOLDERS)) {
      const dir = path.join(rootDir, bucketId, folder);
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      const plainNames = new Set();
      const stripNames = new Set();
      for (const entry of entries) {
        if (!entry.isFile()) {
          continue;
        }
        if (entry.name.endsWith(STRIP_SUFFIX)) {
          stripNames.add(entry.name.slice(0, -STRIP_SUFFIX.length));
        } else if (entry.name.endsWith('.png')) {
          plainNames.add(entry.name.slice(0, -'.png'.length));
        }
      }
      for (const name of stripNames) {
        if (plainNames.has(name)) {
          // Ambiguous, and silently resolvable in two different directions:
          // both files would pack under the same `category/name` atlas key,
          // and `render/floor-art.ts`'s loader would have to guess which one
          // the game meant. That is a bug in what is on disk rather than a
          // gap in what has been authored (`docs/DECISIONS.md` #19's line),
          // so it fails the build. It has a real trigger: animating an
          // existing static sprite means adding `name.strip.png` next to the
          // `name.png` it replaces, and forgetting to delete the old file.
          throw new Error(
            `${path.join(dir, `${name}${STRIP_SUFFIX}`)}: "${name}" is authored twice, as both a ` +
              `plain ${name}.png and an animation strip. Delete whichever one is stale.`,
          );
        }
      }
      for (const name of plainNames) {
        sprites.push({
          bucketId,
          category,
          name,
          filePath: path.join(dir, `${name}.png`),
          animation: null,
        });
      }
      for (const name of stripNames) {
        const animPath = path.join(dir, `${name}${ANIM_SUFFIX}`);
        let raw;
        try {
          raw = await readFile(animPath, 'utf8');
        } catch {
          throw new Error(
            `${path.join(dir, `${name}${STRIP_SUFFIX}`)}: animation strip has no matching ${name}${ANIM_SUFFIX} sidecar`,
          );
        }
        let animation;
        try {
          animation = JSON.parse(raw);
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          throw new Error(`${animPath}: not valid JSON (${reason})`);
        }
        sprites.push({
          bucketId,
          category,
          name,
          filePath: path.join(dir, `${name}${STRIP_SUFFIX}`),
          animation,
        });
      }
    }
  }
  return sprites;
}
