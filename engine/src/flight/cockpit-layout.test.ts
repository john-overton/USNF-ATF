import { expect, test } from 'bun:test';
import { cockpitHudRect, cockpitViewportRect, fitCockpitHud } from './cockpit-layout';

test('full HUD fits aperture without distortion in wide, standard and tall windows', () => {
  for (const id of ['f14', 'a4e', 'x31'] as const) {
    for (const [width, height] of [
      [1600, 900],
      [1024, 768],
      [900, 1400],
      [2560, 1080],
    ]) {
      const aperture = cockpitHudRect(id, 0, 0);
      const fit = fitCockpitHud(aperture, width!, height!);
      expect(fit.width / fit.height).toBeCloseTo(760 / 620, 10);
      expect(fit.x + 1e-8).toBeGreaterThanOrEqual(aperture.x * width!);
      expect(fit.y + 1e-8).toBeGreaterThanOrEqual(aperture.y * height!);
      expect(fit.x + fit.width).toBeLessThanOrEqual((aperture.x + aperture.width) * width! + 1e-8);
      expect(fit.y + fit.height).toBeLessThanOrEqual(
        (aperture.y + aperture.height) * height! + 1e-8,
      );
    }
  }
});

test('cockpit frame, HUD aperture and mirror region share the same head-look translation', () => {
  const frame = cockpitViewportRect({ x: 0, y: 0, width: 1, height: 1 }, 0, 0);
  expect(frame.width).toBe(1.8);
  const a = cockpitHudRect('f14', 0, 0);
  const b = cockpitHudRect('f14', 0.3, -0.1);
  const mirror = { x: 0.4, y: 0.02, width: 0.2, height: 0.1 };
  const c = cockpitViewportRect(mirror, 0, 0);
  const d = cockpitViewportRect(mirror, 0.3, -0.1);
  expect(b.x - a.x).toBeCloseTo(d.x - c.x, 10);
  expect(b.y - a.y).toBeCloseTo(d.y - c.y, 10);
});
