import type { CockpitMirrorLayout } from '../terrain/mirrors';
import { CockpitOverlay, GunStatus } from '../flight/CockpitOverlay';
import { AIRCRAFT } from '../flight/aircraft-catalog';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getPlatform } from '../platform';
import { FlightNavigationOverlay } from '../flight/FlightNavigationOverlay';
import type { FsRoot } from '../platform/Platform';
import { startTerrainViewer, type TerrainDiagnostics } from '../terrain/viewer';
import { ExplorerNavigationOverlay } from './ExplorerNavigationOverlay';
import type { MissionParams } from '../sim/mission/params';
import type { MapWaypoint } from '../terrain/navigation-map';
import {
  CLOUD_QUALITIES,
  WEATHER_PRESETS,
  WIND_PRESETS,
  type CloudQuality,
  type WeatherId,
  type WindPresetId,
} from '../sim/environment';

/** The WebGL host for both the explorer and a flight; the shell decides which. */
export function TerrainViewer({
  mission,
  parseError = '',
}: {
  mission: MissionParams;
  /** A query the shell could not read; shown here because this is where errors live. */
  parseError?: string;
}) {
  const flightMode = mission.mode !== 'explorer';
  const [root, setRoot] = useState<FsRoot>(mission.root);
  const [path, setPath] = useState(mission.manifestPath);
  const [request, setRequest] = useState({ root, path, generation: 0 });
  const [stats, setStats] = useState<TerrainDiagnostics>();
  const [error, setError] = useState('');
  const [panelMinimized, setPanelMinimized] = useState(false);
  const [rootPath, setRootPath] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<ReturnType<typeof startTerrainViewer> | null>(null);
  const cockpitMirrors = useCallback((layout: CockpitMirrorLayout) => {
    viewerRef.current?.setCockpitMirrors(layout);
  }, []);
  const navigationTarget = useCallback((waypoint: MapWaypoint | undefined) => {
    viewerRef.current?.setNavigationTarget(waypoint);
  }, []);
  const teleport = async (waypoint: MapWaypoint) => {
    if (!viewerRef.current) throw new Error('Terrain viewer is not ready');
    await viewerRef.current.teleportToWaypoint(waypoint);
  };
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
    if (!canvas.current || parseError) return;
    let active = true;
    let viewer: ReturnType<typeof startTerrainViewer> | undefined;
    try {
      viewer = startTerrainViewer(
        canvas.current,
        getPlatform(),
        request.root,
        request.path,
        setStats,
        { ...mission, root: request.root, manifestPath: request.path },
      );
      viewerRef.current = viewer;
    } catch (err) {
      queueMicrotask(() => {
        if (active) setError(err instanceof Error ? err.message : String(err));
      });
      void getPlatform().diagnostics.reportProbe({ error: String(err) });
    }
    return () => {
      active = false;
      viewer?.dispose();
      if (viewerRef.current === viewer) viewerRef.current = null;
    };
  }, [request, mission, parseError]);
  return (
    <div className="probe-root">
      {stats?.imageryAttribution && (
        <small className="terrain-imagery-credit">{stats.imageryAttribution}</small>
      )}
      <canvas
        id="terrain-canvas"
        ref={canvas}
        className="probe-canvas"
        tabIndex={0}
        aria-label={
          flightMode
            ? 'Practice flight. Arrows pitch and roll, A holds straight and level, brackets select waypoint.'
            : 'Terrain free camera. WASD move, Q E altitude, drag to look.'
        }
      />
      {stats?.flight && <CockpitOverlay flight={stats.flight} onMirrors={cockpitMirrors} />}
      {stats?.flight && (
        <FlightNavigationOverlay
          key={request.generation}
          flight={stats.flight}
          root={request.root}
          manifestPath={request.path}
          onFlightFocus={() => canvas.current?.focus()}
          onTeleport={teleport}
          onNavigationTarget={navigationTarget}
        />
      )}
      {stats?.flight && <GunStatus flight={stats.flight} />}
      {!flightMode && stats?.name && (
        <ExplorerNavigationOverlay
          key={request.generation}
          stats={stats}
          root={request.root}
          manifestPath={request.path}
          onControlsFocus={() => canvas.current?.focus()}
          onTeleport={teleport}
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
          {!!stats?.paintModes?.length && (
            <label>
              Ground colors{' '}
              <select
                id="terrain-paint"
                value={stats.paint ?? ''}
                onChange={(event) => {
                  setError('');
                  void viewerRef.current
                    ?.setTerrainPaint(event.target.value)
                    .catch((err: unknown) => setError(String(err)));
                }}
              >
                {stats.paintModes.map((mode) => (
                  <option key={mode} value={mode}>
                    {mode === 'satellite'
                      ? 'Satellite imagery'
                      : `${mode[0]?.toUpperCase()}${mode.slice(1)} color map`}
                  </option>
                ))}
              </select>
            </label>
          )}
          {stats?.environment && (
            <section aria-label="Environment">
              <label htmlFor="environment-time">
                Time of day {stats.environment.timeText} · sun{' '}
                {stats.environment.sunElevationDeg.toFixed(1)}° elevation,{' '}
                {stats.environment.sunAzimuthDeg.toFixed(0)}° azimuth
              </label>
              <input
                id="environment-time"
                type="range"
                min="0"
                max="24"
                step="0.01"
                value={stats.environment.timeOfDayHours}
                onChange={(event) => viewerRef.current?.setTimeOfDay(Number(event.target.value))}
                onPointerUp={() => canvas.current?.focus()}
              />
              <label>
                Weather{' '}
                <select
                  id="environment-weather"
                  value={stats.environment.weather}
                  onChange={(event) => {
                    viewerRef.current?.setWeather(event.target.value as WeatherId);
                    canvas.current?.focus();
                  }}
                >
                  {Object.values(WEATHER_PRESETS).map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Wind{' '}
                <select
                  id="environment-wind"
                  value={stats.environment.wind}
                  onChange={(event) => {
                    viewerRef.current?.setWind(event.target.value as WindPresetId);
                    canvas.current?.focus();
                  }}
                >
                  {Object.values(WIND_PRESETS).map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Cloud quality{' '}
                <select
                  id="environment-clouds"
                  value={stats.environment.cloudQuality}
                  onChange={(event) => {
                    viewerRef.current?.setCloudQuality(event.target.value as CloudQuality);
                    canvas.current?.focus();
                  }}
                >
                  {CLOUD_QUALITIES.map((quality) => (
                    <option key={quality} value={quality}>
                      {quality === 'off'
                        ? 'Off'
                        : `${quality[0]?.toUpperCase()}${quality.slice(1)} resolution`}
                    </option>
                  ))}
                </select>
              </label>
              <p>
                {stats.environment.season} · {stats.environment.weatherLabel} ·{' '}
                {stats.environment.windSpeed < 0.05
                  ? 'wind calm'
                  : `wind ${String(Math.round(stats.environment.windBearingDeg) % 360).padStart(3, '0')}° at ${(stats.environment.windSpeed * 1.94384).toFixed(0)} kt`}{' '}
                · {stats.environment.cloudSteps} march steps
              </p>
            </section>
          )}
          <p className="terrain-path">{rootPath}</p>
          {(parseError || error || stats?.error) && (
            <p className="probe-error">
              {parseError || error || stats?.error}
              <br />
              Generate a theater using the terrain pipeline, then copy its folder under the data
              root shown above. Enter its relative manifest path and load again.
            </p>
          )}
          {!error && stats?.status === 'loading' && <p>Loading terrain chunks…</p>}
          <p>
            {flightMode
              ? 'Arrows pitch/roll · Q/E rudder · 1–5 throttle 0/25/50/75/100% · 6 afterburner · W/S fine throttle · T engine · G gear · H hook · F flaps · B speed/wheel brakes · F1 cockpit · F2 locked chase · F3 horizon-up · Shift+arrows look · Shift+/ center · Tab gun · Shift+Tab safety · [ / ] waypoint · A autopilot hold · Ctrl-A fly to waypoint · M mute · R reset.'
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
                  {stats.flight.cameraMode === 'cockpit'
                    ? 'F1 · cockpit'
                    : stats.flight.cameraMode === 'attitude'
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
                    ? 'Imported aircraft samples'
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
                Aircraft{' '}
                <select
                  id="aircraft-selector"
                  value={stats.flight.aircraftId}
                  onChange={(event) => {
                    const url = new URL(window.location.href);
                    url.searchParams.set('aircraft', event.target.value);
                    url.searchParams.set(
                      'flightModel',
                      url.searchParams.get('flightModel') === 'assisted'
                        ? 'assisted'
                        : 'retail-envelope',
                    );
                    url.searchParams.set('flightFuel', String(stats.flight!.fuelFraction));
                    window.location.assign(url.href);
                  }}
                >
                  {Object.entries(AIRCRAFT).map(([id, aircraft]) => (
                    <option key={id} value={id}>
                      {aircraft.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Flight model{' '}
                <select
                  id="flight-model-selector"
                  value={stats.flight.flightModelId}
                  onChange={(event) => {
                    const url = new URL(window.location.href);
                    url.searchParams.set('flightModel', event.target.value);
                    url.searchParams.set('flightFuel', String(stats.flight!.fuelFraction));
                    window.location.assign(url.href);
                  }}
                >
                  <option value="assisted">Preserved assisted</option>
                  <option value="retail-envelope" disabled={!stats.flight.retailProfileAvailable}>
                    Retail PT envelope fit (default)
                  </option>
                  <option
                    value="recovered-envelope"
                    disabled={!stats.flight.nativeEnvelopeAvailable}
                  >
                    Recovered USNF envelope (experimental)
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
              <label htmlFor="flight-fuel">
                Fuel {(stats.flight.fuelFraction * 100).toFixed(1)}% ·{' '}
                {(stats.flight.fuelMassKg / 1000).toFixed(2)} t
              </label>
              <input
                id="flight-fuel"
                type="range"
                min="0"
                max="100"
                step="0.1"
                value={stats.flight.fuelFraction * 100}
                onChange={(event) =>
                  viewerRef.current?.setFuelFraction(Number(event.target.value) / 100)
                }
                onPointerUp={() => canvas.current?.focus()}
              />
              <p>
                Burn {(stats.flight.fuelBurnKgS * 60).toFixed(1)} kg/min
                {stats.flight.flightModelId === 'assisted'
                  ? ' · assisted handling mass held constant'
                  : ''}
              </p>
              {stats.flight.flightProfileSha256 && (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    const values = new FormData(event.currentTarget);
                    const url = new URL(window.location.href);
                    url.searchParams.set('flightFuel', String(stats.flight!.fuelFraction));
                    url.searchParams.set('flightPayload', String(Number(values.get('payload'))));
                    window.location.assign(url.href);
                  }}
                >
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
                    Fuel {(stats.flight.fuelMassKg / 1000).toFixed(2)} t · payload{' '}
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
                <dt>Geometry / edge uploads (estimate)</dt>
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
              <details>
                <summary>About / Data credits</summary>
                <small>{stats.attribution.join(' · ')}</small>
              </details>
            </>
          )}
          <p>
            <a
              href={`?mode=flight&aircraft=${stats?.flight?.aircraftId ?? 'f14'}&flightModel=${stats?.flight?.flightModelId ?? 'retail-envelope'}`}
            >
              Practice runway
            </a>
            {' · '}
            <a
              href={`?mode=flight&flightStart=approach&aircraft=${stats?.flight?.aircraftId ?? 'f14'}&flightModel=${stats?.flight?.flightModelId ?? 'retail-envelope'}`}
            >
              Final approach
            </a>
            {' · '}
            <a
              href={`?mode=flight&flightStart=airborne&aircraft=${stats?.flight?.aircraftId ?? 'f14'}&flightModel=${stats?.flight?.flightModelId ?? 'retail-envelope'}`}
            >
              Airborne practice
            </a>
            {' · '}
            <a href="?mode=explore">Terrain explorer</a>
            {' · '}
            <a href="?view=probe">Renderer diagnostic</a>
          </p>
        </div>
      </main>
    </div>
  );
}
