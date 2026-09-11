import type { PracticeStrip } from '../flight/GroundSampler';

export interface TheaterWaypoint {
  id: 1 | 2 | 3;
  name: string;
  x: number;
  z: number;
}

export interface TheaterDefinition {
  id: string;
  name: string;
  manifestPath: string;
  strip: PracticeStrip;
  /** Named map/teleport targets. Coordinates are local projected metres. */
  waypoints?: readonly TheaterWaypoint[];
}

/**
 * Runtime theater choices are deliberately separate from the generated terrain
 * manifests.  The pipeline remains a general public-data producer while the game
 * can give a particular theater its runway and navigation briefing.
 */
export const THEATERS: readonly TheaterDefinition[] = [
  {
    id: 'ukraine',
    name: 'Ukraine development theater',
    manifestPath: 'terrains/ukraine/manifest.json',
    strip: { x: 289000, z: 392000, width: 100, length: 2800, elevation: 111 },
  },
  {
    id: 'salt-lake',
    name: 'Salt Lake & Front Range',
    manifestPath: 'terrains/salt-lake/manifest.json',
    // Authored north/south practice strip in the western KSLC airport area.
    // Validated against actual GroundSampler: dry, 1285.11–1287.51 m terrain.
    strip: { x: 221030, z: 179304, width: 100, length: 3650, elevation: 1288 },
    waypoints: [
      { id: 1, name: 'Salt Lake Intl', x: 221030, z: 179304 },
      { id: 2, name: 'Bonneville Salt Flats', x: 60667, z: 181350 },
      { id: 3, name: 'Denver', x: 817973, z: 69696 },
    ],
  },
];

export const DEFAULT_THEATER_ID = 'ukraine';

export function theaterById(id: string): TheaterDefinition | undefined {
  return THEATERS.find((theater) => theater.id === id);
}

export function theaterForManifest(id: string): TheaterDefinition | undefined {
  return theaterById(id);
}
