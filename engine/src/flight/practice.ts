import type { GroundSampler, PracticeStrip } from './GroundSampler';
import { runtimeTheater } from '../terrain/world-orientation';

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
  const theater = runtimeTheater(ground.manifest);
  if (!theater) throw new Error('This terrain has no configured practice strip');
  const strip = { ...theater.strip };
  await validatePractice(ground, strip);
  ground.strip = strip;
  return strip;
}
