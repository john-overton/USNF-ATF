import { useEffect } from 'react';
import { getPlatform } from '../platform';
import type { FsRoot } from '../platform/Platform';
import { TerrainMap, useNavigationMap } from '../ui/TerrainMap';
import type { FlightDiagnostics } from './FlightLayer';
import { FlightHud } from './FlightHud';
import { flightHudReadout } from './hud';
import { waypointGuidance } from './navigation';
import type { MapWaypoint } from '../terrain/navigation-map';

/** Map loading is independent of contact physics and survives helper minimization. */
export function FlightNavigationOverlay({
  flight,
  root,
  manifestPath,
  onFlightFocus,
  onTeleport,
  onNavigationTarget,
}: {
  flight: FlightDiagnostics;
  root: FsRoot;
  manifestPath: string;
  onFlightFocus: () => void;
  onTeleport: (waypoint: MapWaypoint) => Promise<void>;
  onNavigationTarget: (waypoint: MapWaypoint | undefined) => void;
}) {
  const map = useNavigationMap(getPlatform(), root, manifestPath);
  const heading = flightHudReadout(flight.state, flight.telemetry).heading;
  const selectedId = flight.waypointIndex + 1;
  const waypoint = map.data?.waypoints.find((point) => point.id === selectedId);
  // The waypoint autopilot steers to whatever is selected here, so the flight layer
  // is told on every change of selection rather than on engagement alone.
  useEffect(() => {
    onNavigationTarget(waypoint);
  }, [onNavigationTarget, waypoint]);
  return (
    <>
      <FlightHud
        flight={flight}
        flapFraction={flight.systems.flapFraction}
        airbrakeFraction={flight.systems.airbrakeFraction}
        navigation={waypoint && waypointGuidance(flight.position, heading, waypoint)}
        autopilot={flight.autopilot}
        navigationStatus={
          waypoint
            ? undefined
            : `WP ${selectedId} · ${map.status === 'loading' ? 'LOADING NAVIGATION' : 'UNAVAILABLE'} [ ]`
        }
      />
      <TerrainMap
        map={map}
        aircraft={{ x: flight.position.x, z: flight.position.z, headingDegrees: heading }}
        selectedWaypointId={selectedId}
        onFlightFocus={onFlightFocus}
        onTeleport={onTeleport}
      />
    </>
  );
}
