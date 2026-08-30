import { Container, Sprite, type BitmapText } from 'pixi.js';
import type { GameSim } from '../sim/game/sim.js';
import { HUD_PALETTE, UI_PALETTE } from './palette.js';
import { iconRoles, type UiKit } from './ui/kit.js';
import { uiText, UI_TEXT_HEIGHT } from './ui/text.js';

/** Gap between the icon and the name. */
const ICON_GAP = 3;

/**
 * Who you are playing as, and what their rule is currently doing (#47).
 *
 * Two things, and the second is the reason this exists at all. The name
 * alone would be a label — the run already knows who it is, and so does the
 * player who just picked. What the player cannot see anywhere else is the
 * *state* of a character rule: how far Bruder Barnabas's fast has climbed,
 * whether König Ludwig's purse still has anything in it, which floor Der
 * Wolpertinger's stats were last rolled for. `CONTRIBUTING.md`'s gameplay
 * row is explicit that a thing you cannot see is a thing you cannot tune,
 * and `CLAUDE.md`'s is explicit that a feature nobody can experience is not
 * finished; a stat multiplier moving silently in the pipeline is exactly the
 * shape both are warning about.
 *
 * Hidden entirely for a character with no rule to report — Alois's runs look
 * exactly as they did before this file existed, rather than gaining a row
 * that says "Alois".
 *
 * Screen-space, in `uiLayer`, and reading `sim` once a frame like every other
 * HUD piece here.
 */
export class CharacterHud {
  readonly view = new Container();

  private readonly kit: UiKit;
  private readonly icon: Sprite;
  private readonly label: BitmapText;

  constructor(kit: UiKit) {
    this.kit = kit;
    const size = kit.iconSize('star');
    this.icon = new Sprite(kit.icon('star', iconRoles(UI_PALETTE.accent)));
    this.icon.position.set(0, Math.floor((UI_TEXT_HEIGHT - size.height) / 2));
    this.label = uiText('');
    this.label.position.set(size.width + ICON_GAP, 0);
    this.view.addChild(this.icon, this.label);
    this.view.visible = false;
  }

  sync(sim: GameSim): void {
    const status = characterStatus(sim);
    if (status === null) {
      this.view.visible = false;
      return;
    }
    this.view.visible = true;
    this.label.text = `${sim.character.name} — ${status.text}`;
    this.icon.texture = this.kit.icon(status.icon, iconRoles(status.tint));
    this.label.tint = status.tint;
  }

  /** The line currently shown, or `''` while hidden — for tests. */
  get shownText(): string {
    return this.view.visible ? this.label.text : '';
  }

  /** Height of the row in UI pixels. */
  get height(): number {
    return UI_TEXT_HEIGHT;
  }
}

interface CharacterStatus {
  readonly text: string;
  readonly icon: string;
  readonly tint: number;
}

/**
 * What the character's rule is doing this frame, or `null` for a character
 * whose rules have no state worth watching (Alois, Resi, D'Sennerin — a shot
 * tag is already visible in the room, which is the bar #153 set for whether
 * an effect earns a HUD row).
 *
 * A free function rather than a method so the wording is testable without a
 * renderer, the same split `app/meta/progress.ts` keeps for the hub's text.
 */
export function characterStatus(sim: GameSim): CharacterStatus | null {
  const traits = sim.character;
  if (traits.rules.includes('fasting')) {
    const steps = sim.fastSteps;
    const percent = Math.round(steps * sim.tuning.character.fastStepBonus * 100);
    return steps === 0
      ? { text: 'Fastn: no nix', icon: 'mug-empty', tint: UI_PALETTE.textDim }
      : {
          text: `Fastn: +${String(percent)}% Stammwürze`,
          icon: 'star',
          tint: HUD_PALETTE.activeItemReady,
        };
  }
  if (traits.rules.includes('purse')) {
    return sim.pursePowered
      ? {
          text: `Geldbeutl: ${String(sim.biermarken)} — er fliagt`,
          icon: 'biermarke',
          tint: HUD_PALETTE.minimapTreasureIcon,
        }
      : { text: 'Geldbeutl leer — koa Kraft', icon: 'lock', tint: UI_PALETTE.textDisabled };
  }
  if (traits.rules.includes('chaos')) {
    return {
      text: `Neu würfelt im ${String(sim.chaosFloor)}. Stock`,
      icon: 'star',
      tint: UI_PALETTE.accent,
    };
  }
  return null;
}
