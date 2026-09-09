import type { LodLevel } from '../terrain';

/** Projected east/north meters; renderer uses x east, z north, y up. */
export interface TheaterProjection {
  readonly crs: string;
  readonly originX: number;
  readonly originY: number;
}
export interface TerrainChunk {
  readonly lod: LodLevel;
  readonly x: number;
  readonly y: number;
  readonly path: string;
  readonly originX: number;
  readonly originZ: number;
  readonly spacing: number;
  readonly size: 256;
  readonly offset: number;
  readonly scale: number;
  readonly minElevation: number;
  readonly maxElevation: number;
  readonly byteLength: number;
  readonly sha256: string;
}
export interface WaterBody {
  readonly id: string;
  readonly elevation: number;
  readonly polygon: readonly (readonly [number, number])[];
  readonly holes?: readonly (readonly (readonly [number, number])[])[];
}
export interface TerrainImagery {
  readonly path: string;
  readonly width: number;
  readonly height: number;
  readonly byteLength: number;
  readonly sha256: string;
  readonly attribution: string;
  readonly license: string;
}
export interface TheaterManifest {
  readonly imagery?: TerrainImagery;
  readonly schemaVersion: 1;
  readonly id: string;
  readonly name: string;
  readonly projection: TheaterProjection;
  readonly extents: { readonly width: number; readonly height: number };
  readonly lods: readonly LodLevel[];
  readonly attribution: readonly string[];
  readonly source: string;
  readonly chunks: readonly TerrainChunk[];
  readonly waterBodies: readonly WaterBody[];
}
export const THEATER_MANIFEST_SCHEMA_VERSION = 1 as const;
