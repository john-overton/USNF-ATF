/**
 * Menu geometry, as original constants.
 *
 * The numbers for the main menu are the ones `retail.mnu` recovers from
 * `CHOOSEAC.DLG` (see Docs/formats/mnu.md): a 238x361 panel at (379, 80) inside a
 * 640x480 screen, eight buttons at x=31, width 180, at the y values below. Keeping
 * them here means the app is laid out correctly with no disc present, and that the
 * retail bundle in step 5 has somewhere to drop its artwork without moving anything.
 *
 * No retail bytes are involved: these are measurements, in the same spirit as
 * `flight/cockpit-layout.ts`.
 */
import type { AircraftId } from '../../flight/aircraft-catalog';
import { AIRCRAFT } from '../../flight/aircraft-catalog';
import { MAIN_MENU_ITEMS, type MenuCommand } from './navigation';

/** The screen the original drew into, and the box every layout is written in. */
export const DESIGN_WIDTH = 640;
export const DESIGN_HEIGHT = 480;

/** `CHOOSEAC.DLG`'s own rect, kept for the retail bundle. */
export const RETAIL_MAIN_MENU_RECT = { x: 379, y: 80, width: 238, height: 361 } as const;
/** Its eight buttons, in order, at x=31 and width 180. */
export const RETAIL_MAIN_MENU_ROWS = [24, 56, 88, 120, 170, 202, 234, 285] as const;
export const BUTTON_X = 31;
export const BUTTON_WIDTH = 180;
/** The retail nine-slice button art is 30 px tall, on a 32 px row pitch. */
export const BUTTON_HEIGHT = 30;
/** The two rows below the retail group are ours, so our panel is that much taller. */
const OUR_ROWS = [317, 349] as const;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MenuWidget {
  type: 'action' | 'text' | 'title';
  x: number;
  y: number;
  width: number;
  height?: number;
  command?: MenuCommand;
  /** Only `choose-aircraft` carries one. */
  value?: AircraftId;
  label: string;
  /** Said out loud next to a disabled item, so the menu explains itself. */
  note?: string;
  disabled?: boolean;
  pressed?: boolean;
}

export interface MenuLayout {
  rect: Rect;
  title: string;
  widgets: MenuWidget[];
}

/**
 * The panel is 64 px taller than the retail one and sits 40 px higher, which is
 * exactly the room the two rows we add need. Everything inside the retail group
 * keeps its recovered position.
 */
export const MAIN_MENU_RECT: Rect = { x: 379, y: 40, width: 238, height: 425 };

/**
 * With the retail bundle installed the panel is the original's own rect, which has
 * no room below `Reference` for the two rows we add. They go side by side just
 * under the panel instead, where the artwork is plain.
 */
export function mainMenuLayout(rect: Rect = MAIN_MENU_RECT): MenuLayout {
  const stacked = rect.height >= (OUR_ROWS[1] ?? 0) + BUTTON_HEIGHT;
  const ours = stacked
    ? OUR_ROWS.map((y) => ({ x: BUTTON_X, y, width: BUTTON_WIDTH }))
    : [
        { x: BUTTON_X, y: rect.height + 2, width: 86 },
        { x: BUTTON_X + 94, y: rect.height + 2, width: 86 },
      ];
  const places = [
    ...RETAIL_MAIN_MENU_ROWS.map((y) => ({ x: BUTTON_X, y, width: BUTTON_WIDTH })),
    ...ours,
  ];
  return {
    rect,
    title: 'Jane’s USNF — fan remake',
    widgets: MAIN_MENU_ITEMS.map((item, index) => {
      const place = places[index] ?? { x: BUTTON_X, y: BUTTON_HEIGHT * index, width: BUTTON_WIDTH };
      return {
        type: 'action' as const,
        ...place,
        height: BUTTON_HEIGHT,
        command: item.command,
        label: item.label,
        disabled: !item.enabled,
        ...(item.note ? { note: item.note } : {}),
      };
    }),
  };
}

/**
 * There is no retail aircraft chooser to recover — `CHOOSEAC.DLG` is the mission
 * chooser despite its name — so this is ours, written in the same box.
 */
export function aircraftSelectLayout(current: AircraftId): MenuLayout {
  const ids = Object.keys(AIRCRAFT) as AircraftId[];
  return {
    rect: { x: 379, y: 80, width: 238, height: 240 },
    title: 'Select aircraft',
    widgets: [
      ...ids.map((aircraft, index) => ({
        type: 'action' as const,
        x: BUTTON_X,
        y: 24 + index * 32,
        width: BUTTON_WIDTH,
        height: BUTTON_HEIGHT,
        command: 'choose-aircraft' as const,
        value: aircraft,
        label: AIRCRAFT[aircraft].name,
        pressed: aircraft === current,
      })),
      {
        type: 'action',
        x: BUTTON_X,
        y: 24 + ids.length * 32 + 18,
        width: BUTTON_WIDTH,
        height: BUTTON_HEIGHT,
        command: 'back',
        label: 'Back',
      },
    ],
  };
}

export interface DebriefLines {
  aircraft: string;
  lines: string[];
}

export function debriefLayout(debrief: DebriefLines): MenuLayout {
  return {
    rect: { x: 379, y: 80, width: 238, height: 280 },
    title: 'Debrief',
    widgets: [
      { type: 'text', x: BUTTON_X, y: 20, width: BUTTON_WIDTH, label: debrief.aircraft },
      ...debrief.lines.map((label, index) => ({
        type: 'text' as const,
        x: BUTTON_X,
        y: 48 + index * 22,
        width: BUTTON_WIDTH,
        label,
      })),
      {
        type: 'action',
        x: BUTTON_X,
        y: 48 + debrief.lines.length * 22 + 24,
        width: BUTTON_WIDTH,
        height: BUTTON_HEIGHT,
        command: 'main-menu',
        label: 'Main menu',
      },
    ],
  };
}
