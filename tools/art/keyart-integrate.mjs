import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The deterministic half of the key-art pipeline (#322), same split as
 * `diffusion-postprocess.mjs`'s relationship to pixel-bench: the GPU-bound
 * generator (`D:\repos\ComfyUI\keyart-bench`) never enters this repo, but
 * turning a chosen candidate into a committed asset is plain crop/resize —
 * no model, no business living next to one — so it lives here as source.
 *
 * Unlike the sprite pipeline there is no palette-quantize step: this is
 * full-bleed illustration, not an atlas tile, and it is meant to keep its
 * continuous-tone gradients. The only job here is "crop to the right aspect,
 * resize, save into assets/art/" — the actual pixel work happens client-side
 * on a <canvas>, since the browser's own `drawImage` scaling is exactly the
 * resize this needs and re-implementing it in Node would just be slower and
 * less tested.
 *
 * Run with `node tools/art/keyart-integrate.mjs`, then open the printed URL.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const ASSETS_ART_DIR = path.join(REPO_ROOT, 'assets', 'art');
const PORT = 8399;

/**
 * Mirrors `keyart-bench`'s own `PRESETS` (kept as a separate copy on
 * purpose — same reasoning as `pixel-bench/postprocess.mjs`'s duplicated
 * `MASTER_PALETTE`: this tool lives in a different repo from the generator
 * and importing across that boundary isn't worth the coupling). These are a
 * *guide* for what aspect ratio to crop toward, not a contract the renderer
 * depends on — `TitleScreen.setPoster` contain-fits whatever it gets.
 */
const PRESETS = {
  title: { width: 1216, height: 832, label: 'Title screen', defaultName: 'backdrop.png' },
  chapterCard: { width: 1152, height: 896, label: 'Chapter card', defaultName: 'card.png' },
  bossPlate: { width: 1344, height: 768, label: 'Boss plate', defaultName: 'plate.png' },
  mangaPanel: { width: 832, height: 1216, label: 'Manga panel', defaultName: 'panel.png' },
};

function sanitizeSegment(value, fallback) {
  const cleaned = String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_.-]/g, '');
  return cleaned || fallback;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');

    if (req.method === 'GET' && url.pathname === '/') {
      const html = await readFile(path.join(HERE, 'keyart-integrate.html'));
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/presets') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(PRESETS));
      return;
    }

    // Streams a local PNG so an <img> in the page can load a candidate that
    // lives outside this server's own directory (typically ComfyUI's output
    // folder). This tool is bound to 127.0.0.1 only — see the bottom of this
    // file — so this is a convenience, not a hardened file-serving endpoint.
    if (req.method === 'GET' && url.pathname === '/source') {
      const rawPath = url.searchParams.get('path') ?? '';
      if (!rawPath || path.extname(rawPath).toLowerCase() !== '.png') {
        res.writeHead(400);
        res.end('expected ?path=<absolute .png path>');
        return;
      }
      const buf = await readFile(rawPath);
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(buf);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/save') {
      const category = sanitizeSegment(url.searchParams.get('category'), 'title');
      const filename = sanitizeSegment(url.searchParams.get('filename'), 'backdrop.png');
      const finalName = filename.toLowerCase().endsWith('.png') ? filename : `${filename}.png`;

      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const pngBuffer = Buffer.concat(chunks);
      if (pngBuffer.length === 0) {
        throw new Error('empty upload — nothing to save');
      }

      const destDir = path.join(ASSETS_ART_DIR, category);
      await mkdir(destDir, { recursive: true });
      const destPath = path.join(destDir, finalName);
      await writeFile(destPath, pngBuffer);

      const relPath = path.relative(REPO_ROOT, destPath).split(path.sep).join('/');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ savedTo: relPath, bytes: pngBuffer.length }));
      return;
    }

    res.writeHead(404);
    res.end('not found');
  } catch (err) {
    console.error(err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
  }
});

await mkdir(ASSETS_ART_DIR, { recursive: true });
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Key Art Integrate ready: http://127.0.0.1:${PORT}`);
});
