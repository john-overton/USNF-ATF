import type { ReactNode } from 'react';
import './terrain-map.css';

/**
 * The shared MFD bezel: a square frame with five buttons per side, two lower
 * dials and one screen area. Extracted unchanged from `TerrainMap` so a second
 * page (target, damage) can share the chrome rather than clone it. The frame
 * keeps the original `terrain-map` class name so `terrain-map.css` and the
 * existing Electron smoke selectors continue to match.
 */
export interface MfdButton {
  /** Accessible name; the bezel buttons carry no visible text of their own. */
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  /** Extra `data-*` attributes, e.g. `{ 'data-teleport-id': '2' }`. */
  data?: Record<string, string>;
  onClick?: () => void;
}
/** A null slot renders the inert button that fills an unassigned position. */
export type MfdButtonSlot = MfdButton | null;

const BANK_SIZE = 5;

function MfdButtonBank({
  className,
  side,
  buttons,
  label,
}: {
  className: string;
  side: string;
  buttons: readonly MfdButtonSlot[];
  label?: string;
}) {
  return (
    <div className={className} {...(label ? { 'aria-label': label } : {})}>
      {Array.from({ length: BANK_SIZE }, (_, index) => {
        const button = buttons[index];
        return button ? (
          <button
            key={index}
            type="button"
            className="mfd-button"
            aria-label={button.label}
            {...(button.pressed === undefined ? {} : { 'aria-pressed': button.pressed })}
            disabled={button.disabled ?? false}
            {...button.data}
            onClick={button.onClick}
          />
        ) : (
          <button
            key={index}
            type="button"
            className="mfd-button mfd-unused"
            aria-label={`Unused ${side} MFD button ${index + 1}`}
            disabled
          />
        );
      })}
    </div>
  );
}

export function Mfd({
  label,
  attributes,
  top = [],
  left,
  right = [],
  bottom = [],
  children,
}: {
  label: string;
  /** Frame-level `data-*`/`aria-*` attributes the page needs for tests. */
  attributes?: Record<string, string>;
  top?: readonly MfdButtonSlot[];
  left?: { buttons: readonly MfdButtonSlot[]; label?: string };
  right?: readonly MfdButtonSlot[];
  bottom?: readonly MfdButtonSlot[];
  children: ReactNode;
}) {
  return (
    <aside className="terrain-map" aria-label={label} {...attributes}>
      <MfdButtonBank className="mfd-top-buttons" side="top" buttons={top} />
      <MfdButtonBank
        className="mfd-side-buttons mfd-left-buttons"
        side="left"
        buttons={left?.buttons ?? []}
        {...(left?.label ? { label: left.label } : {})}
      />
      <MfdButtonBank className="mfd-side-buttons mfd-right-buttons" side="right" buttons={right} />
      <div className="mfd-dial mfd-left-dial" aria-hidden="true" />
      <div className="mfd-dial mfd-right-dial" aria-hidden="true" />
      <div className="mfd-screen">{children}</div>
      <MfdButtonBank className="mfd-bottom-buttons" side="bottom" buttons={bottom} />
    </aside>
  );
}
