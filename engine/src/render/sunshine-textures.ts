/** Exact Godot 4.4.1 exports of SunshineClouds2 a73a80b MIT textures. */
import {
  Data3DTexture,
  DataTexture,
  LinearFilter,
  RedFormat,
  RepeatWrapping,
  RGBAFormat,
} from 'three';
import dimensions from './sunshine-assets/manifest.json';

export type SunshineTextureName = keyof typeof dimensions;
export type SunshineTextures = Record<SunshineTextureName, DataTexture | Data3DTexture>;
/** Optional reader enables actual GPU probes with the same checked asset bytes. */
export async function loadSunshineTextures(
  read: (name: SunshineTextureName) => Promise<Uint8Array>,
): Promise<SunshineTextures> {
  const entries = await Promise.all(
    (Object.keys(dimensions) as SunshineTextureName[]).map(async (name) => {
      const compressed = await read(name);
      const stream = new Blob([Uint8Array.from(compressed).buffer])
        .stream()
        .pipeThrough(new DecompressionStream('gzip'));
      const data = new Uint8Array(await new Response(stream).arrayBuffer());
      const d = dimensions[name];
      if (data.length !== d.width * d.height * d.depth * d.channels)
        throw new Error(`Invalid Sunshine ${name} texture length`);
      return { name, d, data };
    }),
  );
  // Allocate textures only after every fetch/validation has succeeded.
  return Object.fromEntries(
    entries.map(({ name, d, data }) => {
      const texture =
        d.depth > 1
          ? new Data3DTexture(data, d.width, d.height, d.depth)
          : new DataTexture(data, d.width, d.height);
      texture.format = d.channels === 1 ? RedFormat : RGBAFormat;
      texture.minFilter = texture.magFilter = LinearFilter;
      if (name !== 'height') texture.wrapS = texture.wrapT = RepeatWrapping;
      if (texture instanceof Data3DTexture) texture.wrapR = RepeatWrapping;
      texture.unpackAlignment = 1;
      texture.needsUpdate = true;
      return [name, texture];
    }),
  ) as SunshineTextures;
}
