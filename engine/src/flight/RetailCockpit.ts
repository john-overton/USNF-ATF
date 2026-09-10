import type { AircraftId } from './aircraft-catalog';

export interface RetailCockpitMirror {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  maskPngBase64: string;
}

export interface RetailCockpit {
  version: 1;
  aircraftId: AircraftId;
  label: string;
  width: number;
  height: number;
  pngBase64: string;
  mirrors?: RetailCockpitMirror[];
}

/** Restrict image imports to bounded PNG data, never arbitrary URLs or SVG. */
export function parseRetailCockpit(value: unknown, id: AircraftId): RetailCockpit {
  if (!value || typeof value !== 'object') throw new Error('Invalid cockpit manifest');
  const data = value as Partial<RetailCockpit>;
  if (
    data.version !== 1 ||
    data.aircraftId !== id ||
    typeof data.label !== 'string' ||
    !data.label ||
    data.label.length > 200 ||
    data.width !== 1280 ||
    data.height !== 490 ||
    typeof data.pngBase64 !== 'string' ||
    data.pngBase64.length > 4_000_000 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(data.pngBase64) ||
    data.pngBase64.length % 4 !== 0
  )
    throw new Error('Invalid or mismatched cockpit manifest');
  validateCockpitPng(data.pngBase64, data.width, data.height);
  if (data.mirrors !== undefined) {
    if (!Array.isArray(data.mirrors) || data.mirrors.length > 3)
      throw new Error('Invalid cockpit mirrors');
    const ids = new Set<string>();
    for (const mirror of data.mirrors) {
      if (
        !mirror ||
        typeof mirror.id !== 'string' ||
        !mirror.id ||
        mirror.id.length > 40 ||
        ids.has(mirror.id) ||
        ![mirror.x, mirror.y, mirror.width, mirror.height].every(Number.isFinite) ||
        mirror.x < 0 ||
        mirror.y < 0 ||
        mirror.width <= 0 ||
        mirror.height <= 0 ||
        mirror.x + mirror.width > 1 ||
        mirror.y + mirror.height > 1 ||
        typeof mirror.maskPngBase64 !== 'string' ||
        mirror.maskPngBase64.length > 1_000_000
      )
        throw new Error('Invalid cockpit mirror region');
      ids.add(mirror.id);
      validateCockpitPng(
        mirror.maskPngBase64,
        Math.round(mirror.width * 1280),
        Math.round(mirror.height * 490),
      );
    }
  }
  return data as RetailCockpit;
}

/** Structural/CRC validation; the browser remains responsible for actual PNG inflation. */
function validateCockpitPng(pngBase64: string, width: number, height: number): void {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(pngBase64) || pngBase64.length % 4 !== 0)
    throw new Error('Invalid cockpit PNG base64');
  const bytes = atob(pngBase64);
  if (bytes.length < 33 || !bytes.startsWith('\x89PNG\r\n\x1a\n') || bytes.slice(12, 16) !== 'IHDR')
    throw new Error('Cockpit image must be a PNG');
  const dimension = (offset: number) =>
    bytes.charCodeAt(offset) * 0x1000000 +
    (bytes.charCodeAt(offset + 1) << 16) +
    (bytes.charCodeAt(offset + 2) << 8) +
    bytes.charCodeAt(offset + 3);
  if (dimension(16) !== width || dimension(20) !== height)
    throw new Error('Cockpit PNG dimensions differ from manifest');
  if (
    dimension(8) !== 13 ||
    bytes.charCodeAt(24) !== 8 ||
    ![3, 6].includes(bytes.charCodeAt(25)) ||
    bytes.slice(26, 29) !== '\0\0\0'
  )
    throw new Error('Unsupported cockpit PNG encoding');
  let imageData = false;
  let end = false;
  let palette = false;
  let transparency = bytes.charCodeAt(25) === 6;
  for (let offset = 8; offset < bytes.length;) {
    if (offset + 12 > bytes.length) throw new Error('Truncated cockpit PNG chunk');
    const length = dimension(offset);
    const tag = bytes.slice(offset + 4, offset + 8);
    const next = offset + length + 12;
    if (next > bytes.length) throw new Error('Truncated cockpit PNG data');
    let crc = 0xffffffff;
    for (let i = offset + 4; i < next - 4; i++) {
      crc ^= bytes.charCodeAt(i);
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    if ((crc ^ 0xffffffff) >>> 0 !== dimension(next - 4))
      throw new Error('Cockpit PNG checksum mismatch');
    if (tag === 'IHDR' && offset !== 8) throw new Error('Duplicate cockpit PNG header');
    if (tag === 'PLTE') {
      if (imageData || length < 3 || length > 768 || length % 3)
        throw new Error('Invalid cockpit PNG palette');
      palette = true;
    }
    if (tag === 'tRNS') transparency = true;
    if (tag === 'IDAT') {
      if (bytes.charCodeAt(25) === 3 && !palette) throw new Error('Cockpit PNG missing palette');
      imageData ||= length > 0;
    }
    if (tag === 'IEND') {
      if (length !== 0 || next !== bytes.length) throw new Error('Invalid cockpit PNG end');
      end = true;
    }
    offset = next;
  }
  if (!imageData || !end || !transparency) throw new Error('Incomplete or opaque cockpit PNG');
}

/** Original flat-art look projection. Hide the forward frame before turning behind it. */
export function cockpitLook(yaw: number, pitch: number) {
  const degrees = 180 / Math.PI;
  return {
    xPercent: yaw === 0 ? 0 : -yaw * degrees * 1.2,
    yPercent: pitch * degrees * 1.5,
    opacity: Math.max(
      0,
      Math.min(1, (65 - Math.abs(yaw * degrees)) / 20, (55 - Math.abs(pitch * degrees)) / 20),
    ),
  };
}
