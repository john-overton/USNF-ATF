import { afterEach, expect, spyOn, test } from 'bun:test';

import { createBrowserPlatform } from './browser';

const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
afterEach(() => {
  if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
  else Reflect.deleteProperty(globalThis, 'localStorage');
});

function installStorage() {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    },
  });
  return values;
}

test('asset writes reject, including text writes; old stored asset overrides are ignored', async () => {
  const values = installStorage();
  values.set('usnf-atf:fs:assets/hello.txt', btoa('stale override'));
  const fetchMock = spyOn(globalThis, 'fetch').mockResolvedValue(new Response('source asset'));
  try {
    const platform = createBrowserPlatform();
    expect(platform.fs.writeBytes('assets', 'hello.txt', new Uint8Array([1]))).rejects.toThrow(
      'read-only',
    );
    expect(platform.fs.writeText('assets', 'hello.txt', 'override')).rejects.toThrow('read-only');
    expect(await platform.fs.readText('assets', 'hello.txt')).toBe('source asset');
  } finally {
    fetchMock.mockRestore();
  }
});

test('writable roots round-trip independently and persist across platform instances', async () => {
  installStorage();
  const warning = spyOn(console, 'warn').mockImplementation(() => undefined);
  try {
    const first = createBrowserPlatform();
    await first.fs.writeText('appData', 'settings.json', 'settings');
    await first.fs.writeText('cache', 'settings.json', 'cached');
    const second = createBrowserPlatform();
    expect(await second.fs.readText('appData', 'settings.json')).toBe('settings');
    expect(await second.fs.readText('cache', 'settings.json')).toBe('cached');
    expect(await second.fs.exists('cache', 'missing')).toBe(false);
  } finally {
    warning.mockRestore();
  }
});
