import { Container, type BitmapText } from './gfx/index.js';
import type { Locale } from '../i18n/locale.js';
import { t } from '../i18n/translate.js';
import {
  promilleMeterLabel,
  promilleTierDisplayName,
  promilleTierStart,
  promilleUnitSuffix,
  reachablePromilleTiers,
  type PromilleTierId,
} from '../sim/game/promille.js';
import type { PromilleTuning } from '../sim/tuning.js';
import { UI_PALETTE } from './palette.js';
import { PostcardPanel } from './postcard-panel.js';
import { promilleEffectsText, promilleKaterText } from './promille-text.js';
import { uiText } from './ui/text.js';

const PADDING = 10;
const BLOCK_GAP = 4;

/** What the panel reads off a run — plain values, so `render/` never holds the sim. */
export interface PromillePanelData {
  readonly tier: PromilleTierId;
  readonly trinkfest: number;
  readonly tuning: PromilleTuning;
  readonly neutralReskin: boolean;
}

interface Block {
  /** Which tier this block describes, or `null` for the title and the Kater line. */
  readonly tier: PromilleTierId | null;
  readonly text: BitmapText;
}

/**
 * The pause menu's Promille panel (#460): every tier the run can reach, what
 * it pays and what it costs, the current one highlighted, then Umgfalln and
 * Kater.
 *
 * It exists because the HUD shows a bar with a tier name and a number and
 * nothing about what either does — a playtester could not tell whether
 * drinking raised damage, cost accuracy or changed speed. The pause menu is
 * where a player has time to read, so the whole table lives there instead of
 * competing with the room.
 *
 * Text is rebuilt only when the words change (a tier line is wrapped at
 * construction, so a new width needs new text objects) and the highlight is the
 * text colour, re-applied every sync.
 */
export class PromillePanel {
  readonly view = new Container();

  private readonly card = new PostcardPanel();
  private blocks: Block[] = [];
  private key = '';
  private width = 0;
  private height = 0;

  constructor() {
    this.view.visible = false;
    this.view.addChild(this.card.view);
  }

  /** The card's outer size after the last `layOut`. */
  get size(): { readonly width: number; readonly height: number } {
    return { width: this.width, height: this.height };
  }

  /**
   * Fits the panel into `width` UI pixels (the card's outer width) and
   * returns the height it needs. Call `place` afterwards.
   */
  layOut(width: number, data: PromillePanelData, locale: Locale): number {
    const innerWidth = width - PADDING * 2;
    const tuning = data.tuning;
    const neutral = data.neutralReskin;
    const meter = promilleMeterLabel(neutral);
    const unit = promilleUnitSuffix(neutral);

    const entries: { tier: PromilleTierId | null; text: string; colour: number }[] = [
      { tier: null, text: meter, colour: UI_PALETTE.accent },
    ];
    for (const tier of reachablePromilleTiers(data.trinkfest)) {
      const from = promilleTierStart(tier, data.trinkfest, tuning).toFixed(1);
      const name = promilleTierDisplayName(tier, neutral);
      const head =
        tier === 0 ? name : `${name} ${t(locale, 'ui.promille.panelFrom', { value: from, unit })}`;
      entries.push({
        tier,
        text: `${head}\n${promilleEffectsText(locale, tier, tuning, neutral)}`,
        colour: UI_PALETTE.textDim,
      });
    }
    entries.push({
      tier: null,
      text: promilleKaterText(locale, tuning, neutral),
      colour: UI_PALETTE.textDim,
    });

    const key = `${String(width)}|${entries.map((entry) => entry.text).join('\n\n')}`;
    if (key !== this.key) {
      this.key = key;
      for (const block of this.blocks) {
        this.view.removeChild(block.text);
        block.text.destroy();
      }
      this.blocks = entries.map((entry) => {
        const text = uiText(entry.text, { colour: entry.colour, wrapWidth: innerWidth });
        this.view.addChild(text);
        return { tier: entry.tier, text };
      });
    }

    let y = PADDING;
    for (const block of this.blocks) {
      block.text.position.set(PADDING, y);
      y += block.text.height + BLOCK_GAP;
    }
    this.width = width;
    this.height = y - BLOCK_GAP + PADDING;
    this.card.resize(this.width, this.height);
    this.highlight(data.tier);
    return this.height;
  }

  /** Tints the block for `tier` in the accent colour; the rest stay dim. */
  highlight(tier: PromilleTierId): void {
    for (const block of this.blocks) {
      if (block.tier !== null) {
        block.text.style.fill = block.tier === tier ? UI_PALETTE.accent : UI_PALETTE.textDim;
      }
    }
  }

  place(x: number, y: number): void {
    this.view.position.set(x, y);
  }
}
