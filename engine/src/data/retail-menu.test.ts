import { expect, test } from 'bun:test';
import {
  parseRetailMenu,
  parseRetailMenuSounds,
  type RetailMenuBundle,
  type RetailMenuImage,
  type RetailMenuSounds,
  type RetailMenuWidget,
} from './retail-menu';

const HASH = 'b'.repeat(64);

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(tag: string, body: number[]): number[] {
  const be = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  const tagged = [...tag].map((c) => c.charCodeAt(0)).concat(body);
  return [...be(body.length), ...tagged, ...be(crc32(Uint8Array.from(tagged)))];
}

/**
 * A header-only PNG, built here rather than pasted, because the parser is a
 * structural check: signature, IHDR tag and the declared size. `padding` adds
 * ignored trailing bytes so a test can make an image arbitrarily large.
 */
function png(width: number, height: number, padding = 0): string {
  const be = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  const bytes = [
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...chunk('IHDR', [...be(width), ...be(height), 8, 6, 0, 0, 0]),
    ...chunk('IEND', []),
  ];
  return Buffer.concat([Buffer.from(bytes), Buffer.alloc(padding)]).toString('base64');
}

const image = (over: Partial<RetailMenuImage> = {}): RetailMenuImage => ({
  source: 'SYNTH.PIC',
  width: 8,
  height: 4,
  pngBase64: png(8, 4),
  ...over,
});

const widget = (over: Partial<RetailMenuWidget> = {}): RetailMenuWidget => ({
  type: '_DrawAction',
  x: 10,
  y: 20,
  width: 100,
  command: 7,
  label: 'Fly',
  ...over,
});

/** Synthetic throughout: never retail bytes, per the repository's retail rules. */
function fixture(): RetailMenuBundle {
  return {
    version: 1,
    source: { game: 'usnf97', sha256: { 'SYNTH.DLG': HASH, 'SYNTH.PIC': HASH } },
    screens: {
      'main-menu': {
        source: 'SYNTH.DLG',
        rect: { x: 0, y: 0, width: 640, height: 480 },
        background: image(),
        widgets: [widget(), widget({ type: '(host-supplied)', command: null, label: null })],
      },
    },
    sprites: {
      'action-button': [
        { state: 'normal', image: image({ source: 'ACTION.PIC' }) },
        { state: 'disabled', image: image({ source: 'ACTIOD.PIC' }) },
      ],
    },
    limitations: ['Submenu flag bytes are undecoded.'],
  };
}

function sounds(): RetailMenuSounds {
  return {
    version: 1,
    source: { game: 'atf-gold' },
    sounds: {
      click: {
        source: 'CLICK.SND',
        sha256: HASH,
        encoding: 'unsigned8-mono',
        sampleRate: 11025,
        pcm: [128, 130, 126, 128],
      },
    },
  };
}

test('accepts the exporter shape and hands it back untouched', () => {
  const bundle = fixture();
  expect(parseRetailMenu(bundle)).toBe(bundle);
  const clips = sounds();
  expect(parseRetailMenuSounds(clips)).toBe(clips);
});

