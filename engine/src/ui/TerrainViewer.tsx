import type { CockpitMirrorLayout } from '../terrain/mirrors';
import { createPortal } from 'react-dom';
import { CockpitOverlay, GunStatus } from '../flight/CockpitOverlay';
import { AIRCRAFT } from '../flight/aircraft-catalog';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getPlatform } from '../platform';
import { FlightNavigationOverlay } from '../flight/FlightNavigationOverlay';
import type { FsRoot } from '../platform/Platform';
import { startTerrainViewer, type TerrainDiagnostics } from '../terrain/viewer';
import { ExplorerNavigationOverlay } from './ExplorerNavigationOverlay';
import { missionQuery, type MissionParams } from '../sim/mission/params';
import type { GunMode } from '../data/retail-gun';
import { GunModeSelect } from './GunModeSelect';
import type { MapWaypoint } from '../terrain/navigation-map';
import { THEATERS, theaterById } from '../terrain/theaters';
import {
  CLOUD_QUALITIES,
  dayOfYearFor,
  monthDayFor,
  WEATHER_PRESETS,
  WIND_PRESETS,
  type CloudQuality,
  type WeatherId,
  type WindPresetId,
} from '../sim/environment';

const MOON_PHASE_ICONS = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'] as const;
const MOON_PHASE_NAMES = [
  'New moon',
  'Waxing crescent',
  'First quarter',
  'Waxing gibbous',
  'Full moon',
  'Waning gibbous',
  'Last quarter',
  'Waning crescent',
] as const;

export function moonPhaseIcon(phase: number, waxing: boolean): { icon: string; label: string } {
  const brightness = Math.max(0, Math.min(4, Math.round(phase * 4)));
  const index = waxing ? brightness : (8 - brightness) % 8;
  return { icon: MOON_PHASE_ICONS[index]!, label: MOON_PHASE_NAMES[index]! };
}

function dateInputValue(year: number, dayOfYear: number): string {
  const { month, day } = monthDayFor(dayOfYear);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function dayFromDateInput(value: string): { year: number; dayOfYear: number } | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const year = Number(match[1]),
    month = Number(match[2]),
    day = Number(match[3]);
  if (year < 1600 || year > 2400 || month < 1 || month > 12 || day < 1 || day > 31)
    return undefined;
  return { year, dayOfYear: dayOfYearFor(month, day) };
}

function EnvironmentDatePicker({
  environment,
  onChange,
}: {
  environment: TerrainDiagnostics['environment'];
  onChange: (year: number, dayOfYear: number) => void;
}) {
  const moon = moonPhaseIcon(environment.moonPhase, environment.moonWaxing);
  return (
    <label>
      Date{' '}
      <span
        aria-label={`${moon.label}, ${Math.round(environment.moonPhase * 100)}% illuminated`}
        title={moon.label}
      >
        {moon.icon}
      </span>{' '}
      <input
        aria-label="Date"
        type="date"
        value={dateInputValue(environment.year, environment.dayOfYear)}
        onChange={(event) => {
          const next = dayFromDateInput(event.target.value);
          if (next) onChange(next.year, next.dayOfYear);
        }}
      />
    </label>
  );
}

