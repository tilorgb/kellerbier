import {
  ROOM_COLUMNS,
  ROOM_ROWS,
  ROOM_TILE_UNITS,
  type RoomDecorativeProp,
  type RoomEnemySpawn,
  type RoomPickupSpawn,
} from '../content/rooms/definition.js';
import { PICKUP_DEFINITIONS } from '../content/pickups/pickups.js';
import { DECORATIVE_PROP_TYPE_SUGGESTIONS } from './definitions.js';
import { type EditorCell, type EditorState, recomputeTileGrid } from './state.js';

/** One tile, in editor display pixels. Large enough to be a comfortable click target. */
const TILE_PX = 24;
const GRID_WIDTH_PX = ROOM_COLUMNS * TILE_PX;
const GRID_HEIGHT_PX = ROOM_ROWS * TILE_PX;

type Tool = 'wall' | 'erase' | 'enemy' | 'pickup' | 'hazard' | 'prop';

export interface GridPanelHandle {
  destroy(): void;
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
  let pickupType = PICKUP_DEFINITIONS[0]?.id ?? '';
  let hazardType = '';
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
      recomputeTileGrid(cell);
    } else if (tool === 'hazard') {
      if (hazardType.trim() !== '') {
        cell.hazards.push({ x, y, width, height, type: hazardType.trim() });
      }
    }
    state.notify();
  }

  function placePoint(col: number, row: number): void {
    const cell = currentCell();
    const x = col * ROOM_TILE_UNITS + ROOM_TILE_UNITS / 2;
    const y = row * ROOM_TILE_UNITS + ROOM_TILE_UNITS / 2;

    if (tool === 'enemy') {
      const group = cell.spawnGroups[0];
      if (group === undefined) {
        window.alert('Add a spawn group first (Spawn groups panel) before placing an enemy spawn.');
        return;
      }
      const spawn: RoomEnemySpawn = { x, y, group: group.id };
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

  const hazardInput = document.createElement('input');
  hazardInput.type = 'text';
  hazardInput.placeholder = 'hazard type';
  hazardInput.className = 'kb-editor-tool-option';
  hazardInput.addEventListener('input', () => {
    hazardType = hazardInput.value;
  });
  toolbar.appendChild(hazardInput);

  const propInput = document.createElement('input');
  propInput.type = 'text';
  propInput.placeholder = 'prop type';
  propInput.setAttribute('list', 'kb-editor-prop-types');
  propInput.value = propType;
  propInput.className = 'kb-editor-tool-option';
  propInput.addEventListener('input', () => {
    propType = propInput.value;
  });
  const propList = document.createElement('datalist');
  propList.id = 'kb-editor-prop-types';
  for (const suggestion of DECORATIVE_PROP_TYPE_SUGGESTIONS) {
    const option = document.createElement('option');
    option.value = suggestion;
    propList.appendChild(option);
  }
  toolbar.append(propInput, propList);

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
        pointMarker(spawn.x, spawn.y, scale, 'enemy', `enemy: ${spawn.group}`),
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
    pickupSelect.hidden = tool !== 'pickup';
    hazardInput.hidden = tool !== 'hazard';
    propInput.hidden = tool !== 'prop';
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
