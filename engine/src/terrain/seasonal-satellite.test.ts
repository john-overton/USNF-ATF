import { expect, test } from 'bun:test';
import { ShaderLib } from 'three';
import { satelliteSeason, SeasonalSatellite } from './seasonal-satellite';

test('calendar interpolation is smooth through year wrap and seasonal anchors', () => {
  expect(satelliteSeason(15, 40).snow).toEqual([1800, 2400]);
  expect(satelliteSeason(205, 40).snow).toEqual([3300, 3800]);
  for (const day of [1, 15, 110, 205, 290, 366]) {
    const a = satelliteSeason(day - 0.001, 40);
    const b = satelliteSeason(day + 0.001, 40);
    expect(Math.abs(a.snow[0]! - b.snow[0]!)).toBeLessThan(0.1);
    expect(Math.abs(a.tint[0]! - b.tint[0]!)).toBeLessThan(0.001);
  }
  expect(satelliteSeason(15, -40)).toEqual(satelliteSeason(198, 40));
  expect(satelliteSeason(110, 40).tint[1]!).toBeGreaterThan(satelliteSeason(205, 40).tint[1]!);
});

test('satellite only, known-theater snow, viewer-local uniforms and live dates', () => {
  const a = new SeasonalSatellite(),
    b = new SeasonalSatellite();
  a.update(15, 40, 'salt-lake', 'satellite');
  expect(a.uniforms.satelliteSeasonActive.value).toBe(true);
  expect(a.uniforms.satelliteSnowActive.value).toBe(true);
  expect(a.uniforms.satelliteSnowBand.value.x).toBe(1800);
  a.update(205, 40, 'salt-lake', 'summer');
  expect(a.uniforms.satelliteSeasonActive.value).toBe(false);
  expect(a.uniforms.satelliteSnowBand.value.x).toBe(3300);
  expect(b.uniforms.satelliteSeasonActive.value).toBe(false);
  a.update(15, 40, 'ukraine', 'satellite');
  expect(a.uniforms.satelliteSnowActive.value).toBe(false);
});

test('snow replaces satellite albedo before lighting and uses morphed elevation', () => {
  const shader = {
    uniforms: {},
    vertexShader: ShaderLib.physical.vertexShader,
    fragmentShader: ShaderLib.physical.fragmentShader,
  } as Parameters<SeasonalSatellite['patch']>[0];
  new SeasonalSatellite().patch(shader);
  expect(shader.vertexShader).toContain('vSeasonElevation = transformed.y;');
  expect(shader.vertexShader.indexOf('vSeasonElevation =')).toBeGreaterThan(
    shader.vertexShader.indexOf('#include <begin_vertex>'),
  );
  expect(shader.fragmentShader).toContain('mix(diffuseColor.rgb, vec3(1.0), snow)');
  expect(shader.fragmentShader).toContain('seasonalSnowAmount = snow;');
  expect(shader.fragmentShader.indexOf('float snowLight =')).toBeLessThan(
    shader.fragmentShader.indexOf('#include <fog_fragment>'),
  );
  expect(shader.fragmentShader.indexOf('if (satelliteSeasonActive)')).toBeLessThan(
    shader.fragmentShader.indexOf('#include <lights_fragment_begin>'),
  );
});
