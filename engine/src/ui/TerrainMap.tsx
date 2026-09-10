import { useEffect, useRef, useState } from 'react';
import type { FsRoot, Platform } from '../platform/Platform';
import {
  loadNavigationMap,
  MAP_ELEVATION_BANDS,
  navigationViewport,
  worldToMap,
  type NavigationMapData,
  type MapWaypoint,
} from '../terrain/navigation-map';
import { Mfd, type MfdButtonSlot } from './Mfd';
import './terrain-map.css';

export interface NavigationMapState {
  status: 'loading' | 'ready' | 'error';
  data?: NavigationMapData;
  error?: string;
}
export function useNavigationMap(
  platform: Platform,
  root: FsRoot,
  manifestPath: string,
): NavigationMapState {
  const key = `${root}:${manifestPath}`;
  const [loaded, setLoaded] = useState<NavigationMapState & { key: string }>({
    key,
    status: 'loading',
  });
  useEffect(() => {
    const abort = new AbortController();
    void loadNavigationMap(platform, root, manifestPath, abort.signal).then(
      (data) => {
        if (!abort.signal.aborted) setLoaded({ key, status: 'ready', data });
      },
      (error: unknown) => {
        if (!abort.signal.aborted)
          setLoaded({
            key,
            status: 'error',
            error: error instanceof Error ? error.message : String(error),
          });
      },
    );
    return () => abort.abort();
  }, [platform, root, manifestPath, key]);
  return loaded.key === key ? loaded : { status: 'loading' };
}

type MapOrientation = 'north-up' | 'heading-up';

