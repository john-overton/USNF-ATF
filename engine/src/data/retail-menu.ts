/**
 * The menu bundle produced by `tools/menu/port-menu.ts` from a player's own
 * retail media: screen layouts recovered from `.MNU`/`.DLG` (see
 * `Docs/formats/mnu.md`), their backgrounds and button sprites as PNG, and the
 * short interface sounds as raw PCM.
 *
 * Every figure here came off a disc this code has never seen, through a Python
 * decoder that is only partly confident about the format, so nothing is
 * trusted: each parser throws on the first thing it does not recognise rather
 * than letting a malformed bundle reach the renderer or the audio graph. The
 * caps below are deliberately generous against real retail data and tight
 * against anything that would exhaust memory.
 */

/** Retail lays its screens out in a 640x480 design box; see `Docs/formats/mnu.md`. */
const DESIGN_WIDTH = 640;
const DESIGN_HEIGHT = 480;

/** Both discs together hold 186 menu files; a bundle only ever ships a handful. */
const MAX_SCREENS = 16;
const MAX_SPRITES = 32;
const MAX_SPRITE_STATES = 8;
/** The busiest observed retail screen carries well under a hundred records. */
const MAX_WIDGETS = 128;
const MAX_HASHES = 64;
const MAX_LIMITATIONS = 16;
const MAX_LIMITATION_LENGTH = 400;
const MAX_LABEL_LENGTH = 120;
const MAX_ID_LENGTH = 40;
const MAX_SOURCE_LENGTH = 64;
/** A 1024x1024 background at 8 bits is comfortably inside this. */
const MAX_PNG_BASE64 = 4_000_000;
const MAX_IMAGE_EDGE = 1024;
/** One bundle's worth of images, so a hostile file cannot blow out the heap. */
const MAX_TOTAL_PNG_BASE64 = 24_000_000;
const MAX_SOUNDS = 16;
const MAX_PCM_SAMPLES = 1_000_000;

export interface RetailMenuImage {
  source: string;
  width: number;
  height: number;
  pngBase64: string;
}

export interface RetailMenuWidget {
  /** The imported `main.dll` draw routine, e.g. `_DrawAction`, or `(host-supplied)`. */
  type: string;
  x: number;
  y: number;
  width: number;
  /** The id the retail handler receives when the widget fires. */
  command: number | null;
  label: string | null;
}

export interface RetailMenuScreen {
  source: string;
  rect: { x: number; y: number; width: number; height: number };
  background?: RetailMenuImage;
  widgets: RetailMenuWidget[];
}

export interface RetailMenuSpriteState {
  state: string;
  image: RetailMenuImage;
}

export interface RetailMenuBundle {
  version: 1;
  source: { game: 'usnf97' | 'atf-gold'; sha256: Record<string, string> };
  screens: Record<string, RetailMenuScreen>;
  sprites: Record<string, RetailMenuSpriteState[]>;
  /** What the decoder could not recover, carried through so the UI can say so. */
  limitations: string[];
}

export type UiSound =
  'click' | 'button' | 'toggle' | 'reject' | 'arm-weapon' | 'arm-rounds' | 'fuel';

export const UI_SOUNDS: readonly UiSound[] = [
  'click',
  'button',
  'toggle',
  'reject',
  'arm-weapon',
  'arm-rounds',
  'fuel',
];

const GAMES = ['usnf97', 'atf-gold'] as const;
const SPRITE_STATES = ['normal', 'hover', 'pressed', 'default', 'disabled'] as const;

export interface RetailMenuClip {
  source: string;
  sha256: string;
  encoding: 'unsigned8-mono';
  sampleRate: 5512 | 8000 | 11025;
  pcm: number[];
}

export interface RetailMenuSounds {
  version: 1;
  source: { game: 'usnf97' | 'atf-gold' };
  sounds: Partial<Record<UiSound, RetailMenuClip>>;
  /** Optional original title theme, reused as menu music. */
  music?: RetailMenuClip;
}

const bad = (reason: string): never => {
  throw new Error(`Invalid retail menu bundle: ${reason}`);
};

const isSha256 = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

