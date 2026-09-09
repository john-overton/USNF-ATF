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
  Vector3,
} from 'three';
import type { Platform } from '../platform/Platform';

export interface AircraftPart {
  name: string;
  positions: number[];
  colors: number[];
  uvs?: number[];
  pivot?: number[];
  rotationAxis?: number[];
  parent?: string;
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
    if (
      part.rotationAxis &&
      (!Array.isArray(part.rotationAxis) ||
        part.rotationAxis.length !== 3 ||
        part.rotationAxis.some((n) => !Number.isFinite(n)) ||
        Math.hypot(...part.rotationAxis) < 0.001)
    )
      throw new Error('Invalid aircraft rotation axis');
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
  const parts = new Map([data, ...(data.parts ?? [])].map((part) => [part.name, part]));
  if (parts.size !== 1 + (data.parts?.length ?? 0)) throw new Error('Duplicate aircraft part');
  for (const part of parts.values()) {
    const visited = new Set([part.name]);
    let parent = part.parent;
    while (parent !== undefined) {
      if (typeof parent !== 'string' || !parts.has(parent) || visited.has(parent))
        throw new Error('Invalid aircraft hierarchy');
      visited.add(parent);
      parent = parts.get(parent)!.parent;
    }
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
        // Exported V is already bottom-origin, matching the source SH atlas convention.
        texture.flipY = false;
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
      material.userData.originalMap = material.map;
      group.add(new Mesh(geometry, material));
      this.group.add(group);
      this.parts.set(part.name, group);
    }
    this.group.updateMatrixWorld(true);
    for (const part of data.parts ?? []) {
      if (part.parent) this.parts.get(part.parent)!.attach(this.parts.get(part.name)!);
    }
  }
  static async load(platform: Platform): Promise<RetailAircraft | undefined> {
    if (!(await platform.fs.exists('appData', 'aircraft/f14.json'))) return undefined;
    const text = await platform.fs.readText('appData', 'aircraft/f14.json');
    if (text.length > 64 * 1024 * 1024) throw new Error('Aircraft import exceeds 64 MiB');
    return new RetailAircraft(parseRetailAircraft(JSON.parse(text)));
  }
  setSurfaceAngle(name: string, radians: number): void {
    const data = this.data.parts?.find((part) => part.name === name);
    const group = this.parts.get(name);
    if (!data?.rotationAxis || !group) return;
    group.setRotationFromAxisAngle(new Vector3().fromArray(data.rotationAxis).normalize(), radians);
  }
  surfaceDiagnostics(): Record<string, number> {
    return Object.fromEntries(
      (this.data.parts ?? [])
        .filter((p) => p.rotationAxis)
        .map((p) => [
          p.name,
          2 * Math.acos(Math.min(1, Math.abs(this.parts.get(p.name)!.quaternion.w))),
        ]),
    );
  }
  setAfterburner(lit: boolean): void {
    for (const [name, group] of this.parts) {
      if (!name.startsWith('exhaust-')) continue;
      for (const child of group.children) {
        if (!(child instanceof Mesh)) continue;
        const material = child.material as MeshStandardMaterial;
        const map = material.userData.originalMap as DataTexture | null;
        if (material.map !== (lit ? map : null)) {
          material.map = lit ? map : null;
          material.color.setHex(lit ? 0xffffff : 0x202328);
          material.needsUpdate = true;
        }
      }
    }
  }
  dispose(): void {
    for (const texture of this.textures) texture.dispose();
  }
}
