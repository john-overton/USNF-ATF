import { AIRCRAFT } from '../../flight/aircraft-catalog';
import type { MissionParams } from '../../sim/mission/params';
import type { MenuAssets } from './assets';
import type { FlightSummary, MenuAction } from './navigation';
import { MenuScreen } from './MenuScreen';
import { debriefLines } from './Debrief';
import { MenuPageRocker } from './MenuControls';

/** A briefing overlay over a retained, paused flight, never a new session. */
export function MissionBrief({
  mission,
  summary,
  assets,
  onCommand,
  page,
  onPage,
}: {
  mission: MissionParams;
  summary?: FlightSummary;
  assets?: MenuAssets;
  onCommand: (action: MenuAction) => void;
  page: number;
  onPage: (page: number) => void;
}) {
  return (
    <div
      className="mission-pause"
      role="dialog"
      aria-modal="true"
      aria-label="Mission brief — paused"
    >
      <MenuScreen
        screen="paused"
        layout={{
          rect: { x: 0, y: 0, width: 640, height: 480 },
          title: 'Mission brief',
          widgets: [
            {
              type: 'action',
              x: 47,
              y: 377,
              width: 85,
              height: 26,
              command: 'resume',
              label: 'Resume',
            },
            {
              type: 'action',
              x: 47,
              y: 410,
              width: 85,
              height: 26,
              command: 'main-menu',
              label: 'Main menu',
            },
          ],
        }}
        {...(assets ? { assets } : {})}
        onCommand={onCommand}
        frameContent={<p className="mission-topbar">Mission paused · Esc to resume</p>}
      >
        <div className="brief-page-control">
          <MenuPageRocker command="brief-page" page={page} pages={2} onPage={onPage} />
        </div>
        <article className="brief-paper" aria-live="polite">
          {page === 0 ? (
            <>
              <h2>{mission.mode === 'quick-fight' ? 'Quick mission' : 'Practice flight'}</h2>
              <dl>
                <dt>Aircraft</dt>
                <dd>{AIRCRAFT[mission.aircraft].name}</dd>
                <dt>Theater</dt>
                <dd>{mission.theater}</dd>
                <dt>Assignment</dt>
                <dd>
                  {mission.mode === 'quick-fight'
                    ? 'Air combat training'
                    : 'Free flight and familiarization'}
                </dd>
              </dl>
              <h3>Mission orders</h3>
              <p>
                {mission.mode === 'quick-fight'
                  ? `${mission.opponents.length} opposing aircraft ${mission.opponents.length === 1 ? 'flies a fixed course' : 'fly fixed courses'}. Weapons cause no damage in this mock mission.`
                  : 'Practice takeoff, navigation and landing. No combat objectives are assigned.'}
              </p>
              <p>
                Review your loadout, navigate the theater, and return safely. Your flight is held
                while this briefing is open.
              </p>
            </>
          ) : (
            <>
              <h2>Flight status</h2>
              <h3>{AIRCRAFT[mission.aircraft].name}</h3>
              <ul>
                {debriefLines(summary).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <h3>Flight readiness</h3>
              <p>
                Your current position, controls, fuel and ammunition are retained. Resume returns to
                the same aircraft and mission.
              </p>
            </>
          )}
          <p className="brief-resume-note">
            Resume continues your current flight. Main menu ends it.
          </p>
        </article>
      </MenuScreen>
    </div>
  );
}
