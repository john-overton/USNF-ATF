import { describe, expect, test } from 'bun:test';

import { looksLikeSoftwareRenderer } from './glProbe';

describe('looksLikeSoftwareRenderer', () => {
  test('flags known software rasterizers', () => {
    expect(looksLikeSoftwareRenderer('Google SwiftShader')).toBe(true);
    expect(
      looksLikeSoftwareRenderer(
        'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)',
      ),
    ).toBe(true);
    expect(looksLikeSoftwareRenderer('llvmpipe (LLVM 15.0.7, 256 bits)')).toBe(true);
    expect(looksLikeSoftwareRenderer('Mesa softpipe')).toBe(true);
    expect(looksLikeSoftwareRenderer('Microsoft Basic Render Driver')).toBe(true);
    expect(looksLikeSoftwareRenderer('Software Rasterizer')).toBe(true);
  });

  test('accepts hardware renderers', () => {
    expect(
      looksLikeSoftwareRenderer(
        'ANGLE (Apple, ANGLE Metal Renderer: Apple M3, Unspecified Version)',
        'Google Inc. (Apple)',
      ),
    ).toBe(false);
    expect(
      looksLikeSoftwareRenderer(
        'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 (0x00002786) Direct3D11 vs_5_0 ps_5_0, D3D11)',
        'Google Inc. (NVIDIA)',
      ),
    ).toBe(false);
    expect(
      looksLikeSoftwareRenderer('NVIDIA GeForce RTX 3080/PCIe/SSE2', 'NVIDIA Corporation'),
    ).toBe(false);
    expect(looksLikeSoftwareRenderer('AMD Radeon RX 7800 XT (radeonsi, navi32, LLVM 17.0.6)')).toBe(
      false,
    );
  });
});
