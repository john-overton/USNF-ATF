import type { AircraftId } from './aircraft-catalog';
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
  LinearFilter,
  LinearMipmapLinearFilter,
  FrontSide,
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
  cullBackfaces?: boolean;
  decal?: boolean;
  textureBase?: boolean;
  gearPose?: 'deployed' | 'stowed';
  /** Signed deployed angle; imported brake vertices are already open. Zero marks supports. */
  nativeBrakeAngle?: number;
  texture?: { width: number; height: number; rgba: number[] };
}
export interface RetailAircraftData extends AircraftPart {
  version: 1;
  parts?: AircraftPart[];
  texture?: { width: number; height: number; rgba: number[] };
  limitations: string[];
  gearHeightM?: number;
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
  if (
    data.gearHeightM !== undefined &&
    (!Number.isFinite(data.gearHeightM) || data.gearHeightM <= 0 || data.gearHeightM > 10)
  )
    throw new Error('Invalid aircraft gear support height');
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
    if (
      (part.cullBackfaces !== undefined && typeof part.cullBackfaces !== 'boolean') ||
      (part.decal !== undefined && typeof part.decal !== 'boolean') ||
      (part.textureBase !== undefined && typeof part.textureBase !== 'boolean') ||
      (part.gearPose !== undefined && !['deployed', 'stowed'].includes(part.gearPose)) ||
      (part.nativeBrakeAngle !== undefined &&
        (!Number.isFinite(part.nativeBrakeAngle) || Math.abs(part.nativeBrakeAngle) > Math.PI))
    )
      throw new Error('Invalid aircraft material/gear metadata');
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
        texture.magFilter = LinearFilter;
        texture.minFilter = LinearMipmapLinearFilter;
        texture.generateMipmaps = true;
        texture.anisotropy = 4;
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
        side: part.cullBackfaces ? FrontSide : DoubleSide,
        // Keyed overlay faces stay depth-tested, with a small bias over skin.
        polygonOffset: part.decal === true,
        polygonOffsetFactor: part.decal ? -1 : 0,
        polygonOffsetUnits: part.decal ? -1 : 0,
        ...(part.uvs && texture ? { map: texture, alphaTest: 0.5 } : {}),
      });
      if (part.name.startsWith('afterburner-')) {
        material.emissive.setHex(0xffffff);
        material.emissiveMap = texture ?? null;
        material.color.setHex(0x000000);
        material.depthWrite = false;
        material.polygonOffset = false;
      }
      if (part.textureBase) {
        // Retail EE/ED/CD paint a keyed texture over a palette-filled polygon.
        // Compose in one draw so the base cannot z-fight with its own markings.
        material.onBeforeCompile = (shader) => {
          shader.fragmentShader = shader.fragmentShader
            .replace(
              '#include <map_fragment>',
              `
#ifdef USE_MAP
  vec4 paint = texture2D(map, vMapUv);
  diffuseColor.rgb *= mix(vColor.rgb, paint.rgb, paint.a);
#else
  diffuseColor.rgb *= vColor.rgb;
#endif`,
            )
            .replace('#include <color_fragment>', '');
        };
        material.customProgramCacheKey = () => 'retail-keyed-base-v1';
      }
      material.userData.originalMap = material.map;
      group.add(new Mesh(geometry, material));
      this.group.add(group);
      this.parts.set(part.name, group);
    }
    this.setGearFraction(0);
    this.setAirbrakeFraction(0);
    this.setAfterburner(false);
    this.group.updateMatrixWorld(true);
    for (const part of data.parts ?? []) {
      if (part.parent) this.parts.get(part.parent)!.attach(this.parts.get(part.name)!);
    }
  }
  get hasGear(): boolean {
    return this.data.parts?.some((part) => part.gearPose === 'deployed') ?? false;
  }
  setGearFraction(value: number): void {
    const fraction = Math.max(0, Math.min(1, value));
    for (const part of this.data.parts ?? []) {
      if (!part.gearPose) continue;
      const group = this.parts.get(part.name)!;
      if (part.gearPose === 'stowed') {
        group.visible = fraction <= 0.01;
      } else {
        group.visible = fraction > 0.01;
        if (part.rotationAxis) this.setSurfaceAngle(part.name, ((1 - fraction) * Math.PI) / 2);
      }
    }
  }
  static async load(
    platform: Platform,
    id: AircraftId = 'f14',
  ): Promise<RetailAircraft | undefined> {
    if (!(await platform.fs.exists('appData', `aircraft/${id}.json`))) return undefined;
    const text = await platform.fs.readText('appData', `aircraft/${id}.json`);
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
  get hasAfterburner(): boolean {
    return this.data.parts?.some((part) => part.name.startsWith('afterburner-')) ?? false;
  }
  get afterburnerVisible(): boolean {
    return [...this.parts].some(
      ([name, group]) => name.startsWith('afterburner-') && group.visible,
    );
  }
  setAirbrakeFraction(value: number): void {
    const fraction = Math.max(0, Math.min(1, value));
    for (const part of this.data.parts ?? []) {
      if (part.nativeBrakeAngle === undefined) continue;
      this.parts.get(part.name)!.visible = fraction > 0.01;
      this.setSurfaceAngle(part.name, -part.nativeBrakeAngle * (1 - fraction));
    }
  }
  setAfterburner(lit: boolean): void {
    // Native burner state adds flame faces; it does not replace nozzle paint.
    for (const [name, group] of this.parts) {
      if (name.startsWith('afterburner-')) group.visible = lit;
    }
  }
  dispose(): void {
    for (const texture of this.textures) texture.dispose();
  }
}
