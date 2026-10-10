import { describe, expect, it } from 'vitest';
import { ConfirmScreen } from '../../src/render/confirm-screen.js';
import { installPixelFonts } from '../../src/render/ui/font.js';
import { UiKit } from '../../src/render/ui/kit.js';

installPixelFonts();

/** #521: "Start a new run?" — the safe answer is the default one. */
describe('ConfirmScreen (#521)', () => {
  function screen(): { screen: ConfirmScreen; calls: string[] } {
    const calls: string[] = [];
    const confirm = new ConfirmScreen(
      new UiKit(),
      {
        onConfirm: () => calls.push('confirm'),
        onBack: () => calls.push('back'),
      },
      'en',
    );
    confirm.resize(640, 360);
    return { screen: confirm, calls };
  }

  it('opens on Back, so Enter does not throw the run away', () => {
    const { screen: confirm, calls } = screen();
    confirm.show();
    confirm.activate();
    expect(calls).toEqual(['back']);
  });

  it('starts the new run only when that row is chosen', () => {
    const { screen: confirm, calls } = screen();
    confirm.show();
    confirm.moveFocus(-1);
    confirm.activate();
    expect(calls).toEqual(['confirm']);
  });
});
