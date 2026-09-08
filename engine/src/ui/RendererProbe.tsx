import { useEffect, useRef, useState } from 'react';

import { getPlatform } from '../platform';
import { type GlProbeResult, probeWebGL2 } from '../render/glProbe';
import { startSpinningCube } from '../render/SpinningCube';

type ProbeState =
  | { status: 'pending' }
  | { status: 'ok'; result: GlProbeResult }
  | { status: 'error'; message: string };

export function RendererProbe() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [probe, setProbe] = useState<ProbeState>({ status: 'pending' });
  const platform = getPlatform();
  const shell = platform.describe();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cube: ReturnType<typeof startSpinningCube> | undefined;
    try {
      cube = startSpinningCube(canvas);
      const result = probeWebGL2(cube.gl);
      setProbe({ status: 'ok', result });
      void platform.diagnostics.reportProbe(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setProbe({ status: 'error', message });
      void platform.diagnostics.reportProbe({ error: message });
    }
    return () => cube?.dispose();
  }, [platform]);

  return (
    <div className="probe-root">
      <canvas ref={canvasRef} className="probe-canvas" />
      <main className="probe-panel">
        <h1>Renderer probe</h1>
        <p className="probe-shell">
          Shell: <strong>{shell.name}</strong> {shell.version} on {shell.os}/{shell.arch}
        </p>
        {probe.status === 'pending' && <p>Creating WebGL2 context…</p>}
        {probe.status === 'error' && <p className="probe-error">WebGL2 failed: {probe.message}</p>}
        {probe.status === 'ok' && <ProbeTable result={probe.result} />}
      </main>
    </div>
  );
}

function ProbeTable({ result }: { result: GlProbeResult }) {
  const rows: [string, string | number | boolean][] = [
    ['Renderer', result.renderer],
    ['Vendor', result.vendor],
    ['Unmasked info', result.unmaskedInfo],
    ['GL version', result.glVersion],
    ['GLSL version', result.glslVersion],
    ['MAX_TEXTURE_SIZE', result.maxTextureSize],
    ['MAX_VERTEX_TEXTURE_IMAGE_UNITS', result.maxVertexTextureImageUnits],
    ['MAX_COLOR_ATTACHMENTS', result.maxColorAttachments],
    ['MAX_SAMPLES', result.maxSamples],
    ['MAX_UNIFORM_BLOCK_SIZE', result.maxUniformBlockSize],
    ['EXT_color_buffer_float', result.extColorBufferFloat],
    ['Max anisotropy', result.maxAnisotropy],
    ['Extensions', result.extensionCount],
  ];
  return (
    <>
      <p className={result.softwareRenderer ? 'probe-error' : 'probe-ok'}>
        {result.softwareRenderer ? 'Software renderer detected' : 'Hardware renderer'}
      </p>
      <table>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <th>{k}</th>
              <td>{String(v)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
