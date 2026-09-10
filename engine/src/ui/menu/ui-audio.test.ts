import { afterEach, expect, test } from 'bun:test';

import { FlightAudio } from '../../flight/FlightAudio';
import { muteControl } from '../../flight/mute';
import { UI_SOUNDS, UiAudio, type UiClips, type UiSound } from './UiAudio';

/** Bun has no DOM; stub only the surface the audio services touch, the way
 * `platform/browser.test.ts` stubs localStorage. */
type Listener = (event: unknown) => void;
const originals = new Map<string, PropertyDescriptor | undefined>();
function install(name: string, value: unknown): void {
  if (!originals.has(name)) originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
afterEach(() => {
  for (const [name, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
  originals.clear();
  if (muteControl.muted) muteControl.toggle();
});

class StubElement {
  isContentEditable = false;
  constructor(private readonly tag: string) {}
  closest(selector: string): StubElement | null {
    return selector.includes(this.tag) ? this : null;
  }
}

interface StubSource {
  buffer: unknown;
  started: boolean;
  stopped?: boolean;
  loop?: boolean;
}
interface StubContext {
  state: AudioContextState;
  sources: StubSource[];
}
let live: StubContext | undefined;
let created = 0;

/** `new AudioContext()` returns this object because a constructor returning an
 * object wins over the instance, which keeps the stub a plain factory. */
function createStubContext(): StubContext {
  created++;
  const node = (): Record<string, unknown> => ({
    gain: { value: 0, setTargetAtTime: () => undefined },
    connect: (next: unknown) => next,
    disconnect: () => undefined,
  });
  const context = {
    state: 'running' as AudioContextState,
    sampleRate: 48000,
    currentTime: 0,
    destination: {},
    sources: [] as StubSource[],
    createGain: () => node(),
    createBuffer: (_channels: number, length: number) => {
      const data = new Float32Array(length);
      return { length, getChannelData: () => data };
    },
    createBufferSource: () => {
      const source: StubSource & Record<string, unknown> = {
        buffer: undefined,
        started: false,
        loop: false,
        connect: (next: unknown) => next,
        disconnect: () => undefined,
        start: () => {
          source.started = true;
        },
        stop: () => {
          source.stopped = true;
        },
      };
      context.sources.push(source);
      return source;
    },
    resume: () => Promise.resolve(),
    close: () => {
      context.state = 'closed';
      return Promise.resolve();
    },
  };
  live = context;
  return context;
}

const listeners = new Map<string, Set<Listener>>();
function installWindow(): void {
  listeners.clear();
  live = undefined;
  created = 0;
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
  install('HTMLElement', StubElement);
  install('AudioContext', createStubContext);
}
function dispatch(type: string, event: Record<string, unknown>): void {
  for (const listener of [...(listeners.get(type) ?? [])])
    listener({ type, isTrusted: true, preventDefault: () => undefined, ...event });
}
const gesture = (): void => {
  dispatch('pointerdown', {});
};
const pressM = (target: unknown = null): void => {
  dispatch('keydown', { code: 'KeyM', target });
};

/** A short ramp is enough to survive the DC removal and endpoint fades. */
function clip(sampleRate: 5512 | 8000 | 11025 = 11025): { sampleRate: number; pcm: number[] } {
  return { sampleRate, pcm: Array.from({ length: 64 }, (_, i) => 100 + (i % 32)) };
}
const allClips = (): UiClips => Object.fromEntries(UI_SOUNDS.map((name) => [name, clip()]));

test('title music loops once across gestures, shares mute, and stops on disposal', () => {
  installWindow();
  const audio = new UiAudio(allClips(), clip());
  expect(created).toBe(1);
  const context = live!;
  const music = context.sources[0]!;
  expect(music.started).toBe(true);
  expect(music.loop).toBe(true);
  gesture();
  gesture();
  expect(context.sources).toHaveLength(1);
  pressM();
  expect(audio.diagnostics().muted).toBe(true);
  audio.dispose();
  expect(music.stopped).toBe(true);
  expect(context.state).toBe('closed');
});

test('play is a silent no-op before a gesture and with no clips installed', () => {
  installWindow();
  const audio = new UiAudio(allClips());
  audio.play('click');
  expect(created).toBe(0);
  expect(audio.diagnostics().contextState).toBe('locked');
  expect(audio.diagnostics().lastPlayed).toBeUndefined();
  gesture();
  audio.play('click');
  expect(audio.diagnostics().contextState).toBe('running');
  audio.dispose();

  const silent = new UiAudio();
  gesture();
  silent.play('button');
  expect(silent.diagnostics().loaded).toEqual([]);
  expect(silent.diagnostics().lastPlayed).toBeUndefined();
  expect(live?.sources.length).toBe(0);
  silent.dispose();
});

test('every UiSound name plays its own clip, and unbundled names stay silent', () => {
  installWindow();
  const audio = new UiAudio({ click: clip(5512), toggle: clip(8000), fuel: clip() });
  gesture();
  expect(audio.diagnostics().loaded).toEqual(['click', 'toggle', 'fuel']);
  const buffers = new Map<UiSound, unknown>();
  for (const name of UI_SOUNDS) {
    const before = live?.sources.length ?? 0;
    audio.play(name);
    const source = live?.sources[before];
    if (audio.diagnostics().loaded.includes(name)) {
      expect(source?.started).toBe(true);
      buffers.set(name, source?.buffer);
    } else {
      expect(source).toBeUndefined();
      expect(audio.diagnostics().lastPlayed).not.toBe(name);
    }
  }
  expect(new Set(buffers.values()).size).toBe(3);
  audio.dispose();
});

test('rejects clips outside the retail PCM constraints rather than trusting the bundle', () => {
  installWindow();
  const audio = new UiAudio({
    click: { sampleRate: 22050, pcm: [1, 2] },
    button: { sampleRate: 11025, pcm: [0, 256] },
    toggle: { sampleRate: 11025, pcm: [5] },
    fuel: clip(),
  });
  expect(audio.diagnostics().loaded).toEqual(['fuel']);
  audio.dispose();
});

test('M toggles mute for menu and flight audio together, ignoring form elements', () => {
  installWindow();
  const ui = new UiAudio(allClips());
  const flight = new FlightAudio();
  gesture();
  expect(ui.diagnostics().muted).toBe(false);

  const field = new StubElement('input');
  pressM(field);
  expect(ui.diagnostics().muted).toBe(false);
  const editable = new StubElement('div');
  editable.isContentEditable = true;
  pressM(editable);
  expect(ui.diagnostics().muted).toBe(false);

  pressM();
  expect(ui.diagnostics().muted).toBe(true);
  expect(flight.diagnostics().muted).toBe(true);
  const before = live?.sources.length ?? 0;
  ui.play('click');
  expect(live?.sources.length).toBe(before);

  pressM();
  expect(ui.diagnostics().muted).toBe(false);
  expect(flight.diagnostics().muted).toBe(false);
  pressM(new StubElement('button'));
  expect(ui.diagnostics().muted).toBe(true);
  expect(flight.diagnostics().muted).toBe(true);
  ui.dispose();
  flight.dispose();
});

test('the M listener is registered once for both services and released on dispose', () => {
  installWindow();
  const ui = new UiAudio();
  const flight = new FlightAudio();
  expect(listeners.get('keydown')?.size).toBe(3); // one shared mute, one gesture each
  ui.dispose();
  flight.dispose();
  expect(listeners.get('keydown')?.size).toBe(0);
  // A later subscriber re-registers it and still sees the retained state.
  const again = new UiAudio();
  expect(listeners.get('keydown')?.size).toBe(2);
  again.dispose();
});
