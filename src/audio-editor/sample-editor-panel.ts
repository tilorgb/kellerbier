import { getAudioContext, getMasterGain, resumeAudioContext } from '../app/audio/context.js';
import { decodeArrayBuffer, playSampleBuffer } from '../app/audio/sample-player.js';
import { getAudioAssetUrl } from '../app/audio/sample-assets.js';
import type { InstrumentFilter, SampleEdit, SampleRef } from '../app/audio/types.js';
import { base64ToArrayBuffer, generateSoundTakes, uploadAudioAsset } from './api-client.js';
import type { GeneratedOrigin } from './api-client.js';
import type { StagedFile, StagedSample } from './sfx-staging.js';

/** What the sample editor hands to `opts.staging.stage`. */
export type StagedChange =
  | { readonly remove: true }
  | {
      readonly remove: false;
      readonly edit: SampleEdit;
      readonly file?: StagedFile;
      readonly assetId?: string;
    };

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
 *
 * `opts.generate` adds a third source next to those two: a take prompted out
 * of the local sound bench (`tools/audio-editor/sound-bench.mjs`). Choosing
 * one puts it exactly where a picked file would be — decoded, pending, not
 * yet uploaded — so trimming it, previewing it and "Upload & use recording"
 * are the one code path, and the only thing a generated take carries extra
 * is where it came from. Only the SFX panel passes it: the model behind the
 * bench makes foley, not music or a voice line.
 */
