import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getPlatform } from '../platform';
import { RendererProbe } from './RendererProbe';
import { TerrainViewer } from './TerrainViewer';
import { MainMenu } from './menu/MainMenu';
import { AircraftSelect } from './menu/AircraftSelect';
import { LoadoutScreen } from './menu/LoadoutScreen';
import { Debrief } from './menu/Debrief';
import { loadMenuAssets, type MenuAssets } from './menu/assets';
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
  if (state.screen === 'aircraft-select')
    return (
      <AircraftSelect mission={state.mission} {...(assets ? { assets } : {})} onCommand={act} />
    );
  if (state.screen === 'loadout')
    return (
      <LoadoutScreen
        mission={state.mission}
        problems={validateMission(state.mission)}
        {...(assets ? { assets } : {})}
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
