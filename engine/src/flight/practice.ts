import type { GroundSampler, PracticeStrip } from './GroundSampler';

/** Original fictional practice deck, not a reconstructed retail or real airfield. */
export const UKRAINE_PRACTICE: PracticeStrip = {
  x: 289000,
  z: 392000,
  width: 100,
  length: 2800,
  elevation: 111,
};
export async function validatePractice(ground: GroundSampler, strip: PracticeStrip): Promise<void> {
  const points: [number, number][] = [];
  for (let dz = -strip.length / 2; dz <= strip.length / 2; dz += 50)
    for (let dx = -strip.width / 2; dx <= strip.width / 2; dx += 25)
      points.push([strip.x + dx, strip.z + dz]);
  // Loads are deduplicated; serial requests bound I/O even on adversarial footprints.
  for (const [x, z] of points) {
    await ground.ensure(x, z);
    const sample = ground.sample(x, z);
    if (
      !sample ||
      sample.kind === 'water' ||
      sample.height > strip.elevation ||
      strip.elevation - sample.height > 10
    )
      throw new Error('Practice deck requires dry covered terrain within 10m below its elevation');
  }
}
export async function preparePractice(ground: GroundSampler): Promise<PracticeStrip> {
  if (ground.manifest.id !== 'ukraine')
    throw new Error(
      'Practice flight currently requires the validated Ukraine theater; this dataset has no practice strip',
    );
  const strip = { ...UKRAINE_PRACTICE };
  await validatePractice(ground, strip);
  ground.strip = strip;
  return strip;
}
