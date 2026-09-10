import { expect, test } from 'bun:test';
import { cockpitLook, parseRetailCockpit } from './RetailCockpit';

function manifest() {
  // Original synthetic transparent raster, generated with retail.png (no retail bytes).
  const png =
    'iVBORw0KGgoAAAANSUhEUgAABQAAAAHqCAMAAABsqhMyAAAAA1BMVEUAAACnej3aAAAAAXRSTlMAQObYZgAAAnZJREFUeJztwQEBAAAAgiD/r25IQAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAvBiUcQABpYNSNgAAAABJRU5ErkJggg==';
  return {
    version: 1,
    aircraftId: 'f14',
    label: 'Synthetic',
    width: 1280,
    height: 490,
    pngBase64: png,
  };
}

test('cockpit rejects foreign aircraft, remote content and mismatched raster dimensions', () => {
  const data = manifest();
  expect(parseRetailCockpit(data, 'f14').aircraftId).toBe('f14');
  expect(() => parseRetailCockpit(data, 'x31')).toThrow();
  expect(() =>
    parseRetailCockpit({ ...data, pngBase64: 'https://example.com/art.png' }, 'f14'),
  ).toThrow();
  const bytes = atob(data.pngBase64);
  expect(() =>
    parseRetailCockpit({ ...data, pngBase64: btoa(bytes.slice(0, 33)) }, 'f14'),
  ).toThrow();
  expect(() =>
    parseRetailCockpit({ ...data, pngBase64: btoa(bytes.slice(0, -12)) }, 'f14'),
  ).toThrow();
  expect(() =>
    parseRetailCockpit(
      { ...data, pngBase64: btoa(bytes.slice(0, -5) + 'X' + bytes.slice(-4)) },
      'f14',
    ),
  ).toThrow();
  expect(() =>
    parseRetailCockpit(
      { ...data, pngBase64: btoa(bytes.slice(0, 16) + '\0'.repeat(8) + bytes.slice(24)) },
      'f14',
    ),
  ).toThrow();
});

test('mirror regions reject duplicate IDs, bounds errors and mismatched mask dimensions', () => {
  const data = manifest();
  const mirror = { id: 'center', x: 0, y: 0, width: 1, height: 1, maskPngBase64: data.pngBase64 };
  expect(parseRetailCockpit({ ...data, mirrors: [mirror] }, 'f14').mirrors).toHaveLength(1);
  expect(() => parseRetailCockpit({ ...data, mirrors: [mirror, mirror] }, 'f14')).toThrow();
  expect(() => parseRetailCockpit({ ...data, mirrors: [{ ...mirror, x: 0.1 }] }, 'f14')).toThrow();
  expect(() =>
    parseRetailCockpit({ ...data, mirrors: [{ ...mirror, width: 0.5 }] }, 'f14'),
  ).toThrow();
});

test('looking aside moves cockpit against gaze and hides forward art at rear', () => {
  expect(cockpitLook(0, 0)).toEqual({ xPercent: 0, yPercent: 0, opacity: 1 });
  expect(cockpitLook(0.2, 0.1).xPercent).toBeLessThan(0);
  expect(cockpitLook(0.2, 0.1).yPercent).toBeGreaterThan(0);
  expect(cockpitLook(Math.PI, 0).opacity).toBe(0);
  expect(cockpitLook(0, Math.PI / 2).opacity).toBe(0);
});
