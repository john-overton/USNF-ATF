import { useEffect, useRef, useState } from 'react';
import { getPlatform } from '../platform';
import { FlightHud } from '../flight/FlightHud';
import type { FsRoot } from '../platform/Platform';
import { startTerrainViewer, type TerrainDiagnostics } from '../terrain/viewer';

export function TerrainViewer() {
  const params = new URLSearchParams(window.location.search);
  const flightMode = params.get('mode') === 'flight';
  const [root, setRoot] = useState<FsRoot>(params.get('root') === 'assets' ? 'assets' : 'appData');
  const [path, setPath] = useState(params.get('manifest') ?? 'terrains/ukraine/manifest.json');
  const [request, setRequest] = useState({ root, path, generation: 0 });
  const [stats, setStats] = useState<TerrainDiagnostics>();
  const [error, setError] = useState('');
  const [panelMinimized, setPanelMinimized] = useState(false);
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
      {stats?.flight && (
        <FlightHud
          flight={stats.flight}
          flapFraction={stats.flight.systems.flapFraction}
          airbrakeFraction={stats.flight.systems.airbrakeFraction}
        />
      )}
      <main
        className={`terrain-panel${flightMode && panelMinimized ? ' terrain-panel-minimized' : ''}`}
      >
        <div className="terrain-panel-heading">
          <h1>{flightMode ? 'Practice flight' : 'Terrain explorer'}</h1>
          {flightMode && (
            <button
              type="button"
              aria-label={
                panelMinimized ? 'Restore practice flight panel' : 'Minimize practice flight panel'
              }
              aria-expanded={!panelMinimized}
              aria-controls="flight-helper-content"
              onClick={() => {
                setPanelMinimized(!panelMinimized);
                canvas.current?.focus();
              }}
            >
              {panelMinimized ? '+' : '−'}
            </button>
          )}
        </div>
        <div id="flight-helper-content" hidden={flightMode && panelMinimized}>
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
              Generate a theater using the terrain pipeline, then copy its folder under the data
              root shown above. Enter its relative manifest path and load again.
            </p>
          )}
          {!error && stats?.status === 'loading' && <p>Loading terrain chunks…</p>}
          <p>
            {flightMode
              ? 'Arrows pitch/roll · Q/E rudder · 1–5 throttle 0/25/50/75/100% · 6 afterburner · W/S fine throttle · T engine · G gear · H hook · F flaps · B speed/wheel brakes · F2 locked chase · F3 horizon-up · M mute · R reset.'
              : 'WASD move · Q/E altitude · drag to look · arrows turn · Shift accelerates. Click the terrain to focus controls.'}
          </p>
          {flightMode && !stats?.flight && !error && !stats?.error && (
            <p>Validating practice strip and ground data…</p>
          )}
          {stats?.flight && (
            <section aria-label="Flight instruments">
              <strong>
                {stats.flight.status}
                {stats.flight.stalled ? ' · STALL' : ''}
              </strong>
              <p>{stats.flight.reason}</p>
              <dl className="terrain-stats">
                <dt>Airspeed</dt>
                <dd>{(stats.flight.airspeed * 1.94384).toFixed(0)} kt</dd>
                <dt>Altitude / ground clearance</dt>
                <dd>
                  {stats.flight.position.y.toFixed(0)} /{' '}
                  {stats.flight.altitudeAGL?.toFixed(1) ?? '…'} m
                </dd>
                <dt>Throttle</dt>
                <dd>
                  {(stats.flight.throttle * 100).toFixed(0)}%
                  {stats.flight.afterburner ? ' · AFT' : ''}
                </dd>
                <dt>Engine / spool</dt>
                <dd>
                  {stats.flight.engineRunning ? 'ON' : 'OFF'} /{' '}
                  {(stats.flight.systems.engineSpool * 100).toFixed(0)}%
                </dd>
                <dt>Gear / hook</dt>
                <dd>
                  {stats.flight.gearDown ? 'DOWN' : 'UP'}{' '}
                  {(stats.flight.systems.gearFraction * 100).toFixed(0)}% /{' '}
                  {stats.flight.hookDown ? 'DOWN' : 'UP'}{' '}
                  {(stats.flight.systems.hookFraction * 100).toFixed(0)}%
                </dd>
                <dt>Flaps / speed brake</dt>
                <dd>
                  {(stats.flight.systems.flapFraction * 100).toFixed(0)}% /{' '}
                  {(stats.flight.systems.airbrakeFraction * 100).toFixed(0)}%
                </dd>
                <dt>View</dt>
                <dd>
                  {stats.flight.cameraMode === 'attitude'
                    ? 'F2 · attitude locked'
                    : 'F3 · horizon up'}
                </dd>
                <dt>Sound</dt>
                <dd>
                  {stats.flight.audio.muted
                    ? 'Muted (M)'
                    : stats.flight.audio.contextState === 'running'
                      ? 'On (M to mute)'
                      : 'Press a flight key to enable'}
                </dd>
                <dt>Sound assets</dt>
                <dd>
                  {stats.flight.audio.source === 'retail-pt-samples'
                    ? 'USNF ’97 F-14 samples'
                    : 'Original fallback'}
                  {stats.flight.audio.error ? ` · ${stats.flight.audio.error}` : ''}
                </dd>
                <dt>Load</dt>
                <dd>{stats.flight.loadFactor.toFixed(2)} g</dd>
                <dt>Angle of attack</dt>
                <dd>{((stats.flight.alphaRad * 180) / Math.PI).toFixed(1)}°</dd>
                <dt>Sim / steps</dt>
                <dd>
                  {stats.flight.simTime.toFixed(1)} s / {stats.flight.steps} at 120 Hz
                </dd>
                <dt>Takeoffs / landings</dt>
                <dd>
                  {stats.flight.takeoffs} / {stats.flight.landings}
                </dd>
              </dl>
              <label>
                Flight model{' '}
                <select
                  id="flight-model-selector"
                  value={stats.flight.flightModelId}
                  onChange={(event) => {
                    const url = new URL(window.location.href);
                    url.searchParams.set('flightModel', event.target.value);
                    window.location.assign(url.href);
                  }}
                >
                  <option value="assisted">Preserved assisted (default)</option>
                  <option value="retail-envelope" disabled={!stats.flight.retailProfileAvailable}>
                    USNF ’97 envelope fit (experimental)
                  </option>
                </select>
              </label>
              <p>Switching restarts this practice flight.</p>
              <p>
                {stats.flight.aircraftName} · {stats.flight.flightModel} · fictional practice strip.
              </p>
              <p>
                Mass {(stats.flight.massKg / 1000).toFixed(2)} t · rated dry/AB thrust{' '}
                {(stats.flight.militaryThrustN / 1000).toFixed(1)}/
                {(stats.flight.afterburnerThrustN / 1000).toFixed(1)} kN
              </p>
              {stats.flight.flightProfileSha256 && (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    const values = new FormData(event.currentTarget);
                    const url = new URL(window.location.href);
                    url.searchParams.set('flightFuel', String(Number(values.get('fuel')) / 100));
                    url.searchParams.set('flightPayload', String(Number(values.get('payload'))));
                    window.location.assign(url.href);
                  }}
                >
                  <label>
                    Fuel load % (fixed){' '}
                    <input
                      name="fuel"
                      type="number"
                      min="0"
                      max="100"
                      step="5"
                      defaultValue={
                        Number(new URLSearchParams(window.location.search).get('flightFuel') ?? 1) *
                        100
                      }
                    />
                  </label>
                  <label>
                    Payload kg{' '}
                    <input
                      name="payload"
                      type="number"
                      min="0"
                      max="15000"
                      step="100"
                      defaultValue={stats.flight.payloadMassKg}
                    />
                  </label>
                  <button type="submit">Restart with load</button>
                  <p>
                    Fixed practice fuel {(stats.flight.fuelMassKg / 1000).toFixed(2)} t · payload{' '}
                    {(stats.flight.payloadMassKg / 1000).toFixed(2)} t
                  </p>
                </form>
              )}
            </section>
          )}
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
            <a href="?mode=flight">Practice runway</a>
            {' · '}
            <a href="?mode=flight&flightStart=approach">Final approach</a>
            {' · '}
            <a href="?mode=flight&flightStart=airborne">Airborne practice</a>
            {' · '}
            <a href="?">Terrain explorer</a>
            {' · '}
            <a href="?view=probe">Renderer diagnostic</a>
          </p>
        </div>
      </main>
    </div>
  );
}
