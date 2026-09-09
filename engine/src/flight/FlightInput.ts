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
/** Standard gamepad: left stick roll/pitch, right stick X rudder, triggers throttle, B brake. */
export class FlightInput {
  private keys = new Set<string>();
  throttle = 0;
  resetRequested = false;
  gamepadConnected = false;
  private key = (event: KeyboardEvent): void => {
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLSelectElement ||
      event.target instanceof HTMLButtonElement
    )
      return;
    if (
      ![
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
      ].includes(event.code)
    )
      return;
    event.preventDefault();
    if (event.type === 'keydown') {
      this.keys.add(event.code);
      if (event.code === 'KeyR' && !event.repeat) this.resetRequested = true;
    } else this.keys.delete(event.code);
  };
  private blur = (): void => {
    this.keys.clear();
  };
  constructor() {
    window.addEventListener('keydown', this.key);
    window.addEventListener('keyup', this.key);
    window.addEventListener('blur', this.blur);
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
  }
}
