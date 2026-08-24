import type { RoomShape, RoomSpecialRole } from '../../content/rooms/definition.js';
import { SHAPES, SPECIAL_ROLES, shapeCellCount } from '../definitions.js';
import { blankCell, type EditorState } from '../state.js';

export interface MetadataPanelHandle {
  destroy(): void;
}

/**
 * Room metadata: shape, doors (`1x1` only), floor tags, difficulty tier,
 * pool weight, special role and the key-locked flag it alone unlocks.
 *
 * Changing `shape` here is the one place the number of cells in the draft
 * changes — existing cells are kept where the new shape still has that many,
 * new ones start blank, and extra ones are dropped. Nothing about a cell's
 * *content* depends on which shape it is in, so there is nothing more to
 * migrate.
 */
export function createMetadataPanel(state: EditorState, host: HTMLElement): MetadataPanelHandle {
  const root = document.createElement('div');
  root.className = 'kb-editor-panel kb-editor-metadata';
  host.appendChild(root);

  const heading = document.createElement('h2');
  heading.textContent = 'Metadata';
  root.appendChild(heading);

  const idLabel = document.createElement('label');
  idLabel.textContent = 'Room id';
  const idInput = document.createElement('input');
  idInput.type = 'text';
  idInput.addEventListener('input', () => {
    state.draft.id = idInput.value;
    state.notify();
  });
  idLabel.appendChild(idInput);
  root.appendChild(idLabel);

  const shapeLabel = document.createElement('label');
  shapeLabel.textContent = 'Shape';
  const shapeSelect = document.createElement('select');
  for (const info of SHAPES) {
    const option = document.createElement('option');
    option.value = info.shape;
    option.textContent = info.label;
    shapeSelect.appendChild(option);
  }
  shapeSelect.addEventListener('change', () => {
    const shape = shapeSelect.value as RoomShape;
    const wanted = shapeCellCount(shape);
    const cells = state.draft.cells.slice(0, wanted);
    while (cells.length < wanted) {
      cells.push(blankCell());
    }
    state.draft.shape = shape;
    state.draft.cells = cells;
    state.notify();
  });
  shapeLabel.appendChild(shapeSelect);
  root.appendChild(shapeLabel);

  const doorsWrap = document.createElement('div');
  doorsWrap.className = 'kb-editor-doors';
  const doorChecks = (['north', 'east', 'south', 'west'] as const).map((direction) => {
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.addEventListener('change', () => {
      state.draft.doors = { ...state.draft.doors, [direction]: checkbox.checked };
      state.notify();
    });
    label.append(checkbox, document.createTextNode(direction));
    doorsWrap.appendChild(label);
    return { direction, checkbox };
  });
  root.appendChild(doorsWrap);

  const floorTagsLabel = document.createElement('label');
  floorTagsLabel.textContent = 'Floor tags (comma-separated)';
  const floorTagsInput = document.createElement('input');
  floorTagsInput.type = 'text';
  floorTagsInput.addEventListener('input', () => {
    state.draft.floorTags = floorTagsInput.value
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag !== '');
    state.notify();
  });
  floorTagsLabel.appendChild(floorTagsInput);
  root.appendChild(floorTagsLabel);

  const difficultyLabel = document.createElement('label');
  difficultyLabel.textContent = 'Difficulty tier (1-5)';
  const difficultyInput = document.createElement('input');
  difficultyInput.type = 'number';
  difficultyInput.min = '1';
  difficultyInput.max = '5';
  difficultyInput.step = '1';
  difficultyInput.addEventListener('input', () => {
    state.draft.difficultyTier = Number(difficultyInput.value);
    state.notify();
  });
  difficultyLabel.appendChild(difficultyInput);
  root.appendChild(difficultyLabel);

  const weightLabel = document.createElement('label');
  weightLabel.textContent = 'Pool weight (> 0)';
  const weightInput = document.createElement('input');
  weightInput.type = 'number';
  weightInput.min = '0';
  weightInput.step = '0.1';
  weightInput.addEventListener('input', () => {
    state.draft.weight = Number(weightInput.value);
    state.notify();
  });
  weightLabel.appendChild(weightInput);
  root.appendChild(weightLabel);

  const roleLabel = document.createElement('label');
  roleLabel.textContent = 'Special role';
  const roleSelect = document.createElement('select');
  const noneOption = document.createElement('option');
  noneOption.value = '';
  noneOption.textContent = '(none — start/normal room)';
  roleSelect.appendChild(noneOption);
  for (const role of SPECIAL_ROLES) {
    const option = document.createElement('option');
    option.value = role;
    option.textContent = role;
    roleSelect.appendChild(option);
  }
  roleSelect.addEventListener('change', () => {
    const value = roleSelect.value;
    if (value === '') {
      delete state.draft.specialRole;
      delete state.draft.keyLocked;
    } else {
      state.draft.specialRole = value as RoomSpecialRole;
      if (value !== 'treasure') {
        delete state.draft.keyLocked;
      }
    }
    state.notify();
  });
  roleLabel.appendChild(roleSelect);
  root.appendChild(roleLabel);

  const keyLockedLabel = document.createElement('label');
  const keyLockedCheckbox = document.createElement('input');
  keyLockedCheckbox.type = 'checkbox';
  keyLockedCheckbox.addEventListener('change', () => {
    state.draft.keyLocked = keyLockedCheckbox.checked;
    state.notify();
  });
  keyLockedLabel.append(
    keyLockedCheckbox,
    document.createTextNode('Key-locked (treasure rooms only)'),
  );
  root.appendChild(keyLockedLabel);

  function render(): void {
    const draft = state.draft;
    if (idInput.value !== draft.id) {
      idInput.value = draft.id;
    }
    shapeSelect.value = draft.shape;
    const doorsVisible = draft.shape === '1x1';
    doorsWrap.hidden = !doorsVisible;
    for (const { direction, checkbox } of doorChecks) {
      checkbox.checked = draft.doors[direction];
    }
    if (document.activeElement !== floorTagsInput) {
      floorTagsInput.value = draft.floorTags.join(', ');
    }
    difficultyInput.value = String(draft.difficultyTier);
    weightInput.value = String(draft.weight);
    roleSelect.value = draft.specialRole ?? '';
    keyLockedLabel.hidden = draft.specialRole !== 'treasure';
    keyLockedCheckbox.checked = draft.keyLocked === true;
  }

  const unsubscribe = state.subscribe(render);
  render();

  return {
    destroy(): void {
      unsubscribe();
      root.remove();
    },
  };
}
