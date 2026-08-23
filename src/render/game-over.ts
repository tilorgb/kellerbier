import { Container, Graphics, Text } from 'pixi.js';
import { INTERNAL_HEIGHT, INTERNAL_WIDTH, type GameLayout } from './resolution.js';

/** What the screen shows. Assembled by whoever tracks the run, not read from `GameSim` directly. */
export interface RunSummaryText {
  /** The headline, drawn from `docs/CONTENT_BIBLE.md` §7's pool — shown exactly as authored. */
  readonly word: string;
  readonly seconds: number;
  readonly kills: number;
  /** "floor 0" today — see `src/debug/panels/run-info.ts`, the same placeholder until #20. */
  readonly floor: string;
}

/**
 * The game-over screen: a dim over the game, the death word, and a short run
 * summary.
 *
 * Screen-space, sized off the same `GameLayout` the HUD positions itself
 * with, and hidden by default — `main.ts` shows it once the death sequence's
 * slow-motion beat runs out, not the moment `sim.playerDead` flips true.
 */
export class GameOverScreen {
  readonly view = new Container();

  private readonly dim: Graphics;
  private readonly headline: Text;
  private readonly summary: Text;
  private readonly hint: Text;
  private layout: GameLayout = { scale: 1, originX: 0, originY: 0 };

  constructor() {
    this.view.visible = false;

    this.dim = new Graphics();
    this.view.addChild(this.dim);

    this.headline = new Text({
      text: '',
      style: {
        fill: 0xe8dfd0,
        fontFamily: 'monospace',
        fontSize: 40,
        fontWeight: 'bold',
      },
    });
    this.headline.anchor.set(0.5, 1);
    this.view.addChild(this.headline);

    this.summary = new Text({
      text: '',
      style: { fill: 0xb8ac9c, fontFamily: 'monospace', fontSize: 15, align: 'center' },
    });
    this.summary.anchor.set(0.5, 0);
    this.view.addChild(this.summary);

    this.hint = new Text({
      // No in-run restart yet — there is no run-management layer to rebuild
      // the sim/view/debug-overlay bindings against (that is #46 territory,
      // not #15). Reload is the honest instruction until one exists.
      text: 'reload to try again',
      style: { fill: 0x8a7f74, fontFamily: 'monospace', fontSize: 13 },
    });
    this.hint.anchor.set(0.5, 0);
    this.view.addChild(this.hint);
  }

  show(info: RunSummaryText): void {
    this.headline.text = info.word;
    this.summary.text = `survived ${info.seconds.toFixed(1)}s   ${String(info.kills)} kills   ${info.floor}`;
    this.view.visible = true;
    this.layPixels();
  }

  hide(): void {
    this.view.visible = false;
  }

  /** Call on every resize, same as the HUD's own `positionHud`. */
  resize(layout: GameLayout): void {
    this.layout = layout;
    if (this.view.visible) {
      this.layPixels();
    }
  }

  private layPixels(): void {
    const { scale, originX, originY } = this.layout;
    const width = INTERNAL_WIDTH * scale;
    const height = INTERNAL_HEIGHT * scale;

    this.dim.clear();
    this.dim.rect(0, 0, width, height).fill({ color: 0x0a0806, alpha: 0.78 });
    this.view.position.set(originX, originY);

    const centreX = width / 2;
    const centreY = height / 2;
    this.headline.position.set(centreX, centreY - 4);
    this.summary.position.set(centreX, centreY + 10);
    this.hint.position.set(centreX, centreY + 34);
  }
}
