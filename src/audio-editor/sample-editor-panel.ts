import { getAudioContext, getMasterGain, resumeAudioContext } from '../app/audio/context.js';
import { decodeArrayBuffer, playSampleBuffer } from '../app/audio/sample-player.js';
import { getAudioAssetUrl } from '../app/audio/sample-assets.js';
import type { InstrumentFilter, SampleEdit, SampleRef } from '../app/audio/types.js';
import { uploadAudioAsset } from './api-client.js';

export interface SampleEditorPanelHandle {
  /** Re-reads `getCurrentSample()` and reloads the form/waveform from it — call after switching which track/SFX/bark is selected, or after a save elsewhere changes it. */
  refresh(): void;
  destroy(): void;
}

const FILTER_TYPES: readonly InstrumentFilter['type'][] = ['lowpass', 'bandpass', 'highpass'];
const NONE = '(none)';
const WAVEFORM_WIDTH = 480;
const WAVEFORM_HEIGHT = 72;

/**
 * "Record it yourself" — a DAW export dropped in here plays instead of the
 * synthesised content above it, cropped/faded/gained/filtered non-
 * destructively at playback time (`app/audio/sample-player.ts`'s
 * `playSampleBuffer`, the exact code the game itself plays a saved
 * recording with). One instance is wired into `track-panel.ts`/`sfx-
 * panel.ts`/`barks-panel.ts` each, against whichever id that panel currently
 * has selected — `opts.getCurrentSample`/`opts.saveSample` are how this stays
 * ignorant of which kind of content it's attached to.
 *
 * The waveform only redraws what's actually decoded in the browser right
 * now: a freshly-picked file (decoded locally, before it's even uploaded) or
 * an already-saved asset loaded back over its `assets/audio/` URL. A
 * recording *just* uploaded this session has no such URL yet —
 * `sample-assets.ts`'s `import.meta.glob` index is resolved once at page
 * load, so a brand-new file on disk needs a reload to appear in it — which
 * is why `refresh()` says so plainly instead of pretending nothing changed.
 */
