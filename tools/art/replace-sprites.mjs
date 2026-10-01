import { copyFile, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { AtlasBuildError, buildAtlases } from './build.mjs';
import { parseDensity, scanSprites } from './scan.mjs';

const STRIP_SUFFIX = '.strip.png';
const ANIM_SUFFIX = '.anim.json';

/**
 * Swaps existing sprites for the files dropped into an inbox folder, and
 * moves every file it replaces into a timestamped archive folder.
 *
 * Only *replaces*: every file in the inbox has to name a sprite that already
 * exists under `assets/sprites/`. A file is matched by its name with any
 * `@2x` suffix stripped (`scan.mjs`'s `parseDensity`), so `kuh@2x.png`
 * replaces `kuh.png` — which is how a sprite moves to a higher resolution.
 * Where one name exists in more than one bucket, the inbox file has to sit in
 * a subfolder naming the bucket (`sprites-changed/floor-2-rural/spore.png`).
 *
 * A strip (`name.strip.png`) may come with its own `name.anim.json`; without
 * one, the old sidecar is kept (renamed if the resolution changed).
 *
 * All or nothing: after swapping, the whole sprite tree is validated the way
 * the atlas build does (palette, size spec, sidecars). Any problem puts every
 * old file back, leaves the inbox untouched, and throws.
 */
export async function replaceSprites({
  rootDir,
  inboxDir,
  archiveDir,
  now = new Date(),
  dryRun = false,
}) {
  const incoming = await listInbox(inboxDir);
  if (incoming.length === 0) {
    return { replaced: [], archiveFolder: null };
  }

  const existing = await scanSprites(rootDir);
  const plans = [];
  const problems = [];
  for (const file of incoming) {
    const result = planReplacement(file, existing);
    if (typeof result === 'string') {
      problems.push(`${path.relative(inboxDir, file.filePath)}: ${result}`);
    } else {
      plans.push(result);
    }
  }
  const targets = new Map();
  for (const plan of plans) {
    const key = `${plan.target.bucketId}/${plan.target.category}/${plan.target.name}`;
    if (targets.has(key)) {
      problems.push(
        `${key} is replaced by two inbox files: ${targets.get(key)} and ${plan.fileName}`,
      );
    }
    targets.set(key, plan.fileName);
  }
  await resolveSidecars(plans);
  if (problems.length > 0) {
    throw new Error(`sprites: nothing replaced\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  }

  const stamp = localStamp(now);
  const archiveFolder = path.join(archiveDir, stamp);
  if (dryRun) {
    return { replaced: plans.map(describe), archiveFolder };
  }

  // Swap: old files to the archive, new ones into place. Every move is
  // recorded so a failed validation can undo exactly what happened.
  const undo = [];
  try {
    for (const plan of plans) {
      const targetDir = path.dirname(plan.target.filePath);
      const archivedDir = path.join(archiveFolder, plan.target.bucketId, path.basename(targetDir));
      await mkdir(archivedDir, { recursive: true });
      const keptSidecar = plan.keepOldSidecar ? await readFile(plan.oldSidecarPath) : null;
      for (const oldPath of plan.oldFiles) {
        const archived = path.join(archivedDir, path.basename(oldPath));
        await rename(oldPath, archived);
        undo.push(() => rename(archived, oldPath));
      }
      if (keptSidecar !== null) {
        const sidecarPath = path.join(targetDir, `${plan.newBase}${ANIM_SUFFIX}`);
        await writeFile(sidecarPath, keptSidecar);
        undo.push(() => rm(sidecarPath));
      }
      for (const newFile of plan.newFiles) {
        const placed = path.join(targetDir, path.basename(newFile));
        await copyFile(newFile, placed);
        undo.push(() => rm(placed));
      }
    }
    await buildAtlases({ rootDir, outDir: '', write: false });
  } catch (error) {
    for (const step of undo.reverse()) {
      await step();
    }
    await rm(archiveFolder, { recursive: true, force: true });
    const reason =
      error instanceof AtlasBuildError || error instanceof Error ? error.message : String(error);
    throw new Error(
      `sprites: nothing replaced, the new art does not pass the art pipeline\n${reason}`,
    );
  }

  const replaced = plans.map(describe);
  await writeFile(
    path.join(archiveFolder, 'REPLACED.txt'),
    `Replaced ${now.toISOString()}\n\n${replaced.map((line) => `- ${line}`).join('\n')}\n`,
  );
  for (const plan of plans) {
    for (const newFile of plan.newFiles) {
      await rm(newFile);
    }
  }
  await removeEmptyFolders(inboxDir);
  return { replaced, archiveFolder };
}

function describe(plan) {
  const where = `${plan.target.bucketId}/${path.basename(path.dirname(plan.target.filePath))}`;
  const old = plan.oldFiles.map((file) => path.basename(file)).join(' + ');
  const added = plan.newFiles.map((file) => path.basename(file)).join(' + ');
  return `${where}: ${old} -> ${added}`;
}

/** Every inbox file worth acting on, with the bucket its subfolder names (if any). */
async function listInbox(inboxDir) {
  const found = [];
  const walk = async (dir, parts) => {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full, [...parts, entry.name]);
      } else if (entry.name.endsWith('.png')) {
        found.push({ filePath: full, fileName: entry.name, folders: parts });
      }
    }
  };
  await walk(inboxDir, []);
  return found;
}

function planReplacement(file, existing) {
  const isStrip = file.fileName.endsWith(STRIP_SUFFIX);
  const fileBase = file.fileName.slice(0, -(isStrip ? STRIP_SUFFIX : '.png').length);
  const { name } = parseDensity(fileBase);

  let candidates = existing.filter((sprite) => sprite.name === name);
  if (file.folders.length > 0) {
    candidates = candidates.filter((sprite) =>
      file.folders.every(
        (folder) =>
          folder === sprite.bucketId || folder === path.basename(path.dirname(sprite.filePath)),
      ),
    );
  }
  if (candidates.length === 0) {
    return `no existing sprite named "${name}" to replace (this script only replaces sprites)`;
  }
  if (candidates.length > 1) {
    const where = candidates.map((sprite) => sprite.bucketId).join(', ');
    return `"${name}" exists in more than one bucket (${where}) — put it in a subfolder named after the bucket`;
  }
  const target = candidates[0];
  const targetIsStrip = target.animation !== null;
  if (isStrip !== targetIsStrip) {
    return targetIsStrip
      ? `"${name}" is an animation strip — the replacement has to be ${fileBase}${STRIP_SUFFIX}`
      : `"${name}" is a single image — the replacement has to be ${fileBase}.png, not a strip`;
  }

  const targetDir = path.dirname(target.filePath);
  const oldBase = path
    .basename(target.filePath)
    .slice(0, -(targetIsStrip ? STRIP_SUFFIX : '.png').length);
  const oldFiles = [target.filePath];
  const newFiles = [file.filePath];
  let keepOldSidecar = false;
  const oldSidecarPath = path.join(targetDir, `${oldBase}${ANIM_SUFFIX}`);
  if (isStrip) {
    oldFiles.push(oldSidecarPath);
    const newSidecar = path.join(path.dirname(file.filePath), `${fileBase}${ANIM_SUFFIX}`);
    newFiles.push(newSidecar);
    keepOldSidecar = true;
  }
  return {
    fileName: file.fileName,
    target,
    oldFiles,
    newFiles,
    newBase: fileBase,
    keepOldSidecar,
    oldSidecarPath,
  };
}

/** Drops a strip's sidecar from `newFiles` when the inbox has none, so the old one is carried over. */
async function resolveSidecars(plans) {
  for (const plan of plans) {
    const sidecar = plan.newFiles.find((file) => file.endsWith(ANIM_SUFFIX));
    if (sidecar === undefined) {
      continue;
    }
    const exists = await stat(sidecar).then(
      () => true,
      () => false,
    );
    if (exists) {
      plan.keepOldSidecar = false;
    } else {
      plan.newFiles = plan.newFiles.filter((file) => file !== sidecar);
    }
  }
}

async function removeEmptyFolders(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const full = path.join(dir, entry.name);
      await removeEmptyFolders(full);
      if ((await readdir(full)).length === 0) {
        await rm(full, { recursive: true });
      }
    }
  }
}

/** `2026-10-01_14-45-44` in local time — the folder name the person looking for it expects. */
function localStamp(date) {
  const two = (value) => String(value).padStart(2, '0');
  return (
    `${String(date.getFullYear())}-${two(date.getMonth() + 1)}-${two(date.getDate())}_` +
    `${two(date.getHours())}-${two(date.getMinutes())}-${two(date.getSeconds())}`
  );
}
