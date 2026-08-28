import type { PixelEditorState } from './state.js';

export interface FramesPanelHandle {
  destroy(): void;
}

/**
 * Frame-strip authoring for the 4-6 frame walk / 2-frame idle / hit-flash
 * conventions in `docs/CONTENT_BIBLE.md` §5: add/duplicate/remove frames,
 * onion skin toggle, per-strip duration and loop flag. A single frame saves
 * as a plain sprite; more than one becomes a `*.strip.png` + `*.anim.json`
 * pair (`tools/pixel-editor/server.mjs`'s save handler decides which, from
 * how many frames it is handed — this panel never talks to the server).
 */
export function createFramesPanel(state: PixelEditorState, host: HTMLElement): FramesPanelHandle {
  const root = document.createElement('div');
  root.className = 'kb-pixel-panel';
  host.appendChild(root);

  const heading = document.createElement('h2');
  heading.textContent = 'Frames';
  root.appendChild(heading);

  const strip = document.createElement('div');
  strip.className = 'kb-pixel-frame-strip';
  root.appendChild(strip);

  const controlsRow = document.createElement('div');
  controlsRow.className = 'kb-pixel-frame-controls';
  const addButton = makeButton('+ Frame');
  const duplicateButton = makeButton('Duplicate');
  const removeButton = makeButton('Remove');
  controlsRow.append(addButton, duplicateButton, removeButton);
  root.appendChild(controlsRow);

  addButton.addEventListener('click', () => {
    state.addFrame();
  });
  duplicateButton.addEventListener('click', () => {
    state.duplicateFrame();
  });
  removeButton.addEventListener('click', () => {
    state.removeFrame(state.activeFrameIndex);
  });

  const optionsRow = document.createElement('div');
  optionsRow.className = 'kb-pixel-frame-options';

  const onionCheckbox = document.createElement('input');
  onionCheckbox.type = 'checkbox';
  const onionLabel = wrapCheckbox(onionCheckbox, 'Onion skin');
  onionCheckbox.addEventListener('change', () => {
    state.onionSkin = onionCheckbox.checked;
    state.notify();
  });

  const loopCheckbox = document.createElement('input');
  loopCheckbox.type = 'checkbox';
  const loopLabel = wrapCheckbox(loopCheckbox, 'Loop');
  loopCheckbox.addEventListener('change', () => {
    state.loop = loopCheckbox.checked;
    state.notify();
  });

  const durationLabel = document.createElement('label');
  durationLabel.className = 'kb-pixel-inline-label';
  durationLabel.append('ms/frame');
  const durationInput = document.createElement('input');
  durationInput.type = 'number';
  durationInput.min = '1';
  durationLabel.appendChild(durationInput);
  durationInput.addEventListener('change', () => {
    const value = Number(durationInput.value);
    if (Number.isFinite(value) && value > 0) {
      state.frameDurationMs = value;
      state.notify();
    }
  });

  optionsRow.append(onionLabel, loopLabel, durationLabel);
  root.appendChild(optionsRow);

  function render(): void {
    strip.replaceChildren();
    state.frames.forEach((frame, index) => {
      const thumbButton = document.createElement('button');
      thumbButton.type = 'button';
      thumbButton.className = 'kb-pixel-frame-thumb';
      thumbButton.classList.toggle('kb-pixel-frame-thumb-active', index === state.activeFrameIndex);

      const thumbCanvas = document.createElement('canvas');
      thumbCanvas.width = state.width;
      thumbCanvas.height = state.height;
      const ctx = thumbCanvas.getContext('2d');
      if (ctx !== null) {
        ctx.putImageData(
          new ImageData(new Uint8ClampedArray(frame), state.width, state.height),
          0,
          0,
        );
      }
      thumbButton.appendChild(thumbCanvas);

      const indexLabel = document.createElement('span');
      indexLabel.textContent = String(index + 1);
      thumbButton.appendChild(indexLabel);

      thumbButton.addEventListener('click', () => {
        state.setActiveFrameIndex(index);
      });
      strip.appendChild(thumbButton);
    });

    removeButton.disabled = state.frames.length <= 1;
    onionCheckbox.checked = state.onionSkin;
    loopCheckbox.checked = state.loop;
    if (document.activeElement !== durationInput) {
      durationInput.value = String(state.frameDurationMs);
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

function makeButton(label: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  return button;
}

function wrapCheckbox(checkbox: HTMLInputElement, label: string): HTMLLabelElement {
  const wrapper = document.createElement('label');
  wrapper.className = 'kb-pixel-inline-label';
  wrapper.append(checkbox, label);
  return wrapper;
}
