import { Container, NineSliceSprite, Sprite, type Renderer, type Texture } from 'pixi.js';
import { HUD_PALETTE, UI_PALETTE } from '../palette.js';
import {
  FOCUS_CORNER,
  FRAME_BUTTON,
  FRAME_CORNER,
  FRAME_PANEL,
  FRAME_SLOT,
  FRAME_WELL,
  KNOB,
} from './frames.js';
import { UI_ICONS } from './icons.js';
import { artHeight, artWidth, pixelArtTexture, type ArtRoles } from './pixel-art.js';

/**
 * The UI kit: every frame, icon and state the HUD and (later) the menus draw
 * with, built once against a renderer and handed round.
 *
 * ## Why this is a kit rather than a pile of helpers
 *
 * Before #154 each HUD piece reached for `placeholder-art.ts` and made its own
 * bar outline, its own solid fill, its own `Text` in the browser's monospace.
 * The result was internally consistent only by coincidence — the Promille bar
 * and the boss bar had different border radii, the wallet had no frame at all,
 * and nothing had a style that could be changed in one place. A kit is what
 * makes "the HUD looks like one game" a property of one module instead of a
 * habit six modules have to keep.
 *
 * ## States are colour, not geometry
 *
 * A button at rest, selected, pressed and disabled are the *same* nine-slice
 * with different roles bound to it. That is deliberate: a selected row that
 * were a pixel taller would make a menu twitch as the cursor moved through it,
 * and a pressed row that shifted down by a pixel would fight the focus ring
 * sitting outside it. The bevel inverting is the whole of "pressed".
 */

/** Which of a button's four looks to draw. */
export type ButtonState = 'normal' | 'selected' | 'pressed' | 'disabled';

// `FRAME_PANEL` inks `o`/`a`/`f` only — the amber rim is `accent`, and the
// panel has no bevel to give `highlight` to.
const PANEL_ROLES: ArtRoles = {
  outline: UI_PALETTE.outline,
  fill: UI_PALETTE.panelFill,
  highlight: UI_PALETTE.panelHighlight,
  accent: UI_PALETTE.accent,
};

// A well is a hole: shadow along the top (`accent`), light along the bottom
// (`highlight`) — the button's bevel, inverted.
const WELL_ROLES: ArtRoles = {
  outline: UI_PALETTE.outline,
  fill: UI_PALETTE.wellFill,
  highlight: UI_PALETTE.panelHighlight,
  accent: UI_PALETTE.panelShadow,
};

// The slot's `f` pixels are its four corner ticks, not a field — an empty
// slot is transparent through the middle so the panel behind it shows.
const SLOT_ROLES: ArtRoles = {
  outline: UI_PALETTE.outline,
  fill: UI_PALETTE.panelHighlight,
  highlight: UI_PALETTE.panelHighlight,
  accent: UI_PALETTE.accent,
};

const BUTTON_ROLES: Readonly<Record<ButtonState, ArtRoles>> = {
  normal: {
    outline: UI_PALETTE.outline,
    fill: UI_PALETTE.buttonFill,
    highlight: UI_PALETTE.buttonHighlight,
    accent: UI_PALETTE.buttonShadow,
  },
  selected: {
    outline: UI_PALETTE.outline,
    fill: UI_PALETTE.buttonSelectedFill,
    highlight: UI_PALETTE.buttonSelectedHighlight,
    accent: UI_PALETTE.buttonShadow,
  },
  // Pressed swaps highlight and shadow: the light now comes from below, which
  // is what "pushed in" looks like at one pixel of bevel.
  pressed: {
    outline: UI_PALETTE.outline,
    fill: UI_PALETTE.buttonPressedFill,
    highlight: UI_PALETTE.buttonShadow,
    accent: UI_PALETTE.buttonSelectedHighlight,
  },
  // Disabled has no bevel at all — flat is the strongest "this does nothing"
  // the kit can say without relying on the label's colour alone.
  disabled: {
    outline: UI_PALETTE.outline,
    fill: UI_PALETTE.buttonDisabledFill,
    highlight: UI_PALETTE.buttonDisabledFill,
    accent: UI_PALETTE.buttonDisabledFill,
  },
};

