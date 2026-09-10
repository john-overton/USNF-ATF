import { describe, expect, test } from 'bun:test';
import { attitudeFromEuler, type Quaternion, type Vec3 } from '../flight';
import {
  BASELINE_SIGNATURE,
  detect,
  detectBest,
  effectiveSignature,
  forwardAxis,
  NOSE_ON_SIGNATURE_FLOOR,
  type Sensor,
  type Signatures,
  WEATHER_SENSOR_RANGE,
  zoneRangeM,
} from './sensors';
import {
  applyDamage,
  createDamageState,
  damageEffects,
  damagePercent,
  destroy,
  skillGLimits,
  structuralOverload,
} from './damage';
import { aircraftCapsule, capsuleHit, closestApproach, movingCapsuleHit } from './hits';

const NM = 1852;
const radians = (degrees: number) => (degrees * Math.PI) / 180;
const level = (headingDeg = 0): Quaternion => attitudeFromEuler(0, radians(headingDeg), 0);
const flat: Signatures = { visual: 100, laser: 100, infrared: 100, radar: 100 };

/**
 * The F-14's AWG-9 as the retail `.SEE` gives it: 190 nm search, 150 nm track.
 * Ranges in the originals are whole nautical miles stored as feet.
 */
const awg9: Sensor = {
  name: 'AWG-9',
  kind: 'radar',
  lookDownPenaltyPercent: 30,
  search: {
    halfAngleHRad: radians(60),
    halfAngleVRad: radians(60),
    minRangeM: 0,
    maxRangeM: 190 * NM,
    minAltM: -Infinity,
    maxAltM: Infinity,
  },
  track: {
    halfAngleHRad: radians(45),
    halfAngleVRad: radians(45),
    minRangeM: 0,
    maxRangeM: 150 * NM,
    minAltM: -Infinity,
    maxAltM: Infinity,
  },
};
const eyeball: Sensor = {
  name: 'VIS340',
  kind: 'visual',
  lookDownPenaltyPercent: 0,
  search: {
    halfAngleHRad: radians(170),
    halfAngleVRad: radians(140),
    minRangeM: 0,
    maxRangeM: 10 * NM,
    minAltM: -Infinity,
    maxAltM: Infinity,
  },
  track: {
    halfAngleHRad: radians(170),
    halfAngleVRad: radians(140),
    minRangeM: 0,
    maxRangeM: 5 * NM,
    minAltM: -Infinity,
    maxAltM: Infinity,
  },
};

/** North is -Z in this engine, so a due-north target sits at negative Z. */
const northOf = (metres: number): Vec3 => ({ x: 0, y: 6000, z: -metres });
const observer = { position: { x: 0, y: 6000, z: 0 }, attitude: level() };
const target = (position: Vec3, headingDeg = 180, signatures = flat) => ({
  position,
  attitude: level(headingDeg),
  signatures,
});

describe('sensor geometry', () => {
  test('nose points down -Z at zero heading', () => {
    const nose = forwardAxis(level());
    expect(nose.z).toBeCloseTo(-1, 6);
    expect(Math.hypot(nose.x, nose.y)).toBeLessThan(1e-6);
  });

  test('tracks inside the track zone and only searches beyond it', () => {
    // A tail-on target keeps its full signature, so the zones are at nominal range.
    expect(detect(observer, awg9, target(northOf(100 * NM), 0)).level).toBe('track');
    expect(detect(observer, awg9, target(northOf(170 * NM), 0)).level).toBe('search');
    expect(detect(observer, awg9, target(northOf(200 * NM), 0)).level).toBe('none');
  });

  test('drops a target outside the scan cone however close it is', () => {
    // Abeam at 3 nm: 90 degrees off boresight, outside the AWG-9's 60 degree
    // search cone but well inside the eyeball's 10 nm reach.
    const abeam = { x: 3 * NM, y: 6000, z: 0 };
    expect(detect(observer, awg9, target(abeam, 0)).level).toBe('none');
    // The eyeball reaches 170 degrees, so it still sees it.
    expect(detect(observer, eyeball, target(abeam, 0)).level).not.toBe('none');
  });

  test('reports bearing and elevation relative to the nose', () => {
    const right = detect(observer, eyeball, target({ x: 1000, y: 6000, z: -1000 }, 0));
    expect(right.bearingRad).toBeCloseTo(radians(45), 6);
    expect(right.elevationRad).toBeCloseTo(0, 6);
    const high = detect(observer, eyeball, target({ x: 0, y: 7000, z: -1000 }, 0));
    expect(high.elevationRad).toBeGreaterThan(0);
    expect(
      detect(observer, eyeball, target({ x: 0, y: 5000, z: -1000 }, 0)).elevationRad,
    ).toBeLessThan(0);
  });
});

