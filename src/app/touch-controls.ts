import type { TouchButton, TouchSource } from './input/touch.js';
import { injectDevUiTokens } from '../dev-ui/tokens.js';

/**
 * The on-screen dual-stick layout that makes the game playable on a phone:
 * a move stick at bottom-left, an aim stick at bottom-right (deflecting it
 * fires, the same convention every other device follows —
 * `InputSampler.sampleTouch`), and the four actions a gamepad's face/shoulder
 * buttons cover clustered near the thumb that isn't busy aiming.
 *
 * Mounted only on a touch-capable device (`isTouchCapable` below) — a mouse
 * player never sees this, the same reasoning `accessibility-panel.ts` gives
 * for shipping in every build rather than behind dev tooling: this is
 * player-facing, not a debug tool, so it is not gated behind
 * `import.meta.env.DEV`.
 */

const STICK_DIAMETER = 'clamp(84px, 24vmin, 132px)';
const KNOB_DIAMETER = 'clamp(38px, 11vmin, 60px)';
const BUTTON_DIAMETER = 'clamp(46px, 13vmin, 68px)';
const SMALL_BUTTON_DIAMETER = 'clamp(34px, 9vmin, 46px)';

const STYLE = `
.kb-touch-controls {
  position: fixed;
  inset: 0;
  z-index: 25;
  /* Individual widgets opt back in; the container itself must never eat a
     tap meant for the canvas underneath (menus, the pedestal prompt, ...). */
  pointer-events: none;
}
.kb-touch-controls[hidden] { display: none; }

.kb-stick {
  position: absolute;
  bottom: calc(env(safe-area-inset-bottom, 0px) + 18px);
  width: ${STICK_DIAMETER};
  height: ${STICK_DIAMETER};
  border-radius: 50%;
  background: var(--kb-color-surface-2);
  border: 1px solid var(--kb-color-surface-4);
  opacity: 0.55;
  touch-action: none;
  pointer-events: auto;
}
.kb-stick--move { left: calc(env(safe-area-inset-left, 0px) + 18px); }
.kb-stick--aim { right: calc(env(safe-area-inset-right, 0px) + 18px); }

.kb-stick-knob {
  position: absolute;
  left: 50%;
  top: 50%;
  width: ${KNOB_DIAMETER};
  height: ${KNOB_DIAMETER};
  margin-left: calc(${KNOB_DIAMETER} / -2);
  margin-top: calc(${KNOB_DIAMETER} / -2);
  border-radius: 50%;
  background: var(--kb-color-accent);
  opacity: 0.75;
  will-change: transform;
}

.kb-touch-button {
  position: absolute;
  border-radius: 50%;
  background: var(--kb-color-surface-2);
  border: 1px solid var(--kb-color-surface-4);
  color: var(--kb-color-text);
  font: 11px/1 var(--kb-font-mono);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.6;
  touch-action: none;
  pointer-events: auto;
  user-select: none;
  -webkit-user-select: none;
}
.kb-touch-button.kb-touch-active {
  opacity: 0.95;
  background: var(--kb-color-surface-3);
}

.kb-touch-button--use {
  width: ${BUTTON_DIAMETER};
  height: ${BUTTON_DIAMETER};
  right: calc(env(safe-area-inset-right, 0px) + 24px + ${STICK_DIAMETER});
  bottom: calc(env(safe-area-inset-bottom, 0px) + 84px);
}
.kb-touch-button--bomb {
  width: ${BUTTON_DIAMETER};
  height: ${BUTTON_DIAMETER};
  right: calc(env(safe-area-inset-right, 0px) + 4px + ${STICK_DIAMETER});
  bottom: calc(env(safe-area-inset-bottom, 0px) + 4px);
}
.kb-touch-button--map {
  width: ${SMALL_BUTTON_DIAMETER};
  height: ${SMALL_BUTTON_DIAMETER};
  left: calc(env(safe-area-inset-left, 0px) + 10px);
  top: calc(env(safe-area-inset-top, 0px) + 10px);
}
.kb-touch-button--pause {
  width: ${SMALL_BUTTON_DIAMETER};
  height: ${SMALL_BUTTON_DIAMETER};
  right: calc(env(safe-area-inset-right, 0px) + 10px);
  top: calc(env(safe-area-inset-top, 0px) + 10px);
}
`;

/**
 * True on any device where touch is a real input, not just present alongside
 * a mouse (a touchscreen laptop still reports `ontouchstart`, but `pointer:
 * coarse` is false there because the primary pointer is the trackpad).
 */
export function isTouchCapable(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(pointer: coarse)').matches;
}

export interface TouchControlsHandle {
  destroy(): void;
}

/**
 * One draggable stick: a fixed-position base the player's thumb lands on,
 * and a knob that follows the drag, clamped to the base's own radius.
 *
 * The base's position never moves once drawn — no "appears where you
 * touch" recentring — so the same thumb muscle memory works every run,
 * and the base is drawn at a fixed screen corner precisely so a player
 * can find it without looking.
 */
