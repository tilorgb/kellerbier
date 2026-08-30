/**
 * The migration chain (#45).
 *
 * A migration takes the raw parsed JSON of schema version `N` and returns raw
 * JSON shaped like schema version `N + 1`. `runMigrations` walks the chain
 * from whatever version a save claims up to `SAVE_SCHEMA_VERSION`, so a save
 * written by an old build upgrades instead of getting discarded.
 *
 * The chain is **indexed by version**: `MIGRATIONS[i]` takes a save at
 * version `i` to version `i + 1`, so its length is always the newest schema
 * version. That is why a v0 step exists below even though no unversioned save
 * was ever written — index 0 cannot be a hole without every later migration
 * running one version early.
 *
 * `SAVE_KEY` stays `kellerbier.save.v1` across all of this on purpose: the
 * version in the *key* is the storage generation (which slot in
 * `localStorage` a save lives in), and the `schemaVersion` in the *blob* is
 * what this chain reads. Bumping the key instead of migrating is how progress
 * gets silently abandoned, which is the failure #45 exists to prevent.
 */
export type SaveMigration = (raw: Record<string, unknown>) => Record<string, unknown>;

/**
 * v0 -> v1: an unversioned blob under `SAVE_KEY`.
 *
 * No such save was ever written — the key and `schemaVersion: 1` shipped
 * together in #45 — so this only stamps the version and hands every field on
 * untouched, leaving `sanitizeSave` to fill in whatever is missing. It exists
 * to hold index 0, per the chain's own indexing rule above.
 */
const v0ToV1: SaveMigration = (raw) => ({ ...raw, schemaVersion: 1 });

/**
 * v1 -> v2 (#46): the Stammtisch's two stores.
 *
 * `lastRun` is back-filled from the most recently *recorded* entry in
 * `bestRuns` rather than left null. It is an approximation — `bestRuns` keeps
 * the ten longest runs, so a v1 tester's genuinely last run may have been too
 * short to make the list — but it is the honest best guess from what v1
 * stored, and it means an upgraded save walks into a Stammtisch whose
 * regulars have something to say about a real run instead of greeting a
 * veteran as though they had never played.
 */
const v1ToV2: SaveMigration = (raw) => {
  const bestRuns = Array.isArray(raw.bestRuns) ? raw.bestRuns : [];
  let latest: Record<string, unknown> | null = null;
  for (const entry of bestRuns) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      continue;
    }
    const record = entry as Record<string, unknown>;
    const recordedAt = typeof record.recordedAt === 'number' ? record.recordedAt : 0;
    const best = typeof latest?.recordedAt === 'number' ? latest.recordedAt : -1;
    if (recordedAt > best) {
      latest = record;
    }
  }
  return { ...raw, schemaVersion: 2, lastRun: latest, greetedRegulars: [] };
};

/**
 * v2 -> v3 (#85): the in-progress run learns whether it is sober.
 *
 * Back-filled `true` rather than read off `unlocks`, and the distinction
 * matters. Every run recorded by a pre-#85 build *was* a promilled one —
 * `GameSim.promilleUnlocked` defaulted to `true` and nothing set it — so
 * `true` reconstructs the run that was actually saved. Deriving it from the
 * save's unlock set instead would resume a v2 tester's in-progress run with
 * the beer stripped out of it purely because they had never beaten Der
 * Stier, which is the exact divergence `ActiveRunSave.promilleUnlocked`
 * exists to prevent.
 *
 * A save with no run in progress migrates to a `null` `activeRun` untouched;
 * `sanitizeSave` is what turns anything else unparseable into `null`.
 */
const v2ToV3: SaveMigration = (raw) => {
  const active = raw.activeRun;
  if (typeof active !== 'object' || active === null || Array.isArray(active)) {
    return { ...raw, schemaVersion: 3 };
  }
  return {
    ...raw,
    schemaVersion: 3,
    activeRun: { ...(active as Record<string, unknown>), promilleUnlocked: true },
  };
};

/**
 * v3 -> v4 (#47): the character the next run starts as, and the one the run
 * in progress is already being played as.
 *
 * Both back-fill to Alois, which is both the only character a pre-#47 save
 * could have played and the fallback `selectedCharacterId` would pick
 * anyway — written explicitly so a v4 save always *has* the fields rather
 * than relying on the sanitiser to keep filling them in forever. The
 * `activeRun` half follows #85's v2 → v3 step exactly: a run parameter
 * belongs with the log it describes, not with the save's current opinion.
 */
const v3ToV4: SaveMigration = (raw) => {
  const active = raw.activeRun;
  const upgraded = { ...raw, schemaVersion: 4, selectedCharacter: 'alois' };
  if (typeof active !== 'object' || active === null || Array.isArray(active)) {
    return upgraded;
  }
  return {
    ...upgraded,
    activeRun: { ...(active as Record<string, unknown>), character: 'alois' },
  };
};

export const MIGRATIONS: readonly SaveMigration[] = [v0ToV1, v1ToV2, v2ToV3, v3ToV4];

function versionOf(raw: Record<string, unknown>): number {
  const version = raw.schemaVersion;
  return typeof version === 'number' && Number.isInteger(version) && version >= 0 ? version : 0;
}

/**
 * Applies every migration from `raw`'s own `schemaVersion` up to
 * `migrations.length`, in order. Exported as a standalone function (rather
 * than only via the fixed `MIGRATIONS` chain) so a test can exercise the
 * runner against its own small, synthetic chain without needing a real
 * historical schema version to exist yet.
 *
 * Anything that isn't a plain object (a corrupt primitive, `null`, an array)
 * is handed back unchanged — `schema.ts`'s `sanitizeSave` is what turns that
 * into a playable default afterwards, not this.
 */
export function runMigrations(raw: unknown, migrations: readonly SaveMigration[]): unknown {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return raw;
  }
  let data = raw as Record<string, unknown>;
  let version = versionOf(data);
  while (version < migrations.length) {
    const migrate = migrations[version];
    if (migrate === undefined) {
      break;
    }
    data = migrate(data);
    version += 1;
  }
  return data;
}

/** Runs `raw` through the project's real migration chain. */
export function migrateSave(raw: unknown): unknown {
  return runMigrations(raw, MIGRATIONS);
}
