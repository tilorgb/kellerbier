/**
 * Folds a finished Vite build down to one HTML file that plays by being
 * double-clicked.
 *
 * ## Why one file rather than a folder
 *
 * The obvious shape for "a build I can give a friend" is the `dist/` folder
 * zipped up. It does not work, and the way it fails is worth writing down
 * because it looks like it should:
 *
 * - `<script type="module">` is fetched under CORS *even from `file://`*. A
 *   browser opening a local `index.html` treats the page as an opaque origin,
 *   so the module request is cross-origin and blocked. The page loads to a
 *   black screen and a console error, which is the worst possible thing to
 *   hand somebody who is doing you a favour by trying your game.
 * - Switching to a classic `<script>` gets past that, but not past the next
 *   one: every PNG next to it is then a cross-origin image, and feeding a
 *   cross-origin image to `texImage2D` throws a security error. The atlases
 *   *are* the game's art.
 * - `fetch()` of a `file://` URL is blocked outright, which is how
 *   `app/audio/sample-player.ts` reads the music.
 *
 * Every one of those disappears if there is nothing to fetch. A `data:` URI is
 * same-origin by definition, so textures upload and `fetch()` resolves; a
 * classic inline script is not fetched at all. Hence: one file, one classic
 * script, every asset inlined by `assetsInlineLimit`.
 *
 * The cost is honest and it is paid once — base64 is a third larger than the
 * bytes it carries, and the whole thing is read off local disk in the time it
 * takes to open a window. It is the wrong trade for the hosted build, which is
 * why `npm run build` is untouched and still emits a normal folder for
 * itch.io and the CI preview to serve.
 *
 * ## What it actually does
 *
 * Runs in `generateBundle`, after Vite has emitted everything: inlines the
 * single JS chunk and any CSS into the HTML, drops them from the bundle, and
 * renames the page to something a person can recognise in a downloads folder.
 * It asserts there is exactly one chunk rather than quietly shipping half a
 * game — `inlineDynamicImports` is what guarantees that, and a config change
 * that breaks the guarantee should fail the build, not the player.
 */

import { readFileSync } from 'node:fs';

/**
 * `</script` inside a string literal ends the inline script tag, whatever the
 * JavaScript means by it — the HTML parser never gets as far as asking. The
 * escape is invisible to JavaScript (`'<\/script'` is `'</script'`) and
 * invisible to the HTML parser, which is the only pair of readers involved.
 */
function escapeForInlineScript(code) {
  return code.replace(/<\/(script)/gi, '<\\/$1');
}

/**
 * `String.prototype.replace` reads `$&`, `` $` ``, `$'` and `$1` out of a
 * *replacement string* — so passing a minified bundle in as one silently
 * rewrites it. three.js is the file that finds this: its property-binding
 * regex is built from a literal `` `$` ``, which as a replacement pattern
 * means "every character before the match", and duly spliced the first half of
 * the HTML document into the middle of the JavaScript. The page threw
 * `missing ) after argument list` and never booted — a failure that only ever
 * shows up in the release build, in the browser, at the very end of the
 * pipeline.
 *
 * A replacer *function* is not scanned for those patterns at all. Every
 * inlining below goes through this rather than through `replace` directly.
 */
function replaceOnce(haystack, pattern, replacement) {
  return haystack.replace(pattern, () => replacement);
}

export function singleFilePlugin({ fileName = 'Kellerbier.html', readme } = {}) {
  return {
    name: 'kellerbier:single-file',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const entries = Object.entries(bundle);
      const html = entries.find(([name]) => name.endsWith('.html'));
      if (html === undefined) {
        throw new Error('single-file: the build emitted no HTML page to inline into');
      }
      const chunks = entries.filter(([, output]) => output.type === 'chunk');
      if (chunks.length !== 1) {
        throw new Error(
          `single-file: expected exactly one JS chunk, got ${String(chunks.length)} ` +
            `(${chunks.map(([name]) => name).join(', ')}). ` +
            'Code splitting has to be off for a single-file build — see ' +
            '`inlineDynamicImports` in vite.release.config.ts.',
        );
      }
      const css = entries.filter(([name]) => name.endsWith('.css'));

      const [chunkName, chunk] = chunks[0];
      const [htmlName, page] = html;

      let source = String(page.source);

      // The script tag Vite wrote, whatever hash it gave the chunk and
      // whichever attributes it added (`type="module"`, `crossorigin`). It
      // becomes a classic inline script: no fetch, no CORS, nothing to fail.
      const scriptTag = new RegExp(
        `<script\\b[^>]*\\ssrc=["'][^"']*${chunkName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>\\s*</script>`,
        'i',
      );
      if (!scriptTag.test(source)) {
        throw new Error(`single-file: no <script> in ${htmlName} referencing ${chunkName}`);
      }
      // Removed from where it was, and re-inserted at the end of `<body>`.
      // Position matters now in a way it did not before: `vite build` hoists
      // the entry into `<head>`, which is harmless for a module (deferred by
      // definition, so the document is parsed before it runs) and fatal for a
      // classic script (runs where it stands, so `boot`'s very first line
      // threw `Missing #game host element in index.html` against a `<body>`
      // that did not exist yet).
      source = replaceOnce(source, scriptTag, '');
      const inlined = `<script>${escapeForInlineScript(chunk.code)}</script>`;
      const bodyEnd = source.lastIndexOf('</body>');
      source =
        bodyEnd === -1
          ? source + inlined
          : `${source.slice(0, bodyEnd)}${inlined}\n  ${source.slice(bodyEnd)}`;

      // Preload hints for files that no longer exist as files.
      source = source.replace(/<link\b[^>]*rel=["']modulepreload["'][^>]*>\s*/gi, '');

      for (const [name, asset] of css) {
        source = replaceOnce(
          source,
          new RegExp(
            `<link\\b[^>]*href=["'][^"']*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>`,
            'i',
          ),
          `<style>${String(asset.source)}</style>`,
        );
        delete bundle[name];
      }

      delete bundle[chunkName];
      delete bundle[htmlName];
      this.emitFile({ type: 'asset', fileName, source });

      // The note that goes in the folder next to it. A plain text file rather
      // than anything in the page, because the questions it answers — is there
      // an installer, what are the keys, how much of the game is this — are
      // the ones somebody has before they open it.
      if (readme !== undefined) {
        this.emitFile({
          type: 'asset',
          fileName: 'READ-ME.txt',
          source: readFileSync(readme, 'utf8'),
        });
      }
    },
  };
}
