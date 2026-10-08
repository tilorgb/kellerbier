import { Container, Sprite, type BitmapText } from './gfx/index.js';
import type { GameSim } from '../sim/game/sim.js';
import {
  promilleCapFor,
  promilleKaterLabel,
  promilleTierDisplayName,
  promilleTierEffects,
  promilleUnitSuffix,
} from '../sim/game/promille.js';
import { HUD_PALETTE, UI_PALETTE } from './palette.js';
import { iconRoles, type UiKit } from './ui/kit.js';
import { uiText, UI_TEXT_HEIGHT } from './ui/text.js';

const BAR_WIDTH = 60;
const BAR_HEIGHT = 9;
/** The well's own border, inside which the fill is drawn. */
const BAR_INSET = 2;
const ICON_GAP = 2;
const LABEL_GAP = 4;
const FLASH_GAP = 4;
/** One second: two blinks, then a fade. */
const FLASH_TICKS = 60;
/** Age (ticks since the crossing) at which the second blink has ended and the fade begins. */
const FLASH_FADE_START = 36;
const FLASH_UP = 0x5fb85a;
const FLASH_DOWN = 0xd9403a;

interface FlashPart {
  readonly icon: Sprite;
  readonly sign: BitmapText;
}

/**
 * The Promille meter: a drop icon, a fill in a sunken well, and the tier name.
 *
 * Screen-space, in `uiLayer`, positioned directly under `HealthHud` — same
 * reasoning as every other HUD piece here: never inside anything the camera
 * shakes, so the one thing the player reads their state off of holds still.
 *
 * The tier name is not decorative: it is what keeps this widget from
 * conveying its state by bar colour alone (the #21 acceptance criterion),
 * the same way the mug shapes carry `HealthHud`'s state independent of tint.
 * #154 adds a third, redundant-on-purpose channel — the drop icon takes the
 * tier's colour too, so the meter reads at a glance from the corner of the
 * eye without the label having to be read at all.
 */
export class PromilleHud {
  readonly view = new Container();

  private readonly kit: UiKit;
  private readonly icon: Sprite;
  private readonly fill: Sprite;
  private readonly label: BitmapText;
  private readonly iconWidth: number;
  /** Damage, then fire rate — see `syncFlash`. */
  private readonly flashParts: [FlashPart, FlashPart];

  constructor(kit: UiKit) {
    this.kit = kit;
    const iconSize = kit.iconSize('promille');
    this.iconWidth = iconSize.width;

    this.icon = new Sprite(kit.icon('promille', iconRoles(UI_PALETTE.accent)));
    this.icon.position.set(0, 0);
    this.view.addChild(this.icon);

    const barX = this.iconWidth + ICON_GAP;
    const well = kit.wellSprite(BAR_WIDTH, BAR_HEIGHT);
    well.position.set(barX, 0);
    this.view.addChild(well);

    this.fill = new Sprite(kit.solid);
    this.fill.position.set(barX + BAR_INSET, BAR_INSET);
    this.fill.height = BAR_HEIGHT - BAR_INSET * 2;
    this.view.addChild(this.fill);

    this.label = uiText('');
    this.label.position.set(barX + BAR_WIDTH + LABEL_GAP, 0);
    this.view.addChild(this.label);

    const makePart = (stat: 'stat-damage' | 'stat-fireRate'): FlashPart => {
      const icon = new Sprite(kit.icon(stat, iconRoles(UI_PALETTE.accent)));
      const sign = uiText('+');
      icon.visible = false;
      sign.visible = false;
      this.view.addChild(icon);
      this.view.addChild(sign);
      return { icon, sign };
    };
    this.flashParts = [makePart('stat-damage'), makePart('stat-fireRate')];
  }

