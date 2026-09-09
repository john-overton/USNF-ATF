import type { RetailFlightProfile } from '../data/retail-flight';
/** Original presentation choices; retail geometry remains in user app data. */
export const AIRCRAFT = {
  f14: { name: 'F-14 Tomcat', length: 19.1, afterburner: true, hook: true },
  a4e: { name: 'A-4E Skyhawk', length: 12.22, afterburner: false, hook: true },
  x31: { name: 'X-31 EFM', length: 14.99, afterburner: true, hook: false },
} as const;
export type AircraftId = keyof typeof AIRCRAFT;
export function aircraftId(value: string | null): AircraftId {
  if (value === null) return 'f14';
  if (Object.hasOwn(AIRCRAFT, value)) return value as AircraftId;
  throw new Error(`Unknown aircraft: ${value}`);
}

/** Reject profiles accidentally installed in another aircraft's slot. */
export function validateAircraftProfile(id: AircraftId, profile: RetailFlightProfile): void {
  const expected = {
    f14: ['usnf97', 'F14.PT'],
    a4e: ['usnf97', 'A4E.PT'],
    x31: ['atf-gold', 'F31.PT'],
  }[id];
  if (profile.source.game !== expected[0] || profile.source.file.toUpperCase() !== expected[1])
    throw new Error(`Flight profile does not match ${AIRCRAFT[id].name}`);
  if (id !== 'f14' && profile.native)
    throw new Error('Recovered native helpers are currently validated only for F-14');
  if (id === 'a4e' && profile.afterburnerThrustN !== profile.militaryThrustN)
    throw new Error('A-4E profile must not add afterburner thrust');
}
