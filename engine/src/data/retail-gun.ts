import type { FlightClip } from '../flight/FlightAudio';
export interface RetailGun {
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
    ![5512, 8000, 11025].includes(c.sampleRate) ||
    !Array.isArray(c.pcm) ||
    c.pcm.length < 2 ||
    c.pcm.length > 1000000 ||
    !c.pcm.every((n) => Number.isInteger(n) && range(n, 0, 255))
  )
    throw new Error('Invalid retail gun manifest');
  return g;
}
