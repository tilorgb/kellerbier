import { Container, type BitmapText } from './gfx/index.js';
import type { GameSim } from '../sim/game/sim.js';
import type { ItemHookContext } from '../sim/item/definition.js';
import { HUD_PALETTE } from './palette.js';
import { uiText } from './ui/text.js';

const ROW_HEIGHT = 11;

/** Generous cap on rows shown at once — a run realistically holds a handful of stateful items, never the whole roster. */
const MAX_ROWS = 8;

/**
 * One row per held item that has something to say about its *current*
 * state — `ItemDefinition.status` (`sim/item/definition.ts`): "Lederhosn:
 * ready", "Gartenzwerg-Hut: 2 extra shots", "Lebkuchenherz: Für mein
 * Schatzi". The roster's "every item is visible" rule for the items whose
 * whole effect is a counter, a charge or a condition and so had nothing in
 * the room to show for themselves.
 *
 * The same fixed pool of rows `ItemGateHud` uses, for the same reasons:
 * sized to `MAX_ROWS`, rows hidden rather than created and destroyed as the
 * held set changes, and a `height` of 0 for a run with nothing to show so
 * `app/main.ts`'s `layoutHud` column closes the gap. Each row is a single
 * `BitmapText` — the state is the thing the eye is meant to catch, so the
 * item's name is plain and its status is what changes.
 *
 * `status` is a query the renderer runs, never something the simulation
 * dispatches — the reader is handed the same `ItemHookContext` shape a hook
 * gets, built once here and reused, so a reader authored against a hook's
 * `ctx` reads the same.
 */
export class ItemStatusHud {
  readonly view = new Container();

  private readonly rows: BitmapText[] = [];
  private shownCount = 0;
  private readonly scratch: { sim: GameSim; itemId: string; state: ItemHookContext['state'] } = {
    sim: null as unknown as GameSim,
    itemId: '',
    state: { count: 0, charge: 0, timer: 0 },
  };

  constructor() {
    for (let index = 0; index < MAX_ROWS; index++) {
      const label = uiText('', { colour: HUD_PALETTE.labelText });
      label.position.set(0, index * ROW_HEIGHT);
      label.visible = false;
      this.view.addChild(label);
      this.rows.push(label);
    }
  }

  sync(sim: GameSim): void {
    const total = sim.items.count;
    let shown = 0;
    this.scratch.sim = sim;

    for (let index = 0; index < total && shown < this.rows.length; index++) {
      if (!sim.inventory.has(index)) {
        continue;
      }
      const item = sim.items.at(index);
      if (item.status === undefined) {
        continue;
      }
      this.scratch.itemId = item.id;
      this.scratch.state = sim.inventory.stateOf(index);
      const status = item.status(this.scratch);
      if (status === '') {
        continue;
      }
      const row = this.rows[shown];
      if (row === undefined) {
        continue;
      }
      const text = `${item.name}: ${status}`;
      if (row.text !== text) {
        row.text = text;
      }
      row.visible = true;
      shown += 1;
    }

    for (let index = shown; index < this.rows.length; index++) {
      const row = this.rows[index];
      if (row !== undefined) {
        row.visible = false;
      }
    }
    this.shownCount = shown;
  }

  /** The rows currently shown, top to bottom — for tests. */
  get shownRows(): readonly string[] {
    return this.rows.slice(0, this.shownCount).map((row) => row.text);
  }

  /** Height of the currently-shown rows, in UI pixels — 0 for a run with nothing to report, same as every other HUD piece's "hide when empty." */
  get height(): number {
    return this.shownCount * ROW_HEIGHT;
  }
}
