/** Effect-free controls. Chrome is authored CSS informed by original-game references. */
export function MenuPageRocker({
  page,
  pages,
  onPage,
  command,
}: {
  /** Zero-based current page. */
  page: number;
  pages: number;
  onPage: (page: number) => void;
  command: string;
}) {
  return (
    <span className="menu-page-rocker" role="group" aria-label="Page navigation">
      <span className="menu-page-label">Page</span>
      <output className="menu-page-readout" data-menu-value={command} aria-live="polite">
        {page + 1} of {pages}
      </output>
      <span className="menu-page-switch">
        <button
          type="button"
          className="menu-page-prev"
          aria-label="Previous page"
          data-menu-command={`${command}-down`}
          disabled={page <= 0}
          onClick={() => onPage(Math.max(0, page - 1))}
        >
          <span>Prev</span>
        </button>
        <button
          type="button"
          className="menu-page-next"
          aria-label="Next page"
          data-menu-command={`${command}-up`}
          disabled={page >= pages - 1}
          onClick={() => onPage(Math.min(pages - 1, page + 1))}
        >
          <span>Next</span>
        </button>
      </span>
    </span>
  );
}

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
