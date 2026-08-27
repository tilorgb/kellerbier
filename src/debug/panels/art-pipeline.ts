import type { Container } from 'pixi.js';
import {
  type DebugContext,
  type DebugPanel,
  PANEL_CONTENT_TOP,
  PANEL_LINE_HEIGHT,
  PANEL_PADDING,
  PANEL_DIM_COLOUR,
  PANEL_WARN_COLOUR,
  createLabel,
  createPanelFrame,
} from '../panel.js';

const LINES = 8;
const PANEL_HEIGHT = PANEL_CONTENT_TOP + LINES * PANEL_LINE_HEIGHT + PANEL_PADDING;
/** ~2s at 60fps. The overlay only updates panels while it is open (see `DebugOverlay.sync`), so this never polls while the game is being played with it closed. */
const POLL_INTERVAL_FRAMES = 120;
const MANIFEST_URL = '/__art-pipeline/manifest';

interface AtlasReport {
  readonly bucketId: string;
  readonly width: number;
  readonly height: number;
  readonly spriteCount: number;
  readonly bytes: number;
}

interface BuildReport {
  readonly atlasCount: number;
  readonly spriteCount: number;
  readonly totalBytes: number;
  readonly projectileSpritesChecked: number;
  readonly atlases: readonly AtlasReport[];
}

interface ManifestError {
  readonly error: string;
}

/**
 * The art pipeline's (#34) last build report, polled from the dev server.
 *
 * `/__art-pipeline/manifest` only exists under `npm run dev`
 * (`tools/art/dev-plugin.mjs`'s `configureServer`), so this is the one panel
 * that shows nothing useful in a production build — which is fine, since
 * this whole module never reaches one (see `DebugOverlay`'s own doc
 * comment). It exists so "hot reload of art in the dev server" is something
 * a person running `npm run dev` can actually see happen, not just a claim
 * in this issue's acceptance criteria: drop a sprite in a folder, and the
 * next poll shows the atlas count and sprite count move.
 */
export class ArtPipelinePanel implements DebugPanel {
  readonly title = 'art';
  readonly view: Container;
  readonly height = PANEL_HEIGHT;

  private readonly lines: ReturnType<typeof createLabel>[] = [];
  private report: BuildReport | ManifestError | null = null;
  private fetching = false;
  // Polls on the very first update rather than waiting out the first interval.
  private framesSincePoll = POLL_INTERVAL_FRAMES;

  constructor() {
    this.view = createPanelFrame(this.title, PANEL_HEIGHT);
    for (let line = 0; line < LINES; line++) {
      const label = createLabel('');
      label.position.set(PANEL_PADDING, PANEL_CONTENT_TOP + line * PANEL_LINE_HEIGHT);
      this.lines.push(label);
      this.view.addChild(label);
    }
  }

  update(_context: DebugContext): void {
    this.framesSincePoll += 1;
    if (this.framesSincePoll >= POLL_INTERVAL_FRAMES && !this.fetching) {
      this.framesSincePoll = 0;
      this.poll();
    }
    this.render();
  }

  private poll(): void {
    this.fetching = true;
    fetch(MANIFEST_URL)
      .then((response) => response.json())
      .then((data: unknown) => {
        this.report = data as BuildReport | ManifestError;
      })
      .catch(() => {
        this.report = { error: 'dev server unreachable (production build?)' };
      })
      .finally(() => {
        this.fetching = false;
      });
  }

  private render(): void {
    if (this.report === null) {
      this.setLine(0, this.fetching ? 'polling...' : 'not polled yet');
      this.clearFrom(1);
      return;
    }
    if ('error' in this.report) {
      this.setLine(0, 'build failed', true);
      this.setLine(1, this.report.error.slice(0, 38));
      this.clearFrom(2);
      return;
    }

    const report = this.report;
    this.setLine(0, `atlases ${String(report.atlasCount)}  sprites ${String(report.spriteCount)}`);
    this.setLine(1, `memory  ${formatBytes(report.totalBytes)}`);
    this.setLine(2, `projectiles checked ${String(report.projectileSpritesChecked)}`);
    const listStart = 3;
    for (let index = 0; index < LINES - listStart; index++) {
      const atlas = report.atlases[index];
      this.setLine(
        listStart + index,
        atlas === undefined
          ? ''
          : `${atlas.bucketId} ${String(atlas.width)}x${String(atlas.height)}`,
      );
    }
  }

  private clearFrom(start: number): void {
    for (let line = start; line < LINES; line++) {
      this.setLine(line, '');
    }
  }

  private setLine(index: number, text: string, warn = false): void {
    const label = this.lines[index];
    if (label === undefined) {
      return;
    }
    label.text = text;
    label.style.fill = warn ? PANEL_WARN_COLOUR : PANEL_DIM_COLOUR;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${String(bytes)} B`;
  }
  return `${(bytes / 1024).toFixed(1)} KB`;
}
