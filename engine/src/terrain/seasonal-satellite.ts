import { Vector2, Vector3, type MeshStandardMaterial } from 'three';
import saltLakeSnow from '../../../theaters/salt-lake-snow.json';
import type { Season } from '../sim/environment/solar';

// Artistic annual cycle, not observed vegetation or snow coverage. Reuse the
// offline bake's theater rules so satellite and palette snowlines agree at anchors.
const ANCHORS: readonly {
  day: number;
  season: Season;
  tint: readonly number[];
  strength: number;
}[] = [
  { day: 15, season: 'winter', tint: [0.9, 0.89, 0.87], strength: 0.72 },
  { day: 110, season: 'spring', tint: [0.92, 1.16, 0.8], strength: 0.35 },
  { day: 205, season: 'summer', tint: [0.72, 0.96, 0.64], strength: 0.18 },
  { day: 290, season: 'autumn', tint: [1.06, 0.85, 0.64], strength: 0.65 },
];

export function satelliteSeason(dayOfYear: number, latitude: number) {
  // Match the environment's deliberate 366-day month/day authoring calendar.
  let day = ((((dayOfYear - 1 + (latitude < 0 ? 183 : 0)) % 366) + 366) % 366) + 1;
  if (day < ANCHORS[0]!.day) day += 366;
  const index = ANCHORS.findIndex((a, i) => day >= a.day && day < (ANCHORS[i + 1]?.day ?? 381));
  const a = ANCHORS[index]!;
  const b = ANCHORS[(index + 1) % ANCHORS.length]!;
  const t = (day - a.day) / ((index === 3 ? 381 : b.day) - a.day);
  const blend = t * t * (3 - 2 * t);
  const mix = (x: number, y: number) => x + (y - x) * blend;
  return {
    tint: a.tint.map((v, i) => mix(v, b.tint[i]!)),
    strength: mix(a.strength, b.strength),
    snow: saltLakeSnow.seasons[a.season].map((v, i) => mix(v, saltLakeSnow.seasons[b.season][i]!)),
  };
}

type Shader = Parameters<NonNullable<MeshStandardMaterial['onBeforeCompile']>>[0];

/** Viewer-local boxes shared by all its patches; date changes never recompile. */
export class SeasonalSatellite {
  readonly uniforms = {
    satelliteSeasonActive: { value: false },
    satelliteSnowActive: { value: false },
    satelliteTint: { value: new Vector3(1, 1, 1) },
    satelliteDesaturate: { value: 0 },
    satelliteSnowBand: { value: new Vector2(3300, 3800) },
    satellitePermanentBand: {
      value: new Vector2(saltLakeSnow.permanent[0], saltLakeSnow.permanent[1]),
    },
  };

  update(day: number, latitude: number, theater: string | undefined, paint: string | undefined) {
    const state = satelliteSeason(day, latitude);
    this.uniforms.satelliteSeasonActive.value = paint === 'satellite';
    this.uniforms.satelliteSnowActive.value = theater === 'salt-lake';
    this.uniforms.satelliteTint.value.set(state.tint[0]!, state.tint[1]!, state.tint[2]);
    this.uniforms.satelliteDesaturate.value = state.strength;
    this.uniforms.satelliteSnowBand.value.set(state.snow[0]!, state.snow[1]!);
  }

  patch(shader: Shader) {
    Object.assign(shader.uniforms, this.uniforms);
    shader.vertexShader = 'varying float vSeasonElevation;\n' + shader.vertexShader;
    // After begin_vertex's terrain morph and seam correction; Y stays absolute
    // because the floating origin only translates X/Z.
    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      'vSeasonElevation = transformed.y;\n#include <project_vertex>',
    );
    shader.fragmentShader =
      `
varying float vSeasonElevation;
uniform bool satelliteSeasonActive;
uniform bool satelliteSnowActive;
uniform vec3 satelliteTint;
uniform float satelliteDesaturate;
uniform vec2 satelliteSnowBand;
uniform vec2 satellitePermanentBand;
` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `
#include <map_fragment>
float seasonalSnowAmount = 0.0;
if (satelliteSeasonActive) {
  vec3 base = diffuseColor.rgb;
  float luminance = dot(base, vec3(0.2126, 0.7152, 0.0722));
  // A restrained RGB vegetation hint keeps salt flats, bare rock and desert
  // from becoming green. It is not land-cover classification.
  float vegetation = smoothstep(0.82, 1.12, base.g / max(0.002, base.r));
  vec3 toned = mix(base, vec3(luminance), satelliteDesaturate) * satelliteTint;
  diffuseColor.rgb = mix(base, toned, 0.18 + 0.82 * vegetation);
  if (satelliteSnowActive) {
    float snow = max(
      smoothstep(satelliteSnowBand.x, satelliteSnowBand.y, vSeasonElevation),
      smoothstep(satellitePermanentBand.x, satellitePermanentBand.y, vSeasonElevation));
    // White albedo, independent of dark pixels baked into the source photo.
    // Normal sun/moon/cloud lighting still shades snow: it never emits light.
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), snow);
    seasonalSnowAmount = snow;
  }
}
`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `
// Snow-only artistic white balance: keep the relief's light/dark pattern,
// reduce the strong warm terrain fill, and brighten without an emissive floor.
// Applied before fog/tone mapping, so nighttime and distant snow still darken.
float snowLight = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));
outgoingLight = mix(outgoingLight, mix(outgoingLight, vec3(snowLight), 0.9) * 1.4, seasonalSnowAmount);
#include <opaque_fragment>
`,
    );
  }
}
