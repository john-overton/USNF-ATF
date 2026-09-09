import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  DataTexture,
  RGBAFormat,
  UnsignedByteType,
  SRGBColorSpace,
  DoubleSide,
  NearestFilter,
} from 'three';
import type { Platform } from '../platform/Platform';

export interface AircraftPart {
  name: string;
  positions: number[];
  colors: number[];
  uvs?: number[];
  pivot?: number[];
  texture?: { width: number; height: number; rgba: number[] };
}
export interface RetailAircraftData extends AircraftPart {
  version: 1;
  parts?: AircraftPart[];
  texture?: { width: number; height: number; rgba: number[] };
  limitations: string[];
}
/** Bounded runtime contract; retail data stays in user data, outside application bundles. */
export function parseRetailAircraft(value: unknown): RetailAircraftData {
  if (!value || typeof value !== 'object') throw new Error('Invalid aircraft object');
  const data = value as RetailAircraftData;
  if (data.version !== 1 || typeof data.name !== 'string' || data.name.length > 128)
    throw new Error('Invalid aircraft version/name');
  if (!Array.isArray(data.limitations) || data.limitations.some((s) => typeof s !== 'string'))
    throw new Error('Invalid aircraft limitations');
  if (data.parts !== undefined && (!Array.isArray(data.parts) || data.parts.length > 100))
    throw new Error('Invalid aircraft parts');
  let vertices = 0;
  for (const part of [data, ...(data.parts ?? [])]) {
    if (
      typeof part.name !== 'string' ||
      !Array.isArray(part.positions) ||
      part.positions.length % 9 !== 0 ||
      part.positions.length > 900000 ||
      part.positions.some((n) => !Number.isFinite(n) || Math.abs(n) > 100)
    )
      throw new Error('Invalid aircraft triangle positions');
    vertices += part.positions.length / 3;
    if (
      !Array.isArray(part.colors) ||
      part.colors.length !== part.positions.length ||
      part.colors.some((n) => !Number.isFinite(n) || n < 0 || n > 1)
    )
      throw new Error('Invalid aircraft colors');
    if (
      part.uvs &&
      (!Array.isArray(part.uvs) ||
        part.uvs.length !== (part.positions.length / 3) * 2 ||
        part.uvs.some((n) => !Number.isFinite(n) || Math.abs(n) > 16))
    )
      throw new Error('Invalid aircraft UVs');
    if (
      part.pivot &&
      (!Array.isArray(part.pivot) ||
        part.pivot.length !== 3 ||
        part.pivot.some((n) => !Number.isFinite(n) || Math.abs(n) > 100))
    )
      throw new Error('Invalid aircraft pivot');
  }
  if (vertices < 3 || vertices > 300000) throw new Error('Invalid aircraft vertex count');
  for (const part of [data, ...(data.parts ?? [])]) {
    if (!part.texture) continue;
    const { width, height, rgba } = part.texture;
    if (
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width < 1 ||
      height < 1 ||
      width > 2048 ||
      height > 2048 ||
      !Array.isArray(rgba) ||
      rgba.length !== width * height * 4 ||
      rgba.some((n) => !Number.isInteger(n) || n < 0 || n > 255)
    )
      throw new Error('Invalid aircraft texture');
  }
  return data;
}

export class RetailAircraft {
  readonly group = new Group();
  readonly parts = new Map<string, Group>();
  private readonly textures: DataTexture[] = [];
  readonly triangles: number;
  private constructor(readonly data: RetailAircraftData) {
    this.triangles = [data, ...(data.parts ?? [])].reduce(
      (sum, p) => sum + p.positions.length / 9,
      0,
    );
    for (const part of [data, ...(data.parts ?? [])]) {
      let texture: DataTexture | undefined;
      const sourceTexture = part.texture ?? data.texture;
      if (sourceTexture) {
        texture = new DataTexture(
          new Uint8Array(sourceTexture.rgba),
          sourceTexture.width,
          sourceTexture.height,
          RGBAFormat,
          UnsignedByteType,
        );
        texture.colorSpace = SRGBColorSpace;
        texture.flipY = true;
        texture.magFilter = NearestFilter;
        texture.needsUpdate = true;
        this.textures.push(texture);
      }
      const pivot = part.pivot ?? [0, 0, 0];
      const group = new Group();
      group.name = part.name;
      group.position.set(pivot[0]!, pivot[1]!, pivot[2]);
      const geometry = new BufferGeometry();
      geometry.setAttribute(
        'position',
        new Float32BufferAttribute(
          part.positions.map((v, i) => v - pivot[i % 3]!),
          3,
        ),
      );
      const linearColors = new Float32Array(part.colors.length);
      const color = new Color();
      for (let i = 0; i < part.colors.length; i += 3) {
        color.setRGB(part.colors[i]!, part.colors[i + 1]!, part.colors[i + 2]!, SRGBColorSpace);
        color.toArray(linearColors, i);
      }
      geometry.setAttribute('color', new Float32BufferAttribute(linearColors, 3));
      if (part.uvs) geometry.setAttribute('uv', new Float32BufferAttribute(part.uvs, 2));
      geometry.computeVertexNormals();
      const material = new MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.8,
        side: DoubleSide,
        ...(part.uvs && texture ? { map: texture } : {}),
      });
      group.add(new Mesh(geometry, material));
      this.group.add(group);
      this.parts.set(part.name, group);
    }
  }
  static async load(platform: Platform): Promise<RetailAircraft | undefined> {
    if (!(await platform.fs.exists('appData', 'aircraft/f14.json'))) return undefined;
    const text = await platform.fs.readText('appData', 'aircraft/f14.json');
    if (text.length > 64 * 1024 * 1024) throw new Error('Aircraft import exceeds 64 MiB');
    return new RetailAircraft(parseRetailAircraft(JSON.parse(text)));
  }
  dispose(): void {
    for (const texture of this.textures) texture.dispose();
  }
}
