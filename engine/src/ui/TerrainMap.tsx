import { useEffect, useRef, useState } from 'react';
import type { FsRoot, Platform } from '../platform/Platform';
import {
  loadNavigationMap,
  navigationViewport,
  worldToMap,
  type NavigationMapData,
} from '../terrain/navigation-map';
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

export function TerrainMap({
  map,
  aircraft,
  selectedWaypointId,
  onFlightFocus,
}: {
  map: NavigationMapState;
  aircraft: { x: number; z: number; headingDegrees: number };
  selectedWaypointId: number;
  onFlightFocus?: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState(1);
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
  const viewport = data ? navigationViewport(data, aircraft, zoom) : undefined;
  const outside =
    data && point && (point.x < 0 || point.y < 0 || point.x > data.width || point.y > data.height);
  return (
    <aside
      className="terrain-map"
      aria-label="Regional navigation map"
      data-terrain-map={map.status}
    >
      <div className="terrain-map-title">
        REGION <span>N ↑</span>
      </div>
      {!data && <p>{map.status === 'error' ? 'Map unavailable' : 'Loading map…'}</p>}
      {map.error && <p className="terrain-map-error">{map.error}</p>}
      {data && point && viewport && (
        <>
          <div
            className="terrain-map-image"
            style={{ aspectRatio: `${data.width} / ${data.height}` }}
          >
            <canvas
              style={{
                width: `${zoom * 100}%`,
                height: `${zoom * 100}%`,
                left: `${(-viewport.x / data.width) * zoom * 100}%`,
                top: `${(-viewport.y / data.height) * zoom * 100}%`,
              }}
              ref={canvas}
              width={data.width}
              height={data.height}
              aria-label="Regional elevation: blue water; green, yellow, red, brown rising land; white highest five percent"
            />
            <svg
              viewBox={`${viewport.x} ${viewport.y} ${viewport.width} ${viewport.height}`}
              data-map-zoom={zoom}
              data-viewport-x={viewport.x}
              data-viewport-y={viewport.y}
              data-viewport-width={viewport.width}
              data-viewport-height={viewport.height}
              role="img"
              aria-label="Aircraft and selected waypoint positions"
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
                  <title>Aircraft heading {Math.round(aircraft.headingDegrees)} degrees</title>
                  <path d="M 0 -12 L 8 10 L 0 6 L -8 10 Z" />
                </g>
              )}
            </svg>
          </div>
          <div className="terrain-map-controls">
            <button
              type="button"
              aria-label="Zoom map out"
              disabled={zoom <= 1}
              onClick={() => {
                setZoom(Math.max(1, zoom / 2));
                onFlightFocus?.();
              }}
            >
              −
            </button>
            <span>{zoom}×</span>
            <button
              type="button"
              aria-label="Zoom map in"
              disabled={zoom >= 16}
              onClick={() => {
                setZoom(Math.min(16, zoom * 2));
                onFlightFocus?.();
              }}
            >
              +
            </button>
          </div>
          <div className="terrain-map-distance">
            <div
              style={{ width: `${viewport.scalePercent}%` }}
              data-map-scale-nm={viewport.scaleNm}
              className="terrain-map-scale"
            />
            <span>{viewport.scaleNm} NM</span>
          </div>
          <div className="terrain-map-legend" aria-hidden="true" />
          <div className="terrain-map-caption">
            <span>{Math.round(data.minLandElevation)} m</span>
            <span>White ≥ {Math.round(data.whiteElevation)} m</span>
          </div>
          <div className="terrain-map-caption">
            <span>{Math.round(data.extents.width / zoom / 1000)} km across</span>
            <span>[ ] WAYPOINT</span>
          </div>
          {outside && <p>Aircraft outside map</p>}
        </>
      )}
    </aside>
  );
}
