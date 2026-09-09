import { BufferGeometry, Float32BufferAttribute, Path, Shape, ShapeGeometry } from 'three';
import type { WaterBody } from '../data';
export interface WaterBatch {
  id: string;
  bodies: WaterBody[];
  x: number;
  z: number;
  maxX: number;
  maxZ: number;
  bytes: number;
}
export function waterGeometry(batch: WaterBatch): BufferGeometry {
  const positions: number[] = [],
    normals: number[] = [],
    indices: number[] = [];
  for (const body of batch.bodies) {
    const shape = new Shape();
    body.polygon.forEach(([x, z], i) => {
      if (i === 0) shape.moveTo(x - batch.x, batch.z - z);
      else shape.lineTo(x - batch.x, batch.z - z);
    });
    shape.closePath();
    for (const ring of body.holes ?? []) {
      const hole = new Path();
      ring.forEach(([x, z], i) => {
        if (i === 0) hole.moveTo(x - batch.x, batch.z - z);
        else hole.lineTo(x - batch.x, batch.z - z);
      });
      hole.closePath();
      shape.holes.push(hole);
    }
    const part = new ShapeGeometry(shape);
    const p = part.getAttribute('position'),
      base = positions.length / 3;
    for (let i = 0; i < p.count; i++) {
      positions.push(p.getX(i), body.elevation + 0.2, -p.getY(i));
      normals.push(0, 1, 0);
    }
    const index = part.getIndex();
    if (index) for (let i = 0; i < index.count; i++) indices.push(base + index.getX(i));
    part.dispose();
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}
