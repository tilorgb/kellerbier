import type { SimTuning } from '../sim/tuning.js';
import {
  DEFAULT_ENEMY_TUNING,
  DEFAULT_IMPACT_TUNING,
  DEFAULT_ITEM_POOL_TUNING,
  DEFAULT_MOVEMENT_TUNING,
  DEFAULT_PICKUP_TUNING,
  DEFAULT_PROMILLE_TUNING,
  DEFAULT_SHOOTING_TUNING,
} from '../sim/tuning.js';
import { injectDevUiTokens } from '../dev-ui/tokens.js';

/**
 * The tuning window.
 *
 * Every number in `sim/tuning.ts` is one somebody has to feel their way to, and
 * feeling your way to a number through an edit-save-reload cycle is feeling
 * your way to roughly the first number that is not obviously wrong. Here they
 * are sliders, bound straight to the live tuning objects, and the game is still
 * running while they move.
 *
 * It is DOM rather than drawn into the canvas on purpose. A slider is a
 * solved problem in HTML, it costs the frame loop nothing, and the whole of
 * `src/debug/` is behind a dynamic import that a production build never
 * reaches — so none of this ships.
 *
 * The values found here have to get back into the repository to survive a
 * reload, which is what **Copy** is for: it puts the changed fields on the
 * clipboard in the shape `tuning.ts` declares them, ready to be pasted over the
 * defaults.
 */

interface FieldSpec {
  readonly key: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  /** What moving it does, in the words a player would use. */
  readonly hint: string;
}

interface GroupSpec {
  readonly title: string;
  readonly group: 'movement' | 'shooting' | 'impact' | 'enemy' | 'promille' | 'pickup' | 'itemPool';
  readonly fields: readonly FieldSpec[];
}

/**
 * Ranges, chosen so the whole slider is worth dragging.
 *
 * A range wide enough to contain every conceivable value spends most of its
 * travel on values nobody wants. These are roughly a quarter to four times the
 * current default: far enough to find out that the default is wrong, close
 * enough that a pixel of drag is a change you can feel.
 */
