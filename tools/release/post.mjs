/**
 * Turns a release-notes file into the text to paste into itch.io's devlog editor.
 *
 * Usage:
 *   npm run release:post                      newest file in docs/releases/
 *   npm run release:post -- 2026-10-08.md     a named one
 *   npm run release:post -- --no-copy         print only, leave the clipboard alone
 *
 * itch.io's devlog takes the title in its own field and the body as Markdown, so
 * this splits the file that way: the `# headline` becomes the title (printed
 * first, on stderr), and everything else becomes the body (printed on stdout and
 * copied to the clipboard) minus what a reader must not see — the `Build:` line,
 * HTML comments, and any section left empty. Pure text in, text out: it never
 * touches itch.io.
 */

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../../docs/releases/', import.meta.url));

/** `{ title, body }` for one release-notes file's text. */
export function devlogPost(source) {
  const lines = source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((line) => !/^Build:/.test(line));
  const heading = lines.findIndex((line) => /^# /.test(line));
  if (heading === -1) throw new Error('no "# headline" line to use as the post title');
  const title = lines[heading].slice(2).trim();
  const rest = lines.filter((_, index) => index !== heading);

  // Drop a `## Section` whose body is empty (only blank lines before the next section or the end).
  const kept = [];
  for (let i = 0; i < rest.length; i++) {
    if (/^## /.test(rest[i])) {
      let next = i + 1;
      while (next < rest.length && rest[next].trim() === '') next++;
      if (next >= rest.length || /^## /.test(rest[next])) continue;
    }
    kept.push(rest[i]);
  }
  const body = kept
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { title, body };
}

function copy(text) {
  try {
    if (process.platform === 'win32') {
      execFileSync('clip', { input: Buffer.from('﻿' + text, 'utf16le') });
    } else if (process.platform === 'darwin') {
      execFileSync('pbcopy', { input: text });
    } else {
      execFileSync('xclip', ['-selection', 'clipboard'], { input: text });
    }
    return true;
  } catch {
    return false;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const noCopy = args.includes('--no-copy');
  const named = args.find((arg) => !arg.startsWith('--'));
  const file =
    named ??
    readdirSync(dir)
      .filter((name) => /^\d{4}-\d{2}-\d{2}.*\.md$/.test(name))
      .sort()
      .at(-1);
  if (file === undefined) {
    console.error('no release notes in docs/releases/');
    process.exit(1);
  }
  const { title, body } = devlogPost(readFileSync(join(dir, file), 'utf8'));
  console.error(
    `${file}\nTitle: ${title}\n${noCopy ? '' : copy(body) ? '(body copied to the clipboard)' : '(clipboard unavailable; copy the text below)'}\n`,
  );
  process.stdout.write(body + '\n');
}
