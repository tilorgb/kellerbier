import { Assets, Sprite, Text, type Texture } from 'pixi.js';
import massUrl from '../../assets/sprites/mass.png';
import { createRenderer, trackWindowSize } from '../render/app.js';
import { INTERNAL_HEIGHT, INTERNAL_WIDTH } from '../render/resolution.js';

async function boot(): Promise<void> {
  const host = document.getElementById('game');
  if (host === null) {
    throw new Error('Missing #game host element in index.html');
  }

  const app = await createRenderer(host);
  trackWindowSize(app.canvas);

  const texture = await Assets.load<Texture>({ src: massUrl, data: { scaleMode: 'nearest' } });

  // Scaffold proof: the same 16x16 sprite at 2x and 3x, both crisp.
  const twice = new Sprite(texture);
  twice.scale.set(2);
  twice.anchor.set(0.5);
  twice.position.set(INTERNAL_WIDTH / 2 - 48, INTERNAL_HEIGHT / 2);
  app.stage.addChild(twice);

  const thrice = new Sprite(texture);
  thrice.scale.set(3);
  thrice.anchor.set(0.5);
  thrice.position.set(INTERNAL_WIDTH / 2 + 48, INTERNAL_HEIGHT / 2);
  app.stage.addChild(thrice);

  const caption = new Text({
    text: 'Kellerbier — 640x360, integer scale, nearest neighbour',
    style: { fill: 0x8a7f74, fontFamily: 'monospace', fontSize: 12 },
  });
  caption.anchor.set(0.5, 1);
  caption.position.set(INTERNAL_WIDTH / 2, INTERNAL_HEIGHT - 12);
  app.stage.addChild(caption);
}

void boot().catch((error: unknown) => {
  console.error('Kellerbier failed to boot', error);
});
