import type { CockpitMirrorLayout } from '../terrain/mirrors';
import { cockpitViewportRect } from './cockpit-layout';
import { useEffect, useState } from 'react';
import { getPlatform } from '../platform';
import type { FlightDiagnostics } from './FlightLayer';
import { cockpitLook, parseRetailCockpit, type RetailCockpit } from './RetailCockpit';

/** The original retail transparent frame fills the flight viewport at any window size. */
export function CockpitOverlay({
  flight,
  onMirrors,
}: {
  flight: FlightDiagnostics;
  onMirrors: (layout: CockpitMirrorLayout) => void;
}) {
  const [loaded, setLoaded] = useState<{ id: string; cockpit?: RetailCockpit; error?: string }>();
  useEffect(() => {
    let active = true;
    const id = flight.aircraftId;
    const load = async () => {
      try {
        const text = await getPlatform().fs.readText('appData', `cockpits/${id}.json`);
        if (text.length > 4_100_000) throw new Error('Cockpit manifest exceeds size limit');
        const cockpit = parseRetailCockpit(JSON.parse(text), id);
        if (active) setLoaded({ id, cockpit });
      } catch (error) {
        if (active)
          setLoaded({ id, error: error instanceof Error ? error.message : String(error) });
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [flight.aircraftId]);
  const cockpit = loaded?.id === flight.aircraftId ? loaded.cockpit : undefined;
  useEffect(() => {
    const look = cockpitLook(flight.viewYawRad, flight.viewPitchRad);
    onMirrors({
      regions: (cockpit?.mirrors ?? []).map((mirror) => ({
        ...mirror,
        ...cockpitViewportRect(mirror, flight.viewYawRad, flight.viewPitchRad),
      })),
      visible: flight.cameraMode === 'cockpit' && !!cockpit,
      opacity: look.opacity,
    });
  }, [cockpit, flight.cameraMode, flight.viewYawRad, flight.viewPitchRad, onMirrors]);
  useEffect(() => () => onMirrors({ regions: [], visible: false, opacity: 0 }), [onMirrors]);
  if (flight.cameraMode !== 'cockpit') return null;
  const look = cockpitLook(flight.viewYawRad, flight.viewPitchRad);
  const art = cockpitViewportRect(
    { x: 0, y: 0, width: 1, height: 1 },
    flight.viewYawRad,
    flight.viewPitchRad,
  );
  return (
    <div
      data-cockpit-overlay={cockpit ? flight.aircraftId : 'unavailable'}
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}
    >
      {cockpit ? (
        <img
          src={`data:image/png;base64,${cockpit.pngBase64}`}
          alt={cockpit.label}
          draggable={false}
          onError={() =>
            setLoaded({ id: flight.aircraftId, error: 'Cockpit PNG could not decode' })
          }
          style={{
            position: 'absolute',
            left: `${art.x * 100}%`,
            top: `${art.y * 100}%`,
            width: `${art.width * 100}%`,
            height: `${art.height * 100}%`,
            objectFit: 'fill',
            opacity: look.opacity,
          }}
        />
      ) : (
        <small
          style={{
            position: 'absolute',
            left: '50%',
            bottom: 18,
            transform: 'translateX(-50%)',
            background: '#101820cc',
            padding: '6px 12px',
          }}
        >
          {loaded?.id === flight.aircraftId
            ? 'Cockpit artwork unavailable · import this aircraft’s cockpit'
            : 'Loading cockpit…'}
        </small>
      )}
    </div>
  );
}

/** Kept outside the helper so arming state is visible in cockpit and chase views. */
export function GunStatus({ flight }: { flight: FlightDiagnostics }) {
  const gun = flight.gun;
  return (
    <div
      data-gun-status={gun.safe ? 'safe' : 'armed'}
      style={{
        position: 'absolute',
        left: '50%',
        bottom: 44,
        transform: 'translateX(-50%)',
        pointerEvents: 'none',
        color: gun.safe ? '#8fe3ac' : '#ffcd65',
        background: '#101820dc',
        border: '1px solid currentColor',
        padding: '6px 12px',
        textAlign: 'center',
      }}
    >
      {gun.available
        ? `${gun.safe ? 'SAFE' : 'ARMED'} · ${gun.name} · ${gun.remaining} RDS`
        : 'GUN UNAVAILABLE · import aircraft gun'}
      <small style={{ display: 'block' }}>Shift+Tab safety · Tab fire</small>
      {flight.combat && (
        <>
          <small style={{ display: 'block' }}>
            Damage {Math.round(flight.combat.damagePercent)}% · Hits {flight.combat.hits} · Kills{' '}
            {flight.combat.kills}
          </small>
          <small style={{ display: 'block' }}>
            {flight.combat.target
              ? `Target ${flight.combat.target.id} · ${flight.combat.target.aircraft.toUpperCase()} · ${(flight.combat.target.rangeM / 1000).toFixed(2)} km · ${Math.round(flight.combat.target.damagePercent)}% damage`
              : 'No visual contact'}{' '}
            · C next target
          </small>
          {flight.combat.dataSource !== 'retail' && (
            <small style={{ display: 'block' }}>Original fallback combat values in use</small>
          )}
          {['victory', 'defeat'].includes(flight.combat.outcome) && (
            <strong style={{ display: 'block' }}>
              {flight.combat.outcome.toUpperCase()} · Escape for debrief
            </strong>
          )}
          {flight.combat.departureProtected && flight.combat.outcome === 'active' && (
            <strong style={{ display: 'block' }}>
              DEPARTURE CLEAR · Climb above 100 m AGL ·{' '}
              {Math.ceil(flight.combat.departureSecondsRemaining)}s to enemy entry
            </strong>
          )}
        </>
      )}
    </div>
  );
}
