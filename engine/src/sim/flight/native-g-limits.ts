/** Recovered envelope-to-stick range, x86 slice 430937..430c56.
 * This limits requested G; the remaining attitude/force integration is original. */
import {
  nativeCheckFlightEnvelope,
  nativeEnvelopeSpeedLimits,
  type NativeEnvelope,
  type NativeEnvelopeContext,
} from './native-envelope';

export interface NativeGContext extends NativeEnvelopeContext {
  player: boolean;
  easier: boolean;
  skill: number;
  loadA: number;
  loadB: number;
  loadedElevator: number;
}
const word = (n: number) => (n << 16) >> 16;
const quotient = (n: number, d: number) => {
  if (!d) throw new Error('Native G interpolation division by zero');
  return Math.trunc((n | 0) / d) | 0;
};
/** LimitFromLowSpeed, 478950; bounds are excursions about neutral 1G. */
export function nativeLowSpeedGLimits(input: {
  speedFixed: number;
  minimumSpeedFps: number;
  minimumGFixed: number;
  maximumGFixed: number;
}) {
  const speed = Math.abs(input.speedFixed >> 8);
  const threshold = quotient(Math.imul(input.minimumSpeedFps, 200), 100);
  const limit = (g: number) =>
    threshold > speed ? (256 + quotient(Math.imul((g - 256) | 0, speed), threshold)) | 0 : g;
  return { minimumGFixed: limit(input.minimumGFixed), maximumGFixed: limit(input.maximumGFixed) };
}
/** GToTurn, 478b70. Degrees * 256/second, isolated from our Newtonian solver. */
export function nativeGToTurn(gFixed: number, speedFps: number): number {
  return Math.max(
    -10240,
    Math.min(10240, quotient(Math.imul(2500, word(gFixed)), word(Math.max(125, speedFps)))),
  );
}
export function nativeGLimits(envelopes: NativeEnvelope[], context: NativeGContext) {
  if (!envelopes.length) throw new Error('Native G limits require envelopes');
  const minRow = Math.min(...envelopes.map((row) => row.g));
  const maxRow = Math.max(...envelopes.map((row) => row.g));
  let minimumGFixed = 0,
    maximumGFixed = 0;
  for (const row of envelopes) {
    if (nativeCheckFlightEnvelope(row, context).code === 0) {
      minimumGFixed = Math.min(minimumGFixed, row.g * 256);
      maximumGFixed = Math.max(maximumGFixed, row.g * 256);
    }
  }
  const speed = context.speedFixed >> 8;
  const refine = (fixed: number, direction: number, last: number) => {
    const g = fixed >> 8;
    if (g === last) return fixed;
    const row = envelopes.find((row) => row.g === g);
    const next = envelopes.find((row) => row.g === g + direction);
    if (!row || !next) return fixed;
    const a = nativeEnvelopeSpeedLimits(row, context),
      b = nativeEnvelopeSpeedLimits(next, context);
    if (
      a.minimumFps === undefined ||
      a.maximumFps === undefined ||
      b.minimumFps === undefined ||
      b.maximumFps === undefined
    )
      throw new Error('Native G interpolation requires defined bounds');
    let fraction = 0;
    if (b.minimumFps >= speed) {
      if (b.minimumFps === a.minimumFps) return fixed;
      fraction = quotient((speed - a.minimumFps) << 8, b.minimumFps - a.minimumFps);
    } else if (speed >= b.maximumFps && b.maximumFps !== a.maximumFps)
      fraction = quotient((speed - a.maximumFps) << 8, b.maximumFps - a.maximumFps);
    return word(fixed + direction * fraction);
  };
  maximumGFixed = refine(maximumGFixed, 1, maxRow);
  minimumGFixed = refine(minimumGFixed, -1, minRow);
  const factor =
    100 - quotient(Math.imul(context.loadA + context.loadB, context.loadedElevator), 100);
  maximumGFixed = word(quotient(Math.imul(maximumGFixed, factor), 100));
  minimumGFixed = word(quotient(Math.imul(minimumGFixed, factor), 100));
  if (!context.player && context.skill <= 1) {
    maximumGFixed = Math.max(512, word(maximumGFixed - 256));
    minimumGFixed = Math.min(-512, word(minimumGFixed + 256));
  }
  if (context.player && context.easier) {
    maximumGFixed = Math.min(maxRow * 256, word(maximumGFixed + 256));
    minimumGFixed = Math.max(minRow * 256, word(minimumGFixed - 256));
  }
  return { minimumGFixed: Math.min(0, minimumGFixed), maximumGFixed: Math.max(512, maximumGFixed) };
}
