export type ChaseCameraMode = 'attitude' | 'world-up';
export interface AircraftCommands {
  throttle: number;
  engineRunning: boolean;
  afterburner: boolean;
  gearDown: boolean;
  hookDown: boolean;
  flapsDown: boolean;
  airbrakeDown: boolean;
  cameraMode: ChaseCameraMode;
}
/** Discrete actions are edge-triggered; browser key repeat must not toggle systems. */
export function applyPilotAction(
  state: AircraftCommands & { resetRequested: boolean },
  event: Pick<KeyboardEvent, 'type' | 'code' | 'repeat'>,
): void {
  if (event.type !== 'keydown' || event.repeat) return;
  const preset = /^Digit([1-6])$/.exec(event.code);
  if (preset) {
    const index = Number(preset[1]);
    state.throttle = Math.min(1, (index - 1) / 4);
    state.afterburner = index === 6;
  }
  if (event.code === 'KeyT') state.engineRunning = !state.engineRunning;
  if (event.code === 'KeyG') state.gearDown = !state.gearDown;
  if (event.code === 'KeyH') state.hookDown = !state.hookDown;
  if (event.code === 'KeyF') state.flapsDown = !state.flapsDown;
  if (event.code === 'KeyB') state.airbrakeDown = !state.airbrakeDown;
  if (event.code === 'F2') state.cameraMode = 'attitude';
  if (event.code === 'F3') state.cameraMode = 'world-up';
  if (event.code === 'KeyR') state.resetRequested = true;
}

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
  'KeyT',
  'KeyG',
  'KeyH',
  'KeyF',
  'F2',
  'F3',
  'Digit1',
  'Digit2',
  'Digit3',
  'Digit4',
  'Digit5',
  'Digit6',
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
  engineRunning = true;
  afterburner = false;
  gearDown = true;
  hookDown = false;
  flapsDown = false;
  airbrakeDown = false;
  cameraMode: ChaseCameraMode = 'world-up';
  resetRequested = false;
  gamepadConnected = false;
  private key = (event: KeyboardEvent): void => {
    const editing =
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement ||
      (event.target instanceof HTMLElement && event.target.isContentEditable) ||
      event.target instanceof HTMLSelectElement ||
      event.target instanceof HTMLButtonElement;
    if (!updateHeldPilotKeys(this.keys, event, editing)) return;
    if (!editing) event.preventDefault();
    if (!editing) applyPilotAction(this, event);
  };
  private focus = (event: FocusEvent): void => {
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement ||
      (event.target instanceof HTMLElement && event.target.isContentEditable) ||
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
    if (up + trigger < 0) this.afterburner = false;
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
      brake: this.airbrakeDown || Boolean(pad?.buttons[1]?.pressed),
    };
  }
  reset(): void {
    this.throttle = 0;
    this.engineRunning = true;
    this.afterburner = false;
    this.gearDown = true;
    this.hookDown = false;
    this.flapsDown = false;
    this.airbrakeDown = false;
    this.cameraMode = 'world-up';
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