describe('signature model', () => {
  test('halves detection range when the signature halves', () => {
    const half = zoneRangeM(awg9.search, awg9, BASELINE_SIGNATURE / 2, 'day', false);
    expect(half).toBeCloseTo((190 * NM) / 2, 6);
  });

  test('afterburner doubles the infra-red signature and stores raise radar', () => {
    const away = { x: 0, y: 0, z: 1 };
    const hot = effectiveSignature(
      'infrared',
      flat,
      { attitude: level(0), configuration: { afterburner: true } },
      away,
    );
    const cold = effectiveSignature('infrared', flat, { attitude: level(0) }, away);
    expect(hot / cold).toBeCloseTo(2, 6);
    const dirty = effectiveSignature(
      'radar',
      flat,
      { attitude: level(0), configuration: { externalStores: true } },
      away,
    );
    expect(dirty / effectiveSignature('radar', flat, { attitude: level(0) }, away)).toBeCloseTo(
      1.33,
      6,
    );
    // Afterburner must not leak into the radar channel.
    expect(
      effectiveSignature(
        'radar',
        flat,
        { attitude: level(0), configuration: { afterburner: true } },
        away,
      ),
    ).toBeCloseTo(cold, 6);
  });

  test('a nose-on target is harder to see than a beaming one', () => {
    // The observer lies at +Z of the target, so a nose-on target flies heading 180.
    const toObserver = { x: 0, y: 0, z: 1 };
    const noseOn = effectiveSignature('radar', flat, { attitude: level(180) }, toObserver);
    const beaming = effectiveSignature('radar', flat, { attitude: level(90) }, toObserver);
    const tailOn = effectiveSignature('radar', flat, { attitude: level(0) }, toObserver);
    expect(noseOn).toBeLessThan(beaming);
    expect(noseOn / tailOn).toBeCloseTo(NOSE_ON_SIGNATURE_FLOOR, 6);
    // Only the nose reduces the signature; abeam and tail-on are unreduced.
    expect(beaming).toBeCloseTo(tailOn, 6);
  });

  test('weather multipliers match the manual table', () => {
    expect(WEATHER_SENSOR_RANGE.night.visual).toBe(0.25);
    expect(WEATHER_SENSOR_RANGE.night.infrared).toBe(1.25);
    expect(WEATHER_SENSOR_RANGE.clouds.radar).toBe(0.75);
    expect(WEATHER_SENSOR_RANGE.fog.radar).toBe(1);
    // Night quarters visual range: a 10 nm eyeball sees 2.5 nm.
    expect(zoneRangeM(eyeball.search, eyeball, BASELINE_SIGNATURE, 'night', false)).toBeCloseTo(
      2.5 * NM,
      6,
    );
  });

  test('look-down penalty applies only when looking down', () => {
    const low = { position: { x: 0, y: 200, z: -100 * NM }, attitude: level(0), signatures: flat };
    const high = {
      position: { x: 0, y: 11000, z: -100 * NM },
      attitude: level(0),
      signatures: flat,
    };
    // A 30% penalty puts the track zone at 105 nm and the search zone at 133 nm,
    // so 100 nm tracks either way, 120 nm only searches when looking down, and
    // 160 nm is lost entirely downwards while still searching upwards.
    expect(detect(observer, awg9, high).level).toBe('track');
    expect(detect(observer, awg9, low).level).toBe('track');
    const at = (y: number, nm: number) => ({ ...low, position: { x: 0, y, z: -nm * NM } });
    expect(detect(observer, awg9, at(200, 120)).level).toBe('search');
    expect(detect(observer, awg9, at(11000, 120)).level).toBe('track');
    expect(detect(observer, awg9, at(200, 160)).level).toBe('none');
    expect(detect(observer, awg9, at(11000, 160)).level).toBe('search');
  });

  test('picks the best level across a sensor suite', () => {
    // Abeam and close: the radar cannot see it, the eyeball tracks it.
    const abeam = target({ x: 2 * NM, y: 6000, z: 0 }, 0);
    const best = detectBest(observer, [awg9, eyeball], abeam);
    expect(best.result.level).toBe('track');
    expect(best.sensor?.name).toBe('VIS340');
    const nothing = detectBest(
      observer,
      [awg9, eyeball],
      target({ x: 0, y: 6000, z: 400 * NM }, 0),
    );
    expect(nothing.result.level).toBe('none');
    expect(nothing.sensor).toBeUndefined();
  });
});

