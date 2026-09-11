import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { audioMixer } from '../flight/AudioMixer';
import { muteControl } from '../flight/mute';
import { EscapeMenu, type EscapePage } from './menu/EscapeMenu';
import { getPlatform } from '../platform';
import { RendererProbe } from './RendererProbe';
import { TerrainViewer } from './TerrainViewer';
import { MainMenu } from './menu/MainMenu';
import { AircraftSelect } from './menu/AircraftSelect';
import { QuickFightSetup } from './menu/QuickFightSetup';
import { LoadoutScreen } from './menu/LoadoutScreen';
import { Debrief } from './menu/Debrief';
import { MissionBrief } from './menu/MissionBrief';
import { loadMenuAssets, type MenuAssets } from './menu/assets';
import { defaultLoadout, parseRetailLoadout, type RetailLoadout } from '../data/retail-loadout';
import { UiAudio } from './menu/UiAudio';
import {
  MENU_SCREENS,
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
          previous.mission.aircraft === aircraft &&
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
  const [briefingPage, setBriefingPage] = useState(0);
  const [escapePage, setEscapePage] = useState<EscapePage>('flight');
  const [settingsHost, setSettingsHost] = useState<HTMLDivElement | null>(null);
  const [mixerError, setMixerError] = useState('');
  const levels = useSyncExternalStore(
    audioMixer.subscribe,
    audioMixer.snapshot,
    audioMixer.snapshot,
  );
  const [muted, setMuted] = useState(muteControl.muted);
  useEffect(() => muteControl.subscribe(setMuted), []);
  useEffect(() => {
    let active = true;
    let writes = Promise.resolve();
    const platform = getPlatform();
    const unsubscribe = audioMixer.subscribe(() => {
      const text = JSON.stringify({ version: 1, levels: audioMixer.snapshot() });
      writes = writes
        .then(() => platform.fs.writeText('appData', 'settings/audio-mixer.json', text))
        .catch((e: unknown) => {
          if (active) setMixerError(`Unable to save mixer: ${String(e)}`);
        });
    });
    void audioMixer.load(platform).catch((e: unknown) => {
      if (active) setMixerError(`Unable to load mixer: ${String(e)}`);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  const audio = useRef<UiAudio>(null);
  // Only while a menu is on screen. A flight has its own AudioContext, and a
  // second one sitting idle behind it is both wasteful and, for the retail audio
  // acceptance test that taps the app's real graph, ambiguous about which context
  // it is listening to.
  const menuScreen = MENU_SCREENS.includes(state.screen);
  useEffect(() => {
    if (!menuScreen) return;
    const service = new UiAudio(assets?.sounds?.sounds ?? {}, assets?.sounds?.music);
    audio.current = service;
    return () => {
      service.dispose();
      audio.current = null;
    };
  }, [assets, menuScreen]);
  const act = useCallback((action: MenuAction) => {
    if (action.command === 'back' || action.command === 'resume') setEscapePage('flight');
    if (action.command === 'back') setBriefingPage(0);
    if (action.command === 'exit') {
      void getPlatform()
        .quit()
        .catch((error: unknown) => console.error('Unable to exit', error));
      return;
    }
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
    // Escape pauses/resumes a flight; repeated keydown must not toggle it twice.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        const dialog = document.querySelector('.escape-overlay');
        const buttons = dialog?.querySelectorAll<HTMLElement>('button:not(:disabled),input,select');
        if (buttons?.length) {
          const first = buttons[0]!;
          const last = buttons[buttons.length - 1]!;
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }
      }
      if (event.key === 'Escape' && !event.repeat) {
        event.preventDefault();
        act({ command: 'back' });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [act]);
  useEffect(() => {
    if (state.screen === 'paused')
      document.querySelector<HTMLButtonElement>('[data-menu-command="resume"]')?.focus();
    else if (state.screen === 'flight')
      document.querySelector<HTMLCanvasElement>('#terrain-canvas')?.focus();
  }, [state.screen]);
  if (state.screen === 'probe') return <RendererProbe />;
  if (state.screen === 'flight' || state.screen === 'paused') {
    const paused = state.screen === 'paused';
    const summary = flightSummary(window.__flightDiagnostics?.());
    return (
      <div className="mission-session">
        <div className="mission-view" inert={paused} aria-hidden={paused}>
          <TerrainViewer
            mission={state.mission}
            onMission={(mission) => setState((previous) => ({ ...previous, mission }))}
            onGunMode={(gunMode) =>
              setState((previous) => ({ ...previous, mission: { ...previous.mission, gunMode } }))
            }
            parseError={parsed.parseError}
            paused={paused}
            settingsHost={settingsHost}
          />
        </div>
        {paused && (
          <EscapeMenu
            page={escapePage}
            onPage={setEscapePage}
            onCommand={act}
            levels={levels}
            onLevel={(bus, value) => audioMixer.set(bus, value)}
            muted={muted}
            onMute={() => muteControl.toggle()}
            settingsHost={setSettingsHost}
            error={mixerError}
          >
            {escapePage === 'briefing' && (
              <MissionBrief
                mission={state.mission}
                page={briefingPage}
                onPage={setBriefingPage}
                {...(summary ? { summary } : {})}
                {...(assets ? { assets } : {})}
                onCommand={act}
                embedded
              />
            )}
          </EscapeMenu>
        )}
      </div>
    );
  }
  if (state.screen === 'explorer')
    return (
      <TerrainViewer
        key={state.screen}
        mission={state.mission}
        onMission={(mission) => setState((previous) => ({ ...previous, mission }))}
        onGunMode={(gunMode) =>
          setState((previous) => ({ ...previous, mission: { ...previous.mission, gunMode } }))
        }
        parseError={parsed.parseError}
      />
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
  return (
    <MainMenu
      mission={state.mission}
      onMission={(mission) => setState((previous) => ({ ...previous, mission }))}
      onGunMode={(gunMode) =>
        setState((previous) => ({ ...previous, mission: { ...previous.mission, gunMode } }))
      }
      {...(assets ? { assets } : {})}
      onCommand={act}
    />
  );
}