export function createSampleEditorPanel(
  host: HTMLElement,
  opts: {
    getCurrentSample: () => SampleRef | undefined;
    saveSample: (sample: SampleRef | null) => Promise<void>;
  },
): SampleEditorPanelHandle {
  const root = document.createElement('div');
  root.style.borderTop = '1px solid var(--kb-color-surface-4)';
  root.style.marginTop = '10px';
  root.style.paddingTop = '10px';
  host.appendChild(root);

  const heading = document.createElement('h3');
  heading.textContent = 'Recorded sample';
  heading.style.marginTop = '0';
  heading.style.borderTop = 'none';
  heading.style.paddingTop = '0';
  root.appendChild(heading);

  const hint = document.createElement('p');
  hint.className = 'kb-audio-hint';
  hint.textContent =
    'Upload a WAV/MP3/OGG exported from a DAW to replace the synthesised sound above with a real recording — trim, fades, gain and an optional filter apply on playback, so the original file is never modified.';
  root.appendChild(hint);

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.wav,.mp3,.ogg,audio/*';
  root.appendChild(fileInput);

  const canvas = document.createElement('canvas');
  canvas.width = WAVEFORM_WIDTH;
  canvas.height = WAVEFORM_HEIGHT;
  canvas.style.display = 'block';
  canvas.style.marginTop = '6px';
  canvas.style.background = 'var(--kb-color-surface-2)';
  canvas.style.borderRadius = 'var(--kb-radius-sm)';
  root.appendChild(canvas);

  const trimStartInput = numberField('Trim start (s)', root, 0, 9999, 0.01);
  const trimEndInput = numberField('Trim end (s)', root, 0, 9999, 0.01);
  const fadeInInput = numberField('Fade in (s)', root, 0, 10, 0.01);
  fadeInInput.value = '0.02';
  const fadeOutInput = numberField('Fade out (s)', root, 0, 10, 0.01);
  fadeOutInput.value = '0.05';
  const gainInput = numberField('Gain', root, 0, 2, 0.01);
  gainInput.value = '1';
  const filterTypeSelect = selectField('Filter', [NONE, ...FILTER_TYPES], root);
  const filterFreqInput = numberField('Filter frequency (Hz)', root, 20, 20000, 10);
  filterFreqInput.value = '1000';
  const filterQInput = numberField('Filter Q', root, 0.1, 20, 0.1);
  filterQInput.value = '1';

  const buttonRow = document.createElement('div');
  buttonRow.className = 'kb-audio-button-row';
  root.appendChild(buttonRow);

  const previewButton = makeButton('▶ Preview edit', buttonRow);
  const saveButton = makeButton('Upload & use recording', buttonRow);
  const removeButton = makeButton('Remove recording (use synth)', buttonRow);

  const status = document.createElement('div');
  status.className = 'kb-audio-status';
  root.appendChild(status);

  /** Whichever buffer the waveform/preview/save currently act on — a freshly-picked file, or an already-saved asset loaded back for editing. `null` until one of those has decoded. */
  let currentBuffer: AudioBuffer | null = null;
  /** Set only when a *new* file was picked and hasn't been uploaded yet — `save()` uploads it first; otherwise it re-saves the edit against the already-saved `assetId`. */
  let pendingFile: File | null = null;

  function currentEdit(): SampleEdit {
    const type = filterTypeSelect.value;
    const filter: InstrumentFilter | undefined =
      type === NONE
        ? undefined
        : {
            type: type as InstrumentFilter['type'],
            frequencyHz: Number.parseFloat(filterFreqInput.value) || 1000,
            q: Number.parseFloat(filterQInput.value) || 1,
          };
    return {
      trimStartSeconds: Number.parseFloat(trimStartInput.value) || 0,
      trimEndSeconds: Number.parseFloat(trimEndInput.value) || (currentBuffer?.duration ?? 0),
      fadeInSeconds: Number.parseFloat(fadeInInput.value) || 0,
      fadeOutSeconds: Number.parseFloat(fadeOutInput.value) || 0,
      gain: Number.parseFloat(gainInput.value) || 1,
      ...(filter === undefined ? {} : { filter }),
    };
  }

  function drawWaveform(): void {
    const ctx2d = canvas.getContext('2d');
    if (ctx2d === null) {
      return;
    }
    ctx2d.clearRect(0, 0, canvas.width, canvas.height);
    if (currentBuffer === null) {
      ctx2d.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx2d.font = '11px monospace';
      ctx2d.fillText('no recording loaded', 8, canvas.height / 2 + 4);
      return;
    }
    const data = currentBuffer.getChannelData(0);
    const step = Math.max(1, Math.floor(data.length / canvas.width));
    const mid = canvas.height / 2;
    ctx2d.strokeStyle = '#9d7ee0';
    ctx2d.beginPath();
    for (let x = 0; x < canvas.width; x += 1) {
      let min = 1;
      let max = -1;
      const start = x * step;
      const end = Math.min(start + step, data.length);
      for (let i = start; i < end; i += 1) {
        const value = data[i] ?? 0;
        if (value < min) min = value;
        if (value > max) max = value;
      }
      ctx2d.moveTo(x + 0.5, mid + min * mid);
      ctx2d.lineTo(x + 0.5, mid + max * mid);
    }
    ctx2d.stroke();

    const duration = currentBuffer.duration;
    if (duration > 0) {
      const trimStart = Math.max(
        0,
        Math.min(Number.parseFloat(trimStartInput.value) || 0, duration),
      );
      const trimEnd = Math.max(
        trimStart,
        Math.min(Number.parseFloat(trimEndInput.value) || duration, duration),
      );
      const startX = (trimStart / duration) * canvas.width;
      const endX = (trimEnd / duration) * canvas.width;
      ctx2d.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx2d.fillRect(0, 0, startX, canvas.height);
      ctx2d.fillRect(endX, 0, canvas.width - endX, canvas.height);
    }
  }

  for (const input of [trimStartInput, trimEndInput]) {
    input.addEventListener('input', drawWaveform);
  }

  fileInput.addEventListener('change', () => {
    void onFilePicked();
  });

  async function onFilePicked(): Promise<void> {
    const file = fileInput.files?.[0];
    if (file === undefined) {
      return;
    }
    resumeAudioContext();
    const ctx = getAudioContext();
    if (ctx === null) {
      setStatus('Web Audio is unavailable in this browser.', true);
      return;
    }
    setStatus('Decoding…', false);
    try {
      const bytes = await file.arrayBuffer();
      const buffer = await decodeArrayBuffer(ctx, bytes);
      currentBuffer = buffer;
      pendingFile = file;
      trimStartInput.value = '0';
      trimEndInput.value = String(buffer.duration);
      drawWaveform();
      setStatus(
        `Loaded "${file.name}" — ${buffer.duration.toFixed(2)}s. Adjust below, then "Upload & use recording".`,
        false,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error), true);
    }
  }

  previewButton.addEventListener('click', () => {
    resumeAudioContext();
    const ctx = getAudioContext();
    const destination = getMasterGain();
    if (ctx === null || destination === null || currentBuffer === null) {
      setStatus('Nothing loaded to preview yet.', true);
      return;
    }
    playSampleBuffer(ctx, destination, currentBuffer, currentEdit(), ctx.currentTime, false);
  });

  saveButton.addEventListener('click', () => {
    void save();
  });

  async function save(): Promise<void> {
    if (currentBuffer === null) {
      setStatus('Pick a file first.', true);
      return;
    }
    saveButton.disabled = true;
    setStatus('Saving…', false);
    try {
      let assetId: string;
      if (pendingFile !== null) {
        const bytes = await pendingFile.arrayBuffer();
        assetId = (await uploadAudioAsset(pendingFile.name, bytes)).assetId;
      } else {
        const existing = opts.getCurrentSample();
        if (existing === undefined) {
          setStatus('Pick a file first.', true);
          return;
        }
        assetId = existing.assetId;
      }
      await opts.saveSample({ assetId, edit: currentEdit() });
      pendingFile = null;
      setStatus(`Saved — now plays "${assetId}".`, false);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error), true);
    } finally {
      saveButton.disabled = false;
    }
  }

  removeButton.addEventListener('click', () => {
    void removeSample();
  });

  async function removeSample(): Promise<void> {
    removeButton.disabled = true;
    setStatus('Removing…', false);
    try {
      await opts.saveSample(null);
      currentBuffer = null;
      pendingFile = null;
      fileInput.value = '';
      drawWaveform();
      setStatus('Recording removed — back to the synthesised sound above.', false);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error), true);
    } finally {
      removeButton.disabled = false;
    }
  }

  function setStatus(text: string, isWarning: boolean): void {
    status.textContent = text;
    status.classList.toggle('kb-audio-status-warn', isWarning);
  }

  async function refresh(): Promise<void> {
    pendingFile = null;
    fileInput.value = '';
    const sample = opts.getCurrentSample();
    if (sample === undefined) {
      currentBuffer = null;
      trimStartInput.value = '0';
      trimEndInput.value = '0';
      fadeInInput.value = '0.02';
      fadeOutInput.value = '0.05';
      gainInput.value = '1';
      filterTypeSelect.value = NONE;
      drawWaveform();
      setStatus('No recording yet — playing the synthesised sound above.', false);
      return;
    }
    trimStartInput.value = String(sample.edit.trimStartSeconds);
    trimEndInput.value = String(sample.edit.trimEndSeconds);
    fadeInInput.value = String(sample.edit.fadeInSeconds);
    fadeOutInput.value = String(sample.edit.fadeOutSeconds);
    gainInput.value = String(sample.edit.gain);
    filterTypeSelect.value = sample.edit.filter?.type ?? NONE;
    filterFreqInput.value = String(sample.edit.filter?.frequencyHz ?? 1000);
    filterQInput.value = String(sample.edit.filter?.q ?? 1);

    const url = getAudioAssetUrl(sample.assetId);
    const ctx = getAudioContext();
    if (url === undefined || ctx === null) {
      currentBuffer = null;
      drawWaveform();
      setStatus(
        `Recording "${sample.assetId}" is saved, but this page loaded before that file existed — reload the audio editor to see/hear its waveform here.`,
        false,
      );
      return;
    }
    setStatus('Loading waveform…', false);
    try {
      const response = await fetch(url);
      const bytes = await response.arrayBuffer();
      currentBuffer = await decodeArrayBuffer(ctx, bytes);
      drawWaveform();
      setStatus(`Recording "${sample.assetId}" loaded.`, false);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error), true);
    }
  }

  void refresh();

  return {
    refresh(): void {
      void refresh();
    },
    destroy(): void {
      root.remove();
    },
  };
}

function makeButton(label: string, host: HTMLElement): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  host.appendChild(button);
  return button;
}

function selectField(
  labelText: string,
  options: readonly string[],
  host: HTMLElement,
): HTMLSelectElement {
  const label = document.createElement('label');
  label.textContent = labelText;
  const select = document.createElement('select');
  for (const value of options) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  }
  label.appendChild(select);
  host.appendChild(label);
  return select;
}

function numberField(
  labelText: string,
  host: HTMLElement,
  min: number,
  max: number,
  step: number,
): HTMLInputElement {
  const label = document.createElement('label');
  label.textContent = labelText;
  const input = document.createElement('input');
  input.type = 'number';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = '0';
  label.appendChild(input);
  host.appendChild(label);
  return input;
}
