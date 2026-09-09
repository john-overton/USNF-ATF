import type { TerrainChunk } from '../data';

export async function decodeChunk(bytes: Uint8Array, chunk: TerrainChunk): Promise<Float32Array> {
  if (bytes.byteLength !== chunk.byteLength)
    throw new Error(`Chunk length mismatch: ${chunk.path}`);
  const owned = new Uint8Array(bytes);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', owned));
  const hash = Array.from(digest, (n) => n.toString(16).padStart(2, '0')).join('');
  if (hash !== chunk.sha256) throw new Error(`Chunk checksum mismatch: ${chunk.path}`);
  const reader = new Blob([owned])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'))
    .getReader();
  const raw = new Uint8Array(256 * 256 * 2);
  let count = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (count + value.byteLength > raw.length)
        throw new Error('Inflated chunk exceeds sample budget');
      raw.set(value, count);
      count += value.byteLength;
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  if (count !== raw.length) throw new Error('Truncated inflated chunk');
  const samples = new Float32Array(256 * 256),
    view = new DataView(raw.buffer);
  for (let i = 0; i < samples.length; i++) {
    const h = chunk.offset + view.getUint16(i * 2, true) * chunk.scale;
    if (
      h < chunk.minElevation - chunk.scale - 0.001 ||
      h > chunk.maxElevation + chunk.scale + 0.001
    )
      throw new Error('Sample outside manifest elevation bounds');
    samples[i] = h;
  }
  return samples;
}

/** Bilinear sampling in source sample coordinates, clamped at shared borders. */
export function sampleHeight(samples: Float32Array, x: number, z: number): number {
  x = Math.max(0, Math.min(255, x));
  z = Math.max(0, Math.min(255, z));
  const ix = Math.min(254, Math.floor(x)),
    iz = Math.min(254, Math.floor(z));
  const fx = x - ix,
    fz = z - iz;
  const a = samples[iz * 256 + ix]!,
    b = samples[iz * 256 + ix + 1]!;
  const c = samples[(iz + 1) * 256 + ix]!,
    d = samples[(iz + 1) * 256 + ix + 1]!;
  return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
}