  /**
   * `neutralReskin` (#33) is `app/settings.ts`'s own flag, read straight
   * through rather than cached on the HUD: nothing here needs to know it
   * changed, only what it currently is, the next time a frame syncs.
   */
  sync(sim: GameSim, neutralReskin: boolean): void {
    // A sober run (#85) has no meter at all — not an empty one. `setUnlocked`
    // is what actually hides the row and closes the gap it leaves in the HUD
    // column; this is the guard that stops a frame syncing into a hidden
    // widget. Since #236 `sim.promilleUnlocked` *can* flip mid-run, on the
    // boss that unlocks it — `app/main.ts` watches that edge and calls
    // `setUnlocked`/`layoutHud`, so by the time this early return stops
    // guarding, the row it is guarding is already on screen.
    if (!sim.promilleUnlocked) {
      return;
    }
    // The bar's own denominator is "how close to falling over," not a fixed
    // scale — at baseline Trinkfest that is `PROMILLE_MAX` exactly (unchanged
    // from pre-#92), and it grows with `promilleCapFor` once Trinkfest is
    // raised, so a full bar always means the same thing regardless of how
    // high tolerance has pushed the ceiling.
    const cap = promilleCapFor(sim.trinkfest, sim.tuning.promille);
    const ratio = Math.min(1, Math.max(0, sim.promille / cap));
    this.fill.width = Math.max(0, (BAR_WIDTH - BAR_INSET * 2) * ratio);
    const tierColor = neutralReskin ? HUD_PALETTE.promilleTierNeutral : HUD_PALETTE.promilleTier;
    const katerColor = neutralReskin ? HUD_PALETTE.promilleKaterNeutral : HUD_PALETTE.promilleKater;
    const colour = sim.hasKater ? katerColor : tierColor[sim.promilleTier];
    this.fill.tint = colour;
    this.icon.texture = this.kit.icon('promille', iconRoles(colour));

    const tierText = `${promilleTierDisplayName(sim.promilleTier, neutralReskin)} ${sim.promille.toFixed(1)}${promilleUnitSuffix(neutralReskin)}`;
    // Trinkfest itself only earns HUD space once it has actually moved off
    // baseline — showing "Trinkfest 0" on every single run would be clutter
    // for a number that, at baseline, changes nothing about how the bar
    // reads (open design question from #92, resolved this way: always
    // inspectable via the debug tuning window, only shown here when it
    // matters to the player in front of it).
    const trinkfestText =
      sim.trinkfest !== 0 ? ` T${sim.trinkfest > 0 ? '+' : ''}${String(sim.trinkfest)}` : '';
    this.label.text = sim.hasKater
      ? `${tierText} ${promilleKaterLabel(neutralReskin)}${trinkfestText}`
      : `${tierText}${trinkfestText}`;
    this.syncFlash(sim);
  }

  /**
   * The tier-change cue: a damage and/or fire-rate icon with a `+` or `-`,
   * after the label, only for the stats that actually moved. Replaces the
   * tier-change text toast — the effects text lives in the pause menu's
   * Promille panel.
   *
   * Driven by the sim's tick age of the crossing rather than a timer of its
   * own, so it holds still while paused and needs no state to reset on a new
   * run.
   */
  private syncFlash(sim: GameSim): void {
    const change = sim.promilleTierChange;
    const age = change === null ? -1 : sim.tick - change.tick;
    if (change === null || age < 0 || age >= FLASH_TICKS) {
      this.flashParts[0].icon.visible = false;
      this.flashParts[0].sign.visible = false;
      this.flashParts[1].icon.visible = false;
      this.flashParts[1].sign.visible = false;
      return;
    }
    const tuning = sim.tuning.promille;
    const from = promilleTierEffects(change.from, tuning);
    const to = promilleTierEffects(change.tier, tuning);
    const deltas = [to.damagePercent - from.damagePercent, to.fireRatePercent - from.fireRatePercent];

    // Two blinks (lit, dark, lit, dark), then lit again while it fades out.
    const blinkOn = age < 10 || (age >= 18 && age < 28) || age >= FLASH_FADE_START;
    const alpha =
      age < FLASH_FADE_START ? 1 : (FLASH_TICKS - age) / (FLASH_TICKS - FLASH_FADE_START);

    let x = this.label.position.x + this.label.width + FLASH_GAP;
    for (let index = 0; index < this.flashParts.length; index++) {
      const part = this.flashParts[index];
      const delta = deltas[index] ?? 0;
      if (part === undefined || delta === 0 || !blinkOn) {
        if (part !== undefined) {
          part.icon.visible = false;
          part.sign.visible = false;
        }
        continue;
      }
      const up = delta > 0;
      const roles = iconRoles(index === 0 ? HUD_PALETTE.statDamage : HUD_PALETTE.statFireRate);
      part.icon.texture = this.kit.icon(index === 0 ? 'stat-damage' : 'stat-fireRate', roles);
      part.sign.text = up ? '+' : '-';
      part.sign.style.fill = up ? FLASH_UP : FLASH_DOWN;
      part.icon.position.set(x, 0);
      part.sign.position.set(x + part.icon.width + 1, 0);
      part.icon.alpha = alpha;
      part.sign.alpha = alpha;
      part.icon.visible = true;
      part.sign.visible = true;
      x += part.icon.width + 1 + part.sign.width + FLASH_GAP;
    }
  }

  /**
   * Shows or hides the whole row for a run (#85).
   *
   * Explicit rather than derived inside `sync`, because `height` is read by
   * `app/main.ts`'s `layoutHud` — which runs once per run start and per
   * resize, not per frame — and it has to already know the answer by then or
   * the HUD column keeps a hole where the meter used to be. `startRun` calls
   * this before `layoutHud` for exactly that reason.
   */
  setUnlocked(unlocked: boolean): void {
    this.view.visible = unlocked;
  }

  /**
   * Height of the row in UI pixels — the taller of the bar and one line of
   * text, and zero while hidden, so the rows below it close up rather than
   * stacking under a gap. `ActiveItemHud` gets away with a constant here
   * because it is second-from-last in the column; this row is second from
   * the top.
   */
  get height(): number {
    return this.view.visible ? Math.max(BAR_HEIGHT, UI_TEXT_HEIGHT) : 0;
  }
}