const KNOB_ROLES: ArtRoles = {
  outline: UI_PALETTE.outline,
  fill: UI_PALETTE.knobFill,
  highlight: UI_PALETTE.text,
  accent: UI_PALETTE.panelShadow,
};

const FOCUS_ROLES: ArtRoles = {
  outline: UI_PALETTE.outline,
  fill: UI_PALETTE.focusRing,
  highlight: UI_PALETTE.focusRing,
  accent: UI_PALETTE.focusRing,
};

/**
 * The roles an icon is drawn in.
 *
 * `iconRoles(accent)` is the common case — the kit's outline and fill, with
 * one colour swapped for whatever the icon is *about* (a Bratwurst's red, a
 * Biermarke's gold). The health row is why this is a function rather than a
 * constant: one Wurst bitmap, three pools, three sets of roles.
 */
export function iconRoles(accent: number, fill: number = UI_PALETTE.panelHighlight): ArtRoles {
  return {
    outline: UI_PALETTE.outline,
    fill,
    highlight: UI_PALETTE.text,
    accent,
  };
}

/**
 * Icon roles for one of the three health pools — Bratwurst (red), Weißwurst
 * (soul), Blutwurst (eternal). `accent` draws the bitmap's one detail fleck:
 * a dark grill mark on Bratwurst, a bright fat fleck on Blutwurst, and on
 * Weißwurst the same colour as `fill` so its two fleck pixels blend away —
 * one bitmap stays plain on the pool that has no business showing a mark.
 */
export const HEALTH_ICON_ROLES: Readonly<Record<'red' | 'soul' | 'eternal', ArtRoles>> = {
  red: {
    outline: UI_PALETTE.outline,
    fill: HUD_PALETTE.healthRed,
    highlight: 0xf2a09a,
    accent: 0x7a2313,
  },
  soul: {
    outline: UI_PALETTE.outline,
    fill: HUD_PALETTE.healthSoul,
    highlight: 0xffffff,
    accent: HUD_PALETTE.healthSoul,
  },
  // Blutwurst: the fill is nearly the outline, so the highlight and the red
  // flecks are the only things that keep the silhouette readable.
  eternal: {
    outline: UI_PALETTE.outline,
    fill: HUD_PALETTE.healthEternal,
    highlight: 0x8a8a9a,
    accent: HUD_PALETTE.healthRed,
  },
};

/** Every texture the kit owns. Built once; `app/main.ts` and `editor/playtest.ts` share one. */
export class UiKit {
  readonly panel: Texture;
  readonly button: Readonly<Record<ButtonState, Texture>>;
  readonly well: Texture;
  readonly slot: Texture;
  readonly knob: Texture;
  readonly focusCorner: Texture;
  /** A 1×1 white square, stretched for bar fills — the one primitive a nine-slice cannot be. */
  readonly solid: Texture;

  private readonly icons = new Map<string, Texture>();
  private readonly renderer: Renderer;

  constructor(renderer: Renderer) {
    this.renderer = renderer;
    this.panel = pixelArtTexture(renderer, FRAME_PANEL, PANEL_ROLES);
    this.well = pixelArtTexture(renderer, FRAME_WELL, WELL_ROLES);
    this.slot = pixelArtTexture(renderer, FRAME_SLOT, SLOT_ROLES);
    this.knob = pixelArtTexture(renderer, KNOB, KNOB_ROLES);
    this.focusCorner = pixelArtTexture(renderer, FOCUS_CORNER, FOCUS_ROLES);
    this.solid = pixelArtTexture(renderer, ['f'], {
      outline: 0xffffff,
      fill: 0xffffff,
      highlight: 0xffffff,
      accent: 0xffffff,
    });
    const button: Record<ButtonState, Texture> = {
      normal: pixelArtTexture(renderer, FRAME_BUTTON, BUTTON_ROLES.normal),
      selected: pixelArtTexture(renderer, FRAME_BUTTON, BUTTON_ROLES.selected),
      pressed: pixelArtTexture(renderer, FRAME_BUTTON, BUTTON_ROLES.pressed),
      disabled: pixelArtTexture(renderer, FRAME_BUTTON, BUTTON_ROLES.disabled),
    };
    this.button = button;
  }