test('rejects every bundle the exporter should never produce', () => {
  const rejects: [string, (b: RetailMenuBundle) => void][] = [
    ['wrong version', (b) => ((b as { version: number }).version = 2)],
    ['unknown game', (b) => ((b.source as { game: string }).game = 'usnf-2000')],
    ['bad sha256', (b) => (b.source.sha256['SYNTH.DLG'] = 'not-a-hash')],
    [
      'too many screens',
      (b) => {
        for (let i = 0; i < 17; i++) b.screens[`screen-${i}`] = b.screens['main-menu']!;
      },
    ],
    ['screen id', (b) => (b.screens['Main Menu'] = b.screens['main-menu']!)],
    ['rect out of range', (b) => (b.screens['main-menu']!.rect.height = 481)],
    [
      'rect leaves the design box',
      (b) => {
        b.screens['main-menu']!.rect.x = 320;
        b.screens['main-menu']!.rect.width = 640;
      },
    ],
    [
      'too many widgets',
      (b) => (b.screens['main-menu']!.widgets = Array.from({ length: 129 }, () => widget())),
    ],
    ['bad command', (b) => (b.screens['main-menu']!.widgets[0]!.command = 256)],
    ['fractional command', (b) => (b.screens['main-menu']!.widgets[0]!.command = 1.5)],
    [
      'control characters in a label',
      (b) => (b.screens['main-menu']!.widgets[0]!.label = 'Fly\u0007'),
    ],
    ['non-base64 png', (b) => (b.screens['main-menu']!.background!.pngBase64 = 'not base64!!')],
    ['png that is not a png', (b) => (b.screens['main-menu']!.background!.pngBase64 = 'AAAA')],
    [
      'png size disagrees with the manifest',
      (b) => (b.screens['main-menu']!.background!.width = 9),
    ],
    ['oversize image', (b) => (b.screens['main-menu']!.background!.height = 1025)],
    [
      'oversize png payload',
      (b) => {
        b.screens['main-menu']!.background = image({
          width: 1,
          height: 1,
          pngBase64: png(1, 1, 3_100_000),
        });
      },
    ],
    ['unknown sprite state', (b) => (b.sprites['action-button']![0]!.state = 'glowing')],
    ['duplicate sprite state', (b) => (b.sprites['action-button']![1]!.state = 'normal')],
    [
      'too many sprites',
      (b) => {
        for (let i = 0; i < 33; i++) b.sprites[`sprite-${i}`] = b.sprites['action-button']!;
      },
    ],
    ['limitation too long', (b) => (b.limitations = ['x'.repeat(401)])],
  ];
  for (const [reason, mutate] of rejects) {
    const broken = fixture();
    mutate(broken);
    expect(() => parseRetailMenu(broken)).toThrow();
    expect(reason).toBeTruthy();
  }
});

test('rejects a bundle whose images together blow the byte budget', () => {
  const bundle = fixture();
  // Each image is well under the per-image cap; ten of them are over the
  // bundle cap, which is the limit that keeps a hostile file off the heap.
  const big = image({ width: 1, height: 1, pngBase64: png(1, 1, 2_700_000) });
  expect(big.pngBase64.length).toBeLessThan(4_000_000);
  const states = ['normal', 'hover', 'pressed', 'default', 'disabled'] as const;
  const sprite = states.map((state) => ({ state, image: big }));
  bundle.sprites['action-button'] = sprite;
  bundle.sprites['second-button'] = sprite;
  expect(() => parseRetailMenu(bundle)).toThrow('budget');
});

test('rejects sound manifests the audio graph should never see', () => {
  const rejects: [string, (s: RetailMenuSounds) => void][] = [
    ['wrong version', (s) => ((s as { version: number }).version = 2)],
    ['unknown game', (s) => ((s.source as { game: string }).game = 'usnf-2000')],
    [
      'unknown sound key',
      (s) => ((s.sounds as Record<string, unknown>).explosion = s.sounds.click),
    ],
    ['bad sha256', (s) => (s.sounds.click!.sha256 = 'not-a-hash')],
    ['bad encoding', (s) => ((s.sounds.click as { encoding: string }).encoding = 'pcm16')],
    ['bad sample rate', (s) => ((s.sounds.click as { sampleRate: number }).sampleRate = 44100)],
    ['pcm out of range', (s) => (s.sounds.click!.pcm = [128, 256])],
    ['pcm too short', (s) => (s.sounds.click!.pcm = [128])],
  ];
  for (const [reason, mutate] of rejects) {
    const broken = sounds();
    mutate(broken);
    expect(() => parseRetailMenuSounds(broken)).toThrow();
    expect(reason).toBeTruthy();
  }
});
