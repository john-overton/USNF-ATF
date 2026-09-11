/**
 * Ported from SunshineClouds2 a73a80b, Copyright (c) 2025 David House (MIT).
 * Full notice: ../render/sunshine-assets/LICENSE.txt.
 * Density/light equations retained; GLES guards and terrain-relative bounds adapted.
 */
export const SUNSHINE_GLSL = `
uniform sampler2D extra_large_noise;
uniform sampler3D large_noise;
uniform sampler3D noise_medium;
uniform sampler3D noise_small;
uniform sampler3D curl_noise;
uniform sampler3D dither_small;
uniform sampler2D heightmask;
uniform float sunshineMode;
uniform float sunshineTime;
uniform vec2 sunshineWind;
uniform float sunshineScale;
uniform float sunshineCoverage;
uniform float sunshineDensity;
uniform int sunshineSteps;
uniform int sunshineLightSteps;
uniform vec2 sunshineOffset;
float quadraticOut(float t) {
  return -t * (t - 2.0);
}

float quadraticIn(float t) {
  return t * t;
}

float rand(vec2 co){
    return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

float remap(float value, float min1, float max1, float min2, float max2) {
  return min2 + (value - min1) * (max2 - min2) / max(0.000001, max1 - min1);
}

float BeersLaw (float dist, float absorption) {
  return exp(-dist * absorption);
}

float Powder (float dist, float absorption) {
  return 1.0 - exp(-dist * absorption * 2.0);
}

float HenyeyGreenstein(float g, float costh)
{
    return (1.0 - g * g) / (4.0 * PI * pow(1.0 + g * g - 2.0 * g * costh, 3.0/2.0));
}

float sampleEffectorAdditive(vec3 p) { return 0.0; }
float sampleScene(
	vec3 largeNoisePos,
	vec3 mediumNoisePos,
	vec3 smallNoisePos,
	vec3 worldPosition,
	float cloudceiling,
	float cloudfloor,
	float extralargeNoiseValue,
	float largenoisescale,
	float mediumnoisescale,
	float smallnoisescale,
	float coverage,
	float smallscalePower,
	float curlPower,
	float lod,
	bool ambientsample)
	{
	vec2 ground = cloudGroundAt(worldPosition.xz);
    if (ground.y < 0.5) return 0.0;
    cloudfloor += ground.x;
    cloudceiling += ground.x;
    float clampedWorldHeight = remap(worldPosition.y, cloudfloor, cloudceiling, 0.0, 1.0);
	vec4 gradientSample = texture(heightmask, vec2(clampedWorldHeight, 0.5)).rgba;

	float edgeFade = min(smoothstep(0.0, 0.1, clampedWorldHeight), (1.0 - smoothstep(0.9, 1.0, clampedWorldHeight)));
	float extraLargeShape = extralargeNoiseValue * gradientSample.b;

	float smallShape = texture(noise_small, (worldPosition - smallNoisePos) / smallnoisescale).r;

	float curlHeightSample = (1.0 - gradientSample.a);

	float effectorAdditive = 0.0;
	vec2 WindDirection = sunshineWind;
	worldPosition += vec3(WindDirection.x, 0.0, WindDirection.y) * 0.0 * quadraticIn(1.0 - clamp(clampedWorldHeight / 0.54, 0.0, 1.0));

	if (curlPower > 0.0){
		effectorAdditive = sampleEffectorAdditive(worldPosition) * edgeFade;

		if (!ambientsample && curlHeightSample > 0.0 && curlPower > 0.5){

			// Curl defines the silhouette in world space. Scaling it with camera
            // distance deformed the same cloud as the observer approached it.
            float curlLod = 1.0;
			worldPosition += (((texture(curl_noise, (worldPosition - mediumNoisePos) / mediumnoisescale).xyz * 2.0) - 1.0) * vec3(1.0, 0.2, 1.0) + vec3(WindDirection.x, 0.0, WindDirection.y) * 0.9) * curlPower * curlHeightSample * curlLod;
			worldPosition += (((texture(curl_noise, (worldPosition - mediumNoisePos) / mediumnoisescale).xyz * 2.0) - 1.0) * vec3(1.0, 0.2, 1.0) + vec3(WindDirection.x, 0.0, WindDirection.y) * 0.9) * curlPower * curlHeightSample * curlLod;
			worldPosition += (((texture(curl_noise, (worldPosition - mediumNoisePos) / mediumnoisescale).xyz * 2.0) - 1.0) * vec3(1.0, 0.2, 1.0) + vec3(WindDirection.x, 0.0, WindDirection.y) * 0.9) * curlPower * curlHeightSample * curlLod;

			clampedWorldHeight = remap(worldPosition.y, cloudfloor, cloudceiling, 0.0, 1.0);
			gradientSample = texture(heightmask, vec2(clampedWorldHeight, 0.5)).rgba;
		}
	}

	float largeShape = texture(large_noise, (worldPosition - largeNoisePos) / largenoisescale).r * extraLargeShape;
	largeShape = (1.0 - smoothstep(coverage - 0.1, coverage, 1.0 - (largeShape * gradientSample.r))) + max(effectorAdditive, 0.0);
	vec4 mediumShapes = texture(noise_medium, (worldPosition - mediumNoisePos) / mediumnoisescale).rgba;
	float mediumshape = 1.0 - mediumShapes.r;
	smallShape = smallShape * gradientSample.g * pow((1.0 - mediumshape), smallscalePower);

	float shape = mediumshape + max(effectorAdditive, 0.0);
	shape = clamp(remap(shape, 1.0 - largeShape, 1.0, 0.0, 1.0), 0.0, 1.0);
	shape = clamp(remap(shape, smallShape, 1.0, 0.0, 1.0), 0.0, 1.0);
	shape += min(effectorAdditive, 0.0);

	return clamp((shape * edgeFade), 0.0, 1.0);
}

float sampleSceneCoarse(
	vec3 largeNoisePos,
	vec3 worldPosition,
	float cloudceiling,
	float cloudfloor,
	float extralargeNoiseValue,
	float largenoisescale,
	float coverage,
	float lod)
	{
	vec2 ground = cloudGroundAt(worldPosition.xz);
    if (ground.y < 0.5) return 0.0;
    cloudfloor += ground.x;
    cloudceiling += ground.x;
    float clampedWorldHeight = remap(worldPosition.y, cloudfloor, cloudceiling, 0.0, 1.0);
	vec4 gradientSample = texture(heightmask, vec2(clampedWorldHeight, 0.5)).rgba;

	float edgeFade = min(smoothstep(0.0, 0.1, clampedWorldHeight), (1.0 - smoothstep(0.9, 1.0, clampedWorldHeight)));
	float extraLargeShape = extralargeNoiseValue * gradientSample.b;

	float effectorAdditive = 0.0;
	vec2 WindDirection = sunshineWind;
	worldPosition += vec3(WindDirection.x, 0.0, WindDirection.y) * 0.0 * quadraticIn(1.0 - clamp(clampedWorldHeight / 0.54, 0.0, 1.0));

	if (lod > 0.0){
		effectorAdditive = sampleEffectorAdditive(worldPosition) * edgeFade;
	}

	float largeShape = texture(large_noise, (worldPosition - largeNoisePos) / largenoisescale).r * extraLargeShape;
	largeShape = (1.0 - smoothstep(coverage - 0.1, coverage, 1.0 - (largeShape * gradientSample.r))) + max(effectorAdditive, 0.0);

	float shape = largeShape + effectorAdditive;
	return clamp((shape * edgeFade), 0.0, 1.0);
}

float sampleLighting(
	int stepCount,
	vec3 worldPosition,
	vec3 extralargeNoisePos,
	vec3 largeNoisePos,
	vec3 mediumNoisePos,
	vec3 smallNoisePos,
	vec3 sunDirection,
	float densityMultiplier,
	float sunUpWeight,
	float stepDistance,
	float cloudceiling,
	float cloudfloor,
	float extralargenoisescale,
	float largenoisescale,
	float mediumnoisescale,
	float smallnoisescale,
	float coverage,
	float smallscalePower,
	float curlPower,
	float lod)
	{
	float density = 0.0;
	float stepCountFloat = max(float(stepCount) * lod, 2.0);
	float actualDistance = mix(stepDistance * 4.0, stepDistance, lod);
	float eachShortStep = actualDistance / (float(stepCount) / stepCountFloat) / stepCountFloat;
	float traveledDistance = 0.0;

	float sunUpValue = 1.0 - sunUpWeight;
	float eachStepWeight = 1.0 / stepCountFloat;

	float heightGradient = 0.0;
	float thisDensity = 0.0;
	float count = 0.0;
	vec3 curPos = worldPosition;
	for (float i = 0.0; i < stepCountFloat; i++) {
		traveledDistance = mix(eachShortStep, actualDistance, clamp(quadraticOut(i / stepCountFloat), 0.0, 1.0));
		curPos = worldPosition + sunDirection * traveledDistance;

		vec2 ground = cloudGroundAt(curPos.xz);
		if (density < 1.0 && ground.y > 0.5 && clamp(curPos.y - ground.x, cloudfloor, cloudceiling) == curPos.y - ground.x){
			heightGradient = remap(curPos.y - ground.x, cloudfloor, cloudceiling, 0.0, 1.0);

			heightGradient = clamp(smoothstep(sunUpValue - 0.1, sunUpValue, heightGradient), 0.0, 1.0);
			float extraLargeShape = texture(extra_large_noise, (curPos.xz - extralargeNoisePos.xz) / extralargenoisescale).a;

			thisDensity = sampleScene(largeNoisePos, mediumNoisePos, smallNoisePos, curPos, cloudceiling, cloudfloor, extraLargeShape, largenoisescale, mediumnoisescale, smallnoisescale, coverage, smallscalePower, curlPower, lod, true) * densityMultiplier * eachStepWeight;

			density += mix(1.0, thisDensity, heightGradient);
		}
		else{
			break;
		}
	}

	return density;
}

float sampleAO(
	vec3 extralargeNoisePos,
	vec3 largeNoisePos,
	vec3 mediumNoisePos,
	vec3 smallNoisePos,
	vec3 worldPosition,
	float lightingSampleRange,
	float cloudceiling,
	float cloudfloor,
	float extralargenoisescale,
	float largenoisescale,
	float mediumnoisescale,
	float smallnoisescale,
	float coverage,
	float smallscalePower,
	float curlPower,
	float lod)
	{
	vec3 samplePos = worldPosition;
	samplePos.y += lightingSampleRange * 0.5;
	samplePos.y += lightingSampleRange * (rand(samplePos.xz) * 2.0 - 1.0);
	samplePos.x += lightingSampleRange * (rand(samplePos.zy) * 2.0 - 1.0);
	samplePos.z += lightingSampleRange * (rand(samplePos.yx) * 2.0 - 1.0);

	float extraLargeShape = texture(extra_large_noise, (samplePos.xz - extralargeNoisePos.xz) / extralargenoisescale).a;
	return sampleScene(largeNoisePos, mediumNoisePos, smallNoisePos, samplePos, cloudceiling, cloudfloor, extraLargeShape, largenoisescale, mediumnoisescale, smallnoisescale, coverage, smallscalePower, curlPower, lod, true);
}


// Active SunshineClouds.gd defaults, with all lengths scaled together to the
// selected layer's thickness. Source reference thickness is 23.5 km.
vec4 sunshineMarch(vec3 ro, vec3 raydirection, float sceneDistance,
                   out vec4 rayData) {
  float scale = sunshineScale;
  float minstep = 400.0 * scale;
  float maxstep = 500.0 * scale;
  float lightDistance = 10000.0 * scale;
  float maxDistance = 180000.0;
  float coverage = sunshineCoverage * 1.01;
  float densityMultiplier = sunshineDensity;
  float sharpness = 0.508;
  float lightDensity = 0.982 * (1.0 + 3.0 * coverage);
  // Noise layers drift independently, as in the Godot driver.
  vec3 extraPos = vec3(sunshineOffset.x, 0.0, sunshineOffset.y);
  vec3 largePos = extraPos * (100.0 / 140.0);
  vec3 mediumPos = extraPos * (40.0 / 140.0);
  vec3 smallPos = extraPos * (12.0 / 140.0);
  smallPos.y = sunshineTime / 15.111 * 3.0 * scale;
  float extraScale = 320000.0 * scale;
  float largeScale = 120000.0 * scale;
  float mediumScale = 20000.0 * scale;
  float smallScale = 8500.0 * scale;
  float curlPower = 4500.0 * scale;
  // Skip empty space above/below the conservative terrain-relative slab.
  // The source near-cloud budget must not hide low clouds from high aircraft.
  float entry = 0.0;
  if (ro.y > weatherRange.y + cloudTopM && raydirection.y < -0.00001)
    entry = (weatherRange.y + cloudTopM - ro.y) / raydirection.y;
  if (ro.y < weatherRange.x + cloudBaseM && raydirection.y > 0.00001)
    entry = (weatherRange.x + cloudBaseM - ro.y) / raydirection.y;
  float marchRange = max(0.0, maxDistance - entry);
  // A narrow animated offset retains dithering without jumping across most
  // of a cloud-edge sample interval each frame. Do not lock it to the screen.
  float traveled = entry + maxstep * (0.425 + 0.15 * texture(dither_small, vec3(vUv * 40.037, sunshineTime)).r);
  float initial = maxDistance;
  float weightedDistance = 0.0;
  float density = 0.0;
  float ambient = 0.0;
  float lightingWeight = 0.0;
  vec3 light = vec3(0.0);
  bool depthBreak = false;
  float sunUp = smoothstep(-0.03, 0.07, cloudSunDirection.y);
  float phase = pow(HenyeyGreenstein(0.16, dot(cloudSunDirection, raydirection)), 1.84);
  for (int i = 0; i < sunshineSteps; i++) {
    if (traveled >= min(sceneDistance, maxDistance)) { depthBreak = traveled >= sceneDistance; break; }
    vec3 p = ro + raydirection * traveled;
    vec2 ground = cloudGroundAt(p.xz);
    float d = 0.0;
    float nextStep = maxstep;
    if (ground.y > 0.5 && p.y - ground.x >= cloudBaseM && p.y - ground.x <= cloudTopM) {
      float lod = 1.0 - clamp(traveled / maxDistance, 0.0, 1.0);
      vec4 maskSample = texture(extra_large_noise, (p.xz - extraPos.xz) / extraScale);
      d = pow(sampleScene(largePos, mediumPos, smallPos, p, cloudTopM, cloudBaseM,
        maskSample.a, largeScale, mediumScale, smallScale, coverage, 1.075, curlPower, lod, false)
        * densityMultiplier, sharpness);
      nextStep = mix(mix(maxstep, minstep, pow(d, 0.1)), maxstep, float(i) / float(sunshineSteps));
      // The first partial interval and the final opacity-saturating interval
      // must contribute the SAME weight to opacity and light. Counting the
      // entire final sample made illumination jump as rays gained/lost a step,
      // which can appear as nested shells when moving through dense cloud.
      if (i == 0) d *= 1.0 - (traveled - entry) / maxstep;
      d = min(d, max(0.0, 1.0 - density));
      if (d > 0.0) {
        initial = min(initial, traveled);
        lightingWeight += d;
        weightedDistance += traveled * d;
        float powder = d;
        float sampled = sampleLighting(sunshineLightSteps, p, extraPos, largePos, mediumPos,
          smallPos, cloudSunDirection, densityMultiplier * lightDensity, sunUp, lightDistance,
          cloudTopM, cloudBaseM, extraScale, largeScale, mediumScale, smallScale,
          coverage, 1.075, curlPower, lod);
        float weight = pow(BeersLaw(lightDistance, sampled * phase), 0.38) * sunUp;
        // Three supplies linear RGB; source pow(color * power * weight, 2.2)
        // is retained for scalar weights without gamma-converting color twice.
        light += cloudSunColor * pow(cloudSunStrength * weight, 2.2) * powder;
        ambient += sampleScene(largePos, mediumPos, smallPos, p + vec3(0,minstep,0),
          cloudTopM, cloudBaseM, maskSample.a, largeScale, mediumScale, smallScale,
          coverage, 1.075, curlPower, lod, true) * densityMultiplier * lightDensity * d;
      }
      density += d;
      if (density >= 1.0) break;
    }
    // Exponential interval widths sum to the full remaining viewing range.
    // Keep adaptive detail near the camera, but do not spend the whole budget
    // within a few kilometres of a thin layer. No extra primary iterations.
    float f0 = float(i) / float(sunshineSteps);
    float f1 = float(i + 1) / float(sunshineSteps);
    float distantStep = marchRange * (exp(6.0 * f1) - exp(6.0 * f0)) / (exp(6.0) - 1.0);
    traveled += max(nextStep, distantStep);
    if (p.y > weatherRange.y + cloudTopM && raydirection.y > 0.0) break;
    if (p.y < weatherRange.x + cloudBaseM && raydirection.y < 0.0) break;
  }
  density *= 1.0 - smoothstep(150000.0, maxDistance, initial);
  ambient = clamp(ambient / max(0.0001, lightingWeight), 0.0, 1.0);
  // Source's neutral sky tint with occlusion. Scene-specific red test AO is
  // adapted to this environment's sheltered gray/blue cloud bases.
  vec3 fill = vec3(0.761,0.784,0.824) * vec3(0.133,0.2,0.243) * cloudAmbientStrength;
  light += mix(fill, fill * vec3(0.3,0.38,0.5), ambient);
  light *= cloudWeatherBrightness;
  light = mix(light, cloudFogColor, fogAmount(traveled));
  float representativeDistance = lightingWeight > 0.0
    ? weightedDistance / lightingWeight : min(traveled, sceneDistance);
  rayData = vec4(initial, min(traveled, sceneDistance), representativeDistance, float(depthBreak));
  return vec4(light, clamp(density, 0.0, 1.0));
}
`;

