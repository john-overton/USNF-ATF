import type { MenuAction } from './navigation';
import { DESIGN_HEIGHT, DESIGN_WIDTH, type MenuLayout, type MenuWidget } from './layout';

/**
 * Every menu is drawn into the same 640x480 box the original used, and the box is
 * scaled to the window by CSS alone — `aspect-ratio` on the frame and container
 * query units for type — so nothing here needs an effect or a resize listener.
 * That matters because `renderToStaticMarkup` is the only React test tool in the
 * repo: a component with effects could not be tested at all.
 *
 * The chrome is ours. Step 5 of the game shell plan swaps in the retail nine-slice
 * sprites when a menu bundle is installed, without moving a widget.
 */
const percent = (value: number, of: number) => `${(value / of) * 100}%`;

function MenuButton({
  widget,
  onCommand,
}: {
  widget: MenuWidget;
  onCommand: (a: MenuAction) => void;
}) {
  return (
    <button
      type="button"
      className="menu-action"
      data-menu-command={widget.command}
      {...(widget.value ? { 'data-menu-aircraft': widget.value } : {})}
      disabled={widget.disabled}
      {...(widget.pressed === undefined ? {} : { 'aria-pressed': widget.pressed })}
      onClick={() =>
        widget.command &&
        onCommand(
          widget.value
            ? { command: widget.command, aircraft: widget.value }
            : { command: widget.command },
        )
      }
    >
      {widget.label}
    </button>
  );
}

export function MenuScreen({
  screen,
  layout,
  problems = [],
  onCommand,
  children,
}: {
  screen: string;
  layout: MenuLayout;
  problems?: readonly string[];
  onCommand: (action: MenuAction) => void;
  children?: React.ReactNode;
}) {
  const { rect } = layout;
  return (
    <div className="menu-root" data-menu-screen={screen}>
      <div className="menu-frame">
        <div
          className="menu-panel"
          style={{
            left: percent(rect.x, DESIGN_WIDTH),
            top: percent(rect.y, DESIGN_HEIGHT),
            width: percent(rect.width, DESIGN_WIDTH),
            height: percent(rect.height, DESIGN_HEIGHT),
          }}
        >
          <h1 className="menu-title">{layout.title}</h1>
          {layout.widgets.map((widget, index) => (
            <div
              key={`${widget.command ?? widget.type}-${index}`}
              className={`menu-widget menu-${widget.type}`}
              style={{
                left: percent(widget.x, rect.width),
                top: percent(widget.y, rect.height),
                width: percent(widget.width, rect.width),
                ...(widget.height ? { height: percent(widget.height, rect.height) } : {}),
              }}
            >
              {widget.type === 'action' ? (
                <MenuButton widget={widget} onCommand={onCommand} />
              ) : (
                <span className="menu-line">{widget.label}</span>
              )}
              {widget.note && <small className="menu-note">{widget.note}</small>}
            </div>
          ))}
          {children}
          {problems.length > 0 && (
            <ul className="menu-problems" role="alert">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
