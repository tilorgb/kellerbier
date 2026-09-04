/**
 * #54/#159's playtest telemetry: what one run reports, and the small store
 * that holds a handful of them until the player exports or clears it.
 *
 * **Opt-in and anonymous, for real, not just in the settings label.**
 * Nothing here is collected unless `TelemetryStore.optedIn` is `true`
 * (`app/telemetry/tracker.ts`'s callers gate on it), and `sessionId` is a
 * `crypto.randomUUID()` generated locally the moment a player opts in — the
 * same mechanism `replay/store.ts`'s `buildReplayRecord` already uses for a
 * replay's own `id`, chosen for the same reason: it identifies nothing but
 * itself. There is no device fingerprint, no IP, no account, and no way to
 * derive one player's `sessionId` from another's. It exists only so a
 * playtest session run under `docs/PLAYTEST_PROTOCOL.md` can be told apart
 * from every other one — the observer asks the tester to read it off the
 * settings screen once, not that it identifies *who* played.
 *
 * What is recorded is exactly the list #54 asks for and nothing else: how
 * the run ended, which floor and how long, which items were held, how long
 * each room took to clear, and how many ticks were spent in each Promille
 * tier. See `deathCause`'s own doc comment for the one deliberate
 * simplification in that list.
 */

/** How many finished runs the store keeps before the oldest is dropped — see `MAX_REPLAYS`'s identical reasoning, sized a little larger since a telemetry entry is much smaller than a replay. */
export const MAX_TELEMETRY_RUNS = 50;

/** Ticks a room took, from the tick its door was entered to the tick its last enemy fell. */
export interface TelemetryRoomClear {
  readonly floor: number;
  readonly role: string;
  readonly ticks: number;
}

/**
 * Best-effort context for a death, not a precise attribution.
 *
 * `GameSim.applyPlayerDamage` takes only an amount — nothing in the engine
 * tracks *which* enemy or projectile dealt the fatal hit, and teaching it to
 * is a simulation-level change this telemetry feature does not need to make
 * to answer #54's actual balance questions ("that players die on the third
 * room of floor 2", not "that specific Böllerschmeißer instance's shot").
 * `enemiesPresent` — every enemy content id still alive in the room at the
 * moment of death — is the honest substitute: it says what the player was
 * up against, which is what a dashboard groups deaths by, without claiming
 * to know which of them landed the hit. `word` is the flavour word the
 * game-over screen already drew (`GameSim.deathWord`) — not a cause either,
 * but the one thing every existing bug report already carries
 * (`CONTRIBUTING.md`'s "attach the seed"), so keeping it here costs nothing
 * and lets a telemetry record and a pasted bug report describe the same
 * death the same way.
 */
export interface TelemetryDeathCause {
  readonly word: string | null;
  readonly enemiesPresent: readonly string[];
}

/** One finished run, anonymous, tied to `TelemetryStore.sessionId` only by living in the same store. */
export interface TelemetryRunRecord {
  readonly runId: string;
  readonly recordedAt: number;
  readonly seed: number;
  readonly character: string;
  readonly outcome: 'won' | 'died';
  readonly floor: number;
  readonly roomRole: string;
  readonly ticksSurvived: number;
  readonly deathCause: TelemetryDeathCause | null;
  readonly itemsHeld: readonly string[];
  readonly roomClears: readonly TelemetryRoomClear[];
  /** Ticks spent at each Promille tier id (`sim/game/promille.ts#PromilleTier`), as string keys — a plain object round-trips through `JSON.stringify` without a `Map` codec. */
  readonly promilleTierTicks: Readonly<Record<string, number>>;
}

export interface TelemetryStore {
  readonly optedIn: boolean;
  readonly sessionId: string | null;
  readonly runs: readonly TelemetryRunRecord[];
}

export function createDefaultTelemetryStore(): TelemetryStore {
  return { optedIn: false, sessionId: null, runs: [] };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function sanitizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === 'string');
}

function sanitizeRoomClear(value: unknown): TelemetryRoomClear | null {
  if (
    !isPlainObject(value) ||
    !isFiniteNumber(value.floor) ||
    typeof value.role !== 'string' ||
    !isFiniteNumber(value.ticks)
  ) {
    return null;
  }
  return { floor: value.floor, role: value.role, ticks: value.ticks };
}

function sanitizeRoomClears(value: unknown): TelemetryRoomClear[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const clears: TelemetryRoomClear[] = [];
  for (const entry of value) {
    const clear = sanitizeRoomClear(entry);
    if (clear !== null) {
      clears.push(clear);
    }
  }
  return clears;
}

function sanitizeDeathCause(value: unknown): TelemetryDeathCause | null {
  if (!isPlainObject(value)) {
    return null;
  }
  return {
    word: typeof value.word === 'string' ? value.word : null,
    enemiesPresent: sanitizeStringArray(value.enemiesPresent),
  };
}

function sanitizePromilleTierTicks(value: unknown): Record<string, number> {
  if (!isPlainObject(value)) {
    return {};
  }
  const ticks: Record<string, number> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (isFiniteNumber(entry)) {
      ticks[key] = entry;
    }
  }
  return ticks;
}

/** Coerces an arbitrary value into a `TelemetryRunRecord`, or `null` if it is missing what a run record needs to mean anything. */
export function sanitizeTelemetryRun(value: unknown): TelemetryRunRecord | null {
  if (
    !isPlainObject(value) ||
    typeof value.runId !== 'string' ||
    !isFiniteNumber(value.recordedAt) ||
    !isFiniteNumber(value.seed) ||
    typeof value.character !== 'string' ||
    (value.outcome !== 'won' && value.outcome !== 'died') ||
    !isFiniteNumber(value.floor) ||
    typeof value.roomRole !== 'string' ||
    !isFiniteNumber(value.ticksSurvived)
  ) {
    return null;
  }
  return {
    runId: value.runId,
    recordedAt: value.recordedAt,
    seed: value.seed,
    character: value.character,
    outcome: value.outcome,
    floor: value.floor,
    roomRole: value.roomRole,
    ticksSurvived: value.ticksSurvived,
    deathCause: sanitizeDeathCause(value.deathCause),
    itemsHeld: sanitizeStringArray(value.itemsHeld),
    roomClears: sanitizeRoomClears(value.roomClears),
    promilleTierTicks: sanitizePromilleTierTicks(value.promilleTierTicks),
  };
}

function sanitizeTelemetryRuns(value: unknown): TelemetryRunRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const runs: TelemetryRunRecord[] = [];
  for (const entry of value) {
    const run = sanitizeTelemetryRun(entry);
    if (run !== null) {
      runs.push(run);
    }
  }
  return runs.slice(0, MAX_TELEMETRY_RUNS);
}

/** Coerces an arbitrary parsed value into a full `TelemetryStore`, field-by-field — the same shape every other save-backed sanitiser in this project uses. */
export function sanitizeTelemetryStore(value: unknown): TelemetryStore {
  if (!isPlainObject(value)) {
    return createDefaultTelemetryStore();
  }
  return {
    optedIn: typeof value.optedIn === 'boolean' ? value.optedIn : false,
    sessionId:
      typeof value.sessionId === 'string' && value.sessionId.length > 0 ? value.sessionId : null,
    runs: sanitizeTelemetryRuns(value.runs),
  };
}
