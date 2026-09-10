import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getPlatform } from '../platform';
import { RendererProbe } from './RendererProbe';
import { TerrainViewer } from './TerrainViewer';
import { MainMenu } from './menu/MainMenu';
import { AircraftSelect } from './menu/AircraftSelect';
import { QuickFightSetup } from './menu/QuickFightSetup';
import { LoadoutScreen } from './menu/LoadoutScreen';
import { Debrief } from './menu/Debrief';
import { loadMenuAssets, type MenuAssets } from './menu/assets';
import { defaultLoadout, parseRetailLoadout, type RetailLoadout } from '../data/retail-loadout';
import { UiAudio } from './menu/UiAudio';
import {
  applyMenuAction,
  flightSummary,
  initialScreen,
  type MenuAction,
  type ShellState,
} from './menu/navigation';
import {
  DEFAULT_MISSION,
  isProbeQuery,
  parseMissionQuery,
  validateMission,
  type MissionParams,
} from '../sim/mission/params';

/**
 * The shell owns two things and nothing else: which screen is showing, and the
 * MissionParams that screen is editing or flying. Both live in one piece of React
 * state, so leaving a mode is a state transition rather than a page reload — a reload
 * cannot carry a loadout.
 *
 * The simulation is untouched by this. The 120 Hz clock runs inside the viewer's own
 * requestAnimationFrame chain and only hands React a throttled diagnostics snapshot.
 */
export function Shell({ search }: { search: string }) {
  // One parse, in one place. A bad parameter must still reach the viewer's error text
  // rather than blanking the app, so the failure is carried instead of thrown.
  const parsed = useMemo((): { mission: MissionParams; parseError: string } => {
    try {
      return { mission: parseMissionQuery(search), parseError: '' };
    } catch (err) {
      return {
        mission: DEFAULT_MISSION,
        parseError: err instanceof Error ? err.message : String(err),
      };
    }
  }, [search]);
  const [state, setState] = useState<ShellState>(() => ({
    screen: isProbeQuery(search) ? 'probe' : initialScreen(search),
    mission: parsed.mission,
  }));
  // The optional retail bundle, read once and handed down, so the menu components
  // themselves stay prop-driven and effect-free. Absent is the normal case.
  const [assets, setAssets] = useState<MenuAssets>();
  useEffect(() => {
    let active = true;
    void loadMenuAssets(getPlatform()).then((loaded) => {
      if (active) setAssets(loaded);
    });
    return () => {
      active = false;
    };
  }, []);
  // The aircraft's ported hardpoints, when one is installed. The loadout screen
  // says so plainly when there are none rather than pretending to have stations.
  const [loadout, setLoadout] = useState<{ aircraft: string; data?: RetailLoadout }>();
  useEffect(() => {
    let active = true;
    const aircraft = state.mission.aircraft;
    void (async () => {
      const platform = getPlatform();
      const file = `aircraft/${aircraft}-loadout.json`;
      try {
        if (!(await platform.fs.exists('appData', file))) {
          if (active) setLoadout({ aircraft });
          return;
        }
        const text = await platform.fs.readText('appData', file);
        if (text.length > 4_000_000) throw new Error('Loadout manifest exceeds its size limit');
        const data = parseRetailLoadout(JSON.parse(text));
        if (!active) return;
        setLoadout({ aircraft, data });
        // Arrive on the aircraft's own stock loadout, the way the original does,
        // unless the player has already chosen something for this mission.
        setState((previous) =>
          Object.keys(previous.mission.loadout.stations).length === 0
            ? {
                ...previous,
                mission: {
                  ...previous.mission,
                  loadout: {
                    ...previous.mission.loadout,
                    stations: defaultLoadout(data).stations,
                  },
                },
              }
            : previous,
        );
      } catch {
        // A bad manifest leaves the screen without stations, never without a screen.
        if (active) setLoadout({ aircraft });
      }
    })();
    return () => {
      active = false;
    };
  }, [state.mission.aircraft]);
  const [unrestricted, setUnrestricted] = useState(false);
  const audio = useRef<UiAudio>(null);
  useEffect(() => {
    const service = new UiAudio(assets?.sounds?.sounds ?? {});
    audio.current = service;
    return () => {
      service.dispose();
      audio.current = null;
    };
  }, [assets]);
  const act = useCallback((action: MenuAction) => {
    // Read the flight's own snapshot as it is left, so the debrief has numbers.
    const summary = flightSummary(window.__flightDiagnostics?.());
    setState((previous) => {
      const next = applyMenuAction(previous, action, summary);
      // The original answers a refused command differently from an accepted one.
      queueMicrotask(() =>
        audio.current?.play(next.screen === previous.screen ? 'reject' : 'click'),
      );
      return next;
    });
  }, []);
  useEffect(() => {
    // Esc leaves a running session the way the original did, without a reload.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') act({ command: 'back' });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [act]);
  if (state.screen === 'probe') return <RendererProbe />;
  if (state.screen === 'explorer' || state.screen === 'flight')
    return (
      <TerrainViewer key={state.screen} mission={state.mission} parseError={parsed.parseError} />
    );
  if (state.screen === 'quick-fight')
    return (
      <QuickFightSetup
        mission={state.mission}
        {...(assets ? { assets } : {})}
        onMission={(mission) => setState((previous) => ({ ...previous, mission }))}
        onCommand={act}
      />
    );
  if (state.screen === 'aircraft-select')
    return (
      <AircraftSelect mission={state.mission} {...(assets ? { assets } : {})} onCommand={act} />
    );
  if (state.screen === 'loadout')
    return (
      <LoadoutScreen
        mission={state.mission}
        {...(loadout?.aircraft === state.mission.aircraft && loadout.data
          ? { loadout: loadout.data }
          : {})}
        unrestricted={unrestricted}
        problems={validateMission(state.mission)}
        {...(assets ? { assets } : {})}
        onMission={(mission) => setState((previous) => ({ ...previous, mission }))}
        onUnrestricted={setUnrestricted}
        onCommand={act}
      />
    );
  if (state.screen === 'debrief')
    return (
      <Debrief
        mission={state.mission}
        {...(state.summary ? { summary: state.summary } : {})}
        {...(assets ? { assets } : {})}
        onCommand={act}
      />
    );
  return <MainMenu mission={state.mission} {...(assets ? { assets } : {})} onCommand={act} />;
}