const GROUPS: readonly GroupSpec[] = [
  {
    title: 'movement',
    group: 'movement',
    fields: [
      { key: 'maxSpeed', min: 0.5, max: 8, step: 0.1, hint: 'top speed, px/tick' },
      { key: 'ticksToTopSpeed', min: 1, max: 30, step: 1, hint: 'ticks to reach it' },
      { key: 'ticksToStop', min: 1, max: 40, step: 1, hint: 'ticks to slide to rest' },
      { key: 'turnBoost', min: 1, max: 4, step: 0.1, hint: 'help when reversing' },
      { key: 'cornerForgiveness', min: 0, max: 12, step: 0.5, hint: 'px nudged around a corner' },
      { key: 'cornerNudgeSpeed', min: 0.25, max: 4, step: 0.25, hint: 'px/tick of that nudge' },
      { key: 'contactDrag', min: 0, max: 1, step: 0.05, hint: 'how hard bodies hold you' },
      { key: 'pushDamping', min: 0.5, max: 0.98, step: 0.01, hint: 'how long a shove lasts' },
      { key: 'maxPush', min: 1, max: 16, step: 0.5, hint: 'largest shove carried' },
    ],
  },
  {
    title: 'shooting',
    group: 'shooting',
    fields: [
      { key: 'fireDelayTicks', min: 1, max: 40, step: 1, hint: 'ticks between shots' },
      { key: 'shotSpeed', min: 1, max: 20, step: 0.5, hint: 'px/tick' },
      { key: 'shotRadius', min: 1, max: 10, step: 0.5, hint: 'collider size' },
      { key: 'shotDamage', min: 0.5, max: 10, step: 0.5, hint: 'half-Maß per shot' },
      { key: 'shotLifetimeTicks', min: 6, max: 120, step: 1, hint: 'range, in ticks' },
      { key: 'muzzleOffset', min: 0, max: 24, step: 1, hint: 'px ahead of the player' },
      { key: 'velocityInheritance', min: 0, max: 1.5, step: 0.05, hint: 'sway, aiming with keys' },
      {
        key: 'analogVelocityInheritance',
        min: 0,
        max: 1.5,
        step: 0.05,
        hint: 'sway, mouse or stick',
      },
      { key: 'kickback', min: 0, max: 3, step: 0.05, hint: 'push per shot' },
    ],
  },
  {
    title: 'impact',
    group: 'impact',
    fields: [
      { key: 'hitstopTicks', min: 0, max: 8, step: 1, hint: 'freeze on a hit' },
      { key: 'hitstopPerDamage', min: 0, max: 3, step: 0.1, hint: 'extra freeze per damage' },
      { key: 'maxHitstopTicks', min: 0, max: 12, step: 1, hint: 'freeze ceiling' },
      { key: 'deathHitstopTicks', min: 0, max: 20, step: 1, hint: 'freeze on a kill' },
      { key: 'flashTicks', min: 0, max: 6, step: 1, hint: 'white frames on a hit' },
      { key: 'deathFlashTicks', min: 0, max: 12, step: 1, hint: 'white frames on a kill' },
      { key: 'knockback', min: 0, max: 10, step: 0.1, hint: 'throw per damage' },
      { key: 'shakePerDamage', min: 0, max: 4, step: 0.05, hint: 'shake on a hit' },
      { key: 'deathShake', min: 0, max: 8, step: 0.1, hint: 'shake on a kill' },
      { key: 'playerHitShake', min: 0, max: 8, step: 0.1, hint: 'shake when you are hurt' },
      { key: 'maxShake', min: 0, max: 12, step: 0.1, hint: 'shake ceiling' },
      { key: 'shakeDamping', min: 0.5, max: 0.98, step: 0.01, hint: 'how long shake lasts' },
      { key: 'particlesPerHit', min: 0, max: 40, step: 1, hint: 'foam on a hit' },
      { key: 'particlesOnDeath', min: 0, max: 80, step: 1, hint: 'splash on a kill' },
      { key: 'particlesOnSpend', min: 0, max: 20, step: 1, hint: 'splash on a miss' },
      { key: 'particleSpeed', min: 0.2, max: 8, step: 0.1, hint: 'how far they fly' },
      { key: 'particleSize', min: 0.2, max: 4, step: 0.05, hint: 'how big they are' },
      { key: 'spentSpeedScale', min: 0, max: 2, step: 0.05, hint: 'miss splash, vs a hit' },
      { key: 'particleSpread', min: 0, max: 3.2, step: 0.05, hint: 'cone half-angle, radians' },
      { key: 'particleLifeTicks', min: 2, max: 60, step: 1, hint: 'how long they last' },
      { key: 'particleDrag', min: 0.5, max: 0.99, step: 0.01, hint: 'how fast they slow' },
      {
        key: 'contactInvulnerabilityTicks',
        min: 0,
        max: 180,
        step: 5,
        hint: 'ticks safe after being touched',
      },
      { key: 'contactKnockback', min: 0, max: 12, step: 0.1, hint: 'thrown clear on contact' },
      {
        key: 'projectileInvulnerabilityTicks',
        min: 0,
        max: 180,
        step: 5,
        hint: 'ticks safe after being shot',
      },
      { key: 'deathFreezeTicks', min: 0, max: 120, step: 5, hint: 'freeze on the fatal hit' },
      { key: 'deathSlowmoTicks', min: 0, max: 240, step: 5, hint: 'slow-motion beat length' },
      { key: 'deathSlowmoScale', min: 0, max: 1, step: 0.05, hint: 'how slow, 0 is stopped' },
    ],
  },
  {
    title: 'enemy',
    group: 'enemy',
    fields: [
      { key: 'speedScale', min: 0.25, max: 3, step: 0.05, hint: 'how fast the roster is' },
      { key: 'telegraphScale', min: 0.25, max: 3, step: 0.05, hint: 'how long it warns you' },
      { key: 'fireIntervalScale', min: 0.25, max: 4, step: 0.05, hint: 'gap between volleys' },
      { key: 'projectileSpeedScale', min: 0.25, max: 3, step: 0.05, hint: 'how fast they shoot' },
      { key: 'deflectParticles', min: 0, max: 30, step: 1, hint: 'foam off a shell' },
      { key: 'deflectShake', min: 0, max: 3, step: 0.05, hint: 'shake off a shell' },
    ],
  },
  {
    title: 'promille',
    group: 'promille',
    fields: [
      // The debug slider #17's acceptance criteria asks for: drag this and
      // every tier, bonus, drift, wobble and sway reacts on the next tick.
      { key: 'current', min: 0, max: 5, step: 0.1, hint: 'current Promille — the slider' },
      { key: 'decayPerSecond', min: 0, max: 0.5, step: 0.01, hint: 'Promille lost per second' },
      { key: 'beerAmount', min: 0, max: 3, step: 0.1, hint: 'Promille per beer' },
      { key: 'angeheitertDamageBonus', min: 0, max: 1, step: 0.05, hint: '+dmg, Angeheitert' },
      {
        key: 'angeheitertFireRateBonus',
        min: 0,
        max: 1,
        step: 0.05,
        hint: '+fire rate, Angeheitert',
      },
      { key: 'beduseltDamageBonus', min: 0, max: 1.5, step: 0.05, hint: '+dmg, Beduselt' },
      { key: 'beduseltFireRateBonus', min: 0, max: 1.5, step: 0.05, hint: '+fire rate, Beduselt' },
      { key: 'vollrauschDamageBonus', min: 0, max: 2, step: 0.05, hint: '+dmg, Vollrausch+' },
      {
        key: 'vollrauschFireRateBonus',
        min: 0,
        max: 2,
        step: 0.05,
        hint: '+fire rate, Vollrausch+',
      },
      { key: 'maxDrift', min: 0, max: 2, step: 0.05, hint: 'sluggishness at full ramp' },
      { key: 'maxWobble', min: 0, max: 0.6, step: 0.01, hint: 'aim wobble, radians' },
      { key: 'maxSway', min: 0, max: 20, step: 0.5, hint: 'camera sway, px' },
      { key: 'wobblePeriodTicks', min: 10, max: 300, step: 5, hint: 'ticks per wobble sweep' },
      { key: 'swayPeriodTicks', min: 10, max: 600, step: 10, hint: 'ticks per sway loop' },
      {
        key: 'umgfallnKnockdownTicks',
        min: 0,
        max: 240,
        step: 5,
        hint: 'Umgfalln knockdown length',
      },
      { key: 'umgfallnWakePromille', min: 0, max: 5, step: 0.1, hint: 'Promille after waking up' },
    ],
  },
  {
    title: 'pickup',
    group: 'pickup',
    fields: [
      { key: 'magnetRadius', min: 0, max: 100, step: 2, hint: 'px before a pickup drifts in' },
      { key: 'magnetSpeed', min: 0, max: 6, step: 0.1, hint: 'px/tick it closes the gap by' },
      { key: 'spawnBounceTicks', min: 0, max: 40, step: 1, hint: 'spawn-pop length' },
      { key: 'needMultiplier', min: 1, max: 6, step: 0.25, hint: 'weight boost when you are low' },
      { key: 'needThreshold', min: 0, max: 1, step: 0.05, hint: 'fraction of max counted as low' },
      { key: 'bombFuseTicks', min: 10, max: 240, step: 5, hint: 'ticks before a Bierfassl blows' },
      { key: 'bombBlastRadius', min: 8, max: 100, step: 2, hint: 'blast reach, px' },
      { key: 'bombBlastDamage', min: 0.5, max: 12, step: 0.5, hint: 'half-Maß per blast' },
      { key: 'bombRollSpeed', min: 0, max: 8, step: 0.1, hint: 'px/tick when rolled' },
      { key: 'bombRollDrag', min: 0.5, max: 0.99, step: 0.01, hint: 'how fast a roll slows' },
    ],
  },
  {
    title: 'item pool',
    group: 'itemPool',
    fields: [
      { key: 'qualityWeight0', min: 0, max: 200, step: 5, hint: 'base weight, quality 0' },
      { key: 'qualityWeight1', min: 0, max: 200, step: 5, hint: 'base weight, quality 1' },
      { key: 'qualityWeight2', min: 0, max: 200, step: 5, hint: 'base weight, quality 2' },
      { key: 'qualityWeight3', min: 0, max: 200, step: 5, hint: 'base weight, quality 3' },
      {
        key: 'floorQualityBias',
        min: 0,
        max: 0.5,
        step: 0.01,
        hint: 'floor depth skews toward rarity',
      },
      { key: 'duselQualityBias', min: 0, max: 0.5, step: 0.01, hint: 'Dusel skews toward rarity' },
      { key: 'interactRadius', min: 8, max: 80, step: 2, hint: 'px to read/take a pedestal' },
      { key: 'revealHoldTicks', min: 0, max: 240, step: 5, hint: 'name+description panel length' },
      { key: 'bobAmplitude', min: 0, max: 10, step: 0.5, hint: 'pedestal item bob height, px' },
      { key: 'bobPeriodTicks', min: 10, max: 300, step: 5, hint: 'ticks per bob cycle' },
    ],
  },
];

