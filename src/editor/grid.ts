import {
  ROOM_COLUMNS,
  ROOM_ROWS,
  ROOM_TILE_UNITS,
  type RoomDecorativeProp,
  type RoomEnemySpawn,
  type RoomPickupSpawn,
} from '../content/rooms/definition.js';
import { ENEMY_DEFINITIONS } from '../content/enemies/index.js';
import { PICKUP_DEFINITIONS } from '../content/pickups/pickups.js';
import { DECORATIVE_PROP_TYPE_SUGGESTIONS, HAZARD_TYPE_SUGGESTIONS } from './definitions.js';
import { type EditorCell, type EditorState, recomputeTileGrid } from './state.js';

/** The `<select>` value that means "type your own", for the hazard/prop pickers — never a real hazard/prop type itself. */
const CUSTOM_OPTION = '__custom__';

/** One tile, in editor display pixels. Large enough to be a comfortable click target. */
const TILE_PX = 24;
const GRID_WIDTH_PX = ROOM_COLUMNS * TILE_PX;
const GRID_HEIGHT_PX = ROOM_ROWS * TILE_PX;

type Tool = 'wall' | 'erase' | 'enemy' | 'pickup' | 'hazard' | 'prop';

export interface GridPanelHandle {
  destroy(): void;
  /** Tints every non-wall tile cell — `null` restores the default grey. See `.kb-editor-tile`'s `--kb-editor-tile-bg` custom property. */
  setBackgroundColor(color: string | null): void;
}

/**
 * The 15x9 room grid: paints obstacles (one drag = one rectangle, mirrored
 * into `tileGrid` since nothing downstream reads it separately), and places
 * enemy spawns, pickups, hazards and decorative props.
 *
 * Always edits `state.activeCellIndex` — for a `1x1` room that is always `0`;
 * for a multi-cell room, `main.ts`'s cell tabs are what move it.
 */
