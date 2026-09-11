import type { ReactNode } from 'react';
import { MIXER_LABELS, type MixerBus, type MixerLevels } from '../../flight/AudioMixer';
import type { MenuAction } from './navigation';

export type EscapePage = 'flight' | 'settings' | 'mixer' | 'briefing' | 'quit' | 'leave';
/** Authored classic-style bar; no unsupported claim of recovered retail layout. */
export function EscapeMenu({
  page,
  onPage,
  onCommand,
  levels,
  onLevel,
  muted,
  onMute,
  settingsHost,
  children,
  error,
}: {
  page: EscapePage;
  onPage: (page: EscapePage) => void;
  onCommand: (action: MenuAction) => void;
  levels: MixerLevels;
  onLevel: (bus: MixerBus, value: number) => void;
  muted: boolean;
  onMute: () => void;
  settingsHost: (element: HTMLDivElement | null) => void;
  children?: ReactNode;
  error: string;
}) {
  return (
    <div
      className="escape-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Flight paused"
      data-menu-screen="paused"
    >
      <nav className="escape-bar" aria-label="Flight menu">
        <button data-menu-command="resume" onClick={() => onCommand({ command: 'resume' })}>
          Resume · Esc
        </button>
        <button
          data-escape-page="settings"
          aria-pressed={page === 'settings'}
          onClick={() => onPage('settings')}
        >
          Settings
        </button>
        <button
          data-escape-page="mixer"
          aria-pressed={page === 'mixer'}
          onClick={() => onPage('mixer')}
        >
          Volume mixer
        </button>
        <button
          data-escape-page="briefing"
          aria-pressed={page === 'briefing'}
          onClick={() => onPage('briefing')}
        >
          Mission brief
        </button>
        <button onClick={() => onCommand({ command: 'end-flight' })}>Debrief</button>
        <button data-escape-page="leave" onClick={() => onPage('leave')}>
          Main menu
        </button>
        <button data-escape-page="quit" onClick={() => onPage('quit')}>
          Quit game
        </button>
      </nav>
      {page === 'briefing' ? (
        children
      ) : (
        <section className="escape-panel" aria-label="Pause controls">
          <h1>
            {page === 'settings'
              ? 'Flight settings'
              : page === 'mixer'
                ? 'Volume mixer'
                : page === 'quit'
                  ? 'Quit game?'
                  : page === 'leave'
                    ? 'Leave this flight?'
                    : 'Flight paused'}
          </h1>
          {page === 'flight' && (
            <p>
              Your aircraft and mission are held. Choose settings above, or press Escape to resume.
            </p>
          )}
          {page === 'settings' && <div ref={settingsHost} />}
          {page === 'mixer' && (
            <>
              <p>
                Mix levels multiply existing sound volumes. Changes are saved for future sessions.
              </p>
              {(Object.keys(MIXER_LABELS) as MixerBus[]).map((bus) => (
                <label className="mixer-row" key={bus}>
                  <span>{MIXER_LABELS[bus]}</span>
                  <input
                    type="range"
                    aria-label={MIXER_LABELS[bus]}
                    data-mixer-bus={bus}
                    min="0"
                    max="1"
                    step="0.01"
                    value={levels[bus]}
                    onChange={(e) => onLevel(bus, Number(e.target.value))}
                  />
                  <output>{Math.round(levels[bus] * 100)}%</output>
                </label>
              ))}
              <button aria-pressed={muted} onClick={onMute}>
                {muted ? 'Unmute all' : 'Mute all'}
              </button>
            </>
          )}
          {(page === 'quit' || page === 'leave') && (
            <>
              <p>This ends the current flight. There is no in-flight save.</p>
              <button
                data-menu-command={page === 'quit' ? 'exit' : 'main-menu'}
                onClick={() => onCommand({ command: page === 'quit' ? 'exit' : 'main-menu' })}
              >
                {page === 'quit' ? 'Quit game' : 'End flight and return to menu'}
              </button>
              <button onClick={() => onPage('flight')}>Cancel</button>
            </>
          )}
          {error && <p role="alert">{error}</p>}
        </section>
      )}
    </div>
  );
}