const DEFAULTS = {
  movement: DEFAULT_MOVEMENT_TUNING,
  shooting: DEFAULT_SHOOTING_TUNING,
  impact: DEFAULT_IMPACT_TUNING,
  enemy: DEFAULT_ENEMY_TUNING,
  promille: DEFAULT_PROMILLE_TUNING,
  pickup: DEFAULT_PICKUP_TUNING,
  itemPool: DEFAULT_ITEM_POOL_TUNING,
} as const;

const STYLE = `
.kb-tuning-toggle {
  position: fixed; right: 12px; bottom: 12px; z-index: 30;
  font: 12px/1.4 var(--kb-font-mono); color: var(--kb-color-text);
  background: var(--kb-color-surface-2); border: 1px solid var(--kb-color-surface-4);
  border-radius: var(--kb-radius-md); padding: 6px 10px; cursor: pointer;
}
.kb-tuning-toggle:hover { background: var(--kb-color-surface-3); }
.kb-tuning {
  position: fixed; right: 12px; bottom: 48px; z-index: 30;
  width: 320px; max-height: calc(100vh - 72px); overflow-y: auto;
  font: 12px/1.5 var(--kb-font-mono); color: var(--kb-color-text);
  background: var(--kb-color-panel-tuning); border: 1px solid var(--kb-color-surface-4);
  border-radius: var(--kb-radius-md); padding: 10px 12px 12px;
}
.kb-tuning[hidden] { display: none; }
.kb-tuning h2 {
  margin: 12px 0 6px; font-size: 11px; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--kb-color-text-dim); font-weight: normal;
}
.kb-tuning h2:first-child { margin-top: 0; }
.kb-tuning label { display: block; margin-bottom: 7px; }
.kb-tuning .kb-row { display: flex; justify-content: space-between; gap: 8px; }
.kb-tuning .kb-name { color: var(--kb-color-text); }
.kb-tuning .kb-value {
  color: var(--kb-color-accent); font: inherit; font-variant-numeric: tabular-nums;
  background: none; border: 0; padding: 0; cursor: pointer;
}
.kb-tuning .kb-value:hover { color: var(--kb-color-accent-hover); }
.kb-tuning .kb-value.kb-changed::after { content: ' *'; color: var(--kb-color-warn); }
.kb-tuning .kb-hint { color: var(--kb-color-text-subtle); font-size: 11px; }
.kb-tuning input[type='range'] { width: 100%; margin: 2px 0 0; accent-color: var(--kb-color-accent); }
.kb-tuning .kb-actions { display: flex; gap: 8px; margin-top: 12px; }
.kb-tuning .kb-actions button {
  flex: 1; font: 12px var(--kb-font-mono); color: var(--kb-color-text);
  background: var(--kb-color-surface-3); border: 1px solid var(--kb-color-surface-4);
  border-radius: var(--kb-radius-sm); padding: 5px 0; cursor: pointer;
}
.kb-tuning .kb-actions button:hover { background: var(--kb-color-surface-3-hover); }
.kb-tuning .kb-status { margin-top: 8px; color: var(--kb-color-text-dim); min-height: 1.4em; }
`;

