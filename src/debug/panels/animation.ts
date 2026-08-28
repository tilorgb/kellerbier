import type { Container } from 'pixi.js';
import type { EntityAnimator } from '../../render/animation/animator.js';
import { ANIMATION_STATE_IDS } from '../../render/animation/definition.js';
import type { PlayerView } from '../../render/player-view.js';
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

/** One header line, Alois's line, then one line per enemy body, then the corpse line. */
const BODY_LINES = 6;
const LINES = BODY_LINES + 3;
const PANEL_HEIGHT = PANEL_CONTENT_TOP + LINES * PANEL_LINE_HEIGHT + PANEL_PADDING;

/**
 * Which clip and which frame every animated body is on.
 *
 * "Inspectable in the debug overlay — if you cannot see it, you cannot tune it"
 * (`CONTRIBUTING.md`'s gameplay definition-of-done) applies to a walk cycle as
 * much as to a stat: the questions that actually come up when animation looks
 * wrong are "is it playing the clip I think it is" and "is it playing at the
 * speed I authored", and neither is answerable from looking at the screen. The
 * frame number moving at the wrong rate, or a state stuck on `hurt`, is
 * obvious here and invisible in the room.
 *
 * Alois gets the first line to himself: his body strip (`side`,
 * `drunk-north`, ...), the clip playing on it, the frame, and which of the
 * Schlauch's sixteen aim frames the nozzle is on — `s0`-`s7` resting,
 * `s8`-`s15` firing.
 *
 * A body whose requested state is not the clip actually playing — the
 * unauthored-clip fallback (`docs/DECISIONS.md` #19) — is shown as
 * `move>idle` and warn-coloured, so a missing clip is visible while playing
 * and not only in the console at load.
 */
export class AnimationPanel implements DebugPanel {
  readonly title = 'animation';
  readonly view: Container;
  readonly height = PANEL_HEIGHT;

  private readonly animator: EntityAnimator;
  private readonly player: PlayerView;
  private readonly lines: ReturnType<typeof createLabel>[] = [];

  constructor(animator: EntityAnimator, player: PlayerView) {
    this.animator = animator;
    this.player = player;
    this.view = createPanelFrame(this.title, PANEL_HEIGHT);
    for (let line = 0; line < LINES; line++) {
      const label = createLabel('');
      label.position.set(PANEL_PADDING, PANEL_CONTENT_TOP + line * PANEL_LINE_HEIGHT);
      this.lines.push(label);
      this.view.addChild(label);
    }
  }

  update(context: DebugContext): void {
    // Every fourth frame: the frame *number* is the thing being read here, and
    // a value that changes every 16 ms is a value nobody can read at all.
    if (context.frame % 4 !== 0) {
      return;
    }
    const animator = this.animator;
    const tracked = animator.trackedCount;
    this.setLine(
      0,
      `bodies ${String(tracked)}  dt ${animator.lastDeltaMs.toFixed(1)}ms`,
      animator.lastDeltaMs >= 32,
    );

    // Alois first, and always — he is the one body that is on screen in every
    // room, and #151's whole question ("is the aim readable while he walks the
    // other way") is two of these fields side by side: which body strip is
    // drawn, and which of the Schlauch's sixteen aim frames.
    const player = this.player;
    this.setLine(
      1,
      `alois ${player.bodyKey.slice(0, 12).padEnd(12, ' ')} ` +
        `${(ANIMATION_STATE_IDS[player.playingState] ?? '?').slice(0, 6).padEnd(6, ' ')} ` +
        `f${String(player.frame)} s${String(player.schlauchFrame)}`,
    );

    for (let line = 0; line < BODY_LINES; line++) {
      if (line >= tracked) {
        this.setLine(line + 2, '');
        continue;
      }
      const slot = animator.trackedSlotAt(line);
      const set = animator.setOf(slot);
      if (set === null) {
        this.setLine(line + 2, '');
        continue;
      }
      const requested = animator.requestedStateOf(slot);
      const playing = animator.playingStateOf(slot);
      const requestedId = ANIMATION_STATE_IDS[requested] ?? '?';
      const playingId = ANIMATION_STATE_IDS[playing] ?? '?';
      const clip = requested === playing ? playingId : `${requestedId}>${playingId}`;
      const facing = animator.facingOf(slot) < 0 ? '<' : '>';
      this.setLine(
        line + 2,
        `${set.name.slice(0, 11).padEnd(11, ' ')} ${clip.slice(0, 11).padEnd(11, ' ')} ` +
          `f${String(animator.frameOf(slot))}${facing}`,
        requested !== playing,
      );
    }

    this.setLine(
      LINES - 1,
      `corpses ${String(animator.corpseCount)}  dropped ${String(animator.corpseOverflows)}`,
      animator.corpseOverflows > 0,
    );
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
