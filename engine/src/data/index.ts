/**
 * Data schemas (brief 4.2: data-driven everything). Phase 1 only reserves the module;
 * theater manifests arrive in phase 2 and aircraft tables in phase 4.
 */
import type { LodLevel } from '../terrain';

/** Local projected grid for a flat theater (brief 4.2, 5.3 step 1). */
export interface TheaterProjection {
  /** PROJ/WKT string for the local transverse Mercator or LAEA grid. Never Web Mercator. */
  readonly crs: string;
  /** Theater origin in projected meters; the engine's (0, 0). */
  readonly originX: number;
  readonly originY: number;
}

export interface TheaterManifest {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly name: string;
  readonly projection: TheaterProjection;
  /** Extents in meters from the origin. */
  readonly extents: { readonly width: number; readonly height: number };
  readonly lods: readonly LodLevel[];
}

export const THEATER_MANIFEST_SCHEMA_VERSION = 1 as const;
