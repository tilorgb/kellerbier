/**
 * Which of the three builds this code is running in.
 *
 * `import.meta.env.DEV` already separates two of them — the dev server from
 * everything Rollup minifies — and that split is what compiles `src/debug/`
 * out (`app/main.ts`'s `mountDebugOverlay`). It is deliberately *not* enough
 * for a build handed to a player, because the CI preview
 * (`.github/workflows/ci.yml`'s `preview` job) is a production build that is
 * supposed to keep the room/sprite/audio editors and the playtest keys:
 * `editor-dock.ts`'s own doc comment says so in as many words. A player build
 * wants the opposite of that.
 *
 * So there are three, not two:
 *
 * | build | `import.meta.env.DEV` | `IS_RELEASE_BUILD` | what it is |
 * |---|---|---|---|
 * | `npm run dev` | `true` | `false` | everything |
 * | `npm run build` | `false` | `false` | the CI playable preview: editors and playtest keys, no debug overlay |
 * | `npm run build:release` | `false` | `true` | the game, and nothing else |
 *
 * `__KELLERBIER_RELEASE__` is a `define` (`vite.config.ts`, overridden by
 * `vite.release.config.ts`), so every `IS_RELEASE_BUILD` branch folds to a
 * constant at build time and the unreachable side is dropped — the same
 * mechanism that removes the debug overlay, which is why the editor dock's
 * import has to be dynamic to actually leave the bundle rather than merely go
 * unused.
 *
 * The `typeof` guard is not defensive noise: the define folds it to
 * `typeof false === 'boolean'` and the minifier collapses the whole
 * expression, while any runner that forgot the define (a bare `vitest` on a
 * config that does not spread `vite.config.ts`) gets `false` instead of a
 * `ReferenceError` at module load.
 */
declare const __KELLERBIER_RELEASE__: boolean;

export const IS_RELEASE_BUILD: boolean =
  typeof __KELLERBIER_RELEASE__ === 'boolean' ? __KELLERBIER_RELEASE__ : false;

declare const __KELLERBIER_DEBUG__: boolean;

/**
 * The debug build (`vite.debug.config.ts`, written by `npm run build:release`
 * next to the release as `Kellerbier-debug.html`): the release, plus the spawn
 * panel (`debug/spawn-panel.ts`). Same `typeof` guard as above.
 */
export const IS_DEBUG_BUILD: boolean =
  typeof __KELLERBIER_DEBUG__ === 'boolean' ? __KELLERBIER_DEBUG__ : false;

declare const __KELLERBIER_COMMIT__: string;

/**
 * Which build this is, for telemetry (#361): the short commit it was made
 * from, so runs played before a balance change can be told from runs played
 * after it. The dev server appends `-dev` — a run from `npm run dev` is on a
 * working tree that may not match any commit, and should never be mistaken
 * for a tester's. Same `typeof` guard as above, for the same reason.
 */
const BUILD_COMMIT: string =
  typeof __KELLERBIER_COMMIT__ === 'string' ? __KELLERBIER_COMMIT__ : 'unknown';

export const BUILD_ID: string = import.meta.env.DEV ? `${BUILD_COMMIT}-dev` : BUILD_COMMIT;

declare const __KELLERBIER_PLAYTEST__: boolean;

/**
 * True only in the build the Pages root serves to playtesters
 * (`vite.tester.config.ts`): the welcome screen and the post-run questions
 * (`app/playtest/`) belong to a test, not to the game a player buys.
 * `?playtest` on the URL turns it on in any other build, so the flow can be
 * tried from `npm run dev` or a PR preview without a special build.
 */
export const IS_PLAYTEST_BUILD: boolean =
  typeof __KELLERBIER_PLAYTEST__ === 'boolean' ? __KELLERBIER_PLAYTEST__ : false;

/** Whether this session runs the playtest flow: the tester build, or any build opened with `?playtest`. */
export function isPlaytestSession(search: string = window.location.search): boolean {
  return IS_PLAYTEST_BUILD || new URLSearchParams(search).has('playtest');
}

/**
 * Whether `?floor=N` (start a sandbox run on a later floor, `app/start-floor.ts`)
 * is honoured: `npm run dev` and the reviewer build the CI publishes for a
 * pull request, never the tester build or the release build. A playtester
 * must not be able to skip content by editing a URL, and a release must not
 * ship a skip-ahead.
 */
export const FLOOR_SKIP_ENABLED: boolean =
  import.meta.env.DEV || (!IS_PLAYTEST_BUILD && !IS_RELEASE_BUILD);

/**
 * Whether `?nocards` is honoured: `npm run dev` only. It leaves out the story
 * card, the floor title card and the boss intro plate, so a hands-on test of a
 * fight or a floor starts at the fight, not three screens before it. It never
 * marks a story beat seen, and nothing in a built game reads it.
 */
export const INTRO_CARDS_SKIPPABLE: boolean = import.meta.env.DEV;

/** Whether this session leaves the intro cards out: dev builds opened with `?nocards`. */
export function skipsIntroCards(
  search: string = window.location.search,
  enabled: boolean = INTRO_CARDS_SKIPPABLE,
): boolean {
  return enabled && new URLSearchParams(search).has('nocards');
}

/**
 * Whether `?nebel` forces the Nebel veil on (`render/nebel-veil.ts`) whatever
 * the floor's curse — a dev-only preview, so the look can be judged without
 * waiting for the curse roll. Nothing in a built game reads it.
 */
export function forcesNebelVeil(
  search: string = window.location.search,
  enabled: boolean = import.meta.env.DEV,
): boolean {
  return enabled && new URLSearchParams(search).has('nebel');
}
