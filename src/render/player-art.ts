import { cutStrip, loadAtlasSheets, type LoadedStrip } from './floor-art.js';
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
 * Cut from the `common` atlas sheet the same way `floor-art.ts` cuts every
 * other strip (#294) — `loadAtlasSheets()` is shared with it so the sheet is
 * fetched once regardless of which of the two loaders asks first.
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

const ALOIS_FRAME_PATTERN = /^character\/alois-([a-z-]+)$/;

export async function loadPlayerArt(): Promise<PlayerArt> {
  const strips: Record<string, LoadedStrip> = {};
  const sheets = await loadAtlasSheets();
  for (const { manifest, sheet } of sheets) {
    for (const [key, frame] of Object.entries(manifest.frames)) {
      const suffix = ALOIS_FRAME_PATTERN.exec(key)?.[1];
      if (suffix === undefined) {
        continue;
      }
      if (frame.animation === undefined) {
        // Unreachable through the art pipeline — `tools/art/scan.mjs` fails the
        // build on a strip with no sidecar. Thrown rather than skipped for the
        // same reason `floor-art.ts` throws: a player sprite the game quietly
        // declines to animate is the failure this issue exists to remove.
        throw new Error(`alois-${suffix} has no alois-${suffix}.anim.json sidecar`);
      }
      const texture = sheet.sub(frame.x, frame.y, frame.width, frame.height);
      strips[suffix] = cutStrip(`alois-${suffix}`, texture, frame.animation);
    }
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
