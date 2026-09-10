/**
 * The optional retail menu bundle, reduced to what a menu component can use: data
 * URLs and CSS custom properties. Loading happens once in `Shell.tsx` and is handed
 * down as a plain object, mirroring how `CockpitOverlay.tsx` loads cockpit art, so
 * the menu components themselves stay prop-driven and effect-free.
 *
 * With no bundle installed — which is the normal case, since the bundle is built
 * from the user's own discs — every one of these is undefined and the menus draw
 * their own chrome exactly as before.
 */
import type { Platform } from '../../platform/Platform';
import {
  parseRetailMenu,
  parseRetailMenuSounds,
  type RetailMenuBundle,
  type RetailMenuSounds,
} from '../../data/retail-menu';
import type { Rect } from './layout';

/** Read caps, before the parser's own: a bundle is user-supplied data. */
const SCREENS_LIMIT = 32_000_000;
const SOUNDS_LIMIT = 8_000_000;

export interface MenuAssets {
  bundle?: RetailMenuBundle;
  sounds?: RetailMenuSounds;
  /** Why there is no bundle, when the reason is not simply that none is installed. */
  error?: string;
}

const dataUrl = (pngBase64: string) => `url("data:image/png;base64,${pngBase64}")`;

/** The rect the retail dialog gives for a screen, when the bundle has one. */
export function retailRect(assets: MenuAssets | undefined, screen: string): Rect | undefined {
  const found = assets?.bundle?.screens[screen];
  return found ? { ...found.rect } : undefined;
}

export function screenBackground(
  assets: MenuAssets | undefined,
  screen: string,
): string | undefined {
  const background = assets?.bundle?.screens[screen]?.background;
  return background ? dataUrl(background.pngBase64) : undefined;
}

/**
 * The button chrome as custom properties. The original composites a button from
 * three pieces — a left cap, a middle it repeats, and a right cap — so each state
 * becomes three layered backgrounds and the stylesheet picks a state with ordinary
 * `:hover` and `:disabled` rules rather than any JavaScript.
 */
export function buttonChrome(assets: MenuAssets | undefined): Record<string, string> {
  const sprites = assets?.bundle?.sprites;
  if (!sprites) return {};
  const style: Record<string, string> = {};
  for (const part of ['left', 'middle', 'right'] as const)
    for (const entry of sprites[`action-${part}`] ?? [])
      style[`--menu-button-${part}-${entry.state}`] = dataUrl(entry.image.pngBase64);
  const middle = sprites['action-middle']?.[0]?.image;
  if (middle) style['--menu-button-height'] = `${middle.height}`;
  const left = sprites['action-left']?.[0]?.image;
  if (left) style['--menu-button-cap'] = `${left.width}`;
  return style;
}

export async function loadMenuAssets(platform: Platform): Promise<MenuAssets> {
  const read = async (name: string, limit: number): Promise<unknown> => {
    if (!(await platform.fs.exists('appData', `menu/${name}`))) return undefined;
    const text = await platform.fs.readText('appData', `menu/${name}`);
    if (text.length > limit) throw new Error(`menu/${name} exceeds its size limit`);
    return JSON.parse(text);
  };
  try {
    const [screens, sounds] = await Promise.all([
      read('screens.json', SCREENS_LIMIT),
      read('sounds.json', SOUNDS_LIMIT),
    ]);
    return {
      ...(screens ? { bundle: parseRetailMenu(screens) } : {}),
      ...(sounds ? { sounds: parseRetailMenuSounds(sounds) } : {}),
    };
  } catch (error) {
    // A bad bundle must not take the menu down with it; the app runs without one.
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