export function TerrainMap({
  map,
  aircraft,
  selectedWaypointId,
  onFlightFocus,
  onTeleport,
  markerLabel = 'Aircraft',
}: {
  map: NavigationMapState;
  aircraft: { x: number; z: number; headingDegrees: number };
  selectedWaypointId: number;
  onFlightFocus?: () => void;
  onTeleport?: (waypoint: MapWaypoint) => Promise<void>;
  markerLabel?: 'Aircraft' | 'Camera';
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState(1);
  const [orientation, setOrientation] = useState<MapOrientation>('north-up');
  const rotation = orientation === 'heading-up' ? -aircraft.headingDegrees : 0;
  const [teleporting, setTeleporting] = useState<number | null>(null);
  const [teleportError, setTeleportError] = useState('');
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  async function teleport(waypoint: MapWaypoint) {
    if (!onTeleport || teleporting !== null) return;
    const current = generation.current;
    setTeleporting(waypoint.id);
    setTeleportError('');
    try {
      await onTeleport(waypoint);
    } catch (error) {
      if (current === generation.current)
        setTeleportError(error instanceof Error ? error.message : String(error));
    } finally {
      if (current === generation.current) {
        setTeleporting(null);
        onFlightFocus?.();
      }
    }
  }
  const data = map.data;
  useEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (context && data)
      context.putImageData(
        new ImageData(new Uint8ClampedArray(data.rgba), data.width, data.height),
        0,
        0,
      );
  }, [data]);
  const point = data ? worldToMap(data, aircraft.x, aircraft.z) : undefined;
  const baseViewport = data ? navigationViewport(data, aircraft, zoom) : undefined;
  // A square display spans equal world distances on both axes, including when
  // the source theater is rectangular. Uncovered space retains the hatch.
  const squareHeight =
    data && baseViewport
      ? (baseViewport.width * (data.extents.width / data.width)) /
        (data.extents.height / data.height)
      : 0;
  const northViewport =
    data && baseViewport && point
      ? {
          ...baseViewport,
          height: squareHeight,
          y:
            squareHeight <= data.height
              ? Math.max(0, Math.min(data.height - squareHeight, point.y - squareHeight / 2))
              : (data.height - squareHeight) / 2,
        }
      : undefined;
  // Ownship stays centered when rotating near theater edges. The full raster
  // supplies covered corners; the hatch marks actual space outside the theater.
  const viewport =
    northViewport && point && orientation === 'heading-up'
      ? {
          ...northViewport,
          x: point.x - northViewport.width / 2,
          y: point.y - northViewport.height / 2,
        }
      : northViewport;
  const outside =
    data && point && (point.x < 0 || point.y < 0 || point.x > data.width || point.y > data.height);
  // The five-row button grid centres at 10/30/50/70/90%, and the on-screen
  // `GO n` labels sit at 30/50/70%, so the three waypoints deliberately occupy
  // the middle three buttons rather than starting at the top.
  const teleportButtons: MfdButtonSlot[] = Array.from({ length: 5 }, (_, index) => {
    const waypoint = onTeleport ? data?.waypoints[index - 1] : undefined;
    return waypoint
      ? {
          label: `Teleport to ${waypoint.id} ${waypoint.name}`,
          disabled: teleporting !== null,
          data: { 'data-teleport-id': String(waypoint.id) },
          onClick: () => void teleport(waypoint),
        }
      : null;
  });
  const orientationButton = (mode: MapOrientation): MfdButtonSlot => ({
    label: mode === 'north-up' ? 'North-up map' : 'Heading-up map',
    pressed: orientation === mode,
    onClick: () => {
      setOrientation(mode);
      onFlightFocus?.();
    },
  });
  const zoomButton = (direction: 'in' | 'out'): MfdButtonSlot => ({
    label: direction === 'out' ? 'Zoom map out' : 'Zoom map in',
    disabled: direction === 'out' ? zoom <= 1 : zoom >= 16,
    onClick: () => {
      setZoom(direction === 'out' ? Math.max(1, zoom / 2) : Math.min(16, zoom * 2));
      onFlightFocus?.();
    },
  });
  return (
    <Mfd
      label="Regional navigation map"
      attributes={{
        'data-terrain-map': map.status,
        'data-map-orientation': orientation,
        'data-map-rotation': String(rotation),
      }}
      top={[orientationButton('north-up'), null, null, null, orientationButton('heading-up')]}
      left={{ buttons: teleportButtons, label: 'Waypoint teleport' }}
      bottom={[zoomButton('out'), null, null, null, zoomButton('in')]}
    >
      <>
        <div className="terrain-map-title">
          <span className={orientation === 'north-up' ? 'mfd-active' : ''}>N-UP</span>
          <span>MAP</span>
          <span className={orientation === 'heading-up' ? 'mfd-active' : ''}>HDG-UP</span>
        </div>
        {!data && <p>{map.status === 'error' ? 'Map unavailable' : 'Loading map…'}</p>}
        {map.error && <p className="terrain-map-error">{map.error}</p>}
        {data && point && viewport && (
          <>
            <div className="terrain-map-stage">
              <div className="terrain-map-image">
                <div className="terrain-map-rotor" style={{ transform: `rotate(${rotation}deg)` }}>
                  <canvas
                    style={{
                      width: `${zoom * 100}%`,
                      height: `${(data.height / viewport.height) * 100}%`,
                      left: `${(-viewport.x / data.width) * zoom * 100}%`,
                      top: `${(-viewport.y / viewport.height) * 100}%`,
                    }}
                    ref={canvas}
                    width={data.width}
                    height={data.height}
                    aria-label="Elevation in metres above mean sea level: blue water; green 0, yellow 500, red 1500, brown 2500, white 3500 and above"
                  />
                  <svg
                    viewBox={`${viewport.x} ${viewport.y} ${viewport.width} ${viewport.height}`}
                    preserveAspectRatio="none"
                    data-map-zoom={zoom}
                    data-viewport-x={viewport.x}
                    data-viewport-y={viewport.y}
                    data-viewport-width={viewport.width}
                    data-viewport-height={viewport.height}
                    role="img"
                    aria-label={`${markerLabel} and selected waypoint positions`}
                    data-map-width={data.width}
                    data-map-height={data.height}
                    data-world-width={data.extents.width}
                    data-world-height={data.extents.height}
                  >
                    {data.waypoints.map((waypoint) => {
                      const p = worldToMap(data, waypoint.x, waypoint.z);
                      const selected = waypoint.id === selectedWaypointId;
                      return (
                        <g
                          key={waypoint.id}
                          transform={`translate(${p.x} ${p.y}) scale(${1 / zoom})`}
                          data-waypoint-id={waypoint.id}
                          data-selected={selected}
                          data-world-x={waypoint.x}
                          data-world-z={waypoint.z}
                          className={selected ? 'map-waypoint selected' : 'map-waypoint'}
                        >
                          <title>
                            {waypoint.id}: {waypoint.name}
                          </title>
                          <circle r={selected ? 9 : 6} />
                          <text x="13" y="-10">
                            {waypoint.id}
                          </text>
                        </g>
                      );
                    })}
                    {!outside && (
                      <g
                        transform={`translate(${point.x} ${point.y}) rotate(${aircraft.headingDegrees}) scale(${1 / zoom})`}
                        className="map-aircraft"
                        data-aircraft-marker="true"
                        data-map-x={point.x}
                        data-map-y={point.y}
                        data-heading={aircraft.headingDegrees}
                      >
                        <title>
                          {markerLabel} heading {Math.round(aircraft.headingDegrees)} degrees
                        </title>
                        <path d="M 0 -12 L 8 10 L 0 6 L -8 10 Z" />
                      </g>
                    )}
                  </svg>
                </div>
                <svg
                  data-map-compass="true"
                  className="map-compass"
                  viewBox="0 0 200 200"
                  aria-label={`Compass, ${orientation}, heading ${Math.round(aircraft.headingDegrees)} degrees`}
                >
                  <g transform={`rotate(${rotation} 100 100)`}>
                    <circle cx="100" cy="100" r="72" />
                    {Array.from({ length: 36 }, (_, index) => (
                      <path
                        key={index}
                        transform={`rotate(${index * 10} 100 100)`}
                        d={`M 100 28 v ${index % 9 === 0 ? 8 : index % 3 === 0 ? 5 : 3}`}
                      />
                    ))}
                    {['N', 'E', 'S', 'W'].map((label, index) => {
                      const angle = (index * Math.PI) / 2;
                      const x = 100 + Math.sin(angle) * 83;
                      const y = 100 - Math.cos(angle) * 83;
                      return (
                        <text key={label} x={x} y={y} transform={`rotate(${-rotation} ${x} ${y})`}>
                          {label}
                        </text>
                      );
                    })}
                  </g>
                  <path className="map-heading-index" d="M 96 3 L 100 9 L 104 3" />
                </svg>
                <span className="map-heading-readout">
                  {(Math.round(((aircraft.headingDegrees % 360) + 360) % 360) % 360)
                    .toString()
                    .padStart(3, '0')}
                  °
                </span>
              </div>
              {onTeleport && data && (
                <div className="mfd-waypoint-buttons">
                  {data.waypoints.map((waypoint, index) => (
                    <div
                      className="mfd-waypoint-control"
                      key={waypoint.id}
                      style={{ top: `${30 + index * 20}%` }}
                    >
                      <span className={waypoint.id === selectedWaypointId ? 'mfd-active' : ''}>
                        {teleporting === waypoint.id ? 'LOAD…' : `GO ${waypoint.id}`}
                        <small>{waypoint.name}</small>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div
              className="terrain-map-distance"
              aria-label={`Map distance scale: ${viewport.scaleNm} nautical miles`}
            >
              <div
                className="terrain-map-scale-labels"
                style={{ width: `${viewport.scalePercent}%` }}
              >
                <span>0</span>
                <span>{viewport.scaleNm} NM</span>
              </div>
              <div
                style={{ width: `${viewport.scalePercent}%` }}
                data-map-scale-nm={viewport.scaleNm}
                className="terrain-map-scale"
              >
                {Array.from({ length: 4 }, (_, index) => (
                  <span key={index} />
                ))}
              </div>
            </div>
            <div
              className="terrain-map-elevation"
              aria-label="Elevation legend in metres above mean sea level"
            >
              <div
                className="terrain-map-legend"
                aria-hidden="true"
                style={{
                  background: `linear-gradient(to right, ${MAP_ELEVATION_BANDS.map((band) => `rgb(${band.rgb.join(' ')}) ${(band.height / data.whiteElevation) * 100}%`).join(', ')})`,
                }}
              />
              <div className="terrain-map-elevation-labels">
                {MAP_ELEVATION_BANDS.map((band, index) => (
                  <span
                    key={band.height}
                    style={{
                      left: `${(band.height / data.whiteElevation) * 100}%`,
                      transform: `translateX(${index === 0 ? 0 : index === MAP_ELEVATION_BANDS.length - 1 ? -100 : -50}%)`,
                    }}
                  >
                    {band.height}
                  </span>
                ))}
              </div>
              <div className="terrain-map-caption">
                <span>BLUE WATER</span>
                <span>ELEV m MSL</span>
              </div>
            </div>
            {teleportError && (
              <p className="terrain-map-error" role="alert">
                {teleportError}
              </p>
            )}
            {outside && <p>{markerLabel} outside map</p>}
            <div className="terrain-map-controls">
              <span>RNG −</span>
              <span>{zoom}×</span>
              <span>RNG +</span>
            </div>
          </>
        )}
      </>
    </Mfd>
  );
}
