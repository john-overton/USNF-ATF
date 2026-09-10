/**
 * One component per recovered `_Draw*` widget class, in original chrome. A rocker
 * is the original's stepper — a pair of arrows either side of a value — and a dial
 * is its continuous control. Both are ordinary buttons and a range input, so they
 * are keyboard-reachable and need no effect.
 */
export function MenuRocker({
  label,
  value,
  onStep,
  disabled,
  command,
}: {
  label: string;
  value: string;
  onStep: (direction: 1 | -1) => void;
  disabled?: boolean;
  command: string;
}) {
  return (
    <span className="menu-rocker" data-menu-rocker={command}>
      <button
        type="button"
        className="menu-rocker-step"
        aria-label={`${label} down`}
        data-menu-command={`${command}-down`}
        disabled={disabled}
        onClick={() => onStep(-1)}
      >
        ◄
      </button>
      <span className="menu-rocker-value" data-menu-value={command}>
        {value}
      </span>
      <button
        type="button"
        className="menu-rocker-step"
        aria-label={`${label} up`}
        data-menu-command={`${command}-up`}
        disabled={disabled}
        onClick={() => onStep(1)}
      >
        ►
      </button>
    </span>
  );
}

export function MenuDial({
  label,
  value,
  readout,
  onChange,
  command,
}: {
  label: string;
  /** 0..1. */
  value: number;
  readout: string;
  onChange: (value: number) => void;
  command: string;
}) {
  return (
    <span className="menu-dial" data-menu-dial={command}>
      <label className="menu-dial-label" htmlFor={`menu-dial-${command}`}>
        {label}
      </label>
      <input
        id={`menu-dial-${command}`}
        className="menu-dial-input"
        type="range"
        min="0"
        max="100"
        step="1"
        value={Math.round(value * 100)}
        onChange={(event) => onChange(Number(event.target.value) / 100)}
      />
      <span className="menu-dial-readout" data-menu-value={command}>
        {readout}
      </span>
    </span>
  );
}
