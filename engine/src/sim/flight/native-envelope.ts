/** Recovered USNF97 envelope helpers, translated from the locally supplied x86
 * routines at 0x483150 / 0x4830b0. This is not the complete native flight model.
 * See Docs/formats/native-flight-code.md for ABI, oracle and provenance. */
export interface NativeEnvelope {
  g: number;
  count: number;
  maxSpeedIndex: number;
  points: { speedFps: number; altitudeFt: number }[];
}
export interface NativeEnvelopeContext {
  /** Signed 24.8 integer current altitude/speed, as stored in the native plane. */
  altitudeFixed: number;
  speedFixed: number;
  flaps: boolean;
  /** PT structure[0] and structure[1], now identified by native code. */
  seaLevelLimitFps: number;
  highAltitudeLimitFps: number;
}
const int32 = (n: number): number => {
  if (!Number.isInteger(n) || n < -2147483648 || n > 2147483647)
    throw new Error('Native envelope requires signed 32-bit integers');
  return n;
};
/** Native 0x4832c0 uses signed 64-bit product, signed truncating division, and
 * wrapping 32-bit subtract/add. Division faults become explicit JS errors. */
export function nativeEnvelopeInterpolate(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x: number,
): number {
  for (const n of [x0, y0, x1, y1, x]) int32(n);
  const divisor = (x1 - x0) | 0;
  if (divisor === 0) throw new Error('Native envelope interpolation division by zero');
  const quotient = (BigInt((x - x0) | 0) * BigInt((y1 - y0) | 0)) / BigInt(divisor);
  if (quotient < -2147483648n || quotient > 2147483647n)
    throw new Error('Native envelope interpolation quotient overflow');
  return (Number(quotient) + y0) | 0;
}
function validate(envelope: NativeEnvelope, context: NativeEnvelopeContext): void {
  int32(context.altitudeFixed);
  int32(context.speedFixed);
  for (const n of [context.seaLevelLimitFps, context.highAltitudeLimitFps, envelope.g])
    if (!Number.isInteger(n) || n < -32768 || n > 32767)
      throw new Error('Native envelope word out of bounds');
  if (
    !Number.isInteger(envelope.count) ||
    envelope.count < 3 ||
    envelope.count > 20 ||
    envelope.points.length < envelope.count
  )
    throw new Error('Native envelope point count out of bounds');
  if (
    !Number.isInteger(envelope.maxSpeedIndex) ||
    envelope.maxSpeedIndex < 0 ||
    envelope.maxSpeedIndex >= envelope.count
  )
    throw new Error('Native envelope maximum-speed index out of bounds');
  for (const point of envelope.points) {
    int32(point.altitudeFt);
    if (!Number.isInteger(point.speedFps) || point.speedFps < 0 || point.speedFps > 65535)
      throw new Error('Native envelope point speed out of bounds');
  }
}
export function nativeEnvelopeSpeedLimits(
  envelope: NativeEnvelope,
  context: NativeEnvelopeContext,
): {
  minimumFps: number | undefined;
  maximumFps: number | undefined;
  limitFps: number;
} {
  validate(envelope, context);
  const altitude = context.altitudeFixed >> 8;
  const points = envelope.points.slice(0, envelope.count);
  // EnvHighest walks backwards and only replaces on strict greater altitude:
  // equal-height peaks retain the LAST authored point.
  let highest = points.length - 1;
  for (let i = points.length - 2; i >= 0; i--)
    if (points[i]!.altitudeFt > points[highest]!.altitudeFt) highest = i;
  let minimumFps: number | undefined, maximumFps: number | undefined;
  if (altitude > points[highest]!.altitudeFt) {
    minimumFps = maximumFps = points[highest]!.speedFps;
  } else {
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i]!,
        b = points[i + 1]!;
      if (a.altitudeFt <= altitude && b.altitudeFt >= altitude) {
        minimumFps = nativeEnvelopeInterpolate(
          a.altitudeFt,
          a.speedFps,
          b.altitudeFt,
          b.speedFps,
          altitude,
        );
        break;
      }
    }
    if (minimumFps !== undefined && context.flaps && Math.abs(envelope.g) <= 1)
      minimumFps = (minimumFps - (minimumFps >> 2)) | 0;
    for (let i = highest; i < points.length - 1; i++) {
      const a = points[i]!,
        b = points[i + 1]!;
      if (a.altitudeFt >= altitude && b.altitudeFt <= altitude) {
        maximumFps = nativeEnvelopeInterpolate(
          a.altitudeFt,
          a.speedFps,
          b.altitudeFt,
          b.speedFps,
          altitude,
        );
        break;
      }
    }
  }
  const limitFps =
    altitude >= 36000
      ? context.highAltitudeLimitFps
      : nativeEnvelopeInterpolate(
          0,
          context.seaLevelLimitFps,
          36000,
          context.highAltitudeLimitFps,
          altitude,
        );
  return { minimumFps, maximumFps, limitFps };
}
export function nativeCheckFlightEnvelope(
  envelope: NativeEnvelope | undefined,
  context: NativeEnvelopeContext,
): {
  code: 0 | 1 | 2 | 3;
  aboveMaxSpeedPoint: boolean | undefined;
} {
  if (!envelope) return { code: 1, aboveMaxSpeedPoint: undefined };
  const limits = nativeEnvelopeSpeedLimits(envelope, context);
  if (limits.minimumFps === undefined || limits.maximumFps === undefined)
    throw new Error('Native envelope has no defined speed intersection for this altitude');
  const speed = context.speedFixed >> 8;
  const aboveMaxSpeedPoint =
    context.altitudeFixed >> 8 > envelope.points[envelope.maxSpeedIndex]!.altitudeFt;
  const code =
    speed < limits.minimumFps
      ? 1
      : speed >= limits.limitFps
        ? 3
        : speed >= limits.maximumFps
          ? 2
          : 0;
  return { code, aboveMaxSpeedPoint };
}
