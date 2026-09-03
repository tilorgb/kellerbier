/**
 * The static index of every recorded audio file under `assets/audio/` —
 * the sample counterpart of `pixel-editor/static-sprite-index.ts`'s
 * `PNG_URLS`. `import.meta.glob` resolves this at build time, so it works
 * identically under `vite dev` and in the CI-published static preview
 * build: nothing here needs a server to list or load an already-saved
 * recording, only `tools/audio-editor/server.mjs`'s upload endpoint (dev
 * only) needs one, to write a *new* file.
 *
 * `assetId` is a file's name without its extension — `'main-theme.wav'` and
 * `'main-theme.mp3'` would collide on that id, which `tools/audio-editor
 * /server.mjs`'s upload endpoint refuses for the same reason a sprite
 * bucket refuses two files claiming the same name.
 */

const AUDIO_URLS: Record<string, string> = import.meta.glob(
  '../../../assets/audio/*.{wav,mp3,ogg}',
  {
    eager: true,
    query: '?url',
    import: 'default',
  },
);

const ASSET_PATH_PATTERN = /\/([^/]+)\.(wav|mp3|ogg)$/i;

const URL_BY_ASSET_ID: ReadonlyMap<string, string> = new Map(
  Object.entries(AUDIO_URLS).flatMap(([path, url]) => {
    const match = ASSET_PATH_PATTERN.exec(path);
    return match?.[1] === undefined ? [] : [[match[1], url] as const];
  }),
);

/** A recorded asset's playable URL, or `undefined` if `assetId` names no file under `assets/audio/`. */
export function getAudioAssetUrl(assetId: string): string | undefined {
  return URL_BY_ASSET_ID.get(assetId);
}

/** Every recorded asset id currently on disk — the audio editor's upload panel uses this to warn before silently overwriting one. */
export function listAudioAssetIds(): readonly string[] {
  return [...URL_BY_ASSET_ID.keys()];
}
