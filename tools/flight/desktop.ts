/** Isolated real Electron/CDP session for flight acceptance, never a mocked renderer. */
import { cp, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

export interface DesktopOptions {
  binary: string;
  app?: string;
  terrain: string;
  aircraft?: string;
  audio?: string;
  flightProfile?: string;
  interactiveTest?: boolean;
  out: string;
  query?: Record<string, string>;
  initialization?: string;
}

export async function openDesktop(options: DesktopOptions) {
  const out = path.resolve(options.out);
  const profile = await mkdtemp(path.join(tmpdir(), 'usnf-flight-smoke-'));
  await mkdir(out, { recursive: true });
  await cp(path.resolve(options.terrain), path.join(profile, 'data/terrains/ukraine'), {
    recursive: true,
  });
  if (options.aircraft) {
    await mkdir(path.join(profile, 'data/aircraft'), { recursive: true });
    await cp(path.resolve(options.aircraft), path.join(profile, 'data/aircraft/f14.json'));
  }
  if (options.audio) {
    await mkdir(path.join(profile, 'data/audio'), { recursive: true });
    await cp(path.resolve(options.audio), path.join(profile, 'data/audio/f14.json'));
  }
  if (options.flightProfile) {
    await mkdir(path.join(profile, 'data/aircraft'), { recursive: true });
    await cp(
      path.resolve(options.flightProfile),
      path.join(profile, 'data/aircraft/f14-flight.json'),
    );
  }
  const command = [path.resolve(options.binary)];
  if (options.app) command.push(path.resolve(options.app));
  command.push(
    `--user-data-dir=${profile}`,
    '--remote-debugging-port=0',
    '--disable-backgrounding-occluded-windows',
    '--disable-background-timer-throttling',
  );
  const proc = Bun.spawn(command, { stdout: 'pipe', stderr: 'pipe' });
  const logs: string[] = [];
  const errors: unknown[] = [];
  const drains = [proc.stdout, proc.stderr].map(async (stream) => {
    const decoder = new TextDecoder();
    for await (const chunk of stream) logs.push(decoder.decode(chunk));
  });
  let socket: WebSocket | undefined;
  let closed = false;
  let nextId = 0;
  const pending = new Map<number, { resolve(value: any): void; reject(error: Error): void }>();

  async function close(): Promise<void> {
    if (closed) return;
    closed = true;
    for (const request of pending.values()) request.reject(new Error('Desktop session closed'));
    pending.clear();
    socket?.close();
    if (proc.exitCode === null) proc.kill();
    await proc.exited;
    await Promise.allSettled(drains);
    await Bun.write(path.join(out, 'electron.log'), logs.join(''));
    await Bun.write(path.join(out, 'runtime-errors.json'), JSON.stringify(errors, null, 2) + '\n');
    await rm(profile, { recursive: true, force: true });
  }

  function send(method: string, params: Record<string, unknown> = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(
          new Error(`CDP timeout: ${method} ${String(params.expression ?? '').slice(0, 120)}`),
        );
      }, 120_000);
      pending.set(id, {
        resolve(value) {
          clearTimeout(timer);
          resolve(value);
        },
        reject(error) {
          clearTimeout(timer);
          reject(error);
        },
      });
      socket!.send(JSON.stringify({ id, method, params }));
    });
  }

  async function evaluate(expression: string): Promise<any> {
    const result = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }

  async function poll<T>(
    read: () => Promise<T | undefined>,
    label: string,
    timeout = 60_000,
  ): Promise<T> {
    const until = Date.now() + timeout;
    while (Date.now() < until) {
      if (proc.exitCode !== null)
        throw new Error(`Electron exited ${proc.exitCode}: ${logs.join('')}`);
      if (errors.length) throw new Error(`Renderer errors: ${JSON.stringify(errors)}`);
      const value = await read();
      if (value !== undefined) return value;
      await Bun.sleep(100);
    }
    throw new Error(`Timed out: ${label}`);
  }

  async function capture(name: string): Promise<void> {
    const screenshot = await send('Page.captureScreenshot', { format: 'png' });
    await Bun.write(path.join(out, `${name}.png`), Buffer.from(screenshot.data, 'base64'));
  }

  try {
    const endpoint = await poll(
      async () => logs.join('').match(/DevTools listening on (ws:\/\/\S+)/)?.[1],
      'debug endpoint',
    );
    const port = new URL(endpoint).port;
    const page = await poll(async () => {
      const targets = (await fetch(`http://127.0.0.1:${port}/json/list`).then((r) =>
        r.json(),
      )) as any[];
      return targets.find(
        (target) => target.type === 'page' && !target.url.startsWith('devtools:'),
      );
    }, 'app page');
    socket = new WebSocket(page.webSocketDebuggerUrl);
    socket.addEventListener('close', () => {
      for (const request of pending.values())
        request.reject(new Error('Automated test window disconnected'));
      pending.clear();
    });
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (message.method === 'Runtime.exceptionThrown') errors.push(message.params);
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error')
        errors.push({
          consoleError: message.params.args.map((arg: any) => arg.value ?? arg.description),
        });
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      if (message.error) request.reject(new Error(JSON.stringify(message.error)));
      else request.resolve(message.result);
    });
    await new Promise<void>((resolve, reject) => {
      socket!.onopen = () => resolve();
      socket!.onerror = () => reject(new Error('CDP connection failed'));
    });
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        if (!${Boolean(options.interactiveTest)}) ['pointermove','pointerdown'].forEach(type=>window.addEventListener(type,e=>e.stopImmediatePropagation(),true));
        if (!${Boolean(options.interactiveTest)}) ['keydown','keyup'].forEach(type=>window.addEventListener(type,e=>{if(e.isTrusted){e.preventDefault();e.stopImmediatePropagation();}},true));
        document.addEventListener('DOMContentLoaded', () => {
          document.title = ${JSON.stringify('USNF-ATF AUTOMATED TEST — ' + path.basename(out))};
          const label = document.createElement('div');
          label.textContent = ${JSON.stringify('AUTOMATED TEST — ' + path.basename(out))};
          label.style.cssText = 'position:fixed;right:12px;top:12px;z-index:9999;padding:8px 12px;background:#8b2900;color:white;font:700 14px monospace;pointer-events:none';
          document.body.appendChild(label);
        });
        ${options.initialization ?? ''}
      `,
    });
    await send('Emulation.setDeviceMetricsOverride', {
      width: 2560,
      height: 1440,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await send('Page.bringToFront');
    await send('Emulation.setFocusEmulationEnabled', { enabled: true });
    const url = new URL(page.url);
    for (const [key, value] of Object.entries({
      view: 'terrain',
      root: 'appData',
      manifest: 'terrains/ukraine/manifest.json',
      ...options.query,
    }))
      url.searchParams.set(key, value);
    await send('Page.navigate', { url: url.href });
    return { evaluate, poll, capture, close, errors, out, send };
  } catch (error) {
    await close();
    throw error;
  }
}
