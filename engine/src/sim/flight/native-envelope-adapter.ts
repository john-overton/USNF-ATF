import type { RetailFlightProfile } from '../../data/retail-flight';
import { nativeEnvelopeSpeedLimits } from './native-envelope';
import type { EnvelopeBounds } from './retail-envelope';

/** SI boundary of the isolated native integer helper. The fitted force law
 * calling this remains original: this is not native FMFlight execution. */
export function recoveredEnvelopeBounds(
  profile: RetailFlightProfile,
  g: number,
  altitudeM: number,
  flaps = false,
): EnvelopeBounds | undefined {
  const native = profile.native;
  const envelope = native?.envelopes.find((row) => row.g === g);
  if (!native || !envelope) return undefined;
  const bounds = nativeEnvelopeSpeedLimits(envelope, {
    altitudeFixed: Math.trunc((altitudeM / 0.3048) * 256),
    speedFixed: 0,
    flaps,
    seaLevelLimitFps: native.structuralSpeedFps.seaLevel,
    highAltitudeLimitFps: native.structuralSpeedFps.at36000Ft,
  });
  if (
    bounds.minimumFps === undefined ||
    bounds.maximumFps === undefined ||
    bounds.minimumFps <= 0 ||
    bounds.maximumFps <= bounds.minimumFps
  )
    return undefined;
  return { minSpeedMps: bounds.minimumFps * 0.3048, maxSpeedMps: bounds.maximumFps * 0.3048 };
}
