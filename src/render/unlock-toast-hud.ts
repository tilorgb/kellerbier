import { Container } from './gfx/index.js';
import type { Locale } from '../i18n/locale.js';
import { t } from '../i18n/translate.js';
import { TICKS_PER_SECOND } from '../sim/time.js';
import { HUD_PALETTE } from './palette.js';
import { TextPlate } from './ui/text-plate.js';
import type { UiKit } from './ui/kit.js';

/** How long one announcement stays up. */
const HOLD_TICKS = 3 * TICKS_PER_SECOND;

/**
 * "Unlocked: …", the moment something is earned mid-run (#502).
 *
 * Until run feats, everything a save could earn was earned at a boss kill or
 * at the end of a run, and the results screen was where it was announced.
 * A feat is met in the middle of play — the sixth passive picked up, the
 * deepest Promille tier reached — so the news has to arrive there too. The
 * app commits the feat and hands this the names of whatever that earned
 * (`app/meta/index.ts`'s `recordBossFight`/`recordRunBests`); nothing here
 * knows a rule.
 *
 * One plate, a queue behind it: two things earned on the same tick (a boss
 * fight that was also a no-damage one) read one after the other rather than
 * on top of each other. Times out on the sim's own tick rather than the
 * frame clock, so a paused run holds the announcement where it is. The
 * Promille unlock is not announced here — it has its own banner
 * (`PromilleUnlockHud`), and the two would land on the same tick.
 */
export class UnlockToastHud {
  readonly view = new Container();

  private readonly plate: TextPlate;
  private readonly queue: string[] = [];
  private showing: string | null = null;
  private shownAtTick = 0;
  private centreX = 0;
  private top = 0;
  private locale: Locale;

  constructor(kit: UiKit, locale: Locale) {
    this.locale = locale;
    this.plate = new TextPlate(kit, { colour: HUD_PALETTE.toastText });
    this.plate.visible = false;
    this.view.addChild(this.plate.view);
  }

  setLocale(locale: Locale): void {
    this.locale = locale;
    if (this.showing !== null) {
      this.show(this.showing);
    }
  }

  /** Queues `names` to be announced, in order. */
  announce(names: readonly string[]): void {
    this.queue.push(...names);
  }

  /** Drops everything — a new run starts with nothing to announce. */
  clear(): void {
    this.queue.length = 0;
    this.showing = null;
    this.plate.visible = false;
  }

  sync(tick: number): void {
    if (this.showing !== null && tick - this.shownAtTick < HOLD_TICKS) {
      return;
    }
    const next = this.queue.shift();
    if (next === undefined) {
      this.showing = null;
      this.plate.visible = false;
      return;
    }
    this.showing = next;
    this.shownAtTick = tick;
    this.show(next);
    this.plate.visible = true;
  }

  /**
   * Centred, below the middle of the screen. The band above it is spoken
   * for — the curse, a villager's bark, the boss plate, the pickup toast, the
   * latch hint, the Promille and set banners and the pedestal reveal each
   * have their own line there (`app/main.ts`'s layout) — and an unlock most
   * often lands on the very tick one of those does (an item picked up, a
   * boss down), so it gets a line nothing else uses: under the player,
   * above the Losbrunnen prompt.
   */
  resize(width: number, height: number): void {
    this.centreX = Math.round(width / 2);
    this.top = Math.round(height * 0.68);
    this.plate.place(this.centreX, this.top);
  }

  /** Sets the words and re-centres — the plate's width is the text's, so it moves when they change. */
  private show(name: string): void {
    this.plate.set(t(this.locale, 'ui.hud.unlockEarned', { name }));
    this.plate.place(this.centreX, this.top);
  }
}