describe('damage', () => {
  test('an AIM-9M needs two hits on an F-14 and a burst of M61 needs seven', () => {
    // ATF Gold values: F-14 hitPoints 153, AIM-9M damage 100, M61 25 per round.
    // USNF'97 gives the F-14 140, so these are per-disc figures, not universal.
    let state = createDamageState(153);
    state = applyDamage(state, 100);
    expect(state.destroyed).toBe(false);
    expect(applyDamage(state, 100).destroyed).toBe(true);

    let strafed = createDamageState(153);
    let rounds = 0;
    while (!strafed.destroyed && rounds < 20) {
      strafed = applyDamage(strafed, 25);
      rounds++;
    }
    expect(rounds).toBe(7);
  });

  test('damage may exceed the pool and scenery with no pool is immune', () => {
    const over = applyDamage(applyDamage(createDamageState(100), 90), 90);
    expect(damagePercent(over)).toBeCloseTo(180, 6);
    const road = applyDamage(createDamageState(0), 500);
    expect(road.destroyed).toBe(false);
    expect(destroy(road).destroyed).toBe(true);
  });

  test('ignores non-positive damage and never revives a wreck', () => {
    const wreck = destroy(createDamageState(100));
    expect(applyDamage(wreck, 50)).toBe(wreck);
    const clean = createDamageState(100);
    expect(applyDamage(clean, 0)).toBe(clean);
    expect(() => applyDamage(clean, Number.NaN)).toThrow();
  });

  test('degrades turn and speed and raises drag, with no thrust term', () => {
    const half = applyDamage(createDamageState(100), 50);
    const effects = damageEffects(half);
    expect(effects.gScale).toBeCloseTo(0.5, 6);
    expect(effects.speedScale).toBeCloseTo(0.5, 6);
    expect(effects.gPullDragScale).toBeCloseTo(1.5, 6);
    expect(effects.dragScale).toBeCloseTo(1.5, 6);
    expect(Object.keys(effects)).not.toContain('thrustScale');
    // Beyond 100% the scales floor at zero rather than going negative.
    expect(damageEffects(applyDamage(createDamageState(100), 150)).gScale).toBe(0);
  });

  test('novice and average AI lose a G each side, floored at two', () => {
    expect(skillGLimits(0, 7.5, -3)).toEqual({ maxG: 6.5, minG: -2 });
    expect(skillGLimits(1, 7.5, -3)).toEqual({ maxG: 6.5, minG: -2 });
    expect(skillGLimits(2, 7.5, -3)).toEqual({ maxG: 7.5, minG: -3 });
    expect(skillGLimits(3, 7.5, -3)).toEqual({ maxG: 7.5, minG: -3 });
    // The human-flown aircraft is exempt whatever skill the mission recorded.
    expect(skillGLimits(0, 7.5, -3, true)).toEqual({ maxG: 7.5, minG: -3 });
    // A weak aircraft is not pushed up to the floor.
    expect(skillGLimits(0, 2.5, -1.5).maxG).toBe(2);
  });

  test('structural overload tightens as the airframe takes damage', () => {
    const limits = { warn: 5, fail: 7.5 };
    expect(structuralOverload(4, limits)).toBe('none');
    expect(structuralOverload(6, limits)).toBe('warn');
    expect(structuralOverload(8, limits)).toBe('fail');
    // Negative G counts against the same limits.
    expect(structuralOverload(-8, limits)).toBe('fail');
    const hurt = applyDamage(createDamageState(100), 50);
    expect(structuralOverload(4, limits, hurt)).toBe('fail');
  });
});