export function createSampleEditorPanel(
  host: HTMLElement,
  opts: {
    getCurrentSample: () => SampleRef | undefined;
    saveSample: (sample: SampleRef | null) => Promise<void>;
    /** Present to offer "Generate"; `suggestedName` is the asset name a chosen take is saved under when "Save as" is left empty. */
    generate?: { suggestedName: () => string; suggestedPrompt: () => string };
    /**
     * Present to stage instead of save: "Upload & use recording" and "Remove"
     * hand their result to `stage` (nothing is written to the repo, so the
     * dev server has nothing to reload on), and `getStaged` is what a
     * selected sound shows and previews while a change is waiting.
     */
    staging?: {
      getStaged: () => StagedSample | undefined;
      stage: (change: StagedChange) => Promise<void>;
    };
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

  const generator = opts.generate === undefined ? null : buildGenerator(root);

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
  /** Set alongside `pendingFile` when that file is a generated take rather than a picked one — `save()` passes it on so the upload records the take's origin. */
  let pendingGenerated: GeneratedOrigin | null = null;

  if (generator !== null) {
    generator.runButton.addEventListener('click', () => {
      void generate(generator);
    });
  }

  async function generate(controls: GeneratorControls): Promise<void> {
    const prompt = controls.promptInput.value.trim();
    if (prompt.length === 0) {
      setStatus('Describe the sound first.', true);
      return;
    }
    resumeAudioContext();
    const ctx = getAudioContext();
    if (ctx === null) {
      setStatus('Web Audio is unavailable in this browser.', true);
      return;
    }
    controls.runButton.disabled = true;
    controls.takeList.replaceChildren();
    setStatus(
      'Generating… the first run of a session loads the model and can take minutes.',
      false,
    );
    try {
      const result = await generateSoundTakes({
        prompt,
        seconds: Number.parseFloat(controls.secondsInput.value) || 3,
        pick: controls.pickSelect.value === 'all' ? 'all' : 'loudest',
      });
      for (const take of result.takes) {
        const bytes = base64ToArrayBuffer(take.dataBase64);
        // `decodeAudioData` detaches the buffer it is given; the copy is what gets uploaded.
        const buffer = await decodeArrayBuffer(ctx, bytes.slice(0));
        const origin: GeneratedOrigin = {
          prompt: result.prompt,
          seed: result.seed,
          take: take.take,
          count: result.count,
        };
        const notes = [`${take.seconds.toFixed(2)}s`];
        if (take.fillsTake) {
          notes.push('never goes quiet');
        } else if (take.events > 1) {
          notes.push(
            controls.pickSelect.value === 'all'
              ? `${String(take.events)} sounds`
              : `1 of ${String(take.events)} sounds`,
          );
        }
        addTakeRow(controls, `Take ${String(take.take)} · ${notes.join(' · ')}`, buffer, () => {
          const typed = controls.nameInput.value.trim();
          const name = typed.length > 0 ? typed : (opts.generate?.suggestedName() ?? 'take');
          adoptFile(new File([bytes], `${name}.${result.extension}`), buffer, origin);
        });
      }
      const dropped = result.dropped > 0 ? ` (${String(result.dropped)} silent, dropped)` : '';
      setStatus(
        result.takes.length === 0
          ? `No usable take${dropped} — reword the sound and try again.`
          : `${String(result.takes.length)} takes${dropped}. Listen, then "Use this" on one.`,
        result.takes.length === 0,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error), true);
    } finally {
      controls.runButton.disabled = false;
    }
  }

  function addTakeRow(
    controls: GeneratorControls,
    label: string,
    buffer: AudioBuffer,
    use: () => void,
  ): void {
    const row = document.createElement('div');
    row.className = 'kb-audio-button-row';
    row.style.alignItems = 'center';
    row.style.marginBottom = '4px';
    const text = document.createElement('span');
    text.textContent = label;
    text.style.flex = '1 1 auto';
    row.appendChild(text);
    makeButton('▶', row).addEventListener('click', () => {
      resumeAudioContext();
      const ctx = getAudioContext();
      const destination = getMasterGain();
      if (ctx !== null && destination !== null) {
        playSampleBuffer(ctx, destination, buffer, wholeBufferEdit(buffer), ctx.currentTime, false);
      }
    });
    makeButton('Use this', row).addEventListener('click', use);
    controls.takeList.appendChild(row);
  }

  /** A file that is loaded but not uploaded yet, whichever way it got here: the one state both the file picker and a chosen take end in. */
  function adoptFile(file: File, buffer: AudioBuffer, generated: GeneratedOrigin | null): void {
    currentBuffer = buffer;
    pendingFile = file;
    pendingGenerated = generated;
    trimStartInput.value = '0';
    trimEndInput.value = String(buffer.duration);
    drawWaveform();
    setStatus(
      `Loaded "${file.name}" — ${buffer.duration.toFixed(2)}s. Adjust below, then "Upload & use recording".`,
      false,
    );
  }

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
      adoptFile(file, buffer, null);
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
      if (opts.staging !== undefined) {
        const staged = opts.staging.getStaged();
        const edit = currentEdit();
        if (pendingFile !== null) {
          const file: StagedFile = {
            name: pendingFile.name,
            bytes: await pendingFile.arrayBuffer(),
            ...(pendingGenerated === null ? {} : { generated: pendingGenerated }),
          };
          await opts.staging.stage({ remove: false, edit, file });
        } else if (staged?.file !== undefined) {
          await opts.staging.stage({ remove: false, edit, file: staged.file });
        } else {
          const assetId = staged?.assetId ?? opts.getCurrentSample()?.assetId;
          if (assetId === undefined) {
            setStatus('Pick a file first.', true);
            return;
          }
          await opts.staging.stage({ remove: false, edit, assetId });
        }
        pendingFile = null;
        pendingGenerated = null;
        // The host re-selects and calls `refresh()`, which reports the staged state.
        return;
      }
      let assetId: string;
      if (pendingFile !== null) {
        const bytes = await pendingFile.arrayBuffer();
        assetId = (await uploadAudioAsset(pendingFile.name, bytes, pendingGenerated ?? undefined))
          .assetId;
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
      pendingGenerated = null;
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
      if (opts.staging !== undefined) {
        await opts.staging.stage({ remove: true });
        return;
      }
      await opts.saveSample(null);
      currentBuffer = null;
      pendingFile = null;
      pendingGenerated = null;
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
    pendingGenerated = null;
    fileInput.value = '';
    if (generator !== null) {
      // Takes made for the previously selected sound are not candidates for this one.
      generator.takeList.replaceChildren();
      generator.nameInput.value = '';
      generator.promptInput.value = opts.generate?.suggestedPrompt() ?? '';
    }
    const staged = opts.staging?.getStaged();
    if (staged !== undefined && !staged.remove && staged.edit !== undefined) {
      const ctx = getAudioContext();
      const { edit } = staged;
      trimStartInput.value = String(edit.trimStartSeconds);
      trimEndInput.value = String(edit.trimEndSeconds);
      fadeInInput.value = String(edit.fadeInSeconds);
      fadeOutInput.value = String(edit.fadeOutSeconds);
      gainInput.value = String(edit.gain);
      filterTypeSelect.value = edit.filter?.type ?? NONE;
      filterFreqInput.value = String(edit.filter?.frequencyHz ?? 1000);
      filterQInput.value = String(edit.filter?.q ?? 1);
      try {
        if (staged.file !== undefined && ctx !== null) {
          currentBuffer = await decodeArrayBuffer(ctx, staged.file.bytes.slice(0));
        } else {
          const url = staged.assetId === undefined ? undefined : getAudioAssetUrl(staged.assetId);
          currentBuffer =
            url === undefined || ctx === null
              ? null
              : await decodeArrayBuffer(ctx, await (await fetch(url)).arrayBuffer());
        }
      } catch (error) {
        currentBuffer = null;
        setStatus(error instanceof Error ? error.message : String(error), true);
        return;
      }
      drawWaveform();
      setStatus('Staged — plays in the game after "Apply staged".', false);
      return;
    }
    const sample = staged?.remove === true ? undefined : opts.getCurrentSample();
    if (sample === undefined) {
      currentBuffer = null;
      trimStartInput.value = '0';
      trimEndInput.value = '0';
      fadeInInput.value = '0.02';
      fadeOutInput.value = '0.05';
      gainInput.value = '1';
      filterTypeSelect.value = NONE;
      drawWaveform();
      setStatus(
        staged?.remove === true
          ? 'Removal staged — back to the synthesised sound after "Apply staged".'
          : 'No recording yet — playing the synthesised sound above.',
        false,
      );
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

interface GeneratorControls {
  readonly promptInput: HTMLTextAreaElement;
  readonly secondsInput: HTMLInputElement;
  readonly pickSelect: HTMLSelectElement;
  readonly nameInput: HTMLInputElement;
  readonly runButton: HTMLButtonElement;
  readonly takeList: HTMLElement;
}

const PICK_ONE_SHOT = 'the loudest sound (a one-shot)';
const PICK_ALL = 'everything (a sequence)';

/** The "or generate one" block under the file picker — DOM only; `createSampleEditorPanel` owns what the controls do. */
function buildGenerator(host: HTMLElement): GeneratorControls {
  const hint = document.createElement('p');
  hint.className = 'kb-audio-hint';
  hint.style.marginTop = '10px';
  hint.textContent =
    'Or generate one: describe the source, the action and how it is recorded. Needs the local sound bench running (start-sound-bench.bat).';
  host.appendChild(hint);

  const promptInput = document.createElement('textarea');
  promptInput.rows = 2;
  promptInput.placeholder =
    'heavy glass beer mug set down hard on a wooden table, single impact, close microphone, dry';
  promptInput.style.width = '100%';
  promptInput.style.font = 'inherit';
  promptInput.style.marginBottom = '8px';
  host.appendChild(promptInput);

  const secondsInput = numberField('Take length (s)', host, 1, 20, 0.5);
  secondsInput.value = '3';
  const pickSelect = selectField('Keep', [PICK_ONE_SHOT, PICK_ALL], host);
  // `selectField` uses its label as the value; the request wants the bench's own words.
  for (const option of pickSelect.options) {
    option.value = option.textContent === PICK_ALL ? 'all' : 'loudest';
  }
  const nameInput = textField('Save as', host);
  nameInput.placeholder = "the sound's own id";

  const buttonRow = document.createElement('div');
  buttonRow.className = 'kb-audio-button-row';
  buttonRow.style.marginBottom = '8px';
  host.appendChild(buttonRow);
  const runButton = makeButton('Generate takes', buttonRow);

  const takeList = document.createElement('div');
  host.appendChild(takeList);

  return { promptInput, secondsInput, pickSelect, nameInput, runButton, takeList };
}

/** The edit that plays a buffer exactly as it is — for auditioning a take before it has an edit of its own. */
function wholeBufferEdit(buffer: AudioBuffer): SampleEdit {
  return {
    trimStartSeconds: 0,
    trimEndSeconds: buffer.duration,
    fadeInSeconds: 0,
    fadeOutSeconds: 0,
    gain: 1,
  };
}

function textField(labelText: string, host: HTMLElement): HTMLInputElement {
  const label = document.createElement('label');
  label.textContent = labelText;
  const input = document.createElement('input');
  input.type = 'text';
  input.style.width = '200px';
  label.appendChild(input);
  host.appendChild(label);
  return input;
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