const isInteger = (value: unknown, low: number, high: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= low && value <= high;

const isName = (value: unknown, limit: number): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= limit;

const isOneOf = <T extends string>(list: readonly T[], value: unknown): value is T =>
  typeof value === 'string' && (list as readonly string[]).includes(value);

const isId = (value: string): boolean =>
  value.length <= MAX_ID_LENGTH && /^[a-z0-9-]+$/.test(value);

/** Labels are drawn straight into the UI, so no control characters get through. */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Node and the browser disagree about base64; the engine runs in both. */
function decodeBase64(base64: string): string {
  if (typeof atob === 'function') return atob(base64);
  return Buffer.from(base64, 'base64').toString('binary');
}

/**
 * Structural check only, in the spirit of `RetailCockpit.ts`: the signature
 * proves it is a PNG and the header dimensions prove the manifest is not lying
 * about how large the decoded image will be. Inflation stays the browser's job.
 */
function validateMenuPng(pngBase64: string, width: number, height: number): void {
  if (
    typeof pngBase64 !== 'string' ||
    pngBase64.length === 0 ||
    pngBase64.length > MAX_PNG_BASE64 ||
    pngBase64.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(pngBase64)
  )
    bad('image is not bounded base64');
  const bytes = decodeBase64(pngBase64);
  if (bytes.length < 33 || !bytes.startsWith('\x89PNG\r\n\x1a\n') || bytes.slice(12, 16) !== 'IHDR')
    bad('image is not a PNG');
  const dimension = (offset: number) =>
    bytes.charCodeAt(offset) * 0x1000000 +
    (bytes.charCodeAt(offset + 1) << 16) +
    (bytes.charCodeAt(offset + 2) << 8) +
    bytes.charCodeAt(offset + 3);
  if (dimension(16) !== width || dimension(20) !== height)
    bad('PNG dimensions differ from the manifest');
}

function parseImage(value: unknown, where: string): RetailMenuImage {
  const image = value as RetailMenuImage;
  if (!isRecord(value)) bad(`${where} image`);
  if (!isName(image.source, MAX_SOURCE_LENGTH)) bad(`${where} image source`);
  if (!isInteger(image.width, 1, MAX_IMAGE_EDGE) || !isInteger(image.height, 1, MAX_IMAGE_EDGE))
    bad(`${where} image size`);
  validateMenuPng(image.pngBase64, image.width, image.height);
  return image;
}

function parseWidget(value: unknown, where: string): void {
  const widget = value as RetailMenuWidget;
  if (!isRecord(value)) bad(`${where} widget`);
  if (!isName(widget.type, MAX_ID_LENGTH)) bad(`${where} widget class`);
  // Retail records place widgets relative to the dialog rect and a few sit off
  // it; the bounds only need to keep the numbers sane.
  if (!isInteger(widget.x, -1024, 4096) || !isInteger(widget.y, -1024, 4096))
    bad(`${where} widget position`);
  if (!isInteger(widget.width, 0, DESIGN_WIDTH)) bad(`${where} widget width`);
  if (widget.command !== null && !isInteger(widget.command, 0, 255)) bad(`${where} widget command`);
  if (widget.label !== null) {
    if (typeof widget.label !== 'string' || widget.label.length > MAX_LABEL_LENGTH)
      bad(`${where} widget label`);
    if (CONTROL_CHARACTERS.test(widget.label)) bad(`${where} widget label characters`);
  }
}

function parseScreen(value: unknown, key: string): RetailMenuScreen {
  const screen = value as RetailMenuScreen;
  if (!isRecord(value)) bad(`screen ${key}`);
  if (!isName(screen.source, MAX_SOURCE_LENGTH)) bad(`screen ${key} source`);
  const rect = screen.rect;
  if (
    !isRecord(rect) ||
    !isInteger(rect.x, 0, DESIGN_WIDTH) ||
    !isInteger(rect.y, 0, DESIGN_HEIGHT) ||
    !isInteger(rect.width, 1, DESIGN_WIDTH) ||
    !isInteger(rect.height, 1, DESIGN_HEIGHT) ||
    rect.x + rect.width > DESIGN_WIDTH ||
    rect.y + rect.height > DESIGN_HEIGHT
  )
    bad(`screen ${key} rect`);
  if (screen.background !== undefined) parseImage(screen.background, `screen ${key}`);
  if (!Array.isArray(screen.widgets) || screen.widgets.length > MAX_WIDGETS)
    bad(`screen ${key} widgets`);
  for (const widget of screen.widgets) parseWidget(widget, `screen ${key}`);
  return screen;
}

function parseSprite(value: unknown, key: string): RetailMenuSpriteState[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_SPRITE_STATES)
    bad(`sprite ${key}`);
  const states = value as RetailMenuSpriteState[];
  const seen = new Set<string>();
  for (const entry of states) {
    if (!isRecord(entry)) bad(`sprite ${key} state`);
    if (!isOneOf(SPRITE_STATES, entry.state)) bad(`sprite ${key} state ${String(entry.state)}`);
    if (seen.has(entry.state)) bad(`sprite ${key} repeats state ${entry.state}`);
    seen.add(entry.state);
    parseImage(entry.image, `sprite ${key}`);
  }
  return states;
}

