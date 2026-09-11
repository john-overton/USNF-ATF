/**
 * SunshineClouds2-style ping-pong reprojection, adapted to fragment passes.
 * Copyright (c) 2025 David House, MIT; see render/sunshine-assets/LICENSE.txt.
 * Adds bounds checks, neighborhood clamping and geometry disocclusion rejection.
 */
export const SUNSHINE_HISTORY = `
precision highp float;
varying vec2 vUv;
uniform sampler2D currentColor;
uniform sampler2D currentData;
uniform sampler2D previousColor;
uniform sampler2D previousData;
uniform mat4 inverseProjection;
uniform mat4 cameraWorld;
uniform mat4 previousViewProjection;
uniform vec3 worldCamera;
uniform vec2 previousOrigin;
uniform vec2 texel;
uniform float validHistory;
layout(location = 1) out vec4 historyData;
void main() {
  vec4 color = texture2D(currentColor, vUv);
  vec4 data = texture2D(currentData, vUv);
  historyData = data;
  vec4 view = inverseProjection * vec4(vUv * 2.0 - 1.0, -1.0, 1.0);
  vec3 dir = normalize((cameraWorld * vec4(normalize(view.xyz / view.w),0.0)).xyz);
  vec3 position = worldCamera + dir * data.g * 1000.0;
  position.xz -= previousOrigin;
  vec4 clip = previousViewProjection * vec4(position,1.0);
  vec2 uv = clip.xy / max(0.0001,clip.w) * 0.5 + 0.5;
  float weight = 0.0;
  vec4 old = color;
  if (validHistory > 0.5 && data.a >= 0.0 && clip.w > 0.0 &&
      all(greaterThanEqual(uv, texel * 0.5)) && all(lessThanEqual(uv, 1.0 - texel * 0.5))) {
    vec4 oldData = texture2D(previousData, uv);
    if (abs(data.a - oldData.a) < 0.002 && abs(data.r - oldData.r) < 2.0) {
      old = texture2D(previousColor, uv);
      vec4 lo = color, hi = color;
      for (int y=-1;y<=1;y++) for(int x=-1;x<=1;x++) {
        vec4 tap = texture2D(currentColor,vUv+vec2(float(x),float(y))*texel);
        lo=min(lo,tap); hi=max(hi,tap);
      }
      old = clamp(old,lo,hi);
      weight = 0.7;
    }
  }
  gl_FragColor = mix(color,old,weight);
}
`;
