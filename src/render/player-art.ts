import { Assets, type Texture } from 'pixi.js';
import { cutStrip, type LoadedStrip } from './floor-art.js';
import type { AnimationSidecar } from './animation/definition.js';
import { PLAYER_FACING_IDS, type PlayerFacingId } from './animation/state.js';

/**
 * Alois's own art (#151), loaded out of `assets/sprites/common/characters/`.
 *
 * Seven strips rather than one, and the split is the shape of the problem
 * rather than a filing preference:
 *
 * - **One per body direction.** `alois-south`, `alois-north`, `alois-side`.
 *   The sidecar format's clip names are fixed (`idle`, `move`, `telegraph`,
 *   `hurt`, `death`) precisely so a clip nothing plays is a typo rather than a
 *   feature, which means "the same clip, facing the other way" cannot be a
 *   clip. It can be a strip, though, at no cost to the format and none to the
 *   build — every one of these is validated, compiled and animated by exactly
 *   the code #150 already wrote for the Kellerassel.
 * - **One per direction again, drunk.** Promille's alternate idle and looser
 *   walk (`docs/GAME_DESIGN.md` §5) are different *poses*, not a different
 *   playback speed, so they are different frames; same argument as above for
 *   why that makes them a strip.
 * - **One for the Schlauch**, the drinking hose the shots come out of, in its
 *   eight aim directions. This one is a frame *table* rather than a timeline:
 *   the game indexes it by aim octant and by whether a shot just left it,
 *   never plays it. Its sidecar therefore authors no `clips` at all — legal,
 *   and honest about there being nothing to play (see
 *   `assets/sprites/README.md`).
 *
 * Found by `import.meta.glob` for the same reason `floor-art.ts` finds enemy
 * strips that way: adding or re-cutting one is dropping files in a folder.
 */
export interface PlayerArt {
  /** Body strips by facing, sober and drunk. */
  readonly body: Readonly<Record<PlayerBodyKey, LoadedStrip>>;
  /** The Schlauch's eight aim directions, resting (0-7) then firing (8-15). */
  readonly schlauch: LoadedStrip;
}

/** `south`, `north`, `side`, and each of those again as `drunk-...`. */
export type PlayerBodyKey = PlayerFacingId | `drunk-${PlayerFacingId}`;

export const PLAYER_BODY_KEYS: readonly PlayerBodyKey[] = [
  ...PLAYER_FACING_IDS,
  ...PLAYER_FACING_IDS.map((facing) => `drunk-${facing}` as const),
];

/** How many aim directions the Schlauch is authored in, resting and firing alike. */
export const SCHLAUCH_OCTANTS = 8;

const STRIP_URLS: Record<string, string> = import.meta.glob(
  '../../assets/sprites/common/characters/alois-*.strip.png',
  { eager: true, query: '?url', import: 'default' },
);

const STRIP_SIDECARS: Record<string, AnimationSidecar> = import.meta.glob(
  '../../assets/sprites/common/characters/alois-*.anim.json',
  { eager: true, import: 'default' },
);

const STRIP_PATH_PATTERN = /\/characters\/alois-([a-z-]+)\.strip\.png$/;

export async function loadPlayerArt(): Promise<PlayerArt> {
  const strips: Record<string, LoadedStrip> = {};
  for (const [path, url] of Object.entries(STRIP_URLS)) {
    const suffix = STRIP_PATH_PATTERN.exec(path)?.[1];
    if (suffix === undefined) {
      continue;
    }
    const sidecar = STRIP_SIDECARS[path.replace('.strip.png', '.anim.json')];
    if (sidecar === undefined) {
      // Unreachable through the art pipeline — `tools/art/scan.mjs` fails the
      // build on a strip with no sidecar. Thrown rather than skipped for the
      // same reason `floor-art.ts` throws: a player sprite the game quietly
      // declines to animate is the failure this issue exists to remove.
      throw new Error(`alois-${suffix}.strip.png has no alois-${suffix}.anim.json sidecar`);
    }
    const base = await Assets.load<Texture>({ src: url, data: { scaleMode: 'nearest' } });
    strips[suffix] = cutStrip(`alois-${suffix}`, base, sidecar);
  }

  const body: Partial<Record<PlayerBodyKey, LoadedStrip>> = {};
  for (const key of PLAYER_BODY_KEYS) {
    const strip = strips[key];
    if (strip === undefined) {
      // #7/#19's line, on the "wrong" side of it: a *missing direction* is not
      // a content gap the run can degrade past — there is no nearest authored
      // alternative to fall back to that would not have Alois walking north
      // while drawn walking south. It is a file that should be there.
      throw new Error(`missing player strip alois-${key}.strip.png`);
    }
    body[key] = strip;
  }

  const schlauch = strips.schlauch;
  if (schlauch === undefined) {
    throw new Error('missing player strip alois-schlauch.strip.png');
  }
  if (schlauch.frames.length !== SCHLAUCH_OCTANTS * 2) {
    throw new Error(
      `alois-schlauch.strip.png has ${String(schlauch.frames.length)} frames; the aim table ` +
        `needs ${String(SCHLAUCH_OCTANTS * 2)} — ${String(SCHLAUCH_OCTANTS)} resting then ` +
        `${String(SCHLAUCH_OCTANTS)} firing`,
    );
  }

  return { body: body as Record<PlayerBodyKey, LoadedStrip>, schlauch };
}
