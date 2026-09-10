import type { MissionParams } from '../../sim/mission/params';
import { MenuScreen } from './MenuScreen';
import type { MenuAssets } from './assets';
import { debriefLayout } from './layout';
import type { FlightSummary, MenuAction } from './navigation';
import { AIRCRAFT } from '../../flight/aircraft-catalog';

/** Minutes and seconds, the way a debrief would read it out. */
function clock(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

export function debriefLines(summary: FlightSummary | undefined): string[] {
  if (!summary) return ['No flight was flown.'];
  return [
    `Time aloft ${clock(summary.simTimeSeconds)}`,
    `Takeoffs ${summary.takeoffs} · landings ${summary.landings}`,
    `Rounds fired ${summary.roundsFired}`,
    `Fuel remaining ${(summary.fuelFraction * 100).toFixed(0)}%`,
    ...(summary.combat
      ? [
          `${summary.combat.outcome.toUpperCase()} · hits ${summary.combat.hits} · kills ${summary.combat.kills}`,
          `Airframe damage ${Math.round(summary.combat.damagePercent)}%`,
        ]
      : []),
  ];
}

export function Debrief({
  mission,
  summary,
  assets,
  onCommand,
}: {
  mission: MissionParams;
  summary?: FlightSummary;
  assets?: MenuAssets;
  onCommand: (action: MenuAction) => void;
}) {
  return (
    <MenuScreen
      screen="debrief"
      layout={debriefLayout({
        aircraft: summary?.aircraftName ?? AIRCRAFT[mission.aircraft].name,
        lines: debriefLines(summary),
      })}
      {...(assets ? { assets } : {})}
      onCommand={onCommand}
    >
      <p className="menu-summary">Guns-only combat · original pursuit tactics.</p>
    </MenuScreen>
  );
}
