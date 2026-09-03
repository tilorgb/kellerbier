import { describe, expect, it } from 'vitest';
import { ScreenFlow } from '../../src/app/screen-flow.js';

describe('ScreenFlow', () => {
  it('starts on the title screen', () => {
    const flow = new ScreenFlow();
    expect(flow.current).toBe('title');
    expect(flow.is('title')).toBe(true);
    expect(flow.is('run')).toBe(false);
  });

  it('moves to whatever screen it is told to, with no restriction on the transition', () => {
    const flow = new ScreenFlow();
    flow.goTo('run');
    expect(flow.current).toBe('run');
    flow.goTo('paused');
    expect(flow.is('paused')).toBe(true);
    flow.goTo('credits');
    expect(flow.current).toBe('credits');
    flow.goTo('title');
    expect(flow.current).toBe('title');
  });
});