/** The WebGL host for both the explorer and a flight; the shell decides which. */
export function TerrainViewer({
  mission,
  parseError = '',
  paused = false,
  onGunMode,
  onMission,
  settingsHost,
}: {
  mission: MissionParams;
  /** A query the shell could not read; shown here because this is where errors live. */
  parseError?: string;
  paused?: boolean;
  onGunMode?: (mode: GunMode) => void;
  onMission?: (mission: MissionParams) => void;
  settingsHost?: HTMLElement | null;
}) {
  const flightMode = mission.mode !== 'explorer';
  const [root, setRoot] = useState<FsRoot>(mission.root);
  const [path, setPath] = useState(mission.manifestPath);
  const [request, setRequest] = useState({ root, path, generation: 0 });
  const sessionQuery = (patch: Partial<MissionParams> = {}) => {
    const query = missionQuery({
      ...mission,
      root: request.root,
      manifestPath: request.path,
      ...patch,
    });
    query.set('view', 'terrain');
    return query.toString();
  };
  const sessionUrl = () => {
    const url = new URL(window.location.href);
    url.search = sessionQuery();
    return url;
  };
  const [stats, setStats] = useState<TerrainDiagnostics>();
  const [error, setError] = useState('');
  const [panelMinimized, setPanelMinimized] = useState(mission.mode === 'quick-fight');
  const [rootPath, setRootPath] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<ReturnType<typeof startTerrainViewer> | null>(null);
  // Gun selection is a live setting; changing it must not recreate the world.
  const sceneKey = JSON.stringify({ ...mission, gunMode: undefined });
  const missionRef = useRef(mission);
  useEffect(() => {
    missionRef.current = mission;
  }, [mission]);
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
        { ...missionRef.current, root: request.root, manifestPath: request.path },
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
  }, [request, sceneKey, parseError]);
  useEffect(() => {
    viewerRef.current?.setGunMode(mission.gunMode);
  }, [mission.gunMode, request, sceneKey, parseError]);
  useEffect(() => {
    viewerRef.current?.setPaused(paused);
  }, [paused, request, sceneKey, parseError]);
  return (
    <div className="probe-root">
      {settingsHost &&
        createPortal(
          <section className="escape-settings" aria-label="Live flight settings">
            <GunModeSelect
              value={mission.gunMode}
              {...(onGunMode ? { onChange: onGunMode } : {})}
            />
            <p>
              Gun changes retain ammunition and combat state, clear rounds in flight and safe the
              guns.
            </p>
            {stats?.environment && (
              <>
                <div className="environment-clock-controls">
                  <label>
                    Time of day{' '}
                    <input
                      aria-label="Time of day"
                      type="range"
                      min="0"
                      max="24"
                      step="0.25"
                      value={stats.environment.timeOfDayHours}
                      onChange={(e) => viewerRef.current?.setTimeOfDay(Number(e.target.value))}
                    />
                  </label>
                  <EnvironmentDatePicker
                    environment={stats.environment}
                    onChange={(year, dayOfYear) => viewerRef.current?.setDate(year, dayOfYear)}
                  />
                </div>
                <label>
                  Weather{' '}
                  <select
                    aria-label="Weather"
                    value={stats.environment.weather}
                    onChange={(e) => viewerRef.current?.setWeather(e.target.value as WeatherId)}
                  >
                    {Object.values(WEATHER_PRESETS).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Wind{' '}
                  <select
                    aria-label="Wind"
                    value={stats.environment.wind}
                    onChange={(e) => viewerRef.current?.setWind(e.target.value as WindPresetId)}
                  >
                    {Object.values(WIND_PRESETS).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Cloud appearance{' '}
                  <select
                    aria-label="Cloud appearance"
                    value={stats.environment.cloudAppearance}
                    onChange={(event) => {
                      viewerRef.current?.setCloudAppearance(
                        event.target.value as 'solid' | 'volume',
                      );
                      canvas.current?.focus();
                    }}
                  >
                    <option value="solid">Solid exterior</option>
                    <option value="volume">Volumetric</option>
                  </select>
                </label>
                <label>
                  Ground fog (200–600 ft AGL){' '}
                  <input
                    type="checkbox"
                    aria-label="Ground fog"
                    checked={stats.environment.groundFog}
                    onChange={(e) => viewerRef.current?.setGroundFog(e.target.checked)}
                  />
                </label>
                <label>
                  Cloud quality{' '}
                  <select
                    aria-label="Cloud quality"
                    value={stats.environment.cloudQuality}
                    onChange={(e) =>
                      viewerRef.current?.setCloudQuality(e.target.value as CloudQuality)
                    }
                  >
                    {CLOUD_QUALITIES.map((q) => (
                      <option key={q} value={q}>
                        {q}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            {!!stats?.paintModes?.length && (
              <label>
                Ground colors{' '}
                <select
                  aria-label="Ground colors"
                  value={stats.paint ?? ''}
                  onChange={(e) => {
                    void viewerRef.current
                      ?.setTerrainPaint(e.target.value)
                      .catch((e: unknown) => setError(String(e)));
                  }}
                >
                  {stats.paintModes.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {stats?.flight && (
              <label>
                <input
                  type="checkbox"
                  checked={stats.flight.music.enabled}
                  onChange={(e) => viewerRef.current?.setMusicEnabled(e.target.checked)}
                />{' '}
                In-flight music enabled
              </label>
            )}
            <p>
              These settings apply to the current flight without restarting it. Aircraft and
              flight-model changes are not applied mid-flight here.
            </p>
            {error && <p role="alert">{error}</p>}
          </section>,
          settingsHost,
        )}
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
          <h1>
            {mission.mode === 'quick-fight'
              ? 'Quick mission tools'
              : flightMode
                ? 'Practice flight'
                : 'Terrain explorer'}
          </h1>
          {flightMode && (
            <button
              type="button"
              aria-label={`${panelMinimized ? 'Restore' : 'Minimize'} ${mission.mode === 'quick-fight' ? 'quick mission tools' : 'practice flight panel'}`}
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
          <GunModeSelect value={mission.gunMode} {...(onGunMode ? { onChange: onGunMode } : {})} />
          <small>
            Shared trailing pipper. Changing mode clears airborne rounds and safes guns; ammunition
            and combat are retained.
          </small>
          {stats?.flight?.gun.mode === 'retail' && <small>{stats.flight.gun.modeNote}</small>}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setError('');
              setStats(undefined);
              setRequest({ root, path, generation: request.generation + 1 });
            }}
          >
            <label>
              Theater{' '}
              <select
                id="terrain-theater"
                aria-label="Theater selection"
                value={mission.theater}
                onChange={(event) => {
                  const theater = theaterById(event.target.value);
                  if (!theater) return;
                  setRoot('appData');
                  setPath(theater.manifestPath);
                  setError('');
                  setStats(undefined);
                  setRequest({
                    root: 'appData',
                    path: theater.manifestPath,
                    generation: request.generation + 1,
                  });
                  onMission?.({
                    ...mission,
                    theater: theater.id,
                    root: 'appData',
                    manifestPath: theater.manifestPath,
                  });
                }}
              >
                {THEATERS.map((theater) => (
                  <option key={theater.id} value={theater.id}>
                    {theater.name}
                  </option>
                ))}
              </select>
            </label>
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
              <div className="environment-clock-controls">
                <div>
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
                    onChange={(event) =>
                      viewerRef.current?.setTimeOfDay(Number(event.target.value))
                    }
                    onPointerUp={() => canvas.current?.focus()}
                  />
                </div>
                <EnvironmentDatePicker
                  environment={stats.environment}
                  onChange={(year, dayOfYear) => {
                    viewerRef.current?.setDate(year, dayOfYear);
                    canvas.current?.focus();
                  }}
                />
              </div>
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
                Cloud appearance{' '}
                <select
                  aria-label="Cloud appearance"
                  value={stats.environment.cloudAppearance}
                  onChange={(event) => {
                    viewerRef.current?.setCloudAppearance(event.target.value as 'solid' | 'volume');
                    canvas.current?.focus();
                  }}
                >
                  <option value="solid">Solid exterior</option>
                  <option value="volume">Volumetric</option>
                </select>
              </label>
              <label>
                Ground fog (200–600 ft AGL){' '}
                <input
                  type="checkbox"
                  id="environment-fog"
                  aria-label="Ground fog"
                  checked={stats.environment.groundFog}
                  onChange={(event) => {
                    viewerRef.current?.setGroundFog(event.target.checked);
                    canvas.current?.focus();
                  }}
                />
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
              <label>
                <input
                  type="checkbox"
                  checked={stats.flight.music.enabled}
                  onChange={(event) => viewerRef.current?.setMusicEnabled(event.target.checked)}
                />
                In-flight music · {stats.flight.music.situation}
              </label>
              <label>
                Music volume (N toggles music, M mutes all)
                <input
                  type="range"
                  aria-label="Music volume"
                  min="0"
                  max="1"
                  step="0.05"
                  value={stats.flight.music.volume}
                  onChange={(event) =>
                    viewerRef.current?.setMusicVolume(Number(event.target.value))
                  }
                />
              </label>
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
                    const url = sessionUrl();
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
                    const url = sessionUrl();
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
                    const url = sessionUrl();
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
                <dt>World X / north / altitude</dt>
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
              href={`?${sessionQuery({ mode: 'free-flight', start: 'runway', opponents: [], camera: {} })}`}
            >
              Practice runway
            </a>
            {' · '}
            <a
              href={`?${sessionQuery({ mode: 'free-flight', start: 'approach', opponents: [], camera: {} })}`}
            >
              Final approach
            </a>
            {' · '}
            <a
              href={`?${sessionQuery({ mode: 'free-flight', start: 'airborne', opponents: [], camera: {} })}`}
            >
              Airborne practice
            </a>
            {' · '}
            <a href={`?${sessionQuery({ mode: 'explorer', opponents: [] })}`}>Terrain explorer</a>
            {' · '}
            <a href="?view=probe">Renderer diagnostic</a>
          </p>
        </div>
      </main>
    </div>
  );
}
