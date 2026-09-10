import { useCallback, useEffect, useMemo, useState } from 'react';
import { RendererProbe } from './RendererProbe';
import { TerrainViewer } from './TerrainViewer';
import { PlaceholderMenu } from './menu/PlaceholderMenu';
import {
  applyMenuAction,
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
  const act = useCallback((action: MenuAction) => {
    setState((previous) => applyMenuAction(previous, action));
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
  return (
    <PlaceholderMenu
      screen={state.screen}
      mission={state.mission}
      problems={validateMission(state.mission)}
      onCommand={act}
    />
  );
}
