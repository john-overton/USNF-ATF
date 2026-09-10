import { afterEach, expect, test } from 'bun:test';
import {
  CombatAudio,
  combatSoundGain,
  combatSoundPcm,
  MAX_COMBAT_VOICES,
  parseCombatSamples,
  type CombatSamples,
} from './CombatAudio';
import { muteControl } from './mute';
import type { CombatEvent } from '../sim/combat/world';
import { GAMEPLAY_CUES, type GameplayCueInput } from './gameplay-cues';

const origin = { x: 0, y: 0, z: 0 };
const event = (
  id: number,
  type: CombatEvent['type'] = 'hit',
  cause: 'gun' | 'ground' | 'water' = 'gun',
): CombatEvent => ({
  id,
  step: id,
  type,
  cause,
  shooterId: 0,
  targetId: 1,
  point: origin,
  velocity: origin,
  attitude: { x: 0, y: 0, z: 0, w: 1 },
});

test('original combat PCM is deterministic, finite, bounded and faded at both ends', () => {
  for (const kind of ['impact', 'explosion', 'ground', 'water'] as const) {
    const pcm = combatSoundPcm(kind, 8000);
    expect(pcm).toEqual(combatSoundPcm(kind, 8000));
    expect(pcm.every((n) => Number.isFinite(n) && Math.abs(n) <= 1)).toBe(true);
    expect(pcm.some((n) => Math.abs(n) > 0.1)).toBe(true);
    expect(pcm[0]).toBe(0);
    expect(pcm[pcm.length - 1]).toBe(0);
  }
});

test('sound attenuation uses absolute listener distance with finite bounded reach', () => {
  const near = combatSoundGain('explosion', origin, origin);
  const far = combatSoundGain('explosion', origin, { x: 6000, y: 0, z: 0 });
  expect(far).toBeGreaterThan(0);
  expect(far).toBeLessThan(near);
  expect(combatSoundGain('impact', origin, { x: 3000, y: 0, z: 0 })).toBe(0);
  expect(combatSoundGain('explosion', origin, { x: NaN, y: 0, z: 0 })).toBe(0);
});

