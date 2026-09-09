/**
 * Browser dev implementation of the platform interface. Reads come from the Vite dev
 * server (`engine/public/dev-root` is served at `/dev-root/`). Writes are kept in
 * memory and mirrored to localStorage on a best-effort basis; they do not survive a
 * cleared origin and are not a substitute for the Electron shell.
 */
import type { FsRoot, Platform, PowerState, ShellDescription, Unsubscribe } from './Platform';

const STORAGE_PREFIX = 'usnf-atf:fs:';

function key(root: FsRoot, relPath: string): string {
  return `${root}/${relPath.replace(/^\/+/, '')}`;
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function base64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function createBrowserPlatform(baseUrl = '/dev-root/'): Platform {
  const memory = new Map<string, Uint8Array>();
  let warnedAboutWrites = false;

  function storageGet(k: string): Uint8Array | undefined {
    try {
      const v = localStorage.getItem(STORAGE_PREFIX + k);
      return v === null ? undefined : base64ToBytes(v);
    } catch {
      return undefined;
    }
  }

  function storageSet(k: string, data: Uint8Array): void {
    try {
      localStorage.setItem(STORAGE_PREFIX + k, bytesToBase64(data));
    } catch (err) {
      if (!warnedAboutWrites) {
        warnedAboutWrites = true;
        console.warn(
          '[platform/browser] localStorage write failed; keeping data in memory only',
          err,
        );
      }
    }
  }

  async function readBytes(root: FsRoot, relPath: string): Promise<Uint8Array> {
    const k = key(root, relPath);
    const cached = root === 'assets' ? undefined : (memory.get(k) ?? storageGet(k));
    if (cached) return cached;
    if (root !== 'assets') {
      throw new Error(`[platform/browser] no such file: ${k}`);
    }
    const res = await fetch(baseUrl + relPath.replace(/^\/+/, ''));
    if (!res.ok) throw new Error(`[platform/browser] fetch ${res.status} for ${k}`);
    return new Uint8Array(await res.arrayBuffer());
  }

  async function writeBytes(root: FsRoot, relPath: string, data: Uint8Array): Promise<void> {
    if (root === 'assets') throw new Error('assets root is read-only');
    if (!warnedAboutWrites) {
      warnedAboutWrites = true;
      console.warn(
        '[platform/browser] writes are in-memory/localStorage only; use the Electron shell for real persistence',
      );
    }
    const k = key(root, relPath);
    memory.set(k, data);
    storageSet(k, data);
    await Promise.resolve();
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const listeners = new Set<(s: PowerState) => void>();
  const powerState: PowerState = { source: 'unknown', thermal: 'unknown' };

  const description: ShellDescription = {
    name: 'browser',
    version: typeof navigator === 'undefined' ? 'unknown' : navigator.userAgent,
    os: typeof navigator === 'undefined' ? 'unknown' : navigator.platform,
    arch: 'unknown',
    capabilities: { persistentWrites: false, nativeWindow: false, powerState: false },
  };

  return {
    fs: {
      readBytes,
      readText: async (root, p) => decoder.decode(await readBytes(root, p)),
      writeBytes,
      writeText: (root, p, text) => writeBytes(root, p, encoder.encode(text)),
      exists: async (root, p) => {
        try {
          await readBytes(root, p);
          return true;
        } catch {
          return false;
        }
      },
    },
    paths: {
      rootPath: (root) =>
        Promise.resolve(
          root === 'assets' ? new URL(baseUrl, location.href).href : `memory://${root}/`,
        ),
    },
    window: {
      setTitle: (title) => {
        document.title = title;
        return Promise.resolve();
      },
      setFullscreen: async (fullscreen) => {
        if (fullscreen && !document.fullscreenElement)
          await document.documentElement.requestFullscreen();
        else if (!fullscreen && document.fullscreenElement) await document.exitFullscreen();
      },
      toggleFullscreen: async () => {
        const next = !document.fullscreenElement;
        if (next) await document.documentElement.requestFullscreen();
        else await document.exitFullscreen();
        return next;
      },
      isFullscreen: () => Promise.resolve(document.fullscreenElement !== null),
    },
    power: {
      current: () => Promise.resolve(powerState),
      subscribe: (listener): Unsubscribe => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    diagnostics: {
      reportProbe: (result) => {
        console.info('[platform/browser] glProbe', result);
        return Promise.resolve();
      },
    },
    describe: () => description,
  };
}
