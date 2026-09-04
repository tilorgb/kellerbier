import { GamepadButton } from './bindings.js';
import { GamepadAxis, type GamepadSource } from './gamepad.js';

/** One frame's worth of newly-pressed menu-navigation inputs. */
export interface MenuNavEdges {
  readonly up: boolean;
  readonly down: boolean;
  readonly confirm: boolean;
  readonly cancel: boolean;
}

/**
 * Edge-detected gamepad reads for `Menu`-backed screens (#158) — dpad/stick
 * up-down, South to confirm, East/Start to cancel.
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
  private confirmHeld = false;
  private cancelHeld = false;

  /** Re-reads `gamepad` and returns which edges just fired. Call once per rendered frame. */
  poll(gamepad: GamepadSource): MenuNavEdges {
    gamepad.update();
    gamepad.readStick(GamepadAxis.LeftStickX, GamepadAxis.LeftStickY);
    const upNow = gamepad.isButtonDown(GamepadButton.DpadUp) || gamepad.lastStickY < -0.5;
    const downNow = gamepad.isButtonDown(GamepadButton.DpadDown) || gamepad.lastStickY > 0.5;
    const confirmNow = gamepad.isButtonDown(GamepadButton.South);
    const cancelNow =
      gamepad.isButtonDown(GamepadButton.East) || gamepad.isButtonDown(GamepadButton.Start);

    const edges: MenuNavEdges = {
      up: upNow && !this.upHeld,
      down: downNow && !this.downHeld,
      confirm: confirmNow && !this.confirmHeld,
      cancel: cancelNow && !this.cancelHeld,
    };
    this.upHeld = upNow;
    this.downHeld = downNow;
    this.confirmHeld = confirmNow;
    this.cancelHeld = cancelNow;
    return edges;
  }
}