const originals = new Map<string, PropertyDescriptor | undefined>();
const owners: CombatAudio[] = [];
function install(name: string, value: unknown): void {
  originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
afterEach(() => {
  owners.splice(0).forEach((audio) => audio.dispose());
  if (muteControl.muted) muteControl.toggle();
  for (const [name, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
  originals.clear();
});
function fixture(samples?: CombatSamples) {
  type Listener = (event: unknown) => void;
  const listeners = new Map<string, Set<Listener>>();
  const node = () => ({
    gain: { value: 0, setValueAtTime: () => undefined },
    connect: (next: unknown) => next,
    disconnect: () => undefined,
  });
  const sources: { stopped: boolean; onended: (() => void) | null }[] = [];
  const context = {
    state: 'running',
    sampleRate: 8000,
    destination: {},
    currentTime: 0,
    createGain: node,
    createBuffer: (_channels: number, size: number) => ({
      getChannelData: () => new Float32Array(size),
    }),
    createBufferSource: () => {
      const source = {
        ...node(),
        buffer: undefined,
        stopped: false,
        onended: null as (() => void) | null,
        start: () => undefined,
        stop: () => {
          source.stopped = true;
        },
      };
      sources.push(source);
      return source;
    },
    resume: () => Promise.resolve(),
    close: () => {
      context.state = 'closed';
      return Promise.resolve();
    },
  };
  install('window', {
    addEventListener: (type: string, listener: Listener) => {
      const set = listeners.get(type) ?? new Set<Listener>();
      set.add(listener);
      listeners.set(type, set);
    },
    removeEventListener: (type: string, listener: Listener) => {
      listeners.get(type)?.delete(listener);
    },
  });
  install('AudioContext', function () {
    return context;
  });
  const audio = new CombatAudio(samples);
  owners.push(audio);
  return {
    audio,
    sources,
    context,
    listeners,
    gesture: (isTrusted = true) => {
      for (const listener of listeners.get('pointerdown') ?? [])
        listener({ type: 'pointerdown', isTrusted });
    },
  };
}

test('retail samples validate, reject malformed PCM, and replace synthesized buffers', () => {
  const clip = {
    source: 'SYNTHETIC.8K',
    sha256: 'a'.repeat(64),
    sampleRate: 8010,
    encoding: 'unsigned8-mono',
    pcm: [128, 0, 255, 128],
  };
  const manifest = {
    schemaVersion: 1,
    source: 'retail-pcm',
    clips: {
      impact: [clip],
      explosion: [clip],
      ground: [clip],
      water: [clip],
    },
  };
  const samples = parseCombatSamples(manifest);
  const { audio, gesture, sources } = fixture(samples);
  gesture();
  audio.update([event(0), event(1, 'destroyed')], origin);
  expect(audio.diagnostics().source).toBe('retail-pcm');
  expect(sources).toHaveLength(2);
  expect(audio.diagnostics().samples?.impact).toEqual(['SYNTHETIC.8K']);
  expect(() =>
    parseCombatSamples({ ...manifest, clips: { ...manifest.clips, impact: [] } }),
  ).toThrow();
  expect(() =>
    parseCombatSamples({
      ...manifest,
      clips: { ...manifest.clips, impact: [{ ...clip, pcm: [128, 256] }] },
    }),
  ).toThrow();
});

test('locked events never replay after unlock; rolling retained events play only once', () => {
  const { audio, gesture, sources } = fixture();
  audio.update([event(0)], origin);
  gesture(false);
  expect(audio.diagnostics().contextState).toBe('locked');
  gesture();
  audio.update([event(0), event(1)], origin);
  audio.update([event(0), event(1)], origin);
  expect(sources.length).toBe(1);
  expect(audio.diagnostics().played).toBe(1);
  audio.update([event(2, 'destroyed', 'ground')], origin);
  expect(audio.diagnostics().lastPlayed).toBe('ground');
  audio.update([event(3, 'terrain')], origin);
  expect(audio.diagnostics().played).toBe(2);
});

test('pause and mute stop active sounds immediately and consume inaudible events', () => {
  const { audio, gesture, sources } = fixture();
  gesture();
  audio.update([event(0, 'destroyed')], origin);
  audio.setPaused(true);
  expect(sources[0]!.stopped).toBe(true);
  expect(audio.diagnostics().voices).toBe(0);
  audio.update([event(1)], origin);
  audio.setPaused(false);
  audio.update([event(1)], origin);
  expect(sources.length).toBe(1);
  audio.update([event(2)], origin);
  muteControl.toggle();
  expect(sources[1]!.stopped).toBe(true);
  audio.update([event(3)], origin);
  muteControl.toggle();
  audio.update([event(3)], origin);
  expect(sources.length).toBe(2);
});

test('voices are bounded, ended nodes retire, reset accepts new ids, dispose releases listeners', () => {
  const { audio, gesture, sources, context, listeners } = fixture();
  gesture();
  audio.update(
    Array.from({ length: 25 }, (_, i) => event(i)),
    origin,
  );
  expect(audio.diagnostics().voices).toBe(MAX_COMBAT_VOICES);
  expect(sources.filter((source) => source.stopped)).toHaveLength(25 - MAX_COMBAT_VOICES);
  sources[24]!.onended?.();
  expect(audio.diagnostics().voices).toBe(MAX_COMBAT_VOICES - 1);
  audio.reset();
  expect(audio.diagnostics().voices).toBe(0);
  expect(audio.diagnostics().played).toBe(0);
  audio.update([event(0, 'destroyed', 'water')], origin);
  expect(audio.diagnostics().lastPlayed).toBe('water');
  audio.dispose();
  expect(context.state).toBe('closed');
  expect([...listeners.values()].every((set) => set.size === 0)).toBe(true);
  audio.update([event(1)], origin);
  expect(audio.diagnostics().voices).toBe(0);
});

test('optional gameplay clips consume muted edges, serialize speech and preserve nearby impacts', () => {
  const clip = {
    source: 'synthetic.5K',
    sha256: 'a'.repeat(64),
    sampleRate: 5512,
    encoding: 'unsigned8-mono',
    pcm: [128, 0, 255, 128],
  };
  const samples = parseCombatSamples({
    schemaVersion: 1,
    source: 'retail-pcm',
    clips: Object.fromEntries(
      ['impact', 'explosion', 'ground', 'water', ...GAMEPLAY_CUES].map((kind) => [kind, [clip]]),
    ),
  });
  const { audio, gesture, sources } = fixture(samples);
  const input: GameplayCueInput = {
    step: 1,
    status: 'airborne',
    destroyed: false,
    stalled: false,
    fuelKg: 10,
    gearDown: false,
    flapsDown: false,
    hookDown: false,
    damage: 0,
  };
  audio.updateGameplay(input);
  gesture();
  audio.updateGameplay({ ...input, step: 2, damage: 1 });
  expect(audio.diagnostics().cueCounts.playerHit).toBe(1);
  audio.updateGameplay({ ...input, step: 3, damage: 1, fuelKg: 0 });
  expect(audio.diagnostics().cueCounts.outOfFuel).toBeUndefined(); // Busy speech is dropped, never queued.
  sources[0]!.onended?.();
  muteControl.toggle();
  const gear = { ...input, step: 4, gearDown: true, damage: 1, fuelKg: 0 };
  audio.updateGameplay(gear);
  muteControl.toggle();
  audio.updateGameplay(gear);
  expect(audio.diagnostics().cueCounts.gearDown).toBeUndefined();
  audio.update(
    [
      { ...event(1, 'terrain', 'ground'), point: { x: 5000, y: 0, z: 0 }, step: 10 },
      { ...event(2, 'terrain', 'water'), step: 10 },
    ],
    origin,
  );
  expect(audio.diagnostics().cueCounts.terrainWater).toBe(1);
  expect(audio.diagnostics().cueCounts.terrainGround).toBeUndefined();
  audio.reset();
  expect(audio.diagnostics().cueCounts).toEqual({});
  audio.updateGameplay(gear);
  expect(audio.diagnostics().played).toBe(0);
  audio.update([{ ...event(3, 'destroyed'), shooterId: 1, targetId: 0 }], origin);
  expect(audio.diagnostics().cueCounts.playerKill).toBeUndefined();
  audio.update([event(4, 'destroyed')], origin);
  expect(audio.diagnostics().cueCounts.playerKill).toBe(1);
  audio.reset();
  audio.updateGameplay({ ...gear, destroyed: true });
  audio.update([event(5, 'destroyed')], origin);
  expect(audio.diagnostics().cueCounts.playerKill).toBeUndefined();
});
