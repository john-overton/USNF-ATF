import { afterEach, expect, test } from 'bun:test';
import {
  FlightMusic,
  MUSIC_SITUATIONS,
  MusicSituationState,
  parseFlightMusic,
  musicChannelState,
  musicNoteDuration,
  musicLimitations,
  type MusicChannelEvent,
  type MusicTrack,
  type FlightMusicInput,
} from './FlightMusic';
import { muteControl } from './mute';
import type { Platform } from '../platform/Platform';

const input = (steps: number, patch: Partial<FlightMusicInput> = {}): FlightMusicInput => ({
  steps,
  outcome: 'active',
  damagePercent: 0,
  contacts: 0,
  underFire: false,
  grounded: false,
  ...patch,
});
const manifest = () => ({
  version: 1,
  source: 'retail-xmi',
  tracks: Object.fromEntries(
    MUSIC_SITUATIONS.map((s) => [
      s,
      {
        name: s,
        sourceSha256: 'a'.repeat(64),
        durationSeconds: 2,
        notes: [
          { timeSeconds: 0, durationSeconds: 0.5, note: 60, velocity: 80, channel: 0, program: 48 },
          { timeSeconds: 1, durationSeconds: 0.5, note: 64, velocity: 80, channel: 0, program: 48 },
        ],
      },
    ]),
  ),
});

test('music transitions escalate immediately, hold exits three seconds, and latch terminal outcome', () => {
  const state = new MusicSituationState();
  expect(state.update(input(0))).toBe('cruise');
  expect(state.update(input(1, { contacts: 1 }))).toBe('combat');
  expect(state.update(input(2))).toBe('combat');
  expect(state.update(input(361))).toBe('combat');
  expect(state.update(input(362))).toBe('cruise');
  expect(state.update(input(363, { underFire: true, grounded: true }))).toBe('danger');
  expect(state.update(input(364, { contacts: 1 }))).toBe('danger');
  expect(state.update(input(500, { underFire: true }))).toBe('danger');
  expect(state.update(input(501, { contacts: 1 }))).toBe('danger');
  expect(state.update(input(860, { contacts: 1 }))).toBe('danger');
  expect(state.update(input(861, { contacts: 1 }))).toBe('combat');
  expect(state.update(input(862, { damagePercent: 60 }))).toBe('danger');
  expect(state.update(input(863, { outcome: 'victory' }))).toBe('victory');
  expect(state.update(input(864, { outcome: 'defeat' }))).toBe('victory');
  expect(new MusicSituationState().update(input(0, { outcome: 'defeat' }))).toBe('defeat');
});

test('retail note parser validates every situation, numbers, attribution, duration and total budget', () => {
  expect(parseFlightMusic(manifest()).tracks.combat.notes).toHaveLength(2);
  for (const patch of [{ version: 2 }, { source: 'unknown' }, { tracks: {} }])
    expect(() => parseFlightMusic({ ...manifest(), ...patch })).toThrow();
  for (const patch of [
    { timeSeconds: NaN },
    { durationSeconds: 3 },
    { velocity: 128 },
    { note: 3.5 },
    { channel: 16 },
    { program: -1 },
  ]) {
    const data = manifest();
    Object.assign(data.tracks.cruise!.notes[0]!, patch);
    expect(() => parseFlightMusic(data)).toThrow();
  }
  for (const patch of [{ sourceSha256: 'bad' }, { durationSeconds: 601 }, { notes: [] }]) {
    const data = manifest();
    Object.assign(data.tracks.cruise!, patch);
    expect(() => parseFlightMusic(data)).toThrow();
  }
  const huge = manifest();
  huge.tracks.cruise!.notes = Array.from({ length: 20001 }, () => huge.tracks.combat!.notes[0]!);
  expect(() => parseFlightMusic(huge)).toThrow();
});

