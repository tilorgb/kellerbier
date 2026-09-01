import { describe, expect, it } from 'vitest';
import type { Sprite, Texture } from 'pixi.js';
import { groundShadowFeetY, styleGroundShadow } from '../../src/render/ground-shadow.js';
import { GROUND_SHADOW } from '../../src/render/palette.js';

/**
 * The shared ground-shadow maths (`docs/DECISIONS.md` #61). `styleGroundShadow`
 * only ever touches a handful of `Sprite` fields, so a duck-typed stand-in
 * exercises it exactly without a renderer. With no DOM (this env) the inked-
 * bounds scan falls back to the full frame height, so `groundShadowFeetY` is
 * a pure function of the frame here.
 */

function fakeSprite() {
  return {
    anchor: { value: 0, set(v: number) { this.value = v; } },
    scale: { x: 1, y: 1, set(x: number, y?: number) { this.x = x; this.y = y ?? x; } },
    alpha: 1,
    visible: false,
    texture: null as Texture | null,
  };
}

const tex = (w: number, h: number): Texture =>
  ({ width: w, height: h, frame: { x: 0, y: 0, width: w, height: h }, source: {} }) as unknown as Texture;

describe('groundShadowFeetY', () => {
  it('seats the shadow just above the drawing’s bottom edge', () => {
    // 32px frame at scale 0.5, no DOM -> bottom edge is frameHeight/2 * scale below centre.
    expect(groundShadowFeetY(100, tex(20, 32), 0.5)).toBeCloseTo(100 + 8 - GROUND_SHADOW.contactInset);
  });

  it('follows the sprite: a taller frame or a bigger scale seats lower', () => {
    expect(groundShadowFeetY(0, tex(20, 48), 0.5)).toBeGreaterThan(groundShadowFeetY(0, tex(20, 32), 0.5));
    expect(groundShadowFeetY(0, tex(20, 32), 1)).toBeGreaterThan(groundShadowFeetY(0, tex(20, 32), 0.5));
  });
});

describe('styleGroundShadow', () => {
  it('draws the blob at the requested width and a shallow ellipse', () => {
    const s = fakeSprite();
    styleGroundShadow(s as unknown as Sprite, tex(24, 16), 20);
    const drawnWidth = s.scale.x * 24;
    const drawnHeight = s.scale.y * 16;
    expect(drawnWidth).toBeCloseTo(20);
    expect(drawnHeight).toBeCloseTo(20 * GROUND_SHADOW.aspect);
    expect(drawnHeight).toBeLessThan(drawnWidth);
  });

  it('is centred, visible, and takes the weight’s alpha', () => {
    const body = fakeSprite();
    styleGroundShadow(body as unknown as Sprite, tex(24, 16), 10, 'body');
    expect(body.anchor.value).toBe(0.5);
    expect(body.visible).toBe(true);
    expect(body.alpha).toBe(GROUND_SHADOW.bodyAlpha);

    const boss = fakeSprite();
    styleGroundShadow(boss as unknown as Sprite, tex(48, 24), 10, 'boss');
    expect(boss.alpha).toBe(GROUND_SHADOW.bossAlpha);
  });

  it('never divides by a zero-sized texture', () => {
    const s = fakeSprite();
    expect(() => {
      styleGroundShadow(s as unknown as Sprite, tex(0, 0), 0);
    }).not.toThrow();
  });
});
