import { Container, Sprite, type BitmapText } from './gfx/index.js';
import type { GameSim } from '../sim/game/sim.js';
import { STAT_IDS, type StatId } from '../sim/stats/definition.js';
import { TICKS_PER_SECOND } from '../sim/time.js';
import { HUD_PALETTE } from './palette.js';
import { iconRoles, type UiKit } from './ui/kit.js';
import { uiText, UI_TEXT_HEIGHT } from './ui/text.js';
import { displayStatValues, formatStat, formatStatDelta, roundStat } from './stat-display.js';

/** Vertical pitch of one stat row, in UI pixels — an icon and a text line, with a pixel to spare. */
export const STAT_ROW_HEIGHT = 11;
/** The icon column's width: the widest stat icon, so every value starts on the same x. */
const ICON_COLUMN = 10;
const VALUE_GAP = 2;
/** Where the delta starts, past the value — wide enough for `99.99`. */
const DELTA_OFFSET = 26;
/** How long a delta stays up after the last change that fed it — about two seconds, in sim ticks. */
export const STAT_DELTA_TICKS = TICKS_PER_SECOND * 2;

const STAT_ACCENT: Readonly<Record<StatId, number>> = {
  damage: HUD_PALETTE.statDamage,
  fireRate: HUD_PALETTE.statFireRate,
  range: HUD_PALETTE.statRange,
  shotSpeed: HUD_PALETTE.statShotSpeed,
  moveSpeed: HUD_PALETTE.statMoveSpeed,
  luck: HUD_PALETTE.statLuck,
};

interface StatRow {
  readonly value: BitmapText;
  readonly delta: BitmapText;
  /** The running total of changes since this row's delta last went away. */
  pending: number;
  /** Sim tick at which the delta disappears; `-1` while none is showing. */
  hideAtTick: number;
}

/**
 * The stat column (Isaac's "Found HUD"): the six resolved stats down the left
 * edge in player units (`stat-display.ts`), each flashing a signed, coloured
 * delta for a couple of seconds whenever it moves.
 *
 * Opt-in via `AccessibilitySettings.statDisplay` — the flavour-first pickup
 * is the game's default voice, and this is for the player who would rather
 * see that the Kraftbier's +40% landed. A delta flashes on *any* change,
 * whatever caused it — an item, a Promille tier, Kater, a curse, a set bonus
 * — because "why did my damage just drop?" deserves an answer as much as
 * "what did that item do?". Changes inside one window add up into one delta
 * rather than the newest overwriting the last, so picking up two items back
 * to back reads as their sum, not as whichever came second.
 *
 * Timed in **sim ticks**, not wall-clock: a delta shown the moment the player
 * paused is still there when they unpause, and a replay shows it for the same
 * number of frames the run did.
 *
 * Nothing flashes on the first frame of a run (or a new `sim` after a
 * restart): that is the column appearing, not the stats changing.
 */
export class StatHud {
  readonly view = new Container();

  private readonly rows: StatRow[] = [];
  private readonly resolved = {} as Record<StatId, number>;
  private readonly current: number[] = [];
  private readonly previous: number[] = [];
  private lastSim: GameSim | null = null;

  constructor(kit: UiKit) {
    this.view.visible = false;
    STAT_IDS.forEach((stat, index) => {
      const top = index * STAT_ROW_HEIGHT;
      const iconName = `stat-${stat}`;
      const size = kit.iconSize(iconName);
      const icon = new Sprite(kit.icon(iconName, iconRoles(STAT_ACCENT[stat])));
      icon.position.set(
        Math.floor((ICON_COLUMN - size.width) / 2),
        top + Math.floor((UI_TEXT_HEIGHT - size.height) / 2),
      );
      this.view.addChild(icon);

      const value = uiText('', { colour: HUD_PALETTE.labelText });
      value.position.set(ICON_COLUMN + VALUE_GAP, top);
      this.view.addChild(value);

      const delta = uiText('');
      delta.position.set(ICON_COLUMN + VALUE_GAP + DELTA_OFFSET, top);
      delta.visible = false;
      this.view.addChild(delta);

      this.rows.push({ value, delta, pending: 0, hideAtTick: -1 });
    });
  }

  /** Once a frame. `enabled` is the player's `statDisplay` setting — off hides the column and forgets any pending delta. */
  sync(sim: GameSim, enabled: boolean): void {
    this.view.visible = enabled;
    if (!enabled) {
      this.lastSim = null;
      return;
    }
    for (const stat of STAT_IDS) {
      this.resolved[stat] = sim.stats.value(stat);
    }
    displayStatValues(this.resolved, this.current);

    const fresh = sim !== this.lastSim;
    this.lastSim = sim;
    const tick = sim.tick;
    this.rows.forEach((row, index) => {
      const value = this.current[index] ?? 0;
      const before = this.previous[index] ?? value;
      if (fresh) {
        row.pending = 0;
        row.hideAtTick = -1;
        row.value.text = formatStat(value);
      } else if (value !== before) {
        row.value.text = formatStat(value);
        row.pending = roundStat(row.pending + (value - before));
        row.hideAtTick = tick + STAT_DELTA_TICKS;
      }
      if (
        row.hideAtTick >= 0 &&
        (tick >= row.hideAtTick || tick < row.hideAtTick - STAT_DELTA_TICKS)
      ) {
        // Expired — or the tick went *backwards*, which only a replay seek
        // or a resumed run's re-simulation does; either way the delta is
        // stale.
        row.pending = 0;
        row.hideAtTick = -1;
      }
      const showDelta = row.hideAtTick >= 0 && row.pending !== 0;
      row.delta.visible = showDelta;
      if (showDelta) {
        row.delta.text = formatStatDelta(row.pending);
        row.delta.style.fill =
          row.pending > 0 ? HUD_PALETTE.statDeltaUp : HUD_PALETTE.statDeltaDown;
      }
      this.previous[index] = value;
    });
  }

  /** The column's full height, in UI pixels — for centring it on the left edge. */
  get height(): number {
    return STAT_IDS.length * STAT_ROW_HEIGHT;
  }

  /** What each row currently reads, `value [delta]` — for tests. */
  get shownRows(): readonly string[] {
    return this.rows.map((row) =>
      row.delta.visible ? `${row.value.text} ${row.delta.text}` : row.value.text,
    );
  }
}