const originals = new Map<string, PropertyDescriptor | undefined>();
const owners: FlightMusic[] = [];
function install(name: string, value: unknown): void {
  originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
afterEach(() => {
  owners.splice(0).forEach((m) => m.dispose());
  if (muteControl.muted) muteControl.toggle();
  for (const [name, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
  originals.clear();
});
function fixture(imported = true) {
  type Listener = (event: unknown) => void;
  const listeners = new Map<string, Set<Listener>>();
  const param = () => ({
    value: 0,
    setValueAtTime: () => undefined,
    setTargetAtTime: () => undefined,
    linearRampToValueAtTime: () => undefined,
    exponentialRampToValueAtTime: () => undefined,
    cancelScheduledValues: () => undefined,
  });
  const node = () => ({ connect: (next: unknown) => next, disconnect: () => undefined });
  const sources: { stops: number[]; onended: (() => void) | null }[] = [];
  const bufferStarts: number[] = [];
  const context = {
    state: 'running',
    currentTime: 0,
    destination: {},
    createGain: () => ({ ...node(), gain: param() }),
    createStereoPanner: () => ({ ...node(), pan: param() }),
    decodeAudioData: () => Promise.resolve({ duration: 3, numberOfChannels: 2 }),
    createBufferSource: () => {
      const source = {
        ...node(),
        buffer: undefined,
        onended: null as (() => void) | null,
        stops: [] as number[],
        start: (_at: number, offset: number) => bufferStarts.push(offset),
        stop: (at: number) => {
          source.stops.push(at);
        },
      };
      sources.push(source);
      return source;
    },
    createOscillator: () => {
      const source = {
        ...node(),
        frequency: param(),
        type: 'sine',
        onended: null as (() => void) | null,
        stops: [] as number[],
        start: () => undefined,
        stop: (at: number) => {
          source.stops.push(at);
        },
      };
      sources.push(source);
      return source;
    },
    suspend: () => {
      context.state = 'suspended';
      return Promise.resolve();
    },
    resume: () => {
      context.state = 'running';
      return Promise.resolve();
    },
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
  const music = new FlightMusic(imported ? parseFlightMusic(manifest()) : undefined);
  owners.push(music);
  return {
    music,
    sources,
    bufferStarts,
    context,
    listeners,
    gesture: (isTrusted = true) => {
      for (const listener of listeners.get('pointerdown') ?? [])
        listener({ type: 'pointerdown', isTrusted });
    },
  };
}

test('baked playback seeks on unmute, pauses, loops, resets and transitions without layering oscillators', async () => {
  const f = fixture();
  f.music.dispose();
  const bytes = new Uint8Array(44).fill(1);
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (v) =>
    v.toString(16).padStart(2, '0'),
  ).join('');
  const baked = {
    version: 1,
    rendering: 'fluidsynth-user-bank',
    tracks: {
      ['a'.repeat(64)]: {
        name: 'AIR01.XMI',
        wavSha256: hash,
        bankSha256: 'b'.repeat(64),
        bytes: 44,
        durationSeconds: 2,
        renderedSeconds: 3,
        limitations: [],
      },
    },
  };
  const platform = {
    fs: {
      exists: () => Promise.resolve(true),
      readText: (_r: unknown, p: string) =>
        Promise.resolve(JSON.stringify(p.endsWith('flight-music.json') ? manifest() : baked)),
      readBytes: () => Promise.resolve(bytes),
    },
  } as unknown as Platform;
  const music = await FlightMusic.load(platform);
  owners.push(music);
  f.gesture();
  music.update(input(0));
  expect(music.diagnostics().played).toBe(0);
  music.update(input(36));
  expect(music.diagnostics().playheadSeconds).toBe(0);
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
  music.update(input(36));
  expect(f.bufferStarts).toEqual([0]);
  expect(music.diagnostics().voices).toBe(1);
  expect(music.diagnostics().rendering).toBe('FluidSynth user-bank baked audio');
  music.update(input(48));
  expect(f.bufferStarts).toHaveLength(1);
  music.setPaused(true);
  music.update(input(48));
  expect(f.context.state).toBe('suspended');
  music.setPaused(false);
  expect(f.bufferStarts).toHaveLength(1);
  muteControl.toggle();
  expect(music.diagnostics().voices).toBe(0);
  music.update(input(120));
  muteControl.toggle();
  music.update(input(120));
  expect(f.bufferStarts.at(-1)).toBeCloseTo(0.7);
  music.update(input(288));
  expect(f.bufferStarts.at(-1)).toBeCloseTo(0.1);
  music.update(input(300, { outcome: 'defeat' }));
  expect(f.bufferStarts.at(-1)).toBe(0);
  music.setEnabled(false);
  expect(music.diagnostics().voices).toBe(0);
  music.setEnabled(true);
  music.update(input(312, { outcome: 'defeat' }));
  expect(f.bufferStarts.at(-1)).toBeCloseTo(0.1);
  music.reset();
  music.update(input(0));
  expect(f.bufferStarts.at(-1)).toBe(0);
  music.dispose();
  expect(music.diagnostics().voices).toBe(0);
});

test('trusted unlock, bounded lookahead, deduplication and pause preserve the music playhead', () => {
  const { music, gesture, sources, context } = fixture();
  music.update(input(0));
  gesture(false);
  expect(music.diagnostics().contextState).toBe('locked');
  gesture();
  music.update(input(0));
  music.update(input(0));
  expect(sources).toHaveLength(1);
  music.update(input(60));
  const before = music.diagnostics().playheadSeconds;
  music.setPaused(true);
  expect(context.state).toBe('suspended');
  music.update(input(60));
  expect(music.diagnostics().playheadSeconds).toBe(before);
  expect(sources[0]!.stops).toHaveLength(1);
  music.setPaused(false);
  expect(context.state).toBe('running');
  music.update(input(108));
  expect(sources).toHaveLength(2);
  expect(music.diagnostics().source).toBe('retail-xmi');
});

test('music disable/mute stop voices; reset and disposal clean scheduler and listeners', () => {
  const { music, gesture, sources, context, listeners } = fixture(false);
  gesture();
  music.update(input(0));
  expect(music.diagnostics().source).toBe('original-composition');
  expect(sources).toHaveLength(2);
  music.setEnabled(false);
  expect(music.diagnostics().voices).toBe(0);
  music.update(input(120));
  expect(sources).toHaveLength(2);
  music.setEnabled(true);
  music.update(input(120));
  expect(music.diagnostics().voices).toBe(2);
  muteControl.toggle();
  expect(music.diagnostics().voices).toBe(0);
  music.update(input(240));
  muteControl.toggle();
  music.update(input(240));
  expect(music.diagnostics().voices).toBe(2);
  music.reset();
  expect(music.diagnostics().playheadSeconds).toBe(0);
  expect(music.diagnostics().played).toBe(0);
  music.update(input(0));
  expect(music.diagnostics().played).toBe(2);
  music.dispose();
  expect(context.state).toBe('closed');
  expect([...listeners.values()].every((set) => set.size === 0)).toBe(true);
  expect(music.diagnostics().voices).toBe(0);
});

test('dense imported chords cannot exceed 32 active oscillators or replay within one window', () => {
  const f = fixture();
  // Replace with a separately validated dense track, using the same fake context.
  f.music.dispose();
  const data = manifest();
  data.tracks.cruise!.notes = Array.from({ length: 100 }, () => ({
    ...data.tracks.cruise!.notes[0]!,
  }));
  const music = new FlightMusic(parseFlightMusic(data));
  owners.push(music);
  f.gesture();
  music.update(input(0));
  music.update(input(0));
  expect(music.diagnostics().voices).toBe(32);
  expect(music.diagnostics().played).toBe(32);
});

test('N toggles disabled music back on; editing/modifier/repeat keys do not toggle', () => {
  const { music, listeners, context } = fixture();
  class Element {
    isContentEditable = false;
    closest() {
      return this;
    }
  }
  install('HTMLElement', Element);
  const key = (patch: Record<string, unknown> = {}) => {
    for (const listener of listeners.get('keydown') ?? [])
      listener({
        type: 'keydown',
        code: 'KeyN',
        isTrusted: true,
        target: null,
        preventDefault: () => undefined,
        ...patch,
      });
  };
  key();
  expect(music.diagnostics().enabled).toBe(false);
  expect(music.diagnostics().contextState).toBe('locked');
  music.setPaused(true);
  music.setPaused(false);
  expect(music.diagnostics().contextState).toBe('locked');
  for (const patch of [
    { repeat: true },
    { ctrlKey: true },
    { shiftKey: true },
    { target: new Element() },
  ]) {
    key(patch);
    expect(music.diagnostics().enabled).toBe(false);
  }
  key();
  expect(music.diagnostics().enabled).toBe(true);
  expect(music.diagnostics().contextState).toBe('running');
  key();
  music.setPaused(true);
  music.setPaused(false);
  expect(context.state).toBe('suspended');
  music.setVolume(2);
  expect(music.diagnostics().volume).toBe(1);
  music.setVolume(-1);
  expect(music.diagnostics().volume).toBe(0);
  music.setVolume(NaN);
  expect(music.diagnostics().volume).toBe(0);
});

test('MUS phrase changes retain time-zero notes across fractional frame boundaries and stop', () => {
  const f = fixture();
  f.music.dispose();
  const data = manifest();
  const library = Object.fromEntries(
    ['AIR01.XMI', 'AIR02.XMI'].map((name) => [
      name,
      {
        ...data.tracks.cruise!,
        name,
        durationSeconds: 0.1,
        notes: [{ ...data.tracks.cruise!.notes[0]!, durationSeconds: 0.01 }],
        channelEvents: [
          { timeSeconds: 0, channel: 0, kind: 'controller', controller: 7, value: 80 },
        ],
      },
    ]),
  );
  const scores = Object.fromEntries(
    MUSIC_SITUATIONS.map((s) => [
      s,
      { sourceSha256: 'a'.repeat(64), code: [255, 65, 73, 82, 0, 1, 2, 252] },
    ]),
  );
  const music = new FlightMusic(parseFlightMusic({ ...data, library, scores }));
  owners.push(music);
  f.gesture();
  music.update(input(0));
  expect(music.diagnostics().played).toBe(1);
  music.update(input(13));
  expect(music.diagnostics().track).toBe('AIR02.XMI');
  expect(music.diagnostics().played).toBe(2);
  expect(music.diagnostics().playheadSeconds).toBe(0);
  music.update(input(26));
  expect(music.diagnostics().scoreFinished).toBe(true);
  music.update(input(100));
  expect(music.diagnostics().played).toBe(2);
  expect(music.diagnostics().error).toBeUndefined();
});

test('channel volume/expression, stereo pan and bend are preserved independently', () => {
  const events = [
    { timeSeconds: 0, channel: 1, kind: 'controller' as const, controller: 7, value: 127 },
    { timeSeconds: 1, channel: 1, kind: 'controller' as const, controller: 11, value: 64 },
    { timeSeconds: 1, channel: 1, kind: 'controller' as const, controller: 10, value: 0 },
    { timeSeconds: 2, channel: 1, kind: 'pitch-bend' as const, value: 0 },
  ];
  expect(musicChannelState(events, 1, 0)).toEqual({ gain: 1, pan: 0, bend: 0 });
  expect(musicChannelState(events, 1, 2)).toEqual({ gain: 64 / 127, pan: -1, bend: -2 });
  expect(musicChannelState(events, 0, 2)).toEqual({ gain: 100 / 127, pan: 0, bend: 0 });
});

const cc = (
  controller: number,
  value: number,
  timeSeconds = 0,
  channel = 0,
): MusicChannelEvent => ({ timeSeconds, channel, kind: 'controller', controller, value });

test('RPN0 sensitivity preserves order, null/NRPN exclusion, channel isolation and active bends', () => {
  const bend: MusicChannelEvent = { timeSeconds: 0, channel: 0, kind: 'pitch-bend', value: 0 };
  const events = [bend, cc(6, 12), cc(101, 0), cc(100, 0), cc(6, 12, 1), cc(38, 50, 2)];
  expect(musicChannelState(events, 0, 0).bend).toBe(-2); // Data entry before selection stays ignored.
  expect(musicChannelState(events, 0, 1).bend).toBe(-12);
  expect(musicChannelState(events, 0, 2).bend).toBe(-12.5);
  expect(musicChannelState(events, 1, 2).bend).toBe(0);
  for (const deselect of [[cc(101, 127, 3), cc(100, 127, 3)], [cc(99, 0, 3)], [cc(98, 0, 3)]])
    expect(musicChannelState([...events, ...deselect, cc(6, 1, 3)], 0, 3).bend).toBe(-12.5);
  expect(musicChannelState([...events, cc(121, 0, 3)], 0, 3).bend).toBe(0);
});

test('sustain, all notes off, reset and all sound off obey phrase bounds and channel isolation', () => {
  const track: MusicTrack = { ...parseFlightMusic(manifest()).tracks.cruise, durationSeconds: 10 };
  const note = { ...track.notes[0]!, timeSeconds: 1, durationSeconds: 2 };
  const duration = (...events: MusicChannelEvent[]) =>
    musicNoteDuration(note, { ...track, channelEvents: events });
  expect(duration()).toBe(2);
  expect(duration(cc(64, 127), cc(64, 0, 5))).toBe(4);
  expect(duration(cc(64, 127))).toBe(9);
  expect(duration(cc(64, 127, 4))).toBe(2); // Pedal after release cannot resurrect a note.
  expect(duration(cc(64, 127, 0, 1))).toBe(2);
  expect(duration(cc(64, 127), cc(121, 0, 4))).toBe(3);
  expect(duration(cc(64, 127), cc(120, 0, 2))).toBe(1);
  expect(duration(cc(123, 0, 2))).toBe(1);
  expect(duration(cc(64, 127), cc(123, 0, 2), cc(64, 0, 4))).toBe(3);
  expect(duration(cc(120, 0, 0))).toBe(2); // Earlier silence doesn't suppress a later note.
});

test('pressure and unsupported controls remain explicit instead of invented oscillator effects', () => {
  const data = manifest();
  const events: MusicChannelEvent[] = [
    cc(114, 55),
    { timeSeconds: 0, channel: 0, kind: 'channel-pressure', value: 3 },
    { timeSeconds: 0, channel: 0, kind: 'poly-pressure', value: 7, note: 60 },
  ];
  Object.assign(data.tracks.cruise!, {
    channelEvents: events,
    limitations: ['external branches unavailable'],
  });
  const track = parseFlightMusic(data).tracks.cruise;
  expect(track.channelEvents).toEqual(events);
  expect(musicLimitations(track)).toContain('CC114 preserved, not rendered by oscillator');
  expect(musicLimitations(track)).toContain(
    'channel-pressure preserved, not rendered by oscillator',
  );
  expect(musicLimitations(track)).toContain('external branches unavailable');
  events[2]!.value = 128;
  expect(() => parseFlightMusic(data)).toThrow();
  Object.assign(data.tracks.cruise!, { channelEvents: [{ ...cc(7, 100), kind: ['controller'] }] });
  expect(() => parseFlightMusic(data)).toThrow();
});