/** Source bicubic reconstruction; see the MIT notice above. */
export const SUNSHINE_RECONSTRUCTION = `
float w0(float a)
{
    return (1.0/6.0)*(a*(a*(-a + 3.0) - 3.0) + 1.0);
}

float w1(float a)
{
    return (1.0/6.0)*(a*a*(3.0*a - 6.0) + 4.0);
}

float w2(float a)
{
    return (1.0/6.0)*(a*(a*(-3.0*a + 3.0) + 3.0) + 1.0);
}

float w3(float a)
{
    return (1.0/6.0)*(a*a*a);
}


float g0(float a)
{
    return w0(a) + w1(a);
}

float g1(float a)
{
    return w2(a) + w3(a);
}


float h0(float a)
{
    return -1.0 + w1(a) / (w0(a) + w1(a));
}

float h1(float a)
{
    return 1.0 + w3(a) / (w2(a) + w3(a));
}



vec4 texture2D_bicubic(sampler2D tex, vec2 uv, vec2 res)
{
	uv = uv*res + 0.5;
	vec2 iuv = floor( uv );
	vec2 fuv = fract( uv );

	float g0x = g0(fuv.x);
	float g1x = g1(fuv.x);
	float h0x = h0(fuv.x);
	float h1x = h1(fuv.x);
	float h0y = h0(fuv.y);
	float h1y = h1(fuv.y);

	vec2 p0 = (vec2(iuv.x + h0x, iuv.y + h0y) - 0.5) / res;
	vec2 p1 = (vec2(iuv.x + h1x, iuv.y + h0y) - 0.5) / res;
	vec2 p2 = (vec2(iuv.x + h0x, iuv.y + h1y) - 0.5) / res;
	vec2 p3 = (vec2(iuv.x + h1x, iuv.y + h1y) - 0.5) / res;

    return g0(fuv.y) * (g0x * texture(tex, p0)  +
                        g1x * texture(tex, p1)) +
           g1(fuv.y) * (g0x * texture(tex, p2)  +
                        g1x * texture(tex, p3));
}


`;