export function createGridPanel(state: EditorState, host: HTMLElement): GridPanelHandle {
  let tool: Tool = 'wall';
  let enemyType = ENEMY_DEFINITIONS[0]?.id ?? '';
  let pickupType = PICKUP_DEFINITIONS[0]?.id ?? '';
  let hazardType = HAZARD_TYPE_SUGGESTIONS[0] ?? '';
  let propType = DECORATIVE_PROP_TYPE_SUGGESTIONS[0] ?? '';
  let dragStart: { col: number; row: number } | null = null;
  let dragCurrent: { col: number; row: number } | null = null;

  const root = document.createElement('div');
  root.className = 'kb-editor-grid-panel';
  host.appendChild(root);

  const toolbar = document.createElement('div');
  toolbar.className = 'kb-editor-toolbar';
  root.appendChild(toolbar);

  const gridWrap = document.createElement('div');
  gridWrap.className = 'kb-editor-grid-wrap';
  root.appendChild(gridWrap);

  const tileLayer = document.createElement('div');
  tileLayer.className = 'kb-editor-tile-layer';
  tileLayer.style.width = `${String(GRID_WIDTH_PX)}px`;
  tileLayer.style.height = `${String(GRID_HEIGHT_PX)}px`;
  gridWrap.appendChild(tileLayer);

  const markerLayer = document.createElement('div');
  markerLayer.className = 'kb-editor-marker-layer';
  markerLayer.style.width = `${String(GRID_WIDTH_PX)}px`;
  markerLayer.style.height = `${String(GRID_HEIGHT_PX)}px`;
  gridWrap.appendChild(markerLayer);

  const tiles: HTMLDivElement[] = [];
  for (let row = 0; row < ROOM_ROWS; row++) {
    for (let col = 0; col < ROOM_COLUMNS; col++) {
      const tile = document.createElement('div');
      tile.className = 'kb-editor-tile';
      tile.style.left = `${String(col * TILE_PX)}px`;
      tile.style.top = `${String(row * TILE_PX)}px`;
      tile.style.width = `${String(TILE_PX)}px`;
      tile.style.height = `${String(TILE_PX)}px`;
      tile.dataset.col = String(col);
      tile.dataset.row = String(row);
      tileLayer.appendChild(tile);
      tiles.push(tile);
    }
  }

  function currentCell(): EditorCell {
    const cell = state.draft.cells[state.activeCellIndex];
    if (cell === undefined) {
      throw new Error(`editor draft has no cell ${String(state.activeCellIndex)}`);
    }
    return cell;
  }

  function tileAt(col: number, row: number): HTMLDivElement | undefined {
    return tiles[row * ROOM_COLUMNS + col];
  }

  function dragRect(): { minCol: number; minRow: number; maxCol: number; maxRow: number } | null {
    if (dragStart === null || dragCurrent === null) {
      return null;
    }
    return {
      minCol: Math.min(dragStart.col, dragCurrent.col),
      minRow: Math.min(dragStart.row, dragCurrent.row),
      maxCol: Math.max(dragStart.col, dragCurrent.col),
      maxRow: Math.max(dragStart.row, dragCurrent.row),
    };
  }

  function paintDragPreview(): void {
    const rect = dragRect();
    for (const tile of tiles) {
      tile.classList.remove('kb-editor-tile-drag');
    }
    if (rect === null) {
      return;
    }
    for (let row = rect.minRow; row <= rect.maxRow; row++) {
      for (let col = rect.minCol; col <= rect.maxCol; col++) {
        tileAt(col, row)?.classList.add('kb-editor-tile-drag');
      }
    }
  }

  function commitDrag(): void {
    const rect = dragRect();
    dragStart = null;
    dragCurrent = null;
    paintDragPreview();
    if (rect === null) {
      return;
    }
    const cell = currentCell();
    const x = rect.minCol * ROOM_TILE_UNITS;
    const y = rect.minRow * ROOM_TILE_UNITS;
    const width = (rect.maxCol - rect.minCol + 1) * ROOM_TILE_UNITS;
    const height = (rect.maxRow - rect.minRow + 1) * ROOM_TILE_UNITS;

    if (tool === 'wall') {
      cell.obstacles.push({ x, y, width, height });
      recomputeTileGrid(cell);
    } else if (tool === 'erase') {
      cell.obstacles = cell.obstacles.filter(
        (obstacle) =>
          !(
            obstacle.x >= x &&
            obstacle.x + obstacle.width <= x + width &&
            obstacle.y >= y &&
            obstacle.y + obstacle.height <= y + height
          ),
      );
      cell.hazards = cell.hazards.filter(
        (hazard) =>
          !(
            hazard.x >= x &&
            hazard.x + hazard.width <= x + width &&
            hazard.y >= y &&
            hazard.y + hazard.height <= y + height
          ),
      );
      // Point markers too, not just the rectangle-based obstacles/hazards —
      // an enemy spawn, pickup or prop placed with a stray click had no way
      // to be removed before this, since the erase tool only ever checked
      // the two rectangle lists.
      const inRect = (point: { x: number; y: number }): boolean =>
        point.x >= x && point.x < x + width && point.y >= y && point.y < y + height;
      cell.enemySpawns = cell.enemySpawns.filter((spawn) => !inRect(spawn));
      cell.pickupSpawns = cell.pickupSpawns.filter((pickup) => !inRect(pickup));
      cell.decorativeProps = cell.decorativeProps.filter((prop) => !inRect(prop));
      recomputeTileGrid(cell);
    } else if (tool === 'hazard') {
      if (hazardType.trim() !== '') {
        cell.hazards.push({ x, y, width, height, type: hazardType.trim() });
      }
    }
    state.notify();
  }

  /**
   * The enemy-spawn tool places a spawn point bound to a *group* (a pool of
   * enemy/floor-range choices — `panels/spawn-groups.ts`), but picking one
   * enemy from a dropdown is the common case, and having to detour through
   * that separate panel to hand-author a one-choice group first read as the
   * tool doing nothing at all. Reuses an existing one-choice, every-floor
   * group for the same enemy if one is already there (so ten spawns of the
   * same enemy don't create ten near-identical groups), and creates one
   * otherwise — a variety-across-floors spawn is still exactly what the
   * Spawn groups panel is for, this is only the fast path for the ordinary
   * case of "this enemy, here."
   */
  function findOrCreateSimpleSpawnGroup(cell: EditorCell, targetEnemyId: string): string {
    const existing = cell.spawnGroups.find((group) => {
      const [onlyChoice] = group.choices;
      return (
        group.choices.length === 1 &&
        onlyChoice?.enemyId === targetEnemyId &&
        onlyChoice.minFloor === 1 &&
        onlyChoice.maxFloor === 7
      );
    });
    if (existing !== undefined) {
      return existing.id;
    }
    let index = cell.spawnGroups.length + 1;
    while (cell.spawnGroups.some((group) => group.id === `group-${String(index)}`)) {
      index += 1;
    }
    const id = `group-${String(index)}`;
    cell.spawnGroups.push({
      id,
      count: 1,
      choices: [{ enemyId: targetEnemyId, minFloor: 1, maxFloor: 7 }],
    });
    return id;
  }

  function placePoint(col: number, row: number): void {
    const cell = currentCell();
    const x = col * ROOM_TILE_UNITS + ROOM_TILE_UNITS / 2;
    const y = row * ROOM_TILE_UNITS + ROOM_TILE_UNITS / 2;

    if (tool === 'enemy') {
      if (enemyType === '') {
        return;
      }
      const groupId = findOrCreateSimpleSpawnGroup(cell, enemyType);
      const spawn: RoomEnemySpawn = { x, y, group: groupId };
      cell.enemySpawns.push(spawn);
    } else if (tool === 'pickup') {
      if (pickupType === '') {
        return;
      }
      const spawn: RoomPickupSpawn = { x, y, type: pickupType };
      cell.pickupSpawns.push(spawn);
    } else if (tool === 'prop') {
      if (propType.trim() === '') {
        return;
      }
      const prop: RoomDecorativeProp = { x, y, type: propType.trim() };
      cell.decorativeProps.push(prop);
    } else {
      return;
    }
    state.notify();
  }

  const onTilePointerDown = (event: PointerEvent): void => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || target.dataset.col === undefined) {
      return;
    }
    const col = Number(target.dataset.col);
    const row = Number(target.dataset.row);
    if (tool === 'wall' || tool === 'erase' || tool === 'hazard') {
      dragStart = { col, row };
      dragCurrent = { col, row };
      paintDragPreview();
    } else {
      placePoint(col, row);
    }
  };

  const onTilePointerEnter = (event: PointerEvent): void => {
    if (dragStart === null) {
      return;
    }
    const target = event.target;
    if (!(target instanceof HTMLElement) || target.dataset.col === undefined) {
      return;
    }
    dragCurrent = { col: Number(target.dataset.col), row: Number(target.dataset.row) };
    paintDragPreview();
  };

  const onWindowPointerUp = (): void => {
    if (dragStart !== null) {
      commitDrag();
    }
  };

  tileLayer.addEventListener('pointerdown', onTilePointerDown);
  tileLayer.addEventListener('pointerover', onTilePointerEnter);
  window.addEventListener('pointerup', onWindowPointerUp);

  function toolButton(id: Tool, label: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.className = 'kb-editor-tool';
    button.addEventListener('click', () => {
      tool = id;
      render();
    });
    return button;
  }

  const wallButton = toolButton('wall', 'Wall');
  const eraseButton = toolButton('erase', 'Erase');
  const enemyButton = toolButton('enemy', 'Enemy spawn');
  const pickupButton = toolButton('pickup', 'Pickup');
  const hazardButton = toolButton('hazard', 'Hazard');
  const propButton = toolButton('prop', 'Prop');
  toolbar.append(wallButton, eraseButton, enemyButton, pickupButton, hazardButton, propButton);

  const enemySelect = document.createElement('select');
  enemySelect.className = 'kb-editor-tool-option';
  for (const enemy of ENEMY_DEFINITIONS) {
    const option = document.createElement('option');
    option.value = enemy.id;
    option.textContent = enemy.id;
    enemySelect.appendChild(option);
  }
  enemySelect.value = enemyType;
  enemySelect.addEventListener('change', () => {
    enemyType = enemySelect.value;
  });
  toolbar.appendChild(enemySelect);

  const pickupSelect = document.createElement('select');
  pickupSelect.className = 'kb-editor-tool-option';
  for (const pickup of PICKUP_DEFINITIONS) {
    const option = document.createElement('option');
    option.value = pickup.id;
    option.textContent = pickup.id;
    pickupSelect.appendChild(option);
  }
  pickupSelect.value = pickupType;
  pickupSelect.addEventListener('change', () => {
    pickupType = pickupSelect.value;
  });
  toolbar.appendChild(pickupSelect);

  /**
   * A dropdown of every known type plus "Custom…", not a bare text field —
   * a free-text-with-invisible-`<datalist>` combo box (this control's
   * previous shape for `prop`, and `hazard` had no suggestions wired in at
   * all) reads as "an empty box, and no idea what goes in it," which is
   * exactly what it was. Neither field has a real registry
   * (`state.ts`'s `RoomHazard`/`RoomDecorativeProp` only require a
   * non-empty string), so "Custom…" still reaches every value a `<datalist>`
   * combo box could, just via an explicit reveal instead of a hidden one.
   */
  function createTypePicker(
    suggestions: readonly string[],
    initial: string,
    onChange: (value: string) => void,
  ): { select: HTMLSelectElement; customInput: HTMLInputElement } {
    const select = document.createElement('select');
    select.className = 'kb-editor-tool-option';
    for (const suggestion of suggestions) {
      const option = document.createElement('option');
      option.value = suggestion;
      option.textContent = suggestion;
      select.appendChild(option);
    }
    const customOption = document.createElement('option');
    customOption.value = CUSTOM_OPTION;
    customOption.textContent = 'Custom…';
    select.appendChild(customOption);

    const customInput = document.createElement('input');
    customInput.type = 'text';
    customInput.placeholder = 'type name';
    customInput.className = 'kb-editor-tool-option';
    customInput.hidden = true;

    const isKnown = suggestions.includes(initial);
    select.value = isKnown ? initial : CUSTOM_OPTION;
    customInput.hidden = isKnown;
    customInput.value = isKnown ? '' : initial;

    select.addEventListener('change', () => {
      if (select.value === CUSTOM_OPTION) {
        customInput.hidden = false;
        onChange(customInput.value);
      } else {
        customInput.hidden = true;
        onChange(select.value);
      }
    });
    customInput.addEventListener('input', () => {
      onChange(customInput.value);
    });

    return { select, customInput };
  }

  const hazardPicker = createTypePicker(HAZARD_TYPE_SUGGESTIONS, hazardType, (value) => {
    hazardType = value;
  });
  toolbar.append(hazardPicker.select, hazardPicker.customInput);

  const propPicker = createTypePicker(DECORATIVE_PROP_TYPE_SUGGESTIONS, propType, (value) => {
    propType = value;
  });
  toolbar.append(propPicker.select, propPicker.customInput);

  /** The group's single enemy, for the common case `findOrCreateSimpleSpawnGroup` produces — falls back to the raw group id for a hand-authored multi-choice group, where "the enemy" isn't one answer. */
  function enemyLabelFor(cell: EditorCell, groupId: string): string {
    const group = cell.spawnGroups.find((candidate) => candidate.id === groupId);
    const [onlyChoice] = group?.choices ?? [];
    return group?.choices.length === 1 && onlyChoice !== undefined ? onlyChoice.enemyId : groupId;
  }

  function renderMarkers(): void {
    markerLayer.replaceChildren();
    const cell = currentCell();
    const scale = TILE_PX / ROOM_TILE_UNITS;

    for (const hazard of cell.hazards) {
      const el = document.createElement('div');
      el.className = 'kb-editor-marker kb-editor-marker-hazard';
      el.style.left = `${String(hazard.x * scale)}px`;
      el.style.top = `${String(hazard.y * scale)}px`;
      el.style.width = `${String(hazard.width * scale)}px`;
      el.style.height = `${String(hazard.height * scale)}px`;
      el.title = `hazard: ${hazard.type}`;
      markerLayer.appendChild(el);
    }
    for (const spawn of cell.enemySpawns) {
      markerLayer.appendChild(
        pointMarker(spawn.x, spawn.y, scale, 'enemy', `enemy: ${enemyLabelFor(cell, spawn.group)}`),
      );
    }
    for (const pickup of cell.pickupSpawns) {
      markerLayer.appendChild(
        pointMarker(pickup.x, pickup.y, scale, 'pickup', `pickup: ${pickup.type}`),
      );
    }
    for (const prop of cell.decorativeProps) {
      markerLayer.appendChild(pointMarker(prop.x, prop.y, scale, 'prop', `prop: ${prop.type}`));
    }
  }

  function renderTiles(): void {
    const cell = currentCell();
    cell.tileGrid.forEach((line, row) => {
      for (let col = 0; col < line.length; col++) {
        const tile = tileAt(col, row);
        if (tile === undefined) {
          continue;
        }
        tile.classList.toggle('kb-editor-tile-wall', line[col] === '#');
      }
    });
  }

  function highlightActiveTool(): void {
    for (const [button, id] of [
      [wallButton, 'wall'],
      [eraseButton, 'erase'],
      [enemyButton, 'enemy'],
      [pickupButton, 'pickup'],
      [hazardButton, 'hazard'],
      [propButton, 'prop'],
    ] as const) {
      button.classList.toggle('kb-editor-tool-active', tool === id);
    }
    enemySelect.hidden = tool !== 'enemy';
    pickupSelect.hidden = tool !== 'pickup';
    hazardPicker.select.hidden = tool !== 'hazard';
    hazardPicker.customInput.hidden =
      tool !== 'hazard' || hazardPicker.select.value !== CUSTOM_OPTION;
    propPicker.select.hidden = tool !== 'prop';
    propPicker.customInput.hidden = tool !== 'prop' || propPicker.select.value !== CUSTOM_OPTION;
  }

  function render(): void {
    highlightActiveTool();
    renderTiles();
    renderMarkers();
  }

  const unsubscribe = state.subscribe(render);
  render();

  return {
    destroy(): void {
      unsubscribe();
      tileLayer.removeEventListener('pointerdown', onTilePointerDown);
      tileLayer.removeEventListener('pointerover', onTilePointerEnter);
      window.removeEventListener('pointerup', onWindowPointerUp);
      root.remove();
    },
    setBackgroundColor(color: string | null): void {
      // Removed rather than set to `''` when clearing: an empty-string custom
      // property is still "set" for `var()`'s fallback purposes, which would
      // make `.kb-editor-tile`'s `background` resolve to nothing instead of
      // falling back to its default grey.
      if (color === null) {
        tileLayer.style.removeProperty('--kb-editor-tile-bg');
      } else {
        tileLayer.style.setProperty('--kb-editor-tile-bg', color);
      }
    },
  };

  function pointMarker(
    x: number,
    y: number,
    scale: number,
    kind: string,
    tooltip: string,
  ): HTMLElement {
    const el = document.createElement('div');
    el.className = `kb-editor-marker kb-editor-marker-${kind}`;
    el.style.left = `${String(x * scale - 5)}px`;
    el.style.top = `${String(y * scale - 5)}px`;
    el.title = tooltip;
    return el;
  }
}

export { GRID_WIDTH_PX, GRID_HEIGHT_PX, TILE_PX };
