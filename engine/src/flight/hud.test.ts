import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { attitudeFromEuler, createFlightState, sampleTelemetry } from '../sim/flight';
import { windReadoutText, flightHudReadout } from './hud';
import { FlightHud } from './FlightHud';
import type { FlightDiagnostics } from './FlightLayer';

const env = {
  sampleGround: () => ({ height: 0, normal: { x: 0, y: 1, z: 0 }, kind: 'land' as const }),
};
test('HUD uses north-referenced heading and correctly converts SI flight instruments', () => {
  for (const [yaw, heading] of [
    [0, 180],
    [Math.PI / 2, 270],
    [-Math.PI / 2, 90],
    [Math.PI, 0],
  ] as const) {
    const state = createFlightState({
      position: { x: 0, y: 3048, z: 0 },
      airspeed: 100,
      yawRad: yaw,
    });
    const readout = flightHudReadout(state, sampleTelemetry(state, env));
    expect(readout.heading).toBeCloseTo(heading, 8);
    expect(readout.speedKnots).toBeCloseTo(194.384449244, 8);
    expect(readout.altitudeFeet).toBeCloseTo(10000, 8);
    expect(readout.clearanceFeet).toBeCloseTo((3048 - 2.2) / 0.3048, 8);
    expect(readout.path.x).toBeCloseTo(0, 8);
    expect(readout.path.y).toBeCloseTo(0, 8);
    expect(readout.path.visible).toBe(true);
  }
});
test('HUD velocity marker follows body-relative path through bank and excludes reverse/slow motion', () => {
  const state = createFlightState({ position: { x: 0, y: 1000, z: 0 }, airspeed: 100 });
  state.velocity = { x: 10, y: -10, z: -100 };
  const readout = flightHudReadout(state, sampleTelemetry(state, env));
  expect(readout.path.x).toBeGreaterThan(0);
  expect(readout.path.y).toBeGreaterThan(0);
  state.attitude = attitudeFromEuler(0, 0, Math.PI / 2);
  const banked = flightHudReadout(state, sampleTelemetry(state, env));
  expect(banked.path.x).toBeLessThan(0);
  expect(banked.path.y).toBeGreaterThan(0);
  state.velocity = { x: 0, y: 0, z: 100 };
  expect(flightHudReadout(state, sampleTelemetry(state, env)).path.visible).toBe(false);
  state.velocity = { x: 0, y: 0, z: -1 };
  expect(flightHudReadout(state, sampleTelemetry(state, env)).path.visible).toBe(false);
  state.velocity = { x: 100, y: 100, z: -1 };
  const limited = flightHudReadout(state, sampleTelemetry(state, env));
  expect(limited.path.limited).toBe(true);
  expect(Math.abs(limited.path.x)).toBeLessThanOrEqual(145);
  expect(Math.abs(limited.path.y)).toBeLessThanOrEqual(145);
  expect(
    flightHudReadout(state, { ...sampleTelemetry(state, env), groundClearance: undefined })
      .clearanceFeet,
  ).toBeNull();
});
test('HUD renders live throttle, engine, flight warning and all four retail-named annunciators', () => {
  const state = createFlightState({ position: { x: 0, y: 3048, z: 0 }, airspeed: 100 });
  // Component intentionally receives a snapshot; no window, polling, or renderer is needed.
  const flight = {
    state,
    telemetry: sampleTelemetry(state, env),
    throttle: 0.75,
    afterburner: false,
    engineRunning: false,
    systems: { gearFraction: 0.5, hookFraction: 1, engineSpool: 0 },
    status: 'waiting-terrain',
    stalled: false,
    controls: { brake: true },
    loadFactor: 1,
    cameraMode: 'world-up',
  } as FlightDiagnostics;
  const markup = renderToStaticMarkup(
    createElement(FlightHud, { flight, flapFraction: 1, airbrakeFraction: 1 }),
  );
  for (const label of [
    'THR 75%',
    'ENGINE OFF',
    'WAITING FOR TERRAIN',
    'GEAR',
    'FLAP',
    'BRAKE',
    'HOOK',
    'TAS KT',
    'ALT FT MSL',
  ])
    expect(markup).toContain(label);
  expect(markup).not.toContain('WHEEL BRAKE');
  flight.status = 'grounded';
  expect(renderToStaticMarkup(createElement(FlightHud, { flight }))).toContain('WHEEL BRAKE');
  expect(markup).toContain('pointer-events:none');
  expect(markup).toContain('data-hud="heading"');
  flight.throttle = 1;
  flight.afterburner = true;
  expect(renderToStaticMarkup(createElement(FlightHud, { flight }))).toContain('THR 100% AFT');
});

test('wind readout names the bearing the wind blows from, in knots', () => {
  expect(windReadoutText(0, 0)).toBe('WIND CALM');
  expect(windReadoutText(250, 5)).toBe('WIND 250/10');
  expect(windReadoutText(9, 4)).toBe('WIND 009/08');
  // Wrapping keeps 360 reading as 000 rather than a fourth digit.
  expect(windReadoutText(360, 9)).toBe('WIND 000/17');
  expect(windReadoutText(-10, 9)).toBe('WIND 350/17');
});
