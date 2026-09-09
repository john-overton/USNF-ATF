import { expect, test } from 'bun:test';
import { envelopeBounds, fitEnvelopeAero, type EnvelopeProfile } from './retail-envelope';

const rectangle = (min: number, max: number) => [
  { speedMps: min, altitudeM: 0 },
  { speedMps: min, altitudeM: 10000 },
  { speedMps: max, altitudeM: 10000 },
  { speedMps: max, altitudeM: 0 },
];
const profile: EnvelopeProfile = {
  envelopes: [
    { g: 1, points: rectangle(100, 400) },
    { g: 4, points: rectangle(200, 300) },
  ],
};
const input = { massKg: 20000, wingAreaM2: 50, altitudeM: 3000, thrustAtSpeed: () => 180000 };

test('native envelope bounds include horizontal edges, interpolate slopes and reject missing coverage', () => {
  expect(envelopeBounds(profile, 1, 0)).toEqual({ minSpeedMps: 100, maxSpeedMps: 400 });
  expect(envelopeBounds(profile, 1, 10000)).toEqual({ minSpeedMps: 100, maxSpeedMps: 400 });
  expect(envelopeBounds(profile, 1, 10001)).toBeUndefined();
  expect(envelopeBounds(profile, 1, -1)).toBeUndefined();
  expect(envelopeBounds(profile, -1, 2000)).toBeUndefined();
  expect(() => envelopeBounds(profile, 1, NaN)).toThrow();
  const triangle = {
    envelopes: [
      {
        g: 1,
        points: [
          { speedMps: 100, altitudeM: 0 },
          { speedMps: 200, altitudeM: 10000 },
          { speedMps: 400, altitudeM: 0 },
        ],
      },
    ],
  };
  expect(envelopeBounds(triangle, 1, 5000)).toEqual({ minSpeedMps: 150, maxSpeedMps: 300 });
  expect(envelopeBounds(triangle, 1, 10000)).toBeUndefined();
});
test('positive fitted polar balances thrust at native 1G and higher-G upper boundaries and stall lift at lower boundary', () => {
  const fit = fitEnvelopeAero(profile, input)!;
  expect(fit.cd0).toBeGreaterThan(0);
  expect(fit.inducedDragK).toBeGreaterThan(0);
  expect(fit.fitG).toBe(4);
  expect(fit.fitWarnings).toEqual([]);
  const qA = (speed: number) => 0.5 * 1.225 * Math.exp(-3000 / 8500) * speed ** 2 * 50;
  for (const [g, speed] of [
    [1, 400],
    [4, 300],
  ] as const) {
    const cl = (g * input.massKg * 9.80665) / qA(speed);
    const drag = qA(speed) * (fit.cd0 + fit.inducedDragK * cl ** 2);
    expect(drag).toBeCloseTo(180000, 6);
  }
  expect(qA(100) * fit.clMax).toBeCloseTo(input.massKg * 9.80665, 6);
  // Fixed polar gives heavier aircraft greater required alpha and induced drag;
  // the runtime must not refit around current fuel/load mass.
  const dragAtMass = (mass: number) =>
    qA(250) * (fit.cd0 + fit.inducedDragK * ((mass * 9.80665) / qA(250)) ** 2);
  expect(dragAtMass(25000)).toBeGreaterThan(dragAtMass(20000));
});
test('one-boundary or incompatible fits retain positive drag, disclose fallback, and never invent altitude coverage', () => {
  const one = { envelopes: [profile.envelopes[0]!] };
  const fit = fitEnvelopeAero(one, input)!;
  expect(fit.fitG).toBeNull();
  expect(fit.fitWarnings).toHaveLength(1);
  expect(fit.cd0).toBeGreaterThan(0);
  expect(fit.inducedDragK).toBeGreaterThan(0);
  const incompatible = {
    envelopes: [profile.envelopes[0]!, { g: 4, points: rectangle(200, 600) }],
  };
  expect(fitEnvelopeAero(incompatible, input)!.fitG).toBeNull();
  expect(fitEnvelopeAero(profile, { ...input, altitudeM: 10001 })).toBeUndefined();
  for (const massKg of [0, -1, NaN, Infinity])
    expect(() => fitEnvelopeAero(profile, { ...input, massKg })).toThrow();
  expect(() => fitEnvelopeAero(profile, { ...input, thrustAtSpeed: () => 0 })).toThrow();
  expect(() => fitEnvelopeAero(profile, { ...input, thrustAtSpeed: () => NaN })).toThrow();
});
