export interface PilotControls {
  pitch: number;
  roll: number;
  yaw: number;
  throttle: number;
  brake: boolean;
}
export function deadzone(value: number, zone = 0.12): number {
  if (!Number.isFinite(value) || Math.abs(value) <= zone) return 0;
  return Math.sign(value) * Math.min(1, (Math.abs(value) - zone) / (1 - zone));
}
const PILOT_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'KeyQ',
  'KeyE',
  'KeyW',
  'KeyS',
  'KeyB',
  'KeyR',
]);
/** Releases always clear held state, even after focus moved into a form. */
export function updateHeldPilotKeys(
  keys: Set<string>,
  event: Pick<KeyboardEvent, 'type' | 'code'>,
  editing: boolean,
): boolean {
  if (!PILOT_KEYS.has(event.code)) return false;
  if (event.type === 'keyup') {
    keys.delete(event.code);
    return true;
  }
  if (editing) {
    keys.clear();
    return false;
  }
  keys.add(event.code);
  return true;
}
/** Standard gamepad: left stick roll/pitch, right stick X rudder, triggers throttle, B brake. */
export class FlightInput {
  private keys = new Set<string>();
  throttle = 0;
  resetRequested = false;
  gamepadConnected = false;
  private key = (event: KeyboardEvent): void => {
    const editing =
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLSelectElement ||
      event.target instanceof HTMLButtonElement;
    if (!updateHeldPilotKeys(this.keys, event, editing)) return;
    if (!editing) event.preventDefault();
    if (event.type === 'keydown' && event.code === 'KeyR' && !event.repeat)
      this.resetRequested = true;
  };
  private focus = (event: FocusEvent): void => {
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLSelectElement ||
      event.target instanceof HTMLButtonElement
    )
      this.keys.clear();
  };
  private blur = (): void => {
    this.keys.clear();
  };
  constructor() {
    window.addEventListener('keydown', this.key);
    window.addEventListener('keyup', this.key);
    window.addEventListener('blur', this.blur);
    window.addEventListener('focusin', this.focus);
  }
  sample(dt: number): PilotControls {
    const pad = navigator.getGamepads?.().find((p) => p?.connected && p.mapping === 'standard');
    this.gamepadConnected = Boolean(pad);
    const up = Number(this.keys.has('KeyW')) - Number(this.keys.has('KeyS'));
    const trigger = (pad?.buttons[7]?.value ?? 0) - (pad?.buttons[6]?.value ?? 0);
    this.throttle = Math.max(0, Math.min(1, this.throttle + (up + trigger) * dt * 0.4));
    return {
      pitch: Math.max(
        -1,
        Math.min(
          1,
          Number(this.keys.has('ArrowDown')) -
            Number(this.keys.has('ArrowUp')) +
            deadzone(pad?.axes[1] ?? 0),
        ),
      ),
      roll: Math.max(
        -1,
        Math.min(
          1,
          Number(this.keys.has('ArrowRight')) -
            Number(this.keys.has('ArrowLeft')) +
            deadzone(pad?.axes[0] ?? 0),
        ),
      ),
      yaw: Math.max(
        -1,
        Math.min(
          1,
          Number(this.keys.has('KeyE')) -
            Number(this.keys.has('KeyQ')) +
            deadzone(pad?.axes[2] ?? 0),
        ),
      ),
      throttle: this.throttle,
      brake: this.keys.has('KeyB') || Boolean(pad?.buttons[1]?.pressed),
    };
  }
  reset(): void {
    this.throttle = 0;
    this.resetRequested = false;
    this.keys.clear();
  }
  dispose(): void {
    window.removeEventListener('keydown', this.key);
    window.removeEventListener('keyup', this.key);
    window.removeEventListener('blur', this.blur);
    window.removeEventListener('focusin', this.focus);
  }
}
