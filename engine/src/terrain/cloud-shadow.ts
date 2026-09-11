/**
 * Cloud shadows are a patch on the existing lit materials, not another pass:
 * the fragment's world position is projected along the sun onto the cloud base
 * plane and the same coverage texture the march samples scales the direct light.
 */
import type { MeshStandardMaterial } from 'three';
import { createCloudShadowUniforms, SHADOW_CHUNK } from './cloud-pass';

type Patchable = Parameters<NonNullable<MeshStandardMaterial['onBeforeCompile']>>[0];

/**
 * Call from inside a material's own `onBeforeCompile`, or through
 * `applyCloudShadow` to compose with an existing material patch. Remember to bump the
 * material's `customProgramCacheKey`: the shader source has changed.
 */
export function patchCloudShadow(shader: Patchable): void {
  Object.assign(shader.uniforms, createCloudShadowUniforms());
  shader.vertexShader = 'varying vec3 vCloudWorld;\n' + shader.vertexShader;
  // After begin_vertex and any patch that rewrites `transformed`, so morphed
  // terrain heights reach the lookup.
  shader.vertexShader = shader.vertexShader.replace(
    '#include <project_vertex>',
    'vCloudWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#include <project_vertex>',
  );
  shader.fragmentShader = 'varying vec3 vCloudWorld;\n' + SHADOW_CHUNK + shader.fragmentShader;
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <lights_fragment_end>',
    `#include <lights_fragment_end>
    {
      float cloudLight = cloudShadow(vCloudWorld);
      reflectedLight.directDiffuse *= cloudLight;
      reflectedLight.directSpecular *= cloudLight;
    }`,
  );
}

export function applyCloudShadow(material: MeshStandardMaterial, cacheKey: string): void {
  const previous = material.onBeforeCompile.bind(material);
  const previousKey = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    patchCloudShadow(shader);
  };
  material.customProgramCacheKey = () => `${previousKey}:${cacheKey}`;
}
