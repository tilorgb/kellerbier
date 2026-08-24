import { ENEMY_DEFINITIONS } from '../../content/enemies/index.js';
import type { RoomSpawnChoice, RoomSpawnGroup } from '../../content/rooms/definition.js';
import type { EditorCell, EditorState } from '../state.js';

export interface SpawnGroupsPanelHandle {
  destroy(): void;
}

/**
 * `RoomSpawnGroup`/`RoomSpawnChoice` are `readonly`-fielded — the same type a
 * validated template uses, not an editor-only mutable shape — so every edit
 * here replaces the group (or the one choice within it) rather than mutating
 * a field in place.
 */
function replaceGroup(cell: EditorCell, groupIndex: number, patch: Partial<RoomSpawnGroup>): void {
  const group = cell.spawnGroups[groupIndex];
  if (group === undefined) {
    return;
  }
  cell.spawnGroups[groupIndex] = { ...group, ...patch };
}

function replaceChoice(
  cell: EditorCell,
  groupIndex: number,
  choiceIndex: number,
  patch: Partial<RoomSpawnChoice>,
): void {
  const group = cell.spawnGroups[groupIndex];
  if (group === undefined) {
    return;
  }
  const choices = group.choices.map((choice, index) =>
    index === choiceIndex ? { ...choice, ...patch } : choice,
  );
  cell.spawnGroups[groupIndex] = { ...group, choices };
}

function removeChoice(cell: EditorCell, groupIndex: number, choiceIndex: number): void {
  const group = cell.spawnGroups[groupIndex];
  if (group === undefined) {
    return;
  }
  cell.spawnGroups[groupIndex] = {
    ...group,
    choices: group.choices.filter((_choice, index) => index !== choiceIndex),
  };
}

function addChoice(cell: EditorCell, groupIndex: number): void {
  const group = cell.spawnGroups[groupIndex];
  if (group === undefined) {
    return;
  }
  cell.spawnGroups[groupIndex] = {
    ...group,
    choices: [
      ...group.choices,
      { enemyId: ENEMY_DEFINITIONS[0]?.id ?? '', minFloor: 1, maxFloor: 7 },
    ],
  };
}

/**
 * Spawn groups for `state.activeCellIndex`'s cell — the pool of enemy choices
 * (by floor range) an enemy spawn marker on the grid refers to by id. The
 * grid tool places a spawn into whichever group is listed first for the
 * active cell; groups are otherwise only ever referenced by id, never order.
 */
export function createSpawnGroupsPanel(
  state: EditorState,
  host: HTMLElement,
): SpawnGroupsPanelHandle {
  const root = document.createElement('div');
  root.className = 'kb-editor-panel kb-editor-spawn-groups';
  host.appendChild(root);

  const heading = document.createElement('h2');
  heading.textContent = 'Spawn groups';
  root.appendChild(heading);

  const list = document.createElement('div');
  root.appendChild(list);

  const addButton = document.createElement('button');
  addButton.type = 'button';
  addButton.textContent = 'Add spawn group';
  addButton.addEventListener('click', () => {
    const cell = state.draft.cells[state.activeCellIndex];
    if (cell === undefined) {
      return;
    }
    let index = cell.spawnGroups.length + 1;
    while (cell.spawnGroups.some((group) => group.id === `group-${String(index)}`)) {
      index += 1;
    }
    cell.spawnGroups.push({
      id: `group-${String(index)}`,
      count: 1,
      choices: [{ enemyId: ENEMY_DEFINITIONS[0]?.id ?? '', minFloor: 1, maxFloor: 7 }],
    });
    state.notify();
  });
  root.appendChild(addButton);

  function render(): void {
    list.replaceChildren();
    const cell = state.draft.cells[state.activeCellIndex];
    if (cell === undefined) {
      return;
    }
    for (const [groupIndex, group] of cell.spawnGroups.entries()) {
      const groupRow = document.createElement('div');
      groupRow.className = 'kb-editor-spawn-group';

      const idInput = document.createElement('input');
      idInput.type = 'text';
      idInput.value = group.id;
      idInput.addEventListener('change', () => {
        replaceGroup(cell, groupIndex, { id: idInput.value });
        state.notify();
      });

      const countInput = document.createElement('input');
      countInput.type = 'number';
      countInput.min = '1';
      countInput.step = '1';
      countInput.value = String(group.count);
      countInput.addEventListener('input', () => {
        replaceGroup(cell, groupIndex, { count: Number(countInput.value) });
        state.notify();
      });

      const removeGroupButton = document.createElement('button');
      removeGroupButton.type = 'button';
      removeGroupButton.textContent = 'Remove group';
      // Any enemy spawn still pointing at this group's id is left as-is — the
      // validation panel is where an author finds and fixes a now-dangling
      // spawn, not a silent auto-delete here.
      removeGroupButton.addEventListener('click', () => {
        cell.spawnGroups.splice(groupIndex, 1);
        state.notify();
      });

      groupRow.append(labelled('id', idInput), labelled('count', countInput), removeGroupButton);

      const choicesList = document.createElement('div');
      for (const [choiceIndex, choice] of group.choices.entries()) {
        const choiceRow = document.createElement('div');
        choiceRow.className = 'kb-editor-spawn-choice';

        const enemySelect = document.createElement('select');
        for (const enemy of ENEMY_DEFINITIONS) {
          const option = document.createElement('option');
          option.value = enemy.id;
          option.textContent = enemy.id;
          enemySelect.appendChild(option);
        }
        enemySelect.value = choice.enemyId;
        enemySelect.addEventListener('change', () => {
          replaceChoice(cell, groupIndex, choiceIndex, { enemyId: enemySelect.value });
          state.notify();
        });

        const minInput = document.createElement('input');
        minInput.type = 'number';
        minInput.min = '1';
        minInput.step = '1';
        minInput.value = String(choice.minFloor);
        minInput.addEventListener('input', () => {
          replaceChoice(cell, groupIndex, choiceIndex, { minFloor: Number(minInput.value) });
          state.notify();
        });

        const maxInput = document.createElement('input');
        maxInput.type = 'number';
        maxInput.min = '1';
        maxInput.step = '1';
        maxInput.value = String(choice.maxFloor);
        maxInput.addEventListener('input', () => {
          replaceChoice(cell, groupIndex, choiceIndex, { maxFloor: Number(maxInput.value) });
          state.notify();
        });

        const removeChoiceButton = document.createElement('button');
        removeChoiceButton.type = 'button';
        removeChoiceButton.textContent = '×';
        removeChoiceButton.addEventListener('click', () => {
          removeChoice(cell, groupIndex, choiceIndex);
          state.notify();
        });

        choiceRow.append(
          labelled('enemy', enemySelect),
          labelled('min floor', minInput),
          labelled('max floor', maxInput),
          removeChoiceButton,
        );
        choicesList.appendChild(choiceRow);
      }

      const addChoiceButton = document.createElement('button');
      addChoiceButton.type = 'button';
      addChoiceButton.textContent = 'Add choice';
      addChoiceButton.addEventListener('click', () => {
        addChoice(cell, groupIndex);
        state.notify();
      });

      groupRow.append(choicesList, addChoiceButton);
      list.appendChild(groupRow);
    }
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

function labelled(text: string, control: HTMLElement): HTMLLabelElement {
  const label = document.createElement('label');
  label.className = 'kb-editor-inline-label';
  label.append(document.createTextNode(text), control);
  return label;
}
