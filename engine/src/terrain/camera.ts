import type { TheaterManifest } from '../data';
import type { CameraOverrides } from '../sim/mission/params';
import type { WorldPosition } from './lod';

/**
 * Deep-linked poses are reproducible projected meters and radians, never renderer-local
 * coordinates. The overrides arrive already parsed and checked for finiteness; what is
 * left here is the clamping, which needs the theater's extents.
 */
export function initialCamera(
  manifest: TheaterManifest,
  camera: CameraOverrides,
): { position: WorldPosition; yaw: number; pitch: number } {
  const value = (key: keyof CameraOverrides, fallback: number): number => camera[key] ?? fallback;
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
