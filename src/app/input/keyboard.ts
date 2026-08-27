/**
 * Keyboard state.
 *
 * The state is driven by plain method calls; `attach` only wires DOM events to
 * those methods. That split keeps the whole thing testable without a DOM, and
 * it is also what lets a replay drive the same code path as a live run.
 */
export class KeyboardSource {
  private readonly keysDown = new Set<string>();
  private activity = 0;

  /** Increments whenever the player touches the keyboard. */
  get activityCounter(): number {
    return this.activity;
  }

  isKeyDown(code: string): boolean {
    return this.keysDown.has(code);
  }

  keyDown(code: string): void {
    if (!this.keysDown.has(code)) {
      this.keysDown.add(code);
      this.activity += 1;
    }
  }

  keyUp(code: string): void {
    this.keysDown.delete(code);
  }

  /**
   * Releases everything.
   *
   * Called on blur: a key held while the window loses focus never sends its
   * keyup, and the player comes back to a character walking into a wall.
   */
  clear(): void {
    this.keysDown.clear();
  }

  /**
   * Wires DOM events to this source. Returns a teardown function.
   *
   * `event.code` rather than `event.key`, so bindings follow physical key
   * positions and survive a layout change.
   */
  attach(target: Window): () => void {
    const onKeyDown = (event: KeyboardEvent): void => {
      this.keyDown(event.code);
      // Tab and the arrow keys scroll or move focus otherwise, which fights
      // the game for the same keypress.
      if (event.code === 'Tab' || event.code.startsWith('Arrow') || event.code === 'Space') {
        event.preventDefault();
      }
    };
    const onKeyUp = (event: KeyboardEvent): void => {
      this.keyUp(event.code);
    };
    const onBlur = (): void => {
      this.clear();
    };

    target.addEventListener('keydown', onKeyDown);
    target.addEventListener('keyup', onKeyUp);
    target.addEventListener('blur', onBlur);

    return () => {
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('keyup', onKeyUp);
      target.removeEventListener('blur', onBlur);
    };
  }
}