function mountStick(
  parent: HTMLElement,
  variant: 'move' | 'aim',
  onChange: (x: number, y: number) => void,
): () => void {
  const base = document.createElement('div');
  base.className = `kb-stick kb-stick--${variant}`;
  const knob = document.createElement('div');
  knob.className = 'kb-stick-knob';
  base.appendChild(knob);
  parent.appendChild(base);

  let pointerId: number | null = null;

  const reset = (): void => {
    knob.style.transform = 'translate(0, 0)';
    onChange(0, 0);
  };

  const applyPointer = (clientX: number, clientY: number): void => {
    const rect = base.getBoundingClientRect();
    const radius = rect.width / 2;
    const centerX = rect.left + radius;
    const centerY = rect.top + radius;
    const dx = clientX - centerX;
    const dy = clientY - centerY;
    const magnitude = Math.hypot(dx, dy);
    // Clamped to the base's own radius, so the knob never visually escapes
    // its ring even when the thumb drags well past it.
    const scale = magnitude > radius ? radius / magnitude : 1;
    const knobX = dx * scale;
    const knobY = dy * scale;
    knob.style.transform = `translate(${String(knobX)}px, ${String(knobY)}px)`;
    onChange(knobX / radius, knobY / radius);
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (pointerId !== null) {
      return;
    }
    pointerId = event.pointerId;
    // Applied before capture: capture is what keeps the drag tracking once a
    // thumb slides outside the base's own bounds, but it is not what makes
    // the touch register at all, and it can throw for a pointer the browser
    // no longer considers active — a capture failure must never swallow the
    // touch itself.
    applyPointer(event.clientX, event.clientY);
    try {
      base.setPointerCapture(pointerId);
    } catch {
      // Movement still tracks via `pointermove` as long as the finger stays
      // over the base; losing capture only matters once it doesn't.
    }
    event.preventDefault();
  };
  const onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== pointerId) {
      return;
    }
    applyPointer(event.clientX, event.clientY);
    event.preventDefault();
  };
  const endTouch = (event: PointerEvent): void => {
    if (event.pointerId !== pointerId) {
      return;
    }
    pointerId = null;
    reset();
  };

  base.addEventListener('pointerdown', onPointerDown);
  base.addEventListener('pointermove', onPointerMove);
  base.addEventListener('pointerup', endTouch);
  base.addEventListener('pointercancel', endTouch);

  return () => {
    base.removeEventListener('pointerdown', onPointerDown);
    base.removeEventListener('pointermove', onPointerMove);
    base.removeEventListener('pointerup', endTouch);
    base.removeEventListener('pointercancel', endTouch);
    base.remove();
  };
}

function mountButton(
  parent: HTMLElement,
  action: TouchButton,
  label: string,
  onChange: (down: boolean) => void,
): () => void {
  const button = document.createElement('div');
  button.className = `kb-touch-button kb-touch-button--${action}`;
  button.textContent = label;

  let pointerId: number | null = null;

  const setDown = (down: boolean): void => {
    button.classList.toggle('kb-touch-active', down);
    onChange(down);
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (pointerId !== null) {
      return;
    }
    pointerId = event.pointerId;
    // Applied before capture — see the matching comment in `mountStick`.
    setDown(true);
    try {
      button.setPointerCapture(pointerId);
    } catch {
      // The button still reads its state on `pointerup` as long as the
      // finger stays over it; losing capture only matters once it doesn't.
    }
    event.preventDefault();
  };
  const onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== pointerId) {
      return;
    }
    pointerId = null;
    setDown(false);
  };

  button.addEventListener('pointerdown', onPointerDown);
  button.addEventListener('pointerup', onPointerUp);
  button.addEventListener('pointercancel', onPointerUp);

  parent.appendChild(button);

  return () => {
    button.removeEventListener('pointerdown', onPointerDown);
    button.removeEventListener('pointerup', onPointerUp);
    button.removeEventListener('pointercancel', onPointerUp);
    button.remove();
  };
}

export function createTouchControls(touch: TouchSource): TouchControlsHandle {
  injectDevUiTokens();

  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.className = 'kb-touch-controls';
  document.body.appendChild(root);

  const teardowns: (() => void)[] = [
    mountStick(root, 'move', (x, y) => {
      touch.setMoveStick(x, y);
    }),
    mountStick(root, 'aim', (x, y) => {
      touch.setAimStick(x, y);
    }),
    mountButton(root, 'use', 'Use', (down) => {
      touch.setButtonDown('use', down);
    }),
    mountButton(root, 'bomb', 'Bomb', (down) => {
      touch.setButtonDown('bomb', down);
    }),
    mountButton(root, 'map', 'Map', (down) => {
      touch.setButtonDown('map', down);
    }),
    mountButton(root, 'pause', 'II', (down) => {
      touch.setButtonDown('pause', down);
    }),
  ];

  const onBlur = (): void => {
    touch.clear();
  };
  window.addEventListener('blur', onBlur);

  return {
    destroy(): void {
      window.removeEventListener('blur', onBlur);
      for (const teardown of teardowns) {
        teardown();
      }
      root.remove();
      style.remove();
    },
  };
}
