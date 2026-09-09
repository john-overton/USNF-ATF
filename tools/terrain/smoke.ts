/** Packaged/unpackaged Electron terrain acceptance smoke using Chromium's local CDP. */
import { mkdir, mkdtemp, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
function option(name: string, fallback?: string): string {
  const index = args.indexOf(name);
  const value = index < 0 ? fallback : args[index + 1];
  if (!value) throw new Error(`Required: ${name}`);
  return value;
}
const binary = path.resolve(option('--binary'));
const terrain = path.resolve(option('--terrain'));
const out = path.resolve(option('--out', 'extracted/terrain-smoke'));
const seconds = Number(option('--seconds', '15'));
if (!Number.isFinite(seconds) || seconds < 1 || seconds > 60)
  throw new Error('seconds must be 1..60');
const profile = await mkdtemp(path.join(tmpdir(), 'usnf-terrain-smoke-'));
await mkdir(out, { recursive: true });
await cp(terrain, path.join(profile, 'data', 'terrains', 'ukraine'), { recursive: true });
const command = [binary];
if (args.includes('--app')) command.push(path.resolve(option('--app')));
command.push(`--user-data-dir=${profile}`, '--remote-debugging-port=0');
const proc = Bun.spawn(command, { stdout: 'pipe', stderr: 'pipe' });
const logs: string[] = [];
async function collect(stream: ReadableStream<Uint8Array>): Promise<void> {
  const decoder = new TextDecoder();
  for await (const chunk of stream) logs.push(decoder.decode(chunk));
}
const drains = [collect(proc.stdout), collect(proc.stderr)];
let socket: WebSocket | undefined;
let trace: ReturnType<typeof Bun.spawn> | undefined;
const runtimeErrors: unknown[] = [];
const pending = new Map<
  number,
  { resolve: (value: any) => void; reject: (error: Error) => void }
>();
let nextId = 0;
function send(method: string, params: Record<string, unknown> = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP timeout: ${method}`));
    }, 65_000);
    pending.set(id, {
      resolve: (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      reject: (e) => {
        clearTimeout(timer);
        reject(e);
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
      throw new Error(`Electron exited ${proc.exitCode}\n${logs.join('')}`);
    const result = await read();
    if (result !== undefined) return result;
    await Bun.sleep(100);
  }
  throw new Error(`Timed out: ${label}`);
}
try {
  const endpoint = await poll(
    async () => logs.join('').match(/DevTools listening on (ws:\/\/[^\s]+)/)?.[1],
    'debug port',
  );
  const port = new URL(endpoint).port;
  const page = await poll(async () => {
    const targets = (await fetch(`http://127.0.0.1:${port}/json/list`).then((r) =>
      r.json(),
    )) as any[];
    return targets.find((t) => t.type === 'page' && !t.url.startsWith('devtools:'));
  }, 'renderer target');
  socket = new WebSocket(page.webSocketDebuggerUrl);
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push(message.params);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  });
  await new Promise<void>((resolve, reject) => {
    socket!.onopen = () => resolve();
    socket!.onerror = () => reject(new Error('CDP socket failed'));
  });
  await send('Runtime.enable');
  await send('Page.enable');
  // A shared desktop can deliver physical pointer drags during automation.
  // Suppress pointer camera input for this isolated smoke only, before app listeners exist.
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source:
      "window.addEventListener('pointermove', e => e.stopImmediatePropagation(), true); window.addEventListener('pointerdown', e => e.stopImmediatePropagation(), true); ['keydown','keyup'].forEach(type => window.addEventListener(type, e => { if(e.isTrusted) {e.preventDefault();e.stopImmediatePropagation();} },true));",
  });
  await send('Emulation.setDeviceMetricsOverride', {
    width: 2560,
    height: 1440,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send('Page.bringToFront');
  // The viewer supports query parameters; load the staged theater in an isolated profile.
  const url = new URL(page.url);
  url.searchParams.set('view', 'terrain');
  url.searchParams.set('root', 'appData');
  url.searchParams.set('manifest', 'terrains/ukraine/manifest.json');
  if (args.includes('--camera')) {
    const camera = option('--camera').split(',').map(Number);
    if (camera.length !== 5 || !camera.every(Number.isFinite))
      throw new Error('camera must be x,y,z,yaw,pitch');
    ['x', 'y', 'z', 'yaw', 'pitch'].forEach((key, i) =>
      url.searchParams.set(key, String(camera[i])),
    );
  }
  await send('Page.navigate', { url: url.href });
  await poll(
    async () =>
      await evaluate('typeof window.__terrainDiagnostics === "function" ? true : undefined'),
    'terrain diagnostics',
  );
  const ready = await poll(
    async () => {
      const d = await evaluate('window.__terrainDiagnostics()');
      if (d?.error) throw new Error(`Terrain load failed: ${d.error}`);
      return d?.status === 'ready' &&
        d?.loadedChunks > 0 &&
        d?.pendingChunks === 0 &&
        (d?.waterBatchesPending ?? 0) === 0 &&
        d?.triangles > 0
        ? d
        : undefined;
    },
    'terrain chunks',
    60_000,
  );
  await evaluate(
    'const canvas=document.getElementById("terrain-canvas"); canvas.style.pointerEvents="none"; canvas.focus();',
  );
  // Allow shader warmup and initial streaming to settle before measuring cadence.
  await Bun.sleep(1000);
  let traceOutput: Promise<string> | undefined;
  if (args.includes('--trace-gpu')) {
    const listing = await new Response(
      Bun.spawn(['ps', '-axo', 'pid=,ppid=,args='], { stdout: 'pipe' }).stdout,
    ).text();
    const rows = listing
      .split('\n')
      .map((line) => line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/))
      .filter(Boolean);
    const family = new Set([proc.pid]);
    for (let pass = 0; pass < 8; pass++)
      for (const row of rows) if (family.has(Number(row![2]))) family.add(Number(row![1]));
    const helper = rows.find(
      (row) => family.has(Number(row![1])) && row![3]!.includes('--type=gpu-process'),
    );
    if (!helper) throw new Error('Cannot identify this isolated app GPU helper for tracing');
    const pid = helper[1]!;
    trace = Bun.spawn(
      [
        'xcrun',
        'xctrace',
        'record',
        '--template',
        'Metal System Trace',
        '--attach',
        pid,
        '--time-limit',
        `${seconds}s`,
        '--no-prompt',
        '--output',
        path.join(out, 'gpu.trace'),
      ],
      { stdout: 'pipe', stderr: 'pipe' },
    );
    traceOutput = Promise.all([
      new Response(trace.stdout).text(),
      new Response(trace.stderr).text(),
    ]).then((parts) => parts.join('\n'));
  }
  const frames = (await evaluate(`new Promise(resolve => {
    const times = []; const start = performance.now(); let previous = start;
    function frame(now) { times.push(now-previous); previous = now;
      if(now-start < ${seconds * 1000}) requestAnimationFrame(frame); else resolve(times); }
    requestAnimationFrame(frame);
  })`)) as number[];
  let gpuTrace: { exitCode: number; log: string } | undefined;
  if (trace) {
    gpuTrace = { exitCode: await trace.exited, log: await traceOutput! };
    await Bun.write(path.join(out, 'gpu-trace.log'), gpuTrace.log);
  }
  const before = await evaluate('window.__terrainDiagnostics()');
  await evaluate(
    "window.dispatchEvent(new KeyboardEvent('keydown', {key:'w',code:'KeyW',bubbles:true}))",
  );
  const flightTimes = (await evaluate(`new Promise(resolve => {
    const times=[]; const start=performance.now(); let last=start;
    function frame(now) { times.push(now-last);last=now;
      if(now-start < 1500) requestAnimationFrame(frame); else resolve(times); }
    requestAnimationFrame(frame);
  })`)) as number[];
  await evaluate(
    "window.dispatchEvent(new KeyboardEvent('keyup', {key:'w',code:'KeyW',bubbles:true}))",
  );
  const after = await evaluate('window.__terrainDiagnostics()');
  const movement = Math.hypot(after.camera.x - before.camera.x, after.camera.z - before.camera.z);
  if (
    movement < 50 ||
    after.error ||
    after.width !== 2560 ||
    after.height !== 1440 ||
    (after.waterBatchesOmitted ?? 0) > 0 ||
    runtimeErrors.length
  ) {
    throw new Error(
      `Terrain acceptance failed: ${JSON.stringify({ movement, after, runtimeErrors })}`,
    );
  }
  const screenshot = await send('Page.captureScreenshot', { format: 'png' });
  await Bun.write(path.join(out, 'terrain.png'), Buffer.from(screenshot.data, 'base64'));
  const sorted = [...frames].sort((a, b) => a - b);
  const average = frames.reduce((a, b) => a + b, 0) / frames.length;
  const report = {
    date: new Date().toISOString(),
    binary,
    terrain,
    viewport: [2560, 1440],
    sourceCommit: (
      await new Response(Bun.spawn(['git', 'rev-parse', 'HEAD'], { stdout: 'pipe' }).stdout).text()
    ).trim(),
    runtimeErrors,
    gpuTrace,
    movementMeters: movement,
    flightMeanFrameMs: flightTimes.reduce((a, b) => a + b, 0) / flightTimes.length,
    flightP95FrameMs: [...flightTimes].sort((a, b) => a - b)[Math.floor(flightTimes.length * 0.95)],
    workingTreeStatus: (
      await new Response(Bun.spawn(['git', 'status', '--short'], { stdout: 'pipe' }).stdout).text()
    ).trim(),
    durationSeconds: seconds,
    frames: frames.length,
    meanFrameMs: average,
    meanFps: 1000 / average,
    p95FrameMs: sorted[Math.floor(sorted.length * 0.95)],
    p99FrameMs: sorted[Math.floor(sorted.length * 0.99)],
    initial: ready,
    beforeMovement: before,
    afterMovement: after,
    note: 'rAF cadence measures displayed frame intervals; upload counters are not total GPU DRAM bandwidth.',
  };
  await Bun.write(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (trace && trace.exitCode === null) {
    trace.kill();
    await trace.exited;
  }
  socket?.close();
  proc.kill();
  await proc.exited;
  await Promise.allSettled(drains);
  await Bun.write(path.join(out, 'electron.log'), logs.join(''));
  await rm(profile, { recursive: true, force: true });
}
