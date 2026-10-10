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
 * v2 -> v3: two features landing together.
 *
 * #48's half is `replays` — new storage, not a reshape of anything v2
 * already had, so there is nothing to back-fill it from (unlike `v1ToV2`'s
 * `lastRun`); an upgraded save simply starts with none, same as
 * `createDefaultSave`.
 *
 * #85's half is the in-progress run learning whether it is sober. Back-filled
 * `true` rather than read off `unlocks`, and the distinction matters. Every
 * run recorded by a pre-#85 build *was* a promilled one —
 * `GameSim.promilleUnlocked` defaulted to `true` and nothing set it — so
 * `true` reconstructs the run that was actually saved. Deriving it from the
 * save's unlock set instead would resume a v2 tester's in-progress run with
 * the beer stripped out of it purely because they had never beaten Der
 * Stier, which is the exact divergence `ActiveRunSave.promilleUnlocked`
 * exists to prevent. A save with no run in progress migrates to a `null`
 * `activeRun` untouched; `sanitizeSave` is what turns anything else
 * unparseable into `null`.
 */
const v2ToV3: SaveMigration = (raw) => {
  const active = raw.activeRun;
  if (typeof active !== 'object' || active === null || Array.isArray(active)) {
    return { ...raw, schemaVersion: 3, replays: [] };
  }
  return {
    ...raw,
    schemaVersion: 3,
    replays: [],
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

/**
 * v4 -> v5: `greetedRegulars` is retired along with the hub's regulars and
 * their arrival dialogue — nothing reads it any more. No back-fill needed
 * for a field that is simply gone: `sanitizeSave` builds `SaveData`
 * field-by-field from a known list, so a stray `greetedRegulars` left in a
 * migrated blob is never copied into the result. This step exists to hold
 * the version, the same as `v0ToV1`.
 */
const v4ToV5: SaveMigration = (raw) => ({ ...raw, schemaVersion: 5 });

/**
 * v5 -> v6 (#53): `preferences` is new storage, not a reshape of anything v5
 * already had — same reasoning `v2ToV3`'s own `replays` back-fill gives for
 * starting empty rather than deriving a value from something older. A save
 * from before rebinding, the mixer or a dead-zone setting existed has no
 * opinion to carry forward; `sanitizeSave`'s own `sanitizePreferences` fills
 * in `createDefaultPreferences()` for a missing field regardless, so this
 * step exists to hold the version, the same as `v4ToV5`.
 */
const v5ToV6: SaveMigration = (raw) => ({ ...raw, schemaVersion: 6 });

/**
 * v6 -> v7 (#54, #159): `telemetry` is new storage, opted out by default —
 * same reasoning `v5ToV6`'s own doc comment gives for `preferences`: nothing
 * before this version had an opinion on playtest telemetry, and
 * `sanitizeSave`'s `sanitizeTelemetryStore` already fills in
 * `createDefaultTelemetryStore()` (opted out, no session id, no runs) for a
 * missing field regardless. This step exists to hold the version.
 */
const v6ToV7: SaveMigration = (raw) => ({ ...raw, schemaVersion: 7 });

/**
 * v7 -> v8 (#58): `seenStoryBeats` is new storage, same reasoning `v5ToV6`
 * and `v6ToV7` give for `preferences`/`telemetry` — nothing before this
 * version had a one-time story card to have seen. Back-filling every
 * existing save as having already seen the opening (rather than starting
 * empty) would mean every pre-#58 player quietly never sees it at all,
 * which is the opposite of what a returning player should get from the
 * feature landing.
 */
const v7ToV8: SaveMigration = (raw) => ({ ...raw, schemaVersion: 8, seenStoryBeats: [] });

/**
 * v8 -> v9: `discoveredItems` is new storage, and there is nothing to
 * back-fill it from — no earlier version recorded which items a run held
 * (`BestRunRecord` keeps a floor and a kill count, not an inventory). So an
 * existing save starts with an empty Collection, the same as a fresh one,
 * and fills it in from the next run on.
 */
const v8ToV9: SaveMigration = (raw) => ({ ...raw, schemaVersion: 9, discoveredItems: [] });

/**
 * v9 -> v10 (#503): the in-progress run gains `lockedItems`, back-filled
 * empty — nothing was locked before this version, so the log was recorded
 * against the full pool and has to be replayed against it. Same shape as
 * `v3ToV4`'s `character` back-fill. Replays get the same default from
 * `sanitizeReplay`.
 */
const v9ToV10: SaveMigration = (raw) => {
  const active = raw.activeRun;
  const upgraded = { ...raw, schemaVersion: 10 };
  if (typeof active !== 'object' || active === null || Array.isArray(active)) {
    return upgraded;
  }
  return {
    ...upgraded,
    activeRun: { ...(active as Record<string, unknown>), lockedItems: [] },
  };
};

/**
 * v10 -> v11 (#505): the in-progress run gains `tier`, back-filled 0 — every
 * run recorded before tiers existed was played on the plain game. Same shape
 * as `v9ToV10`. Replays get the same default from `sanitizeReplay`.
 */
const v10ToV11: SaveMigration = (raw) => {
  const active = raw.activeRun;
  const upgraded = { ...raw, schemaVersion: 11 };
  if (typeof active !== 'object' || active === null || Array.isArray(active)) {
    return upgraded;
  }
  return { ...upgraded, activeRun: { ...(active as Record<string, unknown>), tier: 0 } };
};

/**
 * v11 -> v12 (#494): the in-progress run gains `dailyDate`, back-filled
 * `null` — no run before v12 could have been a daily, since the daily had
 * no way in. Same shape as `v10ToV11`.
 */
const v11ToV12: SaveMigration = (raw) => {
  const active = raw.activeRun;
  const upgraded = { ...raw, schemaVersion: 12 };
  if (typeof active !== 'object' || active === null || Array.isArray(active)) {
    return upgraded;
  }
  return { ...upgraded, activeRun: { ...(active as Record<string, unknown>), dailyDate: null } };
};

/**
 * v12 -> v13 (#507): the in-progress run gains `challenge`, back-filled
 * `null` — no run before v13 could have been one. Same shape as `v11ToV12`;
 * replays get the same default from `sanitizeReplay`.
 */
const v12ToV13: SaveMigration = (raw) => {
  const active = raw.activeRun;
  const upgraded = { ...raw, schemaVersion: 13 };
  if (typeof active !== 'object' || active === null || Array.isArray(active)) {
    return upgraded;
  }
  return { ...upgraded, activeRun: { ...(active as Record<string, unknown>), challenge: null } };
};

export const MIGRATIONS: readonly SaveMigration[] = [
  v0ToV1,
  v1ToV2,
  v2ToV3,
  v3ToV4,
  v4ToV5,
  v5ToV6,
  v6ToV7,
  v7ToV8,
  v8ToV9,
  v9ToV10,
  v10ToV11,
  v11ToV12,
  v12ToV13,
];

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
