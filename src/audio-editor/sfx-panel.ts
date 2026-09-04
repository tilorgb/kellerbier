import { fetchSfx, saveSfx, saveSfxSample } from './api-client.js';
import { createSampleEditorPanel } from './sample-editor-panel.js';
import { getAudioContext, getMasterGain, resumeAudioContext } from '../app/audio/context.js';
import { playSfxSound } from '../app/audio/synth.js';
import type { InstrumentDefinition, InstrumentFilter, SfxDefinition } from '../app/audio/types.js';

export interface SfxPanelHandle {
  destroy(): void;
}

const FILTER_TYPES: readonly InstrumentFilter['type'][] = ['lowpass', 'bandpass', 'highpass'];
const NONE = '(none)';

/**
 * The SFX half of the editor: every one-shot cue in `content/audio/sfx.ts`
 * (hits, deaths, pickups, doors, footsteps, UI actions) is filtered-noise
 * and/or a pitched tone parameters, not notes on a grid — a piano roll has
 * nothing to offer it, so this is a plain parameter form instead, with the
 * same "preview through the real synth code" property the piano roll has
 * (`app/audio/synth.ts`'s `playSfxSound`, unmodified).
 */
export function createSfxPanel(
  host: HTMLElement,
  instrumentsById: ReadonlyMap<string, InstrumentDefinition>,
): SfxPanelHandle {
  const root = document.createElement('div');
  root.className = 'kb-audio-panel';
  host.appendChild(root);

  const heading = document.createElement('h2');
  heading.textContent = 'SFX';
  root.appendChild(heading);

  let sfxList: SfxDefinition[] = [];

  const idSelect = document.createElement('select');
  root.appendChild(idSelect);

  const descriptionLabel = document.createElement('label');
  descriptionLabel.textContent = 'Description';
  const descriptionInput = document.createElement('input');
  descriptionInput.type = 'text';
  descriptionLabel.appendChild(descriptionInput);
  root.appendChild(descriptionLabel);

  // --- Noise layer ---------------------------------------------------------
  const noiseHeading = document.createElement('h3');
  noiseHeading.textContent = 'Noise layer';
  root.appendChild(noiseHeading);

  const noiseEnabled = checkboxField('Enabled', root);
  const filterType = selectField('Filter', [NONE, ...FILTER_TYPES], root);
  const filterFrequency = numberField('Frequency (Hz)', root, 20, 20000, 10);
  const filterQ = numberField('Q', root, 0.1, 20, 0.1);
  const noiseDuration = numberField('Duration (s)', root, 0.01, 2, 0.01);
  const noiseGain = numberField('Gain', root, 0, 1, 0.01);

  // --- Tone layer ------------------------------------------------------------
  const toneHeading = document.createElement('h3');
  toneHeading.textContent = 'Tone layer';
  root.appendChild(toneHeading);

  const toneEnabled = checkboxField('Enabled', root);
  const toneInstrument = document.createElement('select');
  for (const instrument of instrumentsById.values()) {
    // A tone layer names a pitch; `drums` (kind: 'percussion') has none —
    // its `NoteEvent.note` means a `DrumVoice.id` instead, so it never
    // belongs in a picker that feeds `SfxDefinition`'s tone.instrument.
    if (instrument.kind !== 'tonal') {
      continue;
    }
    const option = document.createElement('option');
    option.value = instrument.id;
    option.textContent = instrument.name;
    toneInstrument.appendChild(option);
  }
  const toneInstrumentLabel = document.createElement('label');
  toneInstrumentLabel.textContent = 'Instrument';
  toneInstrumentLabel.appendChild(toneInstrument);
  root.appendChild(toneInstrumentLabel);

  const toneNoteLabel = document.createElement('label');
  toneNoteLabel.textContent = 'Note';
  const toneNote = document.createElement('input');
  toneNote.type = 'text';
  toneNote.placeholder = 'e.g. C4';
  toneNoteLabel.appendChild(toneNote);
  root.appendChild(toneNoteLabel);

  const toneDuration = numberField('Duration (s)', root, 0.01, 2, 0.01);
  const pitchJitter = numberField('Pitch jitter (cents)', root, 0, 1200, 10);

  const buttonRow = document.createElement('div');
  buttonRow.className = 'kb-audio-button-row';
  root.appendChild(buttonRow);

  const previewButton = document.createElement('button');
  previewButton.type = 'button';
  previewButton.textContent = '▶ Preview';
  buttonRow.appendChild(previewButton);

  const saveButton = document.createElement('button');
  saveButton.type = 'button';
  saveButton.textContent = 'Save';
  buttonRow.appendChild(saveButton);

  const status = document.createElement('div');
  status.className = 'kb-audio-status';
  root.appendChild(status);

  const sampleEditor = createSampleEditorPanel(root, {
    getCurrentSample: () => sfxList.find((sfx) => sfx.id === idSelect.value)?.sample,
    saveSample: async (sample) => {
      await saveSfxSample(idSelect.value, sample);
      sfxList = await fetchSfx();
    },
  });

  function currentDefinition(): Omit<SfxDefinition, 'id'> {
    const type = filterType.value;
    const noise = noiseEnabled.checked
      ? {
          durationSeconds: Number.parseFloat(noiseDuration.value) || 0.05,
          gain: Number.parseFloat(noiseGain.value) || 0.3,
          ...(type === NONE
            ? {}
            : {
                filter: {
                  type: type as InstrumentFilter['type'],
                  frequencyHz: Number.parseFloat(filterFrequency.value) || 1000,
                  q: Number.parseFloat(filterQ.value) || 1,
                },
              }),
        }
      : undefined;
    const tone = toneEnabled.checked
      ? {
          instrument: toneInstrument.value,
          note: toneNote.value || 'C4',
          durationSeconds: Number.parseFloat(toneDuration.value) || 0.1,
        }
      : undefined;
    const jitter = Number.parseFloat(pitchJitter.value);
    return {
      description: descriptionInput.value,
      ...(noise === undefined ? {} : { noise }),
      ...(tone === undefined ? {} : { tone }),
      ...(jitter > 0 ? { pitchJitterCents: jitter } : {}),
    };
  }

  function loadIntoForm(def: SfxDefinition): void {
    descriptionInput.value = def.description;
    noiseEnabled.checked = def.noise !== undefined;
    filterType.value = def.noise?.filter?.type ?? NONE;
    filterFrequency.value = String(def.noise?.filter?.frequencyHz ?? 1000);
    filterQ.value = String(def.noise?.filter?.q ?? 1);
    noiseDuration.value = String(def.noise?.durationSeconds ?? 0.1);
    noiseGain.value = String(def.noise?.gain ?? 0.3);
    toneEnabled.checked = def.tone !== undefined;
    toneInstrument.value = def.tone?.instrument ?? 'bell';
    toneNote.value = def.tone?.note ?? 'C4';
    toneDuration.value = String(def.tone?.durationSeconds ?? 0.1);
    pitchJitter.value = String(def.pitchJitterCents ?? 0);
  }

  function renderOptions(): void {
    idSelect.innerHTML = '';
    for (const sfx of sfxList) {
      const option = document.createElement('option');
      option.value = sfx.id;
      option.textContent = `${sfx.id} — ${sfx.description}`;
      idSelect.appendChild(option);
    }
    const first = sfxList[0];
    if (first !== undefined) {
      loadIntoForm(first);
    }
  }

  idSelect.addEventListener('change', () => {
    const sfx = sfxList.find((s) => s.id === idSelect.value);
    if (sfx !== undefined) {
      loadIntoForm(sfx);
    }
    sampleEditor.refresh();
  });

  previewButton.addEventListener('click', () => {
    resumeAudioContext();
    const ctx = getAudioContext();
    const destination = getMasterGain();
    if (ctx === null || destination === null) {
      return;
    }
    playSfxSound(ctx, destination, { id: idSelect.value, ...currentDefinition() }, instrumentsById);
  });

  saveButton.addEventListener('click', () => {
    void save();
  });

  async function save(): Promise<void> {
    const sfxId = idSelect.value;
    saveButton.disabled = true;
    setStatus('Saving…', false);
    try {
      await saveSfx(sfxId, currentDefinition());
      sfxList = await fetchSfx();
      renderOptions();
      idSelect.value = sfxId;
      setStatus(`Saved "${sfxId}".`, false);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error), true);
    } finally {
      saveButton.disabled = false;
    }
  }

  function setStatus(text: string, isWarning: boolean): void {
    status.textContent = text;
    status.classList.toggle('kb-audio-status-warn', isWarning);
  }

  void (async () => {
    sfxList = await fetchSfx();
    renderOptions();
  })();

  return {
    destroy(): void {
      sampleEditor.destroy();
      root.remove();
    },
  };
}

function checkboxField(labelText: string, host: HTMLElement): HTMLInputElement {
  const label = document.createElement('label');
  label.textContent = labelText;
  const input = document.createElement('input');
  input.type = 'checkbox';
  label.appendChild(input);
  host.appendChild(label);
  return input;
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
  label.appendChild(input);
  host.appendChild(label);
  return input;
}
