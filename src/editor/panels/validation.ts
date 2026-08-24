import { ENEMY_DEFINITIONS } from '../../content/enemies/index.js';
import { validateRoomTemplate } from '../../sim/room/template.js';
import { toTemplateJSON, type EditorState } from '../state.js';

export interface ValidationPanelHandle {
  destroy(): void;
  /** Re-runs the schema check and returns whether the draft currently passes it. */
  isValid(): boolean;
}

/**
 * Runs the draft through the same schema gate the game itself loads a room
 * through (`validateRoomTemplate`), and shows the result inline. This is the
 * one thing that gates Save and Playtest — an invalid room cannot be saved
 * (#24's acceptance criteria) and cannot be played, since `GameSim` would
 * throw on it too.
 */
export function createValidationPanel(
  state: EditorState,
  host: HTMLElement,
): ValidationPanelHandle {
  const root = document.createElement('div');
  root.className = 'kb-editor-panel kb-editor-validation';
  host.appendChild(root);

  const message = document.createElement('p');
  root.appendChild(message);

  let valid = false;

  function check(): boolean {
    try {
      validateRoomTemplate(
        toTemplateJSON(state.draft),
        state.draft.id || 'draft',
        ENEMY_DEFINITIONS,
      );
      valid = true;
      message.textContent = 'Valid.';
      message.className = 'kb-editor-validation-ok';
    } catch (error) {
      valid = false;
      message.textContent = error instanceof Error ? error.message : String(error);
      message.className = 'kb-editor-validation-error';
    }
    return valid;
  }

  const unsubscribe = state.subscribe(check);
  check();

  return {
    destroy(): void {
      unsubscribe();
      root.remove();
    },
    isValid(): boolean {
      return check();
    },
  };
}
