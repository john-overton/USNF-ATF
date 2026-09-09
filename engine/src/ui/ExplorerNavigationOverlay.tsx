import { useState } from 'react';
import { getPlatform } from '../platform';
import type { FsRoot } from '../platform/Platform';
import type { MapWaypoint } from '../terrain/navigation-map';
import type { TerrainDiagnostics } from '../terrain/viewer';
import { wrapHeading } from '../flight/hud';
import { TerrainMap, useNavigationMap } from './TerrainMap';

export function ExplorerNavigationOverlay({
  stats,
  root,
  manifestPath,
  onTeleport,
  onControlsFocus,
}: {
  stats: TerrainDiagnostics;
  root: FsRoot;
  manifestPath: string;
  onTeleport: (waypoint: MapWaypoint) => Promise<void>;
  onControlsFocus: () => void;
}) {
  const map = useNavigationMap(getPlatform(), root, manifestPath);
  const [selectedId, setSelectedId] = useState(1);
  return (
    <TerrainMap
      map={map}
      aircraft={{ ...stats.camera, headingDegrees: wrapHeading(180 + (stats.yaw * 180) / Math.PI) }}
      markerLabel="Camera"
      selectedWaypointId={selectedId}
      onFlightFocus={onControlsFocus}
      onTeleport={async (waypoint) => {
        await onTeleport(waypoint);
        setSelectedId(waypoint.id);
      }}
    />
  );
}
