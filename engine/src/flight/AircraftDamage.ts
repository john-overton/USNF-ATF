import {
  Box3,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Vector3,
  type Object3D,
} from 'three';

/** Per-instance damage skin. Shared imported textures/geometries are never changed. */
export class AircraftDamage {
  private materials: { material: MeshStandardMaterial; original: MeshStandardMaterial }[] = [];
  constructor(root: Group) {
    root.traverse((object) => {
      if (!(object instanceof Mesh) || !(object.material instanceof MeshStandardMaterial)) return;
      const original = object.material;
      const material = original.clone();
      material.onBeforeCompile = original.onBeforeCompile.bind(material);
      material.customProgramCacheKey = original.customProgramCacheKey.bind(material);
      object.material = material;
      // Three's userData clone serializes textures; afterburner toggles need the actual map.
      material.userData.originalMap = original.userData.originalMap as unknown;
      this.materials.push({ material, original });
    });
  }
  update(percent: number): void {
    const severity = Math.max(0, Math.min(1, percent / 100));
    for (const { material, original } of this.materials) {
      material.color.copy(original.color).multiplyScalar(1 - severity * 0.7);
      material.roughness = Math.min(1, original.roughness + severity * 0.3);
    }
  }
  dispose(): void {
    for (const { material } of this.materials) material.dispose();
    this.materials = [];
  }
}

export interface AirframeFragment {
  group: Group;
  center: Vector3;
}
/** Geometric, authored fracture zones. Keeps every visible source triangle and its UVs. */
export function splitAirframe(root: Group): AirframeFragment[] {
  root.updateWorldMatrix(true, true);
  const inverse = new Matrix4().copy(root.matrixWorld).invert();
  const groups = Array.from({ length: 6 }, () => new Group());
  root.traverse((object) => {
    if (!(object instanceof Mesh) || !(object.material instanceof MeshStandardMaterial)) return;
    for (let parent: Object3D | null = object; parent !== root; parent = parent.parent) {
      if (!parent?.visible) return;
    }
    const originalGeometry = object.geometry as BufferGeometry;
    const source = originalGeometry.index
      ? originalGeometry.toNonIndexed()
      : originalGeometry.clone();
    source.applyMatrix4(new Matrix4().multiplyMatrices(inverse, object.matrixWorld));
    const position = source.getAttribute('position');
    const bins = Array.from({ length: 6 }, () => [] as number[]);
    for (let i = 0; i < position.count; i += 3) {
      const x = (position.getX(i) + position.getX(i + 1) + position.getX(i + 2)) / 3;
      const y = (position.getY(i) + position.getY(i + 1) + position.getY(i + 2)) / 3;
      const z = (position.getZ(i) + position.getZ(i + 1) + position.getZ(i + 2)) / 3;
      const zone = x < -1.8 ? 0 : x > 1.8 ? 1 : z < -3 ? 2 : z > 2.5 ? 3 : y > 0.3 ? 4 : 5;
      bins[zone]!.push(i, i + 1, i + 2);
    }
    for (const [zone, indices] of bins.entries()) {
      if (!indices.length) continue;
      const geometry = new BufferGeometry();
      for (const [name, attribute] of Object.entries(source.attributes)) {
        const values: number[] = [];
        for (const index of indices)
          for (let component = 0; component < attribute.itemSize; component++)
            values.push(attribute.getComponent(index, component));
        geometry.setAttribute(name, new Float32BufferAttribute(values, attribute.itemSize));
      }
      const material = object.material.clone();
      material.onBeforeCompile = object.material.onBeforeCompile.bind(material);
      material.customProgramCacheKey = object.material.customProgramCacheKey.bind(material);
      material.color.multiplyScalar(0.35);
      material.roughness = 1;
      const mesh = new Mesh(geometry, material);
      mesh.castShadow = true;
      groups[zone]!.add(mesh);
    }
    source.dispose();
  });
  return groups.map((group) => {
    const center = group.children.length
      ? new Box3().setFromObject(group).getCenter(new Vector3())
      : new Vector3();
    for (const child of group.children)
      (child as Mesh).geometry.translate(-center.x, -center.y, -center.z);
    return { group, center };
  });
}
export function disposeFragments(fragments: readonly AirframeFragment[]): void {
  for (const { group } of fragments) {
    group.removeFromParent();
    group.traverse((object) => {
      if (object instanceof Mesh) {
        (object.geometry as BufferGeometry).dispose();
        (object.material as MeshStandardMaterial).dispose();
      }
    });
  }
}
