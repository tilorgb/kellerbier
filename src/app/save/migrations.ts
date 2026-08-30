/**
 * The migration chain (#45).
 *
 * A migration takes the raw parsed JSON of schema version `N` and returns raw
 * JSON shaped like schema version `N + 1`. `runMigrations` walks the chain
 * from whatever version a save claims up to `SAVE_SCHEMA_VERSION`, so a save
 * written by an old build upgrades instead of getting discarded.
 *
 * `MIGRATIONS` is empty today — this is schema v1, the first version this
 * project has ever shipped, so there is nothing to migrate *from* yet. The
 * chain is built and tested now anyway, per this issue's own point: shipping
 * the versioning before the first save exists is what makes the second
 * schema version cheap instead of a fire drill. `tests/unit/save-migrations
 * .test.ts` exercises the runner itself against a synthetic v0 -> v1 fixture
 * so the mechanism is proven ahead of the first real migration needing it.
 */
export type SaveMigration = (raw: Record<string, unknown>) => Record<string, unknown>;

export const MIGRATIONS: readonly SaveMigration[] = [];

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
