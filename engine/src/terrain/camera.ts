import type { TheaterManifest } from '../data';
import type { WorldPosition } from './lod';

/** URL poses are reproducible projected meters and radians, never renderer-local coordinates. */
export function initialCamera(
  manifest: TheaterManifest,
  query: string,
): { position: WorldPosition; yaw: number; pitch: number } {
  const params = new URLSearchParams(query);
  const value = (key: string, fallback: number): number => {
    const text = params.get(key);
    if (text === null) return fallback;
    const n = Number(text);
    if (!text.trim() || !Number.isFinite(n))
      throw new Error(`Invalid camera ${key}: expected finite number`);
    return n;
  };
  return {
    position: {
      x: Math.max(0, Math.min(manifest.extents.width, value('x', manifest.extents.width * 0.5))),
      z: Math.max(0, Math.min(manifest.extents.height, value('z', manifest.extents.height * 0.35))),
      y: Math.max(
        25,
        Math.min(
          100000,
          value('y', Math.max(2000, Math.min(12000, manifest.extents.width * 0.08))),
        ),
      ),
    },
    yaw: value('yaw', 0) % (Math.PI * 2),
    pitch: Math.max(-1.5, Math.min(1.5, value('pitch', -0.45))),
  };
}
