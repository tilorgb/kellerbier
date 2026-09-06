import { MathUtils } from 'three';
import type { GameView } from '../render/view.js';
import { GameViewDefaults } from '../render/world/camera.js';

/**
 * A dev-only panel of three sliders for the camera — elevation, lens, zoom —
 * bound live to the current `GameView`, and remembered in `localStorage` so a
 * reload keeps the angle being tried.
 *
 * The camera angle is the one presentation number that cannot be tuned from
 * a screenshot: how much depth a room needs is felt, in motion, dodging. This
 * is the knob for feeling it. Whatever it settles on becomes the constants in
 * `render/world/camera.ts`; the panel itself is `import.meta.env.DEV` only
 * and never reaches a player.
 */
export interface CameraTuning {
  readonly elevationDegrees: number;
  readonly fov: number;
  readonly fit: number;
}

const STORAGE_KEY = 'kellerbier.cameraTuning';

export interface CameraTuningPanel {
  /** Applies the current values to a (new) view. */
  apply(view: GameView): void;
  destroy(): void;
}

function load(defaults: CameraTuning): CameraTuning {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      return defaults;
    }
    const parsed = JSON.parse(raw) as Partial<Record<keyof CameraTuning, unknown>>;
    const number = (value: unknown, fallback: number): number =>
      typeof value === 'number' && Number.isFinite(value) ? value : fallback;
    return {
      elevationDegrees: number(parsed.elevationDegrees, defaults.elevationDegrees),
      fov: number(parsed.fov, defaults.fov),
      fit: number(parsed.fit, defaults.fit),
    };
  } catch {
    return defaults;
  }
}

function save(tuning: CameraTuning): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tuning));
  } catch {
    // A blocked localStorage loses the setting on reload; nothing else.
  }
}

export function createCameraTuningPanel(
  host: HTMLElement,
  getView: () => GameView | undefined,
): CameraTuningPanel {
  const defaults: CameraTuning = {
    elevationDegrees: Math.round(MathUtils.radToDeg(GameViewDefaults.elevation)),
    fov: GameViewDefaults.fov,
    fit: GameViewDefaults.fit,
  };
  let tuning = load(defaults);

  const panel = document.createElement('div');
  panel.id = 'camera-tuning';
  panel.style.cssText =
    'position:absolute;top:40px;right:8px;z-index:10;display:grid;grid-template-columns:auto 1fr auto;' +
    'gap:4px 6px;align-items:center;font:12px monospace;color:#cfc6bb;background:rgba(11,10,13,.7);' +
    'border:1px solid #3a2f45;border-radius:4px;padding:4px 6px;min-width:220px';

  const title = document.createElement('div');
  title.textContent = 'camera';
  title.style.gridColumn = '1 / 3';
  panel.appendChild(title);
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.textContent = 'reset';
  reset.style.cssText =
    'font:12px monospace;background:#241d2b;color:#cfc6bb;border:1px solid #54445f;border-radius:3px;padding:1px 6px;cursor:pointer';
  panel.appendChild(reset);

  const apply = (view: GameView | undefined): void => {
    if (view === undefined) {
      return;
    }
    view.camera.setFov(tuning.fov);
    view.camera.setFit(tuning.fit);
    view.setElevation(MathUtils.degToRad(tuning.elevationDegrees));
  };

  const slider = (
    label: string,
    key: keyof CameraTuning,
    min: number,
    max: number,
    step: number,
    format: (value: number) => string,
  ): (() => void) => {
    const name = document.createElement('label');
    name.textContent = label;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.style.width = '110px';
    const value = document.createElement('span');
    value.style.minWidth = '5ch';
    value.style.textAlign = 'right';
    const refresh = (): void => {
      input.value = String(tuning[key]);
      value.textContent = format(tuning[key]);
    };
    input.addEventListener('input', () => {
      tuning = { ...tuning, [key]: Number(input.value) };
      value.textContent = format(tuning[key]);
      save(tuning);
      apply(getView());
    });
    // A slider steals the arrow keys the game aims with; hand focus back.
    input.addEventListener('change', () => {
      input.blur();
    });
    panel.append(name, input, value);
    refresh();
    return refresh;
  };

  const refreshers = [
    slider('angle', 'elevationDegrees', 30, 88, 1, (v) => `${String(v)}°`),
    slider('lens', 'fov', 18, 55, 1, (v) => String(v)),
    slider('zoom', 'fit', 0.8, 1.2, 0.005, (v) => v.toFixed(3)),
  ];
  reset.addEventListener('click', () => {
    tuning = defaults;
    save(tuning);
    for (const refresh of refreshers) {
      refresh();
    }
    apply(getView());
    reset.blur();
  });

  host.appendChild(panel);
  return {
    apply,
    destroy: () => {
      panel.remove();
    },
  };
}