describe('hit detection', () => {
  const f14 = aircraftCapsule({ position: { x: 0, y: 1000, z: 0 }, attitude: level(0) }, 19.1);

  test('builds a hull that spans the airframe length', () => {
    expect(f14.radiusM).toBeCloseTo(19.1 * 0.14, 6);
    expect(f14.halfLengthM + f14.radiusM).toBeCloseTo(19.1 / 2, 6);
    expect(f14.axis.z).toBeCloseTo(-1, 6);
  });

  test('catches a round that crosses the hull inside one step', () => {
    // 1,030 m/s for 1/120 s is 8.6 m, more than the hull radius, so a point test
    // would miss: the round starts clear ahead and ends clear behind.
    const from = { x: -6, y: 1000, z: 0 };
    const to = { x: 6, y: 1000, z: 0 };
    const hit = capsuleHit(from, to, f14);
    expect(hit).toBeDefined();
    expect(hit?.distance).toBeCloseTo(0, 6);
    expect(hit?.t).toBeCloseTo(0.5, 6);
  });

  test('misses cleanly just outside the hull radius', () => {
    const clear = f14.radiusM + 0.5;
    expect(
      capsuleHit({ x: -6, y: 1000 + clear, z: 0 }, { x: 6, y: 1000 + clear, z: 0 }, f14),
    ).toBeUndefined();
    const graze = f14.radiusM - 0.05;
    expect(
      capsuleHit({ x: -6, y: 1000 + graze, z: 0 }, { x: 6, y: 1000 + graze, z: 0 }, f14),
    ).toBeDefined();
  });

  test('hits along the fuselage but not past the tail', () => {
    const behind = -(f14.halfLengthM + f14.radiusM + 1);
    expect(
      capsuleHit({ x: -6, y: 1000, z: -behind }, { x: 6, y: 1000, z: -behind }, f14),
    ).toBeUndefined();
    expect(
      capsuleHit(
        { x: -6, y: 1000, z: f14.halfLengthM / 2 },
        { x: 6, y: 1000, z: f14.halfLengthM / 2 },
        f14,
      ),
    ).toBeDefined();
  });

  test('a stationary round still resolves against the hull', () => {
    const inside = { x: 0, y: 1000, z: 0 };
    expect(capsuleHit(inside, inside, f14)).toBeDefined();
    const outside = { x: 500, y: 1000, z: 0 };
    expect(capsuleHit(outside, outside, f14)).toBeUndefined();
  });

  test('closest approach clamps to the capsule ends', () => {
    const approach = closestApproach({ x: 0, y: 1000, z: 100 }, { x: 0, y: 1000, z: 90 }, f14);
    expect(approach.s).toBeCloseTo(-f14.halfLengthM, 6);
    expect(approach.t).toBeCloseTo(1, 6);
  });

  test('accounts for a target that moved during the step', () => {
    // A fighter covers only about 2.5 m per 1/120 s step, far less than its own
    // 19 m hull, so intra-step drift rarely changes a gun result. The correction
    // is checked on a small, fast body where it does decide the outcome.
    const warhead = {
      center: { x: 0, y: 1000, z: -10 },
      axis: { x: 0, y: 0, z: -1 },
      halfLengthM: 1,
      radiusM: 1,
    };
    const round = { from: { x: -6, y: 1000, z: 0 }, to: { x: 6, y: 1000, z: 0 } };
    // Against the end-of-step pose alone the round passes 9 m clear.
    expect(capsuleHit(round.from, round.to, warhead)).toBeUndefined();
    // Sweeping the target from z = +10 to z = -10 puts it on the round mid-step.
    const hit = movingCapsuleHit(round, {
      previousPosition: { x: 0, y: 1000, z: 10 },
      capsule: warhead,
    });
    expect(hit).toBeDefined();
    expect(hit?.t).toBeCloseTo(0.5, 6);
    // The reported point lies on the round's real path, which never leaves z = 0.
    expect(hit?.point.z).toBeCloseTo(0, 6);
    expect(hit?.point.x).toBeCloseTo(0, 6);
  });

  test('matches the static test exactly when the target did not move', () => {
    const round = { from: { x: -6, y: 1000, z: 0 }, to: { x: 6, y: 1000, z: 0 } };
    const still = movingCapsuleHit(round, { previousPosition: f14.center, capsule: f14 });
    expect(still).toEqual(capsuleHit(round.from, round.to, f14));
  });
});
