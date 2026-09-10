import type { AircraftId } from './aircraft-catalog';
import { cockpitLook } from './RetailCockpit';

export interface CockpitRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
/** Authored safe rectangles inside the inspected retail combiner apertures (source pixels). */
const APERTURES: Record<AircraftId, CockpitRect> = {
  f14: { x: 516, y: 156, width: 249, height: 227 },
  a4e: { x: 526, y: 139, width: 228, height: 189 },
  x31: { x: 535, y: 197, width: 210, height: 181 },
};
export const COCKPIT_WIDTH_SCALE = 1.8;

/** Source-image normalized rectangle → viewport normalized rectangle. */
export function cockpitViewportRect(rect: CockpitRect, yaw: number, pitch: number): CockpitRect {
  const look = cockpitLook(yaw, pitch);
  return {
    x: (1 - COCKPIT_WIDTH_SCALE) / 2 + rect.x * COCKPIT_WIDTH_SCALE + look.xPercent / 100,
    y: rect.y + look.yPercent / 100,
    width: rect.width * COCKPIT_WIDTH_SCALE,
    height: rect.height,
  };
}
export function cockpitHudRect(id: AircraftId, yaw: number, pitch: number): CockpitRect {
  const rect = APERTURES[id];
  return cockpitViewportRect(
    { x: rect.x / 1280, y: rect.y / 490, width: rect.width / 1280, height: rect.height / 490 },
    yaw,
    pitch,
  );
}
/** Same fit used by SVG preserveAspectRatio: no HUD stretching, regardless of window aspect. */
export function fitCockpitHud(
  rect: CockpitRect,
  viewportWidth: number,
  viewportHeight: number,
): CockpitRect {
  const width = Math.min(rect.width * viewportWidth, (rect.height * viewportHeight * 760) / 620);
  const height = (width * 620) / 760;
  return {
    x: rect.x * viewportWidth + (rect.width * viewportWidth - width) / 2,
    y: rect.y * viewportHeight + (rect.height * viewportHeight - height) / 2,
    width,
    height,
  };
}