type MutableTuning = Record<string, Record<string, number>>;

export interface TuningWindowHandle {
  destroy(): void;
}

/**
 * Builds the window and attaches it to the document.
 *
 * Nothing is polled: a slider writes into the tuning object the simulation is
 * already reading, and the next tick uses it.
 */
export function createTuningWindow(tuning: SimTuning): TuningWindowHandle {
  injectDevUiTokens();

  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);

  const panel = document.createElement('div');
  panel.className = 'kb-tuning';
  panel.hidden = true;

  const toggle = document.createElement('button');
  toggle.className = 'kb-tuning-toggle';
  toggle.type = 'button';
  toggle.textContent = 'tuning';

  const live = tuning as unknown as MutableTuning;
  const refreshers: (() => void)[] = [];

  for (const spec of GROUPS) {
    const heading = document.createElement('h2');
    heading.textContent = spec.title;
    panel.appendChild(heading);
    for (const field of spec.fields) {
      const target = live[spec.group];
      if (target === undefined || typeof target[field.key] !== 'number') {
        continue;
      }
      panel.appendChild(createSlider(target, spec.group, field, refreshers));
    }
  }

  const status = document.createElement('p');
  status.className = 'kb-status';

  const actions = document.createElement('div');
  actions.className = 'kb-actions';

  const copyButton = document.createElement('button');
  copyButton.type = 'button';
  copyButton.textContent = 'copy changed';
  copyButton.addEventListener('click', () => {
    const text = changedValuesAsSource(live);
    if (text === '') {
      status.textContent = 'nothing changed yet';
      return;
    }
    void navigator.clipboard.writeText(text).then(
      () => {
        status.textContent = 'copied — paste it into src/sim/tuning.ts';
      },
      () => {
        status.textContent = 'clipboard refused; the values are in the console';
        console.warn(text);
      },
    );
  });

  const resetButton = document.createElement('button');
  resetButton.type = 'button';
  resetButton.textContent = 'reset';
  resetButton.addEventListener('click', () => {
    for (const group of Object.keys(DEFAULTS) as (keyof typeof DEFAULTS)[]) {
      const defaults = DEFAULTS[group] as unknown as Record<string, number>;
      const target = live[group];
      if (target === undefined) {
        continue;
      }
      for (const key of Object.keys(defaults)) {
        const value = defaults[key];
        if (typeof value === 'number') {
          target[key] = value;
        }
      }
    }
    for (const refresh of refreshers) {
      refresh();
    }
    status.textContent = 'back to the values in the repository';
  });

  actions.append(copyButton, resetButton);
  panel.append(actions, status);

  toggle.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
  });

  // T as well as the button, because the button is on the far side of the
  // screen from the hand that is playing. Not F2, and not a punctuation key
  // either — see `overlay.ts`'s doc comment for why the debug tools live on
  // plain letters instead.
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'KeyT') {
      event.preventDefault();
      panel.hidden = !panel.hidden;
    }
  };
  window.addEventListener('keydown', onKeyDown);

  document.body.append(toggle, panel);

  return {
    destroy(): void {
      window.removeEventListener('keydown', onKeyDown);
      toggle.remove();
      panel.remove();
      style.remove();
    },
  };
}

