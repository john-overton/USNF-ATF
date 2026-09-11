/** Authored test data, not extracted retail parameters. Imported only by tests. */
import type { GunDefinition } from '../../data/retail-gun';
export const syntheticNativeGun: GunDefinition = {
  name: 'Synthetic native-policy fixture',
  capacity: 101,
  muzzleSpeedMps: 1000,
  roundsPerSecond: 60,
  tracerEvery: 5,
  tracerColor: 'red',
  mounts: [[0, 0, -3]],
  native: {
    source: 'fixture.JT',
    sha256: 'a'.repeat(64),
    initialSpeedFps: 3000,
    finalSpeedFps: 1500,
    minSpeedFps: 1500,
    maxSpeedFps: 3000,
    launchRetardPercent: 100,
    decelerationFps2: 8,
    actualRoundsPerProjectile: 2,
    intervalSeconds: 0.25,
    lifetimeSeconds: 10,
    gravityFps2: 32,
    terminalFallSpeedFps: 80,
    maxRangeM: 2000,
  },
};