export function parseRetailMenu(value: unknown): RetailMenuBundle {
  const bundle = value as RetailMenuBundle;
  if (!isRecord(value)) bad('not an object');
  if (bundle.version !== 1) bad('version');
  const source = bundle.source;
  if (!isRecord(source) || !isOneOf(GAMES, source.game)) bad('game');
  if (!isRecord(source.sha256)) bad('source hashes');
  const hashes = Object.entries(source.sha256);
  if (hashes.length > MAX_HASHES) bad('too many source hashes');
  for (const [file, hash] of hashes) {
    if (!isName(file, MAX_SOURCE_LENGTH) || !isSha256(hash)) bad(`source hash for ${file}`);
  }

  if (!isRecord(bundle.screens)) bad('screens');
  const screens = Object.entries(bundle.screens);
  if (screens.length > MAX_SCREENS) bad('too many screens');
  for (const [key, screen] of screens) {
    if (!isId(key)) bad(`screen id ${key}`);
    parseScreen(screen, key);
  }

  if (!isRecord(bundle.sprites)) bad('sprites');
  const sprites = Object.entries(bundle.sprites);
  if (sprites.length > MAX_SPRITES) bad('too many sprites');
  for (const [key, sprite] of sprites) {
    if (!isId(key)) bad(`sprite id ${key}`);
    parseSprite(sprite, key);
  }

  if (
    !Array.isArray(bundle.limitations) ||
    bundle.limitations.length > MAX_LIMITATIONS ||
    !bundle.limitations.every((n) => typeof n === 'string' && n.length <= MAX_LIMITATION_LENGTH)
  )
    bad('limitations');

  // Each image is capped on its own; this is the cap on all of them together.
  let total = 0;
  for (const [, screen] of screens) total += screen.background?.pngBase64.length ?? 0;
  for (const [, sprite] of sprites)
    for (const state of sprite) total += state.image.pngBase64.length;
  if (total > MAX_TOTAL_PNG_BASE64) bad('image budget exceeded');

  return bundle;
}

export function parseRetailMenuSounds(value: unknown): RetailMenuSounds {
  const manifest = value as RetailMenuSounds;
  if (!isRecord(value)) bad('sounds are not an object');
  if (manifest.version !== 1) bad('sounds version');
  if (!isRecord(manifest.source) || !isOneOf(GAMES, manifest.source.game)) bad('sounds game');
  if (!isRecord(manifest.sounds)) bad('sounds');
  const clips: [string, RetailMenuClip][] = Object.entries(manifest.sounds);
  if (clips.length > MAX_SOUNDS) bad('too many sounds');
  for (const [key] of clips) if (!isOneOf(UI_SOUNDS, key)) bad(`unknown sound ${key}`);
  if (manifest.music !== undefined) clips.push(['music', manifest.music]);
  for (const [key, clip] of clips) {
    if (!isRecord(clip)) bad(`sound ${key}`);
    if (!isName(clip.source, MAX_SOURCE_LENGTH) || !isSha256(clip.sha256))
      bad(`sound ${key} identity`);
    if (clip.encoding !== 'unsigned8-mono') bad(`sound ${key} encoding`);
    if (![5512, 8000, 11025].includes(clip.sampleRate)) bad(`sound ${key} sample rate`);
    if (!Array.isArray(clip.pcm) || clip.pcm.length < 2 || clip.pcm.length > MAX_PCM_SAMPLES)
      bad(`sound ${key} length`);
    if (!clip.pcm.every((n) => isInteger(n, 0, 255))) bad(`sound ${key} samples`);
  }
  return manifest;
}
