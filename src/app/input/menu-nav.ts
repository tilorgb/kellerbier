import { GamepadButton } from './bindings.js';
import { GamepadAxis, type GamepadSource } from './gamepad.js';

/** One frame's worth of newly-pressed menu-navigation inputs. */
export interface MenuNavEdges {
  readonly up: boolean;
  readonly down: boolean;
  /**
   * Dpad/stick left and right. A list of buttons only moves up and down, so
   * these are dead on every screen but the settings one (#158's follow-up),
   * where a row is a value to turn as often as it is a thing to press.
   */
  readonly left: boolean;
  readonly right: boolean;
  readonly confirm: boolean;
  readonly cancel: boolean;
  /** The shoulder buttons — a tabbed screen's page turn, the pad's own convention for it. */
  readonly prevTab: boolean;
  readonly nextTab: boolean;
}

/**
 * Edge-detected gamepad reads for `Menu`-backed screens (#158) — dpad/stick
 * up-down, South to confirm, East/Start to cancel, dpad/stick left-right and
 * the shoulders for the settings screen's values and tabs.
 *
 * A separate tracker from `InputSampler`'s own edge detection
 * (`frame`/`previousFrame`) because that only updates while a live tick is
 * sampling input, which is exactly the time no menu is ever up: the title,
 * pause and credits screens all run with `loop.paused` true, and the
 * game-over/victory/results screens stop `sim.step` from being called at
 * all. Whoever is polling menu navigation this frame — `ScreenFlowController`
 * or `app/main.ts`'s own game-over/victory/results handling — shares one
 * instance, since exactly one of them is ever the one polling at a time.
 */
export class GamepadMenuNav {
  private upHeld = false;
  private downHeld = false;
  private leftHeld = false;
  private rightHeld = false;
  private confirmHeld = false;
  private cancelHeld = false;
  private prevTabHeld = false;
  private nextTabHeld = false;

  /** Re-reads `gamepad` and returns which edges just fired. Call once per rendered frame. */
  poll(gamepad: GamepadSource): MenuNavEdges {
    gamepad.update();
    gamepad.readStick(GamepadAxis.LeftStickX, GamepadAxis.LeftStickY);
    const upNow = gamepad.isButtonDown(GamepadButton.DpadUp) || gamepad.lastStickY < -0.5;
    const downNow = gamepad.isButtonDown(GamepadButton.DpadDown) || gamepad.lastStickY > 0.5;
    const leftNow = gamepad.isButtonDown(GamepadButton.DpadLeft) || gamepad.lastStickX < -0.5;
    const rightNow = gamepad.isButtonDown(GamepadButton.DpadRight) || gamepad.lastStickX > 0.5;
    const confirmNow = gamepad.isButtonDown(GamepadButton.South);
    const cancelNow =
      gamepad.isButtonDown(GamepadButton.East) || gamepad.isButtonDown(GamepadButton.Start);
    const prevTabNow = gamepad.isButtonDown(GamepadButton.LeftBumper);
    const nextTabNow = gamepad.isButtonDown(GamepadButton.RightBumper);

    const edges: MenuNavEdges = {
      up: upNow && !this.upHeld,
      down: downNow && !this.downHeld,
      left: leftNow && !this.leftHeld,
      right: rightNow && !this.rightHeld,
      confirm: confirmNow && !this.confirmHeld,
      cancel: cancelNow && !this.cancelHeld,
      prevTab: prevTabNow && !this.prevTabHeld,
      nextTab: nextTabNow && !this.nextTabHeld,
    };
    this.upHeld = upNow;
    this.downHeld = downNow;
    this.leftHeld = leftNow;
    this.rightHeld = rightNow;
    this.confirmHeld = confirmNow;
    this.cancelHeld = cancelNow;
    this.prevTabHeld = prevTabNow;
    this.nextTabHeld = nextTabNow;
    return edges;
  }
}
