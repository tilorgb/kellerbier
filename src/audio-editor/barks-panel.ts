import { fetchBarks, saveBark, saveBarkSample } from './api-client.js';
import { createSampleEditorPanel } from './sample-editor-panel.js';
import { getAudioContext, getMasterGain, resumeAudioContext } from '../app/audio/context.js';
import { playTone } from '../app/audio/synth.js';
import type { BarkDefinition, InstrumentDefinition } from '../app/audio/types.js';

export interface BarksPanelHandle {
  destroy(): void;
}

/**
 * The voice-bark half of the editor (`content/audio/barks.ts`) — short,
 * placeholder motifs standing in for real recorded lines
 * (`barks.ts`'s own doc comment). A bark motif is one to three notes played
 * in a row, not a chord and not a full melody, so — unlike the piano roll,
 * built for a whole loop — this is a plain form: the spoken line for
 * reference, an instrument, and the note sequence as a short comma-
 * separated list (`"G4, C5"`), which reads faster than clicking a grid for
 * something this short. Preview plays the same sequential-note code
 * `app/audio/sfx-player.ts`'s `playBark` does, against whatever is
 * currently in the form rather than what's saved.
 */
export function createBarksPanel(
  host: HTMLElement,
  instrumentsById: ReadonlyMap<string, InstrumentDefinition>,
): BarksPanelHandle {
  const root = document.createElement('div');
  root.className = 'kb-audio-panel';
  host.appendChild(root);

  const heading = document.createElement('h2');
  heading.textContent = 'Voice barks';
  root.appendChild(heading);

  const note = document.createElement('p');
  note.className = 'kb-audio-hint';
  note.textContent =
    'Placeholder motifs standing in for real recorded lines — a short synthesised contour, not speech.';
  root.appendChild(note);

  let barksList: BarkDefinition[] = [];

  const idSelect = document.createElement('select');
  root.appendChild(idSelect);

  const textLabel = document.createElement('label');
  textLabel.textContent = 'Spoken line';
  const textInput = document.createElement('input');
  textInput.type = 'text';
  textLabel.appendChild(textInput);
  root.appendChild(textLabel);

  const instrumentLabel = document.createElement('label');
  instrumentLabel.textContent = 'Instrument';
  const instrumentSelect = document.createElement('select');
  for (const instrument of instrumentsById.values()) {
    // A bark motif is a short pitch sequence; `drums` (kind: 'percussion')
    // has no pitches to sequence, so it doesn't belong in this picker.
    if (instrument.kind !== 'tonal') {
      continue;
    }
    const option = document.createElement('option');
    option.value = instrument.id;
    option.textContent = instrument.name;
    instrumentSelect.appendChild(option);
  }
  instrumentLabel.appendChild(instrumentSelect);
  root.appendChild(instrumentLabel);

  const notesLabel = document.createElement('label');
  notesLabel.textContent = 'Notes (in order)';
  const notesInput = document.createElement('input');
  notesInput.type = 'text';
  notesInput.placeholder = 'e.g. G4, C5';
  notesLabel.appendChild(notesInput);
  root.appendChild(notesLabel);

  const durationLabel = document.createElement('label');
  durationLabel.textContent = 'Note length (s)';
  const durationInput = document.createElement('input');
  durationInput.type = 'number';
  durationInput.min = '0.02';
  durationInput.max = '1';
  durationInput.step = '0.01';
  durationLabel.appendChild(durationInput);
  root.appendChild(durationLabel);

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
    getCurrentSample: () => barksList.find((bark) => bark.id === idSelect.value)?.sample,
    saveSample: async (sample) => {
      await saveBarkSample(idSelect.value, sample);
      barksList = await fetchBarks();
    },
  });

  function parseNotes(): string[] {
    return notesInput.value
      .split(',')
      .map((note) => note.trim())
      .filter((note) => note.length > 0);
  }

  function loadIntoForm(bark: BarkDefinition): void {
    textInput.value = bark.text;
    instrumentSelect.value = bark.motif.instrument;
    notesInput.value = bark.motif.notes.join(', ');
    durationInput.value = String(bark.motif.noteDurationSeconds);
  }

  function renderOptions(): void {
    idSelect.innerHTML = '';
    for (const bark of barksList) {
      const option = document.createElement('option');
      option.value = bark.id;
      option.textContent = `${bark.id} — "${bark.text}"`;
      idSelect.appendChild(option);
    }
    const first = barksList[0];
    if (first !== undefined) {
      loadIntoForm(first);
    }
  }

  idSelect.addEventListener('change', () => {
    const bark = barksList.find((b) => b.id === idSelect.value);
    if (bark !== undefined) {
      loadIntoForm(bark);
    }
    sampleEditor.refresh();
  });

  previewButton.addEventListener('click', () => {
    resumeAudioContext();
    const ctx = getAudioContext();
    const destination = getMasterGain();
    const instrument = instrumentsById.get(instrumentSelect.value);
    if (ctx === null || destination === null || instrument === undefined) {
      return;
    }
    const duration = Number.parseFloat(durationInput.value) || 0.15;
    let startTime = ctx.currentTime;
    for (const note of parseNotes()) {
      playTone(ctx, destination, instrument, note, startTime, duration);
      startTime += duration;
    }
  });

  saveButton.addEventListener('click', () => {
    void save();
  });

  async function save(): Promise<void> {
    const barkId = idSelect.value;
    const notes = parseNotes();
    if (notes.length === 0) {
      setStatus('Notes cannot be empty.', true);
      return;
    }
    saveButton.disabled = true;
    setStatus('Saving…', false);
    try {
      await saveBark(barkId, {
        text: textInput.value,
        motif: {
          instrument: instrumentSelect.value,
          notes,
          noteDurationSeconds: Number.parseFloat(durationInput.value) || 0.15,
        },
      });
      barksList = await fetchBarks();
      renderOptions();
      idSelect.value = barkId;
      setStatus(`Saved "${barkId}".`, false);
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
    barksList = await fetchBarks();
    renderOptions();
  })();

  return {
    destroy(): void {
      sampleEditor.destroy();
      root.remove();
    },
  };
}
