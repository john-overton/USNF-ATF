import { useEffect, useRef, useState } from 'react';
import { getPlatform } from '../platform';
import type { FsRoot } from '../platform/Platform';
import { startTerrainViewer, type TerrainDiagnostics } from '../terrain/viewer';

export function TerrainViewer() {
  const params = new URLSearchParams(window.location.search);
  const [root, setRoot] = useState<FsRoot>(params.get('root') === 'assets' ? 'assets' : 'appData');
  const [path, setPath] = useState(params.get('manifest') ?? 'terrains/ukraine/manifest.json');
  const [request, setRequest] = useState({ root, path, generation: 0 });
  const [stats, setStats] = useState<TerrainDiagnostics>();
  const [error, setError] = useState('');
  const [rootPath, setRootPath] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let active = true;
    void getPlatform()
      .paths.rootPath(root)
      .then((p) => {
        if (active) setRootPath(p);
      });
    return () => {
      active = false;
    };
  }, [root]);
  useEffect(() => {
    if (!canvas.current) return;
    let active = true;
    let viewer: ReturnType<typeof startTerrainViewer> | undefined;
    try {
      viewer = startTerrainViewer(
        canvas.current,
        getPlatform(),
        request.root,
        request.path,
        setStats,
      );
    } catch (err) {
      queueMicrotask(() => {
        if (active) setError(err instanceof Error ? err.message : String(err));
      });
      void getPlatform().diagnostics.reportProbe({ error: String(err) });
    }
    return () => {
      active = false;
      viewer?.dispose();
    };
  }, [request]);
  return (
    <div className="probe-root">
      <canvas
        id="terrain-canvas"
        ref={canvas}
        className="probe-canvas"
        tabIndex={0}
        aria-label="Terrain free camera. WASD move, Q E altitude, drag to look."
      />
      <main className="terrain-panel">
        <h1>Terrain explorer</h1>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setError('');
            setStats(undefined);
            setRequest({ root, path, generation: request.generation + 1 });
          }}
        >
          <label>
            Data root{' '}
            <select
              id="terrain-root"
              value={root}
              onChange={(event) => setRoot(event.target.value as FsRoot)}
            >
              <option value="appData">App data</option>
              <option value="assets">Development assets</option>
            </select>
          </label>
          <label>
            Manifest{' '}
            <input
              id="terrain-manifest"
              value={path}
              onChange={(event) => setPath(event.target.value)}
            />
          </label>
          <button id="terrain-load" type="submit">
            Load terrain
          </button>
        </form>
        <p className="terrain-path">{rootPath}</p>
        {(error || stats?.error) && (
          <p className="probe-error">
            {error || stats?.error}
            <br />
            Generate a theater using the terrain pipeline, then copy its folder under the data root
            shown above. Enter its relative manifest path and load again.
          </p>
        )}
        {!error && stats?.status === 'loading' && <p>Loading terrain chunks…</p>}
        <p>
          WASD move · Q/E altitude · drag to look · arrows turn · Shift accelerates. Click the
          terrain to focus controls.
        </p>
        {stats && (
          <>
            <strong>{stats.name || 'No terrain loaded'}</strong>
            <p>{stats.source}</p>
            <dl className="terrain-stats">
              <dt>Frame interval (mean / p95)</dt>
              <dd>
                {stats.frameMs.toFixed(1)} / {stats.frameP95Ms.toFixed(1)} ms
              </dd>
              <dt>CPU render submission</dt>
              <dd>{stats.cpuMs.toFixed(2)} ms</dd>
              <dt>Drawing buffer</dt>
              <dd>
                {stats.width} × {stats.height}
              </dd>
              <dt>Triangles / draw calls</dt>
              <dd>
                {stats.triangles.toLocaleString()} / {stats.drawCalls}
              </dd>
              <dt>Source LOD / patches</dt>
              <dd>
                {stats.sourceLod} / {stats.patches}
              </dd>
              <dt>Source transition</dt>
              <dd>
                {stats.transitionActive
                  ? `${stats.transitionFrom} → ${stats.transitionTo} (${Math.round(stats.transitionProgress * 100)}%)`
                  : 'Stable'}{' '}
                · {stats.transitionsCompleted} completed
              </dd>
              <dt>Chunks cached / loading</dt>
              <dd>
                {stats.loadedChunks} / {stats.pendingChunks}
              </dd>
              <dt>CPU + geometry cache estimate</dt>
              <dd>{(stats.cacheBytes / 1048576).toFixed(1)} MiB</dd>
              <dt>Geometry created (upload estimate)</dt>
              <dd>{(stats.uploadBytesPerSecond / 1048576).toFixed(2)} MiB/s</dd>
              <dt>Water batches / omitted by budget</dt>
              <dd>
                {stats.waterBatches} / {stats.waterBatchesOmitted}
              </dd>
              <dt>GPU DRAM bandwidth</dt>
              <dd>Unavailable in WebGL2</dd>
              <dt>World east / north / altitude</dt>
              <dd>
                {stats.camera.x.toFixed(0)} / {stats.camera.z.toFixed(0)} /{' '}
                {stats.camera.y.toFixed(0)} m
              </dd>
              <dt>Floating origin east / north</dt>
              <dd>
                {stats.origin.x} / {stats.origin.z} m
              </dd>
            </dl>
            <small>{stats.attribution.join(' · ')}</small>
          </>
        )}
        <p>
          <a href="?view=probe">Renderer diagnostic</a>
        </p>
      </main>
    </div>
  );
}
