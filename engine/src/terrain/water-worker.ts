import { waterGeometry, type WaterBatch } from './water-geometry';
self.onmessage = (event: MessageEvent<{ id: number; batch: WaterBatch }>) => {
  const { id, batch } = event.data;
  try {
    const geometry = waterGeometry(batch);
    const positions = new Float32Array(geometry.getAttribute('position').array);
    const normals = new Float32Array(geometry.getAttribute('normal').array);
    const sourceIndices = geometry.getIndex()!.array;
    const indices =
      sourceIndices instanceof Uint16Array
        ? new Uint16Array(sourceIndices)
        : new Uint32Array(sourceIndices);
    geometry.dispose();
    self.postMessage(
      { id, positions, normals, indices },
      { transfer: [positions.buffer, normals.buffer, indices.buffer] },
    );
  } catch (error) {
    self.postMessage({ id, error: String(error) });
  }
};
