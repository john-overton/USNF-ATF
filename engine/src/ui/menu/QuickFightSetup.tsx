import { AIRCRAFT, type AircraftId } from '../../flight/aircraft-catalog';
import { MAX_OPPONENTS, type AiSkill, type MissionParams } from '../../sim/mission/params';
import { MenuScreen } from './MenuScreen';
import { MenuRocker } from './MenuControls';
import type { MenuAssets } from './assets';
import type { MenuAction } from './navigation';

export const SKILLS = ['Novice', 'Average', 'Experienced', 'Ace'] as const;
const IDS = Object.keys(AIRCRAFT) as AircraftId[];
const WEATHER = ['clear', 'scattered', 'broken', 'overcast', 'storm'] as const;
const TIMES = [6, 12, 18, 22] as const;
const TIME_LABELS = ['Dawn · 06:00', 'Noon · 12:00', 'Dusk · 18:00', 'Night · 22:00'];
const next = <T,>(items: readonly T[], value: T, direction: number): T =>
  items[(Math.max(0, items.indexOf(value)) + direction + items.length) % items.length]!;

export function QuickFightSetup({
  mission,
  assets,
  onMission,
  onCommand,
}: {
  mission: MissionParams;
  assets?: MenuAssets;
  onMission: (mission: MissionParams) => void;
  onCommand: (action: MenuAction) => void;
}) {
  const first = mission.opponents[0] ?? { aircraft: 'f14' as AircraftId, skill: 2 as AiSkill };
  const count = Math.max(1, mission.opponents.length);
  const set = (count: number, aircraft: AircraftId, skill: AiSkill) =>
    onMission({
      ...mission,
      mode: 'quick-fight',
      opponents: Array.from({ length: count }, () => ({ aircraft, skill })),
    });
  const weather = mission.environment.weather ?? 'scattered';
  const time = mission.environment.timeOfDayHours ?? 12;
  return (
    <MenuScreen
      screen="quick-fight"
      layout={{
        rect: { x: 0, y: 0, width: 640, height: 480 },
        title: 'Quick mission creator',
        widgets: [
          {
            type: 'action',
            x: 387,
            y: 419,
            width: 85,
            height: 26,
            command: 'continue',
            label: 'Arm plane',
          },
          {
            type: 'action',
            x: 492,
            y: 419,
            width: 85,
            height: 26,
            command: 'back',
            label: 'Cancel',
          },
        ],
      }}
      {...(assets ? { assets } : {})}
      onCommand={onCommand}
      frameContent={<p className="mission-topbar">Set up your flight and the opposing force</p>}
    >
      <div data-quick-fight="ready">
        <section className="quick-force quick-friendly" aria-label="Friendly forces">
          <h2>Friendly forces</h2>
          <div className="mission-field">
            <label>Aircraft type</label>
            <MenuRocker
              label="Player aircraft"
              command="player-aircraft"
              value={AIRCRAFT[mission.aircraft].name}
              onStep={(direction) =>
                onMission({
                  ...mission,
                  aircraft: next(IDS, mission.aircraft, direction),
                  loadout: { ...mission.loadout, stations: {} },
                })
              }
            />
          </div>
          <div className="mission-field">
            <label>Wing size</label>
            <span className="mission-readout">1 aircraft · You are flight lead</span>
          </div>
          <div className="mission-field">
            <label>Weather</label>
            <MenuRocker
              label="Weather"
              command="weather"
              value={weather}
              onStep={(direction) =>
                onMission({
                  ...mission,
                  environment: {
                    ...mission.environment,
                    weather: next(WEATHER, weather, direction),
                  },
                })
              }
            />
          </div>
          <div className="mission-field">
            <label>Time of day</label>
            <MenuRocker
              label="Time of day"
              command="time"
              value={
                TIME_LABELS[TIMES.indexOf(time as (typeof TIMES)[number])] ??
                time.toFixed(1) + ' hours'
              }
              onStep={(direction) =>
                onMission({
                  ...mission,
                  environment: {
                    ...mission.environment,
                    timeOfDayHours: next<number>(TIMES, time, direction),
                  },
                })
              }
            />
          </div>
          <div className="mission-field">
            <label>Theater</label>
            <span className="mission-readout">{mission.theater}</span>
          </div>
        </section>
        <section className="quick-force quick-hostile" aria-label="Hostile forces">
          <h2>Hostile forces</h2>
          <div className="mission-field">
            <label>Aircraft type</label>
            <MenuRocker
              label="Opponent aircraft"
              command="opponent-aircraft"
              value={AIRCRAFT[first.aircraft].name}
              onStep={(direction) => set(count, next(IDS, first.aircraft, direction), first.skill)}
            />
          </div>
          <div className="mission-field">
            <label>Wing size</label>
            <MenuRocker
              label="Opponent count"
              command="opponent-count"
              value={String(count)}
              onStep={(direction) =>
                set(
                  Math.max(1, Math.min(MAX_OPPONENTS - 1, count + direction)),
                  first.aircraft,
                  first.skill,
                )
              }
            />
          </div>
          <div className="mission-field">
            <label>Skill level</label>
            <MenuRocker
              label="Opponent skill"
              command="opponent-skill"
              value={SKILLS[first.skill] ?? 'Average'}
              onStep={(direction) =>
                set(
                  count,
                  first.aircraft,
                  Math.max(0, Math.min(3, first.skill + direction)) as AiSkill,
                )
              }
            />
          </div>
          <p className="quick-limit">
            <strong>Mock quick fight.</strong> Opponents fly fixed courses. They do not pursue or
            fire, and weapons cause no damage. Skill selection has no effect yet.
          </p>
        </section>
        <p className="quick-count">{count + 1} aircraft in the sky, including you</p>
      </div>
    </MenuScreen>
  );
}