  /**
   * An icon in the roles asked for, cached by `(name, roles)`.
   *
   * Cached rather than rebuilt because the health row asks for the same three
   * mugs on every construction and a texture per mug per pool would be twenty
   * textures for three drawings.
   */
  icon(name: string, roles: ArtRoles): Texture {
    const key = [name, roles.outline, roles.fill, roles.highlight, roles.accent].join(':');
    const cached = this.icons.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const art = UI_ICONS[name];
    if (art === undefined) {
      // An icon nobody drew is a typo in a call site, not a content gap —
      // `docs/DECISIONS.md` #19's loud half. There is no sensible fallback
      // shape for "the wrong idea".
      throw new Error(`ui kit: no icon named "${name}"`);
    }
    const texture = pixelArtTexture(this.renderer, art, roles);
    this.icons.set(key, texture);
    return texture;
  }

  /** The authored size of an icon, before any UI scale. */
  iconSize(name: string): { width: number; height: number } {
    const art = UI_ICONS[name];
    if (art === undefined) {
      throw new Error(`ui kit: no icon named "${name}"`);
    }
    return { width: artWidth(art), height: artHeight(art) };
  }

  /** A stretchable panel of `width`×`height` UI pixels. */
  panelSprite(width: number, height: number): NineSliceSprite {
    return this.nineSlice(this.panel, width, height);
  }

  /** A stretchable sunken well — a bar's frame, a slider's track. */
  wellSprite(width: number, height: number): NineSliceSprite {
    return this.nineSlice(this.well, width, height);
  }

  /** A stretchable item slot. */
  slotSprite(width: number, height: number): NineSliceSprite {
    return this.nineSlice(this.slot, width, height);
  }

  /** A stretchable button in one of its four states — swap `texture` to change state. */
  buttonSprite(state: ButtonState, width: number, height: number): NineSliceSprite {
    return this.nineSlice(this.button[state], width, height);
  }

  private nineSlice(texture: Texture, width: number, height: number): NineSliceSprite {
    const sprite = new NineSliceSprite({
      texture,
      leftWidth: FRAME_CORNER,
      rightWidth: FRAME_CORNER,
      topHeight: FRAME_CORNER,
      bottomHeight: FRAME_CORNER,
    });
    // Never below the corners' own size, or a nine-slice draws its left and
    // right corners on top of each other and the border doubles.
    sprite.width = Math.max(FRAME_CORNER * 2, Math.round(width));
    sprite.height = Math.max(FRAME_CORNER * 2, Math.round(height));
    return sprite;
  }
}

/**
 * Four corner brackets around a box of `width`×`height`, in a container whose
 * origin is the box's top-left.
 *
 * `sync` moves and resizes it without rebuilding, because in a menu this
 * follows the cursor every time it moves and rebuilding four sprites per
 * keypress is exactly the kind of per-frame allocation the rest of `render/`
 * is careful about.
 */
export class FocusRing {
  readonly view = new Container();

  private readonly corners: Sprite[] = [];

  constructor(kit: UiKit) {
    for (let index = 0; index < 4; index++) {
      const corner = new Sprite(kit.focusCorner);
      // Mirrored rather than four bitmaps: the corner is the same shape four
      // times, and a negative scale on a nearest-filtered texture is exact.
      corner.scale.set(index % 2 === 0 ? 1 : -1, index < 2 ? 1 : -1);
      this.corners.push(corner);
      this.view.addChild(corner);
    }
    this.view.visible = false;
  }

  /** Wrap the box at `(x, y)` of `width`×`height` UI pixels. `null` hides the ring. */
  sync(box: { x: number; y: number; width: number; height: number } | null): void {
    if (box === null) {
      this.view.visible = false;
      return;
    }
    this.view.visible = true;
    // One pixel outside the box on every side — the ring annotates the
    // element, it is not part of its border.
    const left = box.x - 1;
    const top = box.y - 1;
    const right = box.x + box.width + 1;
    const bottom = box.y + box.height + 1;
    const positions: readonly (readonly [number, number])[] = [
      [left, top],
      [right, top],
      [left, bottom],
      [right, bottom],
    ];
    for (let index = 0; index < this.corners.length; index++) {
      const corner = this.corners[index];
      const position = positions[index];
      if (corner === undefined || position === undefined) {
        continue;
      }
      corner.position.set(position[0], position[1]);
    }
  }
}
