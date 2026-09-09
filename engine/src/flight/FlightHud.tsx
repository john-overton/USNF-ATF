import { useId } from 'react';
import type { FlightDiagnostics } from './FlightLayer';
import { flightHudReadout, wrapHeading, HUD_PITCH_PIXELS_PER_DEGREE } from './hud';

/** Original SVG instruments; the retail HUD is an x86 plug-in, not browser artwork. */
export function FlightHud({
  flight,
  flapFraction,
  airbrakeFraction,
}: {
  flight: FlightDiagnostics;
  flapFraction?: number;
  airbrakeFraction?: number;
}) {
  const clip = useId();
  const hud = flightHudReadout(flight.state, flight.telemetry);
  const headingBase = Math.floor(hud.heading / 10) * 10;
  const warning =
    flight.status === 'crashed'
      ? 'CRASHED'
      : flight.status === 'waiting-terrain'
        ? 'WAITING FOR TERRAIN'
        : flight.stalled
          ? 'STALL'
          : '';
  const systems = [
    ['GEAR', flight.systems.gearFraction],
    ['FLAP', flapFraction ?? 0],
    ['BRAKE', airbrakeFraction ?? 0],
    ['HOOK', flight.systems.hookFraction],
  ] as const;
  return (
    <svg
      data-flight-hud="true"
      role="img"
      aria-label={`Flight HUD. Heading ${hud.headingText}, speed ${Math.round(hud.speedKnots)} knots true, altitude ${Math.round(hud.altitudeFeet)} feet MSL, throttle ${Math.round(flight.throttle * 100)} percent.`}
      viewBox="0 0 760 620"
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        width: 'min(570px, 51vw)',
        maxHeight: '66vh',
        pointerEvents: 'none',
        color: '#66ff66',
        fontWeight: 400,
        overflow: 'visible',
      }}
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      shapeRendering="crispEdges"
      textRendering="optimizeSpeed"
    >
      <defs>
        <clipPath id={clip}>
          <rect x="220" y="140" width="320" height="270" />
        </clipPath>
      </defs>
      <g
        fill="currentColor"
        stroke="none"
        fontFamily="'Courier New', Courier, monospace"
        fontSize="15"
        textAnchor="middle"
      >
        <text x="380" y="33" fontSize="12">
          FLIGHT HUD · AIRCRAFT ATTITUDE
        </text>
      </g>
      <path d="M230 89H530 M380 88l-6 9h12z" />
      {Array.from({ length: 9 }, (_, i) => headingBase + (i - 4) * 10).map((heading) => {
        const x = 380 + (heading - hud.heading) * 5;
        if (x < 230 || x > 530) return null;
        return (
          <g key={heading}>
            <path d={`M${x} 88v-9`} />
            <text
              x={x}
              y="71"
              fill="currentColor"
              stroke="none"
              textAnchor="middle"
              fontFamily="'Courier New', Courier, monospace"
              fontSize="14"
            >
              {String(Math.round(wrapHeading(heading) / 10)).padStart(2, '0')}
            </text>
          </g>
        );
      })}
      <text
        data-hud="heading"
        x="380"
        y="120"
        fill="currentColor"
        stroke="none"
        textAnchor="middle"
        fontFamily="'Courier New', Courier, monospace"
        fontSize="19"
      >
        {hud.headingText}°
      </text>
      <g clipPath={`url(#${clip})`}>
        <g transform={`translate(380 300) rotate(${hud.rollDegrees})`}>
          {Array.from({ length: 37 }, (_, i) => (i - 18) * 5).map((pitch) => {
            const y = (hud.pitchDegrees - pitch) * HUD_PITCH_PIXELS_PER_DEGREE;
            if (Math.abs(y) > 240) return null;
            const width = pitch === 0 ? 125 : 65;
            return (
              <g key={pitch} data-hud-pitch={pitch} transform={`translate(0 ${y})`}>
                <path
                  d={`M-${width} 0H-22 M22 0H${width}`}
                  strokeDasharray={pitch < 0 ? '7 5' : undefined}
                />
                {pitch !== 0 && (
                  <>
                    <path
                      d={`M-${width} 0v${pitch < 0 ? -5 : 5} M${width} 0v${pitch < 0 ? -5 : 5}`}
                    />
                    <text
                      x={-width - 13}
                      y="5"
                      fill="currentColor"
                      stroke="none"
                      fontSize="13"
                      fontFamily="'Courier New', Courier, monospace"
                      textAnchor="end"
                    >
                      {pitch}
                    </text>
                    <text
                      x={width + 13}
                      y="5"
                      fill="currentColor"
                      stroke="none"
                      fontSize="13"
                      fontFamily="'Courier New', Courier, monospace"
                    >
                      {pitch}
                    </text>
                  </>
                )}
              </g>
            );
          })}
        </g>
      </g>
      <path d="M340 300h24l8 8 8-8 8 8 8-8h24" strokeWidth="1" />
      {hud.path.visible && (
        <g
          data-hud="flight-path"
          transform={`translate(${380 + hud.path.x} ${300 + hud.path.y})`}
          strokeDasharray={hud.path.limited ? '3 3' : undefined}
        >
          <circle r="8" />
          <path d="M-8 0h-13 M8 0h13 M0-8v-8" />
        </g>
      )}
      <g transform="translate(380 300)">
        {[-60, -30, 0, 30, 60].map((bank) => (
          <path key={bank} transform={`rotate(${bank})`} d="M0-169v-9" />
        ))}
        <path transform={`rotate(${hud.rollDegrees})`} d="M0-161l-5 8h10z" />
      </g>
      <g
        fill="currentColor"
        stroke="none"
        fontFamily="'Courier New', Courier, monospace"
        fontSize="16"
      >
        <text x="110" y="225" fontSize="12">
          TAS KT
        </text>
        <text data-hud="speed" x="110" y="254" fontSize="29">
          {Math.round(hud.speedKnots)}
        </text>
        <text x="110" y="285">
          M {flight.telemetry.mach.toFixed(2)}
        </text>
        <text x="110" y="313">
          G {flight.loadFactor.toFixed(1)}
        </text>
        <text x="555" y="225" fontSize="12">
          ALT FT MSL
        </text>
        <text data-hud="altitude" x="555" y="254" fontSize="29">
          {Math.round(hud.altitudeFeet).toLocaleString('en-US')}
        </text>
        <text x="555" y="285">
          AGL {hud.clearanceFeet === null ? '—' : Math.round(hud.clearanceFeet)}
        </text>
        <text x="555" y="313" fontSize="13">
          V/S {Math.round(hud.verticalFeetPerMinute / 10) * 10}
        </text>
        <text x="380" y="435" textAnchor="middle" fontSize="13">
          BANK {Math.round(-hud.rollDegrees)}° · PITCH {Math.round(hud.pitchDegrees)}°
        </text>
        <text data-hud="throttle" x="110" y="490">
          THR {Math.round(flight.throttle * 100)}%{flight.afterburner ? ' AFT' : ''}
        </text>
        <text x="110" y="514" fontSize="13">
          {!flight.engineRunning
            ? 'ENGINE OFF'
            : flight.systems.engineSpool < 0.99
              ? 'ENGINE START'
              : 'ENGINE ON'}
        </text>
        <text x="650" y="490" textAnchor="end" fontSize="13">
          {flight.cameraMode === 'attitude' ? 'F2 LOCKED CHASE' : 'F3 WORLD-UP CHASE'}
        </text>
        <text x="650" y="514" textAnchor="end" fontSize="13">
          {flight.controls.brake && flight.status === 'grounded' ? 'WHEEL BRAKE' : ''}
        </text>
        {systems.map(([name, fraction], i) => (
          <text
            key={name}
            data-hud={name.toLowerCase()}
            x="650"
            y={125 + i * 22}
            textAnchor="end"
            opacity={fraction > 0.01 ? 1 : 0}
          >
            {name}
            {fraction > 0.01 && fraction < 0.99 ? ' ↕' : ''}
          </text>
        ))}
        <text data-hud="warning" x="380" y="590" textAnchor="middle" fontSize="21" fill="#ffd481">
          {warning}
        </text>
      </g>
    </svg>
  );
}