function createSlider(
  target: Record<string, number>,
  group: string,
  field: FieldSpec,
  refreshers: (() => void)[],
): HTMLLabelElement {
  const label = document.createElement('label');

  const row = document.createElement('span');
  row.className = 'kb-row';
  const name = document.createElement('span');
  name.className = 'kb-name';
  name.textContent = field.key;
  const value = document.createElement('button');
  value.type = 'button';
  value.className = 'kb-value';
  row.append(name, value);

  const hint = document.createElement('span');
  hint.className = 'kb-hint';
  hint.textContent = field.hint;

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = String(field.min);
  slider.max = String(field.max);
  slider.step = String(field.step);

  const defaults = DEFAULTS[group as keyof typeof DEFAULTS] as unknown as Record<string, number>;
  /** What the repository says. What "reset" means, for one field or for all. */
  const original = defaults[field.key] ?? 0;

  const refresh = (): void => {
    const current = target[field.key] ?? 0;
    slider.value = String(current);
    value.textContent = format(current);
    value.classList.toggle('kb-changed', current !== original);
  };

  slider.addEventListener('input', () => {
    target[field.key] = Number(slider.value);
    refresh();
  });

  // Double-clicking the number puts that one field back. Ten sliders moved and
  // one of them wrong is the normal state of tuning by feel, and the global
  // reset is the wrong tool for it — it throws away the nine that were right.
  value.title = 'double-click to reset this one';
  value.addEventListener('dblclick', () => {
    target[field.key] = original;
    refresh();
  });

  refresh();
  refreshers.push(refresh);

  label.append(row, slider, hint);
  return label;
}

/**
 * The changed fields, written the way `tuning.ts` declares them.
 *
 * Only what moved. A dump of every field is a diff nobody can read, and the
 * point of the window is to find the two or three numbers that were wrong.
 */
function changedValuesAsSource(live: MutableTuning): string {
  const blocks: string[] = [];
  for (const group of Object.keys(DEFAULTS) as (keyof typeof DEFAULTS)[]) {
    const defaults = DEFAULTS[group] as unknown as Record<string, number>;
    const target = live[group];
    if (target === undefined) {
      continue;
    }
    const lines: string[] = [];
    for (const key of Object.keys(defaults)) {
      const before = defaults[key];
      const after = target[key];
      if (typeof before !== 'number' || typeof after !== 'number' || before === after) {
        continue;
      }
      lines.push(`  ${key}: ${format(after)}, // was ${format(before)}`);
    }
    if (lines.length > 0) {
      blocks.push(`${group}:\n${lines.join('\n')}`);
    }
  }
  return blocks.join('\n\n');
}

/** Short enough to read at a glance, exact enough to paste. */
function format(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
}
