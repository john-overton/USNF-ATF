import { AIRCRAFT, type AircraftId } from '../../flight/aircraft-catalog';
import {
  ENCOUNTER_ORIENTATIONS,
  MAX_OPPONENTS,
  type AiSkill,
  type MissionParams,
} from '../../sim/mission/params';
import { MenuScreen } from './MenuScreen';
import { MenuRocker } from './MenuControls';
import type { MenuAssets } from './assets';
import type { MenuAction } from './navigation';

export const SKILLS = ['Novice', 'Average', 'Experienced', 'Ace'] as const;
const IDS = Object.keys(AIRCRAFT) as AircraftId[];
const WEATHER = ['clear', 'scattered', 'broken', 'overcast', 'storm'] as const;
const TIMES = [6, 12, 18, 22] as const;
const TIME_LABELS = ['Dawn · 06:00', 'Noon · 12:00', 'Dusk · 18:00', 'Night · 22:00'];
const ORIENTATION_LABELS = {
  'head-on': 'Head-on · ahead, inbound',
  'tail-chase': 'Pursuit · ahead, outbound',
  behind: 'Defensive · enemy behind',
  crossing: 'Crossing · from your right',
};
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
  const encounter = mission.encounter;
  const setEncounter = (patch: Partial<MissionParams['encounter']>) =>
    onMission({ ...mission, encounter: { ...encounter, ...patch } });
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
            <label>Start position</label>
            <MenuRocker
              label="Start position"
              command="flight-start"
              value={
                mission.start === 'runway'
                  ? 'On runway'
                  : mission.start === 'approach'
                    ? 'Final approach'
                    : 'In the air'
              }
              onStep={() =>
                onMission({ ...mission, start: mission.start === 'runway' ? 'airborne' : 'runway' })
              }
            />
          </div>
          <div className="mission-field">
            <label>Air start height above terrain</label>
            <MenuRocker
              label="Airborne altitude"
              command="start-altitude"
              disabled={mission.start !== 'airborne'}
              value={
                mission.start === 'runway'
                  ? 'Not used · runway start'
                  : `${encounter.altitudeM} m AGL`
              }
              onStep={(direction) =>
                setEncounter({
                  altitudeM: Math.max(500, Math.min(8000, encounter.altitudeM + direction * 500)),
                })
              }
            />
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
            <label>Runway departure grace</label>
            <MenuRocker
              label="Departure grace"
              command="departure-grace"
              disabled={mission.start !== 'runway'}
              value={
                mission.start !== 'runway'
                  ? 'Not used · air start'
                  : encounter.departureGraceSeconds === 0
                    ? 'Off · immediate combat'
                    : `${encounter.departureGraceSeconds} s above 100 m AGL`
              }
              onStep={(direction) =>
                setEncounter({
                  departureGraceSeconds: Math.max(
                    0,
                    Math.min(120, encounter.departureGraceSeconds + direction * 15),
                  ),
                })
              }
            />
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
                  Math.max(1, Math.min(MAX_OPPONENTS, count + direction)),
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
          <div className="mission-field">
            <label>Encounter distance</label>
            <MenuRocker
              label="Encounter distance"
              command="encounter-distance"
              value={`${(encounter.distanceM / 1000).toFixed(0)} km`}
              onStep={(direction) =>
                setEncounter({
                  distanceM: Math.max(
                    2000,
                    Math.min(40000, encounter.distanceM + direction * 2000),
                  ),
                })
              }
            />
          </div>
          <div className="mission-field">
            <label>Orientation to target</label>
            <MenuRocker
              label="Encounter orientation"
              command="encounter-orientation"
              value={ORIENTATION_LABELS[encounter.orientation]}
              onStep={(direction) =>
                setEncounter({
                  orientation: next(ENCOUNTER_ORIENTATIONS, encounter.orientation, direction),
                })
              }
            />
          </div>
          <div className="mission-field">
            <label>Enemy altitude relative to you</label>
            <MenuRocker
              label="Enemy altitude offset"
              command="altitude-offset"
              value={
                encounter.altitudeOffsetM === 0
                  ? 'Same altitude'
                  : `${encounter.altitudeOffsetM > 0 ? '+' : ''}${encounter.altitudeOffsetM} m`
              }
              onStep={(direction) =>
                setEncounter({
                  altitudeOffsetM: Math.max(
                    -3000,
                    Math.min(3000, encounter.altitudeOffsetM + direction * 500),
                  ),
                })
              }
            />
          </div>
        </section>
        <p className="quick-limit">
          Guns-only quick fight · original tactics, no missiles.{' '}
          {mission.start === 'runway' && encounter.departureGraceSeconds > 0
            ? 'Enemies enter after your departure grace.'
            : 'Enemies enter immediately.'}
        </p>
        <p className="quick-count">
          {count + 1} aircraft · {mission.theater}
        </p>
      </div>
    </MenuScreen>
  );
}
