import { expect, test } from 'bun:test';
import { Data3DTexture } from 'three';
import { loadSunshineTextures } from './sunshine-textures';

test('licensed Sunshine texture exports load with exact dimensions and channel layouts', async () => {
  const textures = await loadSunshineTextures((name) =>
    Bun.file(
      new URL('../../public/dev-root/sunshine/' + name + '.bin.gz', import.meta.url),
    ).bytes(),
  );
  try {
    for (const name of ['large', 'medium', 'small'] as const) {
      const texture = textures[name];
      expect(texture).toBeInstanceOf(Data3DTexture);
      expect(texture.image.width).toBe(128);
      expect(texture.image.data?.byteLength).toBe(128 ** 3);
      const bytes = texture.image.data as Uint8Array;
      expect(new Set(bytes).size).toBeGreaterThan(128);
    }
    expect(textures.curl.image.data?.byteLength).toBe(128 ** 3 * 4);
    expect(textures.coverage.image.data?.byteLength).toBe(1024 ** 2 * 4);
    expect(textures.height.image.data?.byteLength).toBe(256 * 4);
    expect(textures.dither.image.data?.byteLength).toBe(64 ** 3);
  } finally {
    Object.values(textures).forEach((texture) => texture.dispose());
  }
});
