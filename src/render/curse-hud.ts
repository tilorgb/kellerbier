import { Container } from './gfx/index.js';
import type { GameSim } from '../sim/game/sim.js';
import { TICKS_PER_SECOND } from '../sim/time.js';
import type { Locale } from '../i18n/locale.js';
import { t, type DictKey } from '../i18n/translate.js';
import { HUD_PALETTE } from './palette.js';
import { TextPlate } from './ui/text-plate.js';
import type { UiKit } from './ui/kit.js';

/**
 * A floor's curse (#49): the entry announcement, and — for Sperrstunde
 * specifically — the "last call" countdown for as long as it is still
 * running.
 *
 * Two `TextPlate`s rather than one, the same reason `pickupToast` and
 * `pedestalReveal` are two separate plates in `app/main.ts`: the
 * announcement is a fading banner (`sim.curseAnnouncement`, aged by
 * `curseAnnounceTicks`) and the countdown is a small persistent readout that
 * outlives it for the rest of the timer, so one visibility flag cannot serve
 * both.
 */
export class CurseHud {
  readonly view = new Container();

  private readonly announcement: TextPlate;
  private readonly timer: TextPlate;
  private announcementLabel = '';
  private locale: Locale;

  constructor(kit: UiKit, locale: Locale) {
    this.locale = locale;
    this.announcement = new TextPlate(kit, { colour: HUD_PALETTE.toastText });
    this.view.addChild(this.announcement.view);
    this.timer = new TextPlate(kit, { colour: HUD_PALETTE.toastText });
    this.view.addChild(this.timer.view);
  }

  /** `sync` re-derives every label from `sim` each frame, so this only has to remember the new locale. */
  setLocale(locale: Locale): void {
    this.locale = locale;
  }

  sync(sim: GameSim): void {
    const locale = this.locale;
    const announced = sim.curseAnnouncement;
    if (announced !== null) {
      const label = `${announced.name} — ${t(locale, announced.description as DictKey)}`;
      if (label !== this.announcementLabel) {
        this.announcementLabel = label;
        this.announcement.set(label);
      }
      this.announcement.visible = true;
    } else {
      this.announcement.visible = false;
      this.announcementLabel = '';
    }

    if (sim.curse === 'sperrstunde' && sim.sperrstundeTicksLeft > 0) {
      const seconds = Math.ceil(sim.sperrstundeTicksLeft / TICKS_PER_SECOND);
      this.timer.set(t(locale, 'ui.hud.sperrstundeCountdown', { seconds }));
      this.timer.visible = true;
    } else if (sim.curse === 'sperrstunde') {
      this.timer.set(t(locale, 'ui.hud.sperrstundeComing'));
      this.timer.visible = true;
    } else {
      this.timer.visible = false;
    }
  }

  /** Centres the announcement banner near the top of the screen and tucks the timer under it. */
  resize(width: number, height: number): void {
    const centreX = Math.round(width / 2);
    const top = Math.round(height * 0.1);
    this.announcement.place(centreX, top);
    this.timer.place(centreX, top + this.announcement.height + 4);
  }
}
