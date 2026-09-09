import { BufferAttribute, BufferGeometry } from 'three';
import type { WaterBatch } from './water-geometry';
export interface WaterGeometryBuilder {
  build(batch: WaterBatch): Promise<BufferGeometry>;
  dispose(): void;
}
export interface WaterBuildResult {
  id: number;
  error?: string;
  positions?: Float32Array;
  normals?: Float32Array;
  indices?: Uint16Array | Uint32Array;
}
/** One worker; WaterLayer bounds outstanding batches and discards obsolete results. */
export class WaterWorkerBuilder implements WaterGeometryBuilder {
  private readonly worker = new Worker(new URL('./water-worker.ts', import.meta.url), {
    type: 'module',
  });
  private next = 0;
  private failed = '';
  private readonly requests = new Map<
    number,
    { resolve: (g: BufferGeometry) => void; reject: (e: Error) => void }
  >();
  constructor() {
    this.worker.onmessage = (event: MessageEvent<WaterBuildResult>) => {
      const result = event.data,
        request = this.requests.get(result.id);
      if (!request) return;
      this.requests.delete(result.id);
      if (result.error || !result.positions || !result.normals || !result.indices) {
        request.reject(new Error(result.error ?? 'Incomplete water geometry'));
        return;
      }
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(result.positions, 3));
      geometry.setAttribute('normal', new BufferAttribute(result.normals, 3));
      geometry.setIndex(new BufferAttribute(result.indices, 1));
      geometry.computeBoundingSphere();
      request.resolve(geometry);
    };
    this.worker.onerror = (event) => this.fail(event.message || 'Water worker failed');
  }
  private fail(message: string): void {
    this.failed = message;
    for (const request of this.requests.values()) request.reject(new Error(message));
    this.requests.clear();
  }
  build(batch: WaterBatch): Promise<BufferGeometry> {
    if (this.failed) return Promise.reject(new Error(this.failed));
    const id = this.next++;
    return new Promise((resolve, reject) => {
      this.requests.set(id, { resolve, reject });
      try {
        this.worker.postMessage({ id, batch });
      } catch (error) {
        this.requests.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }
  dispose(): void {
    this.worker.terminate();
    this.fail('Water builder disposed');
  }
}
