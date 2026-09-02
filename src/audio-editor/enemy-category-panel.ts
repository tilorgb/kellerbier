import {
  fetchEnemies,
  fetchEnemyCategories,
  fetchSfx,
  saveEnemyCategories,
  type EnemySummary,
} from './api-client.js';
import { getAudioContext, getMasterGain, resumeAudioContext } from '../app/audio/context.js';
import { playSfxSound } from '../app/audio/synth.js';
import type { InstrumentDefinition, SfxDefinition } from '../app/audio/types.js';
import type { EnemySfxCategory } from '../content/audio/sfx.js';

export interface EnemyCategoryPanelHandle {
  destroy(): void;
}

const CATEGORIES: readonly EnemySfxCategory[] = ['squelch', 'metal', 'animal', 'folk', 'oompah'];

/**
 * "Which of the five timbre families does this enemy's hit/death sound use"
 * — `content/audio/sfx.ts`'s `ENEMY_SFX_CATEGORY` map, edited as one table
 * rather than one form per enemy: the whole point of this map is *sorting*
 * — comparing an enemy against its neighbours ("is the Bierratte really the
 * same timbre as the Kellerassel?") — which a picker that shows one enemy
 * at a time can't support. Every row previews its *current* selection's
 * hit/death pair immediately, before saving, so a re-sort is heard before
 * it's committed.
 *
 * One save for the whole table, not per row: `ENEMY_SFX_CATEGORY` is a
 * single object in `sfx.ts`, and the server validates the submitted map
 * covers every enemy in the current roster before writing it (the same
 * exhaustiveness `tests/content/audio.test.ts` checks) — a per-row save
 * could leave the file in a state CI would immediately fail.
 */
export function createEnemyCategoryPanel(
  host: HTMLElement,
  instrumentsById: ReadonlyMap<string, InstrumentDefinition>,
): EnemyCategoryPanelHandle {
  const root = document.createElement('div');
  root.className = 'kb-audio-panel kb-audio-panel-wide';
  host.appendChild(root);

  const heading = document.createElement('h2');
  heading.textContent = 'Enemy sound categories';
  root.appendChild(heading);

  const table = document.createElement('div');
  table.className = 'kb-audio-enemy-table';
  root.appendChild(table);

  const buttonRow = document.createElement('div');
  buttonRow.className = 'kb-audio-button-row';
  root.appendChild(buttonRow);

  const saveButton = document.createElement('button');
  saveButton.type = 'button';
  saveButton.textContent = 'Save all';
  buttonRow.appendChild(saveButton);

  const status = document.createElement('div');
  status.className = 'kb-audio-status';
  root.appendChild(status);

  const selectByEnemyId = new Map<string, HTMLSelectElement>();
  let sfxById = new Map<string, SfxDefinition>();

  function preview(category: string): void {
    resumeAudioContext();
    const ctx = getAudioContext();
    const destination = getMasterGain();
    const sfx = sfxById.get(`hit-${category}`);
    if (ctx === null || destination === null || sfx === undefined) {
      return;
    }
    playSfxSound(ctx, destination, sfx, instrumentsById);
  }

  function buildRow(enemy: EnemySummary, currentCategory: EnemySfxCategory): void {
    const row = document.createElement('div');
    row.className = 'kb-audio-enemy-row';

    const label = document.createElement('span');
    label.className = 'kb-audio-enemy-label';
    label.textContent = `${enemy.name} (${enemy.id})`;
    row.appendChild(label);

    const select = document.createElement('select');
    for (const category of CATEGORIES) {
      const option = document.createElement('option');
      option.value = category;
      option.textContent = category;
      select.appendChild(option);
    }
    select.value = currentCategory;
    row.appendChild(select);
    selectByEnemyId.set(enemy.id, select);

    const previewButton = document.createElement('button');
    previewButton.type = 'button';
    previewButton.textContent = '▶';
    previewButton.title = `Preview the "${currentCategory}" hit sound`;
    previewButton.addEventListener('click', () => {
      preview(select.value);
    });
    row.appendChild(previewButton);

    table.appendChild(row);
  }

  saveButton.addEventListener('click', () => {
    void save();
  });

  async function save(): Promise<void> {
    const map: Record<string, EnemySfxCategory> = {};
    for (const [enemyId, select] of selectByEnemyId) {
      map[enemyId] = select.value as EnemySfxCategory;
    }
    saveButton.disabled = true;
    setStatus('Saving…', false);
    try {
      await saveEnemyCategories(map);
      setStatus(`Saved ${String(selectByEnemyId.size)} enemies.`, false);
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
    const [enemies, categories, sfx] = await Promise.all([
      fetchEnemies(),
      fetchEnemyCategories(),
      fetchSfx(),
    ]);
    sfxById = new Map(sfx.map((def) => [def.id, def]));
    for (const enemy of enemies) {
      buildRow(enemy, categories[enemy.id] ?? 'squelch');
    }
  })();

  return {
    destroy(): void {
      root.remove();
    },
  };
}
