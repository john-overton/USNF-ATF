import type { FlightClip } from '../flight/FlightAudio';
export type GunMode = 'remake' | 'retail';
export interface NativeGun {
  source: string;
  sha256: string;
  initialSpeedFps: number;
  finalSpeedFps: number;
  minSpeedFps: number;
  maxSpeedFps: number;
  launchRetardPercent: number;
  decelerationFps2?: number;
  actualRoundsPerProjectile: number;
  intervalSeconds: number;
  lifetimeSeconds: number;
  gravityFps2: number;
  terminalFallSpeedFps: number;
  maxRangeM: number;
}
export interface BulletGeometry {
  source: string;
  sha256: string;
  paletteSource: string;
  paletteSha256: string;
  vertices: number[];
  colors: number[];
  indices: number[];
  scaleNote: string;
}
/** Ballistics shared by imported guns and explicitly authored fallback guns. */
export interface GunDefinition {
  name: string;
  capacity: number;
  muzzleSpeedMps: number;
  roundsPerSecond: number;
  tracerEvery: number;
  tracerColor: 'red' | 'green';
  mounts: [number, number, number][];
  damage?: [number, number, number, number, number];
  native?: NativeGun;
  bulletGeometry?: BulletGeometry;
}
export interface RetailGun extends GunDefinition {
  schemaVersion: 1;
  aircraftSource: string;
  aircraftSha256: string;
  name: string;
  type: 'm61' | 'mk12-pair';
  capacity: number;
  muzzleSpeedMps: number;
  roundsPerSecond: number;
  tracerEvery: number;
  tracerColor: 'red' | 'green';
  mounts: [number, number, number][];
  clip: FlightClip;
}
export function parseRetailGun(value: unknown): RetailGun {
  const g = value as RetailGun;
  const range = (n: number, lo: number, hi: number) => Number.isFinite(n) && n >= lo && n <= hi;
  const hash = (s: unknown) => typeof s === 'string' && /^[a-f0-9]{64}$/.test(s);
  const c = g?.clip as FlightClip & { encoding?: string };
  const native = g?.native;
  const geometry = g?.bulletGeometry;
  if (native === null || geometry === null) throw new Error('Invalid optional gun data');
  if (
    native &&
    (typeof native.source !== 'string' ||
      !hash(native.sha256) ||
      ![native.initialSpeedFps, native.finalSpeedFps, native.minSpeedFps, native.maxSpeedFps].every(
        (n) => range(n, 1, 10000),
      ) ||
      native.minSpeedFps > native.maxSpeedFps ||
      !range(native.launchRetardPercent, 0, 255) ||
      !Number.isInteger(native.actualRoundsPerProjectile) ||
      !range(native.actualRoundsPerProjectile, 1, 100) ||
      !range(native.intervalSeconds, 1 / 120, 60) ||
      !range(native.lifetimeSeconds, 0.1, 60) ||
      !range(native.gravityFps2, 0, 100) ||
      !range(native.terminalFallSpeedFps, 0, 1000) ||
      !range(native.maxRangeM, 1, 100000) ||
      (native.decelerationFps2 !== undefined && !range(native.decelerationFps2, 0, 10000)))
  )
    throw new Error('Invalid native gun parameters');
  if (
    geometry &&
    (typeof geometry.source !== 'string' ||
      !hash(geometry.sha256) ||
      typeof geometry.paletteSource !== 'string' ||
      !hash(geometry.paletteSha256) ||
      typeof geometry.scaleNote !== 'string' ||
      !Array.isArray(geometry.vertices) ||
      geometry.vertices.length < 9 ||
      geometry.vertices.length > 3000 ||
      geometry.vertices.length % 3 !== 0 ||
      !geometry.vertices.every((n) => range(n, -1000, 1000)) ||
      !Array.isArray(geometry.colors) ||
      geometry.colors.length !== geometry.vertices.length ||
      !geometry.colors.every((n) => range(n, 0, 1)) ||
      !Array.isArray(geometry.indices) ||
      !geometry.indices.length ||
      geometry.indices.length > 6000 ||
      geometry.indices.length % 3 !== 0 ||
      !geometry.indices.every(
        (n) => Number.isInteger(n) && range(n, 0, geometry.vertices.length / 3 - 1),
      ))
  )
    throw new Error('Invalid retail bullet geometry');
  if (
    g?.schemaVersion !== 1 ||
    !['F14.PT', 'A4E.PT', 'F31.PT'].includes(g.aircraftSource) ||
    !hash(g.aircraftSha256) ||
    typeof g.name !== 'string' ||
    !['m61', 'mk12-pair'].includes(g.type) ||
    !Number.isInteger(g.capacity) ||
    !range(g.capacity, 1, 10000) ||
    !range(g.muzzleSpeedMps, 100, 2000) ||
    !range(g.roundsPerSecond, 1, 200) ||
    !Number.isInteger(g.tracerEvery) ||
    !range(g.tracerEvery, 1, 20) ||
    !['red', 'green'].includes(g.tracerColor) ||
    (g.damage !== undefined &&
      (!Array.isArray(g.damage) ||
        g.damage.length !== 5 ||
        !g.damage.every((n) => Number.isInteger(n) && range(n, 0, 65535)))) ||
    !Array.isArray(g.mounts) ||
    g.mounts.length < 1 ||
    g.mounts.length > 2 ||
    !g.mounts.every(
      (m) => Array.isArray(m) && m.length === 3 && m.every((v) => range(v, -20, 20)),
    ) ||
    !c ||
    typeof c.source !== 'string' ||
    !hash(c.sha256) ||
    c.encoding !== 'unsigned8-mono' ||
    ![5512, 8000, 8010, 11025].includes(c.sampleRate) ||
    !Array.isArray(c.pcm) ||
    c.pcm.length < 2 ||
    c.pcm.length > 1000000 ||
    !c.pcm.every((n) => Number.isInteger(n) && range(n, 0, 255))
  )
    throw new Error('Invalid retail gun manifest');
  return g;
}
