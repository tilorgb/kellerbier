import { describe, expect, it } from 'vitest';
import { Menu } from '../../src/render/ui/menu.js';
import { UiKit } from '../../src/render/ui/kit.js';
import { installPixelFonts } from '../../src/render/ui/font.js';

installPixelFonts();

/**
 * `setLocked` (`render/ui/menu.ts`): the title screen's fix for #(settings
 * stuck open) — while Settings has the pane, keyboard/gamepad focus already
 * moves off the title's own menu, but a mouse click lands on it directly
 * (`UiLayer.hitTest` only checks the row it hits, not who currently owns
 * focus). Locking reuses the same `disabled` short-circuit `activate()`
 * already has, so a locked row behaves exactly like a disabled one: visible,
 * but inert.
 */
describe('Menu.setLocked', () => {
  it('activate() no-ops on a locked menu, and stops being a no-op once unlocked', () => {
    let selected = 0;
    const kit = new UiKit();
    const menu = new Menu(kit, [{ label: 'Start', onSelect: () => (selected += 1) }]);

    menu.activate();
    expect(selected).toBe(1);

    menu.setLocked(true);
    menu.activate();
    expect(selected).toBe(1);

    menu.setLocked(false);
    menu.activate();
    expect(selected).toBe(2);
  });

  it('does not override a row that is independently disabled once unlocked', () => {
    const kit = new UiKit();
    let canContinue = false;
    let selected = 0;
    const menu = new Menu(kit, [
      {
        label: 'Continue',
        onSelect: () => (selected += 1),
        disabled: () => !canContinue,
      },
    ]);

    menu.setLocked(true);
    menu.setLocked(false);
    menu.activate();
    expect(selected).toBe(0);

    canContinue = true;
    menu.refresh();
    menu.activate();
    expect(selected).toBe(1);
  });
});
